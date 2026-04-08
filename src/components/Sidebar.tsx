'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowRightLeft, Upload, Settings, Camera, LogOut } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SidebarProps {
  householdId: string;
  householdName?: string;
  userName?: string;
}

const NAV_ITEMS = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'transactions', label: 'Transacciones', icon: ArrowRightLeft },
  { href: 'import', label: 'Importar', icon: Upload },
  { href: 'snapshot', label: 'Panorama', icon: Camera },
  { href: 'settings', label: 'Configuración', icon: Settings },
];

export default function Sidebar({ householdId, householdName, userName }: SidebarProps) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    window.location.href = '/login';
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 lg:w-64 md:w-16 bg-bg-surface border-r border-border h-screen sticky top-0 shrink-0">
        <div className="p-4 md:px-2 lg:px-4">
          <h2 className="text-lg font-semibold text-text-primary hidden lg:block">FinDash</h2>
          <h2 className="text-lg font-semibold text-text-primary lg:hidden text-center">F</h2>
        </div>

        <nav className="flex-1 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const href = `/h/${householdId}/${item.href}`;
            const isActive = pathname?.startsWith(href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors',
                  'md:justify-center lg:justify-start',
                  isActive
                    ? 'bg-bg-surface-hover text-text-primary border-l-2 border-accent-info'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 md:px-2 lg:px-4 border-t border-border space-y-2">
          {householdName && (
            <p className="text-xs text-text-muted truncate hidden lg:block">{householdName}</p>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-accent-info/20 flex items-center justify-center text-accent-info text-xs font-medium shrink-0">
              {userName?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-sm text-text-secondary truncate hidden lg:inline">{userName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-text-muted hover:text-accent-negative transition-colors md:justify-center lg:justify-start w-full"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden lg:inline">Salir</span>
          </button>
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-surface border-t border-border z-50">
        <div className="flex justify-around py-2">
          {NAV_ITEMS.slice(0, 4).map((item) => {
            const href = `/h/${householdId}/${item.href}`;
            const isActive = pathname?.startsWith(href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1 text-xs',
                  isActive ? 'text-accent-info' : 'text-text-muted'
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label.slice(0, 6)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
