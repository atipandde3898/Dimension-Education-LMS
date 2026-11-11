import type { EnvValidationResult } from '../utils/domain';

interface SetupScreenProps {
  validation: EnvValidationResult;
}

export function SetupScreen({ validation }: SetupScreenProps) {
  const isMissingUrl = validation.missingVars.includes('VITE_SUPABASE_URL');
  const isMissingKey = validation.missingVars.includes('VITE_SUPABASE_ANON_KEY');

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl p-8">
        <div className="pb-5 border-b border-slate-200">
          <p className="text-xs font-semibold text-[#0FA3A3] font-display">Dimension Education</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight font-display">
            Supabase Environment Setup Required
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {validation.reason ??
              'Configure your Supabase project environment variables before launching the candidate onboarding and batch management portal.'}
          </p>
        </div>

        <div className="py-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Required Environment Variables
          </h2>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-medium text-slate-900">
                  VITE_SUPABASE_URL
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Project URL from your Supabase Project Settings &rarr; API
                </p>
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                  isMissingUrl ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {isMissingUrl ? 'Missing' : 'Configured'}
              </span>
            </div>

            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-medium text-slate-900">
                  VITE_SUPABASE_ANON_KEY
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Public anonymous API key enforced by Row Level Security
                </p>
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                  isMissingKey || !validation.valid
                    ? 'text-red-700'
                    : 'text-emerald-700'
                }`}
              >
                {isMissingKey ? 'Missing' : validation.valid ? 'Configured' : 'Invalid'}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-600 leading-relaxed space-y-2 pt-1">
            <p>
              Set <code className="font-mono text-slate-900">VITE_SUPABASE_URL</code>{' '}
              and{' '}
              <code className="font-mono text-slate-900">VITE_SUPABASE_ANON_KEY</code>{' '}
              in your environment configuration, then restart or reload the
              application.
            </p>
            <p className="text-slate-500">
              Security note: Supply only the public <code className="font-mono">anon</code>{' '}
              key. Never configure or expose a <code className="font-mono">service_role</code>{' '}
              key in client environment variables.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
