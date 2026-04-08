import { getTransactionsForPeriods } from '@/lib/db/transactions';
import { getCategories } from '@/lib/db/categories';
import { getRatesForPeriod } from '@/lib/db/exchange-rates';
import { convertToBase } from '@/lib/currency';
import type { Transaction, Category, Currency, ExchangeRate } from '@/lib/db/types';

export interface BucketItem {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  monthlyAverage?: number;
  classificationReason: string;
}

export interface InstallmentSummary {
  groupId: string;
  description: string;
  currentAmount: number;
  current: number;
  total: number;
  estimatedEnd: string;
}

export interface MonthlySnapshot {
  period: string;
  currency: Currency;
  baseCost: number;
  variableCost: number;
  extraordinaryCost: number;
  installmentCost: number;
  totalCost: number;
  deltaVsBase: number;
  nonNegotiables: BucketItem[];
  variables: BucketItem[];
  extraordinaries: BucketItem[];
  activeInstallments: InstallmentSummary[];
  trend: {
    baseCost6MonthsAgo: number;
    baseCostChange: number;
    mainDrivers: string[];
  };
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function generateSnapshot(
  householdId: string,
  period: string,
  baseCurrency: Currency = 'USD'
): Promise<MonthlySnapshot> {
  // Load 6 months of data for historical analysis
  const periods = generatePeriods(period, 6);
  const [allTxs, categories, rates] = await Promise.all([
    getTransactionsForPeriods(householdId, periods),
    getCategories(householdId),
    getRatesForPeriod(householdId, period),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c]));

  // Convert all to base currency
  function convert(tx: Transaction): number {
    try { return convertToBase(tx.amount, tx.currency, rates, baseCurrency); }
    catch { return tx.amount; }
  }

  // Current period transactions
  const currentTxs = allTxs.filter((tx) => tx.period === period);

  // Aggregate by category across all 6 months
  const categoryMonthly = new Map<string, number[]>(); // categoryId → [amount per month]

  for (const p of periods) {
    const pTxs = allTxs.filter((tx) => tx.period === p && !tx.isExtraordinary && !tx.installment);
    const catTotals = new Map<string, number>();

    for (const tx of pTxs) {
      const amt = convert(tx);
      catTotals.set(tx.categoryId, (catTotals.get(tx.categoryId) || 0) + amt);
    }

    for (const cat of categories) {
      const existing = categoryMonthly.get(cat.id) || [];
      existing.push(catTotals.get(cat.id) || 0);
      categoryMonthly.set(cat.id, existing);
    }
  }

  // Classify categories
  const nonNegotiables: BucketItem[] = [];
  const variables: BucketItem[] = [];
  const extraordinaries: BucketItem[] = [];

  for (const [catId, monthlyAmounts] of categoryMonthly) {
    const cat = catMap.get(catId);
    if (!cat) continue;

    const nonZeroMonths = monthlyAmounts.filter((a) => a > 0);
    const avg = nonZeroMonths.length > 0
      ? nonZeroMonths.reduce((s, a) => s + a, 0) / nonZeroMonths.length
      : 0;

    const currentAmount = monthlyAmounts[monthlyAmounts.length - 1] || 0;
    if (currentAmount === 0) continue;

    const totalCurrent = currentTxs.filter((tx) => !tx.isExtraordinary && !tx.installment)
      .reduce((s, tx) => s + convert(tx), 0);

    // Non-negotiable: Fijo type + appears 3+ of last 6 months + variance < 30%
    const appearsFrequently = nonZeroMonths.length >= 3;
    const stdDev = nonZeroMonths.length > 1
      ? Math.sqrt(nonZeroMonths.reduce((s, a) => s + (a - avg) ** 2, 0) / nonZeroMonths.length)
      : 0;
    const varianceRatio = avg > 0 ? stdDev / avg : 0;

    if (cat.type === 'Fijo' && appearsFrequently && varianceRatio < 0.3) {
      nonNegotiables.push({
        categoryId: catId,
        categoryName: cat.name,
        amount: round2(currentAmount),
        monthlyAverage: round2(avg),
        percentage: totalCurrent > 0 ? round2((currentAmount / totalCurrent) * 100) : 0,
        classificationReason: `Tipo Fijo, aparece ${nonZeroMonths.length}/6 meses, variación ${(varianceRatio * 100).toFixed(0)}%`,
      });
    } else {
      variables.push({
        categoryId: catId,
        categoryName: cat.name,
        amount: round2(currentAmount),
        monthlyAverage: round2(avg),
        percentage: totalCurrent > 0 ? round2((currentAmount / totalCurrent) * 100) : 0,
        classificationReason: appearsFrequently
          ? `Variable, variación ${(varianceRatio * 100).toFixed(0)}%`
          : `Aparece solo ${nonZeroMonths.length}/6 meses`,
      });
    }
  }

