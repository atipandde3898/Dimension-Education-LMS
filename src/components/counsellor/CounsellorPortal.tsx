import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type {
  CandidateOverview,
  InstallmentStatus,
  Profile,
} from '../../types/database';
import {
  computeCounsellorPortfolioMetrics,
  formatDbError,
} from '../../utils/domain';
import { CounsellorCandidateDetailView } from './CounsellorCandidateDetailView';
import { CounsellorCandidatesView } from './CounsellorCandidatesView';
import { CounsellorHomeView } from './CounsellorHomeView';
import {
  CounsellorLayout,
  type CounsellorBreadcrumb,
  type CounsellorSection,
} from './CounsellorLayout';

interface CounsellorPortalProps {
  userId: string;
  profile: Profile;
  onLogout: () => void;
  loggingOut?: boolean;
}

export function CounsellorPortal({
  userId,
  profile,
  onLogout,
  loggingOut = false,
}: CounsellorPortalProps) {
  const [activeSection, setActiveSection] = useState<CounsellorSection>('home');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [selectedCandidateCode, setSelectedCandidateCode] = useState<
    string | null
  >(null);
  const [initialOverdueFilter, setInitialOverdueFilter] = useState(false);

  const [candidates, setCandidates] = useState<CandidateOverview[]>([]);
  const [installments, setInstallments] = useState<
    Array<Pick<InstallmentStatus, 'id' | 'candidate_id' | 'state'>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPortfolio = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    setLoading(true);
    setError(null);

    // Explicitly scope to candidates where counsellor_id = userId in addition to RLS
    const { data: ownRows, error: ownErr } = await client
      .from('candidates')
      .select('id')
      .eq('counsellor_id', userId);

    if (ownErr) {
      setError(formatDbError(ownErr));
      setLoading(false);
      return;
    }

    const candidateIds = ((ownRows as Array<{ id: string }> | null) ?? []).map(
      (r) => r.id,
    );

    if (candidateIds.length === 0) {
      setCandidates([]);
      setInstallments([]);
      setLoading(false);
      return;
    }

    const [ovRes, instRes] = await Promise.all([
      client
        .from('v_candidate_overview')
        .select(
          'candidate_id, candidate_code, full_name, email, phone, status, program, module, batch_code, batch_mode, counsellor, net_fee, paid, pending, handed_over, handover_date, placement_member',
        )
        .in('candidate_id', candidateIds),
      client
        .from('v_installment_status')
        .select('id, candidate_id, state')
        .in('candidate_id', candidateIds),
    ]);

    if (ovRes.error) {
      setError(formatDbError(ovRes.error));
      setLoading(false);
      return;
    }
    if (instRes.error) {
      setError(formatDbError(instRes.error));
      setLoading(false);
      return;
    }

    setCandidates((ovRes.data as CandidateOverview[] | null) ?? []);
    setInstallments(
      (instRes.data as Array<
        Pick<InstallmentStatus, 'id' | 'candidate_id' | 'state'>
      > | null) ?? [],
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const metrics = useMemo(
    () => computeCounsellorPortfolioMetrics(candidates, installments),
    [candidates, installments],
  );

  const handleNavigate = (section: CounsellorSection) => {
    setActiveSection(section);
    setSelectedCandidateId(null);
    setSelectedCandidateCode(null);
    if (section === 'home') {
      setInitialOverdueFilter(false);
    }
  };

  const breadcrumbs = useMemo<CounsellorBreadcrumb[]>(() => {
    if (activeSection === 'home') {
      return [{ label: 'Home' }];
    }
    if (selectedCandidateId) {
      return [
        {
          label: 'My Candidates',
          onClick: () => {
            setSelectedCandidateId(null);
            setSelectedCandidateCode(null);
          },
        },
        { label: selectedCandidateCode ?? 'Candidate Details' },
      ];
    }
    return [{ label: 'My Candidates' }];
  }, [activeSection, selectedCandidateId, selectedCandidateCode]);

  return (
    <CounsellorLayout
      profile={profile}
      activeSection={activeSection}
      breadcrumbs={breadcrumbs}
      onNavigate={handleNavigate}
      onLogout={onLogout}
      loggingOut={loggingOut}
    >
      {activeSection === 'home' && (
        <CounsellorHomeView
          counsellorName={profile.full_name || 'Counsellor'}
          metrics={metrics}
          loading={loading}
          error={error}
          onRefresh={() => void loadPortfolio()}
          onOpenCandidates={(opts) => {
            setInitialOverdueFilter(Boolean(opts?.overdueOnly));
            setSelectedCandidateId(null);
            setSelectedCandidateCode(null);
            setActiveSection('candidates');
          }}
        />
      )}

      {activeSection === 'candidates' &&
        (selectedCandidateId ? (
          <CounsellorCandidateDetailView
            candidateId={selectedCandidateId}
            onBack={() => {
              setSelectedCandidateId(null);
              setSelectedCandidateCode(null);
            }}
            onCandidateCodeLoaded={setSelectedCandidateCode}
          />
        ) : (
          <CounsellorCandidatesView
            candidates={candidates}
            overdueCandidateIds={metrics.overdueCandidateIds}
            loading={loading}
            error={error}
            initialOverdueOnly={initialOverdueFilter}
            onRetry={() => void loadPortfolio()}
            onSelectCandidate={(id) => {
              const matched = candidates.find((c) => c.candidate_id === id);
              setSelectedCandidateCode(matched?.candidate_code ?? null);
              setSelectedCandidateId(id);
            }}
          />
        ))}
    </CounsellorLayout>
  );
}
