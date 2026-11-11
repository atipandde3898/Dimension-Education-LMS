import {
  ArrowRight,
  Briefcase,
  Clock,
  Plus,
  Users,
} from 'lucide-react';
import type {
  CandidateProfileFull,
  Opportunity,
  OpportunityPipelineStage,
  OpportunityResponse,
} from '../../types/database';
import {
  PIPELINE_STAGE_OPTIONS,
  computeOpportunityCounts,
  computePlacementDashboardSummary,
  formatDate,
  formatPackageRangeInr,
  isOpportunityLive,
} from '../../utils/domain';

interface PlacementHomeViewProps {
  candidates: CandidateProfileFull[];
  opportunities: Opportunity[];
  responses: OpportunityResponse[];
  onGoToCandidates: () => void;
  onGoToOpportunities: () => void;
  onOpenOpportunity: (opportunityId: string) => void;
  onOpenNewOpportunity: () => void;
}

const STAGE_BADGE_STYLES: Record<OpportunityPipelineStage, string> = {
  shortlisted: 'bg-[#E8F0FA] text-[#2F6FB0] border-[#BFD7F2]',
  interview: 'bg-[#FDF4E0] text-[#C98A0B] border-[#F6DEAA]',
  selected: 'bg-[#E6F6F6] text-[#0B7C7C] border-[#BCE6E6]',
  offer_made: 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]',
  joined: 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]',
  rejected: 'bg-[#FBEAE9] text-[#C2413B] border-[#F4C5C2]',
};

