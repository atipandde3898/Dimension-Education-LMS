import { ArrowRight, RefreshCw } from 'lucide-react';
import {
  formatAmount,
  formatInr,
  type CounsellorPortfolioMetrics,
} from '../../utils/domain';
import { EmptyState, ErrorState } from '../ui/States';

interface CounsellorHomeViewProps {
  counsellorName: string;
  metrics: CounsellorPortfolioMetrics;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenCandidates: (options?: { overdueOnly?: boolean }) => void;
}

export function CounsellorHomeView({
  counsellorName,
  metrics,
  loading,
  error,
  onRefresh,
  onOpenCandidates,
}: CounsellorHomeViewProps) {
  if (loading) {
    return (
      <div
        className="space-y-6"
        role="status"
        aria-label="Loading counsellor overview"
      >
        <div className="space-y-2">
          <div className="h-6 w-52 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="p-6 bg-white border border-slate-200 rounded-xl space-y-3"
            >
              <div className="h-3.5 w-28 bg-slate-100 rounded animate-pulse" />
              <div className="h-8 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-36 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load counsellor summary"
        message={error}
        onRetry={onRefresh}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Welcome, {counsellorName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Read-only overview of your assigned candidates, fee balances,
            overdue installments, and placement handovers.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh summary
        </button>
      </div>

      <section
        aria-label="Counsellor portfolio summary"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">Total Candidates</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {formatAmount(metrics.totalCandidates)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Assigned to your mentoring portfolio
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">
            Total Pending Fees
          </p>
          <p
            className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${
              metrics.totalPendingFees > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {formatInr(metrics.totalPendingFees)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Remaining balance across your candidates
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">
            Overdue Installments
          </p>
          <p
            className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${
              metrics.overdueInstallmentsCount > 0
                ? 'text-red-700'
                : 'text-slate-900'
            }`}
          >
            {formatAmount(metrics.overdueInstallmentsCount)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {metrics.overdueInstallmentsCount > 0
              ? 'Past due date and awaiting payment'
              : 'No overdue installments'}
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500">Handed Over</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-blue-700 tabular-nums">
            {formatAmount(metrics.handedOverCount)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Transitioned to placement support
          </p>
        </div>
      </section>

      {metrics.totalCandidates === 0 ? (
        <EmptyState
          title="No candidates assigned to you yet"
          description="When an administrator assigns candidates to your counsellor profile, their progress, fee schedule, and placement handover status will appear here."
        />
      ) : (
        <section
          aria-label="Quick navigation"
          className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Candidate Directory
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Browse your assigned candidates, filter by training status or
              overdue installments, and inspect read-only onboarding and payment
              records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {metrics.overdueInstallmentsCount > 0 && (
              <button
                type="button"
                onClick={() => onOpenCandidates({ overdueOnly: true })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100/70 transition-colors whitespace-nowrap"
              >
                <span>Filter overdue candidates</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenCandidates({ overdueOnly: false })}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap"
            >
              <span>Open My Candidates</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
