import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Module, Program, SortDirection } from '../../types/database';
import { filterAndSortRows, formatDbError } from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import {
  EmptyState,
  ErrorState,
  SortableHeader,
  TableSkeleton,
} from '../ui/States';

type StatusFilter = 'all' | 'active' | 'inactive';

interface CatalogViewProps {
  onNavigatePlacement?: () => void;
}

export function CatalogView({ onNavigatePlacement }: CatalogViewProps) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [modules, setModules] = useState<Module[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Programs search, filter, sort
  const [programSearch, setProgramSearch] = useState('');
  const [programStatusFilter, setProgramStatusFilter] =
    useState<StatusFilter>('all');
  const [programSort, setProgramSort] = useState<{
    field: 'name' | 'active';
    dir: SortDirection;
  }>({ field: 'name', dir: 'asc' });

  // Modules search, filter, sort
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleStatusFilter, setModuleStatusFilter] =
    useState<StatusFilter>('all');
  const [moduleSort, setModuleSort] = useState<{
    field: 'code' | 'name' | 'active';
    dir: SortDirection;
  }>({ field: 'code', dir: 'asc' });

  // Program modal
  const [programModal, setProgramModal] = useState<{
    open: boolean;
    editing: Program | null;
  }>({ open: false, editing: null });
  const [programName, setProgramName] = useState('');
  const [programActive, setProgramActive] = useState(true);

  // Module modal
  const [moduleModal, setModuleModal] = useState<{
    open: boolean;
    editing: Module | null;
  }>({ open: false, editing: null });
  const [moduleCode, setModuleCode] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [moduleActive, setModuleActive] = useState(true);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Deactivation confirmation dialog
  const [confirmTarget, setConfirmTarget] = useState<{
    table: 'programs' | 'modules';
    id: string;
    label: string;
    entityType: string;
  } | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<{
    table: 'programs' | 'modules';
    id: string;
    label: string;
    entityType: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAll = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    setLoading(true);
    setError(null);

    const [progRes, modRes] = await Promise.all([
      client.from('programs').select('id, name, active'),
      client.from('modules').select('id, code, name, active'),
    ]);

    if (progRes.error || modRes.error) {
      setError(formatDbError(progRes.error || modRes.error));
      setLoading(false);
      return;
    }

    setPrograms((progRes.data as Program[]) ?? []);
    setModules((modRes.data as Module[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const visiblePrograms = useMemo(() => {
    const base = programs.filter((p) =>
      programStatusFilter === 'all'
        ? true
        : programStatusFilter === 'active'
          ? p.active
          : !p.active,
    );
    return filterAndSortRows(
      base,
      programSearch,
      (p) => [p.name, p.active ? 'active' : 'inactive'],
      (p) => (programSort.field === 'name' ? (p.name ?? '') : p.active),
      programSort.dir,
    );
  }, [programs, programStatusFilter, programSearch, programSort]);

  const visibleModules = useMemo(() => {
    const base = modules.filter((m) =>
      moduleStatusFilter === 'all'
        ? true
        : moduleStatusFilter === 'active'
          ? m.active
          : !m.active,
    );
    return filterAndSortRows(
      base,
      moduleSearch,
      (m) => [m.code, m.name, m.active ? 'active' : 'inactive'],
      (m) => {
        if (moduleSort.field === 'code') return m.code ?? '';
        if (moduleSort.field === 'name') return m.name ?? '';
        return m.active;
      },
      moduleSort.dir,
    );
  }, [modules, moduleStatusFilter, moduleSearch, moduleSort]);

  const openAddProgram = () => {
    setFormError(null);
    setProgramName('');
    setProgramActive(true);
    setProgramModal({ open: true, editing: null });
  };

  const openEditProgram = (program: Program) => {
    setFormError(null);
    setProgramName(program.name ?? '');
    setProgramActive(program.active);
    setProgramModal({ open: true, editing: program });
  };

  const openAddModule = () => {
    setFormError(null);
    setModuleCode('');
    setModuleName('');
    setModuleActive(true);
    setModuleModal({ open: true, editing: null });
  };

  const openEditModule = (mod: Module) => {
    setFormError(null);
    setModuleCode(mod.code ?? '');
    setModuleName(mod.name ?? '');
    setModuleActive(mod.active);
    setModuleModal({ open: true, editing: mod });
  };

  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;
    const trimmed = programName.trim();
    if (!trimmed) {
      setFormError('Program name is required.');
      return;
    }

    setSaving(true);
    setFormError(null);

    if (programModal.editing) {
      const { error: err } = await client
        .from('programs')
        .update({ name: trimmed, active: programActive })
        .eq('id', programModal.editing.id);
      if (err) {
        setFormError(formatDbError(err));
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await client
        .from('programs')
        .insert({ name: trimmed, active: true });
      if (err) {
        setFormError(formatDbError(err));
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setProgramModal({ open: false, editing: null });
    await loadAll();
  };

  const handleSaveModule = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;
    const code = moduleCode.trim().toUpperCase();
    const name = moduleName.trim();

    if (!code) {
      setFormError('Module code is required.');
      return;
    }
    if (!name) {
      setFormError('Module name is required.');
      return;
    }

    setSaving(true);
    setFormError(null);

    if (moduleModal.editing) {
      const { error: err } = await client
        .from('modules')
        .update({ code, name, active: moduleActive })
        .eq('id', moduleModal.editing.id);
      if (err) {
        setFormError(formatDbError(err));
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await client
        .from('modules')
        .insert({ code, name, active: true });
      if (err) {
        setFormError(formatDbError(err));
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setModuleModal({ open: false, editing: null });
    await loadAll();
  };

  const handleConfirmDeactivate = async () => {
    const client = supabase;
    if (!client || !confirmTarget) return;
    setDeactivating(true);
    setActionError(null);

    const { error: err } = await client
      .from(confirmTarget.table)
      .update({ active: false })
      .eq('id', confirmTarget.id);

    setDeactivating(false);
    setConfirmTarget(null);

    if (err) {
      setActionError(formatDbError(err));
      return;
    }
    await loadAll();
  };

  const handleReactivate = async (table: 'programs' | 'modules', id: string) => {
    const client = supabase;
    if (!client) return;
    setActionError(null);
    const { error: err } = await client
      .from(table)
      .update({ active: true })
      .eq('id', id);
    if (err) {
      setActionError(formatDbError(err));
      return;
    }
    await loadAll();
  };

  const handleConfirmDelete = async () => {
    const client = supabase;
    if (!client || !deleteTarget) return;
    setDeleting(true);
    setActionError(null);

    const { error: err } = await client
      .from(deleteTarget.table)
      .delete()
      .eq('id', deleteTarget.id);

    setDeleting(false);
    setDeleteTarget(null);

    if (err) {
      if ((err as { code?: string }).code === '23503') {
        setActionError(
          'This is in use, so it cannot be deleted. Deactivate it instead.',
        );
      } else {
        setActionError(formatDbError(err));
      }
      return;
    }
    await loadAll();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Programs &amp; Modules
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Add, edit, or deactivate training programs and curriculum modules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {onNavigatePlacement && (
            <button
              type="button"
              onClick={onNavigatePlacement}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <span>Placement Team</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <ErrorState
          title="Action could not be completed"
          message={actionError}
          onRetry={() => void loadAll()}
        />
      )}

      {loading ? (
        <div className="space-y-6">
          <TableSkeleton rows={4} columns={3} />
          <TableSkeleton rows={4} columns={4} />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load programs and modules"
          message={error}
          onRetry={() => void loadAll()}
        />
      ) : (
        <div className="space-y-10">
          {/* =============================================================== */}
          {/* SECTION 1: PROGRAMS                                             */}
          {/* =============================================================== */}
          <section className="space-y-4" aria-labelledby="programs-heading">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2
                  id="programs-heading"
                  className="text-lg font-semibold text-slate-900"
                >
                  Programs ({programs.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Academic tracks selected during candidate enrollment.
                </p>
              </div>

              <button
                type="button"
                onClick={openAddProgram}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Program
              </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Filter programs by status"
                className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
              >
                {(['all', 'active', 'inactive'] as StatusFilter[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setProgramStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                      programStatusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search programs"
                  value={programSearch}
                  onChange={(e) => setProgramSearch(e.target.value)}
                  placeholder="Search programs…"
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {visiblePrograms.length === 0 ? (
              <EmptyState
                title={
                  programs.length === 0
                    ? 'No programs added yet'
                    : 'No matching programs'
                }
                description={
                  programs.length === 0
                    ? 'Create your first training program so candidates can be enrolled.'
                    : 'Try adjusting your search query or status filter.'
                }
                actionLabel={programs.length === 0 ? 'Add Program' : undefined}
                onAction={programs.length === 0 ? openAddProgram : undefined}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-50/80 border-b border-slate-200">
                      <tr>
                        <SortableHeader
                          label="Program Name"
                          field="name"
                          activeField={programSort.field}
                          direction={programSort.dir}
                          onSort={(f) =>
                            setProgramSort((prev) => ({
                              field: f,
                              dir:
                                prev.field === f && prev.dir === 'asc'
                                  ? 'desc'
                                  : 'asc',
                            }))
                          }
                        />
                        <SortableHeader
                          label="Status"
                          field="active"
                          activeField={programSort.field}
                          direction={programSort.dir}
                          onSort={(f) =>
                            setProgramSort((prev) => ({
                              field: f,
                              dir:
                                prev.field === f && prev.dir === 'asc'
                                  ? 'desc'
                                  : 'asc',
                            }))
                          }
                        />
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visiblePrograms.map((program) => (
                        <tr
                          key={program.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {program.name}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-medium ${
                                program.active
                                  ? 'text-emerald-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              {program.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => openEditProgram(program)}
                                aria-label={`Edit program ${program.name}`}
                                className="text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
                              >
                                Edit
                              </button>
                              {program.active ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmTarget({
                                      table: 'programs',
                                      id: program.id,
                                      label: program.name,
                                      entityType: 'program',
                                    })
                                  }
                                  aria-label={`Deactivate program ${program.name}`}
                                  className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleReactivate('programs', program.id)
                                  }
                                  aria-label={`Activate program ${program.name}`}
                                  className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                                >
                                  Activate
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    table: 'programs',
                                    id: program.id,
                                    label: program.name,
                                    entityType: 'program',
                                  })
                                }
                                aria-label={`Delete program ${program.name}`}
                                className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* =============================================================== */}
          {/* SECTION 2: MODULES                                              */}
          {/* =============================================================== */}
          <section
            className="space-y-4 pt-6 border-t border-slate-200"
            aria-labelledby="modules-heading"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2
                  id="modules-heading"
                  className="text-lg font-semibold text-slate-900"
                >
                  Modules ({modules.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Curriculum modules used to schedule batches and match candidates.
                </p>
              </div>

              <button
                type="button"
                onClick={openAddModule}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Module
              </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Filter modules by status"
                className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
              >
                {(['all', 'active', 'inactive'] as StatusFilter[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setModuleStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                      moduleStatusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search modules"
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  placeholder="Search code or name…"
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {visibleModules.length === 0 ? (
              <EmptyState
                title={
                  modules.length === 0
                    ? 'No modules added yet'
                    : 'No matching modules'
                }
                description={
                  modules.length === 0
                    ? 'Create curriculum modules to schedule batches and assign candidates.'
                    : 'Try adjusting your search query or status filter.'
                }
                actionLabel={modules.length === 0 ? 'Add Module' : undefined}
                onAction={modules.length === 0 ? openAddModule : undefined}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-50/80 border-b border-slate-200">
                      <tr>
                        <SortableHeader
                          label="Code"
                          field="code"
                          activeField={moduleSort.field}
                          direction={moduleSort.dir}
                          onSort={(f) =>
                            setModuleSort((prev) => ({
                              field: f,
                              dir:
                                prev.field === f && prev.dir === 'asc'
                                  ? 'desc'
                                  : 'asc',
                            }))
                          }
                        />
                        <SortableHeader
                          label="Module Name"
                          field="name"
                          activeField={moduleSort.field}
                          direction={moduleSort.dir}
                          onSort={(f) =>
                            setModuleSort((prev) => ({
                              field: f,
                              dir:
                                prev.field === f && prev.dir === 'asc'
                                  ? 'desc'
                                  : 'asc',
                            }))
                          }
                        />
                        <SortableHeader
                          label="Status"
                          field="active"
                          activeField={moduleSort.field}
                          direction={moduleSort.dir}
                          onSort={(f) =>
                            setModuleSort((prev) => ({
                              field: f,
                              dir:
                                prev.field === f && prev.dir === 'asc'
                                  ? 'desc'
                                  : 'asc',
                            }))
                          }
                        />
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleModules.map((mod) => (
                        <tr
                          key={mod.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                            {mod.code}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {mod.name}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-medium ${
                                mod.active
                                  ? 'text-emerald-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              {mod.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => openEditModule(mod)}
                                aria-label={`Edit module ${mod.code}`}
                                className="text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
                              >
                                Edit
                              </button>
                              {mod.active ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmTarget({
                                      table: 'modules',
                                      id: mod.id,
                                      label: `${mod.code} (${mod.name})`,
                                      entityType: 'module',
                                    })
                                  }
                                  aria-label={`Deactivate module ${mod.code}`}
                                  className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleReactivate('modules', mod.id)
                                  }
                                  aria-label={`Activate module ${mod.code}`}
                                  className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                                >
                                  Activate
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    table: 'modules',
                                    id: mod.id,
                                    label: `${mod.code} (${mod.name})`,
                                    entityType: 'module',
                                  })
                                }
                                aria-label={`Delete module ${mod.code}`}
                                className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Program Add/Edit Modal */}
      <Modal
        open={programModal.open}
        onClose={() => !saving && setProgramModal({ open: false, editing: null })}
        title={programModal.editing ? 'Edit Program' : 'Add Program'}
      >
        <form onSubmit={handleSaveProgram} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {formError}
            </div>
          )}
          <div>
            <label
              htmlFor="program-name"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Program name
            </label>
            <input
              id="program-name"
              type="text"
              required
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder="e.g. Full-Stack Engineering Fellowship"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          {programModal.editing && (
            <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={programActive}
                onChange={(e) => setProgramActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Program is active for new candidate enrollments</span>
            </label>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setProgramModal({ open: false, editing: null })}
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
              {saving ? 'Saving…' : 'Save Program'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Module Add/Edit Modal */}
      <Modal
        open={moduleModal.open}
        onClose={() => !saving && setModuleModal({ open: false, editing: null })}
        title={moduleModal.editing ? 'Edit Module' : 'Add Module'}
      >
        <form onSubmit={handleSaveModule} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {formError}
            </div>
          )}
          <div>
            <label
              htmlFor="module-code"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Module code
            </label>
            <input
              id="module-code"
              type="text"
              required
              value={moduleCode}
              onChange={(e) => setModuleCode(e.target.value)}
              placeholder="e.g. FSD-101"
              className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label
              htmlFor="module-name"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Module name
            </label>
            <input
              id="module-name"
              type="text"
              required
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              placeholder="e.g. Core Backend & Databases"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          {moduleModal.editing && (
            <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={moduleActive}
                onChange={(e) => setModuleActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Module is active for new batches and candidates</span>
            </label>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setModuleModal({ open: false, editing: null })}
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
              {saving ? 'Saving…' : 'Save Module'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => void handleConfirmDeactivate()}
        loading={deactivating}
        title="Confirm Deactivation"
        message={`Deactivating "${confirmTarget?.label}" will mark this ${confirmTarget?.entityType} inactive for new selections. Existing linked records will not be altered.`}
        confirmLabel="Deactivate"
        tone="danger"
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        loading={deleting}
        title={`Delete ${deleteTarget?.entityType === 'module' ? 'Module' : 'Program'}?`}
        message={`Are you sure you want to permanently delete "${deleteTarget?.label}"? This action cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  );
}
