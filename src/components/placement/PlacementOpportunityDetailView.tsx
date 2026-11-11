import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  Download,
  Eye,
  FileText,
  UserPlus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  CandidateProfileFull,
  Opportunity,
  OpportunityPipelineStage,
  OpportunityResponse,
  OpportunityResponseState,
} from '../../types/database';
import {
  OPPORTUNITY_FILES_BUCKET,
  OPPORTUNITY_VISIBILITY_HOURS,
  type OpportunityVisibilityHours,
  PIPELINE_STAGE_OPTIONS,
  RESPONSE_STATE_OPTIONS,
  buildSendOpportunityFeedback,
  computeOpportunityStatus,
  formatCandidateStatusLabel,
  formatDate,
  formatDbError,
  formatPackageRangeInr,
  formatPipelineStageLabel,
  formatTicketDateTime,
  formatTimeLeft,
} from '../../utils/domain';
import {
  type BundleExportProgress,
  exportInterestedCandidatesBundle,
} from '../../utils/placementExport';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DocumentPreviewModal } from '../ui/DocumentWidgets';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/States';

interface PlacementOpportunityDetailViewProps {
  opportunity: Opportunity;
  responses: OpportunityResponse[];
  allCandidates?: CandidateProfileFull[];
  backLabel?: string;
  allowAddCandidates?: boolean;
  allowExportBundle?: boolean;
  createdByName?: string | null;
  onCancelOpportunity?: () => Promise<void> | void;
  onSelectCandidate?: (candidateId: string) => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

const RESPONSE_BADGE_STYLES: Record<OpportunityResponseState, string> = {
  interested: 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]',
  not_interested: 'bg-slate-100 text-slate-600 border-slate-300',
  waiting: 'bg-[#E8F0FA] text-[#2F6FB0] border-[#BFD7F2]',
  no_response: 'bg-[#FDF4E0] text-[#C98A0B] border-[#F6DEAA]',
};

