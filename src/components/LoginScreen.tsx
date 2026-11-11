import React, { useState } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDbError } from '../utils/domain';
import { useTheme } from '../utils/theme';
import { BrandLogo } from './ui/BrandLogo';

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
  const { themeSetting, setTheme } = useTheme();

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
    <main className="min-h-screen bg-[#F5F8FB] flex flex-col md:flex-row">
      {/* Left half (hidden on phones): navy gradient from #0B1F3A to #12294A with logo & subtle teal geometric shape */}
      <section
        aria-label="Welcome banner"
        className="hidden md:flex md:w-1/2 bg-gradient-to-br from-[#0B1F3A] to-[#12294A] p-12 lg:p-16 flex-col justify-between relative overflow-hidden text-white"
      >
        {/* Subtle teal geometric background accents */}
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full border border-[#0FA3A3]/20 bg-gradient-to-tr from-[#0FA3A3]/10 to-transparent pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute top-1/4 -left-12 w-64 h-64 rounded-3xl rotate-12 border border-[#0FA3A3]/15 bg-[#0FA3A3]/5 pointer-events-none"
        />

        <div className="relative z-10">
          <BrandLogo variant="dark" size="lg" />
        </div>

        <div className="relative z-10 max-w-lg my-auto py-12">
          <h1 className="text-3xl lg:text-4xl font-extrabold font-display text-white tracking-tight leading-tight">
            Welcome to Dimension Education
          </h1>
          <p className="mt-3 text-base text-slate-300 font-sans">
            Your learning journey, in one place
          </p>
        </div>

        <div className="relative z-10 text-xs text-slate-400">
          <p>&copy; {new Date().getFullYear()} Dimension Education. All rights reserved.</p>
        </div>
      </section>

      {/* Right half: white card with the sign-in form, centered */}
      <section
        aria-label="Authentication form"
        className="w-full md:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16 min-h-screen md:min-h-0 bg-[#F5F8FB]"
      >
        <div className="w-full max-w-md">
          {/* Logo above card shown on phones only */}
          <div className="md:hidden mb-6 flex justify-center">
            <BrandLogo variant="light" size="md" />
          </div>

          <div className="bg-white border border-[#E3E9F0] rounded-xl p-8 shadow-soft">
            <div className="mb-6">
              <h2 className="text-2xl font-bold font-display text-[#0B1F3A] tracking-tight">
                {mode === 'login' ? 'Sign in to Institute Portal' : 'Reset your password'}
              </h2>
              <p className="mt-1.5 text-sm text-[#5B6B7F]">
                {mode === 'login'
                  ? 'Enter your institute email and password to continue.'
                  : 'Enter your email to receive a password reset link.'}
              </p>
            </div>

            {displayError && (
              <div
                role="alert"
                className="mb-5 p-3.5 bg-[#FBEAE9] border border-[#C2413B]/20 rounded-lg text-sm text-[#C2413B]"
              >
                {displayError}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleSubmitLogin} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-sm font-medium text-[#0F1B2D] mb-1.5"
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
                    className="w-full px-3.5 py-2.5 text-sm text-[#0F1B2D] bg-white border border-[#E3E9F0] rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-[#0FA3A3] focus:ring-2 focus:ring-[#0FA3A3]/25"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-sm font-medium text-[#0F1B2D]"
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
                      className="text-xs font-medium text-[#0B7C7C] hover:text-[#0B8A8A] transition-colors"
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
                    className="w-full px-3.5 py-2.5 text-sm text-[#0F1B2D] bg-white border border-[#E3E9F0] rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-[#0FA3A3] focus:ring-2 focus:ring-[#0FA3A3]/25"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center shadow-xs"
                  >
                    {submitting ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in…
                      </span>
                    ) : (
                      'Sign in'
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {forgotSent ? (
                  <div
                    role="status"
                    className="p-4 bg-[#E7F6EF] border border-[#1F9D6B]/30 rounded-lg text-sm text-[#1F9D6B] space-y-2"
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
                        className="block text-sm font-medium text-[#0F1B2D] mb-1.5"
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
                        className="w-full px-3.5 py-2.5 text-sm text-[#0F1B2D] bg-white border border-[#E3E9F0] rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-[#0FA3A3] focus:ring-2 focus:ring-[#0FA3A3]/25"
                      />
                    </div>

                    <div>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center shadow-xs"
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
                    className="text-xs font-medium text-[#0B7C7C] hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 pt-5 border-t border-[#E3E9F0] text-center">
              <p className="text-xs text-[#5B6B7F]">
                Forgot your password? Please contact the institute.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
