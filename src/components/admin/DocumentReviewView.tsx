import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  DocTypeValue,
  PendingDocumentWithCandidate,
  SortDirection,
} from '../../types/database';
import {
  DOC_TYPE_LABELS,
  buildDocumentApprovePayload,
  buildDocumentRejectPayload,
  extractJoinedCandidate,
  filterAndSortRows,
  formatDateTime,
  formatDbError,
} from '../../utils/domain';
import {
  DocumentPreviewModal,
  DocumentStatusBadge,
  RejectDocumentModal,
} from '../ui/DocumentWidgets';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';

interface DocumentReviewViewProps {
  adminUserId: string;
  onSelectCandidate: (candidateId: string) => void;
}

type SortField = 'uploaded_at' | 'candidate_code' | 'full_name' | 'doc_type';

export function DocumentReviewView({
  adminUserId,
  onSelectCandidate,
}: DocumentReviewViewProps) {
  const [rows, setRows] = useState<PendingDocumentWithCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | DocTypeValue>('all');
  const [sortField, setSortField] = useState<SortField>('uploaded_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [approvingDocId, setApprovingDocId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] =
    useState<PendingDocumentWithCandidate | null>(null);
  const [rejectTarget, setRejectTarget] =
    useState<PendingDocumentWithCandidate | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const loadPendingDocuments = useCallback(async (showSkeleton = true) => {
    const client = supabase;
    if (!client) return;

    if (showSkeleton) setLoading(true);
    setError(null);

    const { data, error: queryErr } = await client
      .from('documents')
      .select(
        'id, candidate_id, doc_type, storage_path, status, review_note, reviewed_by, reviewed_at, uploaded_at, candidates(full_name, candidate_code)',
      )
      .eq('status', 'pending')
      .order('uploaded_at', { ascending: false });

    if (queryErr) {
      setError(formatDbError(queryErr));
      setLoading(false);
      return;
    }

    setRows((data as unknown as PendingDocumentWithCandidate[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPendingDocuments(true);
  }, [loadPendingDocuments]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'uploaded_at' ? 'desc' : 'asc');
    }
  };

  const visibleRows = useMemo(() => {
    const typeFiltered =
      docTypeFilter === 'all'
        ? rows
        : rows.filter((r) => r.doc_type === docTypeFilter);

    return filterAndSortRows(
      typeFiltered,
      searchQuery,
      (row) => {
        const cand = extractJoinedCandidate(row);
        return [
          cand?.candidate_code,
          cand?.full_name,
          DOC_TYPE_LABELS[row.doc_type],
          row.doc_type,
        ];
      },
      (row) => {
        const cand = extractJoinedCandidate(row);
        switch (sortField) {
          case 'candidate_code':
            return cand?.candidate_code ?? '';
          case 'full_name':
            return cand?.full_name ?? '';
          case 'doc_type':
            return DOC_TYPE_LABELS[row.doc_type];
          case 'uploaded_at':
          default:
            return row.uploaded_at ?? '';
        }
      },
      sortDirection,
    );
  }, [rows, docTypeFilter, searchQuery, sortField, sortDirection]);

  const handleApprove = async (doc: PendingDocumentWithCandidate) => {
    const client = supabase;
    if (!client) return;

    setApprovingDocId(doc.id);
    setActionError(null);
    setActionSuccess(null);

    const payload = buildDocumentApprovePayload(adminUserId);
    const { error: updateErr } = await client
      .from('documents')
      .update(payload)
      .eq('id', doc.id);

    setApprovingDocId(null);

    if (updateErr) {
      setActionError(formatDbError(updateErr));
      return;
    }

    const cand = extractJoinedCandidate(doc);
    setActionSuccess(
      `Approved ${DOC_TYPE_LABELS[doc.doc_type]}${
        cand ? ` for ${cand.full_name} (${cand.candidate_code})` : ''
      }.`,
    );
    await loadPendingDocuments(false);
  };

  const handleConfirmReject = async (note: string) => {
    const client = supabase;
    if (!client || !rejectTarget) return;

    const built = buildDocumentRejectPayload(adminUserId, note);
    if (!built.ok) {
      setRejectError(built.error);
      return;
    }

    setRejectLoading(true);
    setRejectError(null);
    setActionError(null);
    setActionSuccess(null);

    const { error: updateErr } = await client
      .from('documents')
      .update(built.payload)
      .eq('id', rejectTarget.id);

    setRejectLoading(false);

    if (updateErr) {
      setRejectError(formatDbError(updateErr));
      return;
    }

    const cand = extractJoinedCandidate(rejectTarget);
    const docLabel = DOC_TYPE_LABELS[rejectTarget.doc_type];
    setRejectTarget(null);
    setActionSuccess(
      `Rejected ${docLabel}${
        cand ? ` for ${cand.full_name} (${cand.candidate_code})` : ''
      }.`,
    );
    await loadPendingDocuments(false);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-slate-700 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-slate-700 shrink-0" />
    );
  };

  const previewCandidate = previewDoc ? extractJoinedCandidate(previewDoc) : null;
  const rejectCandidate = rejectTarget ? extractJoinedCandidate(rejectTarget) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Document Review
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Verify pending onboarding submissions newest first. Signed file links expire after 60 seconds.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadPendingDocuments(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-start justify-between gap-3"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            className="text-red-600 hover:text-red-900 p-0.5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-start justify-between gap-3"
        >
          <span>{actionSuccess}</span>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            aria-label="Dismiss message"
            className="text-emerald-700 hover:text-emerald-950 p-0.5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by candidate name, code, or document…"
            aria-label="Search pending documents"
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="doc-type-filter" className="sr-only">
            Filter by document type
          </label>
          <select
            id="doc-type-filter"
            value={docTypeFilter}
            onChange={(e) =>
              setDocTypeFilter(e.target.value as 'all' | DocTypeValue)
            }
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:border-blue-600"
          >
            <option value="all">All document types</option>
            <option value="pan">PAN Card</option>
            <option value="photo_id">Photo / ID Proof</option>
            <option value="enrollment_form">Enrollment Form</option>
          </select>

          <span className="text-xs font-medium text-slate-500 whitespace-nowrap tabular-nums">
            {visibleRows.length} pending
          </span>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : error ? (
        <ErrorState
          title="Could not load pending documents"
          message={error}
          onRetry={() => void loadPendingDocuments(true)}
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title={
            rows.length === 0
              ? 'No documents awaiting review'
              : 'No matching pending documents'
          }
          description={
            rows.length === 0
              ? 'All submitted candidate onboarding documents have been reviewed.'
              : 'Try adjusting your search query or document type filter.'
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('candidate_code')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Candidate
                      {renderSortIcon('candidate_code')}
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('doc_type')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Document Type
                      {renderSortIcon('doc_type')}
                    </button>
                  </th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('uploaded_at')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Uploaded
                      {renderSortIcon('uploaded_at')}
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibleRows.map((doc) => {
                  const cand = extractJoinedCandidate(doc);
                  const isApproving = approvingDocId === doc.id;
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => onSelectCandidate(doc.candidate_id)}
                            className="font-semibold text-slate-900 hover:text-blue-700 text-left w-fit"
                          >
                            {cand?.full_name || 'Unknown Candidate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectCandidate(doc.candidate_id)}
                            className="font-mono text-xs text-blue-700 hover:underline tabular-nums text-left w-fit mt-0.5"
                          >
                            {cand?.candidate_code || '—'}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {DOC_TYPE_LABELS[doc.doc_type]}
                      </td>
                      <td className="py-3.5 px-4">
                        <DocumentStatusBadge status={doc.status} />
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateTime(doc.uploaded_at)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            aria-label={`View ${DOC_TYPE_LABELS[doc.doc_type]} for ${cand?.full_name ?? 'candidate'}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleApprove(doc)}
                            disabled={isApproving}
                            aria-label={`Approve ${DOC_TYPE_LABELS[doc.doc_type]} for ${cand?.full_name ?? 'candidate'}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {isApproving ? 'Approving…' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectError(null);
                              setRejectTarget(doc);
                            }}
                            disabled={isApproving}
                            aria-label={`Reject ${DOC_TYPE_LABELS[doc.doc_type]} for ${cand?.full_name ?? 'candidate'}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y divide-slate-200">
            {visibleRows.map((doc) => {
              const cand = extractJoinedCandidate(doc);
              const isApproving = approvingDocId === doc.id;
              return (
                <div key={doc.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectCandidate(doc.candidate_id)}
                        className="font-semibold text-sm text-slate-900 hover:text-blue-700 text-left block truncate"
                      >
                        {cand?.full_name || 'Unknown Candidate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectCandidate(doc.candidate_id)}
                        className="font-mono text-xs text-blue-700 hover:underline tabular-nums mt-0.5 block"
                      >
                        {cand?.candidate_code || '—'}
                      </button>
                    </div>
                    <DocumentStatusBadge status={doc.status} />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium text-slate-800">
                      {DOC_TYPE_LABELS[doc.doc_type]}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {formatDateTime(doc.uploaded_at)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApprove(doc)}
                      disabled={isApproving}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      {isApproving ? '…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectError(null);
                        setRejectTarget(doc);
                      }}
                      disabled={isApproving}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5 shrink-0" />
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <DocumentPreviewModal
        open={Boolean(previewDoc)}
        storagePath={previewDoc?.storage_path ?? null}
        title={
          previewDoc ? DOC_TYPE_LABELS[previewDoc.doc_type] : 'Document Preview'
        }
        subtitle={
          previewCandidate
            ? `${previewCandidate.full_name} (${previewCandidate.candidate_code})`
            : undefined
        }
        onClose={() => setPreviewDoc(null)}
      />

      <RejectDocumentModal
        open={Boolean(rejectTarget)}
        docTitle={
          rejectTarget ? DOC_TYPE_LABELS[rejectTarget.doc_type] : 'Document'
        }
        candidateLabel={
          rejectCandidate
            ? `${rejectCandidate.full_name} (${rejectCandidate.candidate_code})`
            : undefined
        }
        loading={rejectLoading}
        error={rejectError}
        onClose={() => {
          if (!rejectLoading) {
            setRejectTarget(null);
            setRejectError(null);
          }
        }}
        onSubmitReject={(note) => void handleConfirmReject(note)}
      />
    </div>
  );
}
