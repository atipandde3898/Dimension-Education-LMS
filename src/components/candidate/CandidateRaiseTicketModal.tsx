import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { TicketCategory } from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  TICKET_CATEGORIES,
  buildTicketCreatePayload,
  formatDbError,
  validateAndBuildTicketAttachmentUpload,
} from '../../utils/domain';
import { Modal } from '../ui/Modal';

interface CandidateRaiseTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  onTicketCreated: (ticketCode: string, ticketId: string) => void;
}

export function CandidateRaiseTicketModal({
  isOpen,
  onClose,
  candidateId,
  onTicketCreated,
}: CandidateRaiseTicketModalProps) {
  const [category, setCategory] = useState<TicketCategory>('fees_payments');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTicketInfo, setCreatedTicketInfo] = useState<{
    code: string;
    id: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleReset = () => {
    setCategory('fees_payments');
    setSubject('');
    setDescription('');
    setAttachmentFile(null);
    setError(null);
    setCreatedTicketInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (submitting) return;
    handleReset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    setError(null);
    const newTicketId = crypto.randomUUID();

    // 1. Validate file if selected
    let uploadedPath: string | null = null;
    if (attachmentFile) {
      const fileCheck = validateAndBuildTicketAttachmentUpload(
        candidateId,
        newTicketId,
        attachmentFile,
      );
      if (!fileCheck.ok) {
        setError(fileCheck.error);
        return;
      }
      uploadedPath = fileCheck.storagePath;
    }

    // 2. Validate payload before network requests
    const payloadResult = buildTicketCreatePayload({
      id: newTicketId,
      candidate_id: candidateId,
      category,
      subject,
      description,
      attachment_path: uploadedPath,
    });

    if (!payloadResult.ok) {
      setError(payloadResult.error);
      return;
    }

    setSubmitting(true);

    try {
      // 3. Upload attachment first if provided
      if (attachmentFile && uploadedPath) {
        const { error: uploadErr } = await client.storage
          .from(CANDIDATE_DOCS_BUCKET)
          .upload(uploadedPath, attachmentFile, {
            upsert: true,
            contentType: attachmentFile.type || undefined,
          });

        if (uploadErr) {
          setError(
            formatDbError(
              uploadErr ?? 'Failed to upload attachment to storage.',
            ),
          );
          setSubmitting(false);
          return;
        }
      }

      // 4. Insert ticket (never send status or ticket_code)
      const { data: inserted, error: insertErr } = await client
        .from('tickets')
        .insert(payloadResult.payload)
        .select('id, ticket_code')
        .single();

      if (insertErr || !inserted) {
        setError(formatDbError(insertErr ?? 'Failed to create support ticket.'));
        setSubmitting(false);
        return;
      }

      setCreatedTicketInfo({
        id: inserted.id,
        code: inserted.ticket_code,
      });
      setSubmitting(false);
    } catch (err) {
      setError(formatDbError(err));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={createdTicketInfo ? 'Ticket Raised' : 'Raise a Support Ticket'}
    >
      {createdTicketInfo ? (
        <div className="space-y-5 text-center py-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">
              Ticket Submitted Successfully
            </h3>
            <p className="text-sm text-slate-600">
              Your inquiry has been assigned ticket code:
            </p>
            <p className="font-mono text-xl font-bold text-blue-700 tracking-wide mt-1">
              {createdTicketInfo.code}
            </p>
          </div>

          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            The institute administration team will review your inquiry and reply
            in the ticket thread.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <button
              type="button"
              onClick={() => {
                const info = createdTicketInfo;
                handleClose();
                onTicketCreated(info.code, info.id);
              }}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
            >
              View Ticket Conversation
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="ticket-category"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Category <span className="text-red-500">*</span>
            </label>
            <select
              id="ticket-category"
              value={category}
              disabled={submitting}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            >
              {TICKET_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ticket-subject"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              id="ticket-subject"
              type="text"
              required
              minLength={3}
              maxLength={150}
              disabled={submitting}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of your query (3 to 150 characters)"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 placeholder:text-slate-400"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>Must be between 3 and 150 characters</span>
              <span>{subject.length}/150</span>
            </div>
          </div>

          <div>
            <label
              htmlFor="ticket-description"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="ticket-description"
              rows={5}
              required
              minLength={3}
              maxLength={4000}
              disabled={submitting}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide complete details, dates, transaction references, or screenshots to help us resolve your query quickly (3 to 4000 characters)"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 placeholder:text-slate-400"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>Detailed explanation</span>
              <span>{description.length}/4000</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Attachment <span className="text-slate-400 font-normal">(optional · PDF, JPG, PNG up to 5 MB)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                disabled={submitting}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setAttachmentFile(file);
                  if (error) setError(null);
                }}
                className="hidden"
                id="ticket-attachment-input"
              />
              <button
                type="button"
                disabled={submitting}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{attachmentFile ? 'Change file' : 'Choose file'}</span>
              </button>

              {attachmentFile && (
                <div className="flex items-center gap-2 text-xs text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg min-w-0">
                  <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="truncate max-w-[200px]">
                    {attachmentFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Remove attachment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={submitting}
              onClick={handleClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting ticket...' : 'Submit ticket'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
