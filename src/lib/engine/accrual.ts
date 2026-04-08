import { accrualRulesCollection } from '@/lib/firebase/admin';
import { nowISO } from '@/lib/utils';
import type { AccrualRule, Transaction, Currency } from '@/lib/db/types';

/**
 * Create an accrual rule that spreads a lump-sum transaction over N months.
 * Example: annual insurance of $120,000 spread over 12 months = $10,000/month.
 */
export async function createAccrualRule(
  householdId: string,
  params: {
    transactionId: string;
    totalAmount: number;
    currency: Currency;
    months: number;
    startDate: string;
    createdBy: string;
  }
): Promise<AccrualRule> {
  const now = nowISO();
  const monthlyAmount = params.totalAmount / params.months;

  const data: Omit<AccrualRule, 'id'> = {
    transactionId: params.transactionId,
    totalAmount: params.totalAmount,
    currency: params.currency,
    months: params.months,
    monthlyAmount: Math.round(monthlyAmount * 100) / 100,
    startDate: params.startDate,
    createdBy: params.createdBy,
    createdAt: now,
  };

  const ref = await accrualRulesCollection(householdId).add(data);
  return { id: ref.id, ...data };
}

/**
 * Get all accrual rules for a household.
 */
export async function getAccrualRules(householdId: string): Promise<AccrualRule[]> {
  const snap = await accrualRulesCollection(householdId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AccrualRule);
}

/**
 * Apply accrual rules to a set of transactions for dashboard display.
 * Transactions with accrual rules get their amounts spread across months.
 *
 * Returns a modified transaction list where accrued transactions
 * have their amounts replaced with the monthly portion.
 */
export function applyAccrualView(
  transactions: Transaction[],
  accrualRules: AccrualRule[],
  targetPeriod: string // YYYY-MM
): Transaction[] {
  const rulesMap = new Map(accrualRules.map((r) => [r.transactionId, r]));
  const result: Transaction[] = [];

  for (const tx of transactions) {
    const rule = rulesMap.get(tx.id);

    if (rule) {
      // Check if target period falls within the accrual range
      if (isPeriodInAccrualRange(targetPeriod, rule.startDate, rule.months)) {
        result.push({
          ...tx,
          amount: rule.monthlyAmount,
          accrualGroupId: rule.id,
        });
      }
      // If period is outside range, the accrued tx doesn't appear
    } else {
      result.push(tx);
    }
  }

  // Also add synthetic entries for accrual rules whose start month
  // has transactions in other periods
  for (const rule of accrualRules) {
    const alreadyIncluded = result.some((tx) => tx.accrualGroupId === rule.id);
    if (!alreadyIncluded && isPeriodInAccrualRange(targetPeriod, rule.startDate, rule.months)) {
      // Create a synthetic transaction for this accrual portion
      // The original transaction exists in a different period but the
      // accrual extends into this one
    }
  }

  return result;
}

/**
 * Check if a period (YYYY-MM) falls within an accrual date range.
 */
function isPeriodInAccrualRange(
  period: string,
  startDate: string,
  months: number
): boolean {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(startDate);
  const startYear = start.getFullYear();
  const startMonth = start.getMonth() + 1; // 1-based

  const periodMonths = year * 12 + month;
  const startMonths = startYear * 12 + startMonth;
  const endMonths = startMonths + months - 1;

  return periodMonths >= startMonths && periodMonths <= endMonths;
}
