import { CheckCircle2, Clock, HelpCircle, XCircle } from 'lucide-react';
import type { TicketCategory, TicketStatus } from '../../types/database';
import { getTicketCategoryLabel } from '../../utils/domain';

export function TicketStatusBadge({
  status,
}: {
  status: TicketStatus | string | null | undefined;
}) {
  if (status === 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-md whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
        Open
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
        In progress
      </span>
    );
  }
  if (status === 'resolved') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        Resolved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap shrink-0">
      <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      Closed
    </span>
  );
}

export function TicketCategoryBadge({
  category,
}: {
  category: TicketCategory | string | null | undefined;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md whitespace-nowrap">
      <HelpCircle className="w-3 h-3 text-slate-400 shrink-0" />
      {getTicketCategoryLabel(category as TicketCategory)}
    </span>
  );
}