  // Extraordinary transactions (marked manually or auto-detected)
  const extraTxs = currentTxs.filter((tx) => tx.isExtraordinary);
  const extraByCat = new Map<string, number>();
  for (const tx of extraTxs) {
    const amt = convert(tx);
    extraByCat.set(tx.categoryId, (extraByCat.get(tx.categoryId) || 0) + amt);
  }
  for (const [catId, amount] of extraByCat) {
    const cat = catMap.get(catId);
    extraordinaries.push({
      categoryId: catId,
      categoryName: cat?.name || 'Otro',
      amount: round2(amount),
      percentage: 0,
      classificationReason: 'Marcado como extraordinario',
    });
  }

  // Active installments
  const installmentTxs = currentTxs.filter((tx) => tx.installment);
  const installmentGroups = new Map<string, { txs: Transaction[]; desc: string }>();
  for (const tx of installmentTxs) {
    const gid = tx.installment!.groupId;
    const existing = installmentGroups.get(gid) || { txs: [], desc: tx.description };
    existing.txs.push(tx);
    installmentGroups.set(gid, existing);
  }

  const activeInstallments: InstallmentSummary[] = [];
  for (const [gid, { txs, desc }] of installmentGroups) {
    const tx = txs[0];
    const remaining = tx.installment!.total - tx.installment!.current;
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + remaining);

    activeInstallments.push({
      groupId: gid,
      description: desc.replace(/\d+\s*\/\s*\d+/, '').trim(),
      currentAmount: round2(convert(tx)),
      current: tx.installment!.current,
      total: tx.installment!.total,
      estimatedEnd: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`,
    });
  }

  // Calculate totals
  const baseCost = nonNegotiables.reduce((s, i) => s + i.amount, 0);
  const variableCost = variables.reduce((s, i) => s + i.amount, 0);
  const extraordinaryCost = extraordinaries.reduce((s, i) => s + i.amount, 0);
  const installmentCost = activeInstallments.reduce((s, i) => s + i.currentAmount, 0);
  const totalCost = baseCost + variableCost + extraordinaryCost + installmentCost;

  // Trend: compare base cost now vs 6 months ago
  const oldPeriod = periods[0];
  const oldNonNegTotal = nonNegotiables.reduce((s, item) => {
    const monthlyData = categoryMonthly.get(item.categoryId) || [];
    return s + (monthlyData[0] || 0);
  }, 0);
  const baseCostChange = oldNonNegTotal > 0
    ? round2(((baseCost - oldNonNegTotal) / oldNonNegTotal) * 100)
    : 0;

  // Main drivers of change
  const mainDrivers: string[] = [];
  for (const item of nonNegotiables) {
    const monthlyData = categoryMonthly.get(item.categoryId) || [];
    const oldAmount = monthlyData[0] || 0;
    if (oldAmount > 0) {
      const change = ((item.amount - oldAmount) / oldAmount) * 100;
      if (Math.abs(change) > 10) {
        mainDrivers.push(`${item.categoryName} ${change > 0 ? '+' : ''}${change.toFixed(0)}%`);
      }
    }
  }

  return {
    period,
    currency: baseCurrency,
    baseCost: round2(baseCost),
    variableCost: round2(variableCost),
    extraordinaryCost: round2(extraordinaryCost),
    installmentCost: round2(installmentCost),
    totalCost: round2(totalCost),
    deltaVsBase: round2(totalCost - baseCost),
    nonNegotiables: nonNegotiables.sort((a, b) => b.amount - a.amount),
    variables: variables.sort((a, b) => b.amount - a.amount),
    extraordinaries,
    activeInstallments,
    trend: {
      baseCost6MonthsAgo: round2(oldNonNegTotal),
      baseCostChange,
      mainDrivers: mainDrivers.slice(0, 5),
    },
  };
}
