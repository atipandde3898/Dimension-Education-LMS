import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Info,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  Batch,
  ClassSession,
  Module,
  SmeBatchCandidate,
  SortDirection,
  TimetableSlot,
} from '../../types/database';
import {
  buildSessionPayload,
  buildTimetableSlotPayload,
  DAYS_OF_WEEK,
  filterAndSortRows,
  formatDate,
  formatDbError,
  formatDurationMinutes,
  formatTimeRange12h,
  getDayOfWeekLabel,
  normalizeTimeInput,
  normalizeTimetableStatus,
  sortSessionsNewestFirst,
} from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import {
  EmptyState,
  ErrorState,
  SortableHeader,
  TableSkeleton,
} from '../ui/States';
import {
  TimetableStatusBadge,
  WeeklyTimetableList,
} from '../ui/TimetableWidgets';

type SmeBatchTab = 'candidates' | 'timetable' | 'sessions';
type CandidateSortField = 'candidate_code' | 'full_name' | 'status';

interface SmeBatchDetailViewProps {
  batchId: string;
  userId: string;
  onBack: () => void;
  onBatchCodeLoaded?: (batchCode: string) => void;
}

const CANDIDATE_STATUS_STYLES: Record<SmeBatchCandidate['status'], string> = {
  onboarding: 'text-amber-700',
  active: 'text-emerald-700',
  completed: 'text-blue-700',
  dropped: 'text-red-700',
};

