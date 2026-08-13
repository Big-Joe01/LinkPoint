// Shared domain types for LinkPoint — single source of truth used by backend and mobile.

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  REALTOR = 'REALTOR',
  PROPERTY_OWNER = 'PROPERTY_OWNER',
  INSPECTION_AGENT = 'INSPECTION_AGENT',
  AFFILIATE = 'AFFILIATE',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  RESTRICTED = 'RESTRICTED',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
}

export enum VerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum PropertyPurpose {
  SALE = 'SALE',
  RENT = 'RENT',
  LEASE = 'LEASE',
  SHORT_LET = 'SHORT_LET',
}

export enum PropertyType {
  HOUSE = 'HOUSE',
  APARTMENT = 'APARTMENT',
  LAND = 'LAND',
  COMMERCIAL = 'COMMERCIAL',
  LUXURY = 'LUXURY',
}

export enum PropertyStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  UNDER_OFFER = 'UNDER_OFFER',
  SOLD = 'SOLD',
  RENTED = 'RENTED',
  ARCHIVED = 'ARCHIVED',
}

export enum WalletTxnType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  PAYMENT = 'PAYMENT',
  COMMISSION = 'COMMISSION',
  REFUND = 'REFUND',
  REVERSAL = 'REVERSAL',
  PAYOUT = 'PAYOUT',
}

export enum WalletTxnStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
  REFUNDED = 'REFUNDED',
}

export enum InspectionStatus {
  REQUESTED = 'REQUESTED',
  SEARCHING = 'SEARCHING',
  ASSIGNED = 'ASSIGNED',
  ACCEPTED = 'ACCEPTED',
  SCHEDULED = 'SCHEDULED',
  EN_ROUTE = 'EN_ROUTE',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum TransactionStatus {
  INITIATED = 'INITIATED',
  FUNDED = 'FUNDED',
  ACCEPTED_BY_BUYER = 'ACCEPTED_BY_BUYER',
  ACCEPTED_BY_SELLER = 'ACCEPTED_BY_SELLER',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DISPUTED = 'DISPUTED',
  REFUNDED = 'REFUNDED',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  PENDING = 'PENDING',
}

export enum AdStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
}

export enum ModerationState {
  WARNING = 'WARNING',
  RESTRICTED = 'RESTRICTED',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  nextCursor?: string;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

// Configurable business-rule defaults (admin can override via platform settings).
export const DEFAULT_BUSINESS_RULES = {
  linkpointCommissionPct: 10, // 10% of completed property transaction
  affiliateCommissionMinPct: 4,
  affiliateCommissionMaxPct: 6,
  inspectionAgentCommissionPct: 50, // 50% of inspection fee
} as const;
