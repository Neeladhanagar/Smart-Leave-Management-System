import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: 'default' | 'indigo' | 'emerald' | 'amber' | 'red';
}

export function StatCard({ label, value, sublabel, tone = 'default' }: StatCardProps) {
  const valueColor =
    tone === 'indigo'
      ? 'text-indigo-700'
      : tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
      ? 'text-amber-700'
      : tone === 'red'
      ? 'text-red-700'
      : 'text-slate-900';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-2">
      <div className="text-xs font-medium text-slate-500 tracking-wide">{label}</div>
      <div className={`text-2xl sm:text-3xl font-bold tabular-nums tracking-tight ${valueColor}`}>
        {value}
      </div>
      {sublabel && <div className="text-xs text-slate-500 truncate">{sublabel}</div>}
    </div>
  );
}