function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function SmeBatchDetailView({
  batchId,
  userId,
  onBack,
  onBatchCodeLoaded,
}: SmeBatchDetailViewProps) {
  const [activeTab, setActiveTab] = useState<SmeBatchTab>('timetable');

  const [batch, setBatch] = useState<Batch | null>(null);
  const [moduleInfo, setModuleInfo] = useState<Module | null>(null);
  const [candidates, setCandidates] = useState<SmeBatchCandidate[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Candidates search & sort
  const [candSearch, setCandSearch] = useState('');
  const [candSort, setCandSort] = useState<{
    field: CandidateSortField;
    dir: SortDirection;
  }>({ field: 'candidate_code', dir: 'asc' });

  // Timetable feedback & modals
  const [timetableFeedback, setTimetableFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [slotDayInput, setSlotDayInput] = useState<number>(1);
  const [slotStartInput, setSlotStartInput] = useState('18:30');
  const [slotEndInput, setSlotEndInput] = useState('20:00');
  const [slotLinkInput, setSlotLinkInput] = useState('');
  const [slotModalError, setSlotModalError] = useState<string | null>(null);
  const [slotSaving, setSlotSaving] = useState(false);

  const [slotToDelete, setSlotToDelete] = useState<TimetableSlot | null>(null);
  const [slotDeleting, setSlotDeleting] = useState(false);

  // Finalise & Opt-out RPC confirmation dialogs
  const [confirmFinaliseOpen, setConfirmFinaliseOpen] = useState(false);
  const [finalising, setFinalising] = useState(false);

  const [confirmOptOutOpen, setConfirmOptOutOpen] = useState(false);
  const [optingOut, setOptingOut] = useState(false);

  // Sessions form, edit modal & delete confirmation
  const [logDateInput, setLogDateInput] = useState(getTodayIsoDate);
  const [logDurationInput, setLogDurationInput] = useState('90');
  const [logTopicInput, setLogTopicInput] = useState('');
  const [loggingSession, setLoggingSession] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [editingSession, setEditingSession] = useState<ClassSession | null>(
    null,
  );
  const [editSessDateInput, setEditSessDateInput] = useState('');
  const [editSessDurationInput, setEditSessDurationInput] = useState('');
  const [editSessTopicInput, setEditSessTopicInput] = useState('');
  const [editSessError, setEditSessError] = useState<string | null>(null);
  const [editSessSaving, setEditSessSaving] = useState(false);

  const [sessionToDelete, setSessionToDelete] = useState<ClassSession | null>(
    null,
  );
  const [sessionDeleting, setSessionDeleting] = useState(false);

  const loadBatchWorkspace = useCallback(
    async (showSkeleton = true) => {
      const client = supabase;
      if (!client) return;

      if (showSkeleton) setLoading(true);
      setError(null);

      const { data: batchData, error: batchErr } = await client
        .from('batches')
        .select(
          'id, batch_code, module_id, mode, start_date, end_date, location, timetable_status, timetable_finalised_at',
        )
        .eq('id', batchId)
        .maybeSingle();

      if (batchErr || !batchData) {
        setError(formatDbError(batchErr ?? 'Batch not found.'));
        setLoading(false);
        return;
      }

      const loadedBatch = batchData as Batch;
      setBatch(loadedBatch);
      onBatchCodeLoaded?.(loadedBatch.batch_code);

      // Strictly query candidates(id, candidate_code, full_name, status, batch_id) ONLY — never fees, PAN, or documents
      const [modRes, candRes, slotsRes, sessionsRes] = await Promise.all([
        client
          .from('modules')
          .select('id, code, name, active')
          .eq('id', loadedBatch.module_id)
          .maybeSingle(),
        client
          .from('candidates')
          .select('id, candidate_code, full_name, status, batch_id')
          .eq('batch_id', batchId)
          .order('candidate_code', { ascending: true }),
        client
          .from('timetable_slots')
          .select(
            'id, batch_id, sme_id, day_of_week, start_time, end_time, meeting_link',
          )
          .eq('batch_id', batchId)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true }),
        client
          .from('sessions')
          .select('id, batch_id, sme_id, session_date, duration_minutes, topic')
          .eq('batch_id', batchId)
          .order('session_date', { ascending: false }),
      ]);

      const fatalErr = candRes.error || slotsRes.error || sessionsRes.error;
      if (fatalErr) {
        setError(formatDbError(fatalErr));
        setLoading(false);
        return;
      }

      setModuleInfo(
        modRes.error ? null : ((modRes.data as Module | null) ?? null),
      );
      setCandidates((candRes.data as SmeBatchCandidate[]) ?? []);
      setSlots((slotsRes.data as TimetableSlot[]) ?? []);
      setSessions(
        sortSessionsNewestFirst((sessionsRes.data as ClassSession[]) ?? []),
      );
      setLoading(false);
    },
    [batchId, onBatchCodeLoaded],
  );

  useEffect(() => {
    void loadBatchWorkspace(true);
  }, [loadBatchWorkspace]);

  const normalizedStatus = normalizeTimetableStatus(batch?.timetable_status);

  const visibleCandidates = useMemo(
    () =>
      filterAndSortRows(
        candidates,
        candSearch,
        (c) => [c.candidate_code, c.full_name, c.status],
        (c) => {
          if (candSort.field === 'candidate_code') return c.candidate_code;
          if (candSort.field === 'full_name') return c.full_name;
          return c.status;
        },
        candSort.dir,
      ),
    [candidates, candSearch, candSort],
  );

  const handleCandidateSort = (field: CandidateSortField) => {
    setCandSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  // --- Timetable Slot Handlers ---
  const openAddSlotModal = (defaultDay = 1) => {
    setEditingSlot(null);
    setSlotDayInput(defaultDay);
    setSlotStartInput('18:30');
    setSlotEndInput('20:00');
    setSlotLinkInput('');
    setSlotModalError(null);
    setSlotModalOpen(true);
  };

  const openEditSlotModal = (slot: TimetableSlot) => {
    setEditingSlot(slot);
    setSlotDayInput(Number(slot.day_of_week) || 1);
    setSlotStartInput(normalizeTimeInput(slot.start_time) || '18:30');
    setSlotEndInput(normalizeTimeInput(slot.end_time) || '20:00');
    setSlotLinkInput(slot.meeting_link ?? '');
    setSlotModalError(null);
    setSlotModalOpen(true);
  };

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const check = buildTimetableSlotPayload(batchId, userId, {
      day_of_week: slotDayInput,
      start_time: slotStartInput,
      end_time: slotEndInput,
      meeting_link: slotLinkInput,
    });

    if (!check.ok) {
      setSlotModalError(check.error);
      return;
    }

    setSlotSaving(true);
    setSlotModalError(null);
    setTimetableFeedback(null);

    if (editingSlot) {
      const { error: updateErr } = await client
        .from('timetable_slots')
        .update({
          sme_id: check.payload.sme_id,
          day_of_week: check.payload.day_of_week,
          start_time: check.payload.start_time,
          end_time: check.payload.end_time,
          meeting_link: check.payload.meeting_link,
        })
        .eq('id', editingSlot.id);

      if (updateErr) {
        setSlotSaving(false);
        setSlotModalError(formatDbError(updateErr));
        return;
      }

      await loadBatchWorkspace(false);
      setSlotSaving(false);
      setSlotModalOpen(false);
      setTimetableFeedback({
        type: 'success',
        message: `${getDayOfWeekLabel(check.payload.day_of_week)} slot (${formatTimeRange12h(
          check.payload.start_time,
          check.payload.end_time,
        )}) updated.`,
      });
    } else {
      const { error: insertErr } = await client
        .from('timetable_slots')
        .insert(check.payload);

      if (insertErr) {
        setSlotSaving(false);
        setSlotModalError(formatDbError(insertErr));
        return;
      }

      await loadBatchWorkspace(false);
      setSlotSaving(false);
      setSlotModalOpen(false);
      setTimetableFeedback({
        type: 'success',
        message: `Added ${getDayOfWeekLabel(check.payload.day_of_week)} slot (${formatTimeRange12h(
          check.payload.start_time,
          check.payload.end_time,
        )}).`,
      });
    }
  };

  const handleConfirmDeleteSlot = async () => {
    const client = supabase;
    if (!client || !slotToDelete) return;

    setSlotDeleting(true);
    setTimetableFeedback(null);

    const targetLabel = `${getDayOfWeekLabel(slotToDelete.day_of_week)} (${formatTimeRange12h(
      slotToDelete.start_time,
      slotToDelete.end_time,
    )})`;

    const { error: delErr } = await client
      .from('timetable_slots')
      .delete()
      .eq('id', slotToDelete.id);

    if (delErr) {
      setSlotDeleting(false);
      setSlotToDelete(null);
      setTimetableFeedback({
        type: 'error',
        message: formatDbError(delErr),
      });
      return;
    }

    await loadBatchWorkspace(false);
    setSlotDeleting(false);
    setSlotToDelete(null);
    setTimetableFeedback({
      type: 'success',
      message: `Removed ${targetLabel} slot.`,
    });
  };

  // --- RPC Handlers (Never update batches.timetable_status directly!) ---
  const handleConfirmFinalise = async () => {
    const client = supabase;
    if (!client) return;

    setFinalising(true);
    setTimetableFeedback(null);

    const { error: rpcErr } = await client.rpc('finalise_timetable', {
      p_batch: batchId,
    });

    if (rpcErr) {
      setFinalising(false);
      setConfirmFinaliseOpen(false);
      setTimetableFeedback({
        type: 'error',
        message: formatDbError(rpcErr),
      });
      return;
    }

    await loadBatchWorkspace(false);
    setFinalising(false);
    setConfirmFinaliseOpen(false);
    setTimetableFeedback({
      type: 'success',
      message:
        'Timetable finalised and published. Candidates in this batch can now view class times and join links.',
    });
  };

  const handleConfirmOptOut = async () => {
    const client = supabase;
    if (!client) return;

    setOptingOut(true);
    setTimetableFeedback(null);

    const { error: rpcErr } = await client.rpc('opt_out_timetable', {
      p_batch: batchId,
    });

    if (rpcErr) {
      setOptingOut(false);
      setConfirmOptOutOpen(false);
      setTimetableFeedback({
        type: 'error',
        message: formatDbError(rpcErr),
      });
      return;
    }

    await loadBatchWorkspace(false);
    setOptingOut(false);
    setConfirmOptOutOpen(false);
    setTimetableFeedback({
      type: 'success',
      message:
        'Marked this batch as opted out of a fixed timetable. Candidates will be informed accordingly.',
    });
  };

  // --- Sessions Handlers ---
  const handleLogSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const check = buildSessionPayload(batchId, userId, {
      session_date: logDateInput,
      duration_minutes: logDurationInput,
      topic: logTopicInput,
    });

    if (!check.ok) {
      setSessionFeedback({ type: 'error', message: check.error });
      return;
    }

    setLoggingSession(true);
    setSessionFeedback(null);

    const { error: insertErr } = await client
      .from('sessions')
      .insert(check.payload);

    if (insertErr) {
      setLoggingSession(false);
      setSessionFeedback({
        type: 'error',
        message: formatDbError(insertErr),
      });
      return;
    }

    await loadBatchWorkspace(false);
    setLoggingSession(false);
    setLogTopicInput('');
    setSessionFeedback({
      type: 'success',
      message: `Logged session "${check.payload.topic}" (${formatDurationMinutes(
        check.payload.duration_minutes,
      )}).`,
    });
  };

  const openEditSessionModal = (sess: ClassSession) => {
    setEditingSession(sess);
    setEditSessDateInput(sess.session_date);
    setEditSessDurationInput(String(sess.duration_minutes));
    setEditSessTopicInput(sess.topic);
    setEditSessError(null);
  };

  const handleSaveEditedSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client || !editingSession) return;

    const check = buildSessionPayload(batchId, userId, {
      session_date: editSessDateInput,
      duration_minutes: editSessDurationInput,
      topic: editSessTopicInput,
    });

    if (!check.ok) {
      setEditSessError(check.error);
      return;
    }

    setEditSessSaving(true);
    setEditSessError(null);
    setSessionFeedback(null);

    const { error: updateErr } = await client
      .from('sessions')
      .update({
        session_date: check.payload.session_date,
        duration_minutes: check.payload.duration_minutes,
        topic: check.payload.topic,
      })
      .eq('id', editingSession.id)
      .eq('sme_id', userId);

    if (updateErr) {
      setEditSessSaving(false);
      setEditSessError(formatDbError(updateErr));
      return;
    }

    await loadBatchWorkspace(false);
    setEditSessSaving(false);
    setEditingSession(null);
    setSessionFeedback({
      type: 'success',
      message: `Updated session "${check.payload.topic}".`,
    });
  };

  const handleConfirmDeleteSession = async () => {
    const client = supabase;
    if (!client || !sessionToDelete) return;

    setSessionDeleting(true);
    setSessionFeedback(null);

    const targetTopic = sessionToDelete.topic;
    const { error: delErr } = await client
      .from('sessions')
      .delete()
      .eq('id', sessionToDelete.id)
      .eq('sme_id', userId);

    if (delErr) {
      setSessionDeleting(false);
      setSessionToDelete(null);
      setSessionFeedback({
        type: 'error',
        message: formatDbError(delErr),
      });
      return;
    }

    await loadBatchWorkspace(false);
    setSessionDeleting(false);
    setSessionToDelete(null);
    setSessionFeedback({
      type: 'success',
      message: `Deleted session "${targetTopic}".`,
    });
  };

  if (loading) {
    return <TableSkeleton rows={5} columns={4} />;
  }

  if (error || !batch) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Batches
        </button>
        <ErrorState
          title="Could not load batch workspace"
          message={error ?? 'Batch not found.'}
          onRetry={() => void loadBatchWorkspace(true)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link & Batch Header */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Batches
        </button>

        <div className="p-6 bg-white border border-slate-200 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-blue-700 tabular-nums">
                {batch.batch_code}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900 tracking-tight">
                {moduleInfo
                  ? `${moduleInfo.name} (${moduleInfo.code})`
                  : batch.batch_code}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="capitalize">{batch.mode} delivery</span>
                {batch.mode === 'offline' && batch.location && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{batch.location}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Starts {formatDate(batch.start_date)}
                </span>
                {batch.end_date && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Ends {formatDate(batch.end_date)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="self-start">
              <TimetableStatusBadge status={batch.timetable_status} />
            </div>
          </div>
        </div>
      </div>

      {/* Three Tabs: Candidates, Timetable, Sessions */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <div
          role="tablist"
          aria-label="Batch sections"
          className="flex items-center gap-6 min-w-max"
        >
          {(
            [
              {
                id: 'candidates',
                label: `Candidates (${candidates.length})`,
              },
              {
                id: 'timetable',
                label: `Timetable (${slots.length})`,
              },
              {
                id: 'sessions',
                label: `Sessions (${sessions.length})`,
              },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`sme-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`sme-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: CANDIDATES (Read-only from candidates table: candidate_code, full_name, status ONLY) */}
      {activeTab === 'candidates' && (
        <section
          id="sme-panel-candidates"
          role="tabpanel"
          aria-labelledby="sme-tab-candidates"
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Enrolled Candidates
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Read-only roster for {batch.batch_code}.
              </p>
            </div>

            {candidates.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search batch candidates"
                  value={candSearch}
                  onChange={(e) => setCandSearch(e.target.value)}
                  placeholder="Search code, name, status…"
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>
            )}
          </div>

          {visibleCandidates.length === 0 ? (
            <EmptyState
              title={
                candidates.length === 0
                  ? 'No candidates assigned to this batch yet'
                  : 'No candidates match your search'
              }
              description={
                candidates.length === 0
                  ? 'Candidates enrolled into this batch by the institute will appear here.'
                  : 'Try adjusting your search query.'
              }
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-slate-50/80 border-b border-slate-200">
                    <tr>
                      <SortableHeader
                        label="Candidate Code"
                        field="candidate_code"
                        activeField={candSort.field}
                        direction={candSort.dir}
                        onSort={handleCandidateSort}
                      />
                      <SortableHeader
                        label="Full Name"
                        field="full_name"
                        activeField={candSort.field}
                        direction={candSort.dir}
                        onSort={handleCandidateSort}
                      />
                      <SortableHeader
                        label="Status"
                        field="status"
                        activeField={candSort.field}
                        direction={candSort.dir}
                        onSort={handleCandidateSort}
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleCandidates.map((cand) => (
                      <tr
                        key={cand.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {cand.candidate_code}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {cand.full_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`text-xs font-medium capitalize ${
                              CANDIDATE_STATUS_STYLES[cand.status]
                            }`}
                          >
                            {cand.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {visibleCandidates.map((cand) => (
                  <div
                    key={cand.id}
                    className="p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-900 truncate">
                        {cand.full_name}
                      </p>
                      <p className="font-mono text-xs text-slate-500 tabular-nums mt-0.5">
                        {cand.candidate_code}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium capitalize shrink-0 ${
                        CANDIDATE_STATUS_STYLES[cand.status]
                      }`}
                    >
                      {cand.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: TIMETABLE */}
      {activeTab === 'timetable' && (
        <section
          id="sme-panel-timetable"
          role="tabpanel"
          aria-labelledby="sme-tab-timetable"
          className="space-y-5"
        >
          {/* Header & Actions */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-semibold text-slate-900">
                  Weekly Timetable
                </h2>
                <TimetableStatusBadge status={batch.timetable_status} />
              </div>
              <p className="text-xs text-slate-500">
                Configure weekly class timings and meeting links (Monday to
                Sunday), then finalise or opt out.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openAddSlotModal(1)}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add slot
              </button>

              <button
                type="button"
                disabled={normalizedStatus === 'published' || finalising}
                onClick={() => setConfirmFinaliseOpen(true)}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Finalise timetable
              </button>

              <button
                type="button"
                disabled={normalizedStatus === 'opted_out' || optingOut}
                onClick={() => setConfirmOptOutOpen(true)}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                I won&apos;t schedule a timetable
              </button>
            </div>
          </div>

          {normalizedStatus === 'published' && (
            <div
              role="status"
              className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-950"
            >
              <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                This timetable is published. Any edits, additions, or removals
                you make to weekly slots are visible to candidates immediately.
              </p>
            </div>
          )}

          {timetableFeedback && (
            <div
              role={timetableFeedback.type === 'error' ? 'alert' : 'status'}
              className={`p-3.5 rounded-xl text-sm flex items-start justify-between gap-3 ${
                timetableFeedback.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              }`}
            >
              <span>{timetableFeedback.message}</span>
              <button
                type="button"
                onClick={() => setTimetableFeedback(null)}
                aria-label="Dismiss timetable message"
                className="p-0.5 opacity-75 hover:opacity-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <WeeklyTimetableList
            slots={slots}
            mode="sme"
            onAddForDay={(day) => openAddSlotModal(day)}
            onEditSlot={openEditSlotModal}
            onDeleteSlot={(slot) => setSlotToDelete(slot)}
          />
        </section>
      )}

      {/* TAB 3: SESSIONS */}
      {activeTab === 'sessions' && (
        <section
          id="sme-panel-sessions"
          role="tabpanel"
          aria-labelledby="sme-tab-sessions"
          className="space-y-6"
        >
          {sessionFeedback && (
            <div
              role={sessionFeedback.type === 'error' ? 'alert' : 'status'}
              className={`p-3.5 rounded-xl text-sm flex items-start justify-between gap-3 ${
                sessionFeedback.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              }`}
            >
              <span>{sessionFeedback.message}</span>
              <button
                type="button"
                onClick={() => setSessionFeedback(null)}
                aria-label="Dismiss session message"
                className="p-0.5 opacity-75 hover:opacity-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Log Completed Session Form */}
          <div className="p-6 bg-white border border-slate-200 rounded-xl">
            <h2 className="text-base font-semibold text-slate-900">
              Log completed session
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Record a class you delivered for {batch.batch_code}.
            </p>

            <form
              onSubmit={handleLogSession}
              className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4 items-end"
              noValidate
            >
              <div className="sm:col-span-3">
                <label
                  htmlFor="log-session-date"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Session date
                </label>
                <input
                  id="log-session-date"
                  type="date"
                  required
                  value={logDateInput}
                  onChange={(e) => setLogDateInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="log-session-duration"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Duration (minutes)
                </label>
                <input
                  id="log-session-duration"
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  required
                  value={logDurationInput}
                  onChange={(e) => setLogDurationInput(e.target.value)}
                  placeholder="e.g. 90"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
                />
              </div>

              <div className="sm:col-span-6">
                <label
                  htmlFor="log-session-topic"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Topic taught
                </label>
                <input
                  id="log-session-topic"
                  type="text"
                  required
                  value={logTopicInput}
                  onChange={(e) => setLogTopicInput(e.target.value)}
                  placeholder="e.g. Partitioning, Shuffle Tuning & Broadcast Joins"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="sm:col-span-12 flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={loggingSession}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  {loggingSession ? 'Logging…' : 'Log session'}
                </button>
              </div>
            </form>
          </div>

          {/* Logged Sessions List (Newest First) */}
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Completed Sessions ({sessions.length})
              </h3>
              <p className="text-xs text-slate-500">
                Ordered newest first. You can edit or delete sessions you logged.
              </p>
            </div>

            {sessions.length === 0 ? (
              <EmptyState
                title="No sessions logged yet"
                description="Use the form above to record completed classes for this batch."
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-50/80 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-left">
                          Date
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-left">
                          Topic Taught
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-left">
                          Duration
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sessions.map((sess) => {
                        const isOwn = sess.sme_id === userId;
                        return (
                          <tr
                            key={sess.id}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                              {formatDate(sess.session_date)}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {sess.topic}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                              {formatDurationMinutes(sess.duration_minutes)}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {isOwn ? (
                                <div className="inline-flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditSessionModal(sess)}
                                    aria-label={`Edit session ${sess.topic}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSessionToDelete(sess)}
                                    aria-label={`Delete session ${sess.topic}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  Co-SME entry
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Stacked Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {sessions.map((sess) => {
                    const isOwn = sess.sme_id === userId;
                    return (
                      <div key={sess.id} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-sm text-slate-900">
                            {sess.topic}
                          </p>
                          <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap shrink-0">
                            {formatDurationMinutes(sess.duration_minutes)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="font-mono tabular-nums">
                            {formatDate(sess.session_date)}
                          </span>
                          {!isOwn && (
                            <span className="text-slate-400">Co-SME entry</span>
                          )}
                        </div>

                        {isOwn && (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => openEditSessionModal(sess)}
                              aria-label={`Edit session ${sess.topic}`}
                              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setSessionToDelete(sess)}
                              aria-label={`Delete session ${sess.topic}`}
                              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Add / Edit Timetable Slot Modal */}
      <Modal
        open={slotModalOpen}
        onClose={() => !slotSaving && setSlotModalOpen(false)}
        title={editingSlot ? 'Edit timetable slot' : 'Add timetable slot'}
        description="Choose a weekday, class start/end times, and an https:// meeting URL."
      >
        <form onSubmit={handleSaveSlot} className="space-y-4" noValidate>
          {slotModalError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {slotModalError}
            </div>
          )}

          <div>
            <label
              htmlFor="slot-day-select"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Day of week
            </label>
            <select
              id="slot-day-select"
              value={slotDayInput}
              onChange={(e) => setSlotDayInput(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.day} value={d.day}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="slot-start-time"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Start time
              </label>
              <input
                id="slot-start-time"
                type="time"
                required
                value={slotStartInput}
                onChange={(e) => setSlotStartInput(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="slot-end-time"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                End time
              </label>
              <input
                id="slot-end-time"
                type="time"
                required
                value={slotEndInput}
                onChange={(e) => setSlotEndInput(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="slot-meeting-link"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Meeting link
            </label>
            <input
              id="slot-meeting-link"
              type="url"
              required
              value={slotLinkInput}
              onChange={(e) => setSlotLinkInput(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              Must begin with <code className="font-mono">https://</code>.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={slotSaving}
              onClick={() => setSlotModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={slotSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {slotSaving
                ? 'Saving…'
                : editingSlot
                  ? 'Save Changes'
                  : 'Add Slot'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Logged Session Modal */}
      <Modal
        open={Boolean(editingSession)}
        onClose={() => !editSessSaving && setEditingSession(null)}
        title="Edit logged session"
        description="Update the date, duration, or topic for your completed class."
      >
        <form onSubmit={handleSaveEditedSession} className="space-y-4" noValidate>
          {editSessError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {editSessError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-session-date"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Session date
              </label>
              <input
                id="edit-session-date"
                type="date"
                required
                value={editSessDateInput}
                onChange={(e) => setEditSessDateInput(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="edit-session-duration"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Duration (minutes)
              </label>
              <input
                id="edit-session-duration"
                type="number"
                min={1}
                max={1440}
                step={1}
                required
                value={editSessDurationInput}
                onChange={(e) => setEditSessDurationInput(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-session-topic"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Topic taught
            </label>
            <input
              id="edit-session-topic"
              type="text"
              required
              value={editSessTopicInput}
              onChange={(e) => setEditSessTopicInput(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={editSessSaving}
              onClick={() => setEditingSession(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editSessSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {editSessSaving ? 'Saving…' : 'Save Session'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Slot Confirmation */}
      <ConfirmDialog
        open={Boolean(slotToDelete)}
        onClose={() => !slotDeleting && setSlotToDelete(null)}
        onConfirm={() => void handleConfirmDeleteSlot()}
        loading={slotDeleting}
        title="Delete timetable slot?"
        message={
          slotToDelete
            ? `Remove the ${getDayOfWeekLabel(
                slotToDelete.day_of_week,
              )} slot (${formatTimeRange12h(
                slotToDelete.start_time,
                slotToDelete.end_time,
              )}) from ${batch.batch_code}?`
            : ''
        }
        confirmLabel="Delete Slot"
        tone="danger"
      />

      {/* Finalise Timetable Confirmation */}
      <ConfirmDialog
        open={confirmFinaliseOpen}
        onClose={() => !finalising && setConfirmFinaliseOpen(false)}
        onConfirm={() => void handleConfirmFinalise()}
        loading={finalising}
        title="Finalise and publish timetable?"
        message={`Publish the weekly timetable for ${batch.batch_code}? Candidates in this batch will immediately see all scheduled slots and meeting links.`}
        confirmLabel="Finalise Timetable"
        tone="primary"
      />

      {/* Opt-Out Timetable Confirmation */}
      <ConfirmDialog
        open={confirmOptOutOpen}
        onClose={() => !optingOut && setConfirmOptOutOpen(false)}
        onConfirm={() => void handleConfirmOptOut()}
        loading={optingOut}
        title="Opt out of fixed timetable?"
        message={`Mark ${batch.batch_code} as not having a fixed weekly timetable? Candidates will see that you will inform them directly of class timings.`}
        confirmLabel="Confirm Opt Out"
        tone="warning"
      />

      {/* Delete Session Confirmation */}
      <ConfirmDialog
        open={Boolean(sessionToDelete)}
        onClose={() => !sessionDeleting && setSessionToDelete(null)}
        onConfirm={() => void handleConfirmDeleteSession()}
        loading={sessionDeleting}
        title="Delete logged session?"
        message={
          sessionToDelete
            ? `Delete your logged session "${sessionToDelete.topic}" on ${formatDate(
                sessionToDelete.session_date,
              )}?`
            : ''
        }
        confirmLabel="Delete Session"
        tone="danger"
      />
    </div>
  );
}
