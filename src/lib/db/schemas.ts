import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const CurrencySchema = z.enum(['ARS', 'USD', 'UYU']);
export const MemberRoleSchema = z.enum(['owner', 'member']);
export const CategoryTypeSchema = z.enum(['Fijo', 'Variable']);
export const RuleMatchTypeSchema = z.enum(['exact', 'contains', 'regex']);
export const ImportStatusSchema = z.enum(['processing', 'success', 'partial', 'error', 'skipped']);

// ─── Household ───────────────────────────────────────────────────────────────

export const CreateHouseholdSchema = z.object({
  name: z.string().min(1).max(100),
  baseCurrency: CurrencySchema.default('ARS'),
});

// ─── Members ─────────────────────────────────────────────────────────────────

export const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: MemberRoleSchema.default('member'),
  displayName: z.string().min(1).max(100).optional(),
});

export const UpdateMemberSchema = z.object({
  role: MemberRoleSchema.optional(),
  isExcluded: z.boolean().optional(),
  exclusionReason: z.string().max(200).optional(),
  canUpload: z.boolean().optional(),
  canViewAll: z.boolean().optional(),
});

// ─── Card Registry ───────────────────────────────────────────────────────────

export const CreateCardMappingSchema = z.object({
  sourceId: z.string().min(1),
  lastFour: z.string().length(4).regex(/^\d{4}$/).optional(),
  memberId: z.string().min(1),
  isAdditional: z.boolean().default(false),
  isExcluded: z.boolean().default(false),
  excludeBeforeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

// ─── Transactions ────────────────────────────────────────────────────────────

export const CreateTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(500),
  amount: z.number(),
  currency: CurrencySchema,
  sourceId: z.string().min(1),
  memberId: z.string().min(1),
  categoryId: z.string().optional(),
  isExtraordinary: z.boolean().default(false),
  extraordinaryNote: z.string().max(500).optional(),
});

export const UpdateTransactionSchema = z.object({
  categoryId: z.string().optional(),
  isExtraordinary: z.boolean().optional(),
  extraordinaryNote: z.string().max(500).optional(),
  isExcluded: z.boolean().optional(),
  exclusionReason: z.string().max(200).optional(),
});

export const ListTransactionsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  categoryId: z.string().optional(),
  memberId: z.string().optional(),
  sourceId: z.string().optional(),
  currency: CurrencySchema.optional(),
  isExcluded: z.enum(['true', 'false']).optional(),
  isExtraordinary: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ─── Categories ──────────────────────────────────────────────────────────────

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  type: CategoryTypeSchema,
  parentId: z.string().optional(),
  icon: z.string().max(50).default('circle'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#95A5A6'),
  sortOrder: z.number().int().default(100),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: CategoryTypeSchema.optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().optional(),
});

// ─── Categorization Rules ────────────────────────────────────────────────────

export const CreateRuleSchema = z.object({
  pattern: z.string().min(1).max(500),
  matchType: RuleMatchTypeSchema,
  categoryId: z.string().min(1),
  priority: z.number().int().min(1).max(9999).default(100),
});

export const UpdateRuleSchema = z.object({
  pattern: z.string().min(1).max(500).optional(),
  matchType: RuleMatchTypeSchema.optional(),
  categoryId: z.string().optional(),
  priority: z.number().int().min(1).max(9999).optional(),
});

// ─── Exclusion Rules ─────────────────────────────────────────────────────────

export const CreateExclusionRuleSchema = z.object({
  pattern: z.string().min(1).max(500),
  matchType: RuleMatchTypeSchema,
  reason: z.string().min(1).max(200),
  isActive: z.boolean().default(true),
});

export const UpdateExclusionRuleSchema = z.object({
  pattern: z.string().min(1).max(500).optional(),
  matchType: RuleMatchTypeSchema.optional(),
  reason: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

// ─── Exchange Rates ──────────────────────────────────────────────────────────

export const SetExchangeRateSchema = z.object({
  currency: CurrencySchema,
  period: z.string().regex(/^\d{4}-\d{2}$/),
  rate: z.number().positive(),
  source: z.enum(['manual', 'api']).default('manual'),
});

// ─── Import ──────────────────────────────────────────────────────────────────

export const ImportUploadSchema = z.object({
  sourceId: z.string().min(1),
  memberId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

// ─── Accrual ─────────────────────────────────────────────────────────────────

export const CreateAccrualSchema = z.object({
  totalAmount: z.number().positive(),
  currency: CurrencySchema,
  months: z.number().int().min(2).max(60),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ─── Transfer Allocations ────────────────────────────────────────────────────

export const CreateAllocationsSchema = z.object({
  allocations: z.array(z.object({
    categoryId: z.string().min(1),
    amount: z.number().positive(),
    note: z.string().max(500).optional(),
  })).min(1),
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const DashboardQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  currency: CurrencySchema.default('ARS'),
  months: z.coerce.number().int().min(1).max(24).default(6),
});
