import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Briefcase,
  Calendar,
  CreditCard,
  FileCheck,
  FileSpreadsheet,
  GraduationCap,
  MessageSquare,
  RefreshCw,
  Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { DashboardStats } from '../../types/database';
import {
  formatAmount,
  formatDbError,
  formatInr,
  normalizeDashboardStats,
} from '../../utils/domain';
import type { AdminSection } from '../AdminLayout';
import { ErrorState } from '../ui/States';

interface DashboardViewProps {
  onNavigate: (section: AdminSection) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pendingDocsCount, setPendingDocsCount] = useState<number>(0);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const [statsRes, docsRes, paymentsRes] = await Promise.all([
      supabase
        .from('v_dashboard')
        .select(
          'total_candidates, onboarding, active, total_pending_fees, overdue_installments, handed_over, open_tickets',
        )
        .maybeSingle(),
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted'),
    ]);

    if (statsRes.error) {
      setError(formatDbError(statsRes.error));
      setLoading(false);
      return;
    }

    setStats(normalizeDashboardStats(statsRes.data));
    setPendingDocsCount(docsRes.count ?? 0);
    setPendingPaymentsCount(paymentsRes.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading dashboard">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-56 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="p-5 bg-white border border-[#E3E9F0] rounded-xl space-y-3 shadow-soft"
            >
              <div className="h-3.5 w-28 bg-slate-100 rounded animate-pulse" />
              <div className="h-9 w-20 bg-slate-200 rounded animate-pulse" />
              <div className="h-1 w-8 bg-[#0FA3A3]/30 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load dashboard metrics"
        message={error}
        onRetry={loadStats}
      />
    );
  }

  const metrics = stats ?? normalizeDashboardStats(null);
  const isEmptyInstitute =
    metrics.total_candidates === 0 &&
    metrics.onboarding === 0 &&
    metrics.active === 0;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-[#0B1F3A] tracking-tight">
            Institute Dashboard
          </h1>
          <p className="mt-1 text-sm text-[#5B6B7F]">
            Overview of candidate cohorts, enrollment status, collections, and action items.
          </p>
        </div>

        <button
          type="button"
          onClick={loadStats}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors self-start sm:self-auto whitespace-nowrap shrink-0 shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#0FA3A3]" />
          Refresh metrics
        </button>
      </div>

      {/* Row of Summary Cards (large number in Manrope, small muted label, thin teal line) */}
      <section
        aria-label="Summary metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* Card 1: Total Candidates */}
        <div className="p-5 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B7F]">
              Total Candidates
            </p>
            <p className="mt-2 font-display text-3xl sm:text-4xl font-bold text-[#0B1F3A] tabular-nums">
              {formatAmount(metrics.total_candidates)}
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-[#5B6B7F]">
              {metrics.active} active · {metrics.onboarding} onboarding
            </span>
            <div className="h-0.5 w-8 bg-[#0FA3A3] rounded-full" />
          </div>
        </div>

        {/* Card 2: Active in Training */}
        <div className="p-5 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B7F]">
              Active in Training
            </p>
            <p className="mt-2 font-display text-3xl sm:text-4xl font-bold text-[#1F9D6B] tabular-nums">
              {formatAmount(metrics.active)}
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-[#5B6B7F]">Attending scheduled batches</span>
            <div className="h-0.5 w-8 bg-[#0FA3A3] rounded-full" />
          </div>
        </div>

        {/* Card 3: Pending Fees */}
        <div className="p-5 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B7F]">
              Pending Fees
            </p>
            <p
              className={`mt-2 font-display text-3xl sm:text-4xl font-bold tabular-nums ${
                metrics.total_pending_fees > 0 ? 'text-[#C98A0B]' : 'text-[#0B1F3A]'
              }`}
            >
              {formatInr(metrics.total_pending_fees)}
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-[#5B6B7F]">Uncollected balance</span>
            <div className="h-0.5 w-8 bg-[#0FA3A3] rounded-full" />
          </div>
        </div>

        {/* Card 4: Overdue Installments */}
        <div className="p-5 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B7F]">
              Overdue Installments
            </p>
            <p
              className={`mt-2 font-display text-3xl sm:text-4xl font-bold tabular-nums ${
                metrics.overdue_installments > 0 ? 'text-[#C2413B]' : 'text-[#0B1F3A]'
              }`}
            >
              {formatAmount(metrics.overdue_installments)}
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-[#5B6B7F]">
              {metrics.overdue_installments > 0 ? 'Action required' : 'All up to date'}
            </span>
            <div className="h-0.5 w-8 bg-[#0FA3A3] rounded-full" />
          </div>
        </div>
      </section>

      {/* Empty State Banner if no data yet */}
      {isEmptyInstitute && (
        <div className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold font-display text-[#0B1F3A]">
              Get Started with Dimension Education
            </h2>
            <p className="mt-1 text-sm text-[#5B6B7F]">
              Configure programs and modules, schedule cohort batches, and enroll candidates.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('catalog')}
              className="px-4 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors"
            >
              Configure Catalog
            </button>
            <button
              type="button"
              onClick={() => onNavigate('candidates')}
              className="px-4 py-2 text-xs font-medium text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors"
            >
              Add Candidate
            </button>
          </div>
        </div>
      )}

      {/* Two Columns Below: Items Needing Action & Quick Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Items That Need Action */}
        <section
          aria-labelledby="action-items-heading"
          className="bg-white border border-[#E3E9F0] rounded-xl shadow-soft p-6 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#E3E9F0]">
            <div>
              <h2
                id="action-items-heading"
                className="text-base font-bold font-display text-[#0B1F3A]"
              >
                Items Needing Action
              </h2>
              <p className="text-xs text-[#5B6B7F] mt-0.5">
                Pending approvals, payment confirmations, and candidate tickets.
              </p>
            </div>
          </div>

          <div className="divide-y divide-[#E3E9F0]">
            {/* Action Item 1: Pending Documents */}
            <div className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#E8F0FA] text-[#2F6FB0] flex items-center justify-center shrink-0">
                  <FileCheck className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0B1F3A]">Pending Documents</p>
                  <p className="text-xs text-[#5B6B7F] truncate">
                    Candidate identity proofs and profile photos awaiting review
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                    pendingDocsCount > 0
                      ? 'bg-[#FDF4E0] text-[#C98A0B]'
                      : 'bg-[#F5F8FB] text-[#5B6B7F]'
                  }`}
                >
                  {pendingDocsCount}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('document_review')}
                  className="text-xs font-medium text-[#0B7C7C] hover:text-[#0B8A8A] inline-flex items-center gap-1 transition-colors"
                >
                  <span>View all</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Action Item 2: Pending Payments */}
            <div className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#E7F6EF] text-[#1F9D6B] flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0B1F3A]">Pending Payments</p>
                  <p className="text-xs text-[#5B6B7F] truncate">
                    Bank deposit slips &amp; transfers submitted by candidates
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                    pendingPaymentsCount > 0
                      ? 'bg-[#FDF4E0] text-[#C98A0B]'
                      : 'bg-[#F5F8FB] text-[#5B6B7F]'
                  }`}
                >
                  {pendingPaymentsCount}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('payments')}
                  className="text-xs font-medium text-[#0B7C7C] hover:text-[#0B8A8A] inline-flex items-center gap-1 transition-colors"
                >
                  <span>View all</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Action Item 3: Open Tickets */}
            <div className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#E8F0FA] text-[#2F6FB0] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0B1F3A]">Open Support Tickets</p>
                  <p className="text-xs text-[#5B6B7F] truncate">
                    Candidate help requests awaiting reply or resolution
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                    metrics.open_tickets > 0
                      ? 'bg-[#E8F0FA] text-[#2F6FB0]'
                      : 'bg-[#F5F8FB] text-[#5B6B7F]'
                  }`}
                >
                  {metrics.open_tickets}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('tickets')}
                  className="text-xs font-medium text-[#0B7C7C] hover:text-[#0B8A8A] inline-flex items-center gap-1 transition-colors"
                >
                  <span>View all</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Action Item 4: Overdue Installments */}
            <div className="py-3.5 last:pb-1 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#FBEAE9] text-[#C2413B] flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0B1F3A]">Overdue Installments</p>
                  <p className="text-xs text-[#5B6B7F] truncate">
                    Candidate payments past installment due dates
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                    metrics.overdue_installments > 0
                      ? 'bg-[#FBEAE9] text-[#C2413B]'
                      : 'bg-[#F5F8FB] text-[#5B6B7F]'
                  }`}
                >
                  {metrics.overdue_installments}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('candidates')}
                  className="text-xs font-medium text-[#0B7C7C] hover:text-[#0B8A8A] inline-flex items-center gap-1 transition-colors"
                >
                  <span>View all</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Column 2: Key Operations & Workspaces */}
        <section
          aria-labelledby="workspaces-heading"
          className="bg-white border border-[#E3E9F0] rounded-xl shadow-soft p-6 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#E3E9F0]">
            <div>
              <h2
                id="workspaces-heading"
                className="text-base font-bold font-display text-[#0B1F3A]"
              >
                Workspaces &amp; Directory
              </h2>
              <p className="text-xs text-[#5B6B7F] mt-0.5">
                Direct access to candidate records, batches, staff, and exports.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('candidates')}
              className="p-3.5 bg-[#F5F8FB] hover:bg-[#E6F6F6] border border-[#E3E9F0] hover:border-[#0FA3A3]/40 rounded-lg text-left transition-colors group flex items-start gap-3"
            >
              <Users className="w-5 h-5 text-[#0FA3A3] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#0B7C7C] transition-colors">
                  Candidates
                </p>
                <p className="text-xs text-[#5B6B7F] mt-0.5">
                  Enrollment, fees &amp; documents
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('batches')}
              className="p-3.5 bg-[#F5F8FB] hover:bg-[#E6F6F6] border border-[#E3E9F0] hover:border-[#0FA3A3]/40 rounded-lg text-left transition-colors group flex items-start gap-3"
            >
              <Calendar className="w-5 h-5 text-[#0FA3A3] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#0B7C7C] transition-colors">
                  Batches &amp; SMEs
                </p>
                <p className="text-xs text-[#5B6B7F] mt-0.5">
                  Timetables, slots &amp; sessions
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('placement')}
              className="p-3.5 bg-[#F5F8FB] hover:bg-[#E6F6F6] border border-[#E3E9F0] hover:border-[#0FA3A3]/40 rounded-lg text-left transition-colors group flex items-start gap-3"
            >
              <Briefcase className="w-5 h-5 text-[#0FA3A3] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#0B7C7C] transition-colors">
                  Placement Team
                </p>
                <p className="text-xs text-[#5B6B7F] mt-0.5">
                  Handover records &amp; team
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('catalog')}
              className="p-3.5 bg-[#F5F8FB] hover:bg-[#E6F6F6] border border-[#E3E9F0] hover:border-[#0FA3A3]/40 rounded-lg text-left transition-colors group flex items-start gap-3"
            >
              <BookOpen className="w-5 h-5 text-[#0FA3A3] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#0B7C7C] transition-colors">
                  Programs Catalog
                </p>
                <p className="text-xs text-[#5B6B7F] mt-0.5">
                  Curriculum &amp; modules
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('staff')}
              className="p-3.5 bg-[#F5F8FB] hover:bg-[#E6F6F6] border border-[#E3E9F0] hover:border-[#0FA3A3]/40 rounded-lg text-left transition-colors group flex items-start gap-3"
            >
              <GraduationCap className="w-5 h-5 text-[#0FA3A3] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#0B7C7C] transition-colors">
                  Staff Directory
                </p>
                <p className="text-xs text-[#5B6B7F] mt-0.5">
                  Counsellors, SMEs &amp; roles
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="p-3.5 bg-[#F5F8FB] hover:bg-[#E6F6F6] border border-[#E3E9F0] hover:border-[#0FA3A3]/40 rounded-lg text-left transition-colors group flex items-start gap-3"
            >
              <FileSpreadsheet className="w-5 h-5 text-[#0FA3A3] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#0B7C7C] transition-colors">
                  Excel Reports
                </p>
                <p className="text-xs text-[#5B6B7F] mt-0.5">
                  Download audited exports
                </p>
              </div>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
