import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';
import type {
  CandidateProfileFull,
  OpportunityResponse,
} from '../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  SIGNED_URL_EXPIRY_SECONDS,
  formatCandidateStatusLabel,
  formatCtcLakhs,
  formatDate,
  formatLocalIsoDate,
  formatPipelineStageLabel,
  getInitials,
} from './domain';
import { downloadWorkbookAsExcel } from './excel';
import {
  INTERESTED_CANDIDATES_EXCEL_HEADERS,
  buildCandidatePdfSheetFilename,
  buildInterestedCandidatesExcelRows,
  buildInterestedExcelFilename,
  buildInterestedZipFilename,
  sanitizeFileSlug,
  type InterestedCandidateExcelRow,
} from './placementExportPure';

export {
  INTERESTED_CANDIDATES_EXCEL_HEADERS,
  buildCandidatePdfSheetFilename,
  buildInterestedCandidatesExcelRows,
  buildInterestedExcelFilename,
  buildInterestedZipFilename,
  sanitizeFileSlug,
  type InterestedCandidateExcelRow,
};

async function fetchImageAsJpegDataUrl(
  storagePath: string,
): Promise<string | null> {
  const client = supabase;
  if (!client || !storagePath) return null;

  try {
    const { data, error } = await client.storage
      .from(CANDIDATE_DOCS_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
    if (error || !data?.signedUrl) return null;

    const response = await fetch(data.signedUrl);
    if (!response.ok) return null;
    const blob = await response.blob();

    return await new Promise<string | null>((resolve) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 200;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, size, size);
          // Cover crop square
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          URL.revokeObjectURL(objectUrl);
          resolve(dataUrl);
        } catch {
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };
      img.src = objectUrl;
    });
  } catch {
    return null;
  }
}

