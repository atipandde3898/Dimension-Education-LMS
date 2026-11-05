import { Calendar, Clock, RefreshCw } from 'lucide-react';
import type {
  Batch,
  ClassSession,
  TimetableSlot,
} from '../../types/database';
import {
  formatDate,
  formatDurationMinutes,
  normalizeTimetableStatus,
  sortSessionsNewestFirst,
} from '../../utils/domain';
import { EmptyState } from '../ui/States';
import {
  TimetableStatusBadge,
  WeeklyTimetableList,
} from '../ui/TimetableWidgets';

interface CandidateTimetableViewProps {
  batch: Batch | null;
  batchCodeFallback?: string | null;
  slots: TimetableSlot[];
  sessions: ClassSession[];
  onRefresh: () => Promise<void> | void;
  refreshing?: boolean;
}

export function CandidateTimetableView({
  batch,
  batchCodeFallback,
  slots,
  sessions,
  onRefresh,
  refreshing = false,
}: CandidateTimetableViewProps) {
  const orderedSessions = sortSessionsNewestFirst(sessions);

  if (!batch) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Timetable
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Weekly live class schedule and completed session log for your batch.
          </p>
        </div>

        <EmptyState
          title="No batch assigned yet"
          description="Once your institute assigns you to a training batch, your class timetable and completed sessions will appear here."
          actionLabel="Refresh"
          onAction={() => void onRefresh()}
        />
      </div>
    );
  }

  const status = normalizeTimetableStatus(batch.timetable_status);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Timetable
            </h1>
            <TimetableStatusBadge status={batch.timetable_status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Batch{' '}
            <span className="font-mono font-medium text-slate-700 tabular-nums">
              {batch.batch_code || batchCodeFallback || '—'}
            </span>{' '}
            · <span className="capitalize">{batch.mode}</span>
            {batch.mode === 'offline' && batch.location
              ? ` · ${batch.location}`
              : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      {/* Weekly Timetable Section */}
      <section aria-labelledby="candidate-weekly-schedule-heading" className="space-y-3">
        <div>
          <h2
            id="candidate-weekly-schedule-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Weekly Schedule
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            All class times are shown in 12-hour format.
          </p>
        </div>

        {status === 'published' && (
          <WeeklyTimetableList slots={slots} mode="candidate" />
        )}

        {status === 'not_set' && (
          <div className="p-8 bg-white border border-slate-200 rounded-xl text-center">
            <Clock className="w-6 h-6 text-amber-600 mx-auto" />
            <p className="mt-2.5 text-sm font-medium text-slate-900">
              Your timetable has not been published yet.
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Check back once your instructor finalises the weekly schedule for{' '}
              <span className="font-mono tabular-nums">{batch.batch_code}</span>.
            </p>
          </div>
        )}

        {status === 'opted_out' && (
          <div className="p-8 bg-white border border-slate-200 rounded-xl text-center">
            <Calendar className="w-6 h-6 text-slate-500 mx-auto" />
            <p className="mt-2.5 text-sm font-medium text-slate-900">
              No fixed timetable for this batch. Your SME will inform you of
              class timings.
            </p>
          </div>
        )}
      </section>

      {/* Classes Completed Section */}
      <section aria-labelledby="candidate-classes-completed-heading" className="space-y-3">
        <div>
          <h2
            id="candidate-classes-completed-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Classes completed
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sessions delivered for your batch, ordered newest first.
          </p>
        </div>

        {orderedSessions.length === 0 ? (
          <EmptyState
            title="No completed classes recorded yet"
            description="Completed sessions logged by your SME will appear here with the date, topic, and duration."
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-left">
                      Date
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-left">
                      Topic
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orderedSessions.map((sess) => (
                    <tr
                      key={sess.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatDate(sess.session_date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {sess.topic}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums text-right whitespace-nowrap">
                        {formatDurationMinutes(sess.duration_minutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {orderedSessions.map((sess) => (
                <div key={sess.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-sm text-slate-900">
                      {sess.topic}
                    </p>
                    <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap shrink-0">
                      {formatDurationMinutes(sess.duration_minutes)}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-slate-500 tabular-nums">
                    {formatDate(sess.session_date)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
