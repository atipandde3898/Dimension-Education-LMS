import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Briefcase,
  Check,
  Eye,
  FileText,
  GraduationCap,
  Send,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  Candidate,
  CandidateCv,
  CandidateDocument,
  CandidateEducation,
  CandidateOverview,
  CandidatePan,
  CandidateWork,
  ConsentAcceptance,
  ConsentClause,
  DocTypeValue,
  OpportunityResponse,
  Profile,
} from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  CANDIDATE_STATUS_OPTIONS,
  DOC_TYPE_LABELS,
  REQUIRED_DOC_TYPES,
  buildDocumentApprovePayload,
  buildDocumentRejectPayload,
  computeOnboardingProgress,
  formatCandidateStatusLabel,
  formatDateTime,
  formatDbError,
  formatPipelineStageLabel,
  formatResponseStateLabel,
  formatTicketDateTime,
  maskPan,
  parseFunctionsError,
} from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  DocumentPreviewModal,
  DocumentStatusBadge,
  RejectDocumentModal,
} from '../ui/DocumentWidgets';
import { Modal } from '../ui/Modal';
import { ErrorState, TableSkeleton } from '../ui/States';
import { CandidateFeesSection } from './CandidateFeesSection';
import { CandidateFormModal } from './CandidateFormModal';
import { CandidatePlacementSection } from './CandidatePlacementSection';

interface CandidateDetailViewProps {
  candidateId: string;
  adminUserId: string;
  onBack: () => void;
  onDeleted?: (message: string) => void;
  onSelectBatch: (batchId: string) => void;
  onCandidateCodeLoaded?: (code: string) => void;
}

const STATUS_STYLES: Record<CandidateOverview['status'], string> = {
  enrolled: 'text-amber-700',
  in_training: 'text-emerald-700',
  certified: 'text-blue-700',
  dropped: 'text-red-700',
};

type CandidateStatusValue = Candidate['status'];

