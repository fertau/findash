// ─── Currency ────────────────────────────────────────────────────────────────

export type Currency = 'ARS' | 'USD' | 'UYU';

// ─── Household ───────────────────────────────────────────────────────────────

export interface Household {
  id: string;
  name: string;
  ownerId: string;
  settings: HouseholdSettings;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdSettings {
  baseCurrency: Currency;
  fiscalYearStart: number; // month 1-12
}

// ─── Members ─────────────────────────────────────────────────────────────────

export type MemberRole = 'owner' | 'member';

export interface HouseholdMember {
  userId: string;
  email: string;
  displayName: string;
  role: MemberRole;
  isExcluded: boolean;
  exclusionReason?: string;
  canUpload: boolean;
  canViewAll: boolean;
  joinedAt: string;
}

// ─── Card Registry ───────────────────────────────────────────────────────────

export interface CardMapping {
  id: string;
  sourceId: string;     // references BANK_SOURCES[].id
  lastFour?: string;
  memberId: string;     // userId of the cardholder
  isAdditional: boolean;
  isExcluded: boolean;
  excludeBeforeDate?: string; // ISO date — exclude transactions before this date
  notes?: string;
}

// ─── Transactions ────────────────────────────────────────────────────────────

export type CategoryMatchType = 'exact' | 'contains' | 'regex' | 'keyword' | 'manual' | 'ai' | 'uncategorized';

export interface Transaction {
  id: string;
  householdId: string;
  date: string;                   // ISO YYYY-MM-DD
  period: string;                 // YYYY-MM (for monthly grouping)
  description: string;            // original from bank
  normalizedDescription: string;  // uppercase, trimmed, no accents
  amount: number;
  currency: Currency;
  categoryId: string;
  categoryMatchType: CategoryMatchType;
  sourceId: string;               // references BANK_SOURCES[].id
  memberId: string;               // userId of attributed member
  isExcluded: boolean;
  exclusionReason?: string;
  isExtraordinary: boolean;
  extraordinaryNote?: string;
  installment?: InstallmentInfo;
  accrualGroupId?: string;
  importBatchId: string;
  hash: string;                   // SHA256 for dedup
  createdAt: string;
  updatedAt: string;
}

export interface InstallmentInfo {
  current: number;
  total: number;
  groupId: string;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  type: 'Fijo' | 'Variable';
  parentId?: string;
  icon: string;
  color: string;
  sortOrder: number;
  isSystem: boolean; // system categories can't be deleted
}

// ─── Categorization Rules ────────────────────────────────────────────────────

export type RuleMatchType = 'exact' | 'contains' | 'regex';

export interface CategorizationRule {
  id: string;
  pattern: string;
  matchType: RuleMatchType;
  categoryId: string;
  priority: number; // lower = higher priority
  createdBy: string;
  createdAt: string;
}

// ─── Exclusion Rules ─────────────────────────────────────────────────────────

export interface ExclusionRule {
  id: string;
  pattern: string;
  matchType: RuleMatchType;
  reason: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

// ─── Exchange Rates ──────────────────────────────────────────────────────────

export interface ExchangeRate {
  id: string;
  currency: Currency;
  period: string;         // YYYY-MM
  rate: number;           // 1 unit of currency = rate units of base currency
  source: 'manual' | 'api';
  updatedAt: string;
}

// ─── Import Sources (learned from detection) ────────────────────────────────

export interface ImportSource {
  id: string;
  /** Human-readable label, e.g. "Galicia - Tarjeta Visa" */
  label: string;
  /** Detected institution name, e.g. "Galicia" */
  institution: string;
  /** Document type, e.g. "Tarjeta de crédito", "Cuenta bancaria" */
  documentType: string;
  /** Parser key from AVAILABLE_PARSERS */
  parserKey: string;
  /** File format this source expects */
  fileFormat: 'pdf' | 'csv' | 'xls' | 'xlsx' | 'tsv';
  /** Currencies this source handles */
  currencies: Currency[];
  /** Number of times this source has been used (for sorting/confidence) */
  usageCount: number;
  /** Detection fingerprint hash — used to auto-match future imports */
  fingerprintHash?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Parser Templates (user-defined statement parsers) ──────────────────────

export type DateFormatKey = 'DD/MM/YY' | 'DD-MM-YY' | 'DD-Mmm-YY' | 'YY-Month-DD' | 'DD MM YY';

export interface ParserTemplate {
  id: string;
  householdId: string;
  /** Human-readable name, e.g. "HSBC – Cuenta Corriente" */
  label: string;
  institution: string;
  documentType: string;
  /** Regex patterns (as strings) for auto-detecting this document format */
  fingerprints: string[];
  /** Text or /regex/ that marks where transactions start in the document */
  sectionStart?: string;
  /** Text or /regex/ that marks where transactions end */
  sectionEnd?: string;
  /** How dates appear in transaction lines */
  dateFormat: DateFormatKey;
  /** Regex strings — lines matching any of these are skipped */
  skipPatterns: string[];
  /** Regex string for repeated page headers (multi-page docs) */
  pageHeaderPattern?: string;
  /** Whether amounts can have a trailing minus sign for credits (e.g. "1.234,56-") */
  hasTrailingMinus: boolean;
  /** Whether the last amount on a line is a running balance (should be ignored) */
  hasBalanceColumn: boolean;
  /** Primary currency for transactions */
  defaultCurrency: Currency;
  /** If the document has two amount columns (e.g. ARS + USD) */
  dualCurrency?: {
    secondaryCurrency: Currency;
    mode: 'column' | 'section';
    /** For section mode: patterns that switch the active currency */
    sectionPatterns?: { pattern: string; currency: Currency }[];
  };
  /** True for card statements where all charges should be negative */
  negateAmounts: boolean;
  /** Minimum leading spaces for a line to be treated as continuation of previous tx */
  continuationMinIndent?: number;
  /** Regex patterns to strip from descriptions (comprobante numbers, etc.) */
  descriptionCleanup?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ─── Import ──────────────────────────────────────────────────────────────────

export type ImportStatus = 'processing' | 'success' | 'partial' | 'error' | 'skipped';

export interface ImportBatch {
  id: string;
  fileName: string;
  fileHash: string;
  sourceId: string;
  period?: string;
  transactionCount: number;
  duplicatesSkipped: number;
  status: ImportStatus;
  notes?: string;
  importedBy: string;
  importedAt: string;
}

// ─── Installment Groups ─────────────────────────────────────────────────────

export interface InstallmentGroup {
  id: string;
  baseDescription: string;
  totalAmount: number;
  currency: Currency;
  installmentCount: number;
  categoryId?: string;
}

// ─── Accrual Rules ───────────────────────────────────────────────────────────

export interface AccrualRule {
  id: string;
  transactionId: string;
  totalAmount: number;
  currency: Currency;
  months: number;
  monthlyAmount: number;
  startDate: string;
  createdBy: string;
  createdAt: string;
}

// ─── Transfer Allocations (Member Spending) ──────────────────────────────────

export interface TransferAllocation {
  id: string;
  transferTransactionId: string;
  categoryId: string;
  amount: number;
  currency: Currency;
  note?: string;
  createdBy: string;
  createdAt: string;
}

// ─── User Profile ────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  householdIds: string[];
  createdAt: string;
}

// ─── Raw parsed transaction (from Python parser) ─────────────────────────────

export interface RawParsedTransaction {
  date: string;
  description: string;
  amount: number;
  currency: Currency;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardSummary {
  period: string;
  currency: Currency;
  totals: {
    expenses: number;
    transactionCount: number;
  };
  byCategory: Array<{
    categoryId: string;
    name: string;
    type: 'Fijo' | 'Variable';
    amount: number;
    percentage: number;
    transactionCount: number;
  }>;
  byMember: Array<{
    memberId: string;
    name: string;
    amount: number;
    percentage: number;
  }>;
  fixedVsVariable: {
    fixed: { amount: number; percentage: number };
    variable: { amount: number; percentage: number };
    extraordinary: { amount: number; percentage: number };
  };
  monthlyTrend: Array<{
    period: string;
    fixed: number;
    variable: number;
    extraordinary: number;
    total: number;
  }>;
  excludedTotal: number;
}
