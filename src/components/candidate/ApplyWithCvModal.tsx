import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, FileText, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CandidateCv, CandidateOpportunity } from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  formatDbError,
  validateAndBuildCvUpload,
} from '../../utils/domain';
import { Modal } from '../ui/Modal';

interface ApplyWithCvModalProps {
  open: boolean;
  opportunity: CandidateOpportunity | null;
  candidateId: string;
  cv: CandidateCv | null;
  onViewCv: (storagePath: string, title: string) => void;
  onClose: () => void;
  onApplied: (recipientId: string) => Promise<void> | void;
}

export function ApplyWithCvModal({
  open,
  opportunity,
  candidateId,
  cv,
  onViewCv,
  onClose,
  onApplied,
}: ApplyWithCvModalProps) {
  const [choice, setChoice] = useState<'current' | 'upload'>('current');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setChoice('current');
      setSelectedFile(null);
      setError(null);
      setSubmitting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [open, opportunity?.recipient_id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
    if (file) {
      setChoice('upload');
      const validation = validateAndBuildCvUpload(candidateId, file);
      if (!validation.ok) {
        setError(validation.error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client || !opportunity) return;

    if (choice === 'current' && !cv) {
      setError(
        'No current CV is on your profile. Choose "Upload an updated CV" to continue.',
      );
      return;
    }

    if (choice === 'upload') {
      const validation = validateAndBuildCvUpload(candidateId, selectedFile);
      if (!validation.ok) {
        setError(validation.error);
        return;
      }

      setSubmitting(true);
      setError(null);

      const oldStoragePath = cv?.storage_path ?? null;

      // 1. Upload new CV to candidate-docs/<candidate_id>/cv/<timestamp>-<filename>
      const { error: uploadErr } = await client.storage
        .from(CANDIDATE_DOCS_BUCKET)
        .upload(validation.storagePath, selectedFile!, {
          upsert: false,
          contentType: selectedFile!.type || undefined,
        });

      if (uploadErr) {
        setSubmitting(false);
        setError(formatDbError(uploadErr));
        return;
      }

      // 2. Update candidate_cv row (or insert if missing)
      if (cv) {
        const { error: updateErr } = await client
          .from('candidate_cv')
          .update({
            storage_path: validation.storagePath,
            file_name: validation.fileName,
          })
          .eq('candidate_id', candidateId);

        if (updateErr) {
          setSubmitting(false);
          setError(formatDbError(updateErr));
          return;
        }
      } else {
        const { error: insertErr } = await client.from('candidate_cv').insert({
          candidate_id: candidateId,
          storage_path: validation.storagePath,
          file_name: validation.fileName,
        });

        if (insertErr) {
          setSubmitting(false);
          setError(formatDbError(insertErr));
          return;
        }
      }

      // 3. Delete old CV file from storage (ignore errors if delete fails)
      if (oldStoragePath && oldStoragePath !== validation.storagePath) {
        try {
          await client.storage
            .from(CANDIDATE_DOCS_BUCKET)
            .remove([oldStoragePath]);
        } catch {
          // Ignore failed cleanup delete
        }
      }
    } else {
      setSubmitting(true);
      setError(null);
    }

    // 4. Record 'interested' response via respond_opportunity RPC
    const { error: rpcErr } = await client.rpc('respond_opportunity', {
      p_recipient: opportunity.recipient_id,
      p_response: 'interested',
    });

    setSubmitting(false);

    if (rpcErr) {
      setError(formatDbError(rpcErr));
      return;
    }

    await onApplied(opportunity.recipient_id);
  };

  return (
    <Modal
      open={open && Boolean(opportunity)}
      onClose={() => !submitting && onClose()}
      title="Apply with your CV"
      description={
        opportunity
          ? `${opportunity.company} — ${opportunity.job_title}`
          : undefined
      }
      maxWidthClass="max-w-lg"
    >
      {opportunity && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current CV summary box */}
          <div className="p-3.5 bg-[#F5F8FB] border border-[#E3E9F0] rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText className="w-4 h-4 text-[#0B7C7C] shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#5B6B7F]">
                  Current profile CV
                </p>
                <p className="text-xs font-semibold text-[#0B1F3A] truncate">
                  {cv?.file_name || 'No CV uploaded yet'}
                </p>
              </div>
            </div>

            {cv?.storage_path && (
              <button
                type="button"
                onClick={() =>
                  onViewCv(cv.storage_path, cv.file_name || 'Candidate CV')
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors shrink-0"
              >
                <Eye className="w-3.5 h-3.5 text-[#0FA3A3]" />
                View
              </button>
            )}
          </div>

          {/* Two choices: Use my current CV (default) vs Upload an updated CV */}
          <fieldset className="space-y-2.5">
            <legend className="text-xs font-semibold text-[#0B1F3A] mb-1">
              Choose CV option
            </legend>

            <label
              className={`block p-3.5 rounded-xl border cursor-pointer transition-colors ${
                choice === 'current'
                  ? 'bg-[#E6F6F6] border-[#0FA3A3]'
                  : 'bg-white border-[#E3E9F0] hover:bg-[#F5F8FB]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="apply-cv-choice"
                  value="current"
                  checked={choice === 'current'}
                  disabled={submitting}
                  onChange={() => {
                    setChoice('current');
                    setError(null);
                  }}
                  className="mt-0.5 h-4 w-4 text-[#0FA3A3] focus:ring-[#0FA3A3]"
                />
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-[#0B1F3A]">
                    Use my current CV
                  </span>
                  <p className="text-xs text-[#5B6B7F] mt-0.5">
                    Share the CV already saved on your Dimension Education profile.
                  </p>
                </div>
              </div>
            </label>

            <div
              className={`p-3.5 rounded-xl border transition-colors ${
                choice === 'upload'
                  ? 'bg-[#E6F6F6] border-[#0FA3A3]'
                  : 'bg-white border-[#E3E9F0] hover:bg-[#F5F8FB]'
              }`}
            >
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="apply-cv-choice"
                  value="upload"
                  checked={choice === 'upload'}
                  disabled={submitting}
                  onChange={() => {
                    setChoice('upload');
                    setError(null);
                  }}
                  className="mt-0.5 h-4 w-4 text-[#0FA3A3] focus:ring-[#0FA3A3]"
                />
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-[#0B1F3A]">
                    Upload an updated CV
                  </span>
                  <p className="text-xs text-[#5B6B7F] mt-0.5">
                    PDF, DOC, or DOCX · Max 5 MB.
                  </p>
                </div>
              </label>

              {choice === 'upload' && (
                <div className="mt-3 pl-6 space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      ref={fileInputRef}
                      id="apply-updated-cv-input"
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      disabled={submitting}
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                    <label
                      htmlFor="apply-updated-cv-input"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#0FA3A3]" />
                      <span>
                        {selectedFile ? 'Change selected file' : 'Choose CV file'}
                      </span>
                    </label>
                    {selectedFile && (
                      <span className="text-xs font-medium text-[#0B1F3A] truncate max-w-[220px]">
                        {selectedFile.name}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-[#0B7C7C]">
                    Your profile CV will be updated. Only one CV is kept.
                  </p>
                </div>
              )}
            </div>
          </fieldset>

          {error && (
            <div
              role="alert"
              className="p-3 bg-[#FBEAE9] border border-[#F4C5C2] rounded-lg text-xs text-[#C2413B]"
            >
              {error}
            </div>
          )}

          <p className="text-xs font-medium text-[#5B6B7F] bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg px-3 py-2">
            This cannot be changed after you submit.
          </p>

          <div className="pt-1 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (choice === 'upload' && !selectedFile)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-[#0FA3A3]" />
              {submitting ? 'Submitting…' : "Confirm I'm interested"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
