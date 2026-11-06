import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  ExternalLink,
  FileText,
  Lock,
  MessageSquare,
  Paperclip,
  Send,
  Upload,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  CandidateOverview,
  Ticket,
  TicketMessage,
  TicketStatus,
} from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  buildTicketMessagePayload,
  formatDbError,
  formatTicketDateTime,
  validateAndBuildTicketAttachmentUpload,
} from '../../utils/domain';
import { DocumentPreviewModal } from '../ui/DocumentWidgets';
import { ConfirmDialog } from '../ui/Modal';
import { ErrorState, TableSkeleton } from '../ui/States';
import { TicketCategoryBadge, TicketStatusBadge } from '../ui/TicketWidgets';

interface AdminTicketDetailViewProps {
  ticketId: string;
  adminUserId: string;
  onBack: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onRefreshList?: () => void;
  onTicketCodeLoaded?: (code: string) => void;
}

export function AdminTicketDetailView({
  ticketId,
  adminUserId,
  onBack,
  onSelectCandidate,
  onRefreshList,
  onTicketCodeLoaded,
}: AdminTicketDetailViewProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [candidateInfo, setCandidateInfo] = useState<CandidateOverview | null>(
    null,
  );
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status updating
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [pendingCloseStatus, setPendingCloseStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Reply form state
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Document preview modal
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('Attachment Preview');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadTicketData = useCallback(
    async (showSkeleton = true) => {
      const client = supabase;
      if (!client) return;

      if (showSkeleton) setLoading(true);
      setError(null);

      const [ticketRes, messagesRes] = await Promise.all([
        client.from('tickets').select('*').eq('id', ticketId).single(),
        client
          .from('ticket_messages')
          .select('*')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true }),
      ]);

      if (ticketRes.error || !ticketRes.data) {
        setError(formatDbError(ticketRes.error ?? 'Ticket not found.'));
        setLoading(false);
        return;
      }

      const t = ticketRes.data as Ticket;
      setTicket(t);
      if (t.ticket_code) {
        onTicketCodeLoaded?.(t.ticket_code);
      }
      setMessages((messagesRes.data as TicketMessage[]) ?? []);

      // Load candidate overview for header context
      if (t.candidate_id) {
        const { data: candData } = await client
          .from('v_candidate_overview')
          .select('*')
          .eq('candidate_id', t.candidate_id)
          .maybeSingle();

        if (candData) {
          setCandidateInfo(candData as CandidateOverview);
        }
      }

      setLoading(false);
    },
    [ticketId],
  );

  useEffect(() => {
    void loadTicketData(true);
  }, [loadTicketData]);

  const updateStatus = async (newStatus: TicketStatus) => {
    const client = supabase;
    if (!client || !ticket) return;

    setUpdatingStatus(true);
    setStatusError(null);

    const updatePayload: { status: TicketStatus; resolved_at?: string | null } =
      {
        status: newStatus,
      };

    if (newStatus === 'resolved') {
      updatePayload.resolved_at = new Date().toISOString();
    } else if (newStatus !== 'closed') {
      updatePayload.resolved_at = null;
    }

    const { error: updErr } = await client
      .from('tickets')
      .update(updatePayload)
      .eq('id', ticket.id);

    if (updErr) {
      setStatusError(formatDbError(updErr));
      setUpdatingStatus(false);
      return;
    }

    await loadTicketData(false);
    onRefreshList?.();
    setUpdatingStatus(false);
  };

  const handleStatusChangeRequest = (newStatus: TicketStatus) => {
    if (newStatus === 'closed') {
      setPendingCloseStatus(true);
    } else {
      void updateStatus(newStatus);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client || !ticket) return;

    setReplyError(null);
    let uploadedPath: string | null = null;

    if (replyAttachment) {
      const fileCheck = validateAndBuildTicketAttachmentUpload(
        ticket.candidate_id,
        ticket.id,
        replyAttachment,
      );
      if (!fileCheck.ok) {
        setReplyError(fileCheck.error);
        return;
      }
      uploadedPath = fileCheck.storagePath;
    }

    const payloadResult = buildTicketMessagePayload({
      ticket_id: ticket.id,
      body: replyBody,
      attachment_path: uploadedPath,
    });

    if (!payloadResult.ok) {
      setReplyError(payloadResult.error);
      return;
    }

    setReplySubmitting(true);

    try {
      // 1. Upload attachment if present
      if (replyAttachment && uploadedPath) {
        const { error: uploadErr } = await client.storage
          .from(CANDIDATE_DOCS_BUCKET)
          .upload(uploadedPath, replyAttachment, {
            upsert: true,
            contentType: replyAttachment.type || undefined,
          });

        if (uploadErr) {
          setReplyError(
            formatDbError(uploadErr ?? 'Failed to upload attachment.'),
          );
          setReplySubmitting(false);
          return;
        }
      }

      // 2. Insert into ticket_messages (only ticket_id, body, attachment_path)
      const { error: msgErr } = await client
        .from('ticket_messages')
        .insert(payloadResult.payload);

      if (msgErr) {
        setReplyError(formatDbError(msgErr));
        setReplySubmitting(false);
        return;
      }

      // Reset reply form
      setReplyBody('');
      setReplyAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Reload ticket thread
      await loadTicketData(false);
      onRefreshList?.();
      setReplySubmitting(false);
    } catch (err) {
      setReplyError(formatDbError(err));
      setReplySubmitting(false);
    }
  };

  if (loading) {
    return <TableSkeleton rows={6} columns={4} />;
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Tickets
        </button>
        <ErrorState
          title="Could not load ticket details"
          message={error ?? 'Ticket record not found.'}
          onRetry={() => void loadTicketData(true)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top back navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to All Tickets</span>
        </button>
      </div>

      {statusError && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <span>{statusError}</span>
        </div>
      )}

      {/* Candidate Details Strip */}
      <div className="p-4 sm:p-5 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
            <User className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm text-slate-900">
                {candidateInfo?.full_name ?? 'Candidate'}
              </span>
              <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 tabular-nums">
                {candidateInfo?.candidate_code ?? ticket.candidate_id}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {candidateInfo?.batch_code && (
                <span>
                  Batch:{' '}
                  <span className="font-mono text-slate-700">
                    {candidateInfo.batch_code}
                  </span>
                </span>
              )}
              {candidateInfo?.counsellor && (
                <span>Counsellor: {candidateInfo.counsellor}</span>
              )}
              {candidateInfo?.email && <span>{candidateInfo.email}</span>}
              {candidateInfo?.phone && (
                <span className="font-mono tabular-nums">
                  {candidateInfo.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSelectCandidate(ticket.candidate_id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap self-start md:self-auto shrink-0 shadow-sm"
        >
          <span>View Candidate Profile</span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Ticket Header & Status Control */}
      <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-blue-700 tabular-nums">
                {ticket.ticket_code}
              </span>
              <TicketCategoryBadge category={ticket.category} />
              <TicketStatusBadge status={ticket.status} />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              {ticket.subject}
            </h1>
            <p className="text-xs text-slate-500">
              Created {formatTicketDateTime(ticket.created_at)}
              {ticket.updated_at && ticket.updated_at !== ticket.created_at && (
                <span> · Last active {formatTicketDateTime(ticket.updated_at)}</span>
              )}
            </p>
          </div>

          {/* Admin Status Dropdown */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <label
              htmlFor="admin-ticket-status"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Update Status:
            </label>
            <select
              id="admin-ticket-status"
              disabled={updatingStatus}
              value={ticket.status}
              onChange={(e) =>
                handleStatusChangeRequest(e.target.value as TicketStatus)
              }
              className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-800"
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {/* Original Description */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Original Inquiry Description
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {formatTicketDateTime(ticket.created_at)}
            </span>
          </div>

          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {ticket.description}
          </p>

          {ticket.attachment_path && (
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="font-medium">Inquiry Attachment</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewPath(ticket.attachment_path);
                  setPreviewTitle(`Attachment · ${ticket.ticket_code}`);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-white border border-slate-200 rounded hover:bg-blue-50 transition-colors"
              >
                <Eye className="w-3 h-3" />
                <span>View Attachment</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Conversation Thread ({messages.length})
          </h2>
        </div>

        {messages.length === 0 ? (
          <div className="p-6 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-500">
            No reply messages in this thread yet. Send a response below.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isAdmin = msg.author_role === 'admin';
              return (
                <div
                  key={msg.id}
                  className={`p-4 rounded-xl border ${
                    isAdmin
                      ? 'bg-blue-50/50 border-blue-200 ml-0 sm:mr-10'
                      : 'bg-white border-slate-200 mr-0 sm:ml-10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        isAdmin
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {isAdmin
                        ? 'Institute team (Admin)'
                        : candidateInfo?.full_name ?? 'Candidate'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {formatTicketDateTime(msg.created_at)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {msg.body}
                  </p>

                  {msg.attachment_path && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Attached file</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPath(msg.attachment_path);
                          setPreviewTitle(
                            `Message Attachment · ${ticket.ticket_code}`,
                          );
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-white border border-slate-200 rounded hover:bg-blue-50 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View Attachment</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin Reply Box */}
      <form
        onSubmit={handleSendReply}
        className="p-5 bg-white border border-slate-200 rounded-xl space-y-4"
      >
        <h3 className="text-sm font-semibold text-slate-900">
          Reply as Institute Staff
        </h3>

        {replyError && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <span>{replyError}</span>
          </div>
        )}

        <div>
          <textarea
            rows={4}
            required
            disabled={replySubmitting}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Type your official response to the candidate..."
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 placeholder:text-slate-400"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              disabled={replySubmitting}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setReplyAttachment(file);
                if (replyError) setReplyError(null);
              }}
              className="hidden"
              id="admin-ticket-reply-attachment"
            />
            <button
              type="button"
              disabled={replySubmitting}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>
                {replyAttachment ? 'Change attachment' : 'Attach file'}
              </span>
            </button>

            {replyAttachment && (
              <div className="flex items-center gap-2 text-xs text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate max-w-[180px]">
                  {replyAttachment.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReplyAttachment(null);
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

          <button
            type="submit"
            disabled={replySubmitting || !replyBody.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors self-end sm:self-auto"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{replySubmitting ? 'Sending...' : 'Send Response'}</span>
          </button>
        </div>
      </form>

      {/* Close Confirmation Dialog for Admin */}
      <ConfirmDialog
        isOpen={pendingCloseStatus}
        onClose={() => setPendingCloseStatus(false)}
        onConfirm={() => {
          setPendingCloseStatus(false);
          void updateStatus('closed');
        }}
        title="Mark Ticket as Closed?"
        message="Are you sure you want to change the status of this ticket to Closed? This signals that the issue has reached its final resolution."
        confirmLabel="Confirm Close"
        confirmVariant="primary"
      />

      {/* Attachment Preview Modal (60-sec signed URL) */}
      <DocumentPreviewModal
        open={Boolean(previewPath)}
        onClose={() => setPreviewPath(null)}
        storagePath={previewPath}
        title={previewTitle}
      />
    </div>
  );
}
