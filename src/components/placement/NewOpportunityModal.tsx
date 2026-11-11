import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Search,
  Send,
  Upload,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CandidateProfileFull } from '../../types/database';
import {
  OPPORTUNITY_FILES_BUCKET,
  OPPORTUNITY_VISIBILITY_HOURS,
  type OpportunityVisibilityHours,
  buildSendOpportunityFeedback,
  formatCandidateStatusLabel,
  formatDbError,
  validateAndBuildJdUpload,
  validateAndBuildOpportunityInsert,
} from '../../utils/domain';
import { Modal } from '../ui/Modal';

interface NewOpportunityModalProps {
  open: boolean;
  allCandidates: CandidateProfileFull[];
  initialSelectedIds: string[];
  onClose: () => void;
  onSent: (createdOpportunityId: string) => Promise<void>;
}

export function NewOpportunityModal({
  open,
  allCandidates,
  initialSelectedIds,
  onClose,
  onSent,
}: NewOpportunityModalProps) {
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [description, setDescription] = useState('');
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [packageMin, setPackageMin] = useState('');
  const [packageMax, setPackageMax] = useState('');
  const [hours, setHours] = useState<OpportunityVisibilityHours>(24);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{
    opportunityId: string;
    primary: string;
    skipped: string | null;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setCompany('');
      setJobTitle('');
      setDescription('');
      setJdFile(null);
      setPackageMin('');
      setPackageMax('');
      setHours(24);
      setSelectedIds(initialSelectedIds);
      setPickerSearch('');
      setSending(false);
      setError(null);
      setSentResult(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [open, initialSelectedIds]);

  const candidateMap = useMemo(() => {
    const m = new Map<string, CandidateProfileFull>();
    for (const c of allCandidates) {
      m.set(c.candidate_id, c);
    }
    return m;
  }, [allCandidates]);

  const selectedCandidates = useMemo(
    () =>
      selectedIds
        .map((id) => candidateMap.get(id))
        .filter((c): c is CandidateProfileFull => Boolean(c)),
    [selectedIds, candidateMap],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const availableToAdd = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return allCandidates.filter((c) => {
      if (selectedSet.has(c.candidate_id)) return false;
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        c.candidate_code.toLowerCase().includes(q) ||
        (c.module ?? '').toLowerCase().includes(q)
      );
    });
  }, [allCandidates, selectedSet, pickerSearch]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const check = validateAndBuildJdUpload('temp-check', file);
    if (!check.ok) {
      setError(check.error);
      e.target.value = '';
      return;
    }
    setError(null);
    setJdFile(file);
  };

  const handleRemoveCandidate = (candidateId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== candidateId));
  };

  const handleAddCandidate = (candidateId: string) => {
    setSelectedIds((prev) =>
      prev.includes(candidateId) ? prev : [...prev, candidateId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) return;

    if (selectedIds.length === 0) {
      setError('Select at least one candidate to send this opportunity to.');
      return;
    }

    const opportunityId = crypto.randomUUID();
    let uploadedJdPath: string | null = null;

    if (jdFile) {
      const jdCheck = validateAndBuildJdUpload(opportunityId, jdFile);
      if (!jdCheck.ok) {
        setError(jdCheck.error);
        return;
      }
      uploadedJdPath = jdCheck.storagePath;
    }

    const oppCheck = validateAndBuildOpportunityInsert({
      id: opportunityId,
      company,
      jobTitle,
      description,
      jdPath: uploadedJdPath,
      packageMin,
      packageMax,
    });

    if (!oppCheck.ok) {
      setError(oppCheck.error);
      return;
    }

    setSending(true);
    setError(null);

    // 1. Upload JD file first if present
    if (jdFile && uploadedJdPath) {
      const { error: uploadErr } = await client.storage
        .from(OPPORTUNITY_FILES_BUCKET)
        .upload(uploadedJdPath, jdFile, {
          upsert: false,
          contentType: jdFile.type || undefined,
        });

      if (uploadErr) {
        setSending(false);
        setError(formatDbError(uploadErr));
        return;
      }
    }

    // 2. Insert into opportunities (never send created_by or cancelled)
    const { error: insertErr } = await client
      .from('opportunities')
      .insert(oppCheck.payload);

    if (insertErr) {
      setSending(false);
      setError(formatDbError(insertErr));
      return;
    }

    // 3. Call send_opportunity RPC
    const { data: sentCountData, error: rpcErr } = await client.rpc(
      'send_opportunity',
      {
        p_opportunity: opportunityId,
        p_candidates: selectedIds,
        p_hours: hours,
      },
    );

    setSending(false);

    if (rpcErr) {
      setError(formatDbError(rpcErr));
      return;
    }

    const sentCount =
      typeof sentCountData === 'number'
        ? sentCountData
        : Number(sentCountData ?? 0);
    const feedback = buildSendOpportunityFeedback(
      Number.isFinite(sentCount) ? sentCount : 0,
      selectedIds.length,
    );

    setSentResult({
      opportunityId,
      primary: feedback.primary,
      skipped: feedback.skipped,
    });
    await onSent(opportunityId);
  };

  return (
    <Modal
      open={open}
      onClose={sending ? () => {} : onClose}
      title={sentResult ? 'Opportunity Sent' : 'New Placement Opportunity'}
      description={
        sentResult
          ? 'Opportunity details saved and dispatched to eligible candidates.'
          : 'Create a job opening and send it to selected candidates.'
      }
      maxWidthClass="max-w-2xl"
    >
      {sentResult ? (
        <div className="space-y-5 py-2">
          <div className="p-4 bg-[#E7F6EF] border border-[#BCE8D3] rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#1F9D6B] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#0B1F3A]">
                {sentResult.primary}
              </p>
              {sentResult.skipped && (
                <p className="text-xs text-[#C98A0B] font-medium">
                  {sentResult.skipped}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && (
            <div
              role="alert"
              className="p-3 bg-[#FBEAE9] border border-[#F4C5C2] rounded-lg text-xs text-[#C2413B]"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="opp-company"
                className="block text-xs font-medium text-[#0B1F3A] mb-1"
              >
                Company *
              </label>
              <input
                id="opp-company"
                type="text"
                required
                placeholder="e.g. Deloitte India"
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="opp-job-title"
                className="block text-xs font-medium text-[#0B1F3A] mb-1"
              >
                Job title *
              </label>
              <input
                id="opp-job-title"
                type="text"
                required
                placeholder="e.g. SAP FICO Associate Consultant"
                value={jobTitle}
                onChange={(e) => {
                  setJobTitle(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="opp-description"
              className="block text-xs font-medium text-[#0B1F3A] mb-1"
            >
              Job description (text or file required)
            </label>
            <textarea
              id="opp-description"
              rows={4}
              placeholder="Role responsibilities, work location, shift details, and key skills..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
            />
          </div>

          {/* JD File Upload */}
          <div>
            <label
              htmlFor="opp-jd-file"
              className="block text-xs font-medium text-[#0B1F3A] mb-1.5"
            >
              Job description file (optional · PDF, DOC, DOCX · max 5 MB)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                id="opp-jd-file"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
                className="sr-only"
              />
              <label
                htmlFor="opp-jd-file"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] cursor-pointer transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-[#0FA3A3]" />
                {jdFile ? 'Replace JD file' : 'Choose JD file'}
              </label>
              {jdFile && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#E6F6F6] border border-[#0FA3A3]/30 rounded-lg text-xs text-[#0B7C7C]">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[220px] font-medium">
                    {jdFile.name}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove JD file"
                    onClick={() => {
                      setJdFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="hover:text-[#0B1F3A]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Package Range & Visibility Window */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="opp-pkg-min"
                className="block text-xs font-medium text-[#0B1F3A] mb-1"
              >
                Package min (₹ lakhs/yr)
              </label>
              <input
                id="opp-pkg-min"
                type="number"
                min={0}
                step="0.1"
                placeholder="e.g. 5.5"
                value={packageMin}
                onChange={(e) => {
                  setPackageMin(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="opp-pkg-max"
                className="block text-xs font-medium text-[#0B1F3A] mb-1"
              >
                Package max (₹ lakhs/yr)
              </label>
              <input
                id="opp-pkg-max"
                type="number"
                min={0}
                step="0.1"
                placeholder="e.g. 8.5"
                value={packageMax}
                onChange={(e) => {
                  setPackageMax(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="opp-hours"
                className="block text-xs font-medium text-[#0B1F3A] mb-1"
              >
                Visible to candidates for
              </label>
              <select
                id="opp-hours"
                value={hours}
                onChange={(e) =>
                  setHours(Number(e.target.value) as OpportunityVisibilityHours)
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#E3E9F0] rounded-lg"
              >
                {OPPORTUNITY_VISIBILITY_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h} hours
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected Candidates List + Quick Add */}
          <div className="p-4 bg-[#F5F8FB] border border-[#E3E9F0] rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-[#0B1F3A]">
                Selected Candidates ({selectedCandidates.length})
              </h3>
              {selectedCandidates.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-xs text-[#C2413B] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {selectedCandidates.length === 0 ? (
              <p className="text-xs text-[#5B6B7F]">
                No candidates selected yet. Choose recipients below.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {selectedCandidates.map((cand) => (
                  <span
                    key={cand.candidate_id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#E3E9F0] rounded-md text-xs text-[#0B1F3A]"
                  >
                    <span className="font-mono text-[11px] font-semibold text-[#0B7C7C]">
                      {cand.candidate_code}
                    </span>
                    <span className="truncate max-w-[140px]">
                      {cand.full_name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${cand.full_name}`}
                      onClick={() => handleRemoveCandidate(cand.candidate_id)}
                      className="text-[#5B6B7F] hover:text-[#C2413B]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add More Candidates Picker */}
            <div className="pt-2 border-t border-[#E3E9F0] space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#5B6B7F] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  placeholder="Add candidate by name, code, or module…"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E3E9F0] rounded-lg"
                />
              </div>

              {availableToAdd.length > 0 && (
                <div className="max-h-32 overflow-y-auto divide-y divide-[#E3E9F0] bg-white border border-[#E3E9F0] rounded-lg">
                  {availableToAdd.slice(0, 20).map((c) => (
                    <button
                      key={c.candidate_id}
                      type="button"
                      onClick={() => handleAddCandidate(c.candidate_id)}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#F5F8FB] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        <span className="font-mono font-semibold text-[#0B7C7C]">
                          {c.candidate_code}
                        </span>{' '}
                        · {c.full_name}
                      </span>
                      <span className="text-[11px] text-[#5B6B7F] shrink-0">
                        {c.module || '—'} · {formatCandidateStatusLabel(c.stage)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-sm font-medium text-[#0B1F3A] bg-white border border-[#E3E9F0] rounded-lg hover:bg-[#F5F8FB] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || selectedIds.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#081629] rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5 text-[#0FA3A3]" />
              {sending ? 'Sending…' : `Send (${selectedIds.length})`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
