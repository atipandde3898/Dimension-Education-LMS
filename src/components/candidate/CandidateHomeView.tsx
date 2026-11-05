import { ArrowRight, CalendarClock, CheckCircle2, Clock } from 'lucide-react';
import type {
  CandidateDocument,
  CandidateOverview,
  InstallmentStatus,
} from '../../types/database';
import {
  computeOnboardingProgress,
  findNextDueInstallment,
  formatDate,
  formatInr,
} from '../../utils/domain';
import { InstallmentStateBadge } from '../ui/FeeWidgets';

interface CandidateHomeViewProps {
  overview: CandidateOverview;
  documents: CandidateDocument[];
  installments: InstallmentStatus[];
  onGoToOnboarding: () => void;
  onGoToFees: () => void;
}

export function CandidateHomeView({
  overview,
  documents,
  installments,
  onGoToOnboarding,
  onGoToFees,
}: CandidateHomeViewProps) {
  const progress = computeOnboardingProgress(documents);
  const pendingFees = Number(overview.pending ?? 0);
  const nextDue = findNextDueInstallment(installments);

  return (
    <div className="space-y-6">
      {/* Onboarding Status Banner */}
      {progress.isComplete ? (
        <div
          role="status"
          className="p-5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-emerald-950">
                Onboarding complete
              </h2>
              <p className="mt-0.5 text-xs text-emerald-800">
                All 3 verification documents have been approved by the institute
                administration.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGoToOnboarding}
            className="px-3.5 py-2 text-xs font-medium text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100/60 transition-colors self-start sm:self-center whitespace-nowrap shrink-0"
          >
            View Documents
          </button>
        </div>
      ) : (
        <div
          role="status"
          className="p-5 bg-amber-50/80 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950">
                Onboarding incomplete
              </h2>
              <p className="mt-0.5 text-xs text-amber-900">
                {progress.approvedCount} of {progress.totalCount} required
                documents approved. Upload your PAN card, photo ID, and signed
                enrollment form to complete onboarding.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGoToOnboarding}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors self-start sm:self-center whitespace-nowrap shrink-0"
          >
            <span>Go to Onboarding</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Candidate Overview Header & Cohort Assignment */}
      <section
        aria-labelledby="candidate-home-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-6"
      >
        <div className="pb-5 border-b border-slate-100">
          <p className="font-mono text-xs font-semibold text-blue-700 tabular-nums">
            {overview.candidate_code}
          </p>
          <h1
            id="candidate-home-heading"
            className="mt-1 text-2xl font-semibold text-slate-900 tracking-tight"
          >
            Welcome, {overview.full_name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Your enrolled program, module, batch assignment, and fee summary.
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Candidate Code</dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {overview.candidate_code}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-slate-500">Program</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {overview.program || '—'}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-slate-500">Module</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {overview.module || '—'}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-slate-500">Batch Code</dt>
            <dd className="mt-1 font-mono text-sm font-medium text-slate-900 tabular-nums">
              {overview.batch_code || 'Unassigned'}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-slate-500">Batch Mode</dt>
            <dd className="mt-1 font-medium text-slate-900 capitalize">
              {overview.batch_mode || '—'}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-slate-500">Counsellor</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {overview.counsellor || '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Next Due Card + Fee Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Small "Next due" Card */}
        <section
          aria-labelledby="candidate-next-due-heading"
          className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col justify-between gap-5"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-slate-500 shrink-0" />
                <h2
                  id="candidate-next-due-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  Next due
                </h2>
              </div>
              {nextDue && <InstallmentStateBadge state={nextDue.state} />}
            </div>

            {nextDue ? (
              <div className="pt-1 space-y-1">
                <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {formatInr(nextDue.amount)}
                </p>
                <p className="text-xs text-slate-600">
                  Installment #{nextDue.seq} · Due{' '}
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {formatDate(nextDue.due_date)}
                  </span>
                </p>
              </div>
            ) : installments.length > 0 ? (
              <p className="text-sm text-emerald-800 pt-1">
                All scheduled installments are paid.
              </p>
            ) : (
              <p className="text-sm text-slate-500 pt-1">
                No unpaid installments scheduled yet.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onGoToFees}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 transition-colors self-start whitespace-nowrap"
          >
            <span>Go to Fees</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </section>

        {/* Fee Summary */}
        <section
          aria-labelledby="candidate-fees-heading"
          className="lg:col-span-2 p-6 bg-white border border-slate-200 rounded-xl flex flex-col justify-between gap-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2
                id="candidate-fees-heading"
                className="text-base font-semibold text-slate-900"
              >
                Fee Summary
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Pending fees count only confirmed payments until verified by the
                institute.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToFees}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 transition-colors self-start whitespace-nowrap shrink-0"
            >
              <span>Manage Fees</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
            <div>
              <dt className="text-xs text-slate-500">Net Fee</dt>
              <dd className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {formatInr(overview.net_fee)}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500">Paid</dt>
              <dd className="mt-1.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
                {formatInr(overview.paid)}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500">Pending</dt>
              <dd
                className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
                  pendingFees > 0 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {formatInr(overview.pending)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
