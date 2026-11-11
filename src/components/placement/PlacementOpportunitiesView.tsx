import { useMemo, useState } from 'react';
import { Ban, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Opportunity, OpportunityResponse } from '../../types/database';
import {
  type OpportunityStatusLabel,
  computeOpportunityCounts,
  computeOpportunityStatus,
  formatDate,
  formatDbError,
  formatPackageRangeInr,
} from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/States';

interface PlacementOpportunitiesViewProps {
  opportunities: Opportunity[];
  responses: OpportunityResponse[];
  onOpenOpportunity: (opportunityId: string) => void;
  onOpenNewOpportunity: () => void;
  onRefresh: () => Promise<void>;
}

const STATUS_BADGE_STYLES: Record<OpportunityStatusLabel, string> = {
  Live: 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]',
  Closed: 'bg-[#F5F8FB] text-[#5B6B7F] border-[#E3E9F0]',
  Cancelled: 'bg-[#FBEAE9] text-[#C2413B] border-[#F4C5C2]',
};

export function PlacementOpportunitiesView({
  opportunities,
  responses,
  onOpenOpportunity,
  onOpenNewOpportunity,
  onRefresh,
}: PlacementOpportunitiesViewProps) {
  const [cancelTarget, setCancelTarget] = useState<Opportunity | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const responsesByOpportunity = useMemo(() => {
    const map = new Map<string, OpportunityResponse[]>();
    for (const r of responses) {
      const list = map.get(r.opportunity_id) ?? [];
      list.push(r);
      map.set(r.opportunity_id, list);
    }
    return map;
  }, [responses]);

  const sortedOpportunities = useMemo(
    () =>
      [...opportunities].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [opportunities],
  );

  const handleConfirmCancel = async () => {
    const client = supabase;
    if (!client || !cancelTarget) return;

    setCancelling(true);
    setFeedback(null);

    const { error } = await client
      .from('opportunities')
      .update({ cancelled: true })
      .eq('id', cancelTarget.id);

    setCancelling(false);

    if (error) {
      setCancelTarget(null);
      setFeedback({ type: 'error', message: formatDbError(error) });
      return;
    }

    const label = `${cancelTarget.company} — ${cancelTarget.job_title}`;
    setCancelTarget(null);
    setFeedback({
      type: 'success',
      message: `Cancelled opportunity: ${label}.`,
    });
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold font-display text-[#0B1F3A] tracking-tight leading-tight">
            Opportunities
          </h1>
          <p className="mt-1 text-sm text-[#5B6B7F]">
            Manage job opportunities you created and monitor candidate response metrics.
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

      {sortedOpportunities.length === 0 ? (
        <EmptyState
          title="No opportunities created yet"
          description="Send a job opportunity to candidates from Candidates or by clicking New Opportunity."
          actionLabel="New Opportunity"
          onAction={onOpenNewOpportunity}
        />
      ) : (
        <div className="bg-white border border-[#E3E9F0] rounded-xl shadow-soft overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#F5F8FB] border-b border-[#E3E9F0]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Company &amp; Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Created
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
                    Waiting
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
                {sortedOpportunities.map((opp) => {
                  const oppResponses = responsesByOpportunity.get(opp.id) ?? [];
                  const counts = computeOpportunityCounts(oppResponses);
                  const status = computeOpportunityStatus(opp, oppResponses);

                  return (
                    <tr
                      key={opp.id}
                      onClick={() => onOpenOpportunity(opp.id)}
                      className="cursor-pointer hover:bg-[#F5F8FB] transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-[#0B1F3A]">
                          {opp.company}
                        </p>
                        <p className="text-xs text-[#5B6B7F] mt-0.5">
                          {opp.job_title} ·{' '}
                          {formatPackageRangeInr(
                            opp.package_min_lakhs,
                            opp.package_max_lakhs,
                          )}
                        </p>
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
                      <td className="px-4 py-3.5 text-right font-mono text-[#2F6FB0] tabular-nums">
                        {counts.waiting}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-[#C98A0B] tabular-nums">
                        {counts.noResponse}
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
            {sortedOpportunities.map((opp) => {
              const oppResponses = responsesByOpportunity.get(opp.id) ?? [];
              const counts = computeOpportunityCounts(oppResponses);
              const status = computeOpportunityStatus(opp, oppResponses);

              return (
                <div
                  key={opp.id}
                  onClick={() => onOpenOpportunity(opp.id)}
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
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md shrink-0 ${STATUS_BADGE_STYLES[status]}`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5 text-center text-[11px] bg-[#F5F8FB] p-2 rounded-lg border border-[#E3E9F0]">
                    <div>
                      <span className="text-[#5B6B7F] block">Sent</span>
                      <span className="font-mono font-semibold text-[#0B1F3A] tabular-nums">
                        {counts.sent}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5B6B7F] block">Int.</span>
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
                      <span className="text-[#5B6B7F] block">Wait</span>
                      <span className="font-mono font-semibold text-[#2F6FB0] tabular-nums">
                        {counts.waiting}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5B6B7F] block">Miss</span>
                      <span className="font-mono font-semibold text-[#C98A0B] tabular-nums">
                        {counts.noResponse}
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
                        Cancel opportunity
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
        onConfirm={() => void handleConfirmCancel()}
      />
    </div>
  );
}
