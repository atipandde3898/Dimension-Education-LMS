import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { TicketCategory, TicketOverview } from '../../types/database';
import {
  TICKET_CATEGORIES,
  formatDbError,
  formatTicketDateTime,
  getTicketCategoryLabel,
} from '../../utils/domain';
import { EmptyState, TableSkeleton } from '../ui/States';
import { TicketCategoryBadge, TicketStatusBadge } from '../ui/TicketWidgets';

interface AdminTicketsViewProps {
  onSelectTicket: (ticketId: string) => void;
  onSelectCandidate: (candidateId: string) => void;
}

export function AdminTicketsView({
  onSelectTicket,
  onSelectCandidate,
}: AdminTicketsViewProps) {
  const [tickets, setTickets] = useState<TicketOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters: default status is open and in_progress
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadTickets = useCallback(async (showSkeleton = true) => {
    const client = supabase;
    if (!client) return;

    if (showSkeleton) setLoading(true);
    setError(null);

    const { data, error: queryErr } = await client
      .from('v_tickets')
      .select('*')
      .order('updated_at', { ascending: false });

    if (queryErr) {
      setError(formatDbError(queryErr));
      setLoading(false);
      return;
    }

    setTickets((data as TicketOverview[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTickets(true);
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      // Status filter
      if (statusFilter === 'active') {
        if (t.status !== 'open' && t.status !== 'in_progress') return false;
      } else if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && t.category !== categoryFilter) {
        return false;
      }

      // Search
      if (!q) return true;
      const code = (t.ticket_code ?? '').toLowerCase();
      const candName = (t.candidate_name ?? '').toLowerCase();
      const candCode = (t.candidate_code ?? '').toLowerCase();
      const subject = (t.subject ?? '').toLowerCase();
      const counsellor = (t.counsellor ?? '').toLowerCase();
      const batchCode = (t.batch_code ?? '').toLowerCase();

      return (
        code.includes(q) ||
        candName.includes(q) ||
        candCode.includes(q) ||
        subject.includes(q) ||
        counsellor.includes(q) ||
        batchCode.includes(q)
      );
    });
  }, [tickets, statusFilter, categoryFilter, searchQuery]);

  if (loading) {
    return <TableSkeleton rows={8} columns={5} />;
  }

  if (error) {
    return (
      <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
        <div className="flex items-start gap-3 text-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">Could not load tickets</h3>
            <p className="text-xs text-red-700 mt-1">{error}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadTickets(true)}
          className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Support Tickets
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Candidate inquiries across fees, documents, timetable scheduling,
            and technical problems.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadTickets(false)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticket code, candidate name, code, or subject..."
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 placeholder:text-slate-400"
            />
          </div>

          {/* Status Filter (Default: Open & In progress) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Status:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-700"
            >
              <option value="active">Open & In progress (default)</option>
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Category:
            </span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-700"
            >
              <option value="all">All categories</option>
              {TICKET_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Ticket List */}
      {filteredTickets.length === 0 ? (
        <EmptyState
          title="No support tickets found"
          description={
            tickets.length === 0
              ? 'No support tickets have been raised by candidates yet.'
              : 'No tickets match the selected status or category filters.'
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">Ticket</th>
                  <th className="px-4 py-3 text-left">Candidate</th>
                  <th className="px-4 py-3 text-left">Batch</th>
                  <th className="px-4 py-3 text-left">Counsellor</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Subject</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Last Updated</th>
                  <th className="px-4 py-3 text-center">Messages</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onSelectTicket(t.id)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-blue-700 tabular-nums whitespace-nowrap">
                      {t.ticket_code}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCandidate(t.candidate_id);
                          }}
                          className="font-medium text-xs text-slate-900 hover:text-blue-700 hover:underline block text-left"
                        >
                          {t.candidate_name ?? '—'}
                        </button>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {t.candidate_code ?? ''}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {t.batch_code || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-700 whitespace-nowrap">
                      {t.counsellor || '—'}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <TicketCategoryBadge category={t.category} />
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-800 font-medium max-w-xs truncate">
                      {t.subject}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <TicketStatusBadge status={t.status} />
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap font-mono tabular-nums">
                      {formatTicketDateTime(t.updated_at || t.created_at)}
                    </td>

                    <td className="px-4 py-3.5 text-center font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[11px]">
                        <MessageSquare className="w-3 h-3 text-slate-400" />
                        {t.message_count ?? 0}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTicket(t.id);
                        }}
                        className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / Tablet Stacked Cards */}
          <div className="lg:hidden divide-y divide-slate-100">
            {filteredTickets.map((t) => (
              <div
                key={t.id}
                onClick={() => onSelectTicket(t.id)}
                className="p-4 space-y-2.5 hover:bg-slate-50/70 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-blue-700 tabular-nums">
                    {t.ticket_code}
                  </span>
                  <TicketStatusBadge status={t.status} />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                    {t.subject}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                    <span className="font-medium text-slate-900">
                      {t.candidate_name ?? '—'}
                    </span>
                    <span className="font-mono text-slate-500">
                      ({t.candidate_code ?? ''})
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 pt-1 border-t border-slate-50">
                  <div>
                    <span>Batch: </span>
                    <span className="font-mono text-slate-800">
                      {t.batch_code || '—'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span>Messages: </span>
                    <span className="font-mono font-medium text-slate-800">
                      {t.message_count ?? 0}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500">
                  <TicketCategoryBadge category={t.category} />
                  <span className="font-mono tabular-nums text-[11px]">
                    {formatTicketDateTime(t.updated_at || t.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
