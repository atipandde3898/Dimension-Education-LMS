import { ShieldCheck, User } from 'lucide-react';
import type { CandidateOverview, Profile } from '../../types/database';

interface CandidateProfileViewProps {
  overview: CandidateOverview;
  profile: Profile;
  maskedPan: string | null;
}

const STATUS_TEXT_CLASS: Record<CandidateOverview['status'], string> = {
  onboarding: 'text-amber-700 bg-amber-50 border-amber-200',
  active: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  completed: 'text-blue-700 bg-blue-50 border-blue-200',
  dropped: 'text-red-700 bg-red-50 border-red-200',
};

export function CandidateProfileView({
  overview,
  profile,
  maskedPan,
}: CandidateProfileViewProps) {
  const name = overview.full_name || profile.full_name || 'Candidate';
  const email = overview.email || profile.email;
  const phone = overview.phone || profile.phone || '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          My Profile
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Your official candidate record, academic enrollment, and cohort assignment.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {/* Profile Header */}
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{name}</h2>
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                Candidate Code: {overview.candidate_code}
              </p>
            </div>
          </div>

          <div className="self-start sm:self-auto">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                STATUS_TEXT_CLASS[overview.status]
              }`}
            >
              {overview.status}
            </span>
          </div>
        </div>

        {/* Profile Details Grid */}
        <div className="p-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Candidate &amp; Contact Details
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm mb-8">
            <div>
              <dt className="text-xs text-slate-500 font-medium">Full Name</dt>
              <dd className="mt-1 font-medium text-slate-900">{name}</dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500 font-medium">Email Address</dt>
              <dd className="mt-1 font-medium text-slate-900">{email}</dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500 font-medium">Phone Number</dt>
              <dd className="mt-1 font-mono text-sm text-slate-900 tabular-nums">
                {phone}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500 font-medium">Candidate Code</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-blue-700 tabular-nums">
                {overview.candidate_code}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500 font-medium">Enrollment Status</dt>
              <dd className="mt-1 font-medium capitalize text-slate-900">
                {overview.status}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                PAN Number
              </dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-slate-900 tracking-wider tabular-nums">
                {maskedPan ? maskedPan : <span className="text-slate-400 font-sans font-normal">Not submitted</span>}
              </dd>
            </div>
          </dl>

          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 pt-6 border-t border-slate-100">
            Academic Enrollment &amp; Mentoring
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
            <div>
              <dt className="text-xs text-slate-500 font-medium">Program</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {overview.program || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500 font-medium">Module</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {overview.module || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500 font-medium">Assigned Batch</dt>
              <dd className="mt-1">
                {overview.batch_code ? (
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {overview.batch_code}
                    {overview.batch_mode && (
                      <span className="font-sans font-normal text-xs text-slate-500 capitalize ml-1.5">
                        ({overview.batch_mode})
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400">Not assigned</span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500 font-medium">Academic Counsellor</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {overview.counsellor || '—'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
          Profile details are managed by your institute administrator and assigned counsellor. To request changes to your enrollment or cohort, please contact your counsellor.
        </div>
      </div>
    </div>
  );
}
