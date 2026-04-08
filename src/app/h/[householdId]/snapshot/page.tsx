'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Camera, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Lock, ShoppingCart, Zap, CreditCard } from 'lucide-react';
import { cn } from '@/lib/cn';
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
    <div className="bg-bg-surface rounded-lg border border-border overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', color)} />
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        </div>
        <span className={cn('text-sm font-semibold tabular-nums', color)}>{fmt(total, currency)}</span>
      </div>
      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <div key={item.categoryId} className="px-4 py-3 flex items-center justify-between hover:bg-bg-surface-hover transition-colors">
            <div>
              <p className="text-sm text-text-primary">{item.categoryName}</p>
              <p className="text-xs text-text-muted">{item.classificationReason}</p>
            </div>
            <span className="text-sm tabular-nums text-text-primary">{fmt(item.amount, currency)}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-4 py-6 text-center text-text-muted text-sm">Sin datos</div>
        )}
      </div>
    </div>
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
        <div className="h-8 bg-bg-surface rounded animate-pulse w-64" />
        <div className="h-32 bg-bg-surface rounded animate-pulse" />
        <div className="h-48 bg-bg-surface rounded animate-pulse" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Camera className="w-12 h-12 text-text-muted mb-4" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">Sin datos suficientes</h2>
        <p className="text-sm text-text-secondary">Importá al menos 3 meses de resúmenes para ver tu panorama.</p>
      </div>
    );
  }

  const [, month] = period.split('-');

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(shiftPeriod(period, -1))} className="p-1.5 hover:bg-bg-surface-hover rounded-md">
            <ChevronLeft className="w-5 h-5 text-text-secondary" />
          </button>
          <h1 className="text-xl font-semibold text-text-primary">
            Panorama — {PERIOD_NAMES[month]} {period.split('-')[0]}
          </h1>
          <button onClick={() => navigate(shiftPeriod(period, 1))} className="p-1.5 hover:bg-bg-surface-hover rounded-md">
            <ChevronRight className="w-5 h-5 text-text-secondary" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-bg-surface rounded-lg border border-border p-4">
          <p className="text-xs text-text-muted uppercase">Costo base</p>
          <p className="text-lg font-bold text-text-primary tabular-nums">{fmt(snapshot.baseCost, currency)}</p>
        </div>
        <div className="bg-bg-surface rounded-lg border border-border p-4">
          <p className="text-xs text-text-muted uppercase">Variables</p>
          <p className="text-lg font-bold text-accent-warning tabular-nums">{fmt(snapshot.variableCost, currency)}</p>
        </div>
        <div className="bg-bg-surface rounded-lg border border-border p-4">
          <p className="text-xs text-text-muted uppercase">Extraordinarios</p>
          <p className="text-lg font-bold text-accent-negative tabular-nums">{fmt(snapshot.extraordinaryCost, currency)}</p>
        </div>
        <div className="bg-bg-surface rounded-lg border border-border p-4">
          <p className="text-xs text-text-muted uppercase">Total</p>
          <p className="text-lg font-bold text-text-primary tabular-nums">{fmt(snapshot.totalCost, currency)}</p>
          {snapshot.deltaVsBase > 0 && (
            <p className="text-xs text-accent-negative mt-0.5">
              +{fmt(snapshot.deltaVsBase, currency)} sobre base
            </p>
          )}
        </div>
      </div>

      {/* Trend */}
      {snapshot.trend.baseCostChange !== 0 && (
        <div className="bg-bg-surface rounded-lg border border-border p-4 flex items-center gap-3">
          {snapshot.trend.baseCostChange > 0
            ? <TrendingUp className="w-5 h-5 text-accent-negative" />
            : <TrendingDown className="w-5 h-5 text-accent-positive" />
          }
          <p className="text-sm text-text-secondary">
            Tu costo base {snapshot.trend.baseCostChange > 0 ? 'subió' : 'bajó'}{' '}
            <span className="font-medium text-text-primary">{Math.abs(snapshot.trend.baseCostChange)}%</span>{' '}
            vs hace 6 meses
            {snapshot.trend.mainDrivers.length > 0 && (
              <> ({snapshot.trend.mainDrivers.join(', ')})</>
            )}
          </p>
        </div>
      )}

      {/* Buckets */}
      <BucketSection title="No negociables" icon={Lock} items={snapshot.nonNegotiables} currency={currency} color="text-accent-info" />
      <BucketSection title="Variables" icon={ShoppingCart} items={snapshot.variables} currency={currency} color="text-accent-warning" />

      {snapshot.extraordinaries.length > 0 && (
        <BucketSection title="Extraordinarios" icon={Zap} items={snapshot.extraordinaries} currency={currency} color="text-accent-negative" />
      )}

      {snapshot.activeInstallments.length > 0 && (
        <div className="bg-bg-surface rounded-lg border border-border overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-accent-info" />
              <h3 className="text-sm font-medium text-text-primary">Cuotas activas</h3>
            </div>
            <span className="text-sm font-semibold tabular-nums text-accent-info">
              {fmt(snapshot.installmentCost, currency)}
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {snapshot.activeInstallments.map((inst) => (
              <div key={inst.groupId} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary">{inst.description}</p>
                  <p className="text-xs text-text-muted">
                    Cuota {inst.current}/{inst.total} — finaliza {inst.estimatedEnd}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-text-primary">{fmt(inst.currentAmount, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
