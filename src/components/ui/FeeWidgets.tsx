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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        Paid
      </span>
    );
  }
  if (state === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md whitespace-nowrap shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-red-700 shrink-0" />
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap shrink-0">
      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        Confirmed
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md whitespace-nowrap shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-red-700 shrink-0" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md whitespace-nowrap shrink-0">
      <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
      {perspective === 'candidate' ? 'Awaiting confirmation' : 'Pending'}
    </span>
  );
}
