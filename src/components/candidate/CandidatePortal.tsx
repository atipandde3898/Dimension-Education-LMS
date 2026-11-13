import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type {
  Batch,
  Candidate,
  CandidateApplication,
  CandidateCv,
  CandidateDocument,
  CandidateEducation,
  CandidateFeesSummary,
  CandidateOpportunity,
  CandidateOverview,
  CandidatePan,
  CandidateWork,
  ClassSession,
  FeePlan,
  InstallmentStatus,
  OnboardingStatus,
  Payment,
  Profile,
  TimetableSlot,
} from '../../types/database';
import {
  CANDIDATE_DOCS_BUCKET,
  countUnansweredCandidateOpportunities,
  formatDbError,
  isCandidateOpportunityLive,
  isCandidatePortalBlocked,
  isMandatoryOnboardingIncomplete,
  maskPan,
  sortCandidateOpportunitiesSoonestFirst,
} from '../../utils/domain';
import { ComingSoonScreen } from '../ComingSoonScreen';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';
import { CandidateFeesView } from './CandidateFeesView';
import { CandidateHomeView } from './CandidateHomeView';
import {
  CandidateLayout,
  type CandidateSection,
} from './CandidateLayout';
import { CandidateOnboardingView } from './CandidateOnboardingView';
import {
  CandidateOpportunitiesView,
  type CandidateOpportunitiesTab,
} from './CandidateOpportunitiesView';
import { CandidateProfileView } from './CandidateProfileView';
import { CandidateTicketsView } from './CandidateTicketsView';
import { CandidateTimetableView } from './CandidateTimetableView';

interface CandidatePortalProps {
  userId: string;
  profile: Profile;
  onLogout: () => void;
  loggingOut?: boolean;
}

