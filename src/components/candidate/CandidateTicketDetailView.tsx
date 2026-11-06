import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Lock,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
  Upload,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  Ticket,
  TicketMessage,
} from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  buildTicketMessagePayload,
  formatDbError,
  formatTicketDateTime,
  validateAndBuildTicketAttachmentUpload,
} from '../../utils/domain';
import { DocumentPreviewModal } from '../ui/DocumentWidgets';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { ErrorState, TableSkeleton } from '../ui/States';
import { TicketCategoryBadge, TicketStatusBadge } from '../ui/TicketWidgets';

interface CandidateTicketDetailViewProps {
  ticketId: string;
  candidateId: string;
  onBack: () => void;
  onRefreshList?: () => void;
}

export function CandidateTicketDetailView({
  ticketId,
  candidateId,
  onBack,
  onRefreshList,
}: CandidateTicketDetailViewProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reply form state
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // RPC action state
  const [rpcLoading, setRpcLoading] = useState(false);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // Document preview
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('Attachment Preview');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadTicketAndMessages = useCallback(
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

      setTicket(ticketRes.data as Ticket);
      setMessages((messagesRes.data as TicketMessage[]) ?? []);
      setLoading(false);
    },
    [ticketId],
  );

  useEffect(() => {
    void loadTicketAndMessages(true);
  }, [loadTicketAndMessages]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client || !ticket) return;

    setReplyError(null);
    let uploadedPath: string | null = null;

    if (replyAttachment) {
      const fileCheck = validateAndBuildTicketAttachmentUpload(
        candidateId,
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

      // Reload ticket thread (Replying to a resolved ticket may automatically reopen it)
      await loadTicketAndMessages(false);
      onRefreshList?.();
      setReplySubmitting(false);
    } catch (err) {
      setReplyError(formatDbError(err));
      setReplySubmitting(false);
    }
  };

  const handleReopenTicket = async () => {
    const client = supabase;
    if (!client || !ticket) return;

    setRpcLoading(true);
    setRpcError(null);

    const { error: rpcErr } = await client.rpc('reopen_ticket', {
      p_ticket: ticket.id,
    });

    if (rpcErr) {
      setRpcError(formatDbError(rpcErr));
      setRpcLoading(false);
      return;
    }

    await loadTicketAndMessages(false);
    onRefreshList?.();
    setRpcLoading(false);
  };

  const handleCloseTicket = async () => {
    const client = supabase;
    if (!client || !ticket) return;

    setRpcLoading(true);
    setRpcError(null);

    const { error: rpcErr } = await client.rpc('close_ticket', {
      p_ticket: ticket.id,
    });

    setCloseConfirmOpen(false);

    if (rpcErr) {
      setRpcError(formatDbError(rpcErr));
      setRpcLoading(false);
      return;
    }

    await loadTicketAndMessages(false);
    onRefreshList?.();
    setRpcLoading(false);
  };

  if (loading) {
    return <TableSkeleton rows={6} columns={3} />;
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
          title="Could not load ticket"
          message={error ?? 'Ticket record not found.'}
          onRetry={() => void loadTicketAndMessages(true)}
        />
      </div>
    );
  }

  const isResolved = ticket.status === 'resolved';
  const isClosed = ticket.status === 'closed';

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
          <span>Back to My Tickets</span>
        </button>
      </div>

      {rpcError && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <span>{rpcError}</span>
        </div>
      )}

      {/* Ticket Header Card */}
      <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 tabular-nums">
                {ticket.ticket_code}
              </span>
              <TicketCategoryBadge category={ticket.category} />
              <TicketStatusBadge status={ticket.status} />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              {ticket.subject}
            </h1>
            <p className="text-xs text-slate-500">
              Raised on {formatTicketDateTime(ticket.created_at)}
              {ticket.updated_at && ticket.updated_at !== ticket.created_at && (
                <span> · Last active {formatTicketDateTime(ticket.updated_at)}</span>
              )}
            </p>
          </div>

          {/* Action buttons when resolved */}
          {isResolved && (
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <button
                type="button"
                disabled={rpcLoading}
                onClick={handleReopenTicket}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reopen</span>
              </button>
              <button
                type="button"
                disabled={rpcLoading}
                onClick={() => setCloseConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Close ticket</span>
              </button>
            </div>
          )}
        </div>

        {/* Resolved banner notice */}
        {isResolved && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">This ticket has been marked as resolved.</p>
              <p className="mt-0.5 text-emerald-800">
                If your issue is settled, you may close this ticket. Replying to a
                resolved ticket reopens it.
              </p>
            </div>
          </div>
        )}

        {/* Closed notice */}
        {isClosed && (
          <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-2 text-xs text-slate-700">
            <Lock className="w-4 h-4 text-slate-500 shrink-0" />
            <span>This ticket is closed. No further replies can be added.</span>
          </div>
        )}

        {/* Original Description */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Original Inquiry Description
            </span>
            <span className="text-xs text-slate-500">
              {formatTicketDateTime(ticket.created_at)}
            </span>
          </div>

          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {ticket.description}
          </p>

          {ticket.attachment_path && (
            <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
              <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-xs text-slate-600 font-medium">
                Inquiry Attachment
              </span>
              <button
                type="button"
                onClick={() => {
                  setPreviewPath(ticket.attachment_path);
                  setPreviewTitle(`Attachment · ${ticket.ticket_code}`);
                }}
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 hover:text-blue-900 bg-white border border-slate-200 rounded hover:bg-blue-50 transition-colors"
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
            Conversation ({messages.length})
          </h2>
        </div>

        {messages.length === 0 ? (
          <div className="p-6 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-500">
            No reply messages yet. Institute team replies will appear here.
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
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          isAdmin
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {isAdmin ? 'Institute team' : 'You'}
                      </span>
                    </div>
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
                          setPreviewTitle(`Message Attachment · ${ticket.ticket_code}`);
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

      {/* Reply Box (Hidden when ticket is closed) */}
      {!isClosed ? (
        <form
          onSubmit={handleSendReply}
          className="p-5 bg-white border border-slate-200 rounded-xl space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Send a Reply
            </h3>
            {isResolved && (
              <span className="text-xs text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Replying will reopen this ticket
              </span>
            )}
          </div>

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
              placeholder="Type your reply message here..."
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
                id="ticket-reply-attachment"
              />
              <button
                type="button"
                disabled={replySubmitting}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>{replyAttachment ? 'Change attachment' : 'Attach file'}</span>
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
              <span>{replySubmitting ? 'Sending...' : 'Send Reply'}</span>
            </button>
          </div>
        </form>
      ) : null}

      {/* Confirmation Modal to close ticket */}
      <ConfirmDialog
        isOpen={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
        onConfirm={handleCloseTicket}
        title="Close Ticket?"
        message="Are you sure you want to close this ticket? Once closed, you will not be able to send further replies."
        confirmLabel="Close ticket"
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
