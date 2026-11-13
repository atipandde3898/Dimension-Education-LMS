import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  CandidateApplication,
  CandidateCv,
  CandidateEducation,
  CandidateOpportunity,
  CandidateWork,
  OnboardingStatus,
} from '../../types/database';
import {
  APPLICATION_PROGRESS_STEPS,
  CANDIDATE_DOCS_BUCKET,
  type CandidateApplicationStatusTone,
  OPPORTUNITY_FILES_BUCKET,
  formatCandidateApplicationStatus,
  formatCandidateClosingCountdown,
  formatCandidatePackageRangeInr,
  formatDate,
  formatDbError,
  formatTicketDateTime,
  isCandidateOpportunityApplyBlocked,
  isCandidateOpportunityLive,
  sortCandidateApplicationsNewestFirst,
  sortCandidateOpportunitiesSoonestFirst,
} from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DocumentPreviewModal } from '../ui/DocumentWidgets';
import { EmptyState, ErrorState } from '../ui/States';
import { ApplyWithCvModal } from './ApplyWithCvModal';

export type CandidateOpportunitiesTab = 'open' | 'my_applications';

interface CandidateOpportunitiesViewProps {
  candidateId: string;
  activeTab: CandidateOpportunitiesTab;
  onChangeTab: (tab: CandidateOpportunitiesTab) => void;
  opportunities: CandidateOpportunity[];
  opportunitiesError?: string | null;
  applications: CandidateApplication[];
  applicationsError?: string | null;
  cv: CandidateCv | null;
  onboardingStatus: OnboardingStatus | null;
  education: CandidateEducation | null;
  work: CandidateWork | null;
  onGoToOnboarding: () => void;
  onRemoveOpportunity: (recipientId: string) => void;
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
}

const APPLICATION_STATUS_BADGE_CLASSES: Record<
  CandidateApplicationStatusTone,
  string
> = {
  blue: 'bg-[#E8F0FA] text-[#2F6FB0] border-[#BFD7F2]',
  green: 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]',
  teal: 'bg-[#E6F6F6] text-[#0B7C7C] border-[#0FA3A3]/40 dark:bg-[#12294A] dark:text-[#2CC4C4] dark:border-[#1E436E]',
  dark_green:
    'bg-[#14532D] text-white border-[#14532D] dark:bg-[#1E6B43] dark:text-[#E7F6EF] dark:border-[#2A8A58]',
  amber:
    'bg-[#FDF4E0] text-[#C98A0B] border-[#F6DEAA] dark:bg-[#2A2312] dark:text-[#E8AF37] dark:border-[#4D3D17]',
  grey: 'bg-[#F5F8FB] text-[#5B6B7F] border-[#E3E9F0]',
};

