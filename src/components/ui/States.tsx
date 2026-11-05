import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Copy,
  RefreshCw,
  X,
} from 'lucide-react';
import type { SortDirection } from '../../types/database';

export function TableSkeleton({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div
      role="status"
      aria-label="Loading records"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center gap-6">
        {Array.from({ length: columns }).map((_, idx) => (
          <div
            key={idx}
            className="h-3.5 bg-slate-200/80 rounded animate-pulse flex-1 max-w-[140px]"
          />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="px-4 py-3.5 flex items-center gap-6">
            {Array.from({ length: columns }).map((__, cIdx) => (
              <div
                key={cIdx}
                className="h-4 bg-slate-100 rounded animate-pulse flex-1"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load data',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="p-6 bg-red-50/70 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-red-900">{title}</h3>
        <p className="mt-1 text-sm text-red-800">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-14 px-6 bg-white border border-slate-200 rounded-xl text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
        {description}
      </p>
      {actionLabel && onAction && (
        <div className="mt-5">
          <button
            type="button"
            onClick={onAction}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export function GeneratedCodeBanner({
  label,
  code,
  subtitle,
  actionLabel,
  onAction,
  onDismiss,
}: {
  label: string;
  code: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be restricted in some iframe contexts
    }
  };

  return (
    <div
      role="status"
      className="p-4 bg-emerald-50/75 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
    >
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-medium text-emerald-950">{label}:</span>
          <span className="font-mono text-base font-semibold text-emerald-900 tabular-nums tracking-tight">
            {code}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy code ${code}`}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-800 bg-white border border-emerald-200 rounded-md hover:bg-emerald-100/60 transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
        </div>
        {subtitle && <p className="text-xs text-emerald-800">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center">
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 transition-colors whitespace-nowrap shrink-0"
          >
            {actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="p-1.5 text-emerald-700 hover:text-emerald-950 hover:bg-emerald-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function SortableHeader<K extends string>({
  label,
  field,
  activeField,
  direction,
  onSort,
  align = 'left',
}: {
  label: string;
  field: K;
  activeField: K;
  direction: SortDirection;
  onSort: (field: K) => void;
  align?: 'left' | 'right';
}) {
  const isActive = activeField === field;
  const ariaSort = isActive
    ? direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-3 text-xs font-semibold text-slate-600 select-none ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded ${
          align === 'right' ? 'ml-auto' : ''
        }`}
      >
        <span>{label}</span>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-blue-700" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-blue-700" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>
    </th>
  );
}
