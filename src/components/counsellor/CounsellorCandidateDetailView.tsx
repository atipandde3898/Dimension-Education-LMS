import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  CandidateOverview,
  CounsellorDocumentRow,
  CounsellorPaymentRow,
  DocStatusValue,
  DocTypeValue,
  InstallmentStatus,
} from '../../types/database';
import {
  DOC_TYPE_LABELS,
  REQUIRED_DOC_TYPES,
  formatDateDdMmmYyyy,
  formatDbError,
  formatHandoverStatusText,
  formatInr,
} from '../../utils/domain';
import { DocumentStatusBadge } from '../ui/DocumentWidgets';
import { InstallmentStateBadge, PaymentStatusBadge } from '../ui/FeeWidgets';
import { ErrorState, TableSkeleton } from '../ui/States';

interface CounsellorCandidateDetailViewProps {
  candidateId: string;
  onBack: () => void;
  onCandidateCodeLoaded?: (code: string) => void;
}

const STATUS_STYLES: Record<CandidateOverview['status'], string> = {
  onboarding: 'text-amber-700',
  active: 'text-emerald-700',
  completed: 'text-blue-700',
  dropped: 'text-red-700',
};

export function CounsellorCandidateDetailView({
  candidateId,
  onBack,
  onCandidateCodeLoaded,
}: CounsellorCandidateDetailViewProps) {
  const [overview, setOverview] = useState<CandidateOverview | null>(null);
  const [docStatuses, setDocStatuses] = useState<CounsellorDocumentRow[]>([]);
  const [installments, setInstallments] = useState<InstallmentStatus[]>([]);
  const [payments, setPayments] = useState<CounsellorPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCandidateDetail = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    setLoading(true);
    setError(null);

    // Strictly read-only queries. Never select storage_path, proof_path, or candidate_pan.
    const [ovRes, docsRes, instRes, payRes] = await Promise.all([
      client
        .from('v_candidate_overview')
        .select(
          'candidate_id, candidate_code, full_name, email, phone, status, program, module, batch_code, batch_mode, counsellor, net_fee, paid, pending, handed_over, handover_date, placement_member',
        )
        .eq('candidate_id', candidateId)
        .single(),
      client
        .from('documents')
        .select('candidate_id, doc_type, status')
        .eq('candidate_id', candidateId),
      client
        .from('v_installment_status')
        .select('id, candidate_id, seq, due_date, amount, paid, state, pending_amount')
        .eq('candidate_id', candidateId)
        .order('seq', { ascending: true }),
      client
        .from('payments')
        .select('id, candidate_id, amount, paid_on, status')
        .eq('candidate_id', candidateId)
        .order('paid_on', { ascending: false }),
    ]);

    if (ovRes.error || !ovRes.data) {
      setError(formatDbError(ovRes.error ?? 'Candidate not found.'));
      setLoading(false);
      return;
    }

    const loadedOverview = ovRes.data as CandidateOverview;
    setOverview(loadedOverview);
    setDocStatuses((docsRes.data as CounsellorDocumentRow[] | null) ?? []);
    setInstallments((instRes.data as InstallmentStatus[] | null) ?? []);
    setPayments((payRes.data as CounsellorPaymentRow[] | null) ?? []);
    onCandidateCodeLoaded?.(loadedOverview.candidate_code);
    setLoading(false);
  }, [candidateId, onCandidateCodeLoaded]);

  useEffect(() => {
    void loadCandidateDetail();
  }, [loadCandidateDetail]);

  if (loading) {
    return <TableSkeleton rows={6} columns={4} />;
  }

  if (error || !overview) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Candidates
        </button>
        <ErrorState
          title="Could not load candidate details"
          message={error ?? 'Candidate not found.'}
          onRetry={() => void loadCandidateDetail()}
        />
      </div>
    );
  }

  const docStatusByType = new Map<DocTypeValue, DocStatusValue>();
  for (const d of docStatuses) {
    docStatusByType.set(d.doc_type, d.status);
  }

  const handoverText = formatHandoverStatusText(overview);
  const isHandedOver = Boolean(overview.handed_over);

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to My Candidates
      </button>

      {/* 1. Profile Info (Read-Only) */}
      <section
        aria-labelledby="counsellor-candidate-profile-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5 text-xs">
              <span className="font-mono font-semibold text-blue-700 tabular-nums">
                {overview.candidate_code}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span
                className={`font-medium capitalize ${
                  STATUS_STYLES[overview.status]
                }`}
              >
                {overview.status}
              </span>
            </div>

            <h1
              id="counsellor-candidate-profile-heading"
              className="mt-1.5 text-2xl font-semibold text-slate-900 tracking-tight"
            >
              {overview.full_name}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              <span>{overview.email}</span>
              {overview.phone && (
                <>
                  <span className="mx-2 text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {overview.phone}
                  </span>
                </>
              )}
            </p>
          </div>

          <span className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-md self-start whitespace-nowrap">
            Read-only record
          </span>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
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
            <dt className="text-xs text-slate-500">Batch</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {overview.batch_code ? (
                <>
                  <span className="font-mono tabular-nums">
                    {overview.batch_code}
                  </span>
                  {overview.batch_mode && (
                    <span className="text-xs text-slate-500 capitalize">
                      {' '}
                      · {overview.batch_mode}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-slate-400">Unassigned</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Academic Counsellor</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {overview.counsellor || '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* 2. Onboarding Document Statuses (Badges Only — No View Buttons, Never PAN) */}
      <section
        aria-labelledby="counsellor-docs-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
      >
        <div>
          <h2
            id="counsellor-docs-heading"
            className="text-base font-semibold text-slate-900"
          >
            Onboarding Document Status
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Verification status for required onboarding documents.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          {REQUIRED_DOC_TYPES.map((docType) => {
            const status = docStatusByType.get(docType) ?? 'not_uploaded';
            return (
              <div
                key={docType}
                className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg flex items-center justify-between gap-3"
              >
                <span className="text-sm font-medium text-slate-900">
                  {DOC_TYPE_LABELS[docType]}
                </span>
                <DocumentStatusBadge status={status} />
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Fee Summary, Installments & Payments */}
      <section
        aria-labelledby="counsellor-fees-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-6"
      >
        <div>
          <h2
            id="counsellor-fees-heading"
            className="text-base font-semibold text-slate-900"
          >
            Fee Summary &amp; Schedule
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Net fee balance, installment schedule, and payment confirmation
            status.
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <dt className="text-xs font-medium text-slate-500">Net Fee</dt>
            <dd className="mt-1.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {formatInr(overview.net_fee)}
            </dd>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <dt className="text-xs font-medium text-slate-500">Paid</dt>
            <dd className="mt-1.5 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
              {formatInr(overview.paid)}
            </dd>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <dt className="text-xs font-medium text-slate-500">Pending</dt>
            <dd
              className={`mt-1.5 font-mono text-xl font-semibold tabular-nums ${
                Number(overview.pending ?? 0) > 0
                  ? 'text-amber-700'
                  : 'text-slate-900'
              }`}
            >
              {formatInr(overview.pending)}
            </dd>
          </div>
        </dl>

        {/* Installments */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Installments</h3>
          {installments.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">
              No installments have been scheduled for this candidate yet.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                        Installment
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                        Due Date
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">
                        Amount
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">
                        Paid
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                        State
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {installments.map((inst) => (
                      <tr key={inst.id}>
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                          #{inst.seq}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDateDdMmmYyyy(inst.due_date) || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                          {formatInr(inst.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatInr(inst.paid)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <InstallmentStateBadge state={inst.state} />
                          {inst.state !== 'paid' && Number(inst.pending_amount || 0) > 0 && (
                            <p className="mt-1 text-xs font-medium text-blue-700">
                              {formatInr(inst.pending_amount)} submitted, awaiting confirmation
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Payments */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Payments</h3>
          {payments.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">
              No payment submissions recorded for this candidate yet.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                        Paid On
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">
                        Amount
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((pay) => (
                      <tr key={pay.id}>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                          {formatDateDdMmmYyyy(pay.paid_on) || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                          {formatInr(pay.amount)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <PaymentStatusBadge status={pay.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. Placement Handover Status */}
      <section
        aria-labelledby="counsellor-placement-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h2
            id="counsellor-placement-heading"
            className="text-base font-semibold text-slate-900"
          >
            Placement Handover
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Current placement coordination status.
          </p>
        </div>

        <div
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium self-start sm:self-auto ${
            isHandedOver
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          {isHandedOver ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
          )}
          <span>{handoverText}</span>
        </div>
      </section>
    </div>
  );
}
