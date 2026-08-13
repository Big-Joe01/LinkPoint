import { z } from 'zod';

export const emailSchema = z.string().email().max(254);
export const passwordSchema = z.string().min(8).max(128);
export const phoneSchema = z.string().min(7).max(20);

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(['CUSTOMER', 'REALTOR', 'PROPERTY_OWNER', 'INSPECTION_AGENT', 'AFFILIATE']),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const createPropertySchema = z.object({
  title: z.string().min(5).max(180),
  description: z.string().min(10).max(8000),
  propertyType: z.enum(['HOUSE', 'APARTMENT', 'LAND', 'COMMERCIAL', 'LUXURY']),
  purpose: z.enum(['SALE', 'RENT', 'LEASE', 'SHORT_LET']),
  price: z.number().positive().max(1_000_000_000_000),
  currency: z.string().length(3).default('NGN'),
  bedrooms: z.number().int().min(0).max(50).default(0),
  bathrooms: z.number().int().min(0).max(50).default(0),
  landSize: z.number().nonnegative().optional(),
  buildingSize: z.number().nonnegative().optional(),
  amenities: z.array(z.string().max(60)).max(50).default([]),
  media: z.array(z.string().url()).max(30).default([]),
  videos: z.array(z.string().url()).max(5).default([]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  exactAddress: z.string().min(3).max(300),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(120),
  country: z.string().min(1).max(120).default('Nigeria'),
  area: z.string().max(120).optional(),
  affiliateEnabled: z.boolean().default(false),
  affiliateCommissionPct: z.number().min(4).max(6).optional(),
});

export const searchPropertiesSchema = paginationSchema.extend({
  q: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  propertyType: z.enum(['HOUSE', 'APARTMENT', 'LAND', 'COMMERCIAL', 'LUXURY']).optional(),
  purpose: z.enum(['SALE', 'RENT', 'LEASE', 'SHORT_LET']).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
  verified: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
});

export const fundWalletSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().length(3).default('NGN'),
});

export const withdrawSchema = z.object({
  amount: z.number().positive(),
  bankAccountId: z.string().uuid(),
  pin: z.string().min(4).max(8),
});

export const bookInspectionSchema = z.object({
  propertyId: z.string().uuid(),
  preferredDate: z.string().datetime(),
  preferredTime: z.string().max(20),
  notes: z.string().max(2000).optional(),
});

export const createOfferSchema = z.object({
  propertyId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('NGN'),
  note: z.string().max(2000).optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(4000),
  type: z.enum(['TEXT', 'IMAGE', 'DOCUMENT', 'VOICE', 'SYSTEM']).default('TEXT'),
});

export const createAdSchema = z.object({
  propertyId: z.string().uuid(),
  objective: z.enum(['VIEWS', 'VISITS', 'INSPECTIONS', 'LEADS']),
  budget: z.number().positive(),
  durationDays: z.number().int().min(1).max(90),
  adType: z.enum(['VIDEO', 'IMAGE']).default('IMAGE'),
  mediaUrl: z.string().url(),
});

// Alias used by the ads route module.
export const createAdCampaignSchema = z.object({
  propertyId: z.string().uuid(),
  type: z.enum(['VIDEO', 'IMAGE']).default('IMAGE'),
  objective: z.enum(['VIEWS', 'VISITS', 'INSPECTIONS', 'LEADS']),
  budget: z.number().positive(),
  currency: z.string().length(3).default('NGN'),
  durationDays: z.number().int().min(1).max(90),
});

export const makeOfferSchema = z.object({
  propertyId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('NGN'),
  note: z.string().max(2000).optional(),
});

export const favoriteSchema = z.object({
  propertyId: z.string().uuid(),
});

export const affiliateSettingsSchema = z.object({
  enabled: z.boolean(),
  commissionPct: z.number().min(4).max(6).optional(),
});

export const adminUpdateSettingsSchema = z.object({
  linkpointCommissionPct: z.number().min(0).max(50).optional(),
  affiliateCommissionMinPct: z.number().min(0).max(10).optional(),
  affiliateCommissionMaxPct: z.number().min(0).max(10).optional(),
  inspectionAgentCommissionPct: z.number().min(0).max(100).optional(),
});
