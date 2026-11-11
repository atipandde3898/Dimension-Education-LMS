import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  Batch,
  BatchSme,
  Candidate,
  ClassSession,
  Module,
  Profile,
  Program,
  SortDirection,
  TimetableSlot,
} from '../../types/database';
import {
  computeTotalSessionHours,
  filterAndSortRows,
  formatCandidateStatusLabel,
  formatDate,
  formatDateTime,
  formatDbError,
  formatDurationMinutes,
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

interface BatchDetailViewProps {
  batchId: string;
  onBack: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onBatchCodeLoaded?: (code: string) => void;
}

type CandidateSortField =
  | 'candidate_code'
  | 'full_name'
  | 'program'
  | 'counsellor'
  | 'status';

const STATUS_STYLES: Record<Candidate['status'], string> = {
  enrolled: 'text-amber-700',
  in_training: 'text-emerald-700',
  certified: 'text-blue-700',
  dropped: 'text-red-700',
};

export function BatchDetailView({
  batchId,
  onBack,
  onSelectCandidate,
  onBatchCodeLoaded,
}: BatchDetailViewProps) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [moduleInfo, setModuleInfo] = useState<Module | null>(null);
  const [batchSmes, setBatchSmes] = useState<BatchSme[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [enrolledCandidates, setEnrolledCandidates] = useState<Candidate[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Assign SME
  const [selectedSmeId, setSelectedSmeId] = useState('');
  const [assigningSme, setAssigningSme] = useState(false);

  // Remove SME confirmation
  const [smeToRemove, setSmeToRemove] = useState<Profile | null>(null);
  const [removingSme, setRemovingSme] = useState(false);

  // Edit Batch schedule modal (never edits timetable_status directly)
  const [editBatchOpen, setEditBatchOpen] = useState(false);
  const [editMode, setEditMode] = useState<'online' | 'offline'>('online');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  const [editBatchError, setEditBatchError] = useState<string | null>(null);

  // Enrolled candidates search & sort
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateSort, setCandidateSort] = useState<{
    field: CandidateSortField;
    dir: SortDirection;
  }>({ field: 'candidate_code', dir: 'asc' });

  const loadBatchDetails = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const { data: batchData, error: batchErr } = await supabase
      .from('batches')
      .select(
        'id, batch_code, module_id, mode, start_date, end_date, location, timetable_status, timetable_finalised_at',
      )
      .eq('id', batchId)
      .single();

    if (batchErr || !batchData) {
      setError(formatDbError(batchErr ?? 'Batch not found.'));
      setLoading(false);
      return;
    }

    const loadedBatch = batchData as Batch;
    setBatch(loadedBatch);
    onBatchCodeLoaded?.(loadedBatch.batch_code);

    const [
      modRes,
      bsRes,
      profilesRes,
      progRes,
      candRes,
      slotsRes,
      sessionsRes,
    ] = await Promise.all([
      supabase
        .from('modules')
        .select('id, code, name, active')
        .eq('id', loadedBatch.module_id)
        .maybeSingle(),
      supabase
        .from('batch_smes')
        .select('batch_id, sme_id')
        .eq('batch_id', batchId),
      supabase
        .from('profiles')
        .select('id, role, full_name, email, phone, active'),
      supabase.from('programs').select('id, name, active'),
      supabase
        .from('candidates')
        .select(
          'id, profile_id, candidate_code, full_name, email, phone, program_id, module_id, batch_id, counsellor_id, status',
        )
        .eq('batch_id', batchId),
      supabase
        .from('timetable_slots')
        .select(
          'id, batch_id, sme_id, day_of_week, start_time, end_time, meeting_link',
        )
        .eq('batch_id', batchId)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase
        .from('sessions')
        .select('id, batch_id, sme_id, session_date, duration_minutes, topic')
        .eq('batch_id', batchId)
        .order('session_date', { ascending: false }),
    ]);

    if (
      modRes.error ||
      bsRes.error ||
      profilesRes.error ||
      progRes.error ||
      candRes.error ||
      slotsRes.error ||
      sessionsRes.error
    ) {
      setError(
        formatDbError(
          modRes.error ||
            bsRes.error ||
            profilesRes.error ||
            progRes.error ||
            candRes.error ||
            slotsRes.error ||
            sessionsRes.error,
        ),
      );
      setLoading(false);
      return;
    }

    setModuleInfo((modRes.data as Module | null) ?? null);
    setBatchSmes((bsRes.data as BatchSme[]) ?? []);
    setAllProfiles((profilesRes.data as Profile[]) ?? []);
    setPrograms((progRes.data as Program[]) ?? []);
    setEnrolledCandidates((candRes.data as Candidate[]) ?? []);
    setTimetableSlots((slotsRes.data as TimetableSlot[]) ?? []);
    setSessions(
      sortSessionsNewestFirst((sessionsRes.data as ClassSession[]) ?? []),
    );
    setLoading(false);
  }, [batchId, onBatchCodeLoaded]);

  useEffect(() => {
    loadBatchDetails();
  }, [loadBatchDetails]);

  const assignedSmeIds = useMemo(
    () => new Set(batchSmes.map((bs) => bs.sme_id)),
    [batchSmes],
  );

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of allProfiles) map.set(p.id, p);
    return map;
  }, [allProfiles]);

  const assignedSmes = useMemo(
    () =>
      batchSmes
        .map(
          (bs) =>
            profileMap.get(bs.sme_id) ?? {
              id: bs.sme_id,
              role: 'sme' as const,
              full_name: bs.sme_id,
              email: '—',
              phone: null,
              active: true,
            },
        )
        .sort((a, b) =>
          (a.full_name ?? a.email ?? '').localeCompare(
            b.full_name ?? b.email ?? '',
          ),
        ),
    [batchSmes, profileMap],
  );

  const availableSmes = useMemo(
    () =>
      allProfiles
        .filter(
          (p) => p.role === 'sme' && p.active && !assignedSmeIds.has(p.id),
        )
        .sort((a, b) =>
          (a.full_name ?? a.email ?? '').localeCompare(
            b.full_name ?? b.email ?? '',
          ),
        ),
    [allProfiles, assignedSmeIds],
  );

  useEffect(() => {
    if (
      availableSmes.length > 0 &&
      !availableSmes.some((s) => s.id === selectedSmeId)
    ) {
      setSelectedSmeId(availableSmes[0].id);
    } else if (availableSmes.length === 0) {
      setSelectedSmeId('');
    }
  }, [availableSmes, selectedSmeId]);

  const programMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of programs) m.set(p.id, p.name);
    return m;
  }, [programs]);

  const counsellorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allProfiles) {
      if (c.role === 'counsellor') {
        m.set(c.id, c.full_name || c.email);
      }
    }
    return m;
  }, [allProfiles]);

  const smeNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allProfiles) {
      m.set(p.id, p.full_name || p.email);
    }
    return m;
  }, [allProfiles]);

  const sessionTotals = useMemo(
    () => computeTotalSessionHours(sessions),
    [sessions],
  );

  const visibleCandidates = useMemo(
    () =>
      filterAndSortRows(
        enrolledCandidates,
        candidateSearch,
        (c) => [
          c.candidate_code,
          c.full_name,
          c.email,
          c.phone,
          programMap.get(c.program_id),
          c.counsellor_id ? counsellorMap.get(c.counsellor_id) : '',
          c.status,
        ],
        (c) => {
          if (candidateSort.field === 'candidate_code') return c.candidate_code;
          if (candidateSort.field === 'full_name') return c.full_name;
          if (candidateSort.field === 'program')
            return programMap.get(c.program_id) ?? '';
          if (candidateSort.field === 'counsellor')
            return c.counsellor_id
              ? (counsellorMap.get(c.counsellor_id) ?? '')
              : '';
          return c.status;
        },
        candidateSort.dir,
      ),
    [
      enrolledCandidates,
      candidateSearch,
      candidateSort,
      programMap,
      counsellorMap,
    ],
  );

  const handleAssignSme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !selectedSmeId) return;

    setAssigningSme(true);
    setActionError(null);

    const { error: err } = await supabase
      .from('batch_smes')
      .insert({ batch_id: batchId, sme_id: selectedSmeId });

    setAssigningSme(false);
    if (err) {
      setActionError(formatDbError(err));
      return;
    }

    await loadBatchDetails();
  };

  const handleConfirmRemoveSme = async () => {
    if (!supabase || !smeToRemove) return;

    setRemovingSme(true);
    setActionError(null);

    const { error: err } = await supabase
      .from('batch_smes')
      .delete()
      .eq('batch_id', batchId)
      .eq('sme_id', smeToRemove.id);

    setRemovingSme(false);
    setSmeToRemove(null);

    if (err) {
      setActionError(formatDbError(err));
      return;
    }

    await loadBatchDetails();
  };

  const openEditScheduleModal = () => {
    if (!batch) return;
    setEditMode(batch.mode);
    setEditStartDate(batch.start_date);
    setEditEndDate(batch.end_date ?? '');
    setEditLocation(batch.location ?? '');
    setEditBatchError(null);
    setEditBatchOpen(true);
  };

  const handleSaveBatchSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !batch) return;

    if (!editStartDate) {
      setEditBatchError('Start date is required.');
      return;
    }
    if (editEndDate && editEndDate < editStartDate) {
      setEditBatchError('End date cannot be earlier than start date.');
      return;
    }

    setSavingBatch(true);
    setEditBatchError(null);

    const payload: Record<string, string | null> = {
      mode: editMode,
      start_date: editStartDate,
      end_date: editEndDate.trim() || null,
      location:
        editMode === 'offline' ? editLocation.trim() || null : null,
    };

    const { error: err } = await supabase
      .from('batches')
      .update(payload)
      .eq('id', batch.id);

    setSavingBatch(false);
    if (err) {
      setEditBatchError(formatDbError(err));
      return;
    }

    setEditBatchOpen(false);
    await loadBatchDetails();
  };

  const handleCandidateSort = (field: CandidateSortField) => {
    setCandidateSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  if (loading) {
    return <TableSkeleton rows={6} columns={5} />;
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
          Back to Batches
        </button>
        <ErrorState
          title="Could not load batch details"
          message={error ?? 'Batch not found.'}
          onRetry={loadBatchDetails}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header & Summary */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Batches
        </button>

        <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="font-mono text-xs font-semibold text-blue-700 tabular-nums">
                  {batch.batch_code}
                </p>
                <TimetableStatusBadge status={batch.timetable_status} />
              </div>
              <h1 className="mt-1.5 text-2xl font-semibold text-slate-900 tracking-tight">
                {moduleInfo
                  ? `${moduleInfo.name} (${moduleInfo.code})`
                  : 'Batch Overview'}
              </h1>
              <p className="mt-1 text-xs text-slate-500 capitalize">
                <span>{batch.mode} delivery</span>
                {batch.mode === 'offline' && batch.location && (
                  <>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="normal-case">{batch.location}</span>
                  </>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={openEditScheduleModal}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start whitespace-nowrap shrink-0"
            >
              Edit Schedule
            </button>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Start Date</dt>
              <dd className="mt-1 font-mono text-sm font-medium text-slate-900 tabular-nums">
                {formatDate(batch.start_date)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">End Date</dt>
              <dd className="mt-1 font-mono text-sm font-medium text-slate-900 tabular-nums">
                {formatDate(batch.end_date)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Assigned SMEs</dt>
              <dd className="mt-1 font-mono text-sm font-medium text-slate-900 tabular-nums">
                {assignedSmes.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Enrolled Candidates</dt>
              <dd className="mt-1 font-mono text-sm font-medium text-slate-900 tabular-nums">
                {enrolledCandidates.length}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {actionError && (
        <ErrorState
          title="Could not update batch"
          message={actionError}
          onRetry={loadBatchDetails}
        />
      )}

      {/* Assigned SMEs Section */}
      <section className="space-y-4" aria-labelledby="batch-smes-heading">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2
              id="batch-smes-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Assigned Subject Matter Experts (SMEs)
            </h2>
            <p className="text-sm text-slate-500">
              Assign active SMEs from your staff directory to lead this batch.
            </p>
          </div>

          <form
            onSubmit={handleAssignSme}
            className="flex items-center gap-2.5 self-start md:self-auto"
          >
            <label htmlFor="assign-sme-select" className="sr-only">
              Select SME to assign
            </label>
            <select
              id="assign-sme-select"
              value={selectedSmeId}
              onChange={(e) => setSelectedSmeId(e.target.value)}
              disabled={availableSmes.length === 0 || assigningSme}
              className="pl-3 pr-9 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 min-w-[230px]"
            >
              {availableSmes.length === 0 ? (
                <option value="">No unassigned active SMEs</option>
              ) : (
                availableSmes.map((sme) => (
                  <option key={sme.id} value={sme.id}>
                    {sme.full_name || sme.email}
                  </option>
                ))
              )}
            </select>
            <button
              type="submit"
              disabled={!selectedSmeId || assigningSme}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              {assigningSme ? 'Assigning…' : 'Assign SME'}
            </button>
          </form>
        </div>

        {assignedSmes.length === 0 ? (
          <EmptyState
            title="No SMEs assigned to this batch"
            description="Select an SME from the dropdown above to assign an instructor to this cohort."
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-left">
                      SME Name
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-left">
                      Email
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-left">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignedSmes.map((sme) => (
                    <tr
                      key={sme.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {sme.full_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{sme.email}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums">
                        {sme.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSmeToRemove(sme)}
                          aria-label={`Remove SME ${sme.full_name || sme.email} from batch`}
                          className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Enrolled Candidates Section */}
      <section className="space-y-4" aria-labelledby="batch-candidates-heading">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2
              id="batch-candidates-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Enrolled Candidates ({enrolledCandidates.length})
            </h2>
            <p className="text-sm text-slate-500">
              Candidates currently assigned to batch {batch.batch_code}.
            </p>
          </div>

          {enrolledCandidates.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search enrolled candidates"
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                placeholder="Search enrolled candidates…"
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>
          )}
        </div>

        {visibleCandidates.length === 0 ? (
          <EmptyState
            title={
              enrolledCandidates.length === 0
                ? 'No candidates enrolled in this batch'
                : 'No enrolled candidates match your search'
            }
            description={
              enrolledCandidates.length === 0
                ? 'Assign candidates to this batch from the Candidates screen when creating or editing a candidate with the same module.'
                : 'Try adjusting your search query.'
            }
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <SortableHeader
                      label="Candidate Code"
                      field="candidate_code"
                      activeField={candidateSort.field}
                      direction={candidateSort.dir}
                      onSort={handleCandidateSort}
                    />
                    <SortableHeader
                      label="Candidate"
                      field="full_name"
                      activeField={candidateSort.field}
                      direction={candidateSort.dir}
                      onSort={handleCandidateSort}
                    />
                    <SortableHeader
                      label="Program"
                      field="program"
                      activeField={candidateSort.field}
                      direction={candidateSort.dir}
                      onSort={handleCandidateSort}
                    />
                    <SortableHeader
                      label="Counsellor"
                      field="counsellor"
                      activeField={candidateSort.field}
                      direction={candidateSort.dir}
                      onSort={handleCandidateSort}
                    />
                    <SortableHeader
                      label="Status"
                      field="status"
                      activeField={candidateSort.field}
                      direction={candidateSort.dir}
                      onSort={handleCandidateSort}
                    />
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleCandidates.map((cand) => (
                    <tr
                      key={cand.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectCandidate(cand.id)}
                          className="font-mono text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline tabular-nums"
                        >
                          {cand.candidate_code}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {cand.full_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {cand.email}
                          {cand.phone ? ` · ${cand.phone}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {programMap.get(cand.program_id) || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {cand.counsellor_id
                          ? counsellorMap.get(cand.counsellor_id) || '—'
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium ${
                            STATUS_STYLES[cand.status]
                          }`}
                        >
                          {formatCandidateStatusLabel(cand.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectCandidate(cand.id)}
                          aria-label={`View candidate ${cand.full_name}`}
                          className="text-xs font-medium text-blue-700 hover:text-blue-900"
                        >
                          View profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Read-Only Weekly Timetable Section */}
      <section className="space-y-4" aria-labelledby="batch-timetable-heading">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id="batch-timetable-heading"
                className="text-lg font-semibold text-slate-900"
              >
                Weekly Timetable
              </h2>
              <TimetableStatusBadge status={batch.timetable_status} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Read-only view of weekly class slots managed by the assigned SMEs
              {batch.timetable_finalised_at
                ? ` · Finalised ${formatDateTime(batch.timetable_finalised_at)}`
                : '.'}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {timetableSlots.length} slot{timetableSlots.length === 1 ? '' : 's'}
          </span>
        </div>

        <WeeklyTimetableList
          slots={timetableSlots}
          mode="admin"
          smeNameById={smeNameMap}
        />
      </section>

      {/* Read-Only Sessions Log Section with Total Hours */}
      <section className="space-y-4" aria-labelledby="batch-sessions-heading">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2
              id="batch-sessions-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Sessions Log ({sessions.length})
            </h2>
            <p className="text-sm text-slate-500">
              Completed classes logged for batch {batch.batch_code}, ordered
              newest first.
            </p>
          </div>

          <div className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl self-start sm:self-auto">
            <span className="text-xs text-slate-500 mr-2">Total hours:</span>
            <span className="font-mono text-base font-semibold text-slate-900 tabular-nums">
              {sessionTotals.totalHoursFormatted} h
            </span>
          </div>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            title="No sessions logged yet"
            description="Completed sessions logged by the batch's SMEs will appear here with total hours taught."
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
                      SME
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((sess) => (
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
                      <td className="px-4 py-3 text-slate-600">
                        {smeNameMap.get(sess.sme_id) || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums text-right whitespace-nowrap">
                        {formatDurationMinutes(sess.duration_minutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {sessions.map((sess) => (
                <div key={sess.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-sm text-slate-900">
                      {sess.topic}
                    </p>
                    <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap shrink-0">
                      {formatDurationMinutes(sess.duration_minutes)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="font-mono tabular-nums">
                      {formatDate(sess.session_date)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{smeNameMap.get(sess.sme_id) || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Edit Batch Schedule Modal */}
      <Modal
        open={editBatchOpen}
        onClose={() => !savingBatch && setEditBatchOpen(false)}
        title={`Edit Schedule · ${batch.batch_code}`}
        description="Batch code and module remain fixed, and timetable status is managed via SME publishing actions."
      >
        <form onSubmit={handleSaveBatchSchedule} className="space-y-4">
          {editBatchError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {editBatchError}
            </div>
          )}

          <div>
            <label
              htmlFor="edit-batch-mode"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Delivery mode
            </label>
            <select
              id="edit-batch-mode"
              value={editMode}
              onChange={(e) => {
                const next = e.target.value as 'online' | 'offline';
                setEditMode(next);
                if (next === 'online') setEditLocation('');
              }}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            >
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-batch-start"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Start date
              </label>
              <input
                id="edit-batch-start"
                type="date"
                required
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="edit-batch-end"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                End date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="edit-batch-end"
                type="date"
                value={editEndDate}
                min={editStartDate || undefined}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {editMode === 'offline' && (
            <div>
              <label
                htmlFor="edit-batch-location"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Location <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="edit-batch-location"
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="e.g. Main Campus, Classroom 2B"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditBatchOpen(false)}
              disabled={savingBatch}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingBatch}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {savingBatch ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Remove SME */}
      <ConfirmDialog
        open={Boolean(smeToRemove)}
        onClose={() => setSmeToRemove(null)}
        onConfirm={handleConfirmRemoveSme}
        loading={removingSme}
        title="Remove SME from Batch?"
        message={`Remove "${
          smeToRemove?.full_name || smeToRemove?.email
        }" from batch ${batch.batch_code}?`}
        confirmLabel="Remove SME"
        tone="danger"
      />
    </div>
  );
}
