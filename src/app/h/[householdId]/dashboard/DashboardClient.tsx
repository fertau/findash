'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowRightLeft, Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Currency } from '@/lib/db/types';
import Link from 'next/link';

export interface CategoryWithColor {
  categoryId: string;
  name: string;
  type: 'Fijo' | 'Variable';
  color: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface DashboardData {
  period: string;
  currency: Currency;
  totals: { expenses: number; transactionCount: number };
  byCategory: CategoryWithColor[];
  byMember: Array<{ memberId: string; name: string; amount: number; percentage: number }>;
  fixedVsVariable: {
    fixed: { amount: number; percentage: number };
    variable: { amount: number; percentage: number };
    extraordinary: { amount: number; percentage: number };
  };
  monthlyTrend: Array<{ period: string; fixed: number; variable: number; extraordinary: number; total: number }>;
  excludedTotal: number;
}

interface Props {
  summary: DashboardData;
  householdId: string;
  householdName: string;
}

const CURRENCIES: Currency[] = ['ARS', 'USD', 'UYU'];

const PERIOD_NAMES: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
};

function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  return `${PERIOD_NAMES[month] || month} ${year}`;
}

function formatAmount(amount: number, currency: Currency): string {
  if (currency === 'ARS') {
    return `ARS ${amount.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (currency === 'UYU') {
    return `UYU ${amount.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `USD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  let nm = m + delta;
  let ny = y;
  while (nm <= 0) { nm += 12; ny--; }
  while (nm > 12) { nm -= 12; ny++; }
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export default function DashboardClient({ summary, householdId, householdName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { period, currency, totals, byCategory, byMember, fixedVsVariable, monthlyTrend } = summary;

  function navigate(newPeriod?: string, newCurrency?: string) {
    const params = new URLSearchParams();
    params.set('period', newPeriod || period);
    params.set('currency', newCurrency || currency);
    router.push(`/h/${householdId}/dashboard?${params.toString()}`);
  }

  const isEmpty = totals.transactionCount === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Upload className="w-12 h-12 text-text-muted mb-4" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Importá tu primer resumen
        </h2>
        <p className="text-sm text-text-secondary mb-6 max-w-md">
          Subí un PDF o CSV de tu banco para ver tus finanzas acá.
        </p>
        <Link
          href={`/h/${householdId}/import`}
          className="px-6 py-2.5 bg-accent-info hover:bg-accent-info/90 text-white rounded-md text-sm font-medium transition-colors"
        >
          Importar resumen
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: period nav + currency toggle */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(shiftPeriod(period, -1))} className="p-1.5 hover:bg-bg-surface-hover rounded-md transition-colors">
            <ChevronLeft className="w-5 h-5 text-text-secondary" />
          </button>
          <h1 className="text-xl font-semibold text-text-primary">{formatPeriod(period)}</h1>
          <button onClick={() => navigate(shiftPeriod(period, 1))} className="p-1.5 hover:bg-bg-surface-hover rounded-md transition-colors">
            <ChevronRight className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex gap-1 bg-bg-surface rounded-md p-0.5 border border-border">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => navigate(undefined, c)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium transition-colors',
                c === currency ? 'bg-accent-info text-white' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-bg-surface rounded-lg border border-border p-6">
          <p className="text-xs font-medium text-text-secondary uppercase">Total gastos</p>
          <p className="text-2xl font-bold text-text-primary tabular-nums mt-1">
            {formatAmount(totals.expenses, currency)}
          </p>
        </div>

        <div className="bg-bg-surface rounded-lg border border-border p-6">
          <p className="text-xs font-medium text-text-secondary uppercase">Fijo / Variable</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-semibold text-text-primary tabular-nums">
              {fixedVsVariable.fixed.percentage}%
            </span>
            <span className="text-text-muted">/</span>
            <span className="text-lg font-semibold text-text-primary tabular-nums">
              {fixedVsVariable.variable.percentage}%
            </span>
          </div>
          <div className="flex gap-1 mt-2 h-2 rounded-full overflow-hidden">
            <div className="bg-accent-info rounded-full" style={{ width: `${fixedVsVariable.fixed.percentage}%` }} />
            <div className="bg-accent-warning rounded-full" style={{ width: `${fixedVsVariable.variable.percentage}%` }} />
            {fixedVsVariable.extraordinary.percentage > 0 && (
              <div className="bg-accent-negative rounded-full" style={{ width: `${fixedVsVariable.extraordinary.percentage}%` }} />
            )}
          </div>
        </div>

        <div className="bg-bg-surface rounded-lg border border-border p-6">
          <p className="text-xs font-medium text-text-secondary uppercase">Transacciones</p>
          <p className="text-2xl font-bold text-text-primary tabular-nums mt-1">
            {totals.transactionCount}
          </p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category donut */}
        <div className="bg-bg-surface rounded-lg border border-border p-6">
          <h3 className="text-sm font-medium text-text-secondary uppercase mb-4">Por categoría</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byCategory.slice(0, 8)}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {byCategory.slice(0, 8).map((entry) => (
                    <Cell key={entry.categoryId} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatAmount(Number(value), currency)}
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly trend */}
        <div className="bg-bg-surface rounded-lg border border-border p-6">
          <h3 className="text-sm font-medium text-text-secondary uppercase mb-4">Tendencia mensual</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="period"
                  tickFormatter={(p: string) => PERIOD_NAMES[p.split('-')[1]]?.slice(0, 3) || p}
                  stroke="#64748B"
                  fontSize={12}
                />
                <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => formatAmount(Number(value), currency)}
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }}
                  labelFormatter={(label) => formatPeriod(String(label))}
                />
                <Line type="monotone" dataKey="fixed" stroke="#3B82F6" name="Fijo" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="variable" stroke="#F59E0B" name="Variable" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total" stroke="#F8FAFC" name="Total" strokeWidth={2} dot={{ r: 3 }} />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Category table */}
      <div className="bg-bg-surface rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-medium text-text-secondary uppercase">Detalle por categoría</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs uppercase">
              <th className="text-left p-3 font-medium">Categoría</th>
              <th className="text-left p-3 font-medium">Tipo</th>
              <th className="text-right p-3 font-medium">Monto</th>
              <th className="text-right p-3 font-medium">%</th>
              <th className="text-right p-3 font-medium">#</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map((cat) => (
              <tr key={cat.categoryId} className="border-b border-border/50 hover:bg-bg-surface-hover transition-colors">
                <td className="p-3 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-text-primary">{cat.name}</span>
                </td>
                <td className="p-3">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    cat.type === 'Fijo' ? 'bg-accent-info/10 text-accent-info' : 'bg-accent-warning/10 text-accent-warning'
                  )}>
                    {cat.type}
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums text-text-primary">{formatAmount(cat.amount, currency)}</td>
                <td className="p-3 text-right tabular-nums text-text-secondary">{cat.percentage}%</td>
                <td className="p-3 text-right tabular-nums text-text-muted">{cat.transactionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* By member */}
      {byMember.length > 1 && (
        <div className="bg-bg-surface rounded-lg border border-border p-6">
          <h3 className="text-sm font-medium text-text-secondary uppercase mb-4">Por miembro</h3>
          <div className="space-y-3">
            {byMember.map((m) => (
              <div key={m.memberId} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent-info/20 flex items-center justify-center text-accent-info text-xs font-medium">
                  {m.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-primary">{m.name}</span>
                    <span className="tabular-nums text-text-primary">{formatAmount(m.amount, currency)}</span>
                  </div>
                  <div className="h-1.5 bg-bg-primary rounded-full mt-1">
                    <div className="h-full bg-accent-info rounded-full" style={{ width: `${m.percentage}%` }} />
                  </div>
                </div>
                <span className="text-xs text-text-muted tabular-nums w-10 text-right">{m.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
