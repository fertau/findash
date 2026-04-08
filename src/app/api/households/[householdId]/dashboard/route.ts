import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getTransactionsForDashboard, getTransactionsForPeriods } from '@/lib/db/transactions';
import { getCategories } from '@/lib/db/categories';
import { getMembers } from '@/lib/db/households';
import { getRatesForPeriod } from '@/lib/db/exchange-rates';
import { convertToBase } from '@/lib/currency';
import { DashboardQuerySchema } from '@/lib/db/schemas';
import type { Transaction, Category, DashboardSummary, Currency, ExchangeRate } from '@/lib/db/types';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * GET /api/households/[householdId]/dashboard
 *
 * Query params:
 * - period: YYYY-MM (default: current month)
 * - currency: ARS|USD|UYU (default: ARS)
 * - months: number of months for trend (default: 6)
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);

    const url = new URL(request.url);
    const query = DashboardQuerySchema.parse(Object.fromEntries(url.searchParams));

    const currentPeriod = query.period || getCurrentPeriod();
    const baseCurrency = query.currency;
    const trendMonths = query.months;

    // Load data in parallel
    const [transactions, categories, members, rates] = await Promise.all([
      getTransactionsForDashboard(householdId, currentPeriod),
      getCategories(householdId),
      getMembers(householdId),
      getRatesForPeriod(householdId, currentPeriod),
    ]);

    // Build category lookup
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const memberMap = new Map(members.map((m) => [m.userId, m]));

    // Convert all amounts to base currency
    const convertedAmounts = transactions.map((tx) => {
      try {
        return convertToBase(tx.amount, tx.currency, rates, baseCurrency);
      } catch {
        return tx.amount;
      }
    });

    // Totals
    const totalExpenses = convertedAmounts.reduce((sum, a) => sum + a, 0);

    // By Category
    const byCategoryMap = new Map<string, { amount: number; count: number }>();
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const amount = convertedAmounts[i];
      const existing = byCategoryMap.get(tx.categoryId) || { amount: 0, count: 0 };
      existing.amount += amount;
      existing.count++;
      byCategoryMap.set(tx.categoryId, existing);
    }

    const byCategory = Array.from(byCategoryMap.entries())
      .map(([catId, data]) => {
        const cat = catMap.get(catId);
        return {
          categoryId: catId,
          name: cat?.name || 'Unknown',
          type: (cat?.type || 'Variable') as 'Fijo' | 'Variable',
          amount: round2(data.amount),
          percentage: totalExpenses > 0 ? round2((data.amount / totalExpenses) * 100) : 0,
          transactionCount: data.count,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    // By Member
    const byMemberMap = new Map<string, number>();
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const amount = convertedAmounts[i];
      byMemberMap.set(tx.memberId, (byMemberMap.get(tx.memberId) || 0) + amount);
    }

    const byMember = Array.from(byMemberMap.entries())
      .map(([memberId, amount]) => {
        const member = memberMap.get(memberId);
        return {
          memberId,
          name: member?.displayName || 'Unknown',
          amount: round2(amount),
          percentage: totalExpenses > 0 ? round2((amount / totalExpenses) * 100) : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    // Fixed vs Variable
    let fixedTotal = 0;
    let variableTotal = 0;
    let extraordinaryTotal = 0;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const amount = convertedAmounts[i];
      const cat = catMap.get(tx.categoryId);

      if (tx.isExtraordinary) {
        extraordinaryTotal += amount;
      } else if (cat?.type === 'Fijo') {
        fixedTotal += amount;
      } else {
        variableTotal += amount;
      }
    }

    // Monthly trend
    const trendPeriods = generatePeriods(currentPeriod, trendMonths);
    const trendTransactions = await getTransactionsForPeriods(householdId, trendPeriods);
    const trendRates = rates; // Simplification: use current rates for trend

    const monthlyTrend = trendPeriods.map((period) => {
      const periodTxs = trendTransactions.filter((tx) => tx.period === period);
      let fixed = 0, variable = 0, extraordinary = 0;

      for (const tx of periodTxs) {
        let amount: number;
        try {
          amount = convertToBase(tx.amount, tx.currency, trendRates, baseCurrency);
        } catch {
          amount = tx.amount;
        }
        const cat = catMap.get(tx.categoryId);
        if (tx.isExtraordinary) {
          extraordinary += amount;
        } else if (cat?.type === 'Fijo') {
          fixed += amount;
        } else {
          variable += amount;
        }
      }

      return {
        period,
        fixed: round2(fixed),
        variable: round2(variable),
        extraordinary: round2(extraordinary),
        total: round2(fixed + variable + extraordinary),
      };
    });

    // Excluded total (separate query)
    const excludedSnap = await getExcludedTotal(householdId, currentPeriod, rates, baseCurrency);

    const summary: DashboardSummary = {
      period: currentPeriod,
      currency: baseCurrency,
      totals: {
        expenses: round2(totalExpenses),
        transactionCount: transactions.length,
      },
      byCategory,
      byMember,
      fixedVsVariable: {
        fixed: { amount: round2(fixedTotal), percentage: pct(fixedTotal, totalExpenses) },
        variable: { amount: round2(variableTotal), percentage: pct(variableTotal, totalExpenses) },
        extraordinary: { amount: round2(extraordinaryTotal), percentage: pct(extraordinaryTotal, totalExpenses) },
      },
      monthlyTrend,
      excludedTotal: excludedSnap,
    };

    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Dashboard error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function generatePeriods(currentPeriod: string, count: number): string[] {
  const [year, month] = currentPeriod.split('-').map(Number);
  const periods: string[] = [];

  for (let i = count - 1; i >= 0; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) {
      m += 12;
      y--;
    }
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
  }

  return periods;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(part: number, total: number): number {
  return total > 0 ? round2((part / total) * 100) : 0;
}

async function getExcludedTotal(
  householdId: string,
  period: string,
  rates: ExchangeRate[],
  baseCurrency: Currency
): Promise<number> {
  // Import here to avoid circular — this is a dashboard-specific query
  const { transactionsCollection } = await import('@/lib/firebase/admin');
  const snap = await transactionsCollection(householdId)
    .where('period', '==', period)
    .where('isExcluded', '==', true)
    .get();

  let total = 0;
  for (const doc of snap.docs) {
    const tx = doc.data() as Transaction;
    try {
      total += convertToBase(tx.amount, tx.currency, rates, baseCurrency);
    } catch {
      total += tx.amount;
    }
  }
  return round2(total);
}
