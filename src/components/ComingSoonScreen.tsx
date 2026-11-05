import { LogOut } from 'lucide-react';
import type { Profile } from '../types/database';

interface ComingSoonScreenProps {
  profile: Profile | null;
  userEmail?: string;
  mode: 'coming_soon' | 'inactive' | 'missing_profile';
  onLogout: () => void;
  loggingOut?: boolean;
}

const ROLE_LABELS: Record<Profile['role'], string> = {
  admin: 'Administrator',
  candidate: 'Candidate',
  sme: 'Subject Matter Expert (SME)',
  counsellor: 'Academic Counsellor',
};

const ROLE_DESCRIPTIONS: Record<Profile['role'], string> = {
  admin: 'administrator',
  candidate: 'candidate',
  sme: 'Subject Matter Expert (SME)',
  counsellor: 'academic counsellor',
};

export function ComingSoonScreen({
  profile,
  userEmail,
  mode,
  onLogout,
  loggingOut = false,
}: ComingSoonScreenProps) {
  const roleTitle = profile ? ROLE_LABELS[profile.role] : 'Portal';
  const roleDescription = profile ? ROLE_DESCRIPTIONS[profile.role] : 'user';

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-slate-200">
        <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          CohortDesk
        </span>

        <div className="text-xs text-slate-500 truncate">
          {profile?.email || userEmail || ''}
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-8 text-center">
          {mode === 'coming_soon' && profile && (
            <>
              <p className="text-xs font-medium text-blue-700">
                {roleTitle} Workspace
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900 tracking-tight">
                Coming Soon
              </h1>
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
                Welcome,{' '}
                <span className="font-medium text-slate-900">
                  {profile.full_name || profile.email}
                </span>
                . The dedicated {roleDescription} portal is currently in
                development. Please reach out to your institute administrator
                for schedule or onboarding updates.
              </p>
            </>
          )}

          {mode === 'inactive' && (
            <>
              <p className="text-xs font-medium text-amber-700">
                Account Status
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900 tracking-tight">
                Account Inactive
              </h1>
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
                Your profile has been marked as inactive. Please contact your
                institute administrator if you need access restored.
              </p>
            </>
          )}

          {mode === 'missing_profile' && (
            <>
              <p className="text-xs font-medium text-amber-700">Account Setup</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900 tracking-tight">
                Profile Not Found
              </h1>
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
                Your login succeeded, but no matching record was found in{' '}
                <code className="font-mono text-xs text-slate-800">
                  profiles
                </code>
                . Ask an administrator to verify your account profile and role.
              </p>
            </>
          )}

          <div className="mt-7 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              Signed in as{' '}
              <span className="font-medium text-slate-700">
                {profile?.email || userEmail || 'authenticated user'}
              </span>
            </span>
            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <LogOut className="w-3.5 h-3.5" />
              {loggingOut ? 'Signing out…' : 'Log out'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
