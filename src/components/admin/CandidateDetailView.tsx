import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Eye, ShieldCheck, User, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  Candidate,
  CandidateDocument,
  CandidateOverview,
  CandidatePan,
  ConsentAcceptance,
  ConsentClause,
  DocTypeValue,
  Profile,
} from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  DOC_TYPE_LABELS,
  REQUIRED_DOC_TYPES,
  buildDocumentApprovePayload,
  buildDocumentRejectPayload,
  computeOnboardingProgress,
  formatDateTime,
  formatDbError,
  maskPan,
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
  onSelectBatch: (batchId: string) => void;
  onCandidateCodeLoaded?: (code: string) => void;
}

const STATUS_STYLES: Record<CandidateOverview['status'], string> = {
  onboarding: 'text-amber-700',
  active: 'text-emerald-700',
  completed: 'text-blue-700',
  dropped: 'text-red-700',
};

type CandidateStatusValue = Candidate['status'];

const CANDIDATE_STATUS_OPTIONS: Array<{
  value: CandidateStatusValue;
  label: string;
}> = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' },
];

export function CandidateDetailView({
  candidateId,
  adminUserId,
  onBack,
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

  // Profile photo & Consent state
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [consentClauses, setConsentClauses] = useState<ConsentClause[]>([]);
  const [consentAcceptances, setConsentAcceptances] = useState<
    ConsentAcceptance[]
  >([]);

  // Status dropdown state
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);
  const [confirmDropOpen, setConfirmDropOpen] = useState(false);

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
  const [previewDoc, setPreviewDoc] = useState<CandidateDocument | null>(null);
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
        counsRes,
        clausesRes,
        acceptancesRes,
      ] = await Promise.all([
        client
          .from('v_candidate_overview')
          .select(
            'candidate_id, candidate_code, full_name, email, phone, status, program, module, batch_code, batch_mode, counsellor, net_fee, paid, pending, handed_over, handover_date, placement_member',
          )
          .eq('candidate_id', candidateId)
          .single(),
        client
          .from('candidates')
          .select(
            'id, profile_id, candidate_code, full_name, email, phone, program_id, module_id, batch_id, counsellor_id, status',
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
      ]);

      if (ovRes.error || !ovRes.data) {
        setError(formatDbError(ovRes.error ?? 'Candidate not found.'));
        setLoading(false);
        return;
      }

      const loadedOverview = ovRes.data as CandidateOverview;
      const loadedDocs = (docsRes.data as CandidateDocument[] | null) ?? [];
      setOverview(loadedOverview);
      setCandidateRecord((candRes.data as Candidate | null) ?? null);
      setDocuments(loadedDocs);
      setActiveCounsellors((counsRes.data as Profile[]) ?? []);
      setConsentClauses((clausesRes.data as ConsentClause[]) ?? []);
      setConsentAcceptances(
        (acceptancesRes.data as ConsentAcceptance[]) ?? [],
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
      message: `Candidate status updated to ${nextStatus}.`,
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
                    if (photoDoc) setPreviewDoc(photoDoc);
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
              <div className="flex items-center gap-2.5 text-xs">
                <span className="font-mono font-semibold text-blue-700 tabular-nums">
                  {overview.candidate_code}
                </span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span
                  className={`font-medium capitalize ${
                    STATUS_STYLES[currentStatus]
                  }`}
                >
                  {currentStatus}
                </span>
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
                      onClick={() => setPreviewDoc(photoDoc)}
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
                      onClick={() => setPreviewDoc(doc)}
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
        open={Boolean(previewDoc)}
        storagePath={previewDoc?.storage_path ?? null}
        title={
          previewDoc ? DOC_TYPE_LABELS[previewDoc.doc_type] : 'Document Preview'
        }
        subtitle={`${overview.full_name} (${overview.candidate_code})`}
        onClose={() => setPreviewDoc(null)}
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
    </div>
  );
}
