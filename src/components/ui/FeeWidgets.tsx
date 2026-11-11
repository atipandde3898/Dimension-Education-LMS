import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import type {
  InstallmentStateValue,
  PaymentStatusValue,
} from '../../types/database';

export function InstallmentStateBadge({
  state,
}: {
  state: InstallmentStateValue | null | undefined;
}) {
  if (state === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1F9D6B] bg-[#E7F6EF] border border-[#BCE8D3] rounded-md whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-[#1F9D6B] shrink-0" />
        Paid
      </span>
    );
  }
  if (state === 'submitted') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#2F6FB0] bg-[#E8F0FA] border border-[#BFD7F2] rounded-md whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 text-[#2F6FB0] shrink-0" />
        Awaiting confirmation
      </span>
    );
  }
  if (state === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#C2413B] bg-[#FBEAE9] border border-[#F4C5C2] rounded-md whitespace-nowrap shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-[#C2413B] shrink-0" />
        Overdue
      </span>
    );
  }
  if (state === 'due_today') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#C98A0B] bg-[#FDF4E0] border border-[#F6DEAA] rounded-md whitespace-nowrap shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-[#C98A0B] shrink-0" />
        Due today
      </span>
    );
  }
  if (state === 'due_soon') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#C98A0B] bg-[#FDF4E0] border border-[#F6DEAA] rounded-md whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 text-[#C98A0B] shrink-0" />
        Due soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#5B6B7F] bg-[#F5F8FB] border border-[#E3E9F0] rounded-md whitespace-nowrap shrink-0">
      <Clock className="w-3.5 h-3.5 text-[#5B6B7F] shrink-0" />
      Upcoming
    </span>
  );
}

export function PaymentStatusBadge({
  status,
  perspective = 'admin',
}: {
  status: PaymentStatusValue;
  perspective?: 'admin' | 'candidate';
}) {
  if (status === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1F9D6B] bg-[#E7F6EF] border border-[#BCE8D3] rounded-md whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-[#1F9D6B] shrink-0" />
        Confirmed
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#C2413B] bg-[#FBEAE9] border border-[#F4C5C2] rounded-md whitespace-nowrap shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-[#C2413B] shrink-0" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#C98A0B] bg-[#FDF4E0] border border-[#F6DEAA] rounded-md whitespace-nowrap shrink-0">
      <Clock className="w-3.5 h-3.5 text-[#C98A0B] shrink-0" />
      {perspective === 'candidate' ? 'Awaiting confirmation' : 'Pending'}
    </span>
  );
}
