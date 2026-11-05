import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Batch, BatchSme, Module, SortDirection } from '../../types/database';
import {
  filterAndSortRows,
  formatDate,
  formatDbError,
  getTimetableStatusLabel,
} from '../../utils/domain';
import { EmptyState, ErrorState, SortableHeader, TableSkeleton } from '../ui/States';
import { TimetableStatusBadge } from '../ui/TimetableWidgets';

type SortField =
  | 'batch_code'
  | 'module'
  | 'mode'
  | 'start_date'
  | 'timetable_status';

interface SmeBatchesViewProps {
  userId: string;
  onSelectBatch: (batch: Batch) => void;
}

export function SmeBatchesView({
  userId,
  onSelectBatch,
}: SmeBatchesViewProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<{ field: SortField; dir: SortDirection }>({
    field: 'start_date',
    dir: 'desc',
  });

  const loadAssignedBatches = useCallback(
    async (showSkeleton = true) => {
      const client = supabase;
      if (!client) return;

      if (showSkeleton) setLoading(true);
      setError(null);

      const { data: assignments, error: bsErr } = await client
        .from('batch_smes')
        .select('batch_id, sme_id')
        .eq('sme_id', userId);

      if (bsErr) {
        setError(formatDbError(bsErr));
        setLoading(false);
        return;
      }

      const assignedIds = Array.from(
        new Set(((assignments as BatchSme[]) ?? []).map((row) => row.batch_id)),
      );

      if (assignedIds.length === 0) {
        setBatches([]);
        setModules([]);
        setLoading(false);
        return;
      }

      const [batchRes, modRes] = await Promise.all([
        client
          .from('batches')
          .select(
            'id, batch_code, module_id, mode, start_date, end_date, location, timetable_status, timetable_finalised_at',
          )
          .in('id', assignedIds)
          .order('start_date', { ascending: false }),
        client.from('modules').select('id, code, name, active'),
      ]);

      if (batchRes.error) {
        setError(formatDbError(batchRes.error));
        setLoading(false);
        return;
      }

      setBatches((batchRes.data as Batch[]) ?? []);
      setModules(modRes.error ? [] : ((modRes.data as Module[]) ?? []));
      setLoading(false);
    },
    [userId],
  );

  useEffect(() => {
    void loadAssignedBatches(true);
  }, [loadAssignedBatches]);

  const moduleMap = useMemo(() => {
    const map = new Map<string, Module>();
    for (const mod of modules) {
      map.set(mod.id, mod);
    }
    return map;
  }, [modules]);

  const formatModuleLabel = useCallback(
    (moduleId: string) => {
      const m = moduleMap.get(moduleId);
      return m ? `${m.name} (${m.code})` : 'Assigned module';
    },
    [moduleMap],
  );

  const visibleBatches = useMemo(
    () =>
      filterAndSortRows(
        batches,
        searchQuery,
        (b) => [
          b.batch_code,
          formatModuleLabel(b.module_id),
          b.mode,
          b.start_date,
          getTimetableStatusLabel(b.timetable_status),
        ],
        (b) => {
          if (sort.field === 'batch_code') return b.batch_code;
          if (sort.field === 'module') return formatModuleLabel(b.module_id);
          if (sort.field === 'mode') return b.mode;
          if (sort.field === 'start_date') return b.start_date;
          return getTimetableStatusLabel(b.timetable_status);
        },
        sort.dir,
      ),
    [batches, searchQuery, sort, formatModuleLabel],
  );

  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            My Batches
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Select an assigned cohort to view candidates, publish the weekly
            timetable, or log completed class sessions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAssignedBatches(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {batches.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search my batches"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search batch code, module, or status…"
              className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {visibleBatches.length} assigned batch
            {visibleBatches.length === 1 ? '' : 'es'}
          </p>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={4} columns={5} />
      ) : error ? (
        <ErrorState
          title="Could not load your batches"
          message={error}
          onRetry={() => void loadAssignedBatches(true)}
        />
      ) : visibleBatches.length === 0 ? (
        <EmptyState
          title={
            batches.length === 0
              ? 'No batches assigned yet'
              : 'No batches match your search'
          }
          description={
            batches.length === 0
              ? 'Once an institute administrator assigns you to a batch, it will appear here.'
              : 'Try clearing or refining your search query.'
          }
          actionLabel={searchQuery ? 'Clear Search' : undefined}
          onAction={searchQuery ? () => setSearchQuery('') : undefined}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <SortableHeader
                    label="Batch Code"
                    field="batch_code"
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
                    label="Mode"
                    field="mode"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Start Date"
                    field="start_date"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Timetable Status"
                    field="timetable_status"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">
                    Open
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleBatches.map((batch) => {
                  const mod = moduleMap.get(batch.module_id);
                  return (
                    <tr
                      key={batch.id}
                      onClick={() => onSelectBatch(batch)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectBatch(batch);
                          }}
                          className="font-mono text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline tabular-nums"
                        >
                          {batch.batch_code}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-slate-900">
                        {mod ? (
                          <div>
                            <span className="font-medium">{mod.name}</span>
                            <span
                              className="text-slate-400 mx-1.5"
                              aria-hidden="true"
                            >
                              ·
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              {mod.code}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 capitalize text-slate-700 whitespace-nowrap">
                        <span>{batch.mode}</span>
                        {batch.mode === 'offline' && batch.location && (
                          <span className="text-xs text-slate-500">
                            {' '}
                            · {batch.location}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatDate(batch.start_date)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <TimetableStatusBadge status={batch.timetable_status} />
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectBatch(batch);
                          }}
                          aria-label={`Open batch ${batch.batch_code}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y divide-slate-200">
            {visibleBatches.map((batch) => {
              const mod = moduleMap.get(batch.module_id);
              return (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => onSelectBatch(batch)}
                  className="w-full p-4 text-left hover:bg-slate-50 transition-colors space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-blue-700 tabular-nums block">
                        {batch.batch_code}
                      </span>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900 truncate">
                        {mod ? `${mod.name} (${mod.code})` : 'Assigned Module'}
                      </p>
                    </div>
                    <TimetableStatusBadge status={batch.timetable_status} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="capitalize">
                      {batch.mode}
                      {batch.mode === 'offline' && batch.location
                        ? ` · ${batch.location}`
                        : ''}
                    </span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      Starts {formatDate(batch.start_date)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
