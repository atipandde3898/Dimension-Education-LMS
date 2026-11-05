import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { DashboardStats } from '../../types/database';
import {
  formatAmount,
  formatDbError,
  formatInr,
  normalizeDashboardStats,
} from '../../utils/domain';
import type { AdminSection } from '../AdminLayout';
import { ErrorState } from '../ui/States';

interface DashboardViewProps {
  onNavigate: (section: AdminSection) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('v_dashboard')
      .select(
        'total_candidates, onboarding, active, total_pending_fees, overdue_installments, handed_over',
      )
      .maybeSingle();

    if (queryError) {
      setError(formatDbError(queryError));
      setLoading(false);
      return;
    }

    setStats(normalizeDashboardStats(data));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading dashboard">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="p-6 bg-white border border-slate-200 rounded-xl space-y-3"
            >
              <div className="h-3.5 w-32 bg-slate-100 rounded animate-pulse" />
              <div className="h-8 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-40 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load dashboard metrics"
        message={error}
        onRetry={loadStats}
      />
    );
  }

  const metrics = stats ?? normalizeDashboardStats(null);
  const isEmptyInstitute =
    metrics.total_candidates === 0 &&
    metrics.onboarding === 0 &&
    metrics.active === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Institute Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live candidate enrollment, fee collection, and placement handover
            summary.
          </p>
        </div>

        <button
          type="button"
          onClick={loadStats}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh metrics
        </button>
      </div>

      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">Total Candidates</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {formatAmount(metrics.total_candidates)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            All registered candidate records
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">Onboarding</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-amber-700 tabular-nums">
            {formatAmount(metrics.onboarding)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Awaiting batch start or onboarding completion
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">Active in Training</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-emerald-700 tabular-nums">
            {formatAmount(metrics.active)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Currently attending active batches
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">
            Total Pending Fees
          </p>
          <p
            className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${
              metrics.total_pending_fees > 0
                ? 'text-amber-700'
                : 'text-slate-900'
            }`}
          >
            {formatInr(metrics.total_pending_fees)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Uncollected fee balance across candidates
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">
            Overdue Installments
          </p>
          <p
            className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${
              metrics.overdue_installments > 0
                ? 'text-red-700'
                : 'text-slate-900'
            }`}
          >
            {formatAmount(metrics.overdue_installments)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {metrics.overdue_installments > 0
              ? 'Requires immediate follow-up'
              : 'No overdue installments'}
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">
            Handed Over to Placement
          </p>
          <p className="mt-2 font-mono text-3xl font-semibold text-blue-700 tabular-nums">
            {formatAmount(metrics.handed_over)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Transitioned to placement team
          </p>
        </div>
      </section>

      {isEmptyInstitute && (
        <div className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              No candidates enrolled yet
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Start by configuring your Programs &amp; Modules, scheduling a
              Batch, and registering your first Candidate.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('catalog')}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Configure Catalog
            </button>
            <button
              type="button"
              onClick={() => onNavigate('candidates')}
              className="px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap"
            >
              Add Candidate
            </button>
          </div>
        </div>
      )}

      <section
        aria-label="Quick workspace actions"
        className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-6 text-sm"
      >
        <button
          type="button"
          onClick={() => onNavigate('candidates')}
          className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:text-blue-900 transition-colors whitespace-nowrap"
        >
          <span>View all candidates</span>
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('batches')}
          className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap"
        >
          <span>Manage batches &amp; SMEs</span>
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('staff')}
          className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap"
        >
          <span>Directory &amp; staff roles</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  );
}
