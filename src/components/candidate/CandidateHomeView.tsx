import { ArrowRight, CalendarClock, CheckCircle2, Clock } from 'lucide-react';
import type {
  CandidateDocument,
  CandidateOverview,
  InstallmentStatus,
  OnboardingStatus,
  Payment,
} from '../../types/database';
import {
  computeOnboardingProgress,
  findNextDueInstallment,
  formatDate,
  formatInr,
  getInstallmentDueRelativeText,
} from '../../utils/domain';
import { InstallmentStateBadge } from '../ui/FeeWidgets';

interface CandidateHomeViewProps {
  overview: CandidateOverview;
  documents: CandidateDocument[];
  installments: InstallmentStatus[];
  payments?: Payment[];
  onboardingStatus?: OnboardingStatus | null;
  onGoToOnboarding: () => void;
  onGoToFees: () => void;
}

export function CandidateHomeView({
  overview,
  documents,
  installments,
  payments = [],
  onboardingStatus,
  onGoToOnboarding,
  onGoToFees,
}: CandidateHomeViewProps) {
  const pendingFees = Number(overview.pending ?? 0);
  const unpaidInstallments = installments.filter((i) => i.state !== 'paid');
  const allPaid = installments.length > 0 && unpaidInstallments.length === 0;
  const allUnpaidSubmitted =
    unpaidInstallments.length > 0 &&
    unpaidInstallments.every((i) => i.state === 'submitted');
  const nextDue = findNextDueInstallment(installments);
  const pendingPaymentsCount = payments.filter(
    (p) => p.status === 'pending',
  ).length;

  const docMap = new Map<string, CandidateDocument>();
  for (const d of documents) {
    docMap.set(d.doc_type, d);
  }

  const getDocStatus = (docType: string): string => {
    const doc = docMap.get(docType);
    if (doc?.status === 'approved') return 'Approved';
    if (doc?.status === 'pending') return 'Pending';
    if (doc?.status === 'rejected') return 'Rejected';
    if (docType === 'profile_photo' && onboardingStatus?.photo_status) {
      const ps = String(onboardingStatus.photo_status).toLowerCase();
      if (ps === 'approved') return 'Approved';
      if (ps === 'pending') return 'Pending';
      if (ps === 'rejected') return 'Rejected';
    }
    return 'Missing';
  };

  const photoStatus = getDocStatus('profile_photo');
  const panStatus = getDocStatus('pan');
  const photoIdStatus = getDocStatus('photo_id');
  const enrollmentStatus = getDocStatus('enrollment_form');

  const consentsAccepted = Number(onboardingStatus?.consents_accepted ?? 0);
  const consentsRequired = Number(onboardingStatus?.consents_required ?? 0);
  const consentAccepted =
    consentsRequired > 0 && consentsAccepted >= consentsRequired;
  const consentStatus = consentAccepted ? 'Accepted' : 'Pending';

  const isOnboardingComplete = Boolean(onboardingStatus?.onboarding_complete);

  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'Approved':
      case 'Accepted':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Pending':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Rejected':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Onboarding Status Checklist Card */}
      <section
        role="status"
        aria-label="Onboarding verification checklist"
        className={`p-6 border rounded-xl space-y-4 shadow-xs ${
          isOnboardingComplete
            ? 'bg-emerald-50/70 border-emerald-200'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            {isOnboardingComplete ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <h2
                className={`text-base font-semibold ${
                  isOnboardingComplete
                    ? 'text-emerald-950 font-bold'
                    : 'text-slate-900'
                }`}
              >
                {isOnboardingComplete
                  ? 'Onboarding complete'
                  : 'Onboarding incomplete'}
              </h2>
              <p
                className={`mt-0.5 text-xs ${
                  isOnboardingComplete
                    ? 'text-emerald-800'
                    : 'text-slate-500'
                }`}
              >
                {isOnboardingComplete
                  ? 'All 4 required documents and institutional consent have been completed and approved.'
                  : 'Please complete all required documents and consent agreements to finish onboarding.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGoToOnboarding}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors self-start sm:self-center whitespace-nowrap shrink-0 shadow-xs ${
              isOnboardingComplete
                ? 'text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100/60'
                : 'text-white bg-blue-700 hover:bg-blue-800'
            }`}
          >
            <span>{isOnboardingComplete ? 'Review Documents' : 'Complete Onboarding'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 5-item Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
          <div className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-lg flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">Profile photo</span>
            <span
              className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md whitespace-nowrap ${getBadgeStyle(
                photoStatus,
              )}`}
            >
              {photoStatus}
            </span>
          </div>

          <div className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-lg flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">PAN card</span>
            <span
              className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md whitespace-nowrap ${getBadgeStyle(
                panStatus,
              )}`}
            >
              {panStatus}
            </span>
          </div>

          <div className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-lg flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">Photo / ID proof</span>
            <span
              className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md whitespace-nowrap ${getBadgeStyle(
                photoIdStatus,
              )}`}
            >
              {photoIdStatus}
            </span>
          </div>

          <div className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-lg flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">Enrollment form</span>
            <span
              className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md whitespace-nowrap ${getBadgeStyle(
                enrollmentStatus,
              )}`}
            >
              {enrollmentStatus}
            </span>
          </div>

          <div className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-lg flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">Consent</span>
            <span
              className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md whitespace-nowrap ${getBadgeStyle(
                consentStatus,
              )}`}
            >
              {consentStatus}
            </span>
          </div>
        </div>
      </section>

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
        {/* Next due Card */}
        {allUnpaidSubmitted ? (
          <section
            aria-labelledby="candidate-next-due-heading"
            className="p-6 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-col justify-between gap-5"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-blue-700 shrink-0" />
                  <h2
                    id="candidate-next-due-heading"
                    className="text-sm font-semibold text-blue-950"
                  >
                    Next due
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-800 bg-blue-100/80 border border-blue-200 rounded-md whitespace-nowrap shrink-0">
                  <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  Awaiting confirmation
                </span>
              </div>

              <div className="pt-1 space-y-1">
                <p className="text-sm font-medium text-blue-950">
                  Payment submitted. Awaiting confirmation.
                </p>
                <p className="text-xs text-blue-800">
                  Your submitted installment payment is currently awaiting review
                  and confirmation by the institute administration.
                </p>
              </div>
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
        ) : allPaid ? (
          <section
            aria-labelledby="candidate-next-due-heading"
            className="p-6 bg-emerald-50/60 border border-emerald-200 rounded-xl flex flex-col justify-between gap-5"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <h2
                    id="candidate-next-due-heading"
                    className="text-sm font-semibold text-emerald-950"
                  >
                    Next due
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-100/80 border border-emerald-200 rounded-md whitespace-nowrap shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  Paid
                </span>
              </div>

              <div className="pt-1">
                <p className="text-sm font-medium text-emerald-900">
                  All installments are paid
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  You have no pending fees or overdue installments.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onGoToFees}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:text-emerald-950 transition-colors self-start whitespace-nowrap"
            >
              <span>View Payment History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </section>
        ) : nextDue ? (
          <section
            aria-labelledby="candidate-next-due-heading"
            className={`p-6 rounded-xl flex flex-col justify-between gap-5 border ${
              nextDue.state === 'overdue'
                ? 'bg-red-50/50 border-red-200'
                : nextDue.state === 'due_today'
                ? 'bg-orange-50/50 border-orange-200'
                : nextDue.state === 'due_soon'
                ? 'bg-amber-50/50 border-amber-200'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarClock
                    className={`w-4 h-4 shrink-0 ${
                      nextDue.state === 'overdue'
                        ? 'text-red-700'
                        : nextDue.state === 'due_today'
                        ? 'text-orange-700'
                        : nextDue.state === 'due_soon'
                        ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  />
                  <h2
                    id="candidate-next-due-heading"
                    className="text-sm font-semibold text-slate-900"
                  >
                    Next due
                  </h2>
                </div>
                <InstallmentStateBadge state={nextDue.state} />
              </div>

              <div className="pt-1 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                    {formatInr(nextDue.amount)}
                  </p>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      nextDue.state === 'overdue'
                        ? 'text-red-800 bg-red-100/90'
                        : nextDue.state === 'due_today'
                        ? 'text-orange-800 bg-orange-100/90'
                        : nextDue.state === 'due_soon'
                        ? 'text-amber-800 bg-amber-100/90'
                        : 'text-slate-700 bg-slate-100'
                    }`}
                  >
                    {getInstallmentDueRelativeText(nextDue.due_date, nextDue.state)}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Installment #{nextDue.seq} · Due{' '}
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {formatDate(nextDue.due_date)}
                  </span>
                </p>

                {Number(nextDue.pending_amount || 0) > 0 && (
                  <p className="text-xs font-medium text-blue-700 pt-0.5">
                    {formatInr(nextDue.pending_amount)} submitted, awaiting confirmation
                  </p>
                )}
              </div>
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
        ) : (
          <section
            aria-labelledby="candidate-next-due-heading"
            className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col justify-between gap-5"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-slate-500 shrink-0" />
                <h2
                  id="candidate-next-due-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  Next due
                </h2>
              </div>
              <p className="text-sm text-slate-500 pt-1">
                No unpaid installments scheduled yet.
              </p>
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
        )}

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
              {pendingPaymentsCount > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-md">
                  <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  <span>
                    {pendingPaymentsCount} payment{pendingPaymentsCount === 1 ? '' : 's'} awaiting confirmation
                  </span>
                </div>
              )}
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
