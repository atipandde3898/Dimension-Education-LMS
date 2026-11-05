import React, { useMemo, useRef, useState } from 'react';
import { Eye, Lock, RefreshCw, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CandidateDocument, DocTypeValue } from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  DOC_TYPE_LABELS,
  buildCandidateDocUpsertPayload,
  computeOnboardingProgress,
  formatDateTime,
  formatDbError,
  maskPan,
  normalizeAndValidatePan,
  validateAndBuildDocUpload,
} from '../../utils/domain';
import {
  DocumentPreviewModal,
  DocumentStatusBadge,
} from '../ui/DocumentWidgets';

interface CandidateOnboardingViewProps {
  candidateId: string;
  maskedPan: string | null;
  documents: CandidateDocument[];
  onRefresh: () => Promise<void>;
}

const CARD_DESCRIPTIONS: Record<DocTypeValue, string> = {
  pan: 'Upload a clear scan or photo of your Permanent Account Number (PAN) card.',
  photo_id:
    'Upload a valid government photo ID proof (Passport, Aadhaar, Voter ID, or Driving Licence).',
  enrollment_form:
    'Upload your signed enrollment form (PDF, JPG, or PNG, max 5 MB).',
};

const DOC_ORDER: DocTypeValue[] = ['pan', 'photo_id', 'enrollment_form'];

