import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type {
  CandidateProfileFull,
  Opportunity,
  OpportunityResponse,
  Profile,
} from '../../types/database';
import { formatDbError } from '../../utils/domain';
import { ErrorState, TableSkeleton } from '../ui/States';
import { NewOpportunityModal } from './NewOpportunityModal';
import { PlacementCandidateProfileView } from './PlacementCandidateProfileView';
import { PlacementCandidatesView } from './PlacementCandidatesView';
import { PlacementHomeView } from './PlacementHomeView';
import {
  type PlacementBreadcrumb,
  PlacementLayout,
  type PlacementSection,
} from './PlacementLayout';
import { PlacementOpportunitiesView } from './PlacementOpportunitiesView';
import { PlacementOpportunityDetailView } from './PlacementOpportunityDetailView';

interface PlacementPortalProps {
  profile: Profile;
  onLogout: () => void;
  loggingOut?: boolean;
}

export function PlacementPortal({
  profile,
  onLogout,
  loggingOut = false,
}: PlacementPortalProps) {
  const [activeSection, setActiveSection] = useState<PlacementSection>('home');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<
    string | null
  >(null);

  const [candidates, setCandidates] = useState<CandidateProfileFull[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [responses, setResponses] = useState<OpportunityResponse[]>([]);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(
    [],
  );
  const [newOppModalOpen, setNewOppModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (showSkeleton = true) => {
    const client = supabase;
    if (!client) return;

    if (showSkeleton) setLoading(true);
    setError(null);

    // Strictly query only placement-authorized Supabase views/tables.
    // Never query fees, PAN, payments, documents, or consent tables.
    const [candRes, oppRes, respRes] = await Promise.all([
      client
        .from('v_candidate_profile_full')
        .select(
          'candidate_id, candidate_code, full_name, email, phone, stage, program, module, batch_code, ssc_year, ssc_percent, hsc_na, hsc_year, hsc_percent, diploma_na, diploma_stream, diploma_year, diploma_percent, graduation_na, graduation_stream, graduation_degree, graduation_year, graduation_percent, graduation_university, pg_na, pg_stream, pg_degree, pg_year, pg_percent, pg_university, work_type, total_exp_years, sap_consultant_exp_years, sap_end_user_exp_years, relevant_domain_exp_years, current_ctc_lakhs, notice_period_months, cv_path, cv_file_name, photo_path',
        ),
      client
        .from('opportunities')
        .select(
          'id, company, job_title, description, jd_path, package_min_lakhs, package_max_lakhs, cancelled, created_at',
        )
        .order('created_at', { ascending: false }),
      client
        .from('v_opportunity_responses')
        .select(
          'recipient_id, opportunity_id, company, job_title, candidate_id, candidate_code, full_name, email, phone, module, stage, sent_at, expires_at, response, responded_at, pipeline_stage, stage_note, stage_updated_at, response_state',
        ),
    ]);

    const fatalErr = candRes.error || oppRes.error || respRes.error;
    if (fatalErr) {
      setError(formatDbError(fatalErr));
      setLoading(false);
      return;
    }

    setCandidates((candRes.data as CandidateProfileFull[]) ?? []);
    setOpportunities((oppRes.data as Opportunity[]) ?? []);
    setResponses((respRes.data as OpportunityResponse[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadWorkspace(true);
  }, [loadWorkspace]);

  const handleNavigate = (section: PlacementSection) => {
    setActiveSection(section);
    setSelectedCandidateId(null);
    setSelectedOpportunityId(null);
  };

  const selectedCandidate = useMemo(
    () =>
      candidates.find((c) => c.candidate_id === selectedCandidateId) ?? null,
    [candidates, selectedCandidateId],
  );

  const selectedOpportunity = useMemo(
    () => opportunities.find((o) => o.id === selectedOpportunityId) ?? null,
    [opportunities, selectedOpportunityId],
  );

  const breadcrumbs = useMemo<PlacementBreadcrumb[]>(() => {
    if (activeSection === 'home') return [{ label: 'Home' }];
    if (activeSection === 'candidates') {
      if (selectedCandidate) {
        return [
          {
            label: 'Candidates',
            onClick: () => setSelectedCandidateId(null),
          },
          {
            label: `${selectedCandidate.candidate_code} · ${selectedCandidate.full_name}`,
          },
        ];
      }
      return [{ label: 'Candidates' }];
    }
    if (selectedOpportunity) {
      return [
        {
          label: 'Opportunities',
          onClick: () => setSelectedOpportunityId(null),
        },
        {
          label: `${selectedOpportunity.company} — ${selectedOpportunity.job_title}`,
        },
      ];
    }
    return [{ label: 'Opportunities' }];
  }, [activeSection, selectedCandidate, selectedOpportunity]);

  return (
    <PlacementLayout
      profile={profile}
      activeSection={activeSection}
      onNavigate={handleNavigate}
      onLogout={onLogout}
      loggingOut={loggingOut}
      breadcrumbs={breadcrumbs}
    >
      {loading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : error ? (
        <ErrorState
          title="Could not load placement workspace"
          message={error}
          onRetry={() => void loadWorkspace(true)}
        />
      ) : activeSection === 'home' ? (
        <PlacementHomeView
          candidates={candidates}
          opportunities={opportunities}
          responses={responses}
          onGoToCandidates={() => handleNavigate('candidates')}
          onGoToOpportunities={() => handleNavigate('opportunities')}
          onOpenOpportunity={(oppId) => {
            setActiveSection('opportunities');
            setSelectedOpportunityId(oppId);
          }}
          onOpenNewOpportunity={() => setNewOppModalOpen(true)}
        />
      ) : activeSection === 'candidates' ? (
        selectedCandidate ? (
          <PlacementCandidateProfileView
            candidate={selectedCandidate}
            onBack={() => setSelectedCandidateId(null)}
          />
        ) : (
          <PlacementCandidatesView
            candidates={candidates}
            selectedCandidateIds={selectedCandidateIds}
            onChangeSelectedIds={setSelectedCandidateIds}
            onOpenCandidate={(cand) => setSelectedCandidateId(cand.candidate_id)}
            onSendOpportunity={() => setNewOppModalOpen(true)}
          />
        )
      ) : selectedOpportunity ? (
        <PlacementOpportunityDetailView
          opportunity={selectedOpportunity}
          responses={responses.filter(
            (r) => r.opportunity_id === selectedOpportunity.id,
          )}
          allCandidates={candidates}
          onBack={() => setSelectedOpportunityId(null)}
          onRefresh={() => loadWorkspace(false)}
        />
      ) : (
        <PlacementOpportunitiesView
          opportunities={opportunities}
          responses={responses}
          onOpenOpportunity={(oppId) => setSelectedOpportunityId(oppId)}
          onOpenNewOpportunity={() => setNewOppModalOpen(true)}
          onRefresh={() => loadWorkspace(false)}
        />
      )}

      <NewOpportunityModal
        open={newOppModalOpen}
        allCandidates={candidates}
        initialSelectedIds={selectedCandidateIds}
        onClose={() => setNewOppModalOpen(false)}
        onSent={async () => {
          setSelectedCandidateIds([]);
          await loadWorkspace(false);
        }}
      />
    </PlacementLayout>
  );
}