export function CandidateOpportunitiesView({
  candidateId,
  activeTab,
  onChangeTab,
  opportunities,
  opportunitiesError = null,
  applications,
  applicationsError = null,
  cv,
  onboardingStatus,
  education,
  work,
  onGoToOnboarding,
  onRemoveOpportunity,
  onRefresh,
  refreshing = false,
}: CandidateOpportunitiesViewProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expandedDescIds, setExpandedDescIds] = useState<Record<string, boolean>>(
    {},
  );

  // Document preview (JD from opportunity-files OR current CV from candidate-docs)
  const [previewTarget, setPreviewTarget] = useState<{
    storagePath: string;
    bucketName: string;
    title: string;
  } | null>(null);

  // "I'm interested" modal
  const [applyTarget, setApplyTarget] = useState<CandidateOpportunity | null>(
    null,
  );

  // "Not interested" confirm dialog
  const [declineTarget, setDeclineTarget] =
    useState<CandidateOpportunity | null>(null);
  const [declining, setDeclining] = useState(false);

  // Readable RPC error banner (keeps the card on failure)
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success toast after answering
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tick every minute to keep live countdowns up to date
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-dismiss success toast after 5 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => {
      setToastMessage(null);
    }, 5000);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  const sortedOpportunities = useMemo(
    () =>
      sortCandidateOpportunitiesSoonestFirst(
        opportunities.filter((o) => isCandidateOpportunityLive(o, nowMs)),
      ),
    [opportunities, nowMs],
  );

  const sortedApplications = useMemo(
    () => sortCandidateApplicationsNewestFirst(applications),
    [applications],
  );

  const applyBlocked = isCandidateOpportunityApplyBlocked(onboardingStatus, {
    hasEducation: Boolean(education),
    hasWork: Boolean(work),
    hasCv: Boolean(cv),
  });

  const handleAnsweredSuccess = async (recipientId: string) => {
    onRemoveOpportunity(recipientId);
    setToastMessage('Your answer has been sent to the placement team');
    await onRefresh();
  };

  const handleConfirmNotInterested = async () => {
    const client = supabase;
    if (!client || !declineTarget) return;

    setDeclining(true);
    setErrorMessage(null);

    const { error: rpcErr } = await client.rpc('respond_opportunity', {
      p_recipient: declineTarget.recipient_id,
      p_response: 'not_interested',
    });

    setDeclining(false);

    if (rpcErr) {
      setDeclineTarget(null);
      setErrorMessage(formatDbError(rpcErr));
      return;
    }

    const recipientId = declineTarget.recipient_id;
    setDeclineTarget(null);
    await handleAnsweredSuccess(recipientId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold font-display text-[#0B1F3A] tracking-tight">
            Placement Opportunities
          </h2>
          <p className="mt-1 text-sm text-[#5B6B7F]">
            {activeTab === 'open'
              ? 'Open roles awaiting your response, ordered by the soonest deadline.'
              : 'Roles you have applied to and their current status updates.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors self-start sm:self-auto shrink-0 disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-[#0FA3A3] ${refreshing ? 'animate-spin' : ''}`}
          />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Top Tabs: Open vs My applications */}
      <div className="border-b border-[#E3E9F0]">
        <div
          role="tablist"
          aria-label="Opportunities sections"
          className="flex items-center gap-6 -mb-px overflow-x-auto"
        >
          <button
            type="button"
            role="tab"
            id="tab-open-opportunities"
            aria-selected={activeTab === 'open'}
            aria-controls="panel-open-opportunities"
            onClick={() => onChangeTab('open')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'open'
                ? 'border-[#0FA3A3] text-[#0B1F3A] dark:text-[#2CC4C4]'
                : 'border-transparent text-[#5B6B7F] hover:text-[#0B1F3A] hover:border-[#D1DCE8]'
            }`}
          >
            <span>Open</span>
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded-full tabular-nums ${
                activeTab === 'open'
                  ? 'bg-[#E6F6F6] text-[#0B7C7C] dark:bg-[#12294A] dark:text-[#2CC4C4]'
                  : 'bg-[#F5F8FB] text-[#5B6B7F]'
              }`}
            >
              {sortedOpportunities.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-my-applications"
            aria-selected={activeTab === 'my_applications'}
            aria-controls="panel-my-applications"
            onClick={() => onChangeTab('my_applications')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'my_applications'
                ? 'border-[#0FA3A3] text-[#0B1F3A] dark:text-[#2CC4C4]'
                : 'border-transparent text-[#5B6B7F] hover:text-[#0B1F3A] hover:border-[#D1DCE8]'
            }`}
          >
            <span>My applications</span>
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded-full tabular-nums ${
                activeTab === 'my_applications'
                  ? 'bg-[#E6F6F6] text-[#0B7C7C] dark:bg-[#12294A] dark:text-[#2CC4C4]'
                  : 'bg-[#F5F8FB] text-[#5B6B7F]'
              }`}
            >
              {sortedApplications.length}
            </span>
          </button>
        </div>
      </div>

      {activeTab === 'open' ? (
        <div
          id="panel-open-opportunities"
          role="tabpanel"
          aria-labelledby="tab-open-opportunities"
          className="space-y-6"
        >
          {applyBlocked && (
            <div
              role="status"
              className="p-4 bg-[#FDF4E0] border border-[#F6DEAA] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#C98A0B] shrink-0 mt-0.5" />
                <div className="text-xs text-[#0F1B2D]">
                  <p className="font-semibold text-[#C98A0B]">
                    Complete your onboarding first
                  </p>
                  <p className="text-[#5B6B7F] mt-0.5">
                    Finish your education details, work background, and CV upload
                    on the Onboarding page before expressing interest in an
                    opening.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onGoToOnboarding}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors whitespace-nowrap self-start sm:self-center shrink-0"
              >
                Go to Onboarding
                <ArrowRight className="w-3.5 h-3.5 text-[#0FA3A3]" />
              </button>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl border text-xs bg-[#FBEAE9] border-[#F4C5C2] text-[#C2413B] flex items-center justify-between gap-3"
            >
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                aria-label="Dismiss error message"
                className="p-0.5 opacity-75 hover:opacity-100 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {opportunitiesError ? (
            <ErrorState
              title="Could not load opportunities"
              message={opportunitiesError}
              onRetry={() => void onRefresh()}
            />
          ) : sortedOpportunities.length === 0 ? (
            <EmptyState
              title="No opportunities right now"
              description="No opportunities right now. New ones appear here for a limited time."
            />
          ) : (
            <div className="space-y-4">
              {sortedOpportunities.map((opp) => {
                const countdown = formatCandidateClosingCountdown(
                  opp.expires_at,
                  nowMs,
                );
                const packageText = formatCandidatePackageRangeInr(
                  opp.package_min_lakhs,
                  opp.package_max_lakhs,
                );
                const descKey = `open-${opp.recipient_id}`;
                const isExpanded = Boolean(expandedDescIds[descKey]);
                const hasLongDescription =
                  Boolean(opp.description) &&
                  (opp.description!.length > 240 ||
                    opp.description!.split('\n').length > 4);

                return (
                  <article
                    key={opp.recipient_id}
                    className="p-5 sm:p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-4"
                  >
                    {/* Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#0B7C7C]">
                          <Briefcase className="w-3.5 h-3.5" />
                          {opp.company}
                        </span>

                        <h3 className="text-lg sm:text-xl font-bold font-display text-[#0B1F3A] tracking-tight">
                          {opp.job_title}
                        </h3>

                        {packageText && (
                          <p className="text-sm font-medium text-[#0B1F3A]">
                            {packageText}
                          </p>
                        )}
                      </div>

                      {/* Live Countdown Badge */}
                      <div className="flex flex-col sm:items-end gap-1 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border rounded-lg ${
                            countdown.isUrgent
                              ? 'bg-[#FDF4E0] text-[#C98A0B] border-[#F6DEAA]'
                              : 'bg-[#E6F6F6] text-[#0B7C7C] border-[#0FA3A3]/30 dark:bg-[#12294A] dark:text-[#2CC4C4] dark:border-[#1E436E]'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{countdown.label}</span>
                        </span>
                        <span className="font-mono text-[11px] text-[#5B6B7F] tabular-nums">
                          Closes {formatTicketDateTime(opp.expires_at)}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Description */}
                    {opp.description && (
                      <div className="p-4 bg-[#F5F8FB] border border-[#E3E9F0] rounded-xl space-y-2">
                        <div
                          className={`text-xs sm:text-sm text-[#0F1B2D] whitespace-pre-wrap leading-relaxed ${
                            hasLongDescription && !isExpanded
                              ? 'line-clamp-3'
                              : ''
                          }`}
                        >
                          {opp.description}
                        </div>
                        {hasLongDescription && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDescIds((prev) => ({
                                ...prev,
                                [descKey]: !isExpanded,
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B7C7C] hover:text-[#0B8A8A]"
                          >
                            {isExpanded ? (
                              <>
                                <span>Show less</span>
                                <ChevronUp className="w-3.5 h-3.5" />
                              </>
                            ) : (
                              <>
                                <span>Read full description</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Actions Footer */}
                    <div className="pt-3 border-t border-[#E3E9F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        {opp.jd_path && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewTarget({
                                storagePath: opp.jd_path!,
                                bucketName: OPPORTUNITY_FILES_BUCKET,
                                title: `Job Description — ${opp.company} (${opp.job_title})`,
                              })
                            }
                            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#0FA3A3]" />
                            View job description
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {applyBlocked && (
                          <button
                            type="button"
                            onClick={onGoToOnboarding}
                            className="text-xs font-semibold text-[#0B7C7C] hover:underline mr-1"
                          >
                            Complete your onboarding first
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={declining || countdown.isExpired}
                          onClick={() => {
                            setErrorMessage(null);
                            setDeclineTarget(opp);
                          }}
                          className="min-h-[40px] px-4 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors disabled:opacity-45 whitespace-nowrap"
                        >
                          Not interested
                        </button>

                        <button
                          type="button"
                          disabled={
                            applyBlocked || declining || countdown.isExpired
                          }
                          onClick={() => {
                            setErrorMessage(null);
                            setApplyTarget(opp);
                          }}
                          className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors disabled:opacity-45 whitespace-nowrap"
                        >
                          I&apos;m interested
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div
          id="panel-my-applications"
          role="tabpanel"
          aria-labelledby="tab-my-applications"
          className="space-y-4"
        >
          {applicationsError ? (
            <ErrorState
              title="Could not load your applications"
              message={applicationsError}
              onRetry={() => void onRefresh()}
            />
          ) : sortedApplications.length === 0 ? (
            <EmptyState
              title="No applications yet"
              description="You have not applied to any opportunities yet."
            />
          ) : (
            <div className="space-y-4">
              {sortedApplications.map((app) => {
                const statusInfo = formatCandidateApplicationStatus(
                  app.pipeline_stage,
                );
                const packageText = formatCandidatePackageRangeInr(
                  app.package_min_lakhs,
                  app.package_max_lakhs,
                );
                const descKey = `app-${app.recipient_id}`;
                const isExpanded = Boolean(expandedDescIds[descKey]);
                const hasLongDescription =
                  Boolean(app.description) &&
                  (app.description!.length > 240 ||
                    app.description!.split('\n').length > 4);

                return (
                  <article
                    key={app.recipient_id}
                    className="p-5 sm:p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-4"
                  >
                    {/* Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#0B7C7C]">
                          <Briefcase className="w-3.5 h-3.5" />
                          {app.company}
                        </span>

                        <h3 className="text-lg sm:text-xl font-bold font-display text-[#0B1F3A] tracking-tight">
                          {app.job_title}
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                          {packageText && (
                            <span className="font-medium text-[#0B1F3A]">
                              {packageText}
                            </span>
                          )}
                          {packageText && (
                            <span className="text-[#D1DCE8]" aria-hidden="true">
                              ·
                            </span>
                          )}
                          <span className="text-[#5B6B7F] tabular-nums">
                            Applied on {formatDate(app.applied_at)}
                          </span>
                        </div>
                      </div>

                      {/* Status Badge + Last Update Timestamp */}
                      <div className="flex flex-col sm:items-end gap-1 shrink-0">
                        <span
                          className={`inline-flex items-center px-3 py-1 text-xs font-semibold border rounded-lg w-fit ${
                            APPLICATION_STATUS_BADGE_CLASSES[statusInfo.tone]
                          }`}
                        >
                          {statusInfo.label}
                        </span>
                        {app.stage_updated_at && (
                          <span className="font-mono text-[11px] text-[#5B6B7F] tabular-nums">
                            Last update: {formatTicketDateTime(app.stage_updated_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Closed / Cancelled Note */}
                    {app.cancelled && (
                      <div
                        role="note"
                        className="px-3.5 py-2.5 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg flex items-center gap-2 text-xs text-[#5B6B7F]"
                      >
                        <Info className="w-3.5 h-3.5 text-[#5B6B7F] shrink-0" />
                        <span>
                          This opportunity has been closed by the placement team.
                        </span>
                      </div>
                    )}

                    {/* Application Progress Line */}
                    <div
                      aria-label={`Application progress: ${statusInfo.label}`}
                      className="p-3.5 sm:p-4 bg-[#F5F8FB] border border-[#E3E9F0] rounded-xl"
                    >
                      {statusInfo.isRejected ? (
                        <div className="flex items-center justify-between gap-2 max-w-md">
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="w-5 h-5 rounded-full bg-[#E3E9F0] text-[#5B6B7F] flex items-center justify-center">
                              <Check className="w-3 h-3 stroke-[2.5]" />
                            </span>
                            <span className="text-xs font-medium text-[#5B6B7F]">
                              Applied
                            </span>
                          </div>
                          <div className="flex-1 h-0.5 bg-[#D1DCE8]" />
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="w-5 h-5 rounded-full bg-[#E3E9F0] text-[#5B6B7F] flex items-center justify-center">
                              <Ban className="w-3 h-3" />
                            </span>
                            <span className="text-xs font-semibold text-[#5B6B7F]">
                              Not selected
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <ol className="flex items-start justify-between min-w-[500px] gap-1">
                            {APPLICATION_PROGRESS_STEPS.map((stepLabel, idx) => {
                              const isCompleted = idx < statusInfo.stepIndex;
                              const isCurrent = idx === statusInfo.stepIndex;
                              const isLast =
                                idx === APPLICATION_PROGRESS_STEPS.length - 1;

                              return (
                                <li
                                  key={stepLabel}
                                  className="flex-1 flex flex-col items-center relative"
                                >
                                  {/* Connecting line to next step */}
                                  {!isLast && (
                                    <div
                                      aria-hidden="true"
                                      className={`absolute top-2.5 left-1/2 w-full h-0.5 ${
                                        idx < statusInfo.stepIndex
                                          ? 'bg-[#0FA3A3]'
                                          : 'bg-[#E3E9F0] dark:bg-[#23304A]'
                                      }`}
                                    />
                                  )}

                                  {/* Step node */}
                                  <span
                                    aria-current={isCurrent ? 'step' : undefined}
                                    className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                                      isCompleted
                                        ? 'bg-[#0FA3A3] text-white'
                                        : isCurrent
                                          ? 'bg-[#0B1F3A] text-white ring-4 ring-[#0FA3A3]/25 dark:bg-[#0FA3A3] dark:text-[#081629]'
                                          : 'bg-white border-2 border-[#D1DCE8] text-[#8E9BAE] dark:bg-[#111A2C] dark:border-[#23304A]'
                                    }`}
                                  >
                                    {isCompleted ? (
                                      <Check className="w-3 h-3 stroke-[2.5]" />
                                    ) : isCurrent ? (
                                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    ) : null}
                                  </span>

                                  <span
                                    className={`mt-1.5 text-[11px] text-center leading-tight px-0.5 ${
                                      isCurrent
                                        ? 'font-bold text-[#0B1F3A] dark:text-[#2CC4C4]'
                                        : isCompleted
                                          ? 'font-medium text-[#0B7C7C]'
                                          : 'font-normal text-[#8E9BAE]'
                                    }`}
                                  >
                                    {stepLabel}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      )}
                    </div>

                    {/* Expandable Description */}
                    {app.description && (
                      <div className="p-4 bg-[#F5F8FB] border border-[#E3E9F0] rounded-xl space-y-2">
                        <div
                          className={`text-xs sm:text-sm text-[#0F1B2D] whitespace-pre-wrap leading-relaxed ${
                            hasLongDescription && !isExpanded
                              ? 'line-clamp-3'
                              : ''
                          }`}
                        >
                          {app.description}
                        </div>
                        {hasLongDescription && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDescIds((prev) => ({
                                ...prev,
                                [descKey]: !isExpanded,
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B7C7C] hover:text-[#0B8A8A]"
                          >
                            {isExpanded ? (
                              <>
                                <span>Show less</span>
                                <ChevronUp className="w-3.5 h-3.5" />
                              </>
                            ) : (
                              <>
                                <span>Read full description</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* JD File Action */}
                    {app.jd_path && (
                      <div className="pt-3 border-t border-[#E3E9F0] flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewTarget({
                              storagePath: app.jd_path!,
                              bucketName: OPPORTUNITY_FILES_BUCKET,
                              title: `Job Description — ${app.company} (${app.job_title})`,
                            })
                          }
                          className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#0FA3A3]" />
                          View job description
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Apply with CV Modal */}
      <ApplyWithCvModal
        open={Boolean(applyTarget)}
        opportunity={applyTarget}
        candidateId={candidateId}
        cv={cv}
        onViewCv={(storagePath, title) =>
          setPreviewTarget({
            storagePath,
            bucketName: CANDIDATE_DOCS_BUCKET,
            title,
          })
        }
        onClose={() => setApplyTarget(null)}
        onApplied={async (recipientId) => {
          setApplyTarget(null);
          await handleAnsweredSuccess(recipientId);
        }}
      />

      {/* Not Interested Confirmation */}
      <ConfirmDialog
        open={Boolean(declineTarget)}
        title="Mark as not interested?"
        message={
          declineTarget
            ? `Are you sure you are not interested in "${declineTarget.company} — ${declineTarget.job_title}"? This cannot be changed.`
            : ''
        }
        confirmLabel="Confirm Not Interested"
        loading={declining}
        onClose={() => !declining && setDeclineTarget(null)}
        onConfirm={() => void handleConfirmNotInterested()}
      />

      {/* 60-Second Signed URL Document Preview Modal */}
      <DocumentPreviewModal
        open={Boolean(previewTarget)}
        storagePath={previewTarget?.storagePath ?? null}
        bucketName={previewTarget?.bucketName ?? CANDIDATE_DOCS_BUCKET}
        title={previewTarget?.title ?? 'Document Preview'}
        onClose={() => setPreviewTarget(null)}
      />

      {/* Success Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm p-4 bg-[#E7F6EF] border border-[#BCE8D3] text-[#1F9D6B] rounded-xl shadow-soft flex items-center gap-3"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="text-xs font-semibold leading-snug">{toastMessage}</p>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Close notification"
            className="p-1 opacity-75 hover:opacity-100 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
