import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  Opportunity,
  OpportunityResponse,
  Profile,
} from '../../types/database';
import {
  type OpportunityStatusLabel,
  computeOpportunityCounts,
  computeOpportunityStatus,
  formatDate,
  formatDbError,
  formatPackageRangeInr,
} from '../../utils/domain';
import { PlacementOpportunityDetailView } from '../placement/PlacementOpportunityDetailView';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';

interface AdminPlacementOpportunitiesViewProps {
  selectedOpportunityId: string | null;
  onSelectOpportunity: (opportunityId: string | null, label?: string | null) => void;
  onSelectCandidate: (candidateId: string) => void;
}

const STATUS_BADGE_STYLES: Record<OpportunityStatusLabel, string> = {
  Live: 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]',
  Closed: 'bg-[#F5F8FB] text-[#5B6B7F] border-[#E3E9F0]',
  Cancelled: 'bg-[#FBEAE9] text-[#C2413B] border-[#F4C5C2]',
};

export function AdminPlacementOpportunitiesView({
  selectedOpportunityId,
  onSelectOpportunity,
  onSelectCandidate,
}: AdminPlacementOpportunitiesViewProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [responses, setResponses] = useState<OpportunityResponse[]>([]);
  const [creatorsById, setCreatorsById] = useState<Map<string, string>>(
    () => new Map(),
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OpportunityStatusLabel>(
    'all',
  );

  const [cancelTarget, setCancelTarget] = useState<Opportunity | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const loadData = useCallback(async (showSkeleton = true) => {
    const client = supabase;
    if (!client) return;

    if (showSkeleton) setLoading(true);
    else setRefreshing(true);
    setError(null);

    const [oppsRes, respRes, profRes] = await Promise.all([
      client
        .from('opportunities')
        .select(
          'id, company, job_title, description, jd_path, package_min_lakhs, package_max_lakhs, cancelled, created_at, created_by',
        )
        .order('created_at', { ascending: false }),
      client
        .from('v_opportunity_responses')
        .select(
          'recipient_id, opportunity_id, company, job_title, candidate_id, candidate_code, full_name, email, phone, module, stage, sent_at, expires_at, response, responded_at, pipeline_stage, stage_note, stage_updated_at, response_state',
        )
        .order('sent_at', { ascending: false }),
      client.from('profiles').select('id, full_name, email'),
    ]);

    const firstErr = oppsRes.error || respRes.error;
    if (firstErr) {
      setError(formatDbError(firstErr));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const nameMap = new Map<string, string>();
    if (!profRes.error && profRes.data) {
      for (const p of profRes.data as Array<
        Pick<Profile, 'id' | 'full_name' | 'email'>
      >) {
        nameMap.set(p.id, p.full_name || p.email || 'Staff');
      }
    }

    setOpportunities((oppsRes.data as Opportunity[]) ?? []);
    setResponses((respRes.data as OpportunityResponse[]) ?? []);
    setCreatorsById(nameMap);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  const responsesByOpportunity = useMemo(() => {
    const map = new Map<string, OpportunityResponse[]>();
    for (const r of responses) {
      const list = map.get(r.opportunity_id) ?? [];
      list.push(r);
      map.set(r.opportunity_id, list);
    }
    return map;
  }, [responses]);

  const cancelOpportunityById = async (opp: Opportunity) => {
    const client = supabase;
    if (!client) return;

    setCancelling(true);
    setFeedback(null);

    const { error: updateErr } = await client
      .from('opportunities')
      .update({ cancelled: true })
      .eq('id', opp.id);

    setCancelling(false);

    if (updateErr) {
      setFeedback({ type: 'error', message: formatDbError(updateErr) });
      return;
    }

    setFeedback({
      type: 'success',
      message: `Cancelled opportunity: ${opp.company} — ${opp.job_title}.`,
    });
    await loadData(false);
  };

  const filteredOpportunities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return opportunities.filter((opp) => {
      const oppResponses = responsesByOpportunity.get(opp.id) ?? [];
      const status = computeOpportunityStatus(opp, oppResponses);
      if (statusFilter !== 'all' && status !== statusFilter) return false;

      if (q) {
        const creator = (
          opp.created_by ? creatorsById.get(opp.created_by) ?? '' : ''
        ).toLowerCase();
        const matches =
          opp.company.toLowerCase().includes(q) ||
          opp.job_title.toLowerCase().includes(q) ||
          creator.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [
    opportunities,
    responsesByOpportunity,
    statusFilter,
    searchQuery,
    creatorsById,
  ]);

  if (loading) {
    return <TableSkeleton rows={6} columns={7} />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load placement opportunities"
        message={error}
        onRetry={() => void loadData(true)}
      />
    );
  }

  const selectedOpp = selectedOpportunityId
    ? opportunities.find((o) => o.id === selectedOpportunityId) ?? null
    : null;

  if (selectedOpp) {
    const creatorName = selectedOpp.created_by
      ? creatorsById.get(selectedOpp.created_by) ?? null
      : null;

    return (
      <PlacementOpportunityDetailView
        opportunity={selectedOpp}
        responses={responsesByOpportunity.get(selectedOpp.id) ?? []}
        backLabel="Back to Placement"
        allowAddCandidates={false}
        allowExportBundle={false}
        createdByName={creatorName}
        onCancelOpportunity={() => cancelOpportunityById(selectedOpp)}
        onSelectCandidate={onSelectCandidate}
        onBack={() => onSelectOpportunity(null, null)}
        onRefresh={() => loadData(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold font-display text-[#0B1F3A] tracking-tight leading-tight">
            Placement
          </h1>
          <p className="mt-1 text-sm text-[#5B6B7F]">
            All job opportunities across the placement team, candidate responses, and hiring pipeline stages.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData(false)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors self-start sm:self-auto shrink-0 disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-[#0FA3A3] ${refreshing ? 'animate-spin' : ''}`}
          />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#5B6B7F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search opportunities"
            placeholder="Search by company, job title, or creator…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
          />
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="admin-opp-status-filter"
            className="text-xs font-medium text-[#5B6B7F]"
          >
            Status:
          </label>
          <select
            id="admin-opp-status-filter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | OpportunityStatusLabel)
            }
            className="px-3 py-2 text-xs font-medium bg-white border border-[#E3E9F0] rounded-lg"
          >
            <option value="all">All ({opportunities.length})</option>
            <option value="Live">Live</option>
            <option value="Closed">Closed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`p-3.5 rounded-xl text-xs border ${
            feedback.type === 'error'
              ? 'bg-[#FBEAE9] border-[#F4C5C2] text-[#C2413B]'
              : 'bg-[#E7F6EF] border-[#BCE8D3] text-[#1F9D6B]'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {filteredOpportunities.length === 0 ? (
        <EmptyState
          title="No opportunities found"
          description={
            opportunities.length === 0
              ? 'Placement team members have not created any job opportunities yet.'
              : 'No opportunities match your current search or status filter.'
          }
        />
      ) : (
        <div className="bg-white border border-[#E3E9F0] rounded-xl shadow-soft overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#F5F8FB] border-b border-[#E3E9F0]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Job title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Created by
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Created date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#5B6B7F]">
                    Sent
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#5B6B7F]">
                    Interested
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#5B6B7F]">
                    Not interested
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#5B6B7F]">
                    No response
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#5B6B7F]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E9F0]">
                {filteredOpportunities.map((opp) => {
                  const oppResponses = responsesByOpportunity.get(opp.id) ?? [];
                  const counts = computeOpportunityCounts(oppResponses);
                  const status = computeOpportunityStatus(opp, oppResponses);
                  const creatorName = opp.created_by
                    ? creatorsById.get(opp.created_by) ?? '—'
                    : '—';
                  const noResponseAndWaiting = counts.noResponse + counts.waiting;

                  return (
                    <tr
                      key={opp.id}
                      onClick={() =>
                        onSelectOpportunity(
                          opp.id,
                          `${opp.company} — ${opp.job_title}`,
                        )
                      }
                      className="cursor-pointer hover:bg-[#F5F8FB] transition-colors"
                    >
                      <td className="px-4 py-3.5 font-semibold text-[#0B1F3A]">
                        {opp.company}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-[#0B1F3A]">
                          {opp.job_title}
                        </p>
                        <p className="text-xs text-[#5B6B7F] mt-0.5">
                          {formatPackageRangeInr(
                            opp.package_min_lakhs,
                            opp.package_max_lakhs,
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#5B6B7F]">
                        {creatorName}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-[#5B6B7F] tabular-nums whitespace-nowrap">
                        {formatDate(opp.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-[#0B1F3A] tabular-nums">
                        {counts.sent}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-[#1F9D6B] tabular-nums">
                        {counts.interested}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-[#5B6B7F] tabular-nums">
                        {counts.notInterested}
                      </td>
                      <td
                        className="px-4 py-3.5 text-right font-mono text-[#C98A0B] tabular-nums"
                        title={
                          counts.waiting > 0
                            ? `${counts.noResponse} expired no-response, ${counts.waiting} waiting`
                            : undefined
                        }
                      >
                        {noResponseAndWaiting}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2.5 py-0.5 text-xs font-semibold border rounded-md ${STATUS_BADGE_STYLES[status]}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!opp.cancelled && (
                          <button
                            type="button"
                            onClick={() => setCancelTarget(opp)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#C2413B] bg-white border border-[#F4C5C2] rounded-lg hover:bg-[#FBEAE9] transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden divide-y divide-[#E3E9F0]">
            {filteredOpportunities.map((opp) => {
              const oppResponses = responsesByOpportunity.get(opp.id) ?? [];
              const counts = computeOpportunityCounts(oppResponses);
              const status = computeOpportunityStatus(opp, oppResponses);
              const creatorName = opp.created_by
                ? creatorsById.get(opp.created_by) ?? '—'
                : '—';
              const noResponseAndWaiting = counts.noResponse + counts.waiting;

              return (
                <div
                  key={opp.id}
                  onClick={() =>
                    onSelectOpportunity(
                      opp.id,
                      `${opp.company} — ${opp.job_title}`,
                    )
                  }
                  className="p-4 space-y-2.5 cursor-pointer hover:bg-[#F5F8FB]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#0B1F3A] truncate">
                        {opp.company}
                      </p>
                      <p className="text-xs text-[#5B6B7F] truncate">
                        {opp.job_title}
                      </p>
                      <p className="text-[11px] text-[#5B6B7F] mt-0.5">
                        By {creatorName}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md shrink-0 ${STATUS_BADGE_STYLES[status]}`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] bg-[#F5F8FB] p-2 rounded-lg border border-[#E3E9F0]">
                    <div>
                      <span className="text-[#5B6B7F] block">Sent</span>
                      <span className="font-mono font-semibold text-[#0B1F3A] tabular-nums">
                        {counts.sent}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5B6B7F] block">Interested</span>
                      <span className="font-mono font-semibold text-[#1F9D6B] tabular-nums">
                        {counts.interested}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5B6B7F] block">No</span>
                      <span className="font-mono font-semibold text-[#5B6B7F] tabular-nums">
                        {counts.notInterested}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5B6B7F] block">No resp.</span>
                      <span className="font-mono font-semibold text-[#C98A0B] tabular-nums">
                        {noResponseAndWaiting}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#5B6B7F]">
                    <span className="font-mono tabular-nums">
                      Created {formatDate(opp.created_at)}
                    </span>
                    {!opp.cancelled && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancelTarget(opp);
                        }}
                        className="text-xs font-medium text-[#C2413B] hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this opportunity?"
        message={
          cancelTarget
            ? `Are you sure you want to cancel "${cancelTarget.company} — ${cancelTarget.job_title}"? Candidates will no longer see it as live.`
            : ''
        }
        confirmLabel="Cancel Opportunity"
        loading={cancelling}
        onClose={() => !cancelling && setCancelTarget(null)}
        onConfirm={async () => {
          if (!cancelTarget) return;
          const target = cancelTarget;
          setCancelTarget(null);
          await cancelOpportunityById(target);
        }}
      />
    </div>
  );
}
