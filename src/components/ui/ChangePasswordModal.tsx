import React, { useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDbError, validatePasswordRules } from '../../utils/domain';
import { Modal } from '../ui/Modal';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  userEmail?: string;
}

export function ChangePasswordModal({
  open,
  onClose,
  userEmail,
}: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleClose = () => {
    if (saving) return;
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    setError(null);
    setSuccess(null);

    const validation = validatePasswordRules(newPassword, confirmPassword);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setSaving(true);
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setSaving(false);

    if (updateErr) {
      setError(formatDbError(updateErr));
      return;
    }

    setSuccess('Your password has been changed successfully.');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Change password"
      description={
        userEmail
          ? `Update the login password for ${userEmail}.`
          : 'Update your account login password.'
      }
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div>
          <label
            htmlFor="change-password-new"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            New password
          </label>
          <input
            id="change-password-new"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Minimum 8 characters with letters & numbers"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Must be at least 8 characters long and contain both letters and numbers.
          </p>
        </div>

        <div>
          <label
            htmlFor="change-password-confirm"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Confirm new password
          </label>
          <input
            id="change-password-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Re-enter new password"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          {!success && (
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {saving ? 'Updating…' : 'Update password'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
