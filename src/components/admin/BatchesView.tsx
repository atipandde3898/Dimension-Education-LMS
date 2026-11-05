import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Batch, Module, SortDirection } from '../../types/database';
import {
  buildBatchCreatePayload,
  filterAndSortRows,
  formatDate,
  formatDbError,
  getTimetableStatusLabel,
} from '../../utils/domain';
import { Modal } from '../ui/Modal';
import {
  EmptyState,
  ErrorState,
  GeneratedCodeBanner,
  SortableHeader,
  TableSkeleton,
} from '../ui/States';
import { TimetableStatusBadge } from '../ui/TimetableWidgets';

type ModeFilter = 'all' | 'online' | 'offline';
type SortField =
  | 'batch_code'
  | 'module'
  | 'mode'
  | 'start_date'
  | 'timetable_status';

interface BatchesViewProps {
  onSelectBatch: (batchId: string) => void;
}

export function BatchesView({ onSelectBatch }: BatchesViewProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [sort, setSort] = useState<{ field: SortField; dir: SortDirection }>({
    field: 'start_date',
    dir: 'desc',
  });

  // Create Batch modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [moduleId, setModuleId] = useState('');
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Generated batch_code confirmation
  const [createdBatch, setCreatedBatch] = useState<{
    id: string;
    batch_code: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const [batchRes, modRes] = await Promise.all([
      supabase
        .from('batches')
        .select(
          'id, batch_code, module_id, mode, start_date, end_date, location, timetable_status',
        ),
      supabase.from('modules').select('id, code, name, active'),
    ]);

    if (batchRes.error || modRes.error) {
      setError(formatDbError(batchRes.error || modRes.error));
      setLoading(false);
      return;
    }

    setBatches((batchRes.data as Batch[]) ?? []);
    setModules((modRes.data as Module[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const moduleMap = useMemo(() => {
    const map = new Map<string, Module>();
    for (const m of modules) {
      map.set(m.id, m);
    }
    return map;
  }, [modules]);

  const activeModules = useMemo(
    () =>
      [...modules]
        .filter((m) => m.active)
        .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '')),
    [modules],
  );

  const formatModuleLabel = useCallback(
    (modId: string) => {
      const m = moduleMap.get(modId);
      return m ? `${m.code} · ${m.name}` : 'Unknown module';
    },
    [moduleMap],
  );

  const visibleBatches = useMemo(() => {
    const byMode =
      modeFilter === 'all'
        ? batches
        : batches.filter((b) => b.mode === modeFilter);

    return filterAndSortRows(
      byMode,
      searchQuery,
      (b) => [
        b.batch_code,
        formatModuleLabel(b.module_id),
        b.mode,
        b.start_date,
        b.location,
        b.timetable_status,
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
    );
  }, [batches, modeFilter, searchQuery, sort, formatModuleLabel]);

  const openCreateModal = () => {
    setFormError(null);
    setModuleId(activeModules[0]?.id ?? '');
    setMode('online');
    setStartDate('');
    setEndDate('');
    setLocation('');
    setCreateOpen(true);
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const built = buildBatchCreatePayload({
      module_id: moduleId,
      mode,
      start_date: startDate,
      end_date: endDate,
      location,
    });

    if (!built.ok) {
      setFormError(built.error);
      return;
    }

    setSaving(true);
    setFormError(null);

    const { data, error: insertErr } = await supabase
      .from('batches')
      .insert(built.payload)
      .select('id, batch_code')
      .single();

    setSaving(false);

    if (insertErr || !data) {
      setFormError(formatDbError(insertErr));
      return;
    }

    setCreateOpen(false);
    setCreatedBatch({ id: data.id, batch_code: data.batch_code });
    await loadData();
  };

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
            Batches
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Schedule online and offline training cohorts, assign SMEs, and
            inspect enrolled candidates.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create Batch
        </button>
      </div>

      {createdBatch && (
        <GeneratedCodeBanner
          label="Batch created with generated code"
          code={createdBatch.batch_code}
          subtitle="Assigned automatically by the database. You can now assign SMEs or enroll candidates."
          actionLabel="Open Batch Details"
          onAction={() => onSelectBatch(createdBatch.id)}
          onDismiss={() => setCreatedBatch(null)}
        />
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div
          role="group"
          aria-label="Filter batches by mode"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          {(['all', 'online', 'offline'] as ModeFilter[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModeFilter(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                modeFilter === m
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m === 'all' ? 'All Modes' : m}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search batches"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search batch code, module, status…"
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} columns={6} />
      ) : error ? (
        <ErrorState
          title="Could not load batches"
          message={error}
          onRetry={loadData}
        />
      ) : visibleBatches.length === 0 ? (
        <EmptyState
          title={
            batches.length === 0
              ? 'No batches scheduled yet'
              : 'No batches match your search'
          }
          description={
            batches.length === 0
              ? 'Create a batch for any active module. The database will generate its batch code automatically.'
              : 'Try clearing the search input or changing the mode filter.'
          }
          actionLabel={batches.length === 0 ? 'Create Batch' : undefined}
          onAction={batches.length === 0 ? openCreateModal : undefined}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
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
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleBatches.map((batch) => {
                  const mod = moduleMap.get(batch.module_id);
                  return (
                    <tr
                      key={batch.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectBatch(batch.id)}
                          className="font-mono text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline tabular-nums"
                        >
                          {batch.batch_code}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-900">
                        {mod ? (
                          <div>
                            <span className="font-medium">{mod.name}</span>
                            <span className="text-slate-400 mx-1.5" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              {mod.code}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-700 whitespace-nowrap">
                        <span>{batch.mode}</span>
                        {batch.mode === 'offline' && batch.location && (
                          <span className="text-xs text-slate-500">
                            {' '}
                            · {batch.location}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatDate(batch.start_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <TimetableStatusBadge status={batch.timetable_status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectBatch(batch.id)}
                          aria-label={`View batch ${batch.batch_code}`}
                          className="text-xs font-medium text-blue-700 hover:text-blue-900"
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Batch Modal */}
      <Modal
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Create Batch"
        description="Batch code will be generated automatically by the database after saving."
      >
        <form onSubmit={handleCreateBatch} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {formError}
            </div>
          )}

          {activeModules.length === 0 ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              No active modules are available. Please add or activate a module
              in Programs &amp; Modules first.
            </div>
          ) : (
            <div>
              <label
                htmlFor="batch-module"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Module
              </label>
              <select
                id="batch-module"
                required
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              >
                <option value="">Select a module…</option>
                {activeModules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="batch-mode"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Delivery mode
            </label>
            <select
              id="batch-mode"
              value={mode}
              onChange={(e) => {
                const nextMode = e.target.value as 'online' | 'offline';
                setMode(nextMode);
                if (nextMode === 'online') setLocation('');
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
                htmlFor="batch-start-date"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Start date
              </label>
              <input
                id="batch-start-date"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="batch-end-date"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                End date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="batch-end-date"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="batch-location"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Location <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="batch-location"
              type="text"
              disabled={mode === 'online'}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={
                mode === 'offline'
                  ? 'e.g. Main Campus, Classroom 2B'
                  : 'Applicable to offline batches only'
              }
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || activeModules.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Batch'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
