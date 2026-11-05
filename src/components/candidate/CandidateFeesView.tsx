import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Eye,
  Info,
  Plus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  CandidateFeesSummary,
  FeePlan,
  InstallmentStatus,
  Payment,
} from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  buildCandidatePaymentInsertPayload,
  formatDate,
  formatDbError,
  formatInr,
  hasCandidateFeePlan,
  validateAndBuildPaymentProofUpload,
} from '../../utils/domain';
import { DocumentPreviewModal } from '../ui/DocumentWidgets';
import { InstallmentStateBadge, PaymentStatusBadge } from '../ui/FeeWidgets';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/States';

interface CandidateFeesViewProps {
  candidateId: string;
  feePlan: FeePlan | null;
  feeSummary: CandidateFeesSummary | null;
  installments: InstallmentStatus[];
  payments: Payment[];
  onRefresh: () => Promise<void>;
}

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function CandidateFeesView({
  candidateId,
  feePlan,
  feeSummary,
  installments,
  payments,
  onRefresh,
}: CandidateFeesViewProps) {
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [paidOnInput, setPaidOnInput] = useState(getTodayDateString);
  const [referenceInput, setReferenceInput] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadedProofPath, setUploadedProofPath] = useState<string | null>(
    null,
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [canRetryUpload, setCanRetryUpload] = useState(false);
  const [submitSuccessBanner, setSubmitSuccessBanner] = useState<string | null>(
    null,
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Proof preview modal
  const [previewPayment, setPreviewPayment] = useState<Payment | null>(null);

  const planExists = hasCandidateFeePlan(feePlan, feeSummary);

  const netFee = Number(
    feeSummary?.net_fee ??
      (feePlan
        ? Math.max(0, Number(feePlan.total_fee) - Number(feePlan.discount))
        : 0),
  );
  const paidAmount = Number(feeSummary?.paid ?? 0);
  const pendingAmount = Number(
    feeSummary?.pending ?? Math.max(0, netFee - paidAmount),
  );

  const sortedInstallments = useMemo(
    () => [...installments].sort((a, b) => Number(a.seq) - Number(b.seq)),
    [installments],
  );

  const seqByInstallmentId = useMemo(() => {
    const map = new Map<string, number>();
    for (const inst of installments) {
      map.set(inst.id, inst.seq);
    }
    return map;
  }, [installments]);

  const sortedPayments = useMemo(
    () =>
      [...payments].sort((a, b) => {
        const createdCmp = (b.created_at ?? '').localeCompare(
          a.created_at ?? '',
        );
        if (createdCmp !== 0) return createdCmp;
        return (b.paid_on ?? '').localeCompare(a.paid_on ?? '');
      }),
    [payments],
  );

  const openSubmitModal = (opts?: {
    installment?: InstallmentStatus | null;
    defaultAmount?: number | null;
  }) => {
    const inst = opts?.installment ?? null;
    setSelectedInstallmentId(inst ? inst.id : '');
    if (opts?.defaultAmount !== undefined && opts.defaultAmount !== null) {
      setAmountInput(opts.defaultAmount > 0 ? String(opts.defaultAmount) : '');
    } else if (inst) {
      const remaining = Math.max(
        0,
        Math.round((Number(inst.amount) - Number(inst.paid || 0)) * 100) / 100,
      );
      setAmountInput(remaining > 0 ? String(remaining) : String(inst.amount));
    } else {
      setAmountInput('');
    }
    setPaidOnInput(getTodayDateString());
    setReferenceInput('');
    setProofFile(null);
    setUploadedProofPath(null);
    setSubmitError(null);
    setCanRetryUpload(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setSubmitModalOpen(true);
  };

  const executeSubmitPayment = async () => {
    const client = supabase;
    if (!client) return;

    // 1. Validate proof file selection
    const fileValidation = validateAndBuildPaymentProofUpload(
      candidateId,
      proofFile,
    );
    if (!fileValidation.ok) {
      setSubmitError(fileValidation.error);
      setCanRetryUpload(false);
      return;
    }

    const targetStoragePath = uploadedProofPath ?? fileValidation.storagePath;

    // 2. Pre-validate payment fields before uploading file to storage
    const preCheck = buildCandidatePaymentInsertPayload({
      candidate_id: candidateId,
      installment_id: selectedInstallmentId || null,
      amount: amountInput,
      paid_on: paidOnInput,
      reference: referenceInput,
      proof_path: targetStoragePath,
    });
    if (!preCheck.ok) {
      setSubmitError(preCheck.error);
      setCanRetryUpload(false);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setCanRetryUpload(false);

    // 3. Upload proof file to private bucket candidate-docs first (skip if already uploaded on previous attempt)
    let finalProofPath = uploadedProofPath;
    if (!finalProofPath && proofFile) {
      const { error: uploadErr } = await client.storage
        .from(CANDIDATE_DOCS_BUCKET)
        .upload(targetStoragePath, proofFile, {
          upsert: true,
          contentType: proofFile.type || undefined,
        });

      if (uploadErr) {
        setSubmitting(false);
        setSubmitError(formatDbError(uploadErr));
        setCanRetryUpload(true);
        return;
      }

      finalProofPath = targetStoragePath;
      setUploadedProofPath(finalProofPath);
    }

    // 4. Insert into payments with status = 'pending' only (never send confirmed_by or confirmed_at)
    const builtInsert = buildCandidatePaymentInsertPayload({
      candidate_id: candidateId,
      installment_id: selectedInstallmentId || null,
      amount: amountInput,
      paid_on: paidOnInput,
      reference: referenceInput,
      proof_path: finalProofPath!,
    });

    if (!builtInsert.ok) {
      setSubmitting(false);
      setSubmitError(builtInsert.error);
      return;
    }

    const { error: insertErr } = await client
      .from('payments')
      .insert(builtInsert.payload);

    setSubmitting(false);

    if (insertErr) {
      setSubmitError(formatDbError(insertErr));
      setCanRetryUpload(true);
      return;
    }

    setSubmitModalOpen(false);
    setSubmitSuccessBanner(
      `Payment of ${formatInr(builtInsert.payload.amount)} submitted and awaiting confirmation. Your paid and pending balances will update once the institute confirms the receipt.`,
    );
    await onRefresh();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSubmitPayment();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Fees &amp; Payments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track your fee schedule, submit payment receipts, and check
            confirmation status.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openSubmitModal()}
          className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Submit payment
        </button>
      </div>

      {submitSuccessBanner && (
        <div
          role="status"
          className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-xl text-sm text-emerald-900 flex items-start justify-between gap-3"
        >
          <span>{submitSuccessBanner}</span>
          <button
            type="button"
            onClick={() => setSubmitSuccessBanner(null)}
            aria-label="Dismiss payment notification"
            className="text-emerald-700 hover:text-emerald-950 p-0.5 rounded shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Fee Summary Cards (v_candidate_fees) */}
      {!planExists ? (
        <section
          aria-label="Fee plan status"
          className="p-6 bg-white border border-slate-200 rounded-xl"
        >
          <p className="text-base font-semibold text-slate-900">
            Your fee plan has not been set yet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Your counsellor or institute administration will configure your fee
            plan and installment schedule shortly.
          </p>
        </section>
      ) : (
        <section
          aria-label="Fee summary"
          className="space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 bg-white border border-slate-200 rounded-xl">
              <p className="text-xs font-medium text-slate-500">Net Fee</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {formatInr(netFee)}
              </p>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-xl">
              <p className="text-xs font-medium text-slate-500">Paid</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
                {formatInr(paidAmount)}
              </p>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-xl">
              <p className="text-xs font-medium text-slate-500">Pending</p>
              <p
                className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                  pendingAmount > 0 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {formatInr(pendingAmount)}
              </p>
            </div>
          </div>

          <div className="px-4 py-3 bg-slate-100/80 border border-slate-200 rounded-lg flex items-start gap-2.5 text-xs text-slate-700">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <span>
              Pending fees count only confirmed payments. Any pending payments
              you submit are not counted toward Paid or deducted from Pending
              until the institute confirms them.
            </span>
          </div>
        </section>
      )}

      {/* 2. Installments Table (v_installment_status) */}
      <section
        aria-labelledby="candidate-installments-heading"
        className="space-y-3"
      >
        <div>
          <h2
            id="candidate-installments-heading"
            className="text-base font-semibold text-slate-900"
          >
            Installments
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Scheduled payment milestones and current settlement status.
          </p>
        </div>

        {sortedInstallments.length === 0 ? (
          <EmptyState
            title="No installments scheduled yet"
            description="Once your installment schedule is configured, due dates and amounts will appear here."
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Seq</th>
                    <th className="px-4 py-3 text-left">Due Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedInstallments.map((inst) => (
                    <tr
                      key={inst.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        #{inst.seq}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatDate(inst.due_date)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatInr(inst.amount)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatInr(inst.paid)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <InstallmentStateBadge state={inst.state} />
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {inst.state !== 'paid' ? (
                          <button
                            type="button"
                            onClick={() =>
                              openSubmitModal({ installment: inst })
                            }
                            aria-label={`Submit payment for installment #${inst.seq}`}
                            className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50/80 border border-blue-200 rounded-lg hover:bg-blue-100/70 transition-colors whitespace-nowrap"
                          >
                            Submit payment
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Settled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards */}
            <div className="md:hidden divide-y divide-slate-200">
              {sortedInstallments.map((inst) => (
                <div key={inst.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      Installment #{inst.seq}
                    </span>
                    <InstallmentStateBadge state={inst.state} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Due Date: </span>
                      <span className="font-mono font-medium text-slate-800 tabular-nums">
                        {formatDate(inst.due_date)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500">Amount: </span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatInr(inst.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-slate-500">
                      Paid:{' '}
                      <span className="font-mono font-medium text-emerald-700 tabular-nums">
                        {formatInr(inst.paid)}
                      </span>
                    </span>

                    {inst.state !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => openSubmitModal({ installment: inst })}
                        className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap"
                      >
                        Submit payment
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. My Payments List */}
      <section
        aria-labelledby="candidate-my-payments-heading"
        className="space-y-3"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2
              id="candidate-my-payments-heading"
              className="text-base font-semibold text-slate-900"
            >
              My Payments
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Receipts you have submitted and their verification status.
            </p>
          </div>
        </div>

        {sortedPayments.length === 0 ? (
          <EmptyState
            title="No payments submitted yet"
            description="Use Submit payment once you have completed a fee transfer and have your transaction reference and receipt ready."
            actionLabel="Submit payment"
            onAction={() => openSubmitModal()}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
            {sortedPayments.map((pay) => {
              const linkedSeq = pay.installment_id
                ? seqByInstallmentId.get(pay.installment_id)
                : undefined;
              const linkedInstObj = pay.installment_id
                ? sortedInstallments.find((i) => i.id === pay.installment_id) ??
                  null
                : null;

              return (
                <div key={pay.id} className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                          {formatInr(pay.amount)}
                        </span>
                        <PaymentStatusBadge
                          status={pay.status}
                          perspective="candidate"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>
                          Paid on{' '}
                          <span className="font-mono text-slate-700 tabular-nums">
                            {formatDate(pay.paid_on)}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden="true">·</span>
                          <span>
                            Ref:{' '}
                            <span className="font-mono text-slate-800 tabular-nums">
                              {pay.reference || '—'}
                            </span>
                          </span>
                        </span>
                        {linkedSeq !== undefined && (
                          <span className="inline-flex items-center gap-2">
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-slate-700 tabular-nums">
                              Installment #{linkedSeq}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {pay.proof_path && (
                        <button
                          type="button"
                          onClick={() => setPreviewPayment(pay)}
                          aria-label={`View proof for payment ${pay.reference || pay.id}`}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View proof
                        </button>
                      )}

                      {pay.status === 'rejected' && (
                        <button
                          type="button"
                          onClick={() =>
                            openSubmitModal({
                              installment: linkedInstObj,
                              defaultAmount: Number(pay.amount),
                            })
                          }
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap"
                        >
                          Submit again
                        </button>
                      )}
                    </div>
                  </div>

                  {pay.status === 'rejected' && (
                    <div
                      role="alert"
                      className="p-3 bg-red-50/90 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-900"
                    >
                      <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                      <p className="font-medium">
                        Rejected. Please submit again with the correct proof.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Submit Payment Modal */}
      <Modal
        open={submitModalOpen}
        onClose={() => !submitting && setSubmitModalOpen(false)}
        title="Submit payment"
        description="Upload your payment receipt (PDF, JPG, or PNG up to 5 MB). Pending payments count once confirmed by the institute."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
          {submitError && (
            <div
              role="alert"
              className="p-3.5 bg-red-50/90 border border-red-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <p className="text-xs text-red-800">{submitError}</p>
              {canRetryUpload && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void executeSubmitPayment()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors self-start sm:self-center whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="payment-installment-select"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Installment{' '}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <select
              id="payment-installment-select"
              value={selectedInstallmentId}
              disabled={submitting}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedInstallmentId(nextId);
                if (nextId) {
                  const matched = sortedInstallments.find(
                    (inst) => inst.id === nextId,
                  );
                  if (matched && !amountInput) {
                    const rem = Math.max(
                      0,
                      Math.round(
                        (Number(matched.amount) - Number(matched.paid || 0)) *
                          100,
                      ) / 100,
                    );
                    setAmountInput(
                      rem > 0 ? String(rem) : String(matched.amount),
                    );
                  }
                }
              }}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            >
              <option value="">General payment (not linked to a specific installment)</option>
              {sortedInstallments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  Installment #{inst.seq} · Due {formatDate(inst.due_date)} ·{' '}
                  {formatInr(inst.amount)} ({inst.state})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="payment-amount-input"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Amount (₹)
              </label>
              <input
                id="payment-amount-input"
                type="number"
                min="1"
                step="1"
                required
                disabled={submitting}
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  if (submitError) setSubmitError(null);
                }}
                placeholder="50000"
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="payment-date-input"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Paid on
              </label>
              <input
                id="payment-date-input"
                type="date"
                required
                disabled={submitting}
                value={paidOnInput}
                onChange={(e) => {
                  setPaidOnInput(e.target.value);
                  if (submitError) setSubmitError(null);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="payment-reference-input"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Reference (UTR or transaction ID)
            </label>
            <input
              id="payment-reference-input"
              type="text"
              required
              disabled={submitting}
              value={referenceInput}
              onChange={(e) => {
                setReferenceInput(e.target.value);
                if (submitError) setSubmitError(null);
              }}
              placeholder="e.g. UTR429018472910"
              className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="payment-proof-file"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Payment proof (PDF, JPG, or PNG · Max 5 MB)
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <input
                ref={fileInputRef}
                id="payment-proof-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                disabled={submitting}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setProofFile(f);
                  setUploadedProofPath(null);
                  setSubmitError(null);
                  setCanRetryUpload(false);
                }}
                className="sr-only"
              />
              <label
                htmlFor="payment-proof-file"
                className={`min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap select-none ${
                  submitting
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{proofFile ? 'Change file' : 'Choose proof file'}</span>
              </label>
              <span className="text-xs text-slate-600 truncate">
                {proofFile
                  ? proofFile.name
                  : 'No file selected (required)'}
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setSubmitModalOpen(false)}
              disabled={submitting}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {submitting ? 'Uploading & Submitting…' : 'Submit Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Proof Preview Modal */}
      <DocumentPreviewModal
        open={Boolean(previewPayment)}
        storagePath={previewPayment?.proof_path ?? null}
        title={
          previewPayment
            ? `Payment Proof · ${formatInr(previewPayment.amount)}`
            : 'Payment Proof'
        }
        subtitle={
          previewPayment?.reference
            ? `Reference: ${previewPayment.reference}`
            : undefined
        }
        onClose={() => setPreviewPayment(null)}
      />
    </div>
  );
}
