import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PlacementMember, SortDirection } from '../../types/database';
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
type SortField = 'full_name' | 'email' | 'active';

export function PlacementTeamView() {
  const [members, setMembers] = useState<PlacementMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ field: SortField; dir: SortDirection }>({
    field: 'full_name',
    dir: 'asc',
  });

  // Add / Edit modal state
  const [modalState, setModalState] = useState<{
    open: boolean;
    editing: PlacementMember | null;
  }>({ open: false, editing: null });
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Deactivate confirmation
  const [deactivateTarget, setDeactivateTarget] =
    useState<PlacementMember | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] =
    useState<PlacementMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadMembers = useCallback(async () => {
    const client = supabase;
    if (!client) return;

    setLoading(true);
    setError(null);

    const { data, error: queryErr } = await client
      .from('placement_members')
      .select('id, full_name, email, active');

    if (queryErr) {
      setError(formatDbError(queryErr));
      setLoading(false);
      return;
    }

    setMembers((data as PlacementMember[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const visibleMembers = useMemo(() => {
    const filteredByStatus = members.filter((m) =>
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? m.active
          : !m.active,
    );

    return filterAndSortRows(
      filteredByStatus,
      searchQuery,
      (m) => [m.full_name, m.email, m.active ? 'active' : 'inactive'],
      (m) => {
        if (sort.field === 'full_name') return m.full_name ?? '';
        if (sort.field === 'email') return m.email ?? '';
        return m.active;
      },
      sort.dir,
    );
  }, [members, statusFilter, searchQuery, sort]);

  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const openAddModal = () => {
    setFormError(null);
    setFullName('');
    setEmail('');
    setActive(true);
    setModalState({ open: true, editing: null });
  };

  const openEditModal = (member: PlacementMember) => {
    setFormError(null);
    setFullName(member.full_name ?? '');
    setEmail(member.email ?? '');
    setActive(member.active);
    setModalState({ open: true, editing: member });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setFormError('Full name is required.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setSaving(true);
    setFormError(null);

    if (modalState.editing) {
      const { error: updateErr } = await client
        .from('placement_members')
        .update({
          full_name: trimmedName,
          email: trimmedEmail,
          active,
        })
        .eq('id', modalState.editing.id);

      if (updateErr) {
        setFormError(formatDbError(updateErr));
        setSaving(false);
        return;
      }
    } else {
      const { error: insertErr } = await client
        .from('placement_members')
        .insert({
          full_name: trimmedName,
          email: trimmedEmail,
          active: true,
        });

      if (insertErr) {
        setFormError(formatDbError(insertErr));
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setModalState({ open: false, editing: null });
    await loadMembers();
  };

  const handleConfirmDeactivate = async () => {
    const client = supabase;
    if (!client || !deactivateTarget) return;

    setDeactivating(true);
    setActionError(null);

    const { error: err } = await client
      .from('placement_members')
      .update({ active: false })
      .eq('id', deactivateTarget.id);

    setDeactivating(false);
    setDeactivateTarget(null);

    if (err) {
      setActionError(formatDbError(err));
      return;
    }
    await loadMembers();
  };

  const handleActivate = async (member: PlacementMember) => {
    const client = supabase;
    if (!client) return;

    setActionError(null);
    const { error: err } = await client
      .from('placement_members')
      .update({ active: true })
      .eq('id', member.id);

    if (err) {
      setActionError(formatDbError(err));
      return;
    }
    await loadMembers();
  };

  const handleConfirmDelete = async () => {
    const client = supabase;
    if (!client || !deleteTarget) return;

    setDeleting(true);
    setActionError(null);

    const { error: err } = await client
      .from('placement_members')
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
    await loadMembers();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Placement Team
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage placement team coordinators assigned during candidate handover.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void loadMembers()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Placement Member
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div
          role="group"
          aria-label="Filter placement members by status"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          {(['all', 'active', 'inactive'] as StatusFilter[]).map((st) => (
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

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search placement team members"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {actionError && (
        <ErrorState
          title="Could not update placement member"
          message={actionError}
          onRetry={() => void loadMembers()}
        />
      )}

      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : error ? (
        <ErrorState
          title="Could not load placement team members"
          message={error}
          onRetry={() => void loadMembers()}
        />
      ) : visibleMembers.length === 0 ? (
        <EmptyState
          title={
            members.length === 0
              ? 'No placement team members yet'
              : 'No matching placement team members'
          }
          description={
            members.length === 0
              ? 'Add placement coordinators who oversee candidate handovers.'
              : 'Try adjusting your search query or status filter.'
          }
          actionLabel={
            members.length === 0 ? 'Add Placement Member' : undefined
          }
          onAction={members.length === 0 ? openAddModal : undefined}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <SortableHeader
                    label="Full Name"
                    field="full_name"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Email"
                    field="email"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Status"
                    field="active"
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
                {visibleMembers.map((member) => (
                  <tr
                    key={member.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {member.full_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {member.email || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium ${
                          member.active ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {member.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(member)}
                          aria-label={`Edit placement member ${member.full_name}`}
                          className="text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
                        >
                          Edit
                        </button>
                        {member.active ? (
                          <button
                            type="button"
                            onClick={() => setDeactivateTarget(member)}
                            aria-label={`Deactivate placement member ${member.full_name}`}
                            className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleActivate(member)}
                            aria-label={`Activate placement member ${member.full_name}`}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                          >
                            Activate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(member)}
                          aria-label={`Delete placement member ${member.full_name}`}
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

      {/* Add / Edit Placement Member Modal */}
      <Modal
        open={modalState.open}
        onClose={() => !saving && setModalState({ open: false, editing: null })}
        title={
          modalState.editing
            ? 'Edit Placement Team Member'
            : 'Add Placement Team Member'
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
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
              htmlFor="placement-member-name"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Full name
            </label>
            <input
              id="placement-member-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ananya Rao"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="placement-member-email"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Email address
            </label>
            <input
              id="placement-member-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ananya@institute.edu"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          {modalState.editing && (
            <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Active placement coordinator</span>
            </label>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setModalState({ open: false, editing: null })}
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
              {saving ? 'Saving…' : 'Save Member'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => void handleConfirmDeactivate()}
        loading={deactivating}
        title="Deactivate Placement Member?"
        message={`Deactivating "${deactivateTarget?.full_name}" will mark them inactive in the placement team directory. Existing candidate handover records remain intact.`}
        confirmLabel="Deactivate"
        tone="danger"
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        loading={deleting}
        title="Delete Placement Member?"
        message={`Are you sure you want to permanently delete "${deleteTarget?.full_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  );
}
