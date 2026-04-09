'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2, Save } from 'lucide-react';
import { cn } from '@/lib/cn';
import ParserTemplatesTab from './parser-templates';

type Tab = 'categories' | 'rules' | 'exclusions' | 'rates' | 'members' | 'cards' | 'parsers';

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Categorías' },
  { id: 'rules', label: 'Reglas' },
  { id: 'exclusions', label: 'Exclusiones' },
  { id: 'rates', label: 'Tipo de cambio' },
  { id: 'members', label: 'Miembros' },
  { id: 'cards', label: 'Tarjetas' },
  { id: 'parsers', label: 'Parsers' },
];

export default function SettingsPage() {
  const params = useParams();
  const householdId = params.householdId as string;
  const [activeTab, setActiveTab] = useState<Tab>('categories');
  const [data, setData] = useState<Record<string, unknown[]>>({});
  const [loading, setLoading] = useState(false);

  const endpoints: Record<Tab, string> = {
    categories: `/api/households/${householdId}/categories`,
    rules: `/api/households/${householdId}/rules`,
    exclusions: `/api/households/${householdId}/exclusion-rules`,
    rates: `/api/households/${householdId}/exchange-rates`,
    members: `/api/households/${householdId}/members`,
    cards: `/api/households/${householdId}/cards`,
    parsers: `/api/households/${householdId}/parser-templates`,
  };

  const dataKeys: Record<Tab, string> = {
    categories: 'categories',
    rules: 'rules',
    exclusions: 'exclusionRules',
    rates: 'rates',
    members: 'members',
    cards: 'cards',
    parsers: 'parsers',
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoints[activeTab]);
      if (res.ok) {
        const json = await res.json();
        setData((prev) => ({ ...prev, [activeTab]: json[dataKeys[activeTab]] || [] }));
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, householdId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const items = (data[activeTab] || []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">Configuración</h1>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-accent-info text-accent-info'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Parsers tab — separate component */}
      {activeTab === 'parsers' && (
        <ParserTemplatesTab householdId={householdId} />
      )}

      {/* Content — other tabs */}
      {activeTab !== 'parsers' && (
      <div className="bg-bg-surface rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-text-muted">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            No hay {TABS.find((t) => t.id === activeTab)?.label.toLowerCase()} configurados
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-xs uppercase">
                {activeTab === 'categories' && (
                  <>
                    <th className="text-left p-3 font-medium">Nombre</th>
                    <th className="text-left p-3 font-medium">Tipo</th>
                    <th className="text-left p-3 font-medium">Color</th>
                  </>
                )}
                {activeTab === 'rules' && (
                  <>
                    <th className="text-left p-3 font-medium">Patrón</th>
                    <th className="text-left p-3 font-medium">Tipo</th>
                    <th className="text-left p-3 font-medium">Categoría</th>
                    <th className="text-right p-3 font-medium">Prioridad</th>
                  </>
                )}
                {activeTab === 'exclusions' && (
                  <>
                    <th className="text-left p-3 font-medium">Patrón</th>
                    <th className="text-left p-3 font-medium">Tipo</th>
                    <th className="text-left p-3 font-medium">Razón</th>
                    <th className="text-center p-3 font-medium">Activo</th>
                  </>
                )}
                {activeTab === 'rates' && (
                  <>
                    <th className="text-left p-3 font-medium">Moneda</th>
                    <th className="text-left p-3 font-medium">Período</th>
                    <th className="text-right p-3 font-medium">Tasa</th>
                    <th className="text-left p-3 font-medium">Fuente</th>
                  </>
                )}
                {activeTab === 'members' && (
                  <>
                    <th className="text-left p-3 font-medium">Nombre</th>
                    <th className="text-left p-3 font-medium">Email</th>
                    <th className="text-left p-3 font-medium">Rol</th>
                    <th className="text-center p-3 font-medium">Excluido</th>
                  </>
                )}
                {activeTab === 'cards' && (
                  <>
                    <th className="text-left p-3 font-medium">Origen</th>
                    <th className="text-left p-3 font-medium">Últimos 4</th>
                    <th className="text-left p-3 font-medium">Miembro</th>
                    <th className="text-center p-3 font-medium">Excluida</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-bg-surface-hover transition-colors">
                  {activeTab === 'categories' && (
                    <>
                      <td className="p-3 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: String(item.color || '#95A5A6') }} />
                        <span className="text-text-primary">{String(item.name)}</span>
                      </td>
                      <td className="p-3 text-text-secondary">{String(item.type)}</td>
                      <td className="p-3 text-text-muted text-xs">{String(item.color)}</td>
                    </>
                  )}
                  {activeTab === 'rules' && (
                    <>
                      <td className="p-3 text-text-primary font-mono text-xs">{String(item.pattern)}</td>
                      <td className="p-3 text-text-secondary">{String(item.matchType)}</td>
                      <td className="p-3 text-text-secondary">{String(item.categoryId)}</td>
                      <td className="p-3 text-right tabular-nums text-text-muted">{String(item.priority)}</td>
                    </>
                  )}
                  {activeTab === 'exclusions' && (
                    <>
                      <td className="p-3 text-text-primary font-mono text-xs">{String(item.pattern)}</td>
                      <td className="p-3 text-text-secondary">{String(item.matchType)}</td>
                      <td className="p-3 text-text-secondary">{String(item.reason)}</td>
                      <td className="p-3 text-center">{item.isActive ? '✓' : '✗'}</td>
                    </>
                  )}
                  {activeTab === 'rates' && (
                    <>
                      <td className="p-3 text-text-primary">{String(item.currency)}</td>
                      <td className="p-3 text-text-secondary">{String(item.period)}</td>
                      <td className="p-3 text-right tabular-nums text-text-primary">{String(item.rate)}</td>
                      <td className="p-3 text-text-muted">{String(item.source)}</td>
                    </>
                  )}
                  {activeTab === 'members' && (
                    <>
                      <td className="p-3 text-text-primary">{String(item.displayName)}</td>
                      <td className="p-3 text-text-secondary">{String(item.email)}</td>
                      <td className="p-3 text-text-secondary">{String(item.role)}</td>
                      <td className="p-3 text-center">{item.isExcluded ? '✓' : '—'}</td>
                    </>
                  )}
                  {activeTab === 'cards' && (
                    <>
                      <td className="p-3 text-text-primary">{String(item.sourceId)}</td>
                      <td className="p-3 text-text-secondary tabular-nums">{String(item.lastFour || '—')}</td>
                      <td className="p-3 text-text-secondary">{String(item.memberId)}</td>
                      <td className="p-3 text-center">{item.isExcluded ? '✓' : '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
}
