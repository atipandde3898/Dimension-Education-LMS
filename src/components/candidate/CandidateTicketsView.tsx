import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Filter,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { TicketOverview } from '../../types/database';
import {
  formatDbError,
  formatTicketDateTime,
  getTicketCategoryLabel,
} from '../../utils/domain';
import { EmptyState, TableSkeleton } from '../ui/States';
import { TicketCategoryBadge, TicketStatusBadge } from '../ui/TicketWidgets';
import { CandidateRaiseTicketModal } from './CandidateRaiseTicketModal';
import { CandidateTicketDetailView } from './CandidateTicketDetailView';

interface CandidateTicketsViewProps {
  candidateId: string;
  candidateCode?: string | null;
}

export function CandidateTicketsView({
  candidateId,
  candidateCode,
}: CandidateTicketsViewProps) {
  const [tickets, setTickets] = useState<TicketOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected ticket for detail page
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [raiseModalOpen, setRaiseModalOpen] = useState(false);

  const loadTickets = useCallback(
    async (showSkeleton = true) => {
      const client = supabase;
      if (!client) return;

      if (showSkeleton) setLoading(true);
      setError(null);

      const { data, error: queryErr } = await client
        .from('v_tickets')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('updated_at', { ascending: false });

      if (queryErr) {
        setError(formatDbError(queryErr));
        setLoading(false);
        return;
      }

      setTickets((data as TicketOverview[]) ?? []);
      setLoading(false);
    },
    [candidateId],
  );

  useEffect(() => {
    void loadTickets(true);
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const code = (t.ticket_code ?? '').toLowerCase();
      const subject = (t.subject ?? '').toLowerCase();
      const cat = getTicketCategoryLabel(t.category).toLowerCase();
      return code.includes(q) || subject.includes(q) || cat.includes(q);
    });
  }, [tickets, searchQuery, statusFilter]);

  if (selectedTicketId) {
    return (
      <CandidateTicketDetailView
        ticketId={selectedTicketId}
        candidateId={candidateId}
        onBack={() => {
          setSelectedTicketId(null);
          void loadTickets(false);
        }}
        onRefreshList={() => void loadTickets(false)}
      />
    );
  }

  if (loading) {
    return <TableSkeleton rows={5} columns={4} />;
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
            Help & Support Tickets
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Submit queries regarding fees, documents, timetable, or technical
            assistance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRaiseModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors shadow-sm self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Raise a ticket</span>
        </button>
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          title="You have not raised any tickets."
          description="If you have questions about your fee installments, document reviews, class schedules, or technical issues, raise a ticket to contact institute staff."
          actionLabel="Raise a ticket"
          onAction={() => setRaiseModalOpen(true)}
        />
      ) : (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ticket code or subject..."
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-700"
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>

              <button
                type="button"
                onClick={() => void loadTickets(false)}
                title="Refresh tickets"
                className="p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-500">
              No tickets match your search or filter.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Ticket</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Subject</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Last Updated</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTickets.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTicketId(t.id)}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3.5 font-mono text-xs font-semibold text-blue-700 tabular-nums whitespace-nowrap">
                          {t.ticket_code}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <TicketCategoryBadge category={t.category} />
                        </td>
                        <td className="px-4 py-3.5 text-slate-900 font-medium max-w-xs truncate">
                          {t.subject}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <TicketStatusBadge status={t.status} />
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap font-mono tabular-nums">
                          {formatTicketDateTime(t.updated_at || t.created_at)}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTicketId(t.id);
                            }}
                            className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredTickets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className="p-4 space-y-2.5 hover:bg-slate-50/70 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-blue-700 tabular-nums">
                        {t.ticket_code}
                      </span>
                      <TicketStatusBadge status={t.status} />
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                      {t.subject}
                    </h3>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500">
                      <TicketCategoryBadge category={t.category} />
                      <span className="font-mono tabular-nums">
                        {formatTicketDateTime(t.updated_at || t.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raise Ticket Modal */}
      <CandidateRaiseTicketModal
        isOpen={raiseModalOpen}
        onClose={() => setRaiseModalOpen(false)}
        candidateId={candidateId}
        onTicketCreated={(_code, newId) => {
          void loadTickets(false);
          setSelectedTicketId(newId);
        }}
      />
    </div>
  );
}
