import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Profile, SortDirection } from '../../types/database';
import { filterAndSortRows, formatDbError } from '../../utils/domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import {
  EmptyState,
  ErrorState,
  SortableHeader,
  TableSkeleton,
} from '../ui/States';

type RoleFilter = 'all' | Profile['role'];
type SortField = 'full_name' | 'email' | 'phone' | 'role' | 'active';

const ROLE_DISPLAY: Record<Profile['role'], string> = {
  admin: 'Admin',
  counsellor: 'Counsellor',
  sme: 'SME',
  candidate: 'Candidate',
};

interface StaffViewProps {
  currentUserId: string;
  onCurrentProfileUpdated: () => void;
}

export function StaffView({
  currentUserId,
  onCurrentProfileUpdated,
}: StaffViewProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sort, setSort] = useState<{ field: SortField; dir: SortDirection }>({
    field: 'full_name',
    dir: 'asc',
  });

  // Edit profile state
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Profile['role']>('counsellor');
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Confirm destructive/role-sensitive updates
  const [pendingSensitiveSave, setPendingSensitiveSave] =
    useState<boolean>(false);

  const loadProfiles = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id, role, full_name, email, phone, active');

    if (queryError) {
      setError(formatDbError(queryError));
      setLoading(false);
      return;
    }

    setProfiles((data as Profile[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const visibleProfiles = useMemo(() => {
    const byRole =
      roleFilter === 'all'
        ? profiles
        : profiles.filter((p) => p.role === roleFilter);

    return filterAndSortRows(
      byRole,
      searchQuery,
      (p) => [
        p.full_name,
        p.email,
        p.phone,
        p.role,
        p.active ? 'active' : 'inactive',
      ],
      (p) => {
        if (sort.field === 'full_name') return p.full_name;
        if (sort.field === 'email') return p.email;
        if (sort.field === 'phone') return p.phone;
        if (sort.field === 'role') return p.role;
        return p.active;
      },
      sort.dir,
    );
  }, [profiles, roleFilter, searchQuery, sort]);

  const openEditModal = (profile: Profile) => {
    setEditingProfile(profile);
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setRole(profile.role);
    setActive(profile.active);
    setFormError(null);
  };

  const commitProfileUpdate = async () => {
    if (!supabase || !editingProfile) return;
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setFormError('Full name is required.');
      setPendingSensitiveSave(false);
      return;
    }

    setSaving(true);
    setFormError(null);

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        full_name: trimmedName,
        phone: phone.trim() || null,
        role,
        active,
      })
      .eq('id', editingProfile.id);

    setSaving(false);
    setPendingSensitiveSave(false);

    if (updateErr) {
      setFormError(formatDbError(updateErr));
      return;
    }

    const updatedSelf = editingProfile.id === currentUserId;
    setEditingProfile(null);
    await loadProfiles();
    if (updatedSelf) {
      onCurrentProfileUpdated();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    if (!fullName.trim()) {
      setFormError('Full name is required.');
      return;
    }

    const isDeactivating = editingProfile.active && !active;
    const isChangingRole = editingProfile.role !== role;

    if (isDeactivating || isChangingRole) {
      setPendingSensitiveSave(true);
      return;
    }

    void commitProfileUpdate();
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
            Staff &amp; User Profiles
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Accounts are provisioned in the Supabase Auth dashboard. Edit names,
            phone numbers, assigned roles, and active status here.
          </p>
        </div>

        <button
          type="button"
          onClick={loadProfiles}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh directory
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div
          role="group"
          aria-label="Filter profiles by role"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'admin', label: 'Admins' },
              { id: 'counsellor', label: 'Counsellors' },
              { id: 'sme', label: 'SMEs' },
              { id: 'candidate', label: 'Candidates' },
            ] as Array<{ id: RoleFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                roleFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search profiles"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, email, phone, role…"
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : error ? (
        <ErrorState
          title="Could not load user profiles"
          message={error}
          onRetry={loadProfiles}
        />
      ) : visibleProfiles.length === 0 ? (
        <EmptyState
          title={
            profiles.length === 0
              ? 'No user profiles found'
              : 'No profiles match your filters'
          }
          description={
            profiles.length === 0
              ? 'Create user accounts in the Supabase Dashboard to manage their roles and contact details here.'
              : 'Try clearing the search box or switching the role filter.'
          }
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
                    label="Phone"
                    field="phone"
                    activeField={sort.field}
                    direction={sort.dir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Role"
                    field="role"
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
                {visibleProfiles.map((p) => {
                  const isSelf = p.id === currentUserId;
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <span>{p.full_name || '—'}</span>
                        {isSelf && (
                          <span className="ml-1.5 text-xs font-normal text-slate-400">
                            · You
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.email}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {p.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">
                        {ROLE_DISPLAY[p.role] ?? p.role}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium ${
                            p.active ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {p.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          aria-label={`Edit profile for ${p.full_name || p.email}`}
                          className="text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
                        >
                          Edit
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

      {/* Edit Profile Modal */}
      <Modal
        open={Boolean(editingProfile)}
        onClose={() => !saving && setEditingProfile(null)}
        title="Edit Profile"
        description={editingProfile?.email}
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
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
              htmlFor="staff-fullname"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Full name
            </label>
            <input
              id="staff-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="staff-phone"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Phone number
            </label>
            <input
              id="staff-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional phone number"
              className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="staff-role"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Role
            </label>
            <select
              id="staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Profile['role'])}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            >
              <option value="admin">Admin</option>
              <option value="counsellor">Counsellor</option>
              <option value="sme">SME</option>
              <option value="candidate">Candidate</option>
            </select>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>Active account</span>
          </label>

          {editingProfile?.id === currentUserId &&
            (!active || role !== 'admin') && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Warning: You are modifying your own administrator account.
                Deactivating it or changing your role will immediately remove
                your admin portal access.
              </p>
            )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditingProfile(null)}
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
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation before deactivating account or changing role */}
      <ConfirmDialog
        open={pendingSensitiveSave}
        onClose={() => setPendingSensitiveSave(false)}
        onConfirm={() => void commitProfileUpdate()}
        loading={saving}
        title="Confirm Profile Permission Change"
        message={
          editingProfile && editingProfile.active && !active
            ? `Deactivating "${fullName || editingProfile.email}" will prevent them from accessing the portal and hide them from active counsellor/SME lists.`
            : `Change role for "${fullName || editingProfile?.email}" from ${
                editingProfile ? ROLE_DISPLAY[editingProfile.role] : ''
              } to ${ROLE_DISPLAY[role]}?`
        }
        confirmLabel="Confirm Update"
        tone="warning"
      />
    </div>
  );
}
