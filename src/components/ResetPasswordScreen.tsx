import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatDbError, validatePasswordRules } from '../utils/domain';
import { BrandLogo } from './ui/BrandLogo';

interface ResetPasswordScreenProps {
  onComplete: () => void;
  onBackToLogin: () => void;
}

export function ResetPasswordScreen({
  onComplete,
  onBackToLogin,
}: ResetPasswordScreenProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  useEffect(() => {
    // Check URL hash/search for error parameters returned by Supabase
    const hash = window.location.hash;
    const search = window.location.search;
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : search);
    const errorParam = params.get('error') || params.get('error_code');
    const errorDesc = params.get('error_description');

    if (errorParam) {
      setIsCheckingSession(false);
      setHasValidSession(false);
      setError(
        errorDesc?.replace(/\+/g, ' ') ||
          'The password reset link is invalid or has expired. Please request a new link.'
      );
      return;
    }

    if (!supabase) {
      setIsCheckingSession(false);
      setHasValidSession(false);
      return;
    }

    // Check if user currently has an authenticated session (via recovery token)
    supabase.auth.getSession().then(({ data, error: sessionErr }) => {
      setIsCheckingSession(false);
      if (sessionErr || !data.session) {
        setHasValidSession(false);
      } else {
        setHasValidSession(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) {
        setHasValidSession(true);
        setIsCheckingSession(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const validation = validatePasswordRules(newPassword, confirmPassword);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(formatDbError(updateError));
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
  };

  const hasMinLength = newPassword.length >= 8;
  const hasLetterAndNumber =
    /[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const passwordsMatch =
    Boolean(newPassword) &&
    Boolean(confirmPassword) &&
    newPassword === confirmPassword;

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6">
          <div className="mb-3">
            <BrandLogo variant="light" size="sm" />
          </div>
          <h1 className="mt-1.5 text-2xl font-bold font-display text-[#0B1F3A] tracking-tight">
            Set New Password
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create a secure password for your institute account.
          </p>
        </div>

        {isCheckingSession ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-700 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-500">Verifying reset link…</p>
          </div>
        ) : !hasValidSession && !success ? (
          <div className="space-y-5">
            <div
              role="alert"
              className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900"
            >
              <p className="font-semibold mb-1">Invalid or expired link</p>
              <p>
                {error ||
                  'The password reset link is invalid, incomplete, or has expired. Please request a fresh reset link.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
            >
              Back to sign in
            </button>
          </div>
        ) : success ? (
          <div className="space-y-5">
            <div
              role="alert"
              className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900"
            >
              <p className="font-semibold mb-1">Password updated successfully</p>
              <p>Your password has been changed. You can now access your institute workspace.</p>
            </div>
            <button
              type="button"
              onClick={onComplete}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
            >
              Continue to Workspace
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="reset-new-password"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                New password
              </label>
              <input
                id="reset-new-password"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 chars, 1 letter, 1 number"
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div>
              <label
                htmlFor="reset-confirm-password"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Confirm new password
              </label>
              <input
                id="reset-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <p className="font-medium text-slate-700">Password requirements:</p>
              <p
                className={
                  hasMinLength ? 'text-emerald-700' : 'text-slate-500'
                }
              >
                • Minimum 8 characters
              </p>
              <p
                className={
                  hasLetterAndNumber ? 'text-emerald-700' : 'text-slate-500'
                }
              >
                • At least one letter and one number
              </p>
              <p
                className={
                  passwordsMatch ? 'text-emerald-700' : 'text-slate-500'
                }
              >
                • Both fields must match
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-60"
              >
                {submitting ? 'Updating password…' : 'Save new password'}
              </button>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={onBackToLogin}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
