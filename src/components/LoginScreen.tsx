import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatDbError } from '../utils/domain';

interface LoginScreenProps {
  externalError?: string | null;
  onNavigateResetPassword?: () => void;
}

export function LoginScreen({
  externalError,
}: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      setError(formatDbError(signInError));
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Intentionally suppress specific failure to not leak account existence
    }

    // Always show the exact requested message:
    // "If an account exists for this email, a reset link has been sent."
    setForgotSent(true);
    setSubmitting(false);
  };

  const displayError = error || externalError;

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-7">
          <p className="text-xs font-semibold text-blue-700 tracking-tight">
            CohortDesk
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold text-slate-900 tracking-tight">
            {mode === 'login' ? 'Sign in to Institute Portal' : 'Reset your password'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'login'
              ? 'Enter your institute email and password to continue.'
              : 'Enter your email to receive a password reset link.'}
          </p>
        </div>

        {displayError && (
          <div
            role="alert"
            className="mb-5 p-3.5 bg-red-50/80 border border-red-200 rounded-lg text-sm text-red-800"
          >
            {displayError}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleSubmitLogin} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@institute.edu"
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setForgotSent(false);
                    setForgotEmail(email);
                    setMode('forgot');
                  }}
                  className="text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {forgotSent ? (
              <div
                role="status"
                className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900 space-y-3"
              >
                <p className="font-semibold text-emerald-950">Reset link sent</p>
                <p>If an account exists for this email, a reset link has been sent.</p>
                <p className="text-xs text-emerald-800">
                  Check your inbox and click the link to choose a new password.
                </p>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Account email address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@institute.edu"
                    className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-60"
                  >
                    {submitting ? 'Sending reset link…' : 'Send reset link'}
                  </button>
                </div>
              </form>
            )}

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setForgotSent(false);
                  setMode('login');
                }}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
              >
                Back to sign in
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
          Staff, SME, counsellor, and candidate accounts are provisioned by your
          institute administrator.
        </p>
      </div>
    </main>
  );
}
