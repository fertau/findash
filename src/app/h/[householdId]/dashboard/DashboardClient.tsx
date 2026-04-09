'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowRightLeft, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Currency } from '@/lib/db/types';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
        <Upload className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Importa tu primer resumen
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          Subi un PDF o CSV de tu banco para ver tus finanzas aca.
        </p>
        <Button size="lg" render={<Link href={`/h/${householdId}/import`} />}>
          Importar resumen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: period nav + currency toggle */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(shiftPeriod(period, -1))}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">{formatPeriod(period)}</h1>
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(shiftPeriod(period, 1))}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex gap-1 bg-card rounded-md p-0.5 ring-1 ring-foreground/10">
          {CURRENCIES.map((c) => (
            <Button
              key={c}
              variant={c === currency ? 'default' : 'ghost'}
              size="xs"
              onClick={() => navigate(undefined, c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">Total gastos</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-1">
              {formatAmount(totals.expenses, currency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">Fijo / Variable</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-semibold text-foreground tabular-nums">
                {fixedVsVariable.fixed.percentage}%
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-lg font-semibold text-foreground tabular-nums">
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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">Transacciones</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-1">
              {totals.transactionCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Por categoria</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Tendencia mensual</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      {/* Category table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Detalle por categoria</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase">Categoria</TableHead>
                <TableHead className="text-xs uppercase">Tipo</TableHead>
                <TableHead className="text-right text-xs uppercase">Monto</TableHead>
                <TableHead className="text-right text-xs uppercase">%</TableHead>
                <TableHead className="text-right text-xs uppercase">#</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCategory.map((cat) => (
                <TableRow key={cat.categoryId}>
                  <TableCell className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-foreground">{cat.name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={cat.type === 'Fijo' ? 'secondary' : 'outline'}>
                      {cat.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">{formatAmount(cat.amount, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{cat.percentage}%</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{cat.transactionCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* By member */}
      {byMember.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Por miembro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byMember.map((m) => (
                <div key={m.memberId} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent-info/20 flex items-center justify-center text-accent-info text-xs font-medium">
                    {m.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">{m.name}</span>
                      <span className="tabular-nums text-foreground">{formatAmount(m.amount, currency)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full mt-1">
                      <div className="h-full bg-accent-info rounded-full" style={{ width: `${m.percentage}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{m.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