export function CandidateDetailView({
  candidateId,
  adminUserId,
  onBack,
  onDeleted,
  onSelectBatch,
  onCandidateCodeLoaded,
}: CandidateDetailViewProps) {
  const [overview, setOverview] = useState<CandidateOverview | null>(null);
  const [candidateRecord, setCandidateRecord] = useState<Candidate | null>(
    null,
  );
  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [maskedPan, setMaskedPan] = useState<string | null>(null);
  const [activeCounsellors, setActiveCounsellors] = useState<Profile[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Profile photo, Education, Work, CV & Consent state
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [education, setEducation] = useState<CandidateEducation | null>(null);
  const [work, setWork] = useState<CandidateWork | null>(null);
  const [cv, setCv] = useState<CandidateCv | null>(null);
  const [consentClauses, setConsentClauses] = useState<ConsentClause[]>([]);
  const [consentAcceptances, setConsentAcceptances] = useState<
    ConsentAcceptance[]
  >([]);
  const [candidateOpportunities, setCandidateOpportunities] = useState<
    OpportunityResponse[]
  >([]);

  // Status dropdown state
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);
  const [confirmDropOpen, setConfirmDropOpen] = useState(false);

  // Certification code state
  const [certCode, setCertCode] = useState('');
  const [savingCertCode, setSavingCertCode] = useState(false);
  const [certFeedback, setCertFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  // Danger zone / delete candidate state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState('');
  const [hasPaymentsWarning, setHasPaymentsWarning] = useState<string | null>(
    null,
  );
  const [deletePaymentsConfirmed, setDeletePaymentsConfirmed] = useState(false);
  const [deletingCandidate, setDeletingCandidate] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Change counsellor state
  const [changeCounsellorModalOpen, setChangeCounsellorModalOpen] =
    useState(false);
  const [selectedCounsellorId, setSelectedCounsellorId] = useState('');
  const [confirmChangeCounsellorOpen, setConfirmChangeCounsellorOpen] =
    useState(false);
  const [savingCounsellor, setSavingCounsellor] = useState(false);
  const [counsellorError, setCounsellorError] = useState<string | null>(null);

  // Document review state
  const [docFeedback, setDocFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);
  const [approvingDocId, setApprovingDocId] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{
    storagePath: string;
    title: string;
  } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CandidateDocument | null>(
    null,
  );
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const loadDetail = useCallback(
    async (showSkeleton = true) => {
      const client = supabase;
      if (!client) return;
      if (showSkeleton) setLoading(true);
      setError(null);

      const [
        ovRes,
        candRes,
        docsRes,
        panRes,
        eduRes,
        workRes,
        cvRes,
        counsRes,
        clausesRes,
        acceptancesRes,
        oppsRes,
      ] = await Promise.all([
        client
          .from('v_candidate_overview')
          .select(
            'candidate_id, candidate_code, full_name, email, phone, status, program, module, batch_code, batch_mode, counsellor, certification_code, net_fee, paid, pending, handed_over, handover_date, placement_member',
          )
          .eq('candidate_id', candidateId)
          .single(),
        client
          .from('candidates')
          .select(
            'id, profile_id, candidate_code, full_name, email, phone, program_id, module_id, batch_id, counsellor_id, status, certification_code',
          )
          .eq('id', candidateId)
          .maybeSingle(),
        client
          .from('documents')
          .select(
            'id, candidate_id, doc_type, storage_path, status, review_note, reviewed_by, reviewed_at, uploaded_at',
          )
          .eq('candidate_id', candidateId),
        client
          .from('candidate_pan')
          .select('candidate_id, pan_number')
          .eq('candidate_id', candidateId)
          .maybeSingle(),
        client
          .from('candidate_education')
          .select(
            'candidate_id, ssc_year, ssc_percent, hsc_na, hsc_year, hsc_percent, diploma_na, diploma_stream, diploma_year, diploma_percent, graduation_na, graduation_stream, graduation_degree, graduation_year, graduation_percent, graduation_university, pg_na, pg_stream, pg_degree, pg_year, pg_percent, pg_university',
          )
          .eq('candidate_id', candidateId)
          .maybeSingle(),
        client
          .from('candidate_work')
          .select(
            'candidate_id, work_type, total_exp_years, sap_consultant_exp_years, sap_end_user_exp_years, relevant_domain_exp_years, current_ctc_lakhs, notice_period_months',
          )
          .eq('candidate_id', candidateId)
          .maybeSingle(),
        client
          .from('candidate_cv')
          .select('candidate_id, storage_path, file_name')
          .eq('candidate_id', candidateId)
          .maybeSingle(),
        client
          .from('profiles')
          .select('id, full_name, email, phone, role, active')
          .eq('role', 'counsellor')
          .eq('active', true),
        client
          .from('consent_clauses')
          .select('id, version, position, title, body, required, active')
          .eq('active', true)
          .order('position', { ascending: true }),
        client
          .from('consent_acceptances')
          .select('id, candidate_id, clause_id, typed_name, accepted_at')
          .eq('candidate_id', candidateId),
        client
          .from('v_opportunity_responses')
          .select(
            'recipient_id, opportunity_id, company, job_title, candidate_id, candidate_code, full_name, email, phone, module, stage, sent_at, expires_at, response, responded_at, pipeline_stage, stage_note, stage_updated_at, response_state',
          )
          .eq('candidate_id', candidateId)
          .order('sent_at', { ascending: false }),
      ]);

      if (ovRes.error || !ovRes.data) {
        setError(formatDbError(ovRes.error ?? 'Candidate not found.'));
        setLoading(false);
        return;
      }

      const loadedOverview = ovRes.data as CandidateOverview;
      const loadedCand = (candRes.data as Candidate | null) ?? null;
      const loadedDocs = (docsRes.data as CandidateDocument[] | null) ?? [];
      setOverview(loadedOverview);
      setCandidateRecord(loadedCand);
      setCertCode(
        loadedCand?.certification_code ?? loadedOverview.certification_code ?? '',
      );
      setDocuments(loadedDocs);
      setEducation(
        eduRes.error
          ? null
          : ((eduRes.data as CandidateEducation | null) ?? null),
      );
      setWork(
        workRes.error ? null : ((workRes.data as CandidateWork | null) ?? null),
      );
      setCv(cvRes.error ? null : ((cvRes.data as CandidateCv | null) ?? null));
      setActiveCounsellors((counsRes.data as Profile[]) ?? []);
      setConsentClauses((clausesRes.data as ConsentClause[]) ?? []);
      setConsentAcceptances(
        (acceptancesRes.data as ConsentAcceptance[]) ?? [],
      );
      setCandidateOpportunities(
        oppsRes.error ? [] : ((oppsRes.data as OpportunityResponse[]) ?? []),
      );

      // Mask PAN immediately so raw PAN never enters component state or DOM
      const panRow = (panRes.data as CandidatePan | null) ?? null;
      setMaskedPan(maskPan(panRow?.pan_number));

      // Profile photo signed URL (60 seconds)
      const photoDoc = loadedDocs.find((d) => d.doc_type === 'profile_photo');
      if (photoDoc?.storage_path) {
        const { data: signedData } = await client.storage
          .from(CANDIDATE_DOCS_BUCKET)
          .createSignedUrl(photoDoc.storage_path, 60);
        setProfilePhotoUrl(signedData?.signedUrl ?? null);
      } else {
        setProfilePhotoUrl(null);
      }

      onCandidateCodeLoaded?.(loadedOverview.candidate_code);
      setLoading(false);
    },
    [candidateId, onCandidateCodeLoaded],
  );

  useEffect(() => {
    void loadDetail(true);
  }, [loadDetail]);

  const executeStatusUpdate = async (nextStatus: CandidateStatusValue) => {
    const client = supabase;
    if (!client || !overview) return;

    setStatusUpdating(true);
    setStatusFeedback(null);

    const { error: updateErr } = await client
      .from('candidates')
      .update({ status: nextStatus })
      .eq('id', candidateId);

    setStatusUpdating(false);

    if (updateErr) {
      setStatusFeedback({
        type: 'error',
        message: formatDbError(updateErr),
      });
      return;
    }

    setStatusFeedback({
      type: 'success',
      message: `Candidate status updated to ${formatCandidateStatusLabel(nextStatus)}.`,
    });
    await loadDetail(false);
  };

  const handleStatusSelectChange = (nextStatus: CandidateStatusValue) => {
    if (!overview) return;
    const currentStatus = candidateRecord?.status ?? overview.status;
    if (nextStatus === currentStatus) return;

    if (nextStatus === 'dropped') {
      setConfirmDropOpen(true);
      return;
    }
    void executeStatusUpdate(nextStatus);
  };

  const handleSaveCertCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const trimmed = certCode.trim();
    if (trimmed && (trimmed.length < 2 || trimmed.length > 100)) {
      setCertFeedback({
        type: 'error',
        message: 'Certification code must be between 2 and 100 characters.',
      });
      return;
    }

    setSavingCertCode(true);
    setCertFeedback(null);

    const { error: updErr } = await client
      .from('candidates')
      .update({ certification_code: trimmed || null })
      .eq('id', candidateId);

    setSavingCertCode(false);

    if (updErr) {
      setCertFeedback({
        type: 'error',
        message: formatDbError(updErr),
      });
      return;
    }

    setCertFeedback({
      type: 'success',
      message: trimmed
        ? `Certification code saved (${trimmed}).`
        : 'Certification code cleared.',
    });
    await loadDetail(false);
  };

  const handleExecuteDeleteCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client || !overview) return;

    if (deleteEmailInput.trim().toLowerCase() !== overview.email.toLowerCase()) {
      setDeleteError('Email address does not match this candidate.');
      return;
    }

    if (hasPaymentsWarning && !deletePaymentsConfirmed) {
      setDeleteError(
        'Please confirm that you understand this permanently deletes the fee and payment records.',
      );
      return;
    }

    setDeletingCandidate(true);
    setDeleteError(null);

    const force = Boolean(hasPaymentsWarning && deletePaymentsConfirmed);
    const { data, error: fnErr } = await client.functions.invoke(
      'admin-delete',
      {
        body: {
          target: 'candidate',
          id: candidateId,
          confirm: deleteEmailInput.trim(),
          force,
        },
      },
    );

    if (fnErr) {
      const parsed = await parseFunctionsError(fnErr);
      setDeletingCandidate(false);
      if (parsed.error === 'has_payments') {
        setHasPaymentsWarning(parsed.message);
      } else {
        setDeleteError(parsed.message);
      }
      return;
    }

    setDeletingCandidate(false);
    setDeleteModalOpen(false);
    const successText =
      (data as { message?: string } | null)?.message ||
      `Candidate ${overview.full_name} permanently deleted.`;
    if (onDeleted) {
      onDeleted(successText);
    } else {
      onBack();
    }
  };

  const handleApproveDoc = async (doc: CandidateDocument) => {
    const client = supabase;
    if (!client) return;

    setApprovingDocId(doc.id);
    setDocFeedback(null);

    const payload = buildDocumentApprovePayload(adminUserId);
    const { error: updateErr } = await client
      .from('documents')
      .update(payload)
      .eq('id', doc.id);

    setApprovingDocId(null);

    if (updateErr) {
      setDocFeedback({
        type: 'error',
        message: formatDbError(updateErr),
      });
      return;
    }

    setDocFeedback({
      type: 'success',
      message: `${DOC_TYPE_LABELS[doc.doc_type]} marked as approved.`,
    });
    await loadDetail(false);
  };

  const handleConfirmRejectDoc = async (note: string) => {
    const client = supabase;
    if (!client || !rejectTarget) return;

    const built = buildDocumentRejectPayload(adminUserId, note);
    if (!built.ok) {
      setRejectError(built.error);
      return;
    }

    setRejectLoading(true);
    setRejectError(null);
    setDocFeedback(null);

    const { error: updateErr } = await client
      .from('documents')
      .update(built.payload)
      .eq('id', rejectTarget.id);

    setRejectLoading(false);

    if (updateErr) {
      setRejectError(formatDbError(updateErr));
      return;
    }

    const docLabel = DOC_TYPE_LABELS[rejectTarget.doc_type];
    setRejectTarget(null);
    setDocFeedback({
      type: 'success',
      message: `${docLabel} rejected with review note.`,
    });
    await loadDetail(false);
  };

  const selectedCounsellorObj = activeCounsellors.find(
    (c) => c.id === selectedCounsellorId,
  );
  const selectedCounsellorName = selectedCounsellorObj
    ? selectedCounsellorObj.full_name || selectedCounsellorObj.email
    : 'None (Unassigned)';

  const executeChangeCounsellor = async () => {
    const client = supabase;
    if (!client || !candidateRecord) return;

    setSavingCounsellor(true);
    setCounsellorError(null);

    const { error: err } = await client
      .from('candidates')
      .update({ counsellor_id: selectedCounsellorId || null })
      .eq('id', candidateId);

    setSavingCounsellor(false);

    if (err) {
      setCounsellorError(formatDbError(err));
      return;
    }

    setConfirmChangeCounsellorOpen(false);
    setChangeCounsellorModalOpen(false);
    setStatusFeedback({
      type: 'success',
      message: `Academic counsellor changed to ${selectedCounsellorName}.`,
    });
    await loadDetail(false);
  };

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
          Back to Candidates
        </button>
        <ErrorState
          title="Could not load candidate details"
          message={error ?? 'Candidate not found.'}
          onRetry={() => void loadDetail(true)}
        />
      </div>
    );
  }

  const currentStatus = candidateRecord?.status ?? overview.status;
  const progress = computeOnboardingProgress(documents);

  const docMap = new Map<DocTypeValue, CandidateDocument>();
  for (const d of documents) {
    docMap.set(d.doc_type, d);
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Candidates
      </button>

      {/* Primary Profile Card */}
      <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-5 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Prominent Profile Photo */}
            <div className="relative shrink-0">
              {profilePhotoUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    const photoDoc = docMap.get('profile_photo');
                    if (photoDoc) {
                      setPreviewTarget({
                        storagePath: photoDoc.storage_path,
                        title: DOC_TYPE_LABELS[photoDoc.doc_type],
                      });
                    }
                  }}
                  title="Click to view full photo"
                  className="group relative block focus:outline-none"
                >
                  <img
                    src={profilePhotoUrl}
                    alt={overview.full_name}
                    className="w-20 h-20 rounded-xl object-cover border-2 border-slate-200 shadow-xs group-hover:opacity-90 transition-opacity"
                  />
                  <div className="absolute inset-0 rounded-xl bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Eye className="w-4 h-4" />
                  </div>
                </button>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400">
                  <User className="w-8 h-8 text-slate-400" />
                  <span className="text-[10px] mt-0.5 font-medium">No photo</span>
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span className="font-mono font-semibold text-blue-700 tabular-nums">
                  {overview.candidate_code}
                </span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span
                  className={`font-medium ${
                    STATUS_STYLES[currentStatus]
                  }`}
                >
                  {formatCandidateStatusLabel(currentStatus)}
                </span>
                {(overview.certification_code ||
                  candidateRecord?.certification_code) && (
                  <>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-mono text-[11px] font-semibold tabular-nums">
                      <Award className="w-3 h-3 text-blue-600" />
                      {overview.certification_code ||
                        candidateRecord?.certification_code}
                    </span>
                  </>
                )}
              </div>

              <h1 className="mt-1.5 text-2xl font-semibold text-slate-900 tracking-tight">
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

              {/* Photo Status & Prominent Top Actions */}
              {(() => {
                const photoDoc = docMap.get('profile_photo');
                if (!photoDoc) {
                  return (
                    <div className="mt-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md">
                        Profile photo not uploaded
                      </span>
                    </div>
                  );
                }
                const isApproving = approvingDocId === photoDoc.id;
                return (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <DocumentStatusBadge status={photoDoc.status} />
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewTarget({
                          storagePath: photoDoc.storage_path,
                          title: DOC_TYPE_LABELS[photoDoc.doc_type],
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApproveDoc(photoDoc)}
                      disabled={isApproving || photoDoc.status === 'approved'}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isApproving ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectError(null);
                        setRejectTarget(photoDoc);
                      }}
                      disabled={isApproving}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start">
            <div className="flex items-center gap-2">
              <label
                htmlFor="candidate-status-select"
                className="text-xs font-medium text-slate-500 whitespace-nowrap"
              >
                Status
              </label>
              <select
                id="candidate-status-select"
                aria-label="Candidate status"
                value={currentStatus}
                disabled={statusUpdating}
                onChange={(e) =>
                  handleStatusSelectChange(
                    e.target.value as CandidateStatusValue,
                  )
                }
                className="px-3 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
              >
                {CANDIDATE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Edit Candidate
            </button>
          </div>
        </div>

        {currentStatus === 'certified' && (
          <form
            onSubmit={handleSaveCertCode}
            className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label
                  htmlFor="candidate-cert-code-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Certification code (optional)
                </label>
                <input
                  id="candidate-cert-code-input"
                  type="text"
                  minLength={2}
                  maxLength={100}
                  placeholder="Enter certification code (2 to 100 characters)…"
                  value={certCode}
                  disabled={savingCertCode}
                  onChange={(e) => {
                    setCertCode(e.target.value);
                    if (certFeedback) setCertFeedback(null);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={savingCertCode}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {savingCertCode ? 'Saving…' : 'Save'}
              </button>
            </div>
            {certFeedback && (
              <p
                role={certFeedback.type === 'error' ? 'alert' : 'status'}
                className={`text-xs font-medium ${
                  certFeedback.type === 'error'
                    ? 'text-red-700'
                    : 'text-emerald-700'
                }`}
              >
                {certFeedback.message}
              </p>
            )}
          </form>
        )}

        {statusFeedback && (
          <div
            role={statusFeedback.type === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-lg text-xs flex items-center justify-between gap-3 ${
              statusFeedback.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{statusFeedback.message}</span>
            <button
              type="button"
              onClick={() => setStatusFeedback(null)}
              aria-label="Dismiss status message"
              className="p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Academic & Mentoring */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 mb-3">
            Enrollment &amp; Mentoring
          </h2>
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
              <dt className="text-xs text-slate-500">Assigned Batch</dt>
              <dd className="mt-1">
                {overview.batch_code ? (
                  <div>
                    {candidateRecord?.batch_id ? (
                      <button
                        type="button"
                        onClick={() => onSelectBatch(candidateRecord.batch_id!)}
                        className="font-mono text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline tabular-nums"
                      >
                        {overview.batch_code}
                      </button>
                    ) : (
                      <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {overview.batch_code}
                      </span>
                    )}
                    {overview.batch_mode && (
                      <span className="text-xs text-slate-500 capitalize">
                        {' '}
                        · {overview.batch_mode}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Not assigned yet</span>
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline whitespace-nowrap"
                    >
                      Assign batch
                    </button>
                  </div>
                )}
              </dd>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <dt className="text-xs text-slate-500">Academic Counsellor</dt>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCounsellorId(
                      candidateRecord?.counsellor_id ?? '',
                    );
                    setCounsellorError(null);
                    setChangeCounsellorModalOpen(true);
                  }}
                  className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                >
                  Change
                </button>
              </div>
              <dd className="mt-1 font-medium text-slate-900">
                {overview.counsellor || '—'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Onboarding Documents & Masked PAN */}
      <section
        aria-labelledby="candidate-documents-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2
              id="candidate-documents-heading"
              className="text-base font-semibold text-slate-900"
            >
              Documents &amp; Identity Verification
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {progress.approvedCount} of {progress.totalCount} required documents approved.
            </p>
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg self-start sm:self-auto">
            <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-500">PAN:</span>
            {maskedPan ? (
              <span className="font-mono text-xs font-semibold text-slate-900 tracking-wider tabular-nums">
                {maskedPan}
              </span>
            ) : (
              <span className="text-xs text-slate-400">Not submitted</span>
            )}
          </div>
        </div>

        {docFeedback && (
          <div
            role={docFeedback.type === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-lg text-xs flex items-center justify-between gap-3 ${
              docFeedback.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{docFeedback.message}</span>
            <button
              type="button"
              onClick={() => setDocFeedback(null)}
              aria-label="Dismiss document feedback"
              className="p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {REQUIRED_DOC_TYPES.map((docType) => {
            const doc = docMap.get(docType);
            const label = DOC_TYPE_LABELS[docType];
            const isApproving = doc ? approvingDocId === doc.id : false;

            return (
              <div
                key={docType}
                className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-semibold text-slate-900">
                      {label}
                    </span>
                    <DocumentStatusBadge status={doc?.status ?? 'not_uploaded'} />
                  </div>

                  {doc ? (
                    <p className="text-xs text-slate-500">
                      Uploaded{' '}
                      <span className="font-mono tabular-nums">
                        {formatDateTime(doc.uploaded_at)}
                      </span>
                      {doc.reviewed_at && (
                        <>
                          {' '}
                          · Reviewed{' '}
                          <span className="font-mono tabular-nums">
                            {formatDateTime(doc.reviewed_at)}
                          </span>
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Candidate has not uploaded this document yet.
                    </p>
                  )}

                  {doc?.status === 'rejected' && doc.review_note && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5 mt-1.5">
                      <span className="font-semibold">Review note:</span>{' '}
                      {doc.review_note}
                    </p>
                  )}
                </div>

                {doc && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewTarget({
                          storagePath: doc.storage_path,
                          title: label,
                        })
                      }
                      aria-label={`View ${label}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleApproveDoc(doc)}
                      disabled={isApproving || doc.status === 'approved'}
                      aria-label={`Approve ${label}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-40"
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
                      aria-label={`Reject ${label}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Consent Section */}
      <section
        aria-labelledby="candidate-consent-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2
              id="candidate-consent-heading"
              className="text-base font-semibold text-slate-900"
            >
              Consent
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Legal agreements, terms, and candidate policy signatures.
            </p>
          </div>
          <div className="text-xs font-medium text-slate-600">
            {consentAcceptances.length} of {consentClauses.length} clauses accepted
          </div>
        </div>

        {consentClauses.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">
            No active consent clauses configured in the system.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {consentClauses.map((clause) => {
              const acceptance = consentAcceptances.find(
                (a) => a.clause_id === clause.id,
              );
              return (
                <div
                  key={clause.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {clause.title}
                      </span>
                      <span className="text-[11px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                        v{clause.version}
                      </span>
                      {clause.required && (
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Required
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {acceptance ? (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          Accepted on{' '}
                          <span className="font-mono tabular-nums">
                            {formatDateTime(acceptance.accepted_at)}
                          </span>{' '}
                          by{' '}
                          <strong className="font-semibold">
                            {acceptance.typed_name}
                          </strong>
                        </span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span>Not accepted yet</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Education Section (read-only) */}
      <section
        aria-labelledby="candidate-education-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
      >
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <GraduationCap className="w-4 h-4 text-[#0B7C7C]" />
          <div>
            <h2
              id="candidate-education-heading"
              className="text-base font-semibold text-slate-900"
            >
              Education
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Academic qualifications submitted during onboarding.
            </p>
          </div>
        </div>

        {!education ? (
          <p className="text-xs text-slate-400 py-1">
            Education details not submitted yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {/* SSC */}
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                SSC (10th Standard)
              </p>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-slate-500">Passing year</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                    {education.ssc_year ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Percentage</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                    {education.ssc_percent != null
                      ? `${education.ssc_percent}%`
                      : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* HSC */}
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">
                  HSC (12th Standard)
                </p>
                {education.hsc_na && (
                  <span className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 rounded">
                    Not applicable
                  </span>
                )}
              </div>
              {education.hsc_na ? (
                <p className="text-xs text-slate-500">Not applicable</p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Passing year</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {education.hsc_year ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Percentage</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {education.hsc_percent != null
                        ? `${education.hsc_percent}%`
                        : '—'}
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Engineering diploma */}
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">
                  Engineering diploma
                </p>
                {education.diploma_na && (
                  <span className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 rounded">
                    Not applicable
                  </span>
                )}
              </div>
              {education.diploma_na ? (
                <p className="text-xs text-slate-500">Not applicable</p>
              ) : (
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Stream</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {education.diploma_stream || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Passing year</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {education.diploma_year ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Percentage</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {education.diploma_percent != null
                        ? `${education.diploma_percent}%`
                        : '—'}
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Graduation */}
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">
                  Graduation
                </p>
                {education.graduation_na && (
                  <span className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 rounded">
                    Not applicable
                  </span>
                )}
              </div>
              {education.graduation_na ? (
                <p className="text-xs text-slate-500">Not applicable</p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Degree</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {education.graduation_degree || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Stream</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {education.graduation_stream || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Passing year</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {education.graduation_year ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Percentage</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {education.graduation_percent != null
                        ? `${education.graduation_percent}%`
                        : '—'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">University</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {education.graduation_university || '—'}
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Post graduation */}
            <div className="md:col-span-2 p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">
                  Post graduation
                </p>
                {education.pg_na && (
                  <span className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 rounded">
                    Not applicable
                  </span>
                )}
              </div>
              {education.pg_na ? (
                <p className="text-xs text-slate-500">Not applicable</p>
              ) : (
                <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Degree</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {education.pg_degree || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Stream</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {education.pg_stream || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Passing year</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {education.pg_year ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Percentage</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {education.pg_percent != null
                        ? `${education.pg_percent}%`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">University</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {education.pg_university || '—'}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Work Background Section (read-only) */}
      <section
        aria-labelledby="candidate-work-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Briefcase className="w-4 h-4 text-[#0B7C7C]" />
            <div>
              <h2
                id="candidate-work-heading"
                className="text-base font-semibold text-slate-900"
              >
                Work background
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Employment history and SAP / domain experience.
              </p>
            </div>
          </div>

          {work && (
            <span className="px-2.5 py-1 text-xs font-medium bg-[#E6F6F6] text-[#0B7C7C] rounded-md">
              {work.work_type === 'fresher'
                ? 'Fresher'
                : 'Working professional'}
            </span>
          )}
        </div>

        {!work ? (
          <p className="text-xs text-slate-400 py-1">
            Work background not submitted yet.
          </p>
        ) : work.work_type === 'fresher' ? (
          <p className="text-sm text-slate-700">
            Fresher — no prior full-time work experience.
          </p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg">
              <dt className="text-xs text-slate-500">Total experience</dt>
              <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                {work.total_exp_years ?? 0} yrs
              </dd>
            </div>
            <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg">
              <dt className="text-xs text-slate-500">
                SAP consultant experience
              </dt>
              <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                {work.sap_consultant_exp_years ?? 0} yrs
              </dd>
            </div>
            <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg">
              <dt className="text-xs text-slate-500">SAP end-user experience</dt>
              <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                {work.sap_end_user_exp_years ?? 0} yrs
              </dd>
            </div>
            <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg">
              <dt className="text-xs text-slate-500">
                Relevant domain experience
              </dt>
              <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                {work.relevant_domain_exp_years ?? 0} yrs
              </dd>
            </div>
            <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg">
              <dt className="text-xs text-slate-500">Current CTC</dt>
              <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                {work.current_ctc_lakhs != null
                  ? `₹${work.current_ctc_lakhs} LPA`
                  : '—'}
              </dd>
            </div>
            <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg">
              <dt className="text-xs text-slate-500">Notice period</dt>
              <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                {work.notice_period_months != null
                  ? `${work.notice_period_months} month${work.notice_period_months === 1 ? '' : 's'}`
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {/* CV Section (read-only with 60s signed URL View) */}
      <section
        aria-labelledby="candidate-cv-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
      >
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <FileText className="w-4 h-4 text-[#0B7C7C]" />
          <div>
            <h2
              id="candidate-cv-heading"
              className="text-base font-semibold text-slate-900"
            >
              CV
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Resume / CV uploaded by the candidate.
            </p>
          </div>
        </div>

        {!cv ? (
          <p className="text-xs text-slate-400 py-1">
            CV has not been uploaded yet.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-[#0B7C7C] shrink-0" />
              <span className="text-sm font-medium text-slate-900 truncate">
                {cv.file_name}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setPreviewTarget({
                  storagePath: cv.storage_path,
                  title: `CV — ${cv.file_name}`,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-center whitespace-nowrap shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
              View
            </button>
          </div>
        )}
      </section>

      {/* Fees Section (Fee Plan, Installments Editor, Payments Review) */}
      <CandidateFeesSection
        candidateId={candidateId}
        adminUserId={adminUserId}
        candidateLabel={`${overview.full_name} (${overview.candidate_code})`}
        onFeesUpdated={() => void loadDetail(false)}
      />

      {/* Placement Section (Handover Form, Status, Edit & Remove) */}
      <CandidatePlacementSection
        candidateId={candidateId}
        adminUserId={adminUserId}
        candidateLabel={`${overview.full_name} (${overview.candidate_code})`}
        overviewHandover={{
          handed_over: overview.handed_over,
          handover_date: overview.handover_date,
          placement_member: overview.placement_member,
        }}
        onHandoverUpdated={() => void loadDetail(false)}
      />

      {/* Opportunities Section (sent opportunities, candidate responses, pipeline stages) */}
      <section
        aria-labelledby="candidate-opportunities-heading"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Send className="w-4 h-4 text-[#0B7C7C]" />
            <div>
              <h2
                id="candidate-opportunities-heading"
                className="text-base font-semibold text-slate-900"
              >
                Opportunities
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Job opportunities sent to this candidate and their placement pipeline status.
              </p>
            </div>
          </div>
          {candidateOpportunities.length > 0 && (
            <span className="text-xs font-medium text-slate-600 tabular-nums">
              {candidateOpportunities.length} sent
            </span>
          )}
        </div>

        {candidateOpportunities.length === 0 ? (
          <p className="text-xs text-slate-400 py-1">
            No opportunities have been sent to this candidate yet.
          </p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-[#F5F8FB] border-b border-[#E3E9F0]">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5B6B7F]">
                      Company
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5B6B7F]">
                      Job title
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5B6B7F]">
                      Sent date
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5B6B7F]">
                      Response
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5B6B7F]">
                      Pipeline stage
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E9F0]">
                  {candidateOpportunities.map((row) => {
                    const responseBadge =
                      row.response_state === 'interested'
                        ? 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]'
                        : row.response_state === 'not_interested'
                          ? 'bg-[#F5F8FB] text-[#5B6B7F] border-[#E3E9F0]'
                          : row.response_state === 'waiting'
                            ? 'bg-[#FDF4E0] text-[#C98A0B] border-[#F6DDA3]'
                            : 'bg-[#FBEAE9] text-[#C2413B] border-[#F4C5C2]';

                    return (
                      <tr key={row.recipient_id}>
                        <td className="px-4 py-3 font-medium text-[#0B1F3A]">
                          {row.company}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {row.job_title}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatTicketDateTime(row.sent_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2.5 py-0.5 text-xs font-semibold border rounded-md ${responseBadge}`}
                          >
                            {formatResponseStateLabel(row.response_state)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-800 whitespace-nowrap">
                          {row.pipeline_stage
                            ? formatPipelineStageLabel(row.pipeline_stage)
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {candidateOpportunities.map((row) => {
                const responseBadge =
                  row.response_state === 'interested'
                    ? 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]'
                    : row.response_state === 'not_interested'
                      ? 'bg-[#F5F8FB] text-[#5B6B7F] border-[#E3E9F0]'
                      : row.response_state === 'waiting'
                        ? 'bg-[#FDF4E0] text-[#C98A0B] border-[#F6DDA3]'
                        : 'bg-[#FBEAE9] text-[#C2413B] border-[#F4C5C2]';

                return (
                  <div key={row.recipient_id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {row.company}
                        </p>
                        <p className="text-xs text-slate-600 truncate">
                          {row.job_title}
                        </p>
                      </div>
                      <span
                        className={`inline-flex px-2 py-0.5 text-[11px] font-semibold border rounded-md shrink-0 ${responseBadge}`}
                      >
                        {formatResponseStateLabel(row.response_state)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-mono tabular-nums">
                        Sent {formatTicketDateTime(row.sent_at)}
                      </span>
                      <span className="font-medium text-slate-700">
                        Stage:{' '}
                        {row.pipeline_stage
                          ? formatPipelineStageLabel(row.pipeline_stage)
                          : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <CandidateFormModal
        open={editOpen}
        mode="edit"
        candidateId={candidateId}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          void loadDetail(false);
        }}
      />

      <ConfirmDialog
        open={confirmDropOpen}
        title="Mark candidate as dropped?"
        message={`This will change ${overview.full_name} (${overview.candidate_code}) to dropped status.`}
        confirmLabel="Mark as Dropped"
        loading={statusUpdating}
        onClose={() => setConfirmDropOpen(false)}
        onConfirm={() => {
          setConfirmDropOpen(false);
          void executeStatusUpdate('dropped');
        }}
      />

      <DocumentPreviewModal
        open={Boolean(previewTarget)}
        storagePath={previewTarget?.storagePath ?? null}
        title={previewTarget?.title ?? 'Document Preview'}
        subtitle={`${overview.full_name} (${overview.candidate_code})`}
        onClose={() => setPreviewTarget(null)}
      />

      <RejectDocumentModal
        open={Boolean(rejectTarget)}
        docTitle={
          rejectTarget ? DOC_TYPE_LABELS[rejectTarget.doc_type] : 'Document'
        }
        candidateLabel={`${overview.full_name} (${overview.candidate_code})`}
        loading={rejectLoading}
        error={rejectError}
        onClose={() => {
          if (!rejectLoading) {
            setRejectTarget(null);
            setRejectError(null);
          }
        }}
        onSubmitReject={(note) => void handleConfirmRejectDoc(note)}
      />

      <Modal
        open={changeCounsellorModalOpen}
        onClose={() => !savingCounsellor && setChangeCounsellorModalOpen(false)}
        title="Change Academic Counsellor"
        description={`Assign an academic counsellor for ${overview.full_name}. Counsellor assignment can be updated at any time, even after cohort batches are locked.`}
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirmChangeCounsellorOpen(true);
          }}
          className="space-y-4"
        >
          {counsellorError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {counsellorError}
            </div>
          )}

          <div>
            <label
              htmlFor="change-counsellor-select"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Select Counsellor (Active only)
            </label>
            <select
              id="change-counsellor-select"
              required
              value={selectedCounsellorId}
              onChange={(e) => setSelectedCounsellorId(e.target.value)}
              className="w-full pl-3.5 pr-9 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            >
              <option value="">Select a counsellor…</option>
              {activeCounsellors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.email} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setChangeCounsellorModalOpen(false)}
              disabled={savingCounsellor}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                savingCounsellor ||
                !selectedCounsellorId ||
                selectedCounsellorId === (candidateRecord?.counsellor_id ?? '')
              }
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              Save counsellor
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmChangeCounsellorOpen}
        title="Confirm Counsellor Change?"
        message={`Are you sure you want to assign "${selectedCounsellorName}" as academic counsellor for ${overview.full_name} (${overview.candidate_code})?`}
        confirmLabel="Confirm Assignment"
        loading={savingCounsellor}
        onClose={() => setConfirmChangeCounsellorOpen(false)}
        onConfirm={() => void executeChangeCounsellor()}
      />

      {/* Danger Zone */}
      <section
        aria-labelledby="candidate-danger-zone-heading"
        className="p-6 bg-red-50/40 border border-red-200 rounded-xl space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2
              id="candidate-danger-zone-heading"
              className="text-base font-semibold text-red-900 flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Danger zone
            </h2>
            <p className="text-xs text-red-700">
              Permanently remove this candidate record, uploaded files, and login account. If they left the program, consider changing their status to Dropped instead.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDeleteEmailInput('');
              setHasPaymentsWarning(null);
              setDeletePaymentsConfirmed(false);
              setDeleteError(null);
              setDeleteModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete candidate
          </button>
        </div>
      </section>

      {/* Permanent Candidate Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => !deletingCandidate && setDeleteModalOpen(false)}
        title="Delete candidate permanently?"
        description="This action cannot be undone."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleExecuteDeleteCandidate} className="space-y-4">
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1.5 leading-relaxed">
            <p>
              Deleting <strong>{overview.full_name}</strong> ({overview.candidate_code}) permanently removes their candidate record, uploaded documents/CV, and login access.
            </p>
            <p>
              <strong>Tip:</strong> If you only want to deactivate their portal access while preserving records, cancel this dialog and mark the candidate as <strong>Dropped</strong> instead.
            </p>
          </div>

          {hasPaymentsWarning && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-2.5">
              <p className="font-medium">{hasPaymentsWarning}</p>
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deletePaymentsConfirmed}
                  disabled={deletingCandidate}
                  onChange={(e) => {
                    setDeletePaymentsConfirmed(e.target.checked);
                    if (deleteError) setDeleteError(null);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400 text-red-600 focus:ring-red-600"
                />
                <span className="font-semibold">
                  I understand this permanently deletes the fee and payment records
                </span>
              </label>
            </div>
          )}

          {deleteError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {deleteError}
            </div>
          )}

          <div>
            <label
              htmlFor="confirm-delete-candidate-email"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Type <span className="font-mono font-semibold">{overview.email}</span> to confirm deletion
            </label>
            <input
              id="confirm-delete-candidate-email"
              type="email"
              required
              autoComplete="off"
              placeholder={overview.email}
              value={deleteEmailInput}
              disabled={deletingCandidate}
              onChange={(e) => {
                setDeleteEmailInput(e.target.value);
                if (deleteError) setDeleteError(null);
              }}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-red-600"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={deletingCandidate}
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                deletingCandidate ||
                deleteEmailInput.trim().toLowerCase() !==
                  overview.email.toLowerCase() ||
                (Boolean(hasPaymentsWarning) && !deletePaymentsConfirmed)
              }
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
            >
              {deletingCandidate
                ? 'Deleting…'
                : hasPaymentsWarning
                  ? 'Confirm & Force Delete'
                  : 'Delete candidate'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
