import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ConsentAcceptance, ConsentClause } from '../../types/database';
import {
  buildConsentAcceptancePayloads,
  formatDateTime,
  formatDbError,
} from '../../utils/domain';

interface CandidateConsentSectionProps {
  candidateId: string;
  onConsentAccepted?: () => Promise<void> | void;
}

export function CandidateConsentSection({
  candidateId,
  onConsentAccepted,
}: CandidateConsentSectionProps) {
  const [clauses, setClauses] = useState<ConsentClause[]>([]);
  const [acceptances, setAcceptances] = useState<ConsentAcceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Unaccepted clauses interaction state
  const [scrolledClauses, setScrolledClauses] = useState<Record<string, boolean>>({});
  const [agreedClauses, setAgreedClauses] = useState<Record<string, boolean>>({});
  const [signatureName, setSignatureName] = useState('');
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signSuccess, setSignSuccess] = useState<string | null>(null);

  const textBoxRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const loadConsentData = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    setLoading(true);
    setError(null);

    const [clausesRes, acceptancesRes] = await Promise.all([
      client
        .from('consent_clauses')
        .select('id, version, position, title, body, required, active')
        .eq('active', true)
        .order('position', { ascending: true }),
      client
        .from('consent_acceptances')
        .select('id, candidate_id, clause_id, typed_name, accepted_at')
        .eq('candidate_id', candidateId),
    ]);

    if (clausesRes.error) {
      setError(formatDbError(clausesRes.error));
      setLoading(false);
      return;
    }

    if (acceptancesRes.error) {
      setError(formatDbError(acceptancesRes.error));
      setLoading(false);
      return;
    }

    const loadedClauses = (clausesRes.data as ConsentClause[]) ?? [];
    const loadedAcceptances = (acceptancesRes.data as ConsentAcceptance[]) ?? [];

    setClauses(loadedClauses);
    setAcceptances(loadedAcceptances);
    setLoading(false);
  }, [candidateId]);

  useEffect(() => {
    void loadConsentData();
  }, [loadConsentData]);

  // Check on mount if any text box doesn't overflow (scrollHeight <= clientHeight),
  // in which case user has already seen the full text
  useEffect(() => {
    const timer = setTimeout(() => {
      setScrolledClauses((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [id, el] of Object.entries(textBoxRefs.current)) {
          if (el && !next[id]) {
            if (el.scrollHeight <= el.clientHeight + 5) {
              next[id] = true;
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [clauses]);

  const handleBoxScroll = (clauseId: string, e: React.UIEvent<HTMLDivElement>) => {
    if (scrolledClauses[clauseId]) return;
    const target = e.currentTarget;
    // Scrolled to bottom within 8px tolerance
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 8;
    if (isAtBottom) {
      setScrolledClauses((prev) => ({ ...prev, [clauseId]: true }));
    }
  };

  const acceptanceMap = new Map<string, ConsentAcceptance>();
  for (const acc of acceptances) {
    acceptanceMap.set(acc.clause_id, acc);
  }

  const unacceptedClauses = clauses.filter((c) => !acceptanceMap.has(c.id));
  const allAccepted = clauses.length > 0 && unacceptedClauses.length === 0;

  const canSign =
    unacceptedClauses.length > 0 &&
    unacceptedClauses.every((c) => agreedClauses[c.id]) &&
    signatureName.trim().length >= 2;

  const handleAcceptAndSign = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    if (!canSign) {
      setSignError(
        'Please read and check all agreements and type your full name (at least 2 characters) as your signature.',
      );
      return;
    }

    setSigning(true);
    setSignError(null);
    setSignSuccess(null);

    const check = buildConsentAcceptancePayloads(
      candidateId,
      unacceptedClauses.map((c) => c.id),
      signatureName,
    );

    if (!check.ok) {
      setSignError(check.error);
      setSigning(false);
      return;
    }

    // Insert one row per unaccepted clause. Never send accepted_at!
    const { error: insertErr } = await client
      .from('consent_acceptances')
      .insert(check.payloads);

    setSigning(false);

    if (insertErr) {
      setSignError(formatDbError(insertErr));
      return;
    }

    setSignSuccess('Terms and consent successfully signed.');
    setSignatureName('');
    setAgreedClauses({});
    await loadConsentData();
    if (onConsentAccepted) {
      await onConsentAccepted();
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
        <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-28 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 bg-red-50 border border-red-200 rounded-xl space-y-2">
        <p className="text-sm font-semibold text-red-900">
          Could not load Terms &amp; Consent clauses
        </p>
        <p className="text-xs text-red-800">{error}</p>
        <button
          type="button"
          onClick={() => void loadConsentData()}
          className="mt-1 px-3 py-1.5 text-xs font-medium text-red-900 bg-white border border-red-300 rounded hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (clauses.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="terms-consent-heading"
      className="p-6 bg-white border border-slate-200 rounded-xl space-y-6"
    >
      <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2
            id="terms-consent-heading"
            className="text-lg font-semibold text-slate-900 tracking-tight"
          >
            Terms and consent
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Please read each institutional policy clause carefully before providing your signature.
          </p>
        </div>

        {allAccepted && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>All consents accepted</span>
          </span>
        )}
      </div>

      {signSuccess && (
        <div
          role="status"
          className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-xs font-medium text-emerald-900"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{signSuccess}</span>
        </div>
      )}

      {/* Clauses list */}
      <div className="space-y-5">
        {clauses.map((clause, index) => {
          const acceptance = acceptanceMap.get(clause.id);
          const isAccepted = Boolean(acceptance);
          const isScrolled = Boolean(scrolledClauses[clause.id]);
          const isChecked = Boolean(agreedClauses[clause.id]);

          return (
            <div
              key={clause.id}
              className={`p-5 rounded-xl border space-y-3.5 transition-colors ${
                isAccepted
                  ? 'bg-slate-50/70 border-slate-200'
                  : 'bg-white border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {clause.title}
                  </h3>
                </div>

                {isAccepted ? (
                  <span className="px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md whitespace-nowrap">
                    Accepted
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md whitespace-nowrap">
                    Pending Agreement
                  </span>
                )}
              </div>

              {/* Scrollable text box preserving line breaks (white-space: pre-wrap) */}
              <div
                ref={(el) => {
                  textBoxRefs.current[clause.id] = el;
                }}
                onScroll={(e) => handleBoxScroll(clause.id, e)}
                tabIndex={0}
                aria-label={`Terms text for ${clause.title}`}
                className="p-4 bg-white border border-slate-200 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-slate-700 leading-relaxed font-sans select-text shadow-inner focus:outline-none focus:border-blue-500"
              >
                {clause.body}
              </div>

              {/* Acceptance status or checkbox */}
              {isAccepted && acceptance ? (
                <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5 font-medium text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      Accepted on{' '}
                      <span className="font-mono tabular-nums">
                        {formatDateTime(acceptance.accepted_at)}
                      </span>
                    </span>
                  </div>
                  <div className="text-xs text-slate-700">
                    Signed by: <strong className="font-semibold text-slate-900">{acceptance.typed_name}</strong>
                  </div>
                </div>
              ) : (
                <div className="pt-1 space-y-1.5">
                  <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      disabled={!isScrolled || signing}
                      checked={isChecked}
                      onChange={(e) =>
                        setAgreedClauses((prev) => ({
                          ...prev,
                          [clause.id]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <span className={!isScrolled ? 'text-slate-400 font-medium' : 'font-medium'}>
                      I have read and agree to the above
                    </span>
                  </label>
                  {!isScrolled && (
                    <p className="text-[11px] text-amber-700 pl-6">
                      (Scroll to the bottom of the text box above to enable this agreement)
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Signature & Submit Form (Only if unaccepted clauses exist) */}
      {unacceptedClauses.length > 0 && (
        <form
          onSubmit={handleAcceptAndSign}
          className="pt-4 border-t border-slate-200 space-y-4"
          noValidate
        >
          <div className="max-w-md space-y-1.5">
            <label
              htmlFor="typed-signature-name"
              className="block text-xs font-semibold text-slate-900"
            >
              Type your full name as your signature <span className="text-red-600">*</span>
            </label>
            <input
              id="typed-signature-name"
              type="text"
              autoComplete="name"
              spellCheck={false}
              disabled={signing}
              value={signatureName}
              onChange={(e) => {
                setSignatureName(e.target.value);
                if (signError) setSignError(null);
              }}
              placeholder="e.g. Rohan Kulkarni"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-blue-600 disabled:bg-slate-100"
            />
            <p className="text-[11px] text-slate-500">
              Entering your legal name constitutes an electronic signature under institute policy.
            </p>
          </div>

          {signError && (
            <p role="alert" className="text-xs text-red-700 font-medium">
              {signError}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={!canSign || signing}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{signing ? 'Recording signature…' : 'Accept and sign'}</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
