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
  PendingPaymentWithCandidate,
  SortDirection,
} from '../../types/database';
import {
  buildAdminPaymentDecisionPayload,
  extractJoinedCandidate,
  filterAndSortRows,
  formatDate,
  formatDateTime,
  formatDbError,
  formatInr,
} from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DocumentPreviewModal } from '../ui/DocumentWidgets';
import { PaymentStatusBadge } from '../ui/FeeWidgets';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';

interface PaymentsViewProps {
  adminUserId: string;
  onSelectCandidate: (candidateId: string) => void;
}

type SortField =
  | 'created_at'
  | 'candidate_code'
  | 'paid_on'
  | 'amount'
  | 'reference';

export function PaymentsView({
  adminUserId,
  onSelectCandidate,
}: PaymentsViewProps) {
  const [rows, setRows] = useState<PendingPaymentWithCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [previewPayment, setPreviewPayment] =
    useState<PendingPaymentWithCandidate | null>(null);
  const [rejectTarget, setRejectTarget] =
    useState<PendingPaymentWithCandidate | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const loadPendingPayments = useCallback(async (showSkeleton = true) => {
    const client = supabase;
    if (!client) return;

    if (showSkeleton) setLoading(true);
    setError(null);

    const { data, error: queryErr } = await client
      .from('payments')
      .select(
        'id, candidate_id, installment_id, amount, paid_on, reference, proof_path, status, confirmed_by, confirmed_at, created_at, candidates(full_name, candidate_code)',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (queryErr) {
      setError(formatDbError(queryErr));
      setLoading(false);
      return;
    }

    setRows((data as unknown as PendingPaymentWithCandidate[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPendingPayments(true);
  }, [loadPendingPayments]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(
        field === 'created_at' || field === 'paid_on' || field === 'amount'
          ? 'desc'
          : 'asc',
      );
    }
  };

  const visibleRows = useMemo(
    () =>
      filterAndSortRows(
        rows,
        searchQuery,
        (row) => {
          const cand = extractJoinedCandidate(row);
          return [
            cand?.full_name,
            cand?.candidate_code,
            row.reference,
            row.paid_on,
            formatInr(row.amount),
            String(row.amount),
          ];
        },
        (row) => {
          const cand = extractJoinedCandidate(row);
          switch (sortField) {
            case 'candidate_code':
              return cand?.candidate_code ?? '';
            case 'paid_on':
              return row.paid_on ?? '';
            case 'amount':
              return Number(row.amount ?? 0);
            case 'reference':
              return row.reference ?? '';
            case 'created_at':
            default:
              return row.created_at ?? row.paid_on ?? '';
          }
        },
        sortDirection,
      ),
    [rows, searchQuery, sortField, sortDirection],
  );

  const handleConfirm = async (payment: PendingPaymentWithCandidate) => {
    const client = supabase;
    if (!client) return;

    setConfirmingId(payment.id);
    setActionFeedback(null);

    const payload = buildAdminPaymentDecisionPayload(adminUserId, 'confirmed');
    const { error: updateErr } = await client
      .from('payments')
      .update(payload)
      .eq('id', payment.id);

    setConfirmingId(null);

    if (updateErr) {
      setActionFeedback({
        type: 'error',
        message: formatDbError(updateErr),
      });
      return;
    }

    const cand = extractJoinedCandidate(payment);
    setActionFeedback({
      type: 'success',
      message: `Confirmed payment of ${formatInr(payment.amount)}${
        cand ? ` for ${cand.full_name} (${cand.candidate_code})` : ''
      }.`,
    });
    await loadPendingPayments(false);
  };

  const handleConfirmReject = async () => {
    const client = supabase;
    if (!client || !rejectTarget) return;

    setRejecting(true);
    setActionFeedback(null);

    const payload = buildAdminPaymentDecisionPayload(adminUserId, 'rejected');
    const { error: updateErr } = await client
      .from('payments')
      .update(payload)
      .eq('id', rejectTarget.id);

    setRejecting(false);

    if (updateErr) {
      setRejectTarget(null);
      setActionFeedback({
        type: 'error',
        message: formatDbError(updateErr),
      });
      return;
    }

    const cand = extractJoinedCandidate(rejectTarget);
    const rejectedAmount = rejectTarget.amount;
    setRejectTarget(null);
    setActionFeedback({
      type: 'success',
      message: `Rejected payment of ${formatInr(rejectedAmount)}${
        cand ? ` for ${cand.full_name} (${cand.candidate_code})` : ''
      }.`,
    });
    await loadPendingPayments(false);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-slate-700 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-slate-700 shrink-0" />
    );
  };

  const previewCandidate = previewPayment
    ? extractJoinedCandidate(previewPayment)
    : null;
  const rejectCandidate = rejectTarget
    ? extractJoinedCandidate(rejectTarget)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Pending Payments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review submitted candidate payment proofs newest first and confirm
            or reject receipts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadPendingPayments(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {actionFeedback && (
        <div
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
          className={`p-4 rounded-xl text-sm flex items-start justify-between gap-3 ${
            actionFeedback.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            aria-label="Dismiss message"
            className="p-0.5 opacity-75 hover:opacity-100 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate name, code, reference, or amount…"
            aria-label="Search pending payments"
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>

        <span className="text-xs font-medium text-slate-500 whitespace-nowrap tabular-nums">
          {visibleRows.length} pending
        </span>
      </div>

      {loading ? (
        <TableSkeleton rows={5} columns={6} />
      ) : error ? (
        <ErrorState
          title="Could not load pending payments"
          message={error}
          onRetry={() => void loadPendingPayments(true)}
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title={
            rows.length === 0
              ? 'No pending payments to review'
              : 'No pending payments match your search'
          }
          description={
            rows.length === 0
              ? 'All submitted candidate payment proofs have been processed.'
              : 'Try clearing or adjusting your search query.'
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
                      onClick={() => handleSort('paid_on')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Paid On
                      {renderSortIcon('paid_on')}
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('amount')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Amount
                      {renderSortIcon('amount')}
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('reference')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Reference
                      {renderSortIcon('reference')}
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('created_at')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Submitted
                      {renderSortIcon('created_at')}
                    </button>
                  </th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibleRows.map((pay) => {
                  const cand = extractJoinedCandidate(pay);
                  const isConfirming = confirmingId === pay.id;

                  return (
                    <tr
                      key={pay.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => onSelectCandidate(pay.candidate_id)}
                            className="font-semibold text-slate-900 hover:text-blue-700 text-left w-fit"
                          >
                            {cand?.full_name || 'Unknown Candidate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectCandidate(pay.candidate_id)}
                            className="font-mono text-xs text-blue-700 hover:underline tabular-nums text-left w-fit mt-0.5"
                          >
                            {cand?.candidate_code || '—'}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatDate(pay.paid_on)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatInr(pay.amount)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                        {pay.reference || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDateTime(pay.created_at)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <PaymentStatusBadge status={pay.status} />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {pay.proof_path && (
                            <button
                              type="button"
                              onClick={() => setPreviewPayment(pay)}
                              aria-label={`View proof for ${cand?.full_name ?? 'candidate'}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View proof
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleConfirm(pay)}
                            disabled={isConfirming}
                            aria-label={`Confirm payment for ${cand?.full_name ?? 'candidate'}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {isConfirming ? 'Confirming…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectTarget(pay)}
                            disabled={isConfirming}
                            aria-label={`Reject payment for ${cand?.full_name ?? 'candidate'}`}
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
            {visibleRows.map((pay) => {
              const cand = extractJoinedCandidate(pay);
              const isConfirming = confirmingId === pay.id;

              return (
                <div key={pay.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectCandidate(pay.candidate_id)}
                        className="font-semibold text-sm text-slate-900 hover:text-blue-700 text-left block truncate"
                      >
                        {cand?.full_name || 'Unknown Candidate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectCandidate(pay.candidate_id)}
                        className="font-mono text-xs text-blue-700 hover:underline tabular-nums mt-0.5 block"
                      >
                        {cand?.candidate_code || '—'}
                      </button>
                    </div>
                    <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums shrink-0">
                      {formatInr(pay.amount)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>Paid {formatDate(pay.paid_on)}</span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      Ref: {pay.reference || '—'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {pay.proof_path ? (
                      <button
                        type="button"
                        onClick={() => setPreviewPayment(pay)}
                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        View proof
                      </button>
                    ) : (
                      <span className="inline-flex items-center justify-center px-2.5 py-2 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg">
                        No file
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleConfirm(pay)}
                      disabled={isConfirming}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      {isConfirming ? '…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectTarget(pay)}
                      disabled={isConfirming}
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

      {/* 60-Second Signed URL Proof Preview */}
      <DocumentPreviewModal
        open={Boolean(previewPayment)}
        storagePath={previewPayment?.proof_path ?? null}
        title={
          previewPayment
            ? `Payment Proof · ${formatInr(previewPayment.amount)}`
            : 'Payment Proof'
        }
        subtitle={
          previewCandidate
            ? `${previewCandidate.full_name} (${previewCandidate.candidate_code})${
                previewPayment?.reference
                  ? ` · Ref: ${previewPayment.reference}`
                  : ''
              }`
            : undefined
        }
        onClose={() => setPreviewPayment(null)}
      />

      {/* Reject Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(rejectTarget)}
        onClose={() => !rejecting && setRejectTarget(null)}
        onConfirm={() => void handleConfirmReject()}
        loading={rejecting}
        title="Reject pending payment?"
        message={
          rejectTarget
            ? `Reject the payment of ${formatInr(rejectTarget.amount)}${
                rejectCandidate
                  ? ` from ${rejectCandidate.full_name} (${rejectCandidate.candidate_code})`
                  : ''
              } (Ref: ${rejectTarget.reference || '—'})?`
            : ''
        }
        confirmLabel="Reject Payment"
        tone="danger"
      />
    </div>
  );
}
