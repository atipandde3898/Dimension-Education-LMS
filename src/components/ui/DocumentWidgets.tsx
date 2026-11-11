import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { DocStatusValue } from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  SIGNED_URL_EXPIRY_SECONDS,
  formatDbError,
  inferPreviewKind,
} from '../../utils/domain';
import { Modal } from './Modal';

export function DocumentStatusBadge({
  status,
}: {
  status: DocStatusValue | 'not_uploaded';
}) {
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1F9D6B] bg-[#E7F6EF] border border-[#BCE8D3] rounded-md whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-[#1F9D6B] shrink-0" />
        Approved
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#C98A0B] bg-[#FDF4E0] border border-[#F6DEAA] rounded-md whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 text-[#C98A0B] shrink-0" />
        Pending
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#C2413B] bg-[#FBEAE9] border border-[#F4C5C2] rounded-md whitespace-nowrap shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-[#C2413B] shrink-0" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#5B6B7F] bg-[#F5F8FB] border border-[#E3E9F0] rounded-md whitespace-nowrap shrink-0">
      <FileText className="w-3.5 h-3.5 text-[#5B6B7F] shrink-0" />
      Not uploaded
    </span>
  );
}

interface DocumentPreviewModalProps {
  open: boolean;
  storagePath: string | null;
  bucketName?: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function DocumentPreviewModal({
  open,
  storagePath,
  bucketName = CANDIDATE_DOCS_BUCKET,
  title,
  subtitle,
  onClose,
}: DocumentPreviewModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const generateUrl = useCallback(async () => {
    const client = supabase;
    if (!client || !storagePath) return;

    setLoading(true);
    setError(null);
    setSignedUrl(null);
    setImageFailed(false);

    const { data, error: signErr } = await client.storage
      .from(bucketName)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

    if (signErr || !data?.signedUrl) {
      setError(
        formatDbError(
          signErr ?? 'Unable to generate a temporary link for this document.',
        ),
      );
      setLoading(false);
      return;
    }

    setSignedUrl(data.signedUrl);
    setLoading(false);
  }, [bucketName, storagePath]);

  useEffect(() => {
    if (!open || !storagePath) return;
    void generateUrl();
  }, [open, storagePath, generateUrl]);

  const previewKind = storagePath ? inferPreviewKind(storagePath) : 'other';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        subtitle ?? 'Temporary signed access valid for 60 seconds.'
      }
      maxWidthClass="max-w-3xl"
    >
      {loading ? (
        <div
          role="status"
          aria-label="Generating signed document link"
          className="py-16 text-center space-y-3"
        >
          <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-700 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-600">
            Generating secure document preview…
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="p-5 bg-red-50/80 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <p className="text-sm font-semibold text-red-900">
              Could not open document
            </p>
            <p className="mt-1 text-xs text-red-800">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void generateUrl()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors self-start sm:self-center whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : signedUrl ? (
        <div className="space-y-4">
          {previewKind === 'image' && !imageFailed ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-center min-h-[240px]">
              <img
                src={signedUrl}
                alt={title}
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className="max-h-[62vh] w-auto max-w-full object-contain rounded"
              />
            </div>
          ) : previewKind === 'pdf' ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
              <iframe
                src={signedUrl}
                title={title}
                className="w-full h-[58vh] sm:h-[64vh] border-0"
              />
            </div>
          ) : (
            <div className="p-8 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-2">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-medium text-slate-800">
                Document link ready
              </p>
              <p className="text-xs text-slate-500">
                Use the button below to open or download the signed file before
                the 60-second link expires.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void generateUrl()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh 60s link
            </button>

            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5">
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap"
              >
                <span>Open file</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

interface RejectDocumentModalProps {
  open: boolean;
  docTitle: string;
  candidateLabel?: string;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmitReject: (reviewNote: string) => void;
}

export function RejectDocumentModal({
  open,
  docTitle,
  candidateLabel,
  loading = false,
  error,
  onClose,
  onSubmitReject,
}: RejectDocumentModalProps) {
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote('');
      setLocalError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      setLocalError(
        'A rejection note is required so the candidate knows what to re-upload.',
      );
      return;
    }
    setLocalError(null);
    onSubmitReject(trimmed);
  };

  const displayError = localError || error;

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={`Reject ${docTitle}`}
      description={
        candidateLabel
          ? `Candidate: ${candidateLabel}`
          : 'Provide a clear reason so the candidate can upload a corrected file.'
      }
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {displayError && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
          >
            {displayError}
          </div>
        )}

        <div>
          <label
            htmlFor="reject-review-note"
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            Rejection note
          </label>
          <textarea
            id="reject-review-note"
            rows={3}
            required
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (localError) setLocalError(null);
            }}
            placeholder="e.g. Scan is cropped at the bottom. Please upload the full signed page."
            className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>

        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Rejecting…' : 'Reject Document'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
