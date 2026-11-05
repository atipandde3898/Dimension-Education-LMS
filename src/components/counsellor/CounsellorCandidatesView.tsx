import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Search } from 'lucide-react';
import type { CandidateOverview, SortDirection } from '../../types/database';
import { filterAndSortRows, formatInr } from '../../utils/domain';
import {
  EmptyState,
  ErrorState,
  SortableHeader,
  TableSkeleton,
} from '../ui/States';

type StatusFilter = 'all' | CandidateOverview['status'];

type SortField =
  | 'candidate_code'
  | 'full_name'
  | 'program'
  | 'module'
  | 'batch_code'
  | 'status'
  | 'pending'
  | 'handed_over';

const STATUS_TEXT_CLASS: Record<CandidateOverview['status'], string> = {
  onboarding: 'text-amber-700',
  active: 'text-emerald-700',
  completed: 'text-blue-700',
  dropped: 'text-red-700',
};

interface CounsellorCandidatesViewProps {
  candidates: CandidateOverview[];
  overdueCandidateIds: Set<string>;
  loading: boolean;
  error: string | null;
  initialOverdueOnly?: boolean;
  onRetry: () => void;
  onSelectCandidate: (candidateId: string) => void;
}

export function CounsellorCandidatesView({
  candidates,
  overdueCandidateIds,
  loading,
  error,
  initialOverdueOnly = false,
  onRetry,
  onSelectCandidate,
}: CounsellorCandidatesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly);
  const [sort, setSort] = useState<{ field: SortField; dir: SortDirection }>({
    field: 'candidate_code',
    dir: 'asc',
  });

  useEffect(() => {
    setOverdueOnly(initialOverdueOnly);
  }, [initialOverdueOnly]);

  const visibleCandidates = useMemo(() => {
    let base = candidates;
    if (statusFilter !== 'all') {
      base = base.filter((c) => c.status === statusFilter);
    }
    if (overdueOnly) {
      base = base.filter((c) => overdueCandidateIds.has(c.candidate_id));
    }

    return filterAndSortRows(
      base,
      searchQuery,
      (c) => [
        c.candidate_code,
        c.full_name,
        c.email,
        c.phone,
        c.program,
        c.module,
        c.batch_code,
      ],
      (c) => {
        if (sort.field === 'candidate_code') return c.candidate_code;
        if (sort.field === 'full_name') return c.full_name;
        if (sort.field === 'program') return c.program ?? '';
        if (sort.field === 'module') return c.module ?? '';
        if (sort.field === 'batch_code') return c.batch_code ?? '';
        if (sort.field === 'pending') return Number(c.pending ?? 0);
        if (sort.field === 'handed_over') return Boolean(c.handed_over);
        return c.status;
      },
      sort.dir,
    );
  }, [candidates, statusFilter, overdueOnly, overdueCandidateIds, searchQuery, sort]);

  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const hasActiveFilters =
    statusFilter !== 'all' || overdueOnly || searchQuery.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          My Candidates
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Search, filter, and inspect read-only profiles, onboarding statuses,
          installments, and placement handovers for your assigned candidates.
        </p>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Filter candidates by status"
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
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

          <label
            htmlFor="counsellor-overdue-filter"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 cursor-pointer select-none hover:bg-slate-50 transition-colors"
          >
            <input
              id="counsellor-overdue-filter"
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>Has overdue installment</span>
          </label>
        </div>

        <div className="relative w-full xl:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search my candidates"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search code, name, program, batch…"
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={7} />
      ) : error ? (
        <ErrorState
          title="Could not load your candidates"
          message={error}
          onRetry={onRetry}
        />
      ) : visibleCandidates.length === 0 ? (
        <EmptyState
          title={
            candidates.length === 0
              ? 'No candidates assigned yet'
              : 'No candidates match the selected filters'
          }
          description={
            candidates.length === 0
              ? 'Assigned candidates will appear here automatically once linked to your counsellor profile.'
              : 'Try clearing the search query, status filter, or overdue installment toggle.'
          }
          actionLabel={hasActiveFilters ? 'Reset filters' : undefined}
          onAction={
            hasActiveFilters
              ? () => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setOverdueOnly(false);
                }
              : undefined
          }
        />
      ) : (
        <>
          {/* Desktop Sortable Table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
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
                      label="Program"
                      field="program"
                      activeField={sort.field}
                      direction={sort.dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Module"
                      field="module"
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
                      label="Status"
                      field="status"
                      activeField={sort.field}
                      direction={sort.dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Pending Fees"
                      field="pending"
                      activeField={sort.field}
                      direction={sort.dir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortableHeader
                      label="Handed Over"
                      field="handed_over"
                      activeField={sort.field}
                      direction={sort.dir}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleCandidates.map((cand) => {
                    const pendingAmount = Number(cand.pending ?? 0);
                    const hasOverdue = overdueCandidateIds.has(
                      cand.candidate_id,
                    );
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
                          <button
                            type="button"
                            onClick={() => onSelectCandidate(cand.candidate_id)}
                            className="text-left font-medium text-slate-900 hover:text-blue-700 transition-colors"
                          >
                            {cand.full_name}
                          </button>
                          {hasOverdue && (
                            <div className="text-xs font-medium text-red-700 mt-0.5">
                              Overdue installment
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {cand.program || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {cand.module || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {cand.batch_code ? (
                            <span className="font-mono text-xs font-medium text-slate-800 tabular-nums">
                              {cand.batch_code}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Unassigned
                            </span>
                          )}
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
                          {cand.handed_over ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md whitespace-nowrap">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              Handed over
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap">
                              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              Not handed over
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Responsive Cards (< md) */}
          <div className="md:hidden space-y-3">
            {visibleCandidates.map((cand) => {
              const pendingAmount = Number(cand.pending ?? 0);
              const hasOverdue = overdueCandidateIds.has(cand.candidate_id);
              return (
                <div
                  key={cand.candidate_id}
                  className="p-4 bg-white border border-slate-200 rounded-xl space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-blue-700 tabular-nums">
                          {cand.candidate_code}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className={`font-medium capitalize ${
                            STATUS_TEXT_CLASS[cand.status]
                          }`}
                        >
                          {cand.status}
                        </span>
                      </div>
                      <p className="mt-1 font-semibold text-slate-900 truncate">
                        {cand.full_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {cand.program || '—'} · {cand.module || '—'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectCandidate(cand.candidate_id)}
                      aria-label={`Open ${cand.full_name}`}
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100/70 transition-colors shrink-0"
                    >
                      Open
                    </button>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600">
                      Batch:{' '}
                      <strong className="font-mono text-slate-900 tabular-nums">
                        {cand.batch_code || 'Unassigned'}
                      </strong>
                    </span>
                    <span className="font-mono tabular-nums">
                      Pending:{' '}
                      <strong
                        className={
                          pendingAmount > 0 ? 'text-amber-700' : 'text-slate-800'
                        }
                      >
                        {formatInr(cand.pending)}
                      </strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {cand.handed_over ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        Handed over
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-md">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        Not handed over
                      </span>
                    )}
                    {hasOverdue && (
                      <span className="text-xs font-medium text-red-700">
                        Overdue installment
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