export function CandidatePortal({
  userId,
  profile,
  onLogout,
  loggingOut = false,
}: CandidatePortalProps) {
  const [activeSection, setActiveSection] = useState<CandidateSection>('home');
  const [opportunitiesTab, setOpportunitiesTab] =
    useState<CandidateOpportunitiesTab>('open');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [overview, setOverview] = useState<CandidateOverview | null>(null);
  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [maskedPan, setMaskedPan] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);
  const [education, setEducation] = useState<CandidateEducation | null>(null);
  const [work, setWork] = useState<CandidateWork | null>(null);
  const [cv, setCv] = useState<CandidateCv | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasCheckedMandatoryRedirect, setHasCheckedMandatoryRedirect] =
    useState(false);

  // Fee & payment workspace state
  const [feePlan, setFeePlan] = useState<FeePlan | null>(null);
  const [feeSummary, setFeeSummary] = useState<CandidateFeesSummary | null>(
    null,
  );
  const [installments, setInstallments] = useState<InstallmentStatus[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Batch timetable & completed sessions state
  const [assignedBatch, setAssignedBatch] = useState<Batch | null>(null);
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [batchSessions, setBatchSessions] = useState<ClassSession[]>([]);

  // Open unanswered placement opportunities & submitted applications
  const [candidateOpportunities, setCandidateOpportunities] = useState<
    CandidateOpportunity[]
  >([]);
  const [opportunitiesError, setOpportunitiesError] = useState<string | null>(
    null,
  );
  const [myApplications, setMyApplications] = useState<CandidateApplication[]>(
    [],
  );
  const [applicationsError, setApplicationsError] = useState<string | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCandidateWorkspace = useCallback(
    async (showSkeleton = true) => {
      const client = supabase;
      if (!client) return;

      if (showSkeleton) setLoading(true);
      else setRefreshing(true);
      setError(null);

      // Identify candidate by candidates.profile_id = logged-in user id
      const { data: candData, error: candErr } = await client
        .from('candidates')
        .select(
          'id, profile_id, candidate_code, full_name, email, phone, program_id, module_id, batch_id, counsellor_id, status',
        )
        .eq('profile_id', userId)
        .maybeSingle();

      if (candErr) {
        setError(formatDbError(candErr));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!candData) {
        setCandidate(null);
        setOverview(null);
        setDocuments([]);
        setMaskedPan(null);
        setOnboardingStatus(null);
        setEducation(null);
        setWork(null);
        setCv(null);
        setFeePlan(null);
        setFeeSummary(null);
        setInstallments([]);
        setPayments([]);
        setAssignedBatch(null);
        setTimetableSlots([]);
        setBatchSessions([]);
        setCandidateOpportunities([]);
        setOpportunitiesError(null);
        setMyApplications([]);
        setApplicationsError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const cand = candData as Candidate;
      setCandidate(cand);

      if (cand.status === 'dropped') {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const batchPromise = cand.batch_id
        ? client
            .from('batches')
            .select(
              'id, batch_code, module_id, mode, start_date, end_date, location, timetable_status, timetable_finalised_at',
            )
            .eq('id', cand.batch_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const slotsPromise = cand.batch_id
        ? client
            .from('timetable_slots')
            .select(
              'id, batch_id, sme_id, day_of_week, start_time, end_time, meeting_link',
            )
            .eq('batch_id', cand.batch_id)
            .order('day_of_week', { ascending: true })
            .order('start_time', { ascending: true })
        : Promise.resolve({ data: [], error: null });

      const sessionsPromise = cand.batch_id
        ? client
            .from('sessions')
            .select(
              'id, batch_id, sme_id, session_date, duration_minutes, topic',
            )
            .eq('batch_id', cand.batch_id)
            .order('session_date', { ascending: false })
        : Promise.resolve({ data: [], error: null });

      const onboardingPromise = client
        .from('v_onboarding_status')
        .select(
          'candidate_id, docs_approved, docs_required, photo_status, consents_required, consents_accepted, education_done, work_done, cv_done, onboarding_complete',
        )
        .eq('candidate_id', cand.id)
        .maybeSingle();

      const [
        ovRes,
        docsRes,
        panRes,
        eduRes,
        workRes,
        cvRes,
        feeSummaryRes,
        feePlanRes,
        instStatusRes,
        paymentsRes,
        batchRes,
        slotsRes,
        sessionsRes,
        onbRes,
        oppsRes,
        appsRes,
      ] = await Promise.all([
        client
          .from('v_candidate_overview')
          .select(
            'candidate_id, candidate_code, full_name, email, phone, status, program, module, batch_code, batch_mode, counsellor, certification_code, net_fee, paid, pending, handed_over, handover_date, placement_member',
          )
          .eq('candidate_id', cand.id)
          .maybeSingle(),
        client
          .from('documents')
          .select(
            'id, candidate_id, doc_type, storage_path, status, review_note, reviewed_by, reviewed_at, uploaded_at',
          )
          .eq('candidate_id', cand.id),
        client
          .from('candidate_pan')
          .select('candidate_id, pan_number')
          .eq('candidate_id', cand.id)
          .maybeSingle(),
        client
          .from('candidate_education')
          .select(
            'candidate_id, ssc_year, ssc_percent, hsc_na, hsc_year, hsc_percent, diploma_na, diploma_stream, diploma_year, diploma_percent, graduation_na, graduation_stream, graduation_degree, graduation_year, graduation_percent, graduation_university, pg_na, pg_stream, pg_degree, pg_year, pg_percent, pg_university',
          )
          .eq('candidate_id', cand.id)
          .maybeSingle(),
        client
          .from('candidate_work')
          .select(
            'candidate_id, work_type, total_exp_years, sap_consultant_exp_years, sap_end_user_exp_years, relevant_domain_exp_years, current_ctc_lakhs, notice_period_months',
          )
          .eq('candidate_id', cand.id)
          .maybeSingle(),
        client
          .from('candidate_cv')
          .select('candidate_id, storage_path, file_name')
          .eq('candidate_id', cand.id)
          .maybeSingle(),
        client
          .from('v_candidate_fees')
          .select('candidate_id, total_fee, discount, net_fee, paid, pending')
          .eq('candidate_id', cand.id)
          .maybeSingle(),
        client
          .from('fee_plans')
          .select('candidate_id, total_fee, discount, note')
          .eq('candidate_id', cand.id)
          .maybeSingle(),
        client
          .from('v_installment_status')
          .select('id, candidate_id, seq, due_date, amount, paid, state, pending_amount')
          .eq('candidate_id', cand.id)
          .order('seq', { ascending: true }),
        client
          .from('payments')
          .select(
            'id, candidate_id, installment_id, amount, paid_on, reference, proof_path, status, confirmed_by, confirmed_at, created_at',
          )
          .eq('candidate_id', cand.id)
          .order('created_at', { ascending: false }),
        batchPromise,
        slotsPromise,
        sessionsPromise,
        onboardingPromise,
        client
          .from('v_candidate_opportunities')
          .select(
            'recipient_id, opportunity_id, company, job_title, description, jd_path, package_min_lakhs, package_max_lakhs, sent_at, expires_at',
          )
          .order('expires_at', { ascending: true }),
        client.rpc('my_applications'),
      ]);

      // Note: fee_plans direct read is optional if RLS restricts candidates to v_candidate_fees
      const fatalErr =
        ovRes.error ||
        docsRes.error ||
        panRes.error ||
        feeSummaryRes.error ||
        instStatusRes.error ||
        paymentsRes.error ||
        batchRes.error ||
        sessionsRes.error;

      if (fatalErr) {
        setError(formatDbError(fatalErr));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const fallbackOverview: CandidateOverview = {
        candidate_id: cand.id,
        candidate_code: cand.candidate_code,
        full_name: cand.full_name,
        email: cand.email,
        phone: cand.phone,
        status: cand.status,
        program: null,
        module: null,
        batch_code: null,
        batch_mode: null,
        counsellor: null,
        certification_code: cand.certification_code ?? null,
        net_fee: 0,
        paid: 0,
        pending: 0,
        handed_over: false,
        handover_date: null,
        placement_member: null,
      };

      const loadedDocs = (docsRes.data as CandidateDocument[]) ?? [];
      const loadedOnboarding = (onbRes.data as OnboardingStatus | null) ?? null;
      const loadedEducation = eduRes.error
        ? null
        : ((eduRes.data as CandidateEducation | null) ?? null);
      const loadedWork = workRes.error
        ? null
        : ((workRes.data as CandidateWork | null) ?? null);
      const loadedCv = cvRes.error
        ? null
        : ((cvRes.data as CandidateCv | null) ?? null);

      setOverview((ovRes.data as CandidateOverview | null) ?? fallbackOverview);
      setDocuments(loadedDocs);
      setOnboardingStatus(loadedOnboarding);
      setEducation(loadedEducation);
      setWork(loadedWork);
      setCv(loadedCv);
      setFeeSummary(
        (feeSummaryRes.data as CandidateFeesSummary | null) ?? null,
      );
      setFeePlan(
        feePlanRes.error ? null : ((feePlanRes.data as FeePlan | null) ?? null),
      );
      setInstallments((instStatusRes.data as InstallmentStatus[]) ?? []);
      setPayments((paymentsRes.data as Payment[]) ?? []);
      setAssignedBatch((batchRes.data as Batch | null) ?? null);
      setTimetableSlots(
        slotsRes.error ? [] : ((slotsRes.data as TimetableSlot[]) ?? []),
      );
      setBatchSessions((sessionsRes.data as ClassSession[]) ?? []);
      if (oppsRes.error) {
        setOpportunitiesError(formatDbError(oppsRes.error));
        setCandidateOpportunities([]);
      } else {
        setOpportunitiesError(null);
        setCandidateOpportunities(
          (oppsRes.data as CandidateOpportunity[]) ?? [],
        );
      }
      if (appsRes.error) {
        setApplicationsError(formatDbError(appsRes.error));
        setMyApplications([]);
      } else {
        setApplicationsError(null);
        setMyApplications((appsRes.data as CandidateApplication[]) ?? []);
      }

      // Signed URL for profile photo avatar
      const photoDoc = loadedDocs.find((d) => d.doc_type === 'profile_photo');
      if (photoDoc?.storage_path) {
        const { data: signedData } = await client.storage
          .from(CANDIDATE_DOCS_BUCKET)
          .createSignedUrl(photoDoc.storage_path, 60);
        setAvatarUrl(signedData?.signedUrl ?? null);
      } else {
        setAvatarUrl(null);
      }

      // Mandatory redirect rule: Until profile photo, consents, education, work, and CV are all completed,
      // redirect to onboarding right after login.
      const mandatoryIncomplete = isMandatoryOnboardingIncomplete(
        loadedOnboarding,
        loadedDocs,
        {
          hasEducation: Boolean(loadedEducation),
          hasWork: Boolean(loadedWork),
          hasCv: Boolean(loadedCv),
        },
      );
      if (mandatoryIncomplete && !hasCheckedMandatoryRedirect) {
        setActiveSection('onboarding');
        setHasCheckedMandatoryRedirect(true);
      }

      const panRecord = panRes.data as CandidatePan | null;
      // Never store unmasked PAN in state
      setMaskedPan(maskPan(panRecord?.pan_number));
      setLoading(false);
      setRefreshing(false);
    },
    [userId, hasCheckedMandatoryRedirect],
  );

  useEffect(() => {
    void loadCandidateWorkspace(true);
  }, [loadCandidateWorkspace]);

  const isTimetableLocked = isMandatoryOnboardingIncomplete(
    onboardingStatus,
    documents,
    {
      hasEducation: Boolean(education),
      hasWork: Boolean(work),
      hasCv: Boolean(cv),
    },
  );

  const handleRemoveOpportunity = useCallback((recipientId: string) => {
    setCandidateOpportunities((prev) =>
      prev.filter((o) => o.recipient_id !== recipientId),
    );
  }, []);

  const handleNavigateSection = useCallback((section: CandidateSection) => {
    if (section === 'opportunities') {
      setOpportunitiesTab('open');
    }
    setActiveSection(section);
  }, []);

  if (
    !loading &&
    isCandidatePortalBlocked(profile.active, candidate?.status ?? overview?.status)
  ) {
    return (
      <ComingSoonScreen
        profile={profile}
        userEmail={profile.email}
        mode="inactive"
        onLogout={onLogout}
        loggingOut={loggingOut}
      />
    );
  }

  const unansweredOpportunitiesCount =
    countUnansweredCandidateOpportunities(candidateOpportunities);

  const soonestWaitingOpportunity =
    sortCandidateOpportunitiesSoonestFirst(
      candidateOpportunities.filter((o) => isCandidateOpportunityLive(o)),
    )[0] ?? null;

  return (
    <CandidateLayout
      profile={profile}
      candidateCode={candidate?.candidate_code}
      activeSection={activeSection}
      onNavigate={handleNavigateSection}
      onLogout={onLogout}
      loggingOut={loggingOut}
      avatarUrl={avatarUrl}
      isTimetableLocked={isTimetableLocked}
      unansweredOpportunitiesCount={unansweredOpportunitiesCount}
    >
      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : error ? (
        <ErrorState
          title="Could not load your candidate workspace"
          message={error}
          onRetry={() => void loadCandidateWorkspace(true)}
        />
      ) : !candidate || !overview ? (
        <EmptyState
          title="Candidate record not linked yet"
          description="Your login profile is active, but no enrollment record in candidates is linked to your account yet. Please contact your institute counsellor or administrator."
          actionLabel="Refresh"
          onAction={() => void loadCandidateWorkspace(true)}
        />
      ) : activeSection === 'home' ? (
        <CandidateHomeView
          overview={overview}
          documents={documents}
          installments={installments}
          payments={payments}
          onboardingStatus={onboardingStatus}
          education={education}
          work={work}
          cv={cv}
          avatarUrl={avatarUrl}
          unansweredOpportunitiesCount={unansweredOpportunitiesCount}
          soonestOpportunity={soonestWaitingOpportunity}
          myApplications={myApplications}
          onGoToOnboarding={() => setActiveSection('onboarding')}
          onGoToOpportunities={() => {
            setOpportunitiesTab('open');
            setActiveSection('opportunities');
          }}
          onGoToMyApplications={() => {
            setOpportunitiesTab('my_applications');
            setActiveSection('opportunities');
          }}
          onGoToFees={() => setActiveSection('fees')}
        />
      ) : activeSection === 'onboarding' ? (
        <CandidateOnboardingView
          candidateId={candidate.id}
          maskedPan={maskedPan}
          documents={documents}
          education={education}
          work={work}
          cv={cv}
          onRefresh={() => loadCandidateWorkspace(false)}
        />
      ) : activeSection === 'opportunities' ? (
        <CandidateOpportunitiesView
          candidateId={candidate.id}
          activeTab={opportunitiesTab}
          onChangeTab={setOpportunitiesTab}
          opportunities={candidateOpportunities}
          opportunitiesError={opportunitiesError}
          applications={myApplications}
          applicationsError={applicationsError}
          cv={cv}
          onboardingStatus={onboardingStatus}
          education={education}
          work={work}
          onGoToOnboarding={() => setActiveSection('onboarding')}
          onRemoveOpportunity={handleRemoveOpportunity}
          onRefresh={() => loadCandidateWorkspace(false)}
          refreshing={refreshing}
        />
      ) : activeSection === 'fees' ? (
        <CandidateFeesView
          candidateId={candidate.id}
          feePlan={feePlan}
          feeSummary={feeSummary}
          installments={installments}
          payments={payments}
          onRefresh={() => loadCandidateWorkspace(false)}
        />
      ) : activeSection === 'timetable' ? (
        <CandidateTimetableView
          batch={assignedBatch}
          batchCodeFallback={overview.batch_code}
          slots={timetableSlots}
          sessions={batchSessions}
          isLocked={isTimetableLocked}
          onGoToOnboarding={() => setActiveSection('onboarding')}
          onRefresh={() => loadCandidateWorkspace(false)}
          refreshing={refreshing}
        />
      ) : activeSection === 'tickets' ? (
        <CandidateTicketsView
          candidateId={candidate.id}
          candidateCode={candidate.candidate_code}
        />
      ) : (
        <CandidateProfileView
          overview={overview}
          profile={profile}
          maskedPan={maskedPan}
          avatarUrl={avatarUrl}
        />
      )}
    </CandidateLayout>
  );
}
