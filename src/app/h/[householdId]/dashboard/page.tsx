import { getServerUser } from '@/lib/auth/server-session';
import { getTransactionsForDashboard, getTransactionsForPeriods } from '@/lib/db/transactions';
import { getCategories } from '@/lib/db/categories';
import { getMembers } from '@/lib/db/households';
import { getRatesForPeriod } from '@/lib/db/exchange-rates';
import { getHousehold } from '@/lib/db/households';
import { convertToBase } from '@/lib/currency';
import DashboardClient, { type DashboardData } from './DashboardClient';
import type { Currency } from '@/lib/db/types';

interface Props {
  params: Promise<{ householdId: string }>;
  searchParams: Promise<{ period?: string; currency?: string }>;
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function generatePeriods(current: string, count: number): string[] {
  const [year, month] = current.split('-').map(Number);
  const periods: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) { m += 12; y--; }
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return periods;
}

function shiftPeriodBack(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number);
  let nm = m - months;
  let ny = y;
  while (nm <= 0) { nm += 12; ny--; }
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default async function DashboardPage({ params, searchParams }: Props) {
  const { householdId } = await params;
  const sp = await searchParams;
  await getServerUser();

  let period = sp.period || getCurrentPeriod();
  const baseCurrency = (sp.currency as Currency) || 'ARS';

  const household = await getHousehold(householdId);

  // Load data in parallel
  let [transactions, categories, members, rates] = await Promise.all([
    getTransactionsForDashboard(householdId, period),
    getCategories(householdId),
    getMembers(householdId),
    getRatesForPeriod(householdId, period),
  ]);

  // If no transactions for current period and user didn't pick one explicitly,
  // fall back to the most recent period that has data (up to 12 months back)
  if (transactions.length === 0 && !sp.period) {
    for (let i = 1; i <= 24; i++) {
      const fallbackPeriod = shiftPeriodBack(period, i);
      const fallbackTxs = await getTransactionsForDashboard(householdId, fallbackPeriod);
      if (fallbackTxs.length > 0) {
        period = fallbackPeriod;
        transactions = fallbackTxs;
        rates = await getRatesForPeriod(householdId, period);
        break;
      }
    }
  }

  // Build lookups
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const memberMap = new Map(members.map((m) => [m.userId, m]));

  // Convert amounts
  const converted = transactions.map((tx) => {
    try { return convertToBase(tx.amount, tx.currency, rates, baseCurrency); }
    catch { return tx.amount; }
  });

  const totalExpenses = converted.reduce((s, a) => s + a, 0);

  // By category
  const byCatMap = new Map<string, { amount: number; count: number }>();
  transactions.forEach((tx, i) => {
    const e = byCatMap.get(tx.categoryId) || { amount: 0, count: 0 };
    e.amount += converted[i];
    e.count++;
    byCatMap.set(tx.categoryId, e);
  });

  const byCategory = Array.from(byCatMap.entries())
    .map(([id, d]) => {
      const cat = catMap.get(id);
      return {
        categoryId: id, name: cat?.name || 'Otro', type: (cat?.type || 'Variable') as 'Fijo' | 'Variable',
        color: cat?.color || '#95A5A6',
        amount: round2(d.amount), percentage: totalExpenses > 0 ? round2((d.amount / totalExpenses) * 100) : 0,
        transactionCount: d.count,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // By member
  const byMemMap = new Map<string, number>();
  transactions.forEach((tx, i) => {
    byMemMap.set(tx.memberId, (byMemMap.get(tx.memberId) || 0) + converted[i]);
  });
  const byMember = Array.from(byMemMap.entries())
    .map(([id, amount]) => ({
      memberId: id, name: memberMap.get(id)?.displayName || 'Otro',
      amount: round2(amount), percentage: totalExpenses > 0 ? round2((amount / totalExpenses) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Fixed vs variable
  let fixed = 0, variable = 0, extraordinary = 0;
  transactions.forEach((tx, i) => {
    const cat = catMap.get(tx.categoryId);
    if (tx.isExtraordinary) extraordinary += converted[i];
    else if (cat?.type === 'Fijo') fixed += converted[i];
    else variable += converted[i];
  });

  // Monthly trend (6 months)
  const trendPeriods = generatePeriods(period, 6);
  const trendTxs = await getTransactionsForPeriods(householdId, trendPeriods);
  const monthlyTrend = trendPeriods.map((p) => {
    const ptxs = trendTxs.filter((tx) => tx.period === p);
    let f = 0, v = 0, e = 0;
    for (const tx of ptxs) {
      let amt: number;
      try { amt = convertToBase(tx.amount, tx.currency, rates, baseCurrency); }
      catch { amt = tx.amount; }
      const cat = catMap.get(tx.categoryId);
      if (tx.isExtraordinary) e += amt;
      else if (cat?.type === 'Fijo') f += amt;
      else v += amt;
    }
    return { period: p, fixed: round2(f), variable: round2(v), extraordinary: round2(e), total: round2(f + v + e) };
  });

  const summary: DashboardData = {
    period,
    currency: baseCurrency,
    totals: { expenses: round2(totalExpenses), transactionCount: transactions.length },
    byCategory,
    byMember,
    fixedVsVariable: {
      fixed: { amount: round2(fixed), percentage: totalExpenses > 0 ? round2((fixed / totalExpenses) * 100) : 0 },
      variable: { amount: round2(variable), percentage: totalExpenses > 0 ? round2((variable / totalExpenses) * 100) : 0 },
      extraordinary: { amount: round2(extraordinary), percentage: totalExpenses > 0 ? round2((extraordinary / totalExpenses) * 100) : 0 },
    },
    monthlyTrend,
    excludedTotal: 0,
  };

  return (
    <DashboardClient
      summary={summary}
      householdId={householdId}
      householdName={household?.name || 'Mi Hogar'}
    />
  );
}