function ResponseRowPipelineEditor({
  row,
  onSaved,
}: {
  row: OpportunityResponse;
  onSaved: (msg: string) => void;
}) {
  const [stage, setStage] = useState<string>(row.pipeline_stage ?? '');
  const [note, setNote] = useState<string>(row.stage_note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    stage !== (row.pipeline_stage ?? '') ||
    note.trim() !== (row.stage_note ?? '').trim();

  const handleSave = async (nextStage?: string) => {
    const client = supabase;
    if (!client) return;
    const chosenStage = nextStage ?? stage;
    if (!chosenStage) {
      setError('Choose a pipeline stage first.');
      return;
    }

    setSaving(true);
    setError(null);

    const { error: rpcErr } = await client.rpc('set_pipeline_stage', {
      p_recipient: row.recipient_id,
      p_stage: chosenStage,
      p_note: note.trim() || null,
    });

    setSaving(false);

    if (rpcErr) {
      setError(formatDbError(rpcErr));
      return;
    }

    onSaved(
      `Updated ${row.full_name} to ${formatPipelineStageLabel(chosenStage)}.`,
    );
  };

  return (
    <div className="space-y-1.5 min-w-[260px]">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Pipeline stage for ${row.full_name}`}
          value={stage}
          disabled={saving}
          onChange={(e) => {
            const val = e.target.value;
            setStage(val);
            if (error) setError(null);
            if (val && val !== (row.pipeline_stage ?? '')) {
              void handleSave(val);
            }
          }}
          className="px-2.5 py-1.5 text-xs font-medium bg-white border border-[#E3E9F0] rounded-lg"
        >
          <option value="">Select stage…</option>
          {PIPELINE_STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          aria-label={`Stage note for ${row.full_name}`}
          placeholder="Optional note…"
          value={note}
          disabled={saving}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError(null);
          }}
          className="flex-1 min-w-[120px] px-2.5 py-1.5 text-xs bg-white border border-[#E3E9F0] rounded-lg"
        />

        {isDirty && stage && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg disabled:opacity-50"
          >
            <Check className="w-3 h-3 text-[#0FA3A3]" />
            Save
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-[#C2413B]">
          {error}
        </p>
      )}
    </div>
  );
}

export function PlacementOpportunityDetailView({
  opportunity,
  responses,
  allCandidates = [],
  backLabel = 'Back to Opportunities',
  allowAddCandidates = true,
  allowExportBundle = true,
  createdByName = null,
  onCancelOpportunity,
  onSelectCandidate,
  onBack,
  onRefresh,
}: PlacementOpportunityDetailViewProps) {
  const [responseFilter, setResponseFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [previewJdOpen, setPreviewJdOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancellingOpp, setCancellingOpp] = useState(false);

  // Add candidates modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addSelectedIds, setAddSelectedIds] = useState<string[]>([]);
  const [addHours, setAddHours] = useState<OpportunityVisibilityHours>(24);
  const [addingSending, setAddingSending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Banner feedback
  const [banner, setBanner] = useState<{
    type: 'error' | 'success';
    primary: string;
    detail?: string | null;
  } | null>(null);

  // One-click download bundle state
  const [downloadStageFilter, setDownloadStageFilter] = useState<string>('all');
  const [exportProgress, setExportProgress] =
    useState<BundleExportProgress | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const oppStatus = computeOpportunityStatus(opportunity, responses);

  const interestedResponses = useMemo(
    () => responses.filter((r) => r.response_state === 'interested'),
    [responses],
  );

  const stageCounts = useMemo(() => {
    const counts: Record<OpportunityPipelineStage, number> = {
      shortlisted: 0,
      interview: 0,
      selected: 0,
      offer_made: 0,
      joined: 0,
      rejected: 0,
    };
    let unassigned = 0;
    for (const r of interestedResponses) {
      if (r.pipeline_stage && r.pipeline_stage in counts) {
        counts[r.pipeline_stage] += 1;
      } else {
        unassigned += 1;
      }
    }
    return { counts, unassigned };
  }, [interestedResponses]);

  const filteredResponses = useMemo(() => {
    return responses.filter((r) => {
      if (responseFilter !== 'all' && r.response_state !== responseFilter) {
        return false;
      }
      if (stageFilter === 'unassigned') {
        if (r.response_state !== 'interested' || r.pipeline_stage) return false;
      } else if (stageFilter !== 'all') {
        if (r.pipeline_stage !== stageFilter) return false;
      }
      return true;
    });
  }, [responses, responseFilter, stageFilter]);

  const existingCandidateIds = useMemo(
    () => new Set(responses.map((r) => r.candidate_id)),
    [responses],
  );

  const addCandidateChoices = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return allCandidates.filter((c) => {
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        c.candidate_code.toLowerCase().includes(q) ||
        (c.module ?? '').toLowerCase().includes(q)
      );
    });
  }, [allCandidates, addSearch]);

  const handleOpenAddModal = () => {
    setAddSearch('');
    setAddSelectedIds([]);
    setAddHours(24);
    setAddError(null);
    setAddModalOpen(true);
  };

  const handleSubmitAddCandidates = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    if (addSelectedIds.length === 0) {
      setAddError('Select at least one candidate to send to.');
      return;
    }

    setAddingSending(true);
    setAddError(null);

    const { data: sentCountData, error: rpcErr } = await client.rpc(
      'send_opportunity',
      {
        p_opportunity: opportunity.id,
        p_candidates: addSelectedIds,
        p_hours: addHours,
      },
    );

    setAddingSending(false);

    if (rpcErr) {
      setAddError(formatDbError(rpcErr));
      return;
    }

    const sentCount =
      typeof sentCountData === 'number'
        ? sentCountData
        : Number(sentCountData ?? 0);
    const feedback = buildSendOpportunityFeedback(
      Number.isFinite(sentCount) ? sentCount : 0,
      addSelectedIds.length,
    );

    setAddModalOpen(false);
    setBanner({
      type: 'success',
      primary: feedback.primary,
      detail: feedback.skipped,
    });
    await onRefresh();
  };

  const handleDownloadInterestedBundle = async () => {
    const subset =
      downloadStageFilter === 'all'
        ? interestedResponses
        : downloadStageFilter === 'unassigned'
          ? interestedResponses.filter((r) => !r.pipeline_stage)
          : interestedResponses.filter(
              (r) => r.pipeline_stage === downloadStageFilter,
            );

    if (subset.length === 0) {
      setExportError(
        'No interested candidates match the selected pipeline stage filter.',
      );
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const result = await exportInterestedCandidatesBundle({
        company: opportunity.company,
        responses: subset,
        profiles: allCandidates,
        onProgress: setExportProgress,
      });
      setBanner({
        type: 'success',
        primary: `Downloaded ${result.excelFilename} and ${result.zipFilename}`,
      });
    } catch (err) {
      setExportError(formatDbError(err));
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5B6B7F] hover:text-[#0B1F3A] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </button>

      {/* Opportunity Header Card */}
      <section className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#0B7C7C]">
                {opportunity.company}
              </span>
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold border rounded-md ${
                  oppStatus === 'Live'
                    ? 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]'
                    : oppStatus === 'Cancelled'
                      ? 'bg-[#FBEAE9] text-[#C2413B] border-[#F4C5C2]'
                      : 'bg-[#F5F8FB] text-[#5B6B7F] border-[#E3E9F0]'
                }`}
              >
                {oppStatus}
              </span>
            </div>

            <h1 className="text-2xl font-bold font-display text-[#0B1F3A] tracking-tight">
              {opportunity.job_title}
            </h1>

            <p className="text-sm font-medium text-[#0B1F3A]">
              {formatPackageRangeInr(
                opportunity.package_min_lakhs,
                opportunity.package_max_lakhs,
              )}
            </p>

            {(createdByName || opportunity.created_at) && (
              <p className="text-xs text-[#5B6B7F]">
                {createdByName ? (
                  <>
                    Created by <strong className="font-medium text-[#0B1F3A]">{createdByName}</strong>
                  </>
                ) : (
                  'Created'
                )}
                {opportunity.created_at && (
                  <>
                    {' '}on{' '}
                    <span className="font-mono tabular-nums">
                      {formatDate(opportunity.created_at)}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {opportunity.jd_path && (
              <button
                type="button"
                onClick={() => setPreviewJdOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors"
              >
                <Eye className="w-3.5 h-3.5 text-[#0FA3A3]" />
                View JD
              </button>
            )}

            {allowAddCandidates && !opportunity.cancelled && (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5 text-[#0FA3A3]" />
                Add candidates
              </button>
            )}

            {onCancelOpportunity && !opportunity.cancelled && (
              <button
                type="button"
                onClick={() => setConfirmCancelOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#C2413B] bg-white border border-[#F4C5C2] rounded-lg hover:bg-[#FBEAE9] transition-colors"
              >
                <Ban className="w-3.5 h-3.5" />
                Cancel opportunity
              </button>
            )}
          </div>
        </div>

        {opportunity.description && (
          <div className="p-4 bg-[#F5F8FB] border border-[#E3E9F0] rounded-xl text-xs text-[#0F1B2D] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {opportunity.description}
          </div>
        )}

        {/* One-Click Download Bar */}
        {allowExportBundle && (
          <>
            <div className="pt-4 border-t border-[#E3E9F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <label
              htmlFor="download-stage-filter"
              className="text-xs font-medium text-[#5B6B7F]"
            >
              Export stage:
            </label>
            <select
              id="download-stage-filter"
              value={downloadStageFilter}
              disabled={exporting || interestedResponses.length === 0}
              onChange={(e) => {
                setDownloadStageFilter(e.target.value);
                if (exportError) setExportError(null);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-[#E3E9F0] rounded-lg"
            >
              <option value="all">
                All interested ({interestedResponses.length})
              </option>
              <option value="unassigned">
                No stage ({stageCounts.unassigned})
              </option>
              {PIPELINE_STAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({stageCounts.counts[opt.value]})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={exporting || interestedResponses.length === 0}
            onClick={() => void handleDownloadInterestedBundle()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors disabled:opacity-45 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#0FA3A3]" />
            {exporting
              ? 'Generating Excel & PDFs…'
              : "Download interested candidates' details"}
          </button>
        </div>

        {exportProgress && (
          <div className="p-3 bg-[#E6F6F6] border border-[#0FA3A3]/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#0B7C7C]">
              <span>{exportProgress.stageLabel}</span>
              <span className="font-mono tabular-nums">
                {Math.round(
                  (exportProgress.completed / Math.max(exportProgress.total, 1)) *
                    100,
                )}
                %
              </span>
            </div>
            <div className="h-1.5 bg-white rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0FA3A3] transition-all duration-200"
                style={{
                  width: `${Math.round(
                    (exportProgress.completed /
                      Math.max(exportProgress.total, 1)) *
                      100,
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {exportError && (
          <div
            role="alert"
            className="p-3 bg-[#FBEAE9] border border-[#F4C5C2] rounded-lg text-xs text-[#C2413B]"
          >
            {exportError}
          </div>
        )}
        </>
        )}
      </section>

      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          className={`p-3.5 rounded-xl border text-xs space-y-1 ${
            banner.type === 'error'
              ? 'bg-[#FBEAE9] border-[#F4C5C2] text-[#C2413B]'
              : 'bg-[#E7F6EF] border-[#BCE8D3] text-[#1F9D6B]'
          }`}
        >
          <p className="font-semibold">{banner.primary}</p>
          {banner.detail && (
            <p className="text-[#C98A0B] font-medium">{banner.detail}</p>
          )}
        </div>
      )}

      {/* Pipeline Stage Count Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2.5 py-1 text-xs font-medium bg-white border border-[#E3E9F0] rounded-lg text-[#0B1F3A]">
          No stage: <strong className="font-mono">{stageCounts.unassigned}</strong>
        </span>
        {PIPELINE_STAGE_OPTIONS.map((opt) => (
          <span
            key={opt.value}
            className="px-2.5 py-1 text-xs font-medium bg-white border border-[#E3E9F0] rounded-lg text-[#0B1F3A]"
          >
            {opt.label}:{' '}
            <strong className="font-mono">{stageCounts.counts[opt.value]}</strong>
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="p-4 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="resp-state-filter"
            className="text-xs font-medium text-[#5B6B7F]"
          >
            Response:
          </label>
          <select
            id="resp-state-filter"
            value={responseFilter}
            onChange={(e) => setResponseFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-[#E3E9F0] rounded-lg"
          >
            <option value="all">All ({responses.length})</option>
            {RESPONSE_STATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="resp-stage-filter"
            className="text-xs font-medium text-[#5B6B7F]"
          >
            Pipeline stage:
          </label>
          <select
            id="resp-stage-filter"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-[#E3E9F0] rounded-lg"
          >
            <option value="all">All stages</option>
            <option value="unassigned">No stage (Interested)</option>
            {PIPELINE_STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Responses Table */}
      {filteredResponses.length === 0 ? (
        <EmptyState
          title="No responses match your filters"
          description="Try resetting the response state or pipeline stage filters."
        />
      ) : (
        <div className="bg-white border border-[#E3E9F0] rounded-xl shadow-soft overflow-hidden">
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#F5F8FB] border-b border-[#E3E9F0]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Candidate
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Module
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Response
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Responded
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Pipeline Stage &amp; Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E9F0]">
                {filteredResponses.map((row) => (
                  <tr key={row.recipient_id} className="hover:bg-[#F5F8FB]">
                    <td className="px-4 py-3.5">
                      {onSelectCandidate ? (
                        <button
                          type="button"
                          onClick={() => onSelectCandidate(row.candidate_id)}
                          className="text-left group"
                        >
                          <p className="font-semibold text-[#0B1F3A] group-hover:text-[#0B7C7C] group-hover:underline">
                            {row.full_name}
                          </p>
                          <p className="font-mono text-xs text-[#0B7C7C] tabular-nums">
                            {row.candidate_code}
                          </p>
                        </button>
                      ) : (
                        <>
                          <p className="font-semibold text-[#0B1F3A]">
                            {row.full_name}
                          </p>
                          <p className="font-mono text-xs text-[#0B7C7C] tabular-nums">
                            {row.candidate_code}
                          </p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5B6B7F]">
                      {row.module || '—'}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold border rounded-md ${
                          RESPONSE_BADGE_STYLES[row.response_state]
                        }`}
                      >
                        {row.response_state === 'interested'
                          ? 'Interested'
                          : row.response_state === 'not_interested'
                            ? 'Not interested'
                            : row.response_state === 'waiting'
                              ? `Waiting · ${formatTimeLeft(row.expires_at)}`
                              : 'No response'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-[#5B6B7F] tabular-nums whitespace-nowrap">
                      {row.responded_at
                        ? formatTicketDateTime(row.responded_at)
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      {row.response_state === 'interested' ? (
                        <ResponseRowPipelineEditor
                          row={row}
                          onSaved={(msg) => {
                            setBanner({ type: 'success', primary: msg });
                            void onRefresh();
                          }}
                        />
                      ) : (
                        <span className="text-xs text-[#5B6B7F]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="lg:hidden divide-y divide-[#E3E9F0]">
            {filteredResponses.map((row) => (
              <div key={row.recipient_id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-[#0B1F3A]">
                      {row.full_name}
                    </p>
                    <p className="font-mono text-xs text-[#0B7C7C] tabular-nums">
                      {row.candidate_code} · {row.module || '—'}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md shrink-0 ${
                      RESPONSE_BADGE_STYLES[row.response_state]
                    }`}
                  >
                    {row.response_state === 'interested'
                      ? 'Interested'
                      : row.response_state === 'not_interested'
                        ? 'Not interested'
                        : row.response_state === 'waiting'
                          ? `Waiting (${formatTimeLeft(row.expires_at)})`
                          : 'No response'}
                  </span>
                </div>

                {row.responded_at && (
                  <p className="font-mono text-[11px] text-[#5B6B7F] tabular-nums">
                    Responded: {formatTicketDateTime(row.responded_at)}
                  </p>
                )}

                {row.response_state === 'interested' && (
                  <ResponseRowPipelineEditor
                    row={row}
                    onSaved={(msg) => {
                      setBanner({ type: 'success', primary: msg });
                      void onRefresh();
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* JD Preview Modal (bucket: opportunity-files) */}
      <DocumentPreviewModal
        open={previewJdOpen}
        storagePath={opportunity.jd_path}
        bucketName={OPPORTUNITY_FILES_BUCKET}
        title={`JD — ${opportunity.company} (${opportunity.job_title})`}
        onClose={() => setPreviewJdOpen(false)}
      />

      {/* Add Candidates Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => !addingSending && setAddModalOpen(false)}
        title="Add Candidates to Opportunity"
        description="Send this opening to additional candidates. Candidates who have already answered are unaffected."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSubmitAddCandidates} className="space-y-4">
          {addError && (
            <div
              role="alert"
              className="p-3 bg-[#FBEAE9] border border-[#F4C5C2] rounded-lg text-xs text-[#C2413B]"
            >
              {addError}
            </div>
          )}

          <div>
            <label
              htmlFor="add-cand-hours"
              className="block text-xs font-medium text-[#0B1F3A] mb-1"
            >
              Visible to added candidates for
            </label>
            <select
              id="add-cand-hours"
              value={addHours}
              onChange={(e) =>
                setAddHours(Number(e.target.value) as OpportunityVisibilityHours)
              }
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
            >
              {OPPORTUNITY_VISIBILITY_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </select>
          </div>

          <div>
            <input
              type="search"
              placeholder="Search candidates by name, code, or module…"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg mb-2"
            />

            <div className="max-h-60 overflow-y-auto divide-y divide-[#E3E9F0] border border-[#E3E9F0] rounded-lg">
              {addCandidateChoices.map((cand) => {
                const alreadySent = existingCandidateIds.has(cand.candidate_id);
                const checked = addSelectedIds.includes(cand.candidate_id);
                return (
                  <label
                    key={cand.candidate_id}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-[#F5F8FB] cursor-pointer"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setAddSelectedIds((prev) =>
                            checked
                              ? prev.filter((id) => id !== cand.candidate_id)
                              : [...prev, cand.candidate_id],
                          );
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-[#0FA3A3] focus:ring-[#0FA3A3]"
                      />
                      <span className="truncate">
                        <span className="font-mono font-semibold text-[#0B7C7C]">
                          {cand.candidate_code}
                        </span>{' '}
                        · {cand.full_name}
                      </span>
                    </span>
                    <span className="text-[11px] text-[#5B6B7F] shrink-0">
                      {cand.module || '—'} ·{' '}
                      {alreadySent
                        ? 'Already sent'
                        : formatCandidateStatusLabel(cand.stage)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              disabled={addingSending}
              className="px-4 py-2 text-sm font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingSending || addSelectedIds.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5 text-[#0FA3A3]" />
              {addingSending
                ? 'Sending…'
                : `Send (${addSelectedIds.length})`}
            </button>
          </div>
        </form>
      </Modal>

      {onCancelOpportunity && (
        <ConfirmDialog
          open={confirmCancelOpen}
          title="Cancel this opportunity?"
          message={`Are you sure you want to cancel "${opportunity.company} — ${opportunity.job_title}"? Candidates will no longer see it as live.`}
          confirmLabel="Cancel Opportunity"
          loading={cancellingOpp}
          onClose={() => !cancellingOpp && setConfirmCancelOpen(false)}
          onConfirm={async () => {
            setCancellingOpp(true);
            await onCancelOpportunity();
            setCancellingOpp(false);
            setConfirmCancelOpen(false);
          }}
        />
      )}
    </div>
  );
}
