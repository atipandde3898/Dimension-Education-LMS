import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  Batch,
  BatchSme,
  CandidateOverview,
  InstallmentStatus,
  Module,
  Profile,
  Program,
} from '../../types/database';
import {
  buildBatchesReportRows,
  buildFeesReportRows,
  buildPlacementReportRows,
  buildReportFilename,
  formatAmount,
  formatDbError,
  formatInr,
  type CandidateFilterKeys,
} from '../../utils/domain';
import { downloadWorkbookAsExcel } from '../../utils/excel';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';
import { TimetableStatusBadge } from '../ui/TimetableWidgets';

type ReportTab = 'fees' | 'batches' | 'placement';

interface CandidateFkRow {
  id: string;
  batch_id: string | null;
  program_id: string | null;
  counsellor_id: string | null;
}

interface ReportsViewProps {
  onSelectCandidate?: (candidateId: string) => void;
  onSelectBatch?: (batchId: string) => void;
}

const FEES_EMPTY_HEADERS = [
  'Candidate Code',
  'Full Name',
  'Program',
  'Module',
  'Batch Code',
  'Counsellor',
  'Net fee (INR)',
  'Paid (INR)',
  'Pending (INR)',
  'Overdue Installments',
];

const BATCHES_EMPTY_HEADERS = [
  'Batch Code',
  'Module',
  'Mode',
  'Start Date',
  'Candidates Count',
  'SMEs Count',
  'Timetable Status',
];

const PLACEMENT_EMPTY_HEADERS = [
  'Candidate Code',
  'Full Name',
  'Batch Code',
  'Counsellor',
  'Handed Over',
  'Handover Date',
  'Placement Team Member',
];

