import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Edit2,
  Plus,
  Power,
  Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  EducationOption,
  EducationOptionCategory,
} from '../../types/database';
import {
  EDUCATION_OPTION_CATEGORIES,
  EDUCATION_OPTION_CATEGORY_CONFIG,
  formatDbError,
} from '../../utils/domain';
import { Modal } from '../ui/Modal';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';

export function EducationListsView() {
  const [activeCategory, setActiveCategory] =
    useState<EducationOptionCategory>('diploma_stream');
  const [items, setItems] = useState<EducationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newSortOrder, setNewSortOrder] = useState<number>(10);
  const [newActive, setNewActive] = useState(true);
  const [savingAdd, setSavingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editItem, setEditItem] = useState<EducationOption | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSortOrder, setEditSortOrder] = useState<number>(10);
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const loadItems = useCallback(async (showSkeleton = true) => {
    const client = supabase;
    if (!client) return;

    if (showSkeleton) setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await client
      .from('education_options')
      .select('id, category, value, sort_order, active')
      .order('sort_order', { ascending: true })
      .order('value', { ascending: true });

    if (fetchErr) {
      setError(formatDbError(fetchErr));
      setLoading(false);
      return;
    }

    setItems((data as EducationOption[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadItems(true);
  }, [loadItems]);

  const categoryItems = useMemo(
    () => items.filter((it) => it.category === activeCategory),
    [items, activeCategory],
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categoryItems;
    return categoryItems.filter((it) => it.value.toLowerCase().includes(q));
  }, [categoryItems, search]);

  const activeCountsByCategory = useMemo(() => {
    const map: Record<EducationOptionCategory, number> = {
      diploma_stream: 0,
      graduation_stream: 0,
      graduation_degree: 0,
      graduation_university: 0,
      pg_stream: 0,
      pg_degree: 0,
      pg_university: 0,
    };
    for (const it of items) {
      if (it.active && it.category in map) {
        map[it.category] += 1;
      }
    }
    return map;
  }, [items]);

  const handleOpenAdd = () => {
    const currentMaxSort = categoryItems.reduce(
      (max, it) => Math.max(max, it.sort_order),
      0,
    );
    setNewValue('');
    setNewSortOrder(currentMaxSort + 10);
    setNewActive(true);
    setAddError(null);
    setAddModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const trimmed = newValue.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      setAddError('Value must be between 2 and 120 characters.');
      return;
    }

    setSavingAdd(true);
    setAddError(null);

    const { error: insErr } = await client.from('education_options').insert({
      category: activeCategory,
      value: trimmed,
      sort_order: Number.isFinite(newSortOrder) ? newSortOrder : 10,
      active: newActive,
    });

    setSavingAdd(false);

    if (insErr) {
      setAddError(formatDbError(insErr));
      return;
    }

    setAddModalOpen(false);
    setFeedback({
      type: 'success',
      message: `Added "${trimmed}" to ${EDUCATION_OPTION_CATEGORY_CONFIG[activeCategory].label}.`,
    });
    await loadItems(false);
  };

  const handleOpenEdit = (it: EducationOption) => {
    setEditItem(it);
    setEditValue(it.value);
    setEditSortOrder(it.sort_order);
    setEditActive(it.active);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    const client = supabase;
    if (!client) return;

    const trimmed = editValue.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      setEditError('Value must be between 2 and 120 characters.');
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    const { error: updErr } = await client
      .from('education_options')
      .update({
        value: trimmed,
        sort_order: Number.isFinite(editSortOrder) ? editSortOrder : 10,
        active: editActive,
      })
      .eq('id', editItem.id);

    setSavingEdit(false);

    if (updErr) {
      setEditError(formatDbError(updErr));
      return;
    }

    setEditItem(null);
    setFeedback({
      type: 'success',
      message: `Updated "${trimmed}".`,
    });
    await loadItems(false);
  };

  const handleToggleActive = async (it: EducationOption) => {
    const client = supabase;
    if (!client) return;

    const nextActive = !it.active;
    const { error: updErr } = await client
      .from('education_options')
      .update({ active: nextActive })
      .eq('id', it.id);

    if (updErr) {
      setFeedback({
        type: 'error',
        message: formatDbError(updErr),
      });
      return;
    }

    setFeedback({
      type: 'success',
      message: `${nextActive ? 'Reactivated' : 'Deactivated'} "${it.value}".`,
    });
    await loadItems(false);
  };

  const handleQuickReorder = async (
    it: EducationOption,
    direction: 'up' | 'down',
  ) => {
    const client = supabase;
    if (!client) return;

    const nextSort = direction === 'up' ? it.sort_order - 5 : it.sort_order + 5;
    const { error: updErr } = await client
      .from('education_options')
      .update({ sort_order: nextSort })
      .eq('id', it.id);

    if (updErr) {
      setFeedback({
        type: 'error',
        message: formatDbError(updErr),
      });
      return;
    }

    await loadItems(false);
  };

  const activeConfig = EDUCATION_OPTION_CATEGORY_CONFIG[activeCategory];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-[#0B1F3A] tracking-tight">
            Education Lists
          </h1>
          <p className="mt-1 text-sm text-[#5B6B7F]">
            Manage the standard dropdown options available to candidates during onboarding and profile updates.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors shadow-xs self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4 text-[#0FA3A3]" />
          Add {activeConfig.singular}
        </button>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'bg-[#FBEAE9] border-[#F4C5C2] text-[#C2413B]'
              : 'bg-[#E7F6EF] border-[#BCE8D3] text-[#1F9D6B]'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[#E3E9F0]">
        <nav
          className="-mb-px flex space-x-2 overflow-x-auto pb-1"
          aria-label="Education Categories"
        >
          {EDUCATION_OPTION_CATEGORIES.map((catKey) => {
            const config = EDUCATION_OPTION_CATEGORY_CONFIG[catKey];
            const isActive = activeCategory === catKey;
            const count = activeCountsByCategory[catKey];
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => {
                  setActiveCategory(catKey);
                  setSearch('');
                  setFeedback(null);
                }}
                className={`group inline-flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-xs whitespace-nowrap rounded-t-lg transition-colors ${
                  isActive
                    ? 'border-[#0FA3A3] text-[#0B7C7C] bg-white'
                    : 'border-transparent text-[#5B6B7F] hover:text-[#0B1F3A] hover:border-[#CBD5E1]'
                }`}
              >
                <span>{config.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums ${
                    isActive
                      ? 'bg-[#E6F6F6] text-[#0B7C7C]'
                      : 'bg-[#F5F8FB] text-[#5B6B7F]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Search & Info Bar */}
      <div className="p-4 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#5B6B7F]">
          <BookOpen className="w-4 h-4 text-[#0B7C7C] shrink-0" />
          <span>{activeConfig.description}</span>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#5B6B7F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label={`Search ${activeConfig.label}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Filter ${activeConfig.label.toLowerCase()}…`}
            className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-white border border-[#E3E9F0] rounded-lg"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : error ? (
        <ErrorState
          title="Could not load education lists"
          message={error}
          onRetry={() => void loadItems(true)}
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title={`No ${activeConfig.label.toLowerCase()} found`}
          description={
            search
              ? 'Try clearing the search filter.'
              : `Click "Add ${activeConfig.singular}" to create the first option.`
          }
        />
      ) : (
        <div className="bg-white border border-[#E3E9F0] rounded-xl shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#F5F8FB] border-b border-[#E3E9F0]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F] w-28">
                    Sort Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F]">
                    Value
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5B6B7F] w-32">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#5B6B7F] w-48">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E9F0]">
                {filteredItems.map((it) => (
                  <tr
                    key={it.id}
                    className={`hover:bg-[#F5F8FB] transition-colors ${
                      !it.active ? 'opacity-65 bg-slate-50/50' : ''
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-[#0B1F3A] tabular-nums w-8">
                          {it.sort_order}
                        </span>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            title="Move up"
                            onClick={() => void handleQuickReorder(it, 'up')}
                            className="p-0.5 text-[#5B6B7F] hover:text-[#0B1F3A] hover:bg-[#E3E9F0] rounded"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            onClick={() => void handleQuickReorder(it, 'down')}
                            className="p-0.5 text-[#5B6B7F] hover:text-[#0B1F3A] hover:bg-[#E3E9F0] rounded"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 font-medium text-[#0B1F3A]">
                      {it.value}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {it.active ? (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-[#E7F6EF] text-[#1F9D6B] border border-[#BCE8D3] rounded-md">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-[#F5F8FB] text-[#5B6B7F] border border-[#E3E9F0] rounded-md">
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(it)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors"
                        >
                          <Edit2 className="w-3 h-3 text-[#0FA3A3]" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(it)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors border ${
                            it.active
                              ? 'text-[#C2413B] bg-white border-[#F4C5C2] hover:bg-[#FBEAE9]'
                              : 'text-[#1F9D6B] bg-white border-[#BCE8D3] hover:bg-[#E7F6EF]'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {it.active ? 'Deactivate' : 'Reactivate'}
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

      {/* Add Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => !savingAdd && setAddModalOpen(false)}
        title={`Add ${activeConfig.singular}`}
        description={`Add a new standard choice to the ${activeConfig.label.toLowerCase()} dropdown.`}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {addError && (
            <div
              role="alert"
              className="p-3 bg-[#FBEAE9] border border-[#F4C5C2] rounded-lg text-xs text-[#C2413B]"
            >
              {addError}
            </div>
          )}

          <div>
            <label
              htmlFor="add-opt-value"
              className="block text-xs font-medium text-[#0B1F3A] mb-1"
            >
              Value (2 to 120 characters) *
            </label>
            <input
              id="add-opt-value"
              type="text"
              required
              minLength={2}
              maxLength={120}
              placeholder={`e.g. ${
                activeCategory.includes('stream')
                  ? 'Mechanical Engineering'
                  : activeCategory.includes('degree')
                    ? 'B.Tech'
                    : 'University of Mumbai'
              }`}
              value={newValue}
              onChange={(e) => {
                setNewValue(e.target.value);
                if (addError) setAddError(null);
              }}
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="add-opt-sort"
                className="block text-xs font-medium text-[#0B1F3A] mb-1"
              >
                Sort order
              </label>
              <input
                id="add-opt-sort"
                type="number"
                step={1}
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg font-mono tabular-nums"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-[#0B1F3A]">
                <input
                  type="checkbox"
                  checked={newActive}
                  onChange={(e) => setNewActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0FA3A3] focus:ring-[#0FA3A3]"
                />
                Active immediately
              </label>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={savingAdd}
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingAdd || !newValue.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg disabled:opacity-50"
            >
              {savingAdd ? 'Saving…' : 'Save Option'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={Boolean(editItem)}
        onClose={() => !savingEdit && setEditItem(null)}
        title={`Edit ${activeConfig.singular}`}
        description="Update the displayed label, ordering, or activation status."
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          {editError && (
            <div
              role="alert"
              className="p-3 bg-[#FBEAE9] border border-[#F4C5C2] rounded-lg text-xs text-[#C2413B]"
            >
              {editError}
            </div>
          )}

          <div>
            <label
              htmlFor="edit-opt-value"
              className="block text-xs font-medium text-[#0B1F3A] mb-1"
            >
              Value (2 to 120 characters) *
            </label>
            <input
              id="edit-opt-value"
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                if (editError) setEditError(null);
              }}
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-opt-sort"
                className="block text-xs font-medium text-[#0B1F3A] mb-1"
              >
                Sort order
              </label>
              <input
                id="edit-opt-sort"
                type="number"
                step={1}
                value={editSortOrder}
                onChange={(e) => setEditSortOrder(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg font-mono tabular-nums"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-[#0B1F3A]">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0FA3A3] focus:ring-[#0FA3A3]"
                />
                Active
              </label>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={savingEdit}
              onClick={() => setEditItem(null)}
              className="px-4 py-2 text-sm font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdit || !editValue.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg disabled:opacity-50"
            >
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