export function PlacementHomeView({
  candidates,
  opportunities,
  responses,
  onGoToCandidates,
  onGoToOpportunities,
  onOpenOpportunity,
  onOpenNewOpportunity,
}: PlacementHomeViewProps) {
  const summary = computePlacementDashboardSummary(
    candidates.length,
    opportunities,
    responses,
  );

  const liveOpportunitiesList = opportunities.filter((opp) =>
    isOpportunityLive(
      opp,
      responses.filter((r) => r.opportunity_id === opp.id),
    ),
  );

  const waitingForDecisionList = responses.filter(
    (r) => r.response_state === 'interested' && !r.pipeline_stage,
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold font-display text-[#0B1F3A] tracking-tight leading-tight">
            Placement Overview
          </h1>
          <p className="mt-1 text-sm text-[#5B6B7F]">
            Track eligible candidates, live job opportunities, and hiring pipeline progress.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewOpportunity}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors shadow-xs self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 text-[#0FA3A3]" />
          New Opportunity
        </button>
      </div>

      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <button
          type="button"
          onClick={onGoToCandidates}
          className="text-left p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft hover:border-[#0FA3A3] transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#5B6B7F]">
              Candidates Visible
            </span>
            <div className="w-9 h-9 rounded-lg bg-[#E6F6F6] text-[#0B7C7C] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold font-display text-[#0B1F3A] tabular-nums">
            {summary.candidatesVisible}
          </p>
          <p className="mt-1.5 text-xs text-[#5B6B7F] flex items-center gap-1 group-hover:text-[#0B7C7C]">
            <span>In training &amp; certified candidates</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </p>
        </button>

        <button
          type="button"
          onClick={onGoToOpportunities}
          className="text-left p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft hover:border-[#0FA3A3] transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#5B6B7F]">
              Live Opportunities
            </span>
            <div className="w-9 h-9 rounded-lg bg-[#E7F6EF] text-[#1F9D6B] flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold font-display text-[#0B1F3A] tabular-nums">
            {summary.liveOpportunities}
          </p>
          <p className="mt-1.5 text-xs text-[#5B6B7F] flex items-center gap-1 group-hover:text-[#0B7C7C]">
            <span>Active openings accepting responses</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </p>
        </button>

        <div className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#5B6B7F]">
              Waiting for a Decision
            </span>
            <div className="w-9 h-9 rounded-lg bg-[#FDF4E0] text-[#C98A0B] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold font-display text-[#0B1F3A] tabular-nums">
            {summary.waitingForDecision}
          </p>
          <p className="mt-1.5 text-xs text-[#5B6B7F]">
            Interested candidates with no pipeline stage assigned yet
          </p>
        </div>
      </div>

      {/* Pipeline Stage Counts */}
      <section
        aria-labelledby="placement-pipeline-counts-heading"
        className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E3E9F0]">
          <div>
            <h2
              id="placement-pipeline-counts-heading"
              className="text-base font-bold font-display text-[#0B1F3A]"
            >
              Pipeline Stage Breakdown
            </h2>
            <p className="text-xs text-[#5B6B7F] mt-0.5">
              Total candidates across each recruitment stage across all opportunities.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {PIPELINE_STAGE_OPTIONS.map((stage) => (
            <div
              key={stage.value}
              className="p-4 bg-[#F5F8FB] border border-[#E3E9F0] rounded-xl space-y-2"
            >
              <span
                className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold border rounded-md ${STAGE_BADGE_STYLES[stage.value]}`}
              >
                {stage.label}
              </span>
              <p className="text-2xl font-extrabold font-display text-[#0B1F3A] tabular-nums">
                {summary.pipelineCounts[stage.value]}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Two-Column Action Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Opportunities List */}
        <section className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E3E9F0]">
            <h2 className="text-base font-bold font-display text-[#0B1F3A]">
              Live Opportunities ({liveOpportunitiesList.length})
            </h2>
            <button
              type="button"
              onClick={onGoToOpportunities}
              className="text-xs font-semibold text-[#0B7C7C] hover:text-[#0B8A8A]"
            >
              View all &rarr;
            </button>
          </div>

          {liveOpportunitiesList.length === 0 ? (
            <p className="text-xs text-[#5B6B7F] py-4 text-center">
              No live opportunities right now. Create one to invite candidates.
            </p>
          ) : (
            <div className="divide-y divide-[#E3E9F0]">
              {liveOpportunitiesList.slice(0, 5).map((opp) => {
                const counts = computeOpportunityCounts(
                  responses.filter((r) => r.opportunity_id === opp.id),
                );
                return (
                  <button
                    key={opp.id}
                    type="button"
                    onClick={() => onOpenOpportunity(opp.id)}
                    className="w-full py-3 first:pt-0 last:pb-0 text-left flex items-center justify-between gap-3 hover:bg-[#F5F8FB] px-2 -mx-2 rounded-lg transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0B1F3A] truncate">
                        {opp.company} — {opp.job_title}
                      </p>
                      <p className="text-xs text-[#5B6B7F] mt-0.5 truncate">
                        {formatPackageRangeInr(
                          opp.package_min_lakhs,
                          opp.package_max_lakhs,
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0 text-xs">
                      <span className="font-mono font-semibold text-[#1F9D6B] tabular-nums">
                        {counts.interested} interested
                      </span>
                      <p className="text-[11px] text-[#5B6B7F] font-mono tabular-nums">
                        {counts.sent} sent
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Interested Candidates Waiting for Decision */}
        <section className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E3E9F0]">
            <h2 className="text-base font-bold font-display text-[#0B1F3A]">
              Waiting for Decision ({waitingForDecisionList.length})
            </h2>
            <span className="text-xs text-[#5B6B7F]">Interested · Unassigned</span>
          </div>

          {waitingForDecisionList.length === 0 ? (
            <p className="text-xs text-[#5B6B7F] py-4 text-center">
              All interested candidate responses have a pipeline stage assigned.
            </p>
          ) : (
            <div className="divide-y divide-[#E3E9F0]">
              {waitingForDecisionList.slice(0, 5).map((item) => (
                <button
                  key={item.recipient_id}
                  type="button"
                  onClick={() => onOpenOpportunity(item.opportunity_id)}
                  className="w-full py-3 first:pt-0 last:pb-0 text-left flex items-center justify-between gap-3 hover:bg-[#F5F8FB] px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0B1F3A] truncate">
                      {item.full_name}{' '}
                      <span className="font-mono text-xs text-[#0B7C7C] font-medium">
                        ({item.candidate_code})
                      </span>
                    </p>
                    <p className="text-xs text-[#5B6B7F] mt-0.5 truncate">
                      {item.company} — {item.job_title}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#5B6B7F] shrink-0 tabular-nums">
                    {item.responded_at ? formatDate(item.responded_at) : '—'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
