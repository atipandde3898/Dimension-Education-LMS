import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  IndianRupee,
  X,
} from 'lucide-react';
import type {
  CandidateApplication,
  CandidateCv,
  CandidateDocument,
  CandidateEducation,
  CandidateOpportunity,
  CandidateOverview,
  CandidateWork,
  InstallmentStatus,
  OnboardingStatus,
  Payment,
} from '../../types/database';
import {
  findNextDueInstallment,
  formatCandidateClosingCountdown,
  formatCandidateStatusLabel,
  formatDate,
  formatInr,
  formatTicketDateTime,
  getInitials,
  getInstallmentDueRelativeText,
  getMostRecentUpdatedApplication,
} from '../../utils/domain';
import { InstallmentStateBadge } from '../ui/FeeWidgets';

interface CandidateHomeViewProps {
  overview: CandidateOverview;
  documents: CandidateDocument[];
  installments: InstallmentStatus[];
  payments?: Payment[];
  onboardingStatus?: OnboardingStatus | null;
  education?: CandidateEducation | null;
  work?: CandidateWork | null;
  cv?: CandidateCv | null;
  avatarUrl?: string | null;
  unansweredOpportunitiesCount?: number;
  soonestOpportunity?: CandidateOpportunity | null;
  myApplications?: CandidateApplication[];
  onGoToOnboarding: () => void;
  onGoToOpportunities?: () => void;
  onGoToMyApplications?: () => void;
  onGoToFees: () => void;
}

