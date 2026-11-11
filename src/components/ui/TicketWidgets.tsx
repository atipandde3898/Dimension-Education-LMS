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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#2F6FB0] bg-[#E8F0FA] border border-[#BFD7F2] rounded-md whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 text-[#2F6FB0] shrink-0" />
        Open
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#C98A0B] bg-[#FDF4E0] border border-[#F6DEAA] rounded-md whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 text-[#C98A0B] shrink-0" />
        In progress
      </span>
    );
  }
  if (status === 'resolved') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1F9D6B] bg-[#E7F6EF] border border-[#BCE8D3] rounded-md whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-[#1F9D6B] shrink-0" />
        Resolved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#5B6B7F] bg-[#F5F8FB] border border-[#E3E9F0] rounded-md whitespace-nowrap shrink-0">
      <XCircle className="w-3.5 h-3.5 text-[#5B6B7F] shrink-0" />
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
