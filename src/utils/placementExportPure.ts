import type {
  CandidateProfileFull,
  OpportunityResponse,
} from '../types/database';
import {
  formatCandidateStatusLabel,
  formatDate,
  formatLocalIsoDate,
  formatPipelineStageLabel,
} from './domain';

export function sanitizeFileSlug(raw: string, fallback = 'file'): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

export function buildCandidatePdfSheetFilename(
  candidateCode: string,
  fullName: string,
): string {
  const codeSlug = sanitizeFileSlug(candidateCode, 'candidate');
  const nameSlug = sanitizeFileSlug(fullName, 'profile');
  return `${codeSlug}-${nameSlug}.pdf`;
}

export function buildInterestedZipFilename(
  company: string,
  dateInput: Date | string = new Date(),
): string {
  const companySlug = sanitizeFileSlug(company, 'company').toLowerCase();
  const isoStr =
    dateInput instanceof Date ? formatLocalIsoDate(dateInput) : dateInput;
  const datePart = formatDate(isoStr).replace(/[^a-zA-Z0-9-]+/g, '-');
  return `interested-${companySlug}-${datePart}.zip`;
}

export function buildInterestedExcelFilename(
  company: string,
  dateInput: Date | string = new Date(),
): string {
  const companySlug = sanitizeFileSlug(company, 'company').toLowerCase();
  const isoStr =
    dateInput instanceof Date ? formatLocalIsoDate(dateInput) : dateInput;
  const datePart = formatDate(isoStr).replace(/[^a-zA-Z0-9-]+/g, '-');
  return `interested-${companySlug}-${datePart}.xlsx`;
}

export const INTERESTED_CANDIDATES_EXCEL_HEADERS = [
  'Candidate Code',
  'Name',
  'Email',
  'Phone',
  'Module',
  'Stage',
  'SSC Year',
  'SSC (%)',
  'HSC Year',
  'HSC (%)',
  'Diploma Stream',
  'Diploma Year',
  'Diploma (%)',
  'Graduation Stream',
  'Graduation Degree',
  'Graduation Year',
  'Graduation (%)',
  'Graduation University',
  'PG Stream',
  'PG Degree',
  'PG Year',
  'PG (%)',
  'PG University',
  'Work Type',
  'Total Experience (years)',
  'SAP Consultant Experience (years)',
  'SAP End User Experience (years)',
  'Relevant Domain Experience (years)',
  'Current CTC (lakhs)',
  'Notice Period (months)',
  'Response Date',
  'Pipeline Stage',
] as const;

export type InterestedCandidateExcelRow = Record<
  (typeof INTERESTED_CANDIDATES_EXCEL_HEADERS)[number],
  string | number
>;

/**
 * Pure helper building one SheetJS row per interested candidate with exact units in header names
 * and DD-MMM-YYYY dates. Never emits PAN, fees, payments, or consent fields.
 */
export function buildInterestedCandidatesExcelRows(
  responses: ReadonlyArray<OpportunityResponse>,
  profilesByCandidateId: Map<string, CandidateProfileFull>,
): InterestedCandidateExcelRow[] {
  return responses.map((resp) => {
    const p = profilesByCandidateId.get(resp.candidate_id);

    const hscNa = p?.hsc_na === true;
    const dipNa = p?.diploma_na === true;
    const gradNa = p?.graduation_na === true;
    const pgNa = p?.pg_na === true;
    const isFresher = p?.work_type === 'fresher';

    return {
      'Candidate Code': p?.candidate_code || resp.candidate_code || '',
      Name: p?.full_name || resp.full_name || '',
      Email: p?.email || resp.email || '',
      Phone: p?.phone || resp.phone || '—',
      Module: p?.module || resp.module || '—',
      Stage: formatCandidateStatusLabel(p?.stage || resp.stage),
      'SSC Year': p?.ssc_year ?? '—',
      'SSC (%)': p?.ssc_percent ?? '—',
      'HSC Year': hscNa ? 'NA' : (p?.hsc_year ?? '—'),
      'HSC (%)': hscNa ? 'NA' : (p?.hsc_percent ?? '—'),
      'Diploma Stream': dipNa ? 'NA' : (p?.diploma_stream || '—'),
      'Diploma Year': dipNa ? 'NA' : (p?.diploma_year ?? '—'),
      'Diploma (%)': dipNa ? 'NA' : (p?.diploma_percent ?? '—'),
      'Graduation Stream': gradNa ? 'NA' : (p?.graduation_stream || '—'),
      'Graduation Degree': gradNa ? 'NA' : (p?.graduation_degree || '—'),
      'Graduation Year': gradNa ? 'NA' : (p?.graduation_year ?? '—'),
      'Graduation (%)': gradNa ? 'NA' : (p?.graduation_percent ?? '—'),
      'Graduation University': gradNa
        ? 'NA'
        : (p?.graduation_university || '—'),
      'PG Stream': pgNa ? 'NA' : (p?.pg_stream || '—'),
      'PG Degree': pgNa ? 'NA' : (p?.pg_degree || '—'),
      'PG Year': pgNa ? 'NA' : (p?.pg_year ?? '—'),
      'PG (%)': pgNa ? 'NA' : (p?.pg_percent ?? '—'),
      'PG University': pgNa ? 'NA' : (p?.pg_university || '—'),
      'Work Type':
        p?.work_type === 'fresher'
          ? 'Fresher'
          : p?.work_type === 'professional'
            ? 'Working professional'
            : '—',
      'Total Experience (years)': isFresher
        ? 0
        : (p?.total_exp_years ?? '—'),
      'SAP Consultant Experience (years)': isFresher
        ? 0
        : (p?.sap_consultant_exp_years ?? '—'),
      'SAP End User Experience (years)': isFresher
        ? 0
        : (p?.sap_end_user_exp_years ?? '—'),
      'Relevant Domain Experience (years)': isFresher
        ? 0
        : (p?.relevant_domain_exp_years ?? '—'),
      'Current CTC (lakhs)': isFresher ? 0 : (p?.current_ctc_lakhs ?? '—'),
      'Notice Period (months)': isFresher
        ? 0
        : (p?.notice_period_months ?? '—'),
      'Response Date': resp.responded_at ? formatDate(resp.responded_at) : '—',
      'Pipeline Stage': resp.pipeline_stage
        ? formatPipelineStageLabel(resp.pipeline_stage)
        : '—',
    };
  });
}