export function CandidateHomeView({
  overview,
  documents,
  installments,
  payments = [],
  onboardingStatus,
  education,
  work,
  cv,
  avatarUrl,
  unansweredOpportunitiesCount = 0,
  soonestOpportunity = null,
  myApplications = [],
  onGoToOnboarding,
  onGoToOpportunities,
  onGoToMyApplications,
  onGoToFees,
}: CandidateHomeViewProps) {
  const latestApplicationUpdate = getMostRecentUpdatedApplication(myApplications);
  const firstName =
    overview.full_name?.trim().split(/\s+/)[0] || overview.full_name || 'Candidate';
  const initials = getInitials(overview.full_name);

  const unpaidInstallments = installments.filter((i) => i.state !== 'paid');
  const allPaid = installments.length > 0 && unpaidInstallments.length === 0;
  const allUnpaidSubmitted =
    unpaidInstallments.length > 0 &&
    unpaidInstallments.every((i) => i.state === 'submitted');
  const nextDue = findNextDueInstallment(installments);

  const docMap = new Map<string, CandidateDocument>();
  for (const d of documents) {
    docMap.set(d.doc_type, d);
  }

  const getDocStatus = (docType: string): 'Approved' | 'Pending' | 'Rejected' | 'Missing' => {
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

  const educationDone = Boolean(onboardingStatus?.education_done ?? education);
  const workDone = Boolean(onboardingStatus?.work_done ?? work);
  const cvDone = Boolean(onboardingStatus?.cv_done ?? cv);

  const consentsAccepted = Number(onboardingStatus?.consents_accepted ?? 0);
  const consentsRequired = Number(onboardingStatus?.consents_required ?? 0);
  const consentAccepted =
    consentsRequired > 0 && consentsAccepted >= consentsRequired;
  const consentStatus = consentAccepted ? 'Accepted' : 'Pending';

  const isOnboardingComplete = Boolean(onboardingStatus?.onboarding_complete);

  // 8 checklist steps for the vertical stepper
  const steps = [
    {
      id: 'profile_photo',
      title: 'Profile photo',
      status: photoStatus,
      description: 'Recent passport-style photo with plain background',
    },
    {
      id: 'pan',
      title: 'PAN card',
      status: panStatus,
      description: 'Permanent Account Number verification',
    },
    {
      id: 'photo_id',
      title: 'Photo / ID proof',
      status: photoIdStatus,
      description: 'Government photo identification document',
    },
    {
      id: 'enrollment_form',
      title: 'Enrollment form',
      status: enrollmentStatus,
      description: 'Signed registration agreement and module confirmation',
    },
    {
      id: 'education',
      title: 'Education details',
      status: educationDone ? 'Done' : 'Missing',
      description: 'Academic qualifications from SSC to graduation / PG',
    },
    {
      id: 'work',
      title: 'Work background',
      status: workDone ? 'Done' : 'Missing',
      description: 'Fresher status or professional SAP / domain experience',
    },
    {
      id: 'cv',
      title: 'CV',
      status: cvDone ? 'Done' : 'Missing',
      description: 'Updated resume or CV in PDF, DOC, or DOCX format',
    },
    {
      id: 'consent',
      title: 'Terms & Institutional Consent',
      status: consentStatus,
      description: 'Code of conduct, policy clauses, and digital signature',
    },
  ];

  const completedStepsCount = steps.filter(
    (s) =>
      s.status === 'Approved' ||
      s.status === 'Accepted' ||
      s.status === 'Done',
  ).length;
  const progressPercent = Math.round((completedStepsCount / steps.length) * 100);

  // Fee calculation
  const netFee = Number(overview.net_fee ?? 0);
  const paidAmount = Number(overview.paid ?? 0);
  const feeProgressPercent =
    netFee > 0 ? Math.min(100, Math.round((paidAmount / netFee) * 100)) : 0;

  return (
    <div className="space-y-8">
      {/* 1. Welcoming Hero Card: "Welcome, <first name>" with Profile Photo */}
      <section
        aria-label="Welcome banner"
        className="p-6 sm:p-8 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div className="flex items-center gap-5">
          {/* Profile photo or Initials */}
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={overview.full_name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-[#E3E9F0] shadow-xs"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#E6F6F6] border-2 border-[#0FA3A3]/40 flex items-center justify-center text-xl sm:text-2xl font-bold font-display text-[#0B7C7C] shadow-xs select-none">
                {initials}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-semibold text-[#0B7C7C] bg-[#E6F6F6] px-2 py-0.5 rounded tabular-nums">
                {overview.candidate_code}
              </span>
              <span className="text-[#8E9BAE]" aria-hidden="true">·</span>
              <span className="text-[#5B6B7F] font-medium">
                {formatCandidateStatusLabel(overview.status)}
              </span>
            </div>

            <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold font-display text-[#0B1F3A] tracking-tight">
              Welcome, {firstName}
            </h1>

            <p className="mt-1 text-sm text-[#5B6B7F] flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{overview.program || 'Program enrolled'}</span>
              {overview.batch_code && (
                <>
                  <span className="text-[#D1DCE8]" aria-hidden="true">·</span>
                  <span className="font-mono text-xs font-medium text-[#0B1F3A]">
                    Batch {overview.batch_code}
                  </span>
                </>
              )}
              {overview.counsellor && (
                <>
                  <span className="text-[#D1DCE8]" aria-hidden="true">·</span>
                  <span>Counsellor: {overview.counsellor}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
          <button
            type="button"
            onClick={onGoToOnboarding}
            className="px-4 py-2.5 text-xs font-semibold text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors shadow-xs"
          >
            My Documents
          </button>
          <button
            type="button"
            onClick={onGoToFees}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors shadow-xs"
          >
            View Fees
          </button>
        </div>
      </section>

      {/* Opportunities waiting card (shown only when N > 0) */}
      {unansweredOpportunitiesCount > 0 && onGoToOpportunities && (
        <section
          aria-label="Opportunities waiting for your response"
          className="p-5 sm:p-6 bg-white border border-[#0FA3A3]/40 rounded-xl shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#E6F6F6] text-[#0B7C7C] flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold font-display text-[#0B1F3A]">
                Opportunities waiting for you: {unansweredOpportunitiesCount}
              </h2>
              {soonestOpportunity && (
                <p className="mt-1 text-xs sm:text-sm text-[#5B6B7F]">
                  Soonest closing:{' '}
                  <span className="font-semibold text-[#0B1F3A]">
                    {soonestOpportunity.company} — {soonestOpportunity.job_title}
                  </span>{' '}
                  ·{' '}
                  <span
                    className={`font-semibold ${
                      formatCandidateClosingCountdown(soonestOpportunity.expires_at)
                        .isUrgent
                        ? 'text-[#C98A0B]'
                        : 'text-[#0B7C7C]'
                    }`}
                  >
                    {
                      formatCandidateClosingCountdown(soonestOpportunity.expires_at)
                        .label
                    }
                  </span>{' '}
                  <span className="font-mono text-xs text-[#5B6B7F] tabular-nums">
                    ({formatTicketDateTime(soonestOpportunity.expires_at)})
                  </span>
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToOpportunities}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            View opportunities
            <ArrowRight className="w-4 h-4 text-[#0FA3A3]" />
          </button>
        </section>
      )}

      {/* My applications summary card */}
      {onGoToMyApplications && (
        <section
          aria-label="My applications"
          className="p-5 sm:p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#E8F0FA] text-[#2F6FB0] flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-bold font-display text-[#0B1F3A]">
                  My applications
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-[#E8F0FA] text-[#2F6FB0] border border-[#BFD7F2] tabular-nums">
                  {myApplications.length}
                </span>
              </div>

              {latestApplicationUpdate ? (
                <p className="mt-1 text-xs sm:text-sm text-[#5B6B7F]">
                  Most recent update:{' '}
                  <span className="font-semibold text-[#0B1F3A]">
                    {latestApplicationUpdate.summaryText}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-xs sm:text-sm text-[#5B6B7F]">
                  {myApplications.length === 0
                    ? 'You have not applied to any opportunities yet.'
                    : 'Waiting for placement team status updates on your applications.'}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToMyApplications}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-[#0B1F3A] bg-white border border-[#E3E9F0] hover:bg-[#F5F8FB] rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            View my applications
            <ArrowRight className="w-4 h-4 text-[#0FA3A3]" />
          </button>
        </section>
      )}

      {/* 2. Onboarding Checklist as a Vertical Stepper with Progress Ring & Prominent Continue Button */}
      <section
        aria-labelledby="onboarding-stepper-heading"
        className="p-6 sm:p-8 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-[#E3E9F0]">
          <div className="flex items-center gap-5">
            {/* Circular Progress Ring */}
            <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
              <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 72 72">
                <circle
                  cx="36"
                  cy="36"
                  r="30"
                  className="text-[#E6F6F6] stroke-current"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="36"
                  cy="36"
                  r="30"
                  className="text-[#0FA3A3] stroke-current transition-all duration-500 ease-out"
                  strokeWidth="6"
                  strokeDasharray={188.5}
                  strokeDashoffset={188.5 - (188.5 * progressPercent) / 100}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
                <span className="font-display font-bold text-sm text-[#0B1F3A] leading-tight">
                  {completedStepsCount}/{steps.length}
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="onboarding-stepper-heading"
                  className="text-lg font-bold font-display text-[#0B1F3A]"
                >
                  Onboarding Checklist
                </h2>
                {isOnboardingComplete ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E7F6EF] text-[#1F9D6B] border border-[#1F9D6B]/30">
                    Onboarding complete
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FDF4E0] text-[#C98A0B] border border-[#C98A0B]/30">
                    {steps.length - completedStepsCount} step{steps.length - completedStepsCount === 1 ? '' : 's'} remaining
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-[#5B6B7F]">
                {isOnboardingComplete
                  ? 'All mandatory identity documents, background details, CV, and policy consents are complete.'
                  : 'Complete your documents, education, work background, CV, and consent to unlock full portal access.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToOnboarding}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs shrink-0 self-start sm:self-center"
          >
            <span>{isOnboardingComplete ? 'Review Onboarding' : 'Continue'}</span>
            <ArrowRight className="w-4 h-4 text-[#0FA3A3]" />
          </button>
        </div>

        {/* Vertical Stepper */}
        <div className="relative pl-2 sm:pl-4 space-y-6">
          {steps.map((step, index) => {
            const isDone =
              step.status === 'Approved' ||
              step.status === 'Accepted' ||
              step.status === 'Done';
            const isPending = step.status === 'Pending';
            const isRejected = step.status === 'Rejected';
            const isLast = index === steps.length - 1;

            return (
              <div key={step.id} className="relative flex items-start gap-4 group">
                {/* Connecting Line */}
                {!isLast && (
                  <div
                    aria-hidden="true"
                    className={`absolute left-4 top-8 -bottom-6 w-0.5 ${
                      isDone ? 'bg-[#0FA3A3]' : 'bg-[#E3E9F0]'
                    }`}
                  />
                )}

                {/* Step Indicator Dot */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 transition-colors ${
                    isDone
                      ? 'bg-[#E7F6EF] text-[#1F9D6B] border-2 border-[#1F9D6B]'
                      : isPending
                        ? 'bg-[#E6F6F6] text-[#0B7C7C] border-2 border-[#0FA3A3]'
                        : isRejected
                          ? 'bg-[#FBEAE9] text-[#C2413B] border-2 border-[#C2413B]'
                          : 'bg-[#F5F8FB] text-[#8E9BAE] border-2 border-[#E3E9F0]'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  ) : isPending ? (
                    <Clock className="w-4 h-4 stroke-[2]" />
                  ) : isRejected ? (
                    <X className="w-4 h-4 stroke-[2.5]" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1 min-w-0 pt-0.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className={`text-sm font-semibold ${isDone ? 'text-[#0B1F3A]' : 'text-[#0F1B2D]'}`}>
                      {step.title}
                    </p>
                    <p className="text-xs text-[#5B6B7F] mt-0.5">
                      {step.description}
                    </p>
                  </div>

                  <div className="shrink-0">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        isDone
                          ? 'bg-[#E7F6EF] text-[#1F9D6B]'
                          : isPending
                            ? 'bg-[#E6F6F6] text-[#0B7C7C]'
                            : isRejected
                              ? 'bg-[#FBEAE9] text-[#C2413B]'
                              : 'bg-[#F5F8FB] text-[#8E9BAE]'
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Roomy Two-Column Grid: Fees Progress & Next Due Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Fees Progress Card: Paid Amount as Large Figure with Progress Bar toward Total */}
        <section
          aria-labelledby="fees-progress-heading"
          className="p-6 sm:p-8 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col justify-between space-y-6"
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E9F0]">
              <h2
                id="fees-progress-heading"
                className="text-base font-bold font-display text-[#0B1F3A]"
              >
                Fees &amp; Payments
              </h2>
              <button
                type="button"
                onClick={onGoToFees}
                className="text-xs font-semibold text-[#0B7C7C] hover:text-[#0B8A8A] flex items-center gap-1 transition-colors"
              >
                <span>View fee plan</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B7F]">
                  Total Paid
                </p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tabular-nums">
                    {formatInr(paidAmount)}
                  </span>
                  <span className="text-xs text-[#5B6B7F]">
                    of {formatInr(netFee)} net total fee ({feeProgressPercent}%)
                  </span>
                </div>
              </div>

              {/* Slim Teal Progress Bar */}
              <div className="w-full bg-[#E6F6F6] rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-[#0FA3A3] h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${feeProgressPercent}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 text-xs">
                <div className="p-3 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg">
                  <span className="text-[#5B6B7F]">Pending balance:</span>
                  <p className="mt-1 font-display text-base font-bold text-[#0B1F3A] tabular-nums">
                    {formatInr(overview.pending)}
                  </p>
                </div>
                <div className="p-3 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg">
                  <span className="text-[#5B6B7F]">Remaining installments:</span>
                  <p className="mt-1 font-display text-base font-bold text-[#0B1F3A] tabular-nums">
                    {unpaidInstallments.length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E3E9F0]">
            <button
              type="button"
              onClick={onGoToFees}
              className="w-full min-h-[44px] px-4 py-2 text-sm font-semibold text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors flex items-center justify-center gap-2"
            >
              <IndianRupee className="w-4 h-4 text-[#0FA3A3]" />
              <span>Submit Payment Proof</span>
            </button>
          </div>
        </section>

        {/* Next Due / Settlement Card */}
        <section
          aria-labelledby="settlement-status-heading"
          className="p-6 sm:p-8 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col justify-between space-y-6"
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E9F0]">
              <h2
                id="settlement-status-heading"
                className="text-base font-bold font-display text-[#0B1F3A]"
              >
                Next Due Installment
              </h2>
              <span className="text-xs text-[#5B6B7F]">Milestone</span>
            </div>

            <div className="mt-5">
              {allUnpaidSubmitted ? (
                <div className="p-5 bg-[#E8F0FA] border border-[#2F6FB0]/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#2F6FB0]" />
                    <p className="text-base font-bold font-display text-[#2F6FB0]">
                      Payment submitted
                    </p>
                  </div>
                  <p className="text-xs text-[#5B6B7F] leading-relaxed">
                    Awaiting admin confirmation. Your account balance will update as soon as the finance desk audits your transfer receipt.
                  </p>
                </div>
              ) : allPaid ? (
                <div className="p-5 bg-[#E7F6EF] border border-[#1F9D6B]/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-[#1F9D6B]" />
                    <p className="text-base font-bold font-display text-[#1F9D6B]">
                      All installments are paid
                    </p>
                  </div>
                  <p className="text-xs text-[#5B6B7F]">
                    No outstanding balance remains for your current course enrollment.
                  </p>
                </div>
              ) : nextDue ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B7F]">
                        Installment #{nextDue.seq}
                      </p>
                      <p className="mt-1 font-display text-3xl font-extrabold text-[#0B1F3A] tabular-nums">
                        {formatInr(nextDue.amount)}
                      </p>
                    </div>
                    <InstallmentStateBadge state={nextDue.state} />
                  </div>

                  <div className="p-4 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg space-y-1.5 text-xs text-[#5B6B7F]">
                    <div className="flex justify-between">
                      <span>Due date:</span>
                      <span className="font-semibold text-[#0B1F3A] font-mono tabular-nums">
                        {formatDate(nextDue.due_date)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Schedule timeline:</span>
                      <span className="font-semibold text-[#0B7C7C]">
                        {getInstallmentDueRelativeText(nextDue.due_date)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-5 bg-[#F5F8FB] border border-[#E3E9F0] rounded-xl text-center text-xs text-[#5B6B7F]">
                  No upcoming installment found.
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#E3E9F0]">
            <div className="flex items-center justify-between text-xs text-[#5B6B7F]">
              <span>Need help with fees?</span>
              <button
                type="button"
                onClick={onGoToFees}
                className="font-semibold text-[#0B7C7C] hover:text-[#0B8A8A]"
              >
                Contact Support &rarr;
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
