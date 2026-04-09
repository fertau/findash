'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Camera, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Lock, ShoppingCart, Zap, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Currency } from '@/lib/db/types';
import type { MonthlySnapshot, BucketItem } from '@/lib/engine/monthly-snapshot';

const PERIOD_NAMES: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
};

function fmt(amount: number, currency: Currency): string {
  if (currency === 'ARS') return `ARS ${amount.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
  if (currency === 'UYU') return `UYU ${amount.toLocaleString('es-UY', { minimumFractionDigits: 0 })}`;
  return `USD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  let nm = m + delta, ny = y;
  while (nm <= 0) { nm += 12; ny--; }
  while (nm > 12) { nm -= 12; ny++; }
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function BucketSection({ title, icon: Icon, items, currency, color }: {
  title: string; icon: React.ElementType; items: BucketItem[]; currency: Currency; color: string;
}) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', color)} />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
        <span className={cn('text-sm font-semibold tabular-nums', color)}>{fmt(total, currency)}</span>
      </CardHeader>
      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <div key={item.categoryId} className="px-4 py-3 flex items-center justify-between hover:bg-muted transition-colors">
            <div>
              <p className="text-sm text-foreground">{item.categoryName}</p>
              <p className="text-xs text-muted-foreground">{item.classificationReason}</p>
            </div>
            <span className="text-sm tabular-nums text-foreground">{fmt(item.amount, currency)}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-4 py-6 text-center text-muted-foreground text-sm">Sin datos</div>
        )}
      </div>
    </Card>
  );
}

export default function SnapshotPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const householdId = params.householdId as string;

  const period = searchParams.get('period') || getCurrentPeriod();
  const currency = (searchParams.get('currency') as Currency) || 'USD';

  const [snapshot, setSnapshot] = useState<MonthlySnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  function navigate(newPeriod?: string, newCurrency?: string) {
    const p = new URLSearchParams();
    p.set('period', newPeriod || period);
    p.set('currency', newCurrency || currency);
    router.push(`/h/${householdId}/snapshot?${p}`);
  }

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/households/${householdId}/snapshot?period=${period}&currency=${currency}`);
      if (res.ok) setSnapshot(await res.json());
    } finally {
      setLoading(false);
    }
  }, [householdId, period, currency]);

  useEffect(() => { fetchSnapshot(); }, [fetchSnapshot]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-card rounded-lg animate-pulse w-64" />
        <div className="h-32 bg-card rounded-lg animate-pulse" />
        <div className="h-48 bg-card rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Camera className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Sin datos suficientes</h2>
        <p className="text-sm text-muted-foreground">Importá al menos 3 meses de resúmenes para ver tu panorama.</p>
      </div>
    );
  }

  const [, month] = period.split('-');

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(shiftPeriod(period, -1))}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">
            Panorama — {PERIOD_NAMES[month]} {period.split('-')[0]}
          </h1>
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(shiftPeriod(period, 1))}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground uppercase">Costo base</p>
            <p className="text-lg font-bold text-foreground tabular-nums mt-1">{fmt(snapshot.baseCost, currency)}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground uppercase">Variables</p>
            <p className="text-lg font-bold text-chart-3 tabular-nums mt-1">{fmt(snapshot.variableCost, currency)}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground uppercase">Extraordinarios</p>
            <p className="text-lg font-bold text-destructive tabular-nums mt-1">{fmt(snapshot.extraordinaryCost, currency)}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground uppercase">Total</p>
            <p className="text-lg font-bold text-foreground tabular-nums mt-1">{fmt(snapshot.totalCost, currency)}</p>
            {snapshot.deltaVsBase > 0 && (
              <p className="text-xs text-destructive mt-0.5">
                +{fmt(snapshot.deltaVsBase, currency)} sobre base
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend */}
      {snapshot.trend.baseCostChange !== 0 && (
        <Card>
          <CardContent className="flex items-center gap-3">
            {snapshot.trend.baseCostChange > 0
              ? <TrendingUp className="w-5 h-5 text-destructive" />
              : <TrendingDown className="w-5 h-5 text-chart-2" />
            }
            <p className="text-sm text-muted-foreground">
              Tu costo base {snapshot.trend.baseCostChange > 0 ? 'subió' : 'bajó'}{' '}
              <span className="font-medium text-foreground">{Math.abs(snapshot.trend.baseCostChange)}%</span>{' '}
              vs hace 6 meses
              {snapshot.trend.mainDrivers.length > 0 && (
                <> ({snapshot.trend.mainDrivers.join(', ')})</>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Buckets */}
      <BucketSection title="No negociables" icon={Lock} items={snapshot.nonNegotiables} currency={currency} color="text-primary" />
      <BucketSection title="Variables" icon={ShoppingCart} items={snapshot.variables} currency={currency} color="text-chart-3" />

      {snapshot.extraordinaries.length > 0 && (
        <BucketSection title="Extraordinarios" icon={Zap} items={snapshot.extraordinaries} currency={currency} color="text-destructive" />
      )}

      {snapshot.activeInstallments.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">Cuotas activas</CardTitle>
            </div>
            <span className="text-sm font-semibold tabular-nums text-primary">
              {fmt(snapshot.installmentCost, currency)}
            </span>
          </CardHeader>
          <div className="divide-y divide-border/50">
            {snapshot.activeInstallments.map((inst) => (
              <div key={inst.groupId} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">{inst.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Cuota {inst.current}/{inst.total} — finaliza {inst.estimatedEnd}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-foreground">{fmt(inst.currentAmount, currency)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