export function CandidateOnboardingView({
  candidateId,
  maskedPan,
  documents,
  onRefresh,
}: CandidateOnboardingViewProps) {
  // PAN form state — never pre-populated with raw PAN
  const [editingPan, setEditingPan] = useState(false);
  const [panInput, setPanInput] = useState('');
  const [panSaving, setPanSaving] = useState(false);
  const [panError, setPanError] = useState<string | null>(null);
  const [panSuccessMessage, setPanSuccessMessage] = useState<string | null>(
    null,
  );
  const [localMaskedPan, setLocalMaskedPan] = useState<string | null>(null);

  const displayedMaskedPan = localMaskedPan ?? maskedPan;

  // Per-document upload states (kept separate so retry works per card)
  const [selectedFiles, setSelectedFiles] = useState<
    Partial<Record<DocTypeValue, File>>
  >({});
  const [uploadingDoc, setUploadingDoc] = useState<
    Partial<Record<DocTypeValue, boolean>>
  >({});
  const [uploadErrors, setUploadErrors] = useState<
    Partial<Record<DocTypeValue, string | null>>
  >({});

  const fileInputRefs = useRef<
    Partial<Record<DocTypeValue, HTMLInputElement | null>>
  >({});

  // Document preview modal
  const [previewDoc, setPreviewDoc] = useState<{
    storagePath: string;
    title: string;
  } | null>(null);

  const docMap = useMemo(() => {
    const map = new Map<DocTypeValue, CandidateDocument>();
    for (const d of documents) {
      map.set(d.doc_type, d);
    }
    return map;
  }, [documents]);

  const progress = useMemo(
    () => computeOnboardingProgress(documents),
    [documents],
  );

  const panDocApproved = docMap.get('pan')?.status === 'approved';
  const showPanForm = !displayedMaskedPan || editingPan;

  const handleSavePan = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const check = normalizeAndValidatePan(panInput);
    if (!check.ok) {
      setPanError(check.error);
      setPanSuccessMessage(null);
      return;
    }

    setPanSaving(true);
    setPanError(null);
    setPanSuccessMessage(null);

    const { error: upsertErr } = await client
      .from('candidate_pan')
      .upsert(
        { candidate_id: candidateId, pan_number: check.pan },
        { onConflict: 'candidate_id' },
      );

    setPanSaving(false);

    if (upsertErr) {
      setPanError(formatDbError(upsertErr));
      return;
    }

    // Immediately mask and wipe raw input so full PAN never remains in DOM or state
    const masked = maskPan(check.pan);
    setLocalMaskedPan(masked);
    setPanInput('');
    setEditingPan(false);
    setPanSuccessMessage('PAN saved.');
    await onRefresh();
  };

  const performUpload = async (docType: DocTypeValue, file: File) => {
    const client = supabase;
    if (!client) return;

    const currentDoc = docMap.get(docType);
    if (currentDoc?.status === 'approved') {
      return;
    }

    const validation = validateAndBuildDocUpload(candidateId, docType, file);
    if (!validation.ok) {
      setUploadErrors((prev) => ({ ...prev, [docType]: validation.error }));
      return;
    }

    setUploadingDoc((prev) => ({ ...prev, [docType]: true }));
    setUploadErrors((prev) => ({ ...prev, [docType]: null }));

    const { error: storageErr } = await client.storage
      .from(CANDIDATE_DOCS_BUCKET)
      .upload(validation.storagePath, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (storageErr) {
      setUploadingDoc((prev) => ({ ...prev, [docType]: false }));
      setUploadErrors((prev) => ({
        ...prev,
        [docType]: formatDbError(storageErr),
      }));
      return;
    }

    const docPayload = buildCandidateDocUpsertPayload(
      candidateId,
      docType,
      validation.storagePath,
    );

    const { error: dbErr } = await client
      .from('documents')
      .upsert(docPayload, { onConflict: 'candidate_id,doc_type' });

    setUploadingDoc((prev) => ({ ...prev, [docType]: false }));

    if (dbErr) {
      setUploadErrors((prev) => ({
        ...prev,
        [docType]: formatDbError(dbErr),
      }));
      return;
    }

    // Clear selected file and input on success
    setSelectedFiles((prev) => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
    const inputEl = fileInputRefs.current[docType];
    if (inputEl) {
      inputEl.value = '';
    }

    await onRefresh();
  };

  const handleFileSelected = (
    docType: DocTypeValue,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFiles((prev) => ({ ...prev, [docType]: file }));
    void performUpload(docType, file);
  };

  const progressPercent = Math.round(
    (progress.approvedCount / progress.totalCount) * 100,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Onboarding Documents
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit your PAN details and verification files (PDF, JPG, or PNG up to
          5 MB each).
        </p>
      </div>

      {/* Progress Bar Card */}
      <section
        aria-label="Onboarding document approval progress"
        className="p-5 bg-white border border-slate-200 rounded-xl space-y-3"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-slate-900">
            {progress.approvedCount} of {progress.totalCount} documents approved
          </span>
          <span className="font-mono text-xs font-medium text-slate-600 tabular-nums">
            {progressPercent}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Approved documents progress"
          aria-valuenow={progress.approvedCount}
          aria-valuemin={0}
          aria-valuemax={progress.totalCount}
          className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-transform duration-200 origin-left ${
              progress.isComplete ? 'bg-emerald-600' : 'bg-blue-700'
            }`}
            style={{
              transform: `scaleX(${
                progress.approvedCount / progress.totalCount
              })`,
            }}
          />
        </div>
      </section>

      {/* 3 Document Cards */}
      <div className="space-y-4">
        {DOC_ORDER.map((docType) => {
          const doc = docMap.get(docType);
          const status = doc?.status ?? 'not_uploaded';
          const isApproved = status === 'approved';
          const isRejected = status === 'rejected';
          const isUploading = Boolean(uploadingDoc[docType]);
          const uploadErr = uploadErrors[docType];
          const pendingRetryFile = selectedFiles[docType];
          const label = DOC_TYPE_LABELS[docType];

          return (
            <section
              key={docType}
              aria-labelledby={`doc-card-title-${docType}`}
              className="p-5 sm:p-6 bg-white border border-slate-200 rounded-xl space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <h2
                    id={`doc-card-title-${docType}`}
                    className="text-base font-semibold text-slate-900"
                  >
                    {label}
                  </h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {CARD_DESCRIPTIONS[docType]}
                  </p>
                </div>

                <DocumentStatusBadge status={status} />
              </div>

              {/* Rejected Review Note */}
              {isRejected && (
                <div
                  role="alert"
                  className="p-3.5 bg-red-50/90 border border-red-200 rounded-lg space-y-1"
                >
                  <p className="text-xs font-semibold text-red-900">
                    Document rejected — please upload an updated file
                  </p>
                  <p className="text-sm text-red-800 leading-relaxed">
                    {doc?.review_note ||
                      'Please review the requirements and upload a clear copy.'}
                  </p>
                </div>
              )}

              {/* PAN Number Sub-section on PAN Card */}
              {docType === 'pan' && (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  {displayedMaskedPan && !showPanForm ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm">
                        <span className="text-slate-500">PAN Number: </span>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums tracking-wider">
                          {displayedMaskedPan}
                        </span>
                        {panSuccessMessage && (
                          <span className="ml-2 text-xs font-medium text-emerald-700">
                            · {panSuccessMessage}
                          </span>
                        )}
                      </div>

                      {!panDocApproved && (
                        <button
                          type="button"
                          onClick={() => {
                            setPanError(null);
                            setPanSuccessMessage(null);
                            setPanInput('');
                            setEditingPan(true);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                        >
                          Update PAN
                        </button>
                      )}
                    </div>
                  ) : (
                    <form
                      onSubmit={handleSavePan}
                      className="space-y-2.5"
                      noValidate
                    >
                      <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
                        <div className="flex-1 max-w-xs">
                          <label
                            htmlFor="candidate-pan-input"
                            className="block text-xs font-medium text-slate-700 mb-1"
                          >
                            PAN Number
                          </label>
                          <input
                            id="candidate-pan-input"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={10}
                            disabled={panSaving || panDocApproved}
                            value={panInput}
                            onChange={(e) => {
                              setPanInput(e.target.value.toUpperCase());
                              if (panError) setPanError(null);
                            }}
                            placeholder="ABCDE1234F"
                            className="w-full px-3.5 py-2 text-sm font-mono uppercase tracking-wider bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 disabled:bg-slate-100"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={panSaving || panDocApproved}
                            className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {panSaving ? 'Saving…' : 'Save PAN'}
                          </button>

                          {displayedMaskedPan && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPan(false);
                                setPanInput('');
                                setPanError(null);
                              }}
                              disabled={panSaving}
                              className="min-h-[40px] px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      {panError && (
                        <p role="alert" className="text-xs text-red-700">
                          {panError}
                        </p>
                      )}
                    </form>
                  )}
                </div>
              )}

              {/* Upload & View Controls */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                {uploadErr && (
                  <div
                    role="alert"
                    className="p-3 bg-red-50/80 border border-red-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <p className="text-xs text-red-800">{uploadErr}</p>
                    {pendingRetryFile && !isApproved && (
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() =>
                          void performUpload(docType, pendingRetryFile)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors self-start sm:self-center whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Upload
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    {doc?.uploaded_at ? (
                      <span>
                        Last uploaded:{' '}
                        <span className="font-mono text-slate-700 tabular-nums">
                          {formatDateTime(doc.uploaded_at)}
                        </span>
                      </span>
                    ) : (
                      <span>Accepted formats: PDF, JPG, PNG · Max 5 MB</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {doc?.storage_path && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            storagePath: doc.storage_path,
                            title: label,
                          })
                        }
                        aria-label={`View uploaded ${label}`}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    )}

                    <input
                      ref={(el) => {
                        fileInputRefs.current[docType] = el;
                      }}
                      id={`doc-upload-${docType}`}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      disabled={isApproved || isUploading}
                      onChange={(e) => handleFileSelected(docType, e)}
                      className="sr-only"
                    />

                    {isApproved ? (
                      <button
                        type="button"
                        disabled
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed whitespace-nowrap"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Approved (Upload locked)
                      </button>
                    ) : (
                      <label
                        htmlFor={`doc-upload-${docType}`}
                        className={`min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap select-none ${
                          isUploading
                            ? 'bg-blue-400 text-white cursor-wait'
                            : 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer'
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {isUploading
                            ? 'Uploading…'
                            : doc
                              ? 'Upload replacement'
                              : `Choose ${label} file`}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <DocumentPreviewModal
        open={Boolean(previewDoc)}
        storagePath={previewDoc?.storagePath ?? null}
        title={previewDoc?.title ?? 'Document Preview'}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
}
