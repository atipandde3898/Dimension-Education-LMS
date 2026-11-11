import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
  Send,
  X,
} from 'lucide-react';
import type { CandidateProfileFull, SortDirection } from '../../types/database';
import {
  type PlacementCandidateSortField,
  filterAndSortPlacementCandidates,
  formatCandidateStatusLabel,
} from '../../utils/domain';
import { EmptyState } from '../ui/States';

interface PlacementCandidatesViewProps {
  candidates: CandidateProfileFull[];
  selectedCandidateIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  onOpenCandidate: (candidate: CandidateProfileFull) => void;
  onSendOpportunity: () => void;
}

const STAGE_STYLES: Record<CandidateProfileFull['stage'], string> = {
  enrolled: 'bg-[#FDF4E0] text-[#C98A0B] border-[#F6DEAA]',
  in_training: 'bg-[#E7F6EF] text-[#1F9D6B] border-[#BCE8D3]',
  certified: 'bg-[#E8F0FA] text-[#2F6FB0] border-[#BFD7F2]',
  dropped: 'bg-[#FBEAE9] text-[#C2413B] border-[#F4C5C2]',
};

function SortHeader({
  label,
  field,
  activeField,
  direction,
  onSort,
}: {
  label: string;
  field: PlacementCandidateSortField;
  activeField: PlacementCandidateSortField;
  direction: SortDirection;
  onSort: (f: PlacementCandidateSortField) => void;
}) {
  const isActive = activeField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B6B7F] hover:text-[#0B1F3A] whitespace-nowrap"
    >
      <span>{label}</span>
      {isActive ? (
        direction === 'asc' ? (
          <ArrowUp className="w-3 h-3 text-[#0FA3A3]" />
        ) : (
          <ArrowDown className="w-3 h-3 text-[#0FA3A3]" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  );
}

export function PlacementCandidatesView({
  candidates,
  selectedCandidateIds,
  onChangeSelectedIds,
  onOpenCandidate,
  onSendOpportunity,
}: PlacementCandidatesViewProps) {
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<
    'in_training' | 'certified' | 'both'
  >('in_training');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] =
    useState<PlacementCandidateSortField>('candidate_code');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const distinctModules = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates) {
      if (c.module && c.module.trim()) {
        set.add(c.module.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [candidates]);

  const filteredCandidates = useMemo(
    () =>
      filterAndSortPlacementCandidates(
        candidates,
        { moduleFilter, stageFilter, search },
        { field: sortField, direction: sortDir },
      ),
    [candidates, moduleFilter, stageFilter, search, sortField, sortDir],
  );

  const selectedSet = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds],
  );

  const filteredIds = useMemo(
    () => filteredCandidates.map((c) => c.candidate_id),
    [filteredCandidates],
  );

  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedSet.has(id));

  const handleSort = (field: PlacementCandidateSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleToggleOne = (candidateId: string) => {
    if (selectedSet.has(candidateId)) {
      onChangeSelectedIds(
        selectedCandidateIds.filter((id) => id !== candidateId),
      );
    } else {
      onChangeSelectedIds([...selectedCandidateIds, candidateId]);
    }
  };

  const handleToggleAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredIds);
      onChangeSelectedIds(
        selectedCandidateIds.filter((id) => !filteredSet.has(id)),
      );
    } else {
      const merged = new Set(selectedCandidateIds);
      for (const id of filteredIds) {
        merged.add(id);
      }
      onChangeSelectedIds(Array.from(merged));
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-[28px] font-bold font-display text-[#0B1F3A] tracking-tight leading-tight">
          Eligible Candidates
        </h1>
        <p className="mt-1 text-sm text-[#5B6B7F]">
          Filter, inspect profiles, select candidates, and send placement opportunities.
        </p>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* Stage filter */}
          <div
            role="group"
            aria-label="Filter by candidate stage"
            className="inline-flex rounded-lg border border-[#E3E9F0] bg-[#F5F8FB] p-0.5"
          >
            {(
              [
                { value: 'in_training', label: 'In training' },
                { value: 'certified', label: 'Certified' },
                { value: 'both', label: 'Both' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStageFilter(opt.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  stageFilter === opt.value
                    ? 'bg-white text-[#0B1F3A] shadow-xs'
                    : 'text-[#5B6B7F] hover:text-[#0B1F3A]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Module filter */}
          <select
            aria-label="Filter by module"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-white border border-[#E3E9F0] rounded-lg text-[#0B1F3A]"
          >
            <option value="all">All modules</option>
            {distinctModules.map((mod) => (
              <option key={mod} value={mod}>
                {mod}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleToggleAllFiltered}
            disabled={filteredIds.length === 0}
            className="px-3 py-2 text-xs font-semibold text-[#0B7C7C] bg-[#E6F6F6] hover:bg-[#D5EFEF] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {allFilteredSelected
              ? 'Deselect all matching filters'
              : `Select all matching the filters (${filteredIds.length})`}
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-[#5B6B7F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search candidates by name or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
          />
        </div>
      </div>

      {/* Table / Cards */}
      {filteredCandidates.length === 0 ? (
        <EmptyState
          title="No candidates match your filters"
          description="Try switching stage filter to Both, selecting All modules, or clearing the search."
        />
      ) : (
        <div className="bg-white border border-[#E3E9F0] rounded-xl shadow-soft overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#F5F8FB] border-b border-[#E3E9F0]">
                <tr>
                  <th className="px-4 py-3 w-10 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all matching candidates"
                      checked={allFilteredSelected}
                      onChange={handleToggleAllFiltered}
                      className="h-4 w-4 rounded border-slate-300 text-[#0FA3A3] focus:ring-[#0FA3A3]"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader
                      label="Code"
                      field="candidate_code"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader
                      label="Name"
                      field="full_name"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader
                      label="Module"
                      field="module"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader
                      label="Stage"
                      field="stage"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader
                      label="Work & Experience"
                      field="work_exp"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader
                      label="Graduation"
                      field="graduation"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader
                      label="CV"
                      field="cv_present"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E9F0]">
                {filteredCandidates.map((cand) => {
                  const checked = selectedSet.has(cand.candidate_id);
                  const workText =
                    cand.work_type === 'fresher'
                      ? 'Fresher'
                      : cand.work_type === 'professional'
                        ? `Professional · ${cand.total_exp_years ?? 0} yrs`
                        : '—';
                  const gradText = cand.graduation_na
                    ? 'Not applicable'
                    : cand.graduation_degree || cand.graduation_percent != null
                      ? `${cand.graduation_degree || 'Grad'}${
                          cand.graduation_percent != null
                            ? ` (${cand.graduation_percent}%)`
                            : ''
                        }`
                      : '—';

                  return (
                    <tr
                      key={cand.candidate_id}
                      onClick={() => onOpenCandidate(cand)}
                      className={`cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#E6F6F6]/40 hover:bg-[#E6F6F6]/70'
                          : 'hover:bg-[#F5F8FB]'
                      }`}
                    >
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select ${cand.full_name}`}
                          checked={checked}
                          onChange={() => handleToggleOne(cand.candidate_id)}
                          className="h-4 w-4 rounded border-slate-300 text-[#0FA3A3] focus:ring-[#0FA3A3]"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#0B7C7C] tabular-nums whitespace-nowrap">
                        {cand.candidate_code}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                        {cand.full_name}
                      </td>
                      <td className="px-4 py-3 text-[#5B6B7F] whitespace-nowrap">
                        {cand.module || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-medium border rounded-md ${STAGE_STYLES[cand.stage]}`}
                        >
                          {formatCandidateStatusLabel(cand.stage)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#0F1B2D] whitespace-nowrap">
                        {workText}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#0F1B2D] whitespace-nowrap">
                        {gradText}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {cand.cv_path ? (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-[#E7F6EF] text-[#1F9D6B] border border-[#BCE8D3] rounded-md">
                            CV Ready
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-[#F5F8FB] text-[#5B6B7F] border border-[#E3E9F0] rounded-md">
                            Missing
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-[#E3E9F0]">
            {filteredCandidates.map((cand) => {
              const checked = selectedSet.has(cand.candidate_id);
              return (
                <div
                  key={cand.candidate_id}
                  onClick={() => onOpenCandidate(cand)}
                  className="p-4 flex items-start gap-3 cursor-pointer hover:bg-[#F5F8FB]"
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${cand.full_name}`}
                    checked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => handleToggleOne(cand.candidate_id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-[#0FA3A3] focus:ring-[#0FA3A3]"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-[#0B7C7C] tabular-nums">
                        {cand.candidate_code}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-medium border rounded-md ${STAGE_STYLES[cand.stage]}`}
                      >
                        {formatCandidateStatusLabel(cand.stage)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#0B1F3A] truncate">
                      {cand.full_name}
                    </p>
                    <p className="text-xs text-[#5B6B7F]">
                      {cand.module || '—'} ·{' '}
                      {cand.work_type === 'fresher'
                        ? 'Fresher'
                        : cand.work_type === 'professional'
                          ? `${cand.total_exp_years ?? 0} yrs exp`
                          : 'Work N/A'}{' '}
                      · {cand.cv_path ? 'CV Ready' : 'No CV'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sticky Selection Bar */}
      {selectedCandidateIds.length > 0 && (
        <div
          role="region"
          aria-label="Selected candidates action bar"
          className="fixed bottom-4 left-4 right-4 lg:left-[280px] lg:right-8 z-30 max-w-[1216px] mx-auto bg-[#0B1F3A] text-white px-5 py-3.5 rounded-xl shadow-xl border border-[#12294A] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold font-display tabular-nums">
              {selectedCandidateIds.length} selected
            </span>
            <button
              type="button"
              onClick={() => onChangeSelectedIds([])}
              className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>

          <button
            type="button"
            onClick={onSendOpportunity}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#081629] bg-[#0FA3A3] hover:bg-[#0B8A8A] rounded-lg transition-colors whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            Send opportunity
          </button>
        </div>
      )}
    </div>
  );
}
