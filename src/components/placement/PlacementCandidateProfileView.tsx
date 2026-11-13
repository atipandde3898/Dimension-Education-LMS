import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Mail,
  Phone,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CandidateProfileFull } from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  SIGNED_URL_EXPIRY_SECONDS,
  formatCandidateStatusLabel,
  formatCtcLakhs,
  formatDbError,
  getInitials,
} from '../../utils/domain';
import { DocumentPreviewModal } from '../ui/DocumentWidgets';

interface PlacementCandidateProfileViewProps {
  candidate: CandidateProfileFull;
  onBack: () => void;
}

const STAGE_STYLES: Record<CandidateProfileFull['stage'], string> = {
  enrolled: 'text-[#C98A0B] bg-[#FDF4E0] border-[#F6DEAA]',
  in_training: 'text-[#1F9D6B] bg-[#E7F6EF] border-[#BCE8D3]',
  certified: 'text-[#2F6FB0] bg-[#E8F0FA] border-[#BFD7F2]',
  dropped: 'text-[#C2413B] bg-[#FBEAE9] border-[#F4C5C2]',
};

export function PlacementCandidateProfileView({
  candidate,
  onBack,
}: PlacementCandidateProfileViewProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [previewCvOpen, setPreviewCvOpen] = useState(false);
  const [downloadingCv, setDownloadingCv] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  const loadPhotoSignedUrl = useCallback(async () => {
    const client = supabase;
    if (!client || !candidate.photo_path) {
      setPhotoUrl(null);
      return;
    }
    setPhotoFailed(false);
    const { data, error } = await client.storage
      .from(CANDIDATE_DOCS_BUCKET)
      .createSignedUrl(candidate.photo_path, SIGNED_URL_EXPIRY_SECONDS);
    if (error || !data?.signedUrl) {
      setPhotoUrl(null);
      return;
    }
    setPhotoUrl(data.signedUrl);
  }, [candidate.photo_path]);

  useEffect(() => {
    void loadPhotoSignedUrl();
  }, [loadPhotoSignedUrl]);

  const handleDownloadCv = async () => {
    const client = supabase;
    if (!client || !candidate.cv_path) return;
    setDownloadingCv(true);
    setCvError(null);

    const { data, error } = await client.storage
      .from(CANDIDATE_DOCS_BUCKET)
      .createSignedUrl(candidate.cv_path, SIGNED_URL_EXPIRY_SECONDS, {
        download: candidate.cv_file_name || true,
      });

    setDownloadingCv(false);

    if (error || !data?.signedUrl) {
      setCvError(
        formatDbError(error ?? 'Could not generate a download link for the CV.'),
      );
      return;
    }

    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = candidate.cv_file_name || `${candidate.candidate_code}-cv`;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const initials = getInitials(candidate.full_name);

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5B6B7F] hover:text-[#0B1F3A] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Candidates
      </button>

      {/* Candidate Hero Card */}
      <section className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          {photoUrl && !photoFailed ? (
            <img
              src={photoUrl}
              alt={candidate.full_name}
              onError={() => setPhotoFailed(true)}
              className="w-20 h-20 rounded-xl object-cover border-2 border-[#E3E9F0] shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-[#E6F6F6] border-2 border-[#0FA3A3]/40 flex items-center justify-center text-2xl font-bold font-display text-[#0B7C7C] shrink-0 select-none">
              {initials}
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="font-mono font-semibold text-[#0B7C7C] bg-[#E6F6F6] px-2 py-0.5 rounded tabular-nums">
                {candidate.candidate_code}
              </span>
              <span
                className={`px-2.5 py-0.5 font-medium border rounded-md ${STAGE_STYLES[candidate.stage]}`}
              >
                {formatCandidateStatusLabel(candidate.stage)}
              </span>
              {candidate.certification_code && (
                <span className="font-mono font-medium text-xs px-2.5 py-0.5 bg-[#E8F0FA] text-[#2F6FB0] border border-[#BFD7F2] rounded-md tabular-nums">
                  Cert: {candidate.certification_code}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold font-display text-[#0B1F3A] tracking-tight">
              {candidate.full_name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[#5B6B7F]">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#0B7C7C]" />
                {candidate.email}
              </span>
              {candidate.phone && (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
                  <Phone className="w-3.5 h-3.5 text-[#0B7C7C]" />
                  {candidate.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-5 border-t border-[#E3E9F0] text-sm">
          <div>
            <dt className="text-xs text-[#5B6B7F]">Program</dt>
            <dd className="mt-0.5 font-medium text-[#0B1F3A]">
              {candidate.program || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#5B6B7F]">Module</dt>
            <dd className="mt-0.5 font-medium text-[#0B1F3A]">
              {candidate.module || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#5B6B7F]">Batch</dt>
            <dd className="mt-0.5 font-mono font-medium text-[#0B1F3A] tabular-nums">
              {candidate.batch_code || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#5B6B7F]">Certification code</dt>
            <dd className="mt-0.5 font-mono font-medium text-[#0B1F3A] tabular-nums">
              {candidate.certification_code || '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Education Table */}
      <section className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#E3E9F0]">
          <GraduationCap className="w-4 h-4 text-[#0B7C7C]" />
          <h2 className="text-base font-bold font-display text-[#0B1F3A]">
            Education
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#F5F8FB] border-b border-[#E3E9F0]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5B6B7F]">
                  Level
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5B6B7F]">
                  Degree / Stream
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5B6B7F]">
                  University
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-[#5B6B7F]">
                  Year
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-[#5B6B7F]">
                  Percentage
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E9F0]">
              <tr>
                <td className="px-4 py-3 font-medium text-[#0B1F3A] whitespace-nowrap">
                  SSC (10th)
                </td>
                <td className="px-4 py-3 text-[#5B6B7F]">—</td>
                <td className="px-4 py-3 text-[#5B6B7F]">—</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                  {candidate.ssc_year ?? '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                  {candidate.ssc_percent != null
                    ? `${candidate.ssc_percent}%`
                    : '—'}
                </td>
              </tr>

              <tr>
                <td className="px-4 py-3 font-medium text-[#0B1F3A] whitespace-nowrap">
                  HSC (12th)
                </td>
                {candidate.hsc_na ? (
                  <td colSpan={4} className="px-4 py-3 text-xs text-[#5B6B7F]">
                    Not applicable
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-[#5B6B7F]">—</td>
                    <td className="px-4 py-3 text-[#5B6B7F]">—</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {candidate.hsc_year ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {candidate.hsc_percent != null
                        ? `${candidate.hsc_percent}%`
                        : '—'}
                    </td>
                  </>
                )}
              </tr>

              <tr>
                <td className="px-4 py-3 font-medium text-[#0B1F3A] whitespace-nowrap">
                  Engineering diploma
                </td>
                {candidate.diploma_na ? (
                  <td colSpan={4} className="px-4 py-3 text-xs text-[#5B6B7F]">
                    Not applicable
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-[#0B1F3A]">
                      {candidate.diploma_stream || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#5B6B7F]">—</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {candidate.diploma_year ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {candidate.diploma_percent != null
                        ? `${candidate.diploma_percent}%`
                        : '—'}
                    </td>
                  </>
                )}
              </tr>

              <tr>
                <td className="px-4 py-3 font-medium text-[#0B1F3A] whitespace-nowrap">
                  Graduation
                </td>
                {candidate.graduation_na ? (
                  <td colSpan={4} className="px-4 py-3 text-xs text-[#5B6B7F]">
                    Not applicable
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-[#0B1F3A]">
                      {[candidate.graduation_degree, candidate.graduation_stream]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#5B6B7F]">
                      {candidate.graduation_university || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {candidate.graduation_year ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {candidate.graduation_percent != null
                        ? `${candidate.graduation_percent}%`
                        : '—'}
                    </td>
                  </>
                )}
              </tr>

              <tr>
                <td className="px-4 py-3 font-medium text-[#0B1F3A] whitespace-nowrap">
                  Post graduation
                </td>
                {candidate.pg_na ? (
                  <td colSpan={4} className="px-4 py-3 text-xs text-[#5B6B7F]">
                    Not applicable
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-[#0B1F3A]">
                      {[candidate.pg_degree, candidate.pg_stream]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#5B6B7F]">
                      {candidate.pg_university || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {candidate.pg_year ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {candidate.pg_percent != null
                        ? `${candidate.pg_percent}%`
                        : '—'}
                    </td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Work Background */}
      <section className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E3E9F0]">
          <div className="flex items-center gap-2.5">
            <Briefcase className="w-4 h-4 text-[#0B7C7C]" />
            <h2 className="text-base font-bold font-display text-[#0B1F3A]">
              Work Background
            </h2>
          </div>
          {candidate.work_type && (
            <span className="px-2.5 py-1 text-xs font-medium bg-[#E6F6F6] text-[#0B7C7C] rounded-md">
              {candidate.work_type === 'fresher'
                ? 'Fresher'
                : 'Working professional'}
            </span>
          )}
        </div>

        {!candidate.work_type ? (
          <p className="text-xs text-[#5B6B7F]">
            Work background not submitted yet.
          </p>
        ) : candidate.work_type === 'fresher' ? (
          <p className="text-sm text-[#0F1B2D]">
            Fresher — no prior full-time work experience.
          </p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg">
              <dt className="text-xs text-[#5B6B7F]">Total experience</dt>
              <dd className="mt-1 font-mono font-semibold text-[#0B1F3A] tabular-nums">
                {candidate.total_exp_years ?? 0} yrs
              </dd>
            </div>
            <div className="p-3 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg">
              <dt className="text-xs text-[#5B6B7F]">
                SAP consultant experience
              </dt>
              <dd className="mt-1 font-mono font-semibold text-[#0B1F3A] tabular-nums">
                {candidate.sap_consultant_exp_years ?? 0} yrs
              </dd>
            </div>
            <div className="p-3 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg">
              <dt className="text-xs text-[#5B6B7F]">
                SAP end-user experience
              </dt>
              <dd className="mt-1 font-mono font-semibold text-[#0B1F3A] tabular-nums">
                {candidate.sap_end_user_exp_years ?? 0} yrs
              </dd>
            </div>
            <div className="p-3 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg">
              <dt className="text-xs text-[#5B6B7F]">
                Relevant domain experience
              </dt>
              <dd className="mt-1 font-mono font-semibold text-[#0B1F3A] tabular-nums">
                {candidate.relevant_domain_exp_years ?? 0} yrs
              </dd>
            </div>
            <div className="p-3 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg">
              <dt className="text-xs text-[#5B6B7F]">Current CTC</dt>
              <dd className="mt-1 font-mono font-semibold text-[#0B1F3A] tabular-nums">
                {formatCtcLakhs(candidate.current_ctc_lakhs)}
              </dd>
            </div>
            <div className="p-3 bg-[#F5F8FB] border border-[#E3E9F0] rounded-lg">
              <dt className="text-xs text-[#5B6B7F]">Notice period</dt>
              <dd className="mt-1 font-mono font-semibold text-[#0B1F3A] tabular-nums">
                {candidate.notice_period_months != null
                  ? `${candidate.notice_period_months} month${candidate.notice_period_months === 1 ? '' : 's'}`
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {/* CV Section */}
      <section className="p-6 bg-white border border-[#E3E9F0] rounded-xl shadow-soft space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#E3E9F0]">
          <FileText className="w-4 h-4 text-[#0B7C7C]" />
          <h2 className="text-base font-bold font-display text-[#0B1F3A]">
            CV / Resume
          </h2>
        </div>

        {cvError && (
          <div
            role="alert"
            className="p-3 bg-[#FBEAE9] border border-[#F4C5C2] rounded-lg text-xs text-[#C2413B]"
          >
            {cvError}
          </div>
        )}

        {!candidate.cv_path ? (
          <p className="text-xs text-[#5B6B7F]">CV not uploaded yet.</p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-[#0B7C7C] shrink-0" />
              <span className="text-sm font-medium text-[#0B1F3A] truncate">
                {candidate.cv_file_name || 'Candidate CV'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewCvOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                View
              </button>
              <button
                type="button"
                disabled={downloadingCv}
                onClick={() => void handleDownloadCv()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-[#0FA3A3]" />
                {downloadingCv ? 'Preparing…' : 'Download'}
              </button>
            </div>
          </div>
        )}
      </section>

      <DocumentPreviewModal
        open={previewCvOpen}
        storagePath={candidate.cv_path}
        bucketName={CANDIDATE_DOCS_BUCKET}
        title={`CV — ${candidate.cv_file_name || candidate.full_name}`}
        subtitle={`${candidate.full_name} (${candidate.candidate_code})`}
        onClose={() => setPreviewCvOpen(false)}
      />
    </div>
  );
}
