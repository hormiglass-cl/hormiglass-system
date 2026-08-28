'use client';

import React, { useState } from 'react';
import { ChevronDown, MoreHorizontal, X } from 'lucide-react';

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const toneClasses: Record<Tone, string> = {
  default: 'bg-gray-100 text-gray-700 border-gray-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  accent: 'bg-orange-50 text-orange-700 border-orange-200',
};

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <section className="hg-panel px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-extrabold uppercase text-gray-500 mb-1">{eyebrow}</p>}
        <h1 className="text-lg font-extrabold tracking-normal text-[#213343] truncate">{title}</h1>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </section>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="hg-panel px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
      {children}
    </div>
  );
}

export function DataTable({
  columns,
  children,
}: {
  columns: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="hg-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="hg-table">
          <thead>{columns}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function RecordLayout({
  sidebar,
  children,
  aside,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      <aside className="xl:col-span-3">{sidebar}</aside>
      <main className={aside ? 'xl:col-span-6 min-w-0' : 'xl:col-span-9 min-w-0'}>{children}</main>
      {aside && <aside className="xl:col-span-3">{aside}</aside>}
    </div>
  );
}

export function PropertyPanel({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="hg-panel p-4">
      <h2 className="text-xs font-extrabold uppercase text-gray-500 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ActivityTimeline({ children }: { children: React.ReactNode }) {
  return <div className="hg-panel divide-y divide-gray-100">{children}</div>;
}

export function StatusBadge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-extrabold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: { id: string; label: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 text-xs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`px-3 py-2 border-b-2 font-extrabold transition ${
            active === item.id
              ? 'border-orange-500 text-orange-700'
              : 'border-transparent text-gray-500 hover:text-[#213343]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Drawer({
  open,
  title,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30">
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white border-l border-gray-200 shadow-sm flex flex-col">
        <header className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-gray-200 bg-gray-50">{footer}</footer>}
      </aside>
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35 flex items-center justify-center p-4">
      <section className="w-full max-w-lg bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <header className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-gray-200 bg-gray-50">{footer}</footer>}
      </section>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="hg-panel p-8 text-center">
      <p className="text-sm font-extrabold text-[#213343]">{title}</p>
      {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ActionMenu({
  label = 'Acciones',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
      >
        <MoreHorizontal className="w-4 h-4" />
        <span>{label}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {children}
        </div>
      )}
    </div>
  );
}
