import {
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { TimetableSlot } from '../../types/database';
import {
  formatTimeRange12h,
  groupTimetableSlotsByDay,
  normalizeTimetableStatus,
} from '../../utils/domain';

export function TimetableStatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  const normalized = normalizeTimetableStatus(status);

  if (normalized === 'published') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        Published
      </span>
    );
  }

  if (normalized === 'opted_out') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap shrink-0">
        <Ban className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        Opted out
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md whitespace-nowrap shrink-0">
      <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
      Not set
    </span>
  );
}

interface WeeklyTimetableListProps {
  slots: TimetableSlot[];
  mode: 'sme' | 'candidate' | 'admin';
  smeNameById?: Map<string, string>;
  onAddForDay?: (dayOfWeek: number) => void;
  onEditSlot?: (slot: TimetableSlot) => void;
  onDeleteSlot?: (slot: TimetableSlot) => void;
}

export function WeeklyTimetableList({
  slots,
  mode,
  smeNameById,
  onAddForDay,
  onEditSlot,
  onDeleteSlot,
}: WeeklyTimetableListProps) {
  const groupedDays = groupTimetableSlotsByDay(slots);

  return (
    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
      {groupedDays.map(({ day, label, slots: daySlots }) => (
        <div
          key={day}
          className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6"
        >
          <div className="sm:w-36 shrink-0 flex items-center justify-between sm:flex-col sm:items-start sm:justify-start sm:gap-1">
            <span className="text-sm font-semibold text-slate-900">{label}</span>
            {mode === 'sme' && onAddForDay && (
              <button
                type="button"
                onClick={() => onAddForDay(day)}
                aria-label={`Add slot on ${label}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add slot
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {daySlots.length === 0 ? (
              <p className="text-xs text-slate-400 py-0.5">
                No classes scheduled
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {daySlots.map((slot, idx) => {
                  const safeLink = slot.meeting_link?.trim().startsWith('https://')
                    ? slot.meeting_link.trim()
                    : null;
                  const smeName = smeNameById?.get(slot.sme_id);
                  const timeRange = formatTimeRange12h(
                    slot.start_time,
                    slot.end_time,
                  );

                  return (
                    <div
                      key={slot.id}
                      className={`flex flex-col md:flex-row md:items-center justify-between gap-2.5 ${
                        idx === 0 ? 'pb-2.5 last:pb-0' : 'py-2.5 last:pb-0'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="font-mono text-sm font-medium text-slate-900 tabular-nums whitespace-nowrap">
                            {timeRange}
                          </span>
                          {smeName && (
                            <span className="text-xs text-slate-500">
                              <span aria-hidden="true" className="mr-1.5">
                                ·
                              </span>
                              {smeName}
                            </span>
                          )}
                        </div>

                        {mode !== 'candidate' && (
                          <div className="min-w-0">
                            {safeLink ? (
                              <a
                                href={safeLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 hover:underline max-w-full"
                              >
                                <span className="truncate max-w-[260px] sm:max-w-[420px]">
                                  {safeLink}
                                </span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">
                                {slot.meeting_link || 'No link'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {mode === 'candidate' && safeLink && (
                          <a
                            href={safeLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Join class on ${label} (${timeRange})`}
                            className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                          >
                            <span>Join class</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                        )}

                        {mode === 'sme' && (
                          <div className="flex items-center gap-2">
                            {onEditSlot && (
                              <button
                                type="button"
                                onClick={() => onEditSlot(slot)}
                                aria-label={`Edit ${label} ${timeRange} slot`}
                                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                            )}
                            {onDeleteSlot && (
                              <button
                                type="button"
                                onClick={() => onDeleteSlot(slot)}
                                aria-label={`Delete ${label} ${timeRange} slot`}
                                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
