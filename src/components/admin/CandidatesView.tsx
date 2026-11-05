import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, UserCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CandidateOverview, SortDirection } from '../../types/database';
import {
  filterAndSortRows,
  formatDbError,
  formatInr,
} from '../../utils/domain';
import {
  EmptyState,
  ErrorState,
  GeneratedCodeBanner,
  SortableHeader,
  TableSkeleton,
} from '../ui/States';
import { CandidateFormModal } from './CandidateFormModal';

type StatusFilter = 'all' | CandidateOverview['status'];
type SortField =
  | 'candidate_code'
  | 'full_name'
  | 'program'
  | 'batch_code'
  | 'counsellor'
  | 'pending'
  | 'status';

interface OrphanLogin {
  id: string;
  full_name: string;
  email: string;
}

const STATUS_TEXT_CLASS: Record<CandidateOverview['status'], string> = {
  onboarding: 'text-amber-700',
  active: 'text-emerald-700',
  completed: 'text-blue-700',
  dropped: 'text-red-700',
};

interface CandidatesViewProps {
  onSelectCandidate: (candidateId: string) => void;
}

export function CandidatesView({ onSelectCandidate }: CandidatesViewProps) {
  const [candidates, setCandidates] = useState<CandidateOverview[]>([]);
  const [orphanLogins, setOrphanLogins] = useState<OrphanLogin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ field: SortField; dir: SortDirection }>({
    field: 'candidate_code',
    dir: 'asc',
  });

  // Modal state
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    candidateId?: string | null;
    initialProfile?: {
      profileId: string;
      fullName: string;
      email: string;
    } | null;
  }>({ open: false, mode: 'create', candidateId: null, initialProfile: null });

  // Newly created candidate banner
  const [createdBanner, setCreatedBanner] = useState<{
    id: string;
    candidate_code: string;
    full_name: string;
  } | null>(null);

  const loadCandidates = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const [candRes, profileRes, candProfileRes] = await Promise.all([
      supabase
        .from('v_candidate_overview')
        .select(
          'candidate_id, candidate_code, full_name, email, phone, status, program, module, batch_code, batch_mode, counsellor, net_fee, paid, pending, handed_over, handover_date, placement_member',
        ),
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'candidate'),
      supabase.from('candidates').select('profile_id'),
    ]);

    if (candRes.error) {
      setError(formatDbError(candRes.error));
      setLoading(false);
      return;
    }

    setCandidates((candRes.data as CandidateOverview[]) ?? []);

    if (!profileRes.error && !candProfileRes.error) {
      const assignedIds = new Set(
        (candProfileRes.data || [])
          .map((r: { profile_id?: string | null }) => r.profile_id)
          .filter(Boolean),
      );
      const orphans = ((profileRes.data as OrphanLogin[]) ?? []).filter(
        (p) => !assignedIds.has(p.id),
      );
      setOrphanLogins(orphans);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const visibleCandidates = useMemo(() => {
    const byStatus =
      statusFilter === 'all'
        ? candidates
        : candidates.filter((c) => c.status === statusFilter);

    return filterAndSortRows(
      byStatus,
      searchQuery,
      (c) => [
        c.candidate_code,
        c.full_name,
        c.email,
        c.phone,
        c.program,
        c.module,
        c.batch_code,
        c.counsellor,
        c.placement_member,
      ],
      (c) => {
        if (sort.field === 'candidate_code') return c.candidate_code;
        if (sort.field === 'full_name') return c.full_name;
        if (sort.field === 'program') return c.program ?? '';
        if (sort.field === 'batch_code') return c.batch_code ?? '';
        if (sort.field === 'counsellor') return c.counsellor ?? '';
        if (sort.field === 'pending') return Number(c.pending ?? 0);
        return c.status;
      },
      sort.dir,
    );
  }, [candidates, statusFilter, searchQuery, sort]);

  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Candidates
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Search and manage candidate onboarding, module &amp; batch
            enrollment, fees, and placement handover.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setModalState({ open: true, mode: 'create', candidateId: null })
          }
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Candidate
        </button>
      </div>

      {createdBanner && (
        <GeneratedCodeBanner
          label={`Candidate "${createdBanner.full_name}" enrolled with code`}
          code={createdBanner.candidate_code}
          subtitle="Generated automatically by the database."
          actionLabel="View Candidate"
          onAction={() => onSelectCandidate(createdBanner.id)}
          onDismiss={() => setCreatedBanner(null)}
        />
      )}

      {/* Notice card: logins without a candidate record */}
      {orphanLogins.length > 0 && (
        <div
          role="region"
          aria-label="Candidate logins without a candidate record"
          className="p-4 bg-amber-50/90 border border-amber-200 rounded-xl"
        >
          <div className="flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-amber-900">
                {orphanLogins.length}{' '}
                {orphanLogins.length === 1 ? 'login has' : 'logins have'} no
                candidate record
              </h2>
              <p className="mt-0.5 text-xs text-amber-800">
                These candidate accounts are registered in the institute directory but do not have an active enrollment profile.
              </p>

              <div className="mt-3 divide-y divide-amber-200/60 bg-white/80 border border-amber-200 rounded-lg overflow-hidden">
                {orphanLogins.map((orphan) => (
                  <div
                    key={orphan.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {orphan.full_name || 'Candidate Account'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{orphan.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setModalState({
                          open: true,
                          mode: 'create',
                          candidateId: null,
                          initialProfile: {
                            profileId: orphan.id,
                            fullName: orphan.full_name || '',
                            email: orphan.email,
                          },
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-950 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors self-start sm:self-auto shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create candidate
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search & Status Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div
          role="group"
          aria-label="Filter candidates by status"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          {(
            [
              'all',
              'onboarding',
              'active',
              'completed',
              'dropped',
            ] as StatusFilter[]
          ).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search candidates"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search code, name, email, batch, module…"
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={7} />
      ) : error ? (
        <ErrorState
          title="Could not load candidate overview"
          message={error}
          onRetry={loadCandidates}
        />
      ) : visibleCandidates.length === 0 ? (
        <EmptyState
          title={
            candidates.length === 0
              ? 'No candidates registered yet'
              : 'No candidates match your search'
          }
          description={
            candidates.length === 0
              ? 'Add your first candidate to start onboarding and assign them to a module and batch.'
              : 'Try clearing the search box or switching the status filter.'
          }
          actionLabel={candidates.length === 0 ? 'Add Candidate' : undefined}
          onAction={
            candidates.length === 0
              ? () =>
                  setModalState({
                    open: true,
                    mode: 'create',
                    candidateId: null,
                  })
              : undefined
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <SortableHeader
                    label="Code"
                    field="candidate_code"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Candidate"
                    field="full_name"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Program & Module"
                    field="program"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Batch"
                    field="batch_code"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Counsellor"
                    field="counsellor"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Pending Fee"
                    field="pending"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Status"
                    field="status"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleCandidates.map((cand) => {
                  const pendingAmount = Number(cand.pending ?? 0);
                  return (
                    <tr
                      key={cand.candidate_id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectCandidate(cand.candidate_id)}
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
                      <td className="px-4 py-3">
                        <div className="text-slate-900">
                          {cand.program || '—'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {cand.module || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {cand.batch_code ? (
                          <div className="text-xs">
                            <span className="font-mono font-medium text-slate-800 tabular-nums">
                              {cand.batch_code}
                            </span>
                            {cand.batch_mode && (
                              <span className="text-slate-500 capitalize">
                                {' '}
                                · {cand.batch_mode}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {cand.counsellor || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        <span
                          className={
                            pendingAmount > 0
                              ? 'font-medium text-amber-700'
                              : 'text-slate-600'
                          }
                        >
                          {formatInr(cand.pending)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium capitalize ${
                            STATUS_TEXT_CLASS[cand.status]
                          }`}
                        >
                          {cand.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => onSelectCandidate(cand.candidate_id)}
                            aria-label={`View candidate ${cand.full_name}`}
                            className="text-xs font-medium text-blue-700 hover:text-blue-900"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setModalState({
                                open: true,
                                mode: 'edit',
                                candidateId: cand.candidate_id,
                              })
                            }
                            aria-label={`Edit candidate ${cand.full_name}`}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CandidateFormModal
        open={modalState.open}
        mode={modalState.mode}
        candidateId={modalState.candidateId}
        initialProfile={modalState.initialProfile}
        onClose={() =>
          setModalState({
            open: false,
            mode: 'create',
            candidateId: null,
            initialProfile: null,
          })
        }
        onSaved={(result) => {
          setModalState({
            open: false,
            mode: 'create',
            candidateId: null,
            initialProfile: null,
          });
          if (result.mode === 'create') {
            setCreatedBanner({
              id: result.id,
              candidate_code: result.candidate_code,
              full_name: result.full_name,
            });
          }
          void loadCandidates();
        }}
      />
    </div>
  );
}
