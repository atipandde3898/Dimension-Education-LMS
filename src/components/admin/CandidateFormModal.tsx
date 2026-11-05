import React, { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  Batch,
  Candidate,
  Module,
  Profile,
  Program,
} from '../../types/database';
import {
  buildCandidateCreatePayload,
  buildCandidateUpdatePayload,
  filterBatchesByModule,
  formatDate,
  formatDbError,
  isCandidateBatchModuleLocked,
} from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';

interface CandidateFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  candidateId?: string | null;
  initialProfile?: {
    profileId: string;
    fullName: string;
    email: string;
  } | null;
  onClose: () => void;
  onSaved: (result: {
    mode: 'create' | 'edit';
    id: string;
    candidate_code: string;
    full_name: string;
  }) => void;
}

export function CandidateFormModal({
  open,
  mode,
  candidateId,
  initialProfile,
  onClose,
  onSaved,
}: CandidateFormModalProps) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [counsellors, setCounsellors] = useState<Profile[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [existingCandidate, setExistingCandidate] = useState<Candidate | null>(
    null,
  );

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [programId, setProgramId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [counsellorId, setCounsellorId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState<Candidate['status']>('onboarding');
  const [profileId, setProfileId] = useState<string | null>(null);

  const [confirmDropOpen, setConfirmDropOpen] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!open || !client) return;

    let cancelled = false;
    const fetchFormDeps = async () => {
      setLoadingOptions(true);
      setFormError(null);

      const promises = [
        client.from('programs').select('id, name, active'),
        client.from('modules').select('id, code, name, active'),
        client
          .from('profiles')
          .select('id, role, full_name, email, phone, active')
          .eq('role', 'counsellor'),
        client
          .from('batches')
          .select(
            'id, batch_code, module_id, mode, start_date, end_date, location, timetable_status',
          ),
      ] as const;

      const [progRes, modRes, counRes, batchRes] = await Promise.all(promises);

      if (cancelled) return;

      if (progRes.error || modRes.error || counRes.error || batchRes.error) {
        setFormError(
          formatDbError(
            progRes.error || modRes.error || counRes.error || batchRes.error,
          ),
        );
        setLoadingOptions(false);
        return;
      }

      const loadedPrograms = (progRes.data as Program[]) ?? [];
      const loadedModules = (modRes.data as Module[]) ?? [];
      const loadedCounsellors = (counRes.data as Profile[]) ?? [];
      const loadedBatches = (batchRes.data as Batch[]) ?? [];

      setPrograms(loadedPrograms);
      setModules(loadedModules);
      setCounsellors(loadedCounsellors);
      setBatches(loadedBatches);

      if (mode === 'edit' && candidateId) {
        const { data: candData, error: candErr } = await client
          .from('candidates')
          .select(
            'id, profile_id, candidate_code, full_name, email, phone, program_id, module_id, batch_id, counsellor_id, status',
          )
          .eq('id', candidateId)
          .single();

        if (cancelled) return;
        if (candErr || !candData) {
          setFormError(formatDbError(candErr ?? 'Candidate record not found.'));
          setLoadingOptions(false);
          return;
        }

        const cand = candData as Candidate;
        setExistingCandidate(cand);
        setFullName(cand.full_name ?? '');
        setEmail(cand.email ?? '');
        setPhone(cand.phone ?? '');
        setProgramId(cand.program_id ?? '');
        setModuleId(cand.module_id ?? '');
        setCounsellorId(cand.counsellor_id ?? '');
        setBatchId(cand.batch_id ?? '');
        setStatus(cand.status);
      } else {
        setExistingCandidate(null);
        setFullName(initialProfile?.fullName ?? '');
        setEmail(initialProfile?.email ?? '');
        setPhone('');
        setProfileId(initialProfile?.profileId ?? null);
        const firstProg = loadedPrograms.find((p) => p.active);
        const firstMod = loadedModules.find((m) => m.active);
        const firstCoun = loadedCounsellors.find((c) => c.active);
        setProgramId(firstProg?.id ?? '');
        setModuleId(firstMod?.id ?? '');
        setCounsellorId(firstCoun?.id ?? '');
        setBatchId('');
        setStatus('onboarding');
      }

      setLoadingOptions(false);
    };

    void fetchFormDeps();
    return () => {
      cancelled = true;
    };
  }, [open, mode, candidateId, initialProfile]);

  const batchAndModuleLocked =
    mode === 'edit' && isCandidateBatchModuleLocked(existingCandidate);

  // Filter batches strictly by selected moduleId
  const moduleBatches = useMemo(
    () =>
      filterBatchesByModule(batches, moduleId).sort((a, b) =>
        b.start_date.localeCompare(a.start_date),
      ),
    [batches, moduleId],
  );

  // Include current assigned item even if deactivated when editing
  const selectablePrograms = useMemo(
    () =>
      programs
        .filter((p) => p.active || p.id === existingCandidate?.program_id)
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    [programs, existingCandidate],
  );

  const selectableModules = useMemo(
    () =>
      modules
        .filter((m) => m.active || m.id === existingCandidate?.module_id)
        .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '')),
    [modules, existingCandidate],
  );

  const selectableCounsellors = useMemo(
    () =>
      counsellors
        .filter((c) => c.active || c.id === existingCandidate?.counsellor_id)
        .sort((a, b) =>
          (a.full_name || a.email || '').localeCompare(
            b.full_name || b.email || '',
          ),
        ),
    [counsellors, existingCandidate],
  );

  const handleModuleChange = (nextModuleId: string) => {
    setModuleId(nextModuleId);
    // Reset selected batch if it doesn't belong to the newly chosen module
    if (batchId) {
      const stillMatches = batches.some(
        (b) => b.id === batchId && b.module_id === nextModuleId,
      );
      if (!stillMatches) {
        setBatchId('');
      }
    }
  };

  const executeSave = async () => {
    if (!supabase) return;

    if (mode === 'create') {
      const built = buildCandidateCreatePayload(
        {
          full_name: fullName,
          email,
          phone,
          program_id: programId,
          module_id: moduleId,
          counsellor_id: counsellorId,
          batch_id: batchId || null,
        },
        batches,
      );

      if (!built.ok) {
        setFormError(built.error);
        return;
      }

      setSaving(true);
      setFormError(null);

      const insertPayload = {
        ...built.payload,
        ...(profileId ? { profile_id: profileId } : {}),
      };

      const { data, error: err } = await supabase
        .from('candidates')
        .insert(insertPayload)
        .select('id, candidate_code, full_name')
        .single();

      setSaving(false);

      if (err || !data) {
        setFormError(formatDbError(err));
        return;
      }

      onSaved({
        mode: 'create',
        id: data.id,
        candidate_code: data.candidate_code,
        full_name: data.full_name,
      });
      return;
    }

    if (!existingCandidate) return;

    const built = buildCandidateUpdatePayload(
      existingCandidate,
      {
        full_name: fullName,
        email,
        phone,
        program_id: programId,
        module_id: moduleId,
        batch_id: batchId || null,
        counsellor_id: counsellorId || null,
        status,
      },
      batches,
    );

    if (!built.ok) {
      setFormError(built.error);
      setConfirmDropOpen(false);
      return;
    }

    setSaving(true);
    setFormError(null);

    const { data, error: err } = await supabase
      .from('candidates')
      .update(built.payload)
      .eq('id', existingCandidate.id)
      .select('id, candidate_code, full_name')
      .single();

    setSaving(false);
    setConfirmDropOpen(false);

    if (err || !data) {
      setFormError(formatDbError(err));
      return;
    }

    onSaved({
      mode: 'edit',
      id: data.id,
      candidate_code: data.candidate_code,
      full_name: data.full_name,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      mode === 'edit' &&
      existingCandidate &&
      existingCandidate.status !== 'dropped' &&
      status === 'dropped'
    ) {
      setConfirmDropOpen(true);
      return;
    }
    void executeSave();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={() => !saving && onClose()}
        title={
          mode === 'create'
            ? 'Enroll Candidate'
            : `Edit Candidate${
                existingCandidate
                  ? ` · ${existingCandidate.candidate_code}`
                  : ''
              }`
        }
        description={
          mode === 'create'
            ? 'Candidate code is generated automatically by the database upon saving.'
            : 'Update candidate contact details, counsellor, status, or batch assignment.'
        }
        maxWidthClass="max-w-xl"
      >
        {loadingOptions ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Loading candidate form options…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
              >
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label
                  htmlFor="cand-fullname"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Full name
                </label>
                <input
                  id="cand-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Rohan Deshmukh"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="cand-email"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Email address
                </label>
                <input
                  id="cand-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rohan@example.com"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="cand-phone"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Phone number
                </label>
                <input
                  id="cand-phone"
                  type="tel"
                  required={mode === 'create'}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cand-program"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Program
                </label>
                <select
                  id="cand-program"
                  required
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                  className="w-full pl-3.5 pr-9 py-2 text-sm bg-white border border-slate-300 rounded-lg truncate focus:outline-none focus:border-blue-600"
                >
                  <option value="">Select program…</option>
                  {selectablePrograms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="cand-counsellor"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Counsellor
                </label>
                <select
                  id="cand-counsellor"
                  required={mode === 'create'}
                  value={counsellorId}
                  onChange={(e) => setCounsellorId(e.target.value)}
                  className="w-full pl-3.5 pr-9 py-2 text-sm bg-white border border-slate-300 rounded-lg truncate focus:outline-none focus:border-blue-600"
                >
                  <option value="">Select counsellor…</option>
                  {selectableCounsellors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name || c.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {batchAndModuleLocked && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 text-xs text-slate-600">
                <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <span>
                  Module and batch are locked because a batch has already been
                  assigned to this candidate.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cand-module"
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1"
                >
                  <span>Module</span>
                  {batchAndModuleLocked && (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </label>
                <select
                  id="cand-module"
                  required
                  disabled={batchAndModuleLocked}
                  value={moduleId}
                  onChange={(e) => handleModuleChange(e.target.value)}
                  className="w-full pl-3.5 pr-9 py-2 text-sm bg-white border border-slate-300 rounded-lg truncate focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                  <option value="">Select module…</option>
                  {selectableModules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} — {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="cand-batch"
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1"
                >
                  <span>
                    Batch{' '}
                    {!batchAndModuleLocked && (
                      <span className="text-slate-400 font-normal">
                        (optional)
                      </span>
                    )}
                  </span>
                  {batchAndModuleLocked && (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </label>
                <select
                  id="cand-batch"
                  disabled={batchAndModuleLocked || !moduleId}
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className="w-full pl-3.5 pr-9 py-2 text-sm bg-white border border-slate-300 rounded-lg truncate focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {!moduleId
                      ? 'Select a module first'
                      : moduleBatches.length === 0
                        ? 'No batches for this module'
                        : 'Unassigned (assign later)'}
                  </option>
                  {moduleBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batch_code} · {b.mode} · {formatDate(b.start_date)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {mode === 'edit' && (
              <div>
                <label
                  htmlFor="cand-status"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Enrollment status
                </label>
                <select
                  id="cand-status"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as Candidate['status'])
                  }
                  className="w-full pl-3.5 pr-9 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                >
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                {saving
                  ? 'Saving…'
                  : mode === 'create'
                    ? 'Create Candidate'
                    : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDropOpen}
        onClose={() => setConfirmDropOpen(false)}
        onConfirm={() => void executeSave()}
        loading={saving}
        title="Mark Candidate as Dropped?"
        message={`Are you sure you want to mark "${fullName}" as dropped? Please confirm before saving this status change.`}
        confirmLabel="Mark as Dropped"
        tone="danger"
      />
    </>
  );
}
