import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Eye,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  CandidateFeesSummary,
  FeePlan,
  Installment,
  InstallmentStatus,
  Payment,
} from '../../types/database';
import {
  buildAdminPaymentDecisionPayload,
  buildFeePlanUpsertPayload,
  buildInstallmentPayload,
  computeInstallmentMismatch,
  formatDate,
  formatDbError,
  formatInr,
  hasCandidateFeePlan,
} from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DocumentPreviewModal } from '../ui/DocumentWidgets';
import { InstallmentStateBadge, PaymentStatusBadge } from '../ui/FeeWidgets';
import { Modal } from '../ui/Modal';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';

interface CandidateFeesSectionProps {
  candidateId: string;
  adminUserId: string;
  candidateLabel: string;
  onFeesUpdated?: () => void;
}

export function CandidateFeesSection({
  candidateId,
  adminUserId,
  candidateLabel,
  onFeesUpdated,
}: CandidateFeesSectionProps) {
  const [feePlan, setFeePlan] = useState<FeePlan | null>(null);
  const [feeSummary, setFeeSummary] = useState<CandidateFeesSummary | null>(
    null,
  );
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentStatuses, setInstallmentStatuses] = useState<
    InstallmentStatus[]
  >([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fee Plan Form
  const [totalFeeInput, setTotalFeeInput] = useState('');
  const [discountInput, setDiscountInput] = useState('0');
  const [noteInput, setNoteInput] = useState('');
  const [planSaving, setPlanSaving] = useState(false);
  const [planFeedback, setPlanFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  // Installment Editor Modal & Delete Confirmation
  const [instModalOpen, setInstModalOpen] = useState(false);
  const [editingInstallment, setEditingInstallment] =
    useState<Installment | null>(null);
  const [instSeqInput, setInstSeqInput] = useState('1');
  const [instDueDateInput, setInstDueDateInput] = useState('');
  const [instAmountInput, setInstAmountInput] = useState('');
  const [instSaving, setInstSaving] = useState(false);
  const [instModalError, setInstModalError] = useState<string | null>(null);

  const [instToDelete, setInstToDelete] = useState<Installment | null>(null);
  const [instDeleting, setInstDeleting] = useState(false);
  const [instFeedback, setInstFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  // Candidate Payments Actions
  const [paymentFeedback, setPaymentFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(
    null,
  );
  const [paymentToReject, setPaymentToReject] = useState<Payment | null>(null);
  const [rejectingPayment, setRejectingPayment] = useState(false);
  const [previewProofPayment, setPreviewProofPayment] =
    useState<Payment | null>(null);

  const loadFeesData = useCallback(
    async (showSkeleton = true, syncForm = true) => {
      const client = supabase;
      if (!client) return;
      if (showSkeleton) setLoading(true);
      setLoadError(null);

      const [planRes, summaryRes, instRes, instStatusRes, payRes] =
        await Promise.all([
          client
            .from('fee_plans')
            .select('candidate_id, total_fee, discount, note')
            .eq('candidate_id', candidateId)
            .maybeSingle(),
          client
            .from('v_candidate_fees')
            .select(
              'candidate_id, total_fee, discount, net_fee, paid, pending',
            )
            .eq('candidate_id', candidateId)
            .maybeSingle(),
          client
            .from('installments')
            .select('id, candidate_id, seq, due_date, amount')
            .eq('candidate_id', candidateId)
            .order('seq', { ascending: true }),
          client
            .from('v_installment_status')
            .select('id, candidate_id, seq, due_date, amount, paid, state, pending_amount')
            .eq('candidate_id', candidateId)
            .order('seq', { ascending: true }),
          client
            .from('payments')
            .select(
              'id, candidate_id, installment_id, amount, paid_on, reference, proof_path, status, confirmed_by, confirmed_at, created_at',
            )
            .eq('candidate_id', candidateId)
            .order('created_at', { ascending: false }),
        ]);

      if (
        planRes.error ||
        summaryRes.error ||
        instRes.error ||
        instStatusRes.error ||
        payRes.error
      ) {
        setLoadError(
          formatDbError(
            planRes.error ||
              summaryRes.error ||
              instRes.error ||
              instStatusRes.error ||
              payRes.error,
          ),
        );
        setLoading(false);
        return;
      }

      const loadedPlan = (planRes.data as FeePlan | null) ?? null;
      const loadedSummary =
        (summaryRes.data as CandidateFeesSummary | null) ?? null;
      const loadedInstallments = (instRes.data as Installment[] | null) ?? [];
      const loadedStatuses =
        (instStatusRes.data as InstallmentStatus[] | null) ?? [];
      const loadedPayments = (payRes.data as Payment[] | null) ?? [];

      setFeePlan(loadedPlan);
      setFeeSummary(loadedSummary);
      setInstallments(loadedInstallments);
      setInstallmentStatuses(loadedStatuses);
      setPayments(loadedPayments);

      if (syncForm) {
        if (loadedPlan) {
          setTotalFeeInput(String(loadedPlan.total_fee ?? 0));
          setDiscountInput(String(loadedPlan.discount ?? 0));
          setNoteInput(loadedPlan.note ?? '');
        } else if (loadedSummary && loadedSummary.total_fee !== null) {
          setTotalFeeInput(String(loadedSummary.total_fee));
          setDiscountInput(String(loadedSummary.discount ?? 0));
          setNoteInput('');
        } else {
          setTotalFeeInput('');
          setDiscountInput('0');
          setNoteInput('');
        }
      }

      setLoading(false);
    },
    [candidateId],
  );

  useEffect(() => {
    void loadFeesData(true, true);
  }, [loadFeesData]);

  const statusByInstallmentId = useMemo(() => {
    const map = new Map<string, InstallmentStatus>();
    for (const s of installmentStatuses) {
      map.set(s.id, s);
    }
    return map;
  }, [installmentStatuses]);

  const seqByInstallmentId = useMemo(() => {
    const map = new Map<string, number>();
    for (const inst of installments) {
      map.set(inst.id, inst.seq);
    }
    for (const st of installmentStatuses) {
      if (!map.has(st.id)) {
        map.set(st.id, st.seq);
      }
    }
    return map;
  }, [installments, installmentStatuses]);

  const planExists = hasCandidateFeePlan(feePlan, feeSummary);

  const effectiveNetFee = useMemo(() => {
    if (feeSummary && feeSummary.net_fee !== null && feeSummary.net_fee !== undefined) {
      return Number(feeSummary.net_fee);
    }
    if (feePlan) {
      return Math.max(0, Number(feePlan.total_fee) - Number(feePlan.discount));
    }
    return null;
  }, [feeSummary, feePlan]);

  const paidAmount = Number(feeSummary?.paid ?? 0);
  const pendingAmount =
    feeSummary?.pending !== null && feeSummary?.pending !== undefined
      ? Number(feeSummary.pending)
      : Math.max(0, (effectiveNetFee ?? 0) - paidAmount);

  // Live draft net fee preview in the form
  const draftNetFeePreview = useMemo(() => {
    const t = Number(totalFeeInput);
    const d = Number(discountInput || 0);
    if (!Number.isFinite(t) || t < 0 || totalFeeInput.trim() === '') {
      return null;
    }
    const safeD = Number.isFinite(d) && d >= 0 ? d : 0;
    return Math.max(0, Math.round((t - safeD) * 100) / 100);
  }, [totalFeeInput, discountInput]);

  const mismatchInfo = useMemo(() => {
    if (!planExists && installments.length === 0) {
      return null;
    }
    const targetNet = effectiveNetFee ?? 0;
    const res = computeInstallmentMismatch(targetNet, installments);
    return res.hasMismatch ? res : null;
  }, [planExists, effectiveNetFee, installments]);

  const handleSaveFeePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const check = buildFeePlanUpsertPayload(candidateId, {
      total_fee: totalFeeInput,
      discount: discountInput,
      note: noteInput,
    });
    if (!check.ok) {
      setPlanFeedback({ type: 'error', message: check.error });
      return;
    }

    setPlanSaving(true);
    setPlanFeedback(null);

    const { error: upsertErr } = await client
      .from('fee_plans')
      .upsert(check.payload, { onConflict: 'candidate_id' });

    if (upsertErr) {
      setPlanSaving(false);
      setPlanFeedback({
        type: 'error',
        message: formatDbError(upsertErr),
      });
      return;
    }

    await loadFeesData(false, true);
    setPlanSaving(false);
    setPlanFeedback({
      type: 'success',
      message: `Fee plan saved. Net fee is ${formatInr(check.netFee)}.`,
    });
    onFeesUpdated?.();
  };

  const openAddInstallment = () => {
    const maxSeq = installments.reduce(
      (max, item) => Math.max(max, Number(item.seq) || 0),
      0,
    );
    setEditingInstallment(null);
    setInstSeqInput(String(maxSeq + 1));
    setInstDueDateInput('');
    setInstAmountInput('');
    setInstModalError(null);
    setInstModalOpen(true);
  };

  const openEditInstallment = (inst: Installment) => {
    setEditingInstallment(inst);
    setInstSeqInput(String(inst.seq));
    setInstDueDateInput(inst.due_date);
    setInstAmountInput(String(inst.amount));
    setInstModalError(null);
    setInstModalOpen(true);
  };

  const handleSaveInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const otherSeqs = installments
      .filter((item) => item.id !== editingInstallment?.id)
      .map((item) => Number(item.seq));

    const check = buildInstallmentPayload(
      candidateId,
      {
        seq: instSeqInput,
        due_date: instDueDateInput,
        amount: instAmountInput,
      },
      otherSeqs,
    );

    if (!check.ok) {
      setInstModalError(check.error);
      return;
    }

    setInstSaving(true);
    setInstModalError(null);
    setInstFeedback(null);

    if (editingInstallment) {
      const { error: updateErr } = await client
        .from('installments')
        .update({
          seq: check.payload.seq,
          due_date: check.payload.due_date,
          amount: check.payload.amount,
        })
        .eq('id', editingInstallment.id);

      if (updateErr) {
        setInstSaving(false);
        setInstModalError(formatDbError(updateErr));
        return;
      }

      await loadFeesData(false, false);
      setInstSaving(false);
      setInstModalOpen(false);
      setInstFeedback({
        type: 'success',
        message: `Installment #${check.payload.seq} updated.`,
      });
    } else {
      const { error: insertErr } = await client
        .from('installments')
        .insert(check.payload);

      if (insertErr) {
        setInstSaving(false);
        setInstModalError(formatDbError(insertErr));
        return;
      }

      await loadFeesData(false, false);
      setInstSaving(false);
      setInstModalOpen(false);
      setInstFeedback({
        type: 'success',
        message: `Installment #${check.payload.seq} added.`,
      });
    }

    onFeesUpdated?.();
  };

  const handleConfirmDeleteInstallment = async () => {
    const client = supabase;
    if (!client || !instToDelete) return;

    setInstDeleting(true);
    setInstFeedback(null);

    const targetSeq = instToDelete.seq;
    const { error: delErr } = await client
      .from('installments')
      .delete()
      .eq('id', instToDelete.id);

    if (delErr) {
      setInstDeleting(false);
      setInstToDelete(null);
      setInstFeedback({
        type: 'error',
        message: formatDbError(delErr),
      });
      return;
    }

    await loadFeesData(false, false);
    setInstDeleting(false);
    setInstToDelete(null);
    setInstFeedback({
      type: 'success',
      message: `Installment #${targetSeq} deleted.`,
    });
    onFeesUpdated?.();
  };

  const handleConfirmPayment = async (payment: Payment) => {
    const client = supabase;
    if (!client) return;

    setConfirmingPaymentId(payment.id);
    setPaymentFeedback(null);

    const payload = buildAdminPaymentDecisionPayload(adminUserId, 'confirmed');
    const { error: updateErr } = await client
      .from('payments')
      .update(payload)
      .eq('id', payment.id);

    if (updateErr) {
      setConfirmingPaymentId(null);
      setPaymentFeedback({
        type: 'error',
        message: formatDbError(updateErr),
      });
      return;
    }

    await loadFeesData(false, false);
    setConfirmingPaymentId(null);
    setPaymentFeedback({
      type: 'success',
      message: `Payment of ${formatInr(payment.amount)} confirmed.`,
    });
    onFeesUpdated?.();
  };

  const handleConfirmRejectPayment = async () => {
    const client = supabase;
    if (!client || !paymentToReject) return;

    setRejectingPayment(true);
    setPaymentFeedback(null);

    const targetAmount = paymentToReject.amount;
    const payload = buildAdminPaymentDecisionPayload(adminUserId, 'rejected');
    const { error: updateErr } = await client
      .from('payments')
      .update(payload)
      .eq('id', paymentToReject.id);

    if (updateErr) {
      setRejectingPayment(false);
      setPaymentToReject(null);
      setPaymentFeedback({
        type: 'error',
        message: formatDbError(updateErr),
      });
      return;
    }

    await loadFeesData(false, false);
    setRejectingPayment(false);
    setPaymentToReject(null);
    setPaymentFeedback({
      type: 'success',
      message: `Payment of ${formatInr(targetAmount)} marked as rejected.`,
    });
    onFeesUpdated?.();
  };

  if (loading) {
    return <TableSkeleton rows={4} columns={4} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="Could not load candidate fee records"
        message={loadError}
        onRetry={() => void loadFeesData(true, true)}
      />
    );
  }

  return (
    <section
      aria-labelledby="candidate-fees-section-heading"
      className="p-6 bg-white border border-slate-200 rounded-xl space-y-8"
    >
      {/* Header & Summary Strip from v_candidate_fees */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2
              id="candidate-fees-section-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Fees, Installments &amp; Payments
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure the candidate&apos;s fee plan, installment schedule, and
              payment confirmations. Pending balance counts confirmed payments
              only.
            </p>
          </div>
          {!planExists && (
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              No fee plan saved yet
            </span>
          )}
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 border-y border-slate-100">
          <div>
            <dt className="text-xs text-slate-500">
              Net Fee (Total minus Discount)
            </dt>
            <dd className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {formatInr(effectiveNetFee)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Paid (Confirmed)</dt>
            <dd className="mt-1.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
              {formatInr(paidAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Pending</dt>
            <dd
              className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
                pendingAmount > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {formatInr(pendingAmount)}
            </dd>
          </div>
        </dl>
      </div>

      {/* 1. Fee Plan Form */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Fee Plan</h3>
          {draftNetFeePreview !== null && (
            <span className="text-xs text-slate-500">
              Calculated net fee:{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatInr(draftNetFeePreview)}
              </span>
            </span>
          )}
        </div>

        {planFeedback && (
          <div
            role={planFeedback.type === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-lg text-xs flex items-center justify-between gap-3 ${
              planFeedback.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{planFeedback.message}</span>
            <button
              type="button"
              onClick={() => setPlanFeedback(null)}
              aria-label="Dismiss fee plan message"
              className="p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form onSubmit={handleSaveFeePlan} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="fee-plan-total"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Total Fee (₹)
              </label>
              <input
                id="fee-plan-total"
                type="number"
                min="0"
                step="1"
                required
                value={totalFeeInput}
                onChange={(e) => {
                  setTotalFeeInput(e.target.value);
                  if (planFeedback?.type === 'error') setPlanFeedback(null);
                }}
                placeholder="150000"
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="fee-plan-discount"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Discount (₹)
              </label>
              <input
                id="fee-plan-discount"
                type="number"
                min="0"
                step="1"
                value={discountInput}
                onChange={(e) => {
                  setDiscountInput(e.target.value);
                  if (planFeedback?.type === 'error') setPlanFeedback(null);
                }}
                placeholder="0"
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="fee-plan-note"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Note <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="fee-plan-note"
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="e.g. Scholarship / early cohort concession"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={planSaving}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {planSaving ? 'Saving Fee Plan…' : 'Save Fee Plan'}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Installments Editor */}
      <div className="pt-6 border-t border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Installments Schedule
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage installment sequence numbers, due dates, and amounts.
            </p>
          </div>

          <button
            type="button"
            onClick={openAddInstallment}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Installment
          </button>
        </div>

        {mismatchInfo && (
          <div
            role="status"
            className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-950"
          >
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold">
                Installment total does not match net fee
              </p>
              <p className="text-amber-900">
                Scheduled installments add up to{' '}
                <span className="font-mono font-semibold tabular-nums">
                  {formatInr(mismatchInfo.installmentsTotal)}
                </span>{' '}
                against a net fee of{' '}
                <span className="font-mono font-semibold tabular-nums">
                  {formatInr(mismatchInfo.netFee)}
                </span>{' '}
                (
                {mismatchInfo.difference > 0
                  ? `${formatInr(mismatchInfo.difference)} above net fee`
                  : `${formatInr(Math.abs(mismatchInfo.difference))} remaining unscheduled`}
                ).
              </p>
            </div>
          </div>
        )}

        {instFeedback && (
          <div
            role={instFeedback.type === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-lg text-xs flex items-center justify-between gap-3 ${
              instFeedback.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{instFeedback.message}</span>
            <button
              type="button"
              onClick={() => setInstFeedback(null)}
              aria-label="Dismiss installment message"
              className="p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {installments.length === 0 ? (
          <EmptyState
            title="No installments scheduled"
            description="Add installments to define payment milestones and track due dates for this candidate."
            actionLabel="Add First Installment"
            onAction={openAddInstallment}
          />
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Seq</th>
                    <th className="px-4 py-3 text-left">Due Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-left">State</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {installments.map((inst) => {
                    const st = statusByInstallmentId.get(inst.id);
                    return (
                      <tr
                        key={inst.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          #{inst.seq}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDate(inst.due_date)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                          {formatInr(inst.amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-emerald-700 tabular-nums whitespace-nowrap">
                          {formatInr(st?.paid ?? 0)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <InstallmentStateBadge
                            state={st?.state ?? 'upcoming'}
                          />
                          {st && st.state !== 'paid' && Number(st.pending_amount || 0) > 0 && (
                            <p className="mt-1 text-xs font-medium text-blue-700">
                              {formatInr(st.pending_amount)} submitted, awaiting confirmation
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => openEditInstallment(inst)}
                              aria-label={`Edit installment #${inst.seq}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setInstToDelete(inst)}
                              aria-label={`Delete installment #${inst.seq}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Rows */}
            <div className="sm:hidden divide-y divide-slate-200">
              {installments.map((inst) => {
                const st = statusByInstallmentId.get(inst.id);
                return (
                  <div key={inst.id} className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        Installment #{inst.seq}
                      </span>
                      <InstallmentStateBadge state={st?.state ?? 'upcoming'} />
                    </div>
                    {st && st.state !== 'paid' && Number(st.pending_amount || 0) > 0 && (
                      <p className="text-xs font-medium text-blue-700">
                        {formatInr(st.pending_amount)} submitted, awaiting confirmation
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Due {formatDate(inst.due_date)}</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatInr(inst.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-slate-500">
                        Paid:{' '}
                        <span className="font-mono text-emerald-700 tabular-nums">
                          {formatInr(st?.paid ?? 0)}
                        </span>
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openEditInstallment(inst)}
                          aria-label={`Edit installment #${inst.seq}`}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setInstToDelete(inst)}
                          aria-label={`Delete installment #${inst.seq}`}
                          className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Candidate Payments List */}
      <div className="pt-6 border-t border-slate-200 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Payments ({payments.length})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Review payment proofs and confirm or reject pending receipts.
          </p>
        </div>

        {paymentFeedback && (
          <div
            role={paymentFeedback.type === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-lg text-xs flex items-center justify-between gap-3 ${
              paymentFeedback.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{paymentFeedback.message}</span>
            <button
              type="button"
              onClick={() => setPaymentFeedback(null)}
              aria-label="Dismiss payment message"
              className="p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {payments.length === 0 ? (
          <EmptyState
            title="No payments submitted yet"
            description="When this candidate submits a fee payment proof, it will appear here for confirmation."
          />
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Paid On</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-left">Linked Installment</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((pay) => {
                    const linkedSeq = pay.installment_id
                      ? seqByInstallmentId.get(pay.installment_id)
                      : undefined;
                    const isConfirming = confirmingPaymentId === pay.id;

                    return (
                      <tr
                        key={pay.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDate(pay.paid_on)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatInr(pay.amount)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                          {pay.reference || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {linkedSeq !== undefined ? (
                            <span className="font-mono font-medium text-slate-800 tabular-nums">
                              Installment #{linkedSeq}
                            </span>
                          ) : pay.installment_id ? (
                            <span className="text-slate-600">
                              Linked installment
                            </span>
                          ) : (
                            <span className="text-slate-400">Unlinked</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <PaymentStatusBadge status={pay.status} />
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            {pay.proof_path && (
                              <button
                                type="button"
                                onClick={() => setPreviewProofPayment(pay)}
                                aria-label={`View proof for payment ${pay.reference || pay.id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View proof
                              </button>
                            )}

                            {pay.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleConfirmPayment(pay)}
                                  disabled={isConfirming}
                                  aria-label={`Confirm payment ${pay.reference || pay.id}`}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  {isConfirming ? 'Confirming…' : 'Confirm'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPaymentToReject(pay)}
                                  disabled={isConfirming}
                                  aria-label={`Reject payment ${pay.reference || pay.id}`}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Reject
                                </button>
                              </>
                            )}
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
              {payments.map((pay) => {
                const linkedSeq = pay.installment_id
                  ? seqByInstallmentId.get(pay.installment_id)
                  : undefined;
                const isConfirming = confirmingPaymentId === pay.id;

                return (
                  <div key={pay.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                          {formatInr(pay.amount)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Paid {formatDate(pay.paid_on)}
                          {linkedSeq !== undefined
                            ? ` · Installment #${linkedSeq}`
                            : ''}
                        </p>
                      </div>
                      <PaymentStatusBadge status={pay.status} />
                    </div>

                    <p className="text-xs text-slate-600">
                      Ref:{' '}
                      <span className="font-mono text-slate-800 tabular-nums">
                        {pay.reference || '—'}
                      </span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {pay.proof_path && (
                        <button
                          type="button"
                          onClick={() => setPreviewProofPayment(pay)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View proof
                        </button>
                      )}
                      {pay.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleConfirmPayment(pay)}
                            disabled={isConfirming}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {isConfirming ? 'Confirming…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentToReject(pay)}
                            disabled={isConfirming}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Installment Modal */}
      <Modal
        open={instModalOpen}
        onClose={() => !instSaving && setInstModalOpen(false)}
        title={
          editingInstallment
            ? `Edit Installment #${editingInstallment.seq}`
            : 'Add Installment'
        }
        description={`Candidate: ${candidateLabel}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveInstallment} className="space-y-4" noValidate>
          {instModalError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {instModalError}
            </div>
          )}

          <div>
            <label
              htmlFor="inst-seq-input"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Installment Sequence (#)
            </label>
            <input
              id="inst-seq-input"
              type="number"
              min="1"
              step="1"
              required
              value={instSeqInput}
              onChange={(e) => setInstSeqInput(e.target.value)}
              className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="inst-due-date-input"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Due Date
            </label>
            <input
              id="inst-due-date-input"
              type="date"
              required
              value={instDueDateInput}
              onChange={(e) => setInstDueDateInput(e.target.value)}
              className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="inst-amount-input"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Amount (₹)
            </label>
            <input
              id="inst-amount-input"
              type="number"
              min="1"
              step="1"
              required
              value={instAmountInput}
              onChange={(e) => setInstAmountInput(e.target.value)}
              placeholder="50000"
              className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setInstModalOpen(false)}
              disabled={instSaving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={instSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {instSaving
                ? 'Saving…'
                : editingInstallment
                  ? 'Save Changes'
                  : 'Add Installment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Installment Confirmation */}
      <ConfirmDialog
        open={Boolean(instToDelete)}
        onClose={() => !instDeleting && setInstToDelete(null)}
        onConfirm={() => void handleConfirmDeleteInstallment()}
        loading={instDeleting}
        title={
          instToDelete
            ? `Delete Installment #${instToDelete.seq}?`
            : 'Delete Installment?'
        }
        message={
          instToDelete
            ? `Remove installment #${instToDelete.seq} (${formatInr(instToDelete.amount)} due ${formatDate(instToDelete.due_date)})? Installments with linked payments cannot be deleted.`
            : ''
        }
        confirmLabel="Delete Installment"
        tone="danger"
      />

      {/* Reject Payment Confirmation */}
      <ConfirmDialog
        open={Boolean(paymentToReject)}
        onClose={() => !rejectingPayment && setPaymentToReject(null)}
        onConfirm={() => void handleConfirmRejectPayment()}
        loading={rejectingPayment}
        title="Reject this payment?"
        message={
          paymentToReject
            ? `Mark the payment of ${formatInr(paymentToReject.amount)} (Ref: ${paymentToReject.reference || '—'}) as rejected? The candidate will be prompted to submit again with the correct proof.`
            : ''
        }
        confirmLabel="Reject Payment"
        tone="danger"
      />

      {/* 60-Second Signed URL Payment Proof Preview */}
      <DocumentPreviewModal
        open={Boolean(previewProofPayment)}
        storagePath={previewProofPayment?.proof_path ?? null}
        title={
          previewProofPayment
            ? `Payment Proof · ${formatInr(previewProofPayment.amount)}`
            : 'Payment Proof'
        }
        subtitle={`${candidateLabel}${
          previewProofPayment?.reference
            ? ` · Ref: ${previewProofPayment.reference}`
            : ''
        }`}
        onClose={() => setPreviewProofPayment(null)}
      />
    </section>
  );
}
