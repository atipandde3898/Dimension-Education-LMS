import React, { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Eye,
  FileText,
  GraduationCap,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  CandidateCv,
  CandidateEducation,
  CandidateWork,
  WorkTypeValue,
} from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  formatDbError,
  validateAndBuildCvUpload,
  validateAndBuildEducationPayload,
  validateAndBuildWorkPayload,
  type EducationFormInput,
} from '../../utils/domain';

function DoneBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1F9D6B] bg-[#E7F6EF] border border-[#BCE8D3] rounded-md whitespace-nowrap shrink-0">
      <CheckCircle2 className="w-3.5 h-3.5 text-[#1F9D6B] shrink-0" />
      Done
    </span>
  );
}

function PendingBadge() {
  return (
    <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-[#5B6B7F] bg-[#F5F8FB] border border-[#E3E9F0] rounded-md whitespace-nowrap shrink-0">
      Not completed
    </span>
  );
}

function NotApplicableSwitch({
  id,
  label,
  checked,
  disabled = false,
  onChange,
  helperText,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  helperText?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex items-center gap-2.5">
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => {
            if (!disabled) onChange(!checked);
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0FA3A3] disabled:opacity-45 disabled:cursor-not-allowed ${
            checked ? 'bg-[#0FA3A3]' : 'bg-slate-300'
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-150 ${
              checked ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
        <label
          htmlFor={id}
          className={`text-xs font-medium select-none ${
            disabled ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 cursor-pointer'
          }`}
        >
          {label}
        </label>
      </div>
      {helperText && (
        <span className="text-[11px] text-slate-400">{helperText}</span>
      )}
    </div>
  );
}

function buildInitialEducationForm(
  ed: CandidateEducation | null,
): EducationFormInput {
  if (!ed) {
    return {
      ssc_year: '',
      ssc_percent: '',
      hsc_na: false,
      hsc_year: '',
      hsc_percent: '',
      diploma_na: true,
      diploma_stream: '',
      diploma_year: '',
      diploma_percent: '',
      graduation_na: false,
      graduation_stream: '',
      graduation_degree: '',
      graduation_year: '',
      graduation_percent: '',
      graduation_university: '',
      pg_na: true,
      pg_stream: '',
      pg_degree: '',
      pg_year: '',
      pg_percent: '',
      pg_university: '',
    };
  }
  return {
    ssc_year: ed.ssc_year != null ? String(ed.ssc_year) : '',
    ssc_percent: ed.ssc_percent != null ? String(ed.ssc_percent) : '',
    hsc_na: Boolean(ed.hsc_na),
    hsc_year: ed.hsc_na || ed.hsc_year == null ? '' : String(ed.hsc_year),
    hsc_percent:
      ed.hsc_na || ed.hsc_percent == null ? '' : String(ed.hsc_percent),
    diploma_na: Boolean(ed.diploma_na),
    diploma_stream: ed.diploma_na ? '' : (ed.diploma_stream ?? ''),
    diploma_year:
      ed.diploma_na || ed.diploma_year == null ? '' : String(ed.diploma_year),
    diploma_percent:
      ed.diploma_na || ed.diploma_percent == null
        ? ''
        : String(ed.diploma_percent),
    graduation_na: Boolean(ed.graduation_na),
    graduation_stream: ed.graduation_na ? '' : (ed.graduation_stream ?? ''),
    graduation_degree: ed.graduation_na ? '' : (ed.graduation_degree ?? ''),
    graduation_year:
      ed.graduation_na || ed.graduation_year == null
        ? ''
        : String(ed.graduation_year),
    graduation_percent:
      ed.graduation_na || ed.graduation_percent == null
        ? ''
        : String(ed.graduation_percent),
    graduation_university: ed.graduation_na
      ? ''
      : (ed.graduation_university ?? ''),
    pg_na: Boolean(ed.pg_na),
    pg_stream: ed.pg_na ? '' : (ed.pg_stream ?? ''),
    pg_degree: ed.pg_na ? '' : (ed.pg_degree ?? ''),
    pg_year: ed.pg_na || ed.pg_year == null ? '' : String(ed.pg_year),
    pg_percent:
      ed.pg_na || ed.pg_percent == null ? '' : String(ed.pg_percent),
    pg_university: ed.pg_na ? '' : (ed.pg_university ?? ''),
  };
}

interface CandidateEducationCardProps {
  candidateId: string;
  education: CandidateEducation | null;
  onRefresh: () => Promise<void>;
}

export function CandidateEducationCard({
  candidateId,
  education,
  onRefresh,
}: CandidateEducationCardProps) {
  const [form, setForm] = useState<EducationFormInput>(() =>
    buildInitialEducationForm(education),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildInitialEducationForm(education));
  }, [education]);

  const maxYear = new Date().getFullYear() + 1;

  const handleToggleDiplomaNa = (nextNa: boolean) => {
    setForm((prev) => ({
      ...prev,
      diploma_na: nextNa,
      diploma_stream: nextNa ? '' : prev.diploma_stream,
      diploma_year: nextNa ? '' : prev.diploma_year,
      diploma_percent: nextNa ? '' : prev.diploma_percent,
      // HSC can be marked Not applicable ONLY when a diploma is entered
      hsc_na: nextNa ? false : prev.hsc_na,
    }));
    if (error) setError(null);
    if (successMsg) setSuccessMsg(null);
  };

  const handleToggleHscNa = (nextNa: boolean) => {
    if (nextNa && form.diploma_na) return;
    setForm((prev) => ({
      ...prev,
      hsc_na: nextNa,
      hsc_year: nextNa ? '' : prev.hsc_year,
      hsc_percent: nextNa ? '' : prev.hsc_percent,
    }));
    if (error) setError(null);
    if (successMsg) setSuccessMsg(null);
  };

  const handleToggleGraduationNa = (nextNa: boolean) => {
    setForm((prev) => ({
      ...prev,
      graduation_na: nextNa,
      graduation_stream: nextNa ? '' : prev.graduation_stream,
      graduation_degree: nextNa ? '' : prev.graduation_degree,
      graduation_year: nextNa ? '' : prev.graduation_year,
      graduation_percent: nextNa ? '' : prev.graduation_percent,
      graduation_university: nextNa ? '' : prev.graduation_university,
    }));
    if (error) setError(null);
    if (successMsg) setSuccessMsg(null);
  };

  const handleTogglePgNa = (nextNa: boolean) => {
    setForm((prev) => ({
      ...prev,
      pg_na: nextNa,
      pg_stream: nextNa ? '' : prev.pg_stream,
      pg_degree: nextNa ? '' : prev.pg_degree,
      pg_year: nextNa ? '' : prev.pg_year,
      pg_percent: nextNa ? '' : prev.pg_percent,
      pg_university: nextNa ? '' : prev.pg_university,
    }));
    if (error) setError(null);
    if (successMsg) setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const check = validateAndBuildEducationPayload(candidateId, form);
    if (!check.ok) {
      setError(check.error);
      setSuccessMsg(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const { error: upsertErr } = await client
      .from('candidate_education')
      .upsert(check.payload, { onConflict: 'candidate_id' });

    setSaving(false);

    if (upsertErr) {
      setError(formatDbError(upsertErr));
      return;
    }

    setSuccessMsg('Education details saved.');
    await onRefresh();
  };

  const inputClass =
    'w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed';

  return (
    <section
      aria-labelledby="onboarding-education-heading"
      className="p-5 sm:p-6 bg-white border border-slate-200 rounded-xl space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#E6F6F6] text-[#0B7C7C] flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div>
            <h2
              id="onboarding-education-heading"
              className="text-base font-semibold text-slate-900"
            >
              Education details
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your academic qualifications. At least one of Engineering
              diploma or Graduation is required (years 1980–{maxYear},
              percentage 0–100).
            </p>
          </div>
        </div>

        {education ? <DoneBadge /> : <PendingBadge />}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* 1. SSC */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            1. SSC (10th Standard)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edu-ssc-year"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Passing year
              </label>
              <input
                id="edu-ssc-year"
                type="number"
                min={1980}
                max={maxYear}
                step={1}
                placeholder="e.g. 2016"
                value={form.ssc_year}
                onChange={(e) => {
                  setForm((p) => ({ ...p, ssc_year: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-ssc-percent"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Percentage (%)
              </label>
              <input
                id="edu-ssc-percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="e.g. 86.50"
                value={form.ssc_percent}
                onChange={(e) => {
                  setForm((p) => ({ ...p, ssc_percent: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* 2. HSC */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              2. HSC (12th Standard)
            </h3>
            <NotApplicableSwitch
              id="edu-hsc-na"
              label="Not applicable"
              checked={form.hsc_na}
              disabled={form.diploma_na}
              onChange={handleToggleHscNa}
              helperText={
                form.diploma_na
                  ? 'Available only when an Engineering diploma is entered'
                  : undefined
              }
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edu-hsc-year"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Passing year
              </label>
              <input
                id="edu-hsc-year"
                type="number"
                min={1980}
                max={maxYear}
                step={1}
                disabled={form.hsc_na}
                placeholder="e.g. 2018"
                value={form.hsc_year}
                onChange={(e) => {
                  setForm((p) => ({ ...p, hsc_year: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-hsc-percent"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Percentage (%)
              </label>
              <input
                id="edu-hsc-percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                disabled={form.hsc_na}
                placeholder="e.g. 82.40"
                value={form.hsc_percent}
                onChange={(e) => {
                  setForm((p) => ({ ...p, hsc_percent: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* 3. Engineering Diploma */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              3. Engineering diploma
            </h3>
            <NotApplicableSwitch
              id="edu-diploma-na"
              label="Not applicable"
              checked={form.diploma_na}
              onChange={handleToggleDiplomaNa}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="edu-diploma-stream"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Stream
              </label>
              <input
                id="edu-diploma-stream"
                type="text"
                disabled={form.diploma_na}
                placeholder="e.g. Mechanical Engineering"
                value={form.diploma_stream}
                onChange={(e) => {
                  setForm((p) => ({ ...p, diploma_stream: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-diploma-year"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Passing year
              </label>
              <input
                id="edu-diploma-year"
                type="number"
                min={1980}
                max={maxYear}
                step={1}
                disabled={form.diploma_na}
                placeholder="e.g. 2019"
                value={form.diploma_year}
                onChange={(e) => {
                  setForm((p) => ({ ...p, diploma_year: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-diploma-percent"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Percentage (%)
              </label>
              <input
                id="edu-diploma-percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                disabled={form.diploma_na}
                placeholder="e.g. 78.25"
                value={form.diploma_percent}
                onChange={(e) => {
                  setForm((p) => ({ ...p, diploma_percent: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* 4. Graduation */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              4. Graduation
            </h3>
            <NotApplicableSwitch
              id="edu-graduation-na"
              label="Not applicable"
              checked={form.graduation_na}
              onChange={handleToggleGraduationNa}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="edu-grad-stream"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Stream
              </label>
              <input
                id="edu-grad-stream"
                type="text"
                disabled={form.graduation_na}
                placeholder="e.g. Computer Science"
                value={form.graduation_stream}
                onChange={(e) => {
                  setForm((p) => ({
                    ...p,
                    graduation_stream: e.target.value,
                  }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-grad-degree"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Degree
              </label>
              <input
                id="edu-grad-degree"
                type="text"
                disabled={form.graduation_na}
                placeholder="e.g. B.Tech / B.Com"
                value={form.graduation_degree}
                onChange={(e) => {
                  setForm((p) => ({
                    ...p,
                    graduation_degree: e.target.value,
                  }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-grad-year"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Passing year
              </label>
              <input
                id="edu-grad-year"
                type="number"
                min={1980}
                max={maxYear}
                step={1}
                disabled={form.graduation_na}
                placeholder="e.g. 2022"
                value={form.graduation_year}
                onChange={(e) => {
                  setForm((p) => ({ ...p, graduation_year: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-grad-percent"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Percentage (%)
              </label>
              <input
                id="edu-grad-percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                disabled={form.graduation_na}
                placeholder="e.g. 76.50"
                value={form.graduation_percent}
                onChange={(e) => {
                  setForm((p) => ({
                    ...p,
                    graduation_percent: e.target.value,
                  }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="edu-grad-uni"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                University
              </label>
              <input
                id="edu-grad-uni"
                type="text"
                disabled={form.graduation_na}
                placeholder="e.g. Savitribai Phule Pune University"
                value={form.graduation_university}
                onChange={(e) => {
                  setForm((p) => ({
                    ...p,
                    graduation_university: e.target.value,
                  }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* 5. Post Graduation */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              5. Post graduation
            </h3>
            <NotApplicableSwitch
              id="edu-pg-na"
              label="Not applicable"
              checked={form.pg_na}
              onChange={handleTogglePgNa}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="edu-pg-stream"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Stream
              </label>
              <input
                id="edu-pg-stream"
                type="text"
                disabled={form.pg_na}
                placeholder="e.g. Finance / Analytics"
                value={form.pg_stream}
                onChange={(e) => {
                  setForm((p) => ({ ...p, pg_stream: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-pg-degree"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Degree
              </label>
              <input
                id="edu-pg-degree"
                type="text"
                disabled={form.pg_na}
                placeholder="e.g. MBA / MCA / M.Tech"
                value={form.pg_degree}
                onChange={(e) => {
                  setForm((p) => ({ ...p, pg_degree: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-pg-year"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Passing year
              </label>
              <input
                id="edu-pg-year"
                type="number"
                min={1980}
                max={maxYear}
                step={1}
                disabled={form.pg_na}
                placeholder="e.g. 2024"
                value={form.pg_year}
                onChange={(e) => {
                  setForm((p) => ({ ...p, pg_year: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="edu-pg-percent"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Percentage (%)
              </label>
              <input
                id="edu-pg-percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                disabled={form.pg_na}
                placeholder="e.g. 81.00"
                value={form.pg_percent}
                onChange={(e) => {
                  setForm((p) => ({ ...p, pg_percent: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="edu-pg-uni"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                University
              </label>
              <input
                id="edu-pg-uni"
                type="text"
                disabled={form.pg_na}
                placeholder="e.g. Mumbai University"
                value={form.pg_university}
                onChange={(e) => {
                  setForm((p) => ({ ...p, pg_university: e.target.value }));
                  if (error) setError(null);
                }}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800"
          >
            {successMsg}
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving
              ? 'Saving…'
              : education
                ? 'Update Education Details'
                : 'Save Education Details'}
          </button>
        </div>
      </form>
    </section>
  );
}

interface CandidateWorkCardProps {
  candidateId: string;
  work: CandidateWork | null;
  onRefresh: () => Promise<void>;
}

export function CandidateWorkCard({
  candidateId,
  work,
  onRefresh,
}: CandidateWorkCardProps) {
  const [workType, setWorkType] = useState<WorkTypeValue>(
    work?.work_type ?? 'fresher',
  );
  const [totalExp, setTotalExp] = useState(
    work?.total_exp_years != null ? String(work.total_exp_years) : '',
  );
  const [sapConsExp, setSapConsExp] = useState(
    work?.sap_consultant_exp_years != null
      ? String(work.sap_consultant_exp_years)
      : '',
  );
  const [sapUserExp, setSapUserExp] = useState(
    work?.sap_end_user_exp_years != null
      ? String(work.sap_end_user_exp_years)
      : '',
  );
  const [domainExp, setDomainExp] = useState(
    work?.relevant_domain_exp_years != null
      ? String(work.relevant_domain_exp_years)
      : '',
  );
  const [currentCtc, setCurrentCtc] = useState(
    work?.current_ctc_lakhs != null ? String(work.current_ctc_lakhs) : '',
  );
  const [noticeMonths, setNoticeMonths] = useState(
    work?.notice_period_months != null
      ? String(work.notice_period_months)
      : '',
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setWorkType(work?.work_type ?? 'fresher');
    setTotalExp(
      work?.total_exp_years != null ? String(work.total_exp_years) : '',
    );
    setSapConsExp(
      work?.sap_consultant_exp_years != null
        ? String(work.sap_consultant_exp_years)
        : '',
    );
    setSapUserExp(
      work?.sap_end_user_exp_years != null
        ? String(work.sap_end_user_exp_years)
        : '',
    );
    setDomainExp(
      work?.relevant_domain_exp_years != null
        ? String(work.relevant_domain_exp_years)
        : '',
    );
    setCurrentCtc(
      work?.current_ctc_lakhs != null ? String(work.current_ctc_lakhs) : '',
    );
    setNoticeMonths(
      work?.notice_period_months != null
        ? String(work.notice_period_months)
        : '',
    );
  }, [work]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    const check = validateAndBuildWorkPayload(candidateId, {
      work_type: workType,
      total_exp_years: totalExp,
      sap_consultant_exp_years: sapConsExp,
      sap_end_user_exp_years: sapUserExp,
      relevant_domain_exp_years: domainExp,
      current_ctc_lakhs: currentCtc,
      notice_period_months: noticeMonths,
    });

    if (!check.ok) {
      setError(check.error);
      setSuccessMsg(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const { error: upsertErr } = await client
      .from('candidate_work')
      .upsert(check.payload, { onConflict: 'candidate_id' });

    setSaving(false);

    if (upsertErr) {
      setError(formatDbError(upsertErr));
      return;
    }

    setSuccessMsg('Work background saved.');
    await onRefresh();
  };

  const inputClass =
    'w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600';

  return (
    <section
      aria-labelledby="onboarding-work-heading"
      className="p-5 sm:p-6 bg-white border border-slate-200 rounded-xl space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#E6F6F6] text-[#0B7C7C] flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div>
            <h2
              id="onboarding-work-heading"
              className="text-base font-semibold text-slate-900"
            >
              Work background
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Indicate whether you are a fresher or a working professional.
            </p>
          </div>
        </div>

        {work ? <DoneBadge /> : <PendingBadge />}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Work Type Choice */}
        <div
          role="radiogroup"
          aria-label="Work background type"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {(
            [
              {
                value: 'fresher',
                label: 'Fresher',
                desc: 'No prior full-time industry experience',
              },
              {
                value: 'professional',
                label: 'Working professional',
                desc: 'Prior SAP, IT, or domain work experience',
              },
            ] as Array<{ value: WorkTypeValue; label: string; desc: string }>
          ).map((opt) => {
            const selected = workType === opt.value;
            return (
              <label
                key={opt.value}
                className={`p-4 border rounded-xl cursor-pointer transition-colors flex items-start gap-3 ${
                  selected
                    ? 'border-[#0FA3A3] bg-[#E6F6F6]/60 dark:bg-[#12294A]'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 dark:bg-[#0B1220] dark:hover:bg-[#16213A]'
                }`}
              >
                <input
                  type="radio"
                  name="candidate-work-type"
                  value={opt.value}
                  checked={selected}
                  onChange={() => {
                    setWorkType(opt.value);
                    if (error) setError(null);
                    if (successMsg) setSuccessMsg(null);
                  }}
                  className="mt-1 h-4 w-4 text-[#0FA3A3] border-slate-300 focus:ring-[#0FA3A3]"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-900">
                    {opt.label}
                  </span>
                  <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Professional Fields */}
        {workType === 'professional' && (
          <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-4">
            <p className="text-xs text-slate-500">
              Experience values accept 0.5-year increments between 0 and 60
              years. Individual experiences cannot exceed total experience.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="work-total-exp"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Total experience (years)
                </label>
                <input
                  id="work-total-exp"
                  type="number"
                  min={0}
                  max={60}
                  step="0.5"
                  placeholder="e.g. 4.5"
                  value={totalExp}
                  onChange={(e) => {
                    setTotalExp(e.target.value);
                    if (error) setError(null);
                  }}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="work-sap-cons-exp"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  SAP consultant experience (years)
                </label>
                <input
                  id="work-sap-cons-exp"
                  type="number"
                  min={0}
                  max={60}
                  step="0.5"
                  placeholder="e.g. 1.5"
                  value={sapConsExp}
                  onChange={(e) => {
                    setSapConsExp(e.target.value);
                    if (error) setError(null);
                  }}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="work-sap-user-exp"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  SAP end-user experience (years)
                </label>
                <input
                  id="work-sap-user-exp"
                  type="number"
                  min={0}
                  max={60}
                  step="0.5"
                  placeholder="e.g. 2.0"
                  value={sapUserExp}
                  onChange={(e) => {
                    setSapUserExp(e.target.value);
                    if (error) setError(null);
                  }}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="work-domain-exp"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Relevant domain experience (years)
                </label>
                <input
                  id="work-domain-exp"
                  type="number"
                  min={0}
                  max={60}
                  step="0.5"
                  placeholder="e.g. 3.0"
                  value={domainExp}
                  onChange={(e) => {
                    setDomainExp(e.target.value);
                    if (error) setError(null);
                  }}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="work-current-ctc"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Current CTC (₹ LPA)
                </label>
                <input
                  id="work-current-ctc"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 8.5"
                  value={currentCtc}
                  onChange={(e) => {
                    setCurrentCtc(e.target.value);
                    if (error) setError(null);
                  }}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="work-notice-period"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Notice period (months, 0–12)
                </label>
                <input
                  id="work-notice-period"
                  type="number"
                  min={0}
                  max={12}
                  step={1}
                  placeholder="e.g. 2"
                  value={noticeMonths}
                  onChange={(e) => {
                    setNoticeMonths(e.target.value);
                    if (error) setError(null);
                  }}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800"
          >
            {successMsg}
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving
              ? 'Saving…'
              : work
                ? 'Update Work Background'
                : 'Save Work Background'}
          </button>
        </div>
      </form>
    </section>
  );
}

interface CandidateCvCardProps {
  candidateId: string;
  cv: CandidateCv | null;
  onViewCv: (storagePath: string, title: string) => void;
  onRefresh: () => Promise<void>;
}

export function CandidateCvCard({
  candidateId,
  cv,
  onViewCv,
  onRefresh,
}: CandidateCvCardProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const performCvUpload = async (file: File) => {
    const client = supabase;
    if (!client) return;

    const validation = validateAndBuildCvUpload(candidateId, file);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setUploading(true);
    setError(null);
    setRetryFile(file);

    const oldStoragePath = cv?.storage_path ?? null;

    // 1. Upload new file with upsert: false
    const { error: uploadErr } = await client.storage
      .from(CANDIDATE_DOCS_BUCKET)
      .upload(validation.storagePath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadErr) {
      setUploading(false);
      setError(formatDbError(uploadErr));
      return;
    }

    // 2. Insert or update candidate_cv row
    if (cv) {
      const { error: updateErr } = await client
        .from('candidate_cv')
        .update({
          storage_path: validation.storagePath,
          file_name: validation.fileName,
        })
        .eq('candidate_id', candidateId);

      if (updateErr) {
        setUploading(false);
        setError(formatDbError(updateErr));
        return;
      }

      // 3. Delete old file from storage (ignore errors if delete fails)
      if (oldStoragePath && oldStoragePath !== validation.storagePath) {
        try {
          await client.storage
            .from(CANDIDATE_DOCS_BUCKET)
            .remove([oldStoragePath]);
        } catch {
          // Ignore storage cleanup errors
        }
      }
    } else {
      const { error: insertErr } = await client.from('candidate_cv').insert({
        candidate_id: candidateId,
        storage_path: validation.storagePath,
        file_name: validation.fileName,
      });

      if (insertErr) {
        setUploading(false);
        setError(formatDbError(insertErr));
        return;
      }
    }

    setUploading(false);
    setRetryFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    await onRefresh();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void performCvUpload(file);
  };

  return (
    <section
      aria-labelledby="onboarding-cv-heading"
      className="p-5 sm:p-6 bg-white border border-slate-200 rounded-xl space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#E6F6F6] text-[#0B7C7C] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div>
            <h2
              id="onboarding-cv-heading"
              className="text-base font-semibold text-slate-900"
            >
              CV
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload your latest CV or resume (PDF, DOC, or DOCX, max 5 MB).
            </p>
          </div>
        </div>

        {cv ? <DoneBadge /> : <PendingBadge />}
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50/80 border border-red-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <p className="text-xs text-red-800">{error}</p>
          {retryFile && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => void performCvUpload(retryFile)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors self-start sm:self-center whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Upload
            </button>
          )}
        </div>
      )}

      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-600 min-w-0">
          {cv ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 truncate max-w-full">
              <FileText className="w-3.5 h-3.5 text-[#0B7C7C] shrink-0" />
              <span className="truncate">{cv.file_name}</span>
            </span>
          ) : (
            <span className="text-slate-500">
              Accepted formats: PDF, DOC, DOCX · Max 5 MB
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {cv?.storage_path && (
            <button
              type="button"
              onClick={() => onViewCv(cv.storage_path, cv.file_name || 'Candidate CV')}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              View
            </button>
          )}

          <input
            ref={fileInputRef}
            id="candidate-cv-upload"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={uploading}
            onChange={handleFileChange}
            className="sr-only"
          />

          <label
            htmlFor="candidate-cv-upload"
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap select-none ${
              uploading
                ? 'bg-blue-400 text-white cursor-wait'
                : 'bg-blue-700 hover:bg-blue-800 text-white dark:bg-[#0FA3A3] dark:hover:bg-[#0B8A8A] dark:text-[#081629] dark:font-semibold cursor-pointer'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>
              {uploading ? 'Uploading…' : cv ? 'Replace CV' : 'Upload CV'}
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
