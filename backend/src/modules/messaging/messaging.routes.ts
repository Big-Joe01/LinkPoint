import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, parseOr400, unauthorized } from '../../lib/errors';
import { sendMessageSchema } from '@linkpoint/validation';
import { filterMessage } from '@linkpoint/shared';
import { ModerationState } from '../../../prisma/generated/client';
import { audit } from '../../lib/audit';
import { z } from 'zod';

const BLOCKED_PLACEHOLDER = 'For your security, sharing external contact information is not permitted.';

async function listConversations(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const userId = req.user.id;
  const participations = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          participants: { include: { user: { select: { id: true, name: true, profileImage: true } } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
  });
  return { items: participations.map((p) => p.conversation) };
}

async function sendMessage(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const userId = req.user.id;
  const input = parseOr400(sendMessageSchema, req.body);

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: input.conversationId, userId } },
  });
  if (!participant) throw forbidden('Not a participant in this conversation');

  // SERVER-SIDE anti-bypass filtering — never rely on frontend filtering alone.
  const result = filterMessage(input.content);

  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      senderId: userId,
      body: result.blocked ? BLOCKED_PLACEHOLDER : input.content,
      filteredBody: result.blocked ? result.redacted : null,
      blocked: result.blocked,
      blockReasons: result.reasons as never,
      type: result.blocked ? 'SYSTEM' : (input.type ?? 'TEXT'),
      status: result.blocked ? 'BLOCKED' : 'SENT',
    },
  });

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  });

  // Flag suspicious bypass attempts for admin review.
  if (result.blocked) {
    await prisma.moderationEvent.create({
      data: {
        userId,
        type: 'BLOCKED_MESSAGE',
        severity: 'MEDIUM',
        state: ModerationState.WARNING,
        description: result.reasons.join(', '),
        metadata: { conversationId: input.conversationId, messageId: message.id } as never,
      },
    });
    await audit('MESSAGE_FLAGGED', { userId, req, resource: 'Message', resourceId: message.id, metadata: { reasons: result.reasons } });
  }

  return {
    id: message.id,
    blocked: message.blocked,
    blockReasons: message.blockReasons,
    body: message.body,
  };
}

async function listMessages(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const userId = req.user.id;
  const { conversationId } = req.params as { conversationId: string };
  const { page = 1, pageSize = 50 } = (req.query as { page?: number; pageSize?: number }) ?? {};
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) throw forbidden('Not a participant');

  const [items, total] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      include: { sender: { select: { id: true, name: true, profileImage: true } } },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.message.count({ where: { conversationId } }),
  ]);
  return { items, total, page, pageSize, hasNext: page * pageSize < total };
}

const startConversationSchema = z.object({
  recipientId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
  content: z.string().min(1).max(4000),
  type: z.enum(['TEXT', 'SYSTEM']).optional(),
});

async function startConversation(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const userId = req.user.id;
  const input = startConversationSchema.parse(req.body);

  const type = input.propertyId ? 'PROPERTY' : input.inspectionId ? 'INSPECTION' : 'DIRECT';
  const conversation = await prisma.conversation.create({
    data: {
      type: type as never,
      propertyId: input.propertyId,
      inspectionId: input.inspectionId,
      participants: {
        create: [{ userId }, { userId: input.recipientId }],
      },
    },
  });
  // send the first message (with filtering)
  const result = filterMessage(input.content);
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: userId,
      body: result.blocked ? BLOCKED_PLACEHOLDER : input.content,
      filteredBody: result.blocked ? result.redacted : null,
      blocked: result.blocked,
      blockReasons: result.reasons as never,
      type: result.blocked ? 'SYSTEM' : (input.type ?? 'TEXT'),
      status: result.blocked ? 'BLOCKED' : 'SENT',
    },
  });
  return { conversationId: conversation.id };
}

export function registerMessagingRoutes(app: FastifyInstance, prefix: string): void {
  app.get(`${prefix}/messages/conversations`, { preHandler: app.authenticate, handler: listConversations as never });
  app.post(`${prefix}/messages/conversations`, { preHandler: app.authenticate, handler: startConversation as never });
  app.get(`${prefix}/messages/conversations/:conversationId`, { preHandler: app.authenticate, handler: listMessages as never });
  app.post(`${prefix}/messages`, { preHandler: app.authenticate, handler: sendMessage as never });
}