function buildCandidateProfilePdfBlob(
  resp: OpportunityResponse,
  profile: CandidateProfileFull | undefined,
  photoDataUrl: string | null,
): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const fullName = profile?.full_name || resp.full_name;
  const code = profile?.candidate_code || resp.candidate_code;
  const email = profile?.email || resp.email;
  const phone = profile?.phone || resp.phone || '—';
  const moduleName = profile?.module || resp.module || '—';
  const stageLabel = formatCandidateStatusLabel(profile?.stage || resp.stage);

  // Top Header Bar (Dimension Education)
  doc.setFillColor(11, 31, 58); // #0B1F3A Navy
  doc.rect(0, 0, pageWidth, 64, 'F');
  doc.setFillColor(15, 163, 163); // #0FA3A3 Teal accent strip
  doc.rect(0, 64, pageWidth, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Dimension Education', margin, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(209, 220, 232);
  doc.text('Candidate Placement Profile', margin, 50);

  doc.setTextColor(230, 246, 246);
  doc.setFontSize(9.5);
  doc.text(
    `Generated ${formatDate(formatLocalIsoDate(new Date()))}`,
    pageWidth - margin,
    40,
    {
      align: 'right',
    },
  );

  // Profile Hero Block
  let y = 92;
  const photoBoxSize = 68;
  if (photoDataUrl) {
    try {
      doc.addImage(photoDataUrl, 'JPEG', margin, y, photoBoxSize, photoBoxSize);
      doc.setDrawColor(227, 233, 240);
      doc.rect(margin, y, photoBoxSize, photoBoxSize);
    } catch {
      photoDataUrl = null;
    }
  }
  if (!photoDataUrl) {
    doc.setFillColor(230, 246, 246);
    doc.setDrawColor(15, 163, 163);
    doc.roundedRect(margin, y, photoBoxSize, photoBoxSize, 8, 8, 'FD');
    doc.setTextColor(11, 124, 124);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(
      getInitials(fullName),
      margin + photoBoxSize / 2,
      y + photoBoxSize / 2 + 7,
      { align: 'center' },
    );
  }

  const infoX = margin + photoBoxSize + 18;
  doc.setTextColor(11, 31, 58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(fullName, infoX, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(11, 124, 124);
  doc.text(`${code}  ·  ${stageLabel}`, infoX, y + 33);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(91, 107, 127);
  doc.text(`Module: ${moduleName}`, infoX, y + 49);
  doc.text(`Email: ${email}   |   Phone: ${phone}`, infoX, y + 64);

  y += photoBoxSize + 24;

  // Helper for Section Heading
  const drawSectionHeading = (title: string) => {
    doc.setFillColor(245, 248, 251);
    doc.setDrawColor(227, 233, 240);
    doc.rect(margin, y, contentWidth, 24, 'FD');
    doc.setTextColor(11, 31, 58);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(title, margin + 10, y + 16);
    y += 32;
  };

  // Education Table
  drawSectionHeading('Education Details');

  const eduRows: Array<[string, string]> = [
    [
      'SSC (10th)',
      profile?.ssc_year != null
        ? `Year: ${profile.ssc_year}   |   Percentage: ${profile.ssc_percent ?? '—'}%`
        : 'Not submitted',
    ],
    [
      'HSC (12th)',
      profile?.hsc_na
        ? 'Not applicable'
        : profile?.hsc_year != null
          ? `Year: ${profile.hsc_year}   |   Percentage: ${profile.hsc_percent ?? '—'}%`
          : 'Not submitted',
    ],
    [
      'Engineering Diploma',
      profile?.diploma_na
        ? 'Not applicable'
        : profile?.diploma_year != null || profile?.diploma_stream
          ? `${profile?.diploma_stream || '—'}   |   Year: ${profile?.diploma_year ?? '—'}   |   ${profile?.diploma_percent ?? '—'}%`
          : 'Not submitted',
    ],
    [
      'Graduation',
      profile?.graduation_na
        ? 'Not applicable'
        : profile?.graduation_degree || profile?.graduation_year != null
          ? `${profile?.graduation_degree || '—'} (${profile?.graduation_stream || '—'})  ·  Year: ${profile?.graduation_year ?? '—'}  ·  ${profile?.graduation_percent ?? '—'}%  ·  ${profile?.graduation_university || '—'}`
          : 'Not submitted',
    ],
    [
      'Post Graduation',
      profile?.pg_na
        ? 'Not applicable'
        : profile?.pg_degree || profile?.pg_year != null
          ? `${profile?.pg_degree || '—'} (${profile?.pg_stream || '—'})  ·  Year: ${profile?.pg_year ?? '—'}  ·  ${profile?.pg_percent ?? '—'}%  ·  ${profile?.pg_university || '—'}`
          : 'Not submitted',
    ],
  ];

  const col1W = 125;
  const col2W = contentWidth - col1W;

  for (const [label, value] of eduRows) {
    const wrapped = doc.splitTextToSize(value, col2W - 16) as string[];
    const rowH = Math.max(22, wrapped.length * 12 + 10);

    doc.setDrawColor(227, 233, 240);
    doc.rect(margin, y, col1W, rowH);
    doc.rect(margin + col1W, y, col2W, rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(91, 107, 127);
    doc.text(label, margin + 8, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(15, 27, 45);
    doc.text(wrapped, margin + col1W + 8, y + 14);

    y += rowH;
  }

  y += 20;

  // Work Background
  drawSectionHeading('Work Background');

  const workLines: Array<[string, string]> =
    profile?.work_type === 'fresher'
      ? [['Work Type', 'Fresher (No prior full-time experience)']]
      : profile?.work_type === 'professional'
        ? [
            ['Work Type', 'Working professional'],
            [
              'Total Experience',
              `${profile.total_exp_years ?? 0} years`,
            ],
            [
              'SAP Consultant Exp',
              `${profile.sap_consultant_exp_years ?? 0} years`,
            ],
            [
              'SAP End-User Exp',
              `${profile.sap_end_user_exp_years ?? 0} years`,
            ],
            [
              'Relevant Domain Exp',
              `${profile.relevant_domain_exp_years ?? 0} years`,
            ],
            ['Current CTC', formatCtcLakhs(profile.current_ctc_lakhs)],
            [
              'Notice Period',
              profile.notice_period_months != null
                ? `${profile.notice_period_months} month${profile.notice_period_months === 1 ? '' : 's'}`
                : '—',
            ],
          ]
        : [['Work Type', 'Not submitted']];

  for (const [label, val] of workLines) {
    doc.setDrawColor(227, 233, 240);
    doc.rect(margin, y, col1W, 22);
    doc.rect(margin + col1W, y, col2W, 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(91, 107, 127);
    doc.text(label, margin + 8, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(15, 27, 45);
    doc.text(val, margin + col1W + 8, y + 14);
    y += 22;
  }

  y += 20;

  // CV & Opportunity Response Summary
  drawSectionHeading('Resume & Opportunity Status');
  const cvName = profile?.cv_file_name || 'Not uploaded';
  const summaryRows: Array<[string, string]> = [
    ['CV File Name', cvName],
    [
      'Opportunity',
      `${resp.company} — ${resp.job_title}`,
    ],
    [
      'Response Date',
      resp.responded_at ? formatDate(resp.responded_at) : '—',
    ],
    [
      'Pipeline Stage',
      resp.pipeline_stage
        ? formatPipelineStageLabel(resp.pipeline_stage)
        : 'Awaiting decision',
    ],
  ];

  for (const [label, val] of summaryRows) {
    const wrapped = doc.splitTextToSize(val, col2W - 16) as string[];
    const rowH = Math.max(22, wrapped.length * 12 + 10);
    doc.setDrawColor(227, 233, 240);
    doc.rect(margin, y, col1W, rowH);
    doc.rect(margin + col1W, y, col2W, rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(91, 107, 127);
    doc.text(label, margin + 8, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(15, 27, 45);
    doc.text(wrapped, margin + col1W + 8, y + 14);
    y += rowH;
  }

  return doc.output('blob');
}

export interface BundleExportProgress {
  completed: number;
  total: number;
  stageLabel: string;
}

export async function exportInterestedCandidatesBundle({
  company,
  responses,
  profiles,
  onProgress,
}: {
  company: string;
  responses: ReadonlyArray<OpportunityResponse>;
  profiles: ReadonlyArray<CandidateProfileFull>;
  onProgress?: (progress: BundleExportProgress) => void;
}): Promise<{ excelFilename: string; zipFilename: string }> {
  if (responses.length === 0) {
    throw new Error('No interested candidates match the selected filter.');
  }

  const profileMap = new Map<string, CandidateProfileFull>();
  for (const p of profiles) {
    profileMap.set(p.candidate_id, p);
  }

  const totalSteps = responses.length + 2;
  onProgress?.({
    completed: 0,
    total: totalSteps,
    stageLabel: 'Preparing Excel workbook…',
  });

  // 1. Create and download Excel workbook
  const today = new Date();
  const excelRows = buildInterestedCandidatesExcelRows(responses, profileMap);
  const excelFilename = buildInterestedExcelFilename(company, today);
  downloadWorkbookAsExcel(
    excelRows,
    'Interested Candidates',
    excelFilename,
    [...INTERESTED_CANDIDATES_EXCEL_HEADERS],
  );

  // 2. Build one PDF profile sheet per interested candidate into JSZip
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < responses.length; i++) {
    const resp = responses[i];
    const profile = profileMap.get(resp.candidate_id);
    onProgress?.({
      completed: i + 1,
      total: totalSteps,
      stageLabel: `Creating PDF for ${profile?.full_name || resp.full_name} (${i + 1}/${responses.length})…`,
    });

    const photoDataUrl = profile?.photo_path
      ? await fetchImageAsJpegDataUrl(profile.photo_path)
      : null;

    const pdfBlob = buildCandidateProfilePdfBlob(resp, profile, photoDataUrl);
    let pdfFilename = buildCandidatePdfSheetFilename(
      profile?.candidate_code || resp.candidate_code,
      profile?.full_name || resp.full_name,
    );
    if (usedNames.has(pdfFilename)) {
      pdfFilename = pdfFilename.replace(/\.pdf$/i, `-${i + 1}.pdf`);
    }
    usedNames.add(pdfFilename);
    zip.file(pdfFilename, pdfBlob);
  }

  onProgress?.({
    completed: responses.length + 1,
    total: totalSteps,
    stageLabel: 'Compressing ZIP archive…',
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = buildInterestedZipFilename(company, today);

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  onProgress?.({
    completed: totalSteps,
    total: totalSteps,
    stageLabel: 'Downloads ready',
  });

  return { excelFilename, zipFilename };
}