export function ReportsView({
  onSelectCandidate,
  onSelectBatch,
}: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('fees');

  const [candidates, setCandidates] = useState<CandidateOverview[]>([]);
  const [candidateFkRows, setCandidateFkRows] = useState<CandidateFkRow[]>([]);
  const [installments, setInstallments] = useState<
    Array<Pick<InstallmentStatus, 'id' | 'candidate_id' | 'state'>>
  >([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchSmes, setBatchSmes] = useState<BatchSme[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [counsellors, setCounsellors] = useState<
    Array<Pick<Profile, 'id' | 'full_name' | 'active'>>
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fees report filters
  const [feesBatchFilter, setFeesBatchFilter] = useState('all');
  const [feesProgramFilter, setFeesProgramFilter] = useState('all');
  const [feesCounsellorFilter, setFeesCounsellorFilter] = useState('all');
  const [feesPendingOnly, setFeesPendingOnly] = useState(false);

  // Batches report filters
  const [batchesModuleFilter, setBatchesModuleFilter] = useState('all');
  const [batchesModeFilter, setBatchesModeFilter] = useState<
    'all' | 'online' | 'offline'
  >('all');

  // Placement report filters
  const [placementHandedOverFilter, setPlacementHandedOverFilter] = useState<
    'all' | 'yes' | 'no'
  >('all');
  const [placementBatchFilter, setPlacementBatchFilter] = useState('all');
  const [placementCounsellorFilter, setPlacementCounsellorFilter] =
    useState('all');

  const loadReportData = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    setLoading(true);
    setError(null);

    // Note: Never query candidate_pan, documents, or payment proof_path in Reports.
    const [
      ovRes,
      candFkRes,
      instRes,
      batchesRes,
      batchSmesRes,
      programsRes,
      modulesRes,
      counsellorsRes,
    ] = await Promise.all([
      client
        .from('v_candidate_overview')
        .select(
          'candidate_id, candidate_code, full_name, email, phone, status, program, module, batch_code, batch_mode, counsellor, net_fee, paid, pending, handed_over, handover_date, placement_member',
        ),
      client
        .from('candidates')
        .select('id, batch_id, program_id, counsellor_id'),
      client.from('v_installment_status').select('id, candidate_id, state'),
      client
        .from('batches')
        .select(
          'id, batch_code, module_id, mode, start_date, end_date, location, timetable_status',
        )
        .order('batch_code', { ascending: true }),
      client.from('batch_smes').select('batch_id, sme_id'),
      client
        .from('programs')
        .select('id, name, active')
        .order('name', { ascending: true }),
      client
        .from('modules')
        .select('id, code, name, active')
        .order('code', { ascending: true }),
      client
        .from('profiles')
        .select('id, full_name, active')
        .eq('role', 'counsellor')
        .order('full_name', { ascending: true }),
    ]);

    const firstError =
      ovRes.error ||
      candFkRes.error ||
      instRes.error ||
      batchesRes.error ||
      batchSmesRes.error ||
      programsRes.error ||
      modulesRes.error ||
      counsellorsRes.error;

    if (firstError) {
      setError(formatDbError(firstError));
      setLoading(false);
      return;
    }

    setCandidates((ovRes.data as CandidateOverview[] | null) ?? []);
    setCandidateFkRows((candFkRes.data as CandidateFkRow[] | null) ?? []);
    setInstallments(
      (instRes.data as Array<
        Pick<InstallmentStatus, 'id' | 'candidate_id' | 'state'>
      > | null) ?? [],
    );
    setBatches((batchesRes.data as Batch[] | null) ?? []);
    setBatchSmes((batchSmesRes.data as BatchSme[] | null) ?? []);
    setPrograms((programsRes.data as Program[] | null) ?? []);
    setModules((modulesRes.data as Module[] | null) ?? []);
    setCounsellors(
      (counsellorsRes.data as Array<
        Pick<Profile, 'id' | 'full_name' | 'active'>
      > | null) ?? [],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadReportData();
  }, [loadReportData]);

  const metaByCandidateId = useMemo(() => {
    const map = new Map<string, CandidateFilterKeys>();
    for (const row of candidateFkRows) {
      map.set(row.id, {
        batch_id: row.batch_id,
        program_id: row.program_id,
        counsellor_id: row.counsellor_id,
      });
    }
    return map;
  }, [candidateFkRows]);

  const feesReport = useMemo(
    () =>
      buildFeesReportRows(
        candidates,
        installments,
        {
          batchFilter: feesBatchFilter,
          programFilter: feesProgramFilter,
          counsellorFilter: feesCounsellorFilter,
          onlyPendingPositive: feesPendingOnly,
        },
        metaByCandidateId,
      ),
    [
      candidates,
      installments,
      feesBatchFilter,
      feesProgramFilter,
      feesCounsellorFilter,
      feesPendingOnly,
      metaByCandidateId,
    ],
  );

  const batchesReport = useMemo(
    () =>
      buildBatchesReportRows(batches, modules, candidateFkRows, batchSmes, {
        moduleFilter: batchesModuleFilter,
        modeFilter: batchesModeFilter,
      }),
    [batches, modules, candidateFkRows, batchSmes, batchesModuleFilter, batchesModeFilter],
  );

  const placementReport = useMemo(
    () =>
      buildPlacementReportRows(
        candidates,
        {
          handedOverFilter: placementHandedOverFilter,
          batchFilter: placementBatchFilter,
          counsellorFilter: placementCounsellorFilter,
        },
        metaByCandidateId,
      ),
    [
      candidates,
      placementHandedOverFilter,
      placementBatchFilter,
      placementCounsellorFilter,
      metaByCandidateId,
    ],
  );

  const activeRowCount =
    activeTab === 'fees'
      ? feesReport.excelRows.length
      : activeTab === 'batches'
        ? batchesReport.excelRows.length
        : placementReport.excelRows.length;

  const activeFilename =
    activeTab === 'fees'
      ? buildReportFilename('fees-report')
      : activeTab === 'batches'
        ? buildReportFilename('batches-report')
        : buildReportFilename('placement-report');

  const handleDownloadExcel = () => {
    if (activeTab === 'fees') {
      downloadWorkbookAsExcel(
        feesReport.excelRows,
        'Fees Report',
        buildReportFilename('fees-report'),
        FEES_EMPTY_HEADERS,
      );
      return;
    }
    if (activeTab === 'batches') {
      downloadWorkbookAsExcel(
        batchesReport.excelRows,
        'Batches Report',
        buildReportFilename('batches-report'),
        BATCHES_EMPTY_HEADERS,
      );
      return;
    }
    downloadWorkbookAsExcel(
      placementReport.excelRows,
      'Placement Report',
      buildReportFilename('placement-report'),
      PLACEMENT_EMPTY_HEADERS,
    );
  };

  const feesHasActiveFilters =
    feesBatchFilter !== 'all' ||
    feesProgramFilter !== 'all' ||
    feesCounsellorFilter !== 'all' ||
    feesPendingOnly;

  const batchesHasActiveFilters =
    batchesModuleFilter !== 'all' || batchesModeFilter !== 'all';

  const placementHasActiveFilters =
    placementHandedOverFilter !== 'all' ||
    placementBatchFilter !== 'all' ||
    placementCounsellorFilter !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Filter live cohort records, preview rows on screen, and export
            spreadsheets (`.xlsx`) with numeric fee totals and formatted dates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void loadReportData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleDownloadExcel}
            disabled={loading || Boolean(error)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Download Excel
          </button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Report type"
          className="flex items-center gap-6 -mb-px overflow-x-auto"
        >
          {(
            [
              { id: 'fees', label: 'Fees Report' },
              { id: 'batches', label: 'Batches Report' },
              { id: 'placement', label: 'Placement Report' },
            ] as Array<{ id: ReportTab; label: string }>
          ).map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  selected
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {!loading && !error && (
          <div className="pb-2.5 text-xs text-slate-500 flex items-center gap-2">
            <span>
              <strong className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatAmount(activeRowCount)}
              </strong>{' '}
              {activeRowCount === 1 ? 'row' : 'rows'}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-slate-600">{activeFilename}</span>
          </div>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={7} />
      ) : error ? (
        <ErrorState
          title="Could not load report records"
          message={error}
          onRetry={() => void loadReportData()}
        />
      ) : (
        <>
          {/* TAB 1: FEES REPORT */}
          {activeTab === 'fees' && (
            <div className="space-y-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
                  <div>
                    <label
                      htmlFor="fees-filter-batch"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Batch
                    </label>
                    <select
                      id="fees-filter-batch"
                      value={feesBatchFilter}
                      onChange={(e) => setFeesBatchFilter(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                    >
                      <option value="all">All batches</option>
                      <option value="__unassigned__">Unassigned</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batch_code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="fees-filter-program"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Program
                    </label>
                    <select
                      id="fees-filter-program"
                      value={feesProgramFilter}
                      onChange={(e) => setFeesProgramFilter(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                    >
                      <option value="all">All programs</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="fees-filter-counsellor"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Counsellor
                    </label>
                    <select
                      id="fees-filter-counsellor"
                      value={feesCounsellorFilter}
                      onChange={(e) => setFeesCounsellorFilter(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                    >
                      <option value="all">All counsellors</option>
                      <option value="__unassigned__">Unassigned</option>
                      {counsellors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <label
                      htmlFor="fees-filter-pending-positive"
                      className="w-full inline-flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 cursor-pointer select-none hover:bg-slate-100/70 transition-colors"
                    >
                      <input
                        id="fees-filter-pending-positive"
                        type="checkbox"
                        checked={feesPendingOnly}
                        onChange={(e) => setFeesPendingOnly(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <span>Pending &gt; 0</span>
                    </label>
                  </div>
                </div>

                {feesHasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setFeesBatchFilter('all');
                      setFeesProgramFilter('all');
                      setFeesCounsellorFilter('all');
                      setFeesPendingOnly(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap self-start lg:self-end"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset filters
                  </button>
                )}
              </div>

              {feesReport.previewRows.length === 0 ? (
                <EmptyState
                  title="No candidates match the selected fee filters"
                  description="Adjust the batch, program, counsellor, or Pending > 0 filter to view and export rows."
                />
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-slate-50/80 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Code
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Full Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Program
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Module
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Batch
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Counsellor
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Net Fee (INR)
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Paid (INR)
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Pending (INR)
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Overdue Inst.
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {feesReport.previewRows.map((row) => (
                          <tr
                            key={row.candidate_id}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              {onSelectCandidate ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onSelectCandidate(row.candidate_id)
                                  }
                                  className="font-mono text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline tabular-nums"
                                >
                                  {row.candidate_code}
                                </button>
                              ) : (
                                <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                                  {row.candidate_code}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {row.full_name}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {row.program}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {row.module}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                              {row.batch_code}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {row.counsellor}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-slate-900 tabular-nums whitespace-nowrap">
                              {formatInr(row.net_fee)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-emerald-700 tabular-nums whitespace-nowrap">
                              {formatInr(row.paid)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              <span
                                className={
                                  row.pending > 0
                                    ? 'font-medium text-amber-700'
                                    : 'text-slate-600'
                                }
                              >
                                {formatInr(row.pending)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              <span
                                className={
                                  row.overdue_installments_count > 0
                                    ? 'font-semibold text-red-700'
                                    : 'text-slate-600'
                                }
                              >
                                {row.overdue_installments_count}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BATCHES REPORT */}
          {activeTab === 'batches' && (
            <div className="space-y-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-xl">
                  <div>
                    <label
                      htmlFor="batches-filter-module"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Module
                    </label>
                    <select
                      id="batches-filter-module"
                      value={batchesModuleFilter}
                      onChange={(e) => setBatchesModuleFilter(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                    >
                      <option value="all">All modules</option>
                      {modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.code} — {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="batches-filter-mode"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Mode
                    </label>
                    <select
                      id="batches-filter-mode"
                      value={batchesModeFilter}
                      onChange={(e) =>
                        setBatchesModeFilter(
                          e.target.value as 'all' | 'online' | 'offline',
                        )
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                    >
                      <option value="all">All modes</option>
                      <option value="online">Online</option>
                      <option value="offline">Offline</option>
                    </select>
                  </div>
                </div>

                {batchesHasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setBatchesModuleFilter('all');
                      setBatchesModeFilter('all');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap self-start sm:self-end"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset filters
                  </button>
                )}
              </div>

              {batchesReport.previewRows.length === 0 ? (
                <EmptyState
                  title="No batches match the selected filters"
                  description="Try clearing the module or mode filter to preview batch records."
                />
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-slate-50/80 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Batch Code
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Module
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Mode
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Start Date
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Candidates
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                            SMEs
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Timetable Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {batchesReport.previewRows.map((row) => (
                          <tr
                            key={row.batch_id}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              {onSelectBatch ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectBatch(row.batch_id)}
                                  className="font-mono text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline tabular-nums"
                                >
                                  {row.batch_code}
                                </button>
                              ) : (
                                <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                                  {row.batch_code}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-900">
                              {row.module}
                            </td>
                            <td className="px-4 py-3 capitalize text-slate-700">
                              {row.mode}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                              {row.start_date_formatted}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                              {row.candidates_count}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                              {row.smes_count}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <TimetableStatusBadge
                                status={row.timetable_status}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PLACEMENT REPORT */}
          {activeTab === 'placement' && (
            <div className="space-y-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 max-w-3xl">
                  <div>
                    <label
                      htmlFor="placement-filter-handed-over"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Handed Over
                    </label>
                    <select
                      id="placement-filter-handed-over"
                      value={placementHandedOverFilter}
                      onChange={(e) =>
                        setPlacementHandedOverFilter(
                          e.target.value as 'all' | 'yes' | 'no',
                        )
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                    >
                      <option value="all">All candidates</option>
                      <option value="yes">Yes — Handed over</option>
                      <option value="no">No — Not handed over</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="placement-filter-batch"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Batch
                    </label>
                    <select
                      id="placement-filter-batch"
                      value={placementBatchFilter}
                      onChange={(e) => setPlacementBatchFilter(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                    >
                      <option value="all">All batches</option>
                      <option value="__unassigned__">Unassigned</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batch_code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="placement-filter-counsellor"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Counsellor
                    </label>
                    <select
                      id="placement-filter-counsellor"
                      value={placementCounsellorFilter}
                      onChange={(e) =>
                        setPlacementCounsellorFilter(e.target.value)
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                    >
                      <option value="all">All counsellors</option>
                      <option value="__unassigned__">Unassigned</option>
                      {counsellors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {placementHasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlacementHandedOverFilter('all');
                      setPlacementBatchFilter('all');
                      setPlacementCounsellorFilter('all');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap self-start lg:self-end"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset filters
                  </button>
                )}
              </div>

              {placementReport.previewRows.length === 0 ? (
                <EmptyState
                  title="No candidates match the selected placement filters"
                  description="Adjust the handed over status, batch, or counsellor filter to view records."
                />
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-slate-50/80 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Code
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Full Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Batch
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Counsellor
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Handed Over
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Handover Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Placement Team Member
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {placementReport.previewRows.map((row) => (
                          <tr
                            key={row.candidate_id}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              {onSelectCandidate ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onSelectCandidate(row.candidate_id)
                                  }
                                  className="font-mono text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline tabular-nums"
                                >
                                  {row.candidate_code}
                                </button>
                              ) : (
                                <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                                  {row.candidate_code}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {row.full_name}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                              {row.batch_code}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {row.counsellor}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md border ${
                                  row.handed_over
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-slate-100 border-slate-200 text-slate-600'
                                }`}
                              >
                                {row.handed_over_label}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                              {row.handover_date_formatted}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {row.placement_member}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
