import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, CheckCircle2, Clock, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  PlacementHandover,
  PlacementMember,
} from '../../types/database';
import {
  buildPlacementHandoverPayload,
  formatDbError,
  formatHandoverStatusText,
  formatLocalIsoDate,
} from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ErrorState } from '../ui/States';

interface CandidatePlacementSectionProps {
  candidateId: string;
  adminUserId: string;
  candidateLabel: string;
  overviewHandover?: {
    handed_over: boolean | null;
    handover_date: string | null;
    placement_member: string | null;
  };
  onHandoverUpdated?: () => void;
}

export function CandidatePlacementSection({
  candidateId,
  adminUserId,
  candidateLabel,
  overviewHandover,
  onHandoverUpdated,
}: CandidatePlacementSectionProps) {
  const [handover, setHandover] = useState<PlacementHandover | null>(null);
  const [members, setMembers] = useState<PlacementMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form inputs
  const [handoverDateInput, setHandoverDateInput] = useState(() =>
    formatLocalIsoDate(),
  );
  const [memberIdInput, setMemberIdInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const loadPlacementData = useCallback(
    async (showSkeleton = true) => {
      const client = supabase;
      if (!client) return;
      if (showSkeleton) setLoading(true);
      setLoadError(null);

      const [handoverRes, membersRes] = await Promise.all([
        client
          .from('placement_handover')
          .select(
            'candidate_id, handover_date, placement_member_id, notes, created_by',
          )
          .eq('candidate_id', candidateId)
          .maybeSingle(),
        client
          .from('placement_members')
          .select('id, full_name, email, active')
          .order('full_name', { ascending: true }),
      ]);

      if (handoverRes.error) {
        setLoadError(formatDbError(handoverRes.error));
        setLoading(false);
        return;
      }
      if (membersRes.error) {
        setLoadError(formatDbError(membersRes.error));
        setLoading(false);
        return;
      }

      const loadedHandover =
        (handoverRes.data as PlacementHandover | null) ?? null;
      const loadedMembers = (membersRes.data as PlacementMember[]) ?? [];

      setHandover(loadedHandover);
      setMembers(loadedMembers);

      if (loadedHandover) {
        setHandoverDateInput(loadedHandover.handover_date);
        setMemberIdInput(loadedHandover.placement_member_id);
        setNotesInput(loadedHandover.notes ?? '');
      } else {
        const firstActive = loadedMembers.find((m) => m.active);
        setHandoverDateInput(formatLocalIsoDate());
        setMemberIdInput(firstActive?.id ?? '');
        setNotesInput('');
      }

      setLoading(false);
    },
    [candidateId],
  );

  useEffect(() => {
    void loadPlacementData(true);
  }, [loadPlacementData]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.active),
    [members],
  );

  // If editing an existing handover whose assigned member was later deactivated,
  // keep that member visible in the dropdown while selected so the form never breaks.
  const selectableMembers = useMemo(() => {
    if (!handover) return activeMembers;
    const currentInActive = activeMembers.some(
      (m) => m.id === handover.placement_member_id,
    );
    if (currentInActive) return activeMembers;
    const inactiveCurrent = members.find(
      (m) => m.id === handover.placement_member_id,
    );
    return inactiveCurrent
      ? [inactiveCurrent, ...activeMembers]
      : activeMembers;
  }, [activeMembers, handover, members]);

  const resolvedMemberName = useMemo(() => {
    if (handover) {
      const found = members.find((m) => m.id === handover.placement_member_id);
      if (found) return found.full_name;
    }
    return overviewHandover?.placement_member ?? null;
  }, [handover, members, overviewHandover]);

  const statusText = useMemo(() => {
    if (handover) {
      return formatHandoverStatusText({
        handed_over: true,
        handover_date: handover.handover_date,
        placement_member: resolvedMemberName,
      });
    }
    if (overviewHandover?.handed_over) {
      return formatHandoverStatusText(overviewHandover);
    }
    return 'Not handed over';
  }, [handover, overviewHandover, resolvedMemberName]);

  const isHandedOver = Boolean(handover || overviewHandover?.handed_over);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    setFeedback(null);
    const built = buildPlacementHandoverPayload(candidateId, adminUserId, {
      handover_date: handoverDateInput,
      placement_member_id: memberIdInput,
      notes: notesInput,
    });

    if (!built.ok) {
      setFeedback({ type: 'error', message: built.error });
      return;
    }

    setSaving(true);
    const { error: upsertErr } = await client
      .from('placement_handover')
      .upsert(built.payload, { onConflict: 'candidate_id' });
    setSaving(false);

    if (upsertErr) {
      setFeedback({ type: 'error', message: formatDbError(upsertErr) });
      return;
    }

    setFeedback({
      type: 'success',
      message: handover
        ? 'Placement handover updated.'
        : 'Candidate handed over to the placement team.',
    });
    await loadPlacementData(false);
    onHandoverUpdated?.();
  };

  const handleConfirmRemove = async () => {
    const client = supabase;
    if (!client) return;

    setRemoving(true);
    setFeedback(null);

    const { error: deleteErr } = await client
      .from('placement_handover')
      .delete()
      .eq('candidate_id', candidateId);

    setRemoving(false);
    setConfirmRemoveOpen(false);

    if (deleteErr) {
      setFeedback({ type: 'error', message: formatDbError(deleteErr) });
      return;
    }

    setFeedback({
      type: 'success',
      message: 'Placement handover record removed.',
    });
    await loadPlacementData(false);
    onHandoverUpdated?.();
  };

  return (
    <section
      aria-labelledby="candidate-placement-heading"
      className="p-6 bg-white border border-slate-200 rounded-xl space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2
            id="candidate-placement-heading"
            className="text-base font-semibold text-slate-900"
          >
            Placement
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Record or update candidate handover to an active placement team
            coordinator.
          </p>
        </div>

        <div
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium self-start sm:self-auto ${
            isHandedOver
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          {isHandedOver ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
          )}
          <span>{statusText}</span>
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-lg text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss placement message"
            className="p-0.5 opacity-70 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <div
          role="status"
          aria-label="Loading placement handover"
          className="space-y-3 animate-pulse"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-10 bg-slate-100 rounded-lg" />
            <div className="h-10 bg-slate-100 rounded-lg" />
          </div>
          <div className="h-20 bg-slate-100 rounded-lg" />
        </div>
      ) : loadError ? (
        <ErrorState
          title="Could not load placement handover details"
          message={loadError}
          onRetry={() => void loadPlacementData(true)}
        />
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          {activeMembers.length === 0 && !handover && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
              <Briefcase className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                No active placement team members were found. Add or activate a
                coordinator under <strong>Placement Team</strong> before saving
                a handover.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="placement-handover-date"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Handover date
              </label>
              <input
                id="placement-handover-date"
                type="date"
                required
                value={handoverDateInput}
                onChange={(e) => setHandoverDateInput(e.target.value)}
                disabled={saving || removing}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="placement-member-select"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Placement team member
              </label>
              <select
                id="placement-member-select"
                required
                value={memberIdInput}
                onChange={(e) => setMemberIdInput(e.target.value)}
                disabled={
                  saving || removing || selectableMembers.length === 0
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-50"
              >
                <option value="">Select placement member…</option>
                {selectableMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} ({member.email})
                    {!member.active ? ' — Inactive' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="placement-handover-notes"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="placement-handover-notes"
              rows={3}
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              disabled={saving || removing}
              placeholder="Mock interview readiness, preferred locations, project highlights…"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 disabled:opacity-50"
            />
          </div>

          <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              {handover && (
                <button
                  type="button"
                  onClick={() => setConfirmRemoveOpen(true)}
                  disabled={saving || removing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove handover
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={
                saving ||
                removing ||
                (selectableMembers.length === 0 && !handover)
              }
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {saving
                ? 'Saving…'
                : handover
                  ? 'Update Handover'
                  : 'Save Handover'}
            </button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmRemoveOpen}
        title="Remove placement handover?"
        message={`This will delete the placement handover record for ${candidateLabel} and return their status to "Not handed over".`}
        confirmLabel="Remove handover"
        loading={removing}
        tone="danger"
        onClose={() => {
          if (!removing) setConfirmRemoveOpen(false);
        }}
        onConfirm={() => void handleConfirmRemove()}
      />
    </section>
  );
}
