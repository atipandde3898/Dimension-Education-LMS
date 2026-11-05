/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AdminLayout,
  type AdminSection,
  type BreadcrumbItem,
} from './components/AdminLayout';
import { BatchDetailView } from './components/admin/BatchDetailView';
import { BatchesView } from './components/admin/BatchesView';
import { CandidateDetailView } from './components/admin/CandidateDetailView';
import { CandidatesView } from './components/admin/CandidatesView';
import { CatalogView } from './components/admin/CatalogView';
import { DashboardView } from './components/admin/DashboardView';
import { DocumentReviewView } from './components/admin/DocumentReviewView';
import { PaymentsView } from './components/admin/PaymentsView';
import { PlacementTeamView } from './components/admin/PlacementTeamView';
import { ReportsView } from './components/admin/ReportsView';
import { StaffView } from './components/admin/StaffView';
import { CandidatePortal } from './components/candidate/CandidatePortal';
import { ComingSoonScreen } from './components/ComingSoonScreen';
import { CounsellorPortal } from './components/counsellor/CounsellorPortal';
import { LoginScreen } from './components/LoginScreen';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { SetupScreen } from './components/SetupScreen';
import { SmePortal } from './components/sme/SmePortal';
import { ErrorState } from './components/ui/States';
import { envCheck, supabase } from './lib/supabase';
import type { Profile } from './types/database';
import { formatDbError, resolvePortalArea } from './utils/domain';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(envCheck.valid);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isRecoveryRoute, setIsRecoveryRoute] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.pathname === '/reset-password' ||
      window.location.hash.includes('type=recovery')
    );
  });

  // Admin navigation state
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchCode, setSelectedBatchCode] = useState<string | null>(
    null,
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [selectedCandidateCode, setSelectedCandidateCode] = useState<
    string | null
  >(null);

  const loadUserProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    setProfileLoading(true);
    setProfileError(null);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, email, phone, active')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setProfileError(formatDbError(error));
      setProfileLoading(false);
      return;
    }

    setProfile((data as Profile | null) ?? null);
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
      if (data.session?.user?.id) {
        void loadUserProfile(data.session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryRoute(true);
      }
      setSession(nextSession);
      setAuthLoading(false);
      if (nextSession?.user?.id) {
        void loadUserProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserProfile]);

  const handleLogout = async () => {
    if (!supabase) return;
    setLoggingOut(true);
    await supabase.auth.signOut();
    setLoggingOut(false);
    setProfile(null);
    setSelectedBatchId(null);
    setSelectedCandidateId(null);
    setActiveSection('dashboard');
  };

  const handleNavigateSection = useCallback((section: AdminSection) => {
    setActiveSection(section);
    setSelectedBatchId(null);
    setSelectedBatchCode(null);
    setSelectedCandidateId(null);
    setSelectedCandidateCode(null);
  }, []);

  const handleOpenBatch = useCallback((batchId: string) => {
    setActiveSection('batches');
    setSelectedCandidateId(null);
    setSelectedCandidateCode(null);
    setSelectedBatchCode(null);
    setSelectedBatchId(batchId);
  }, []);

  const handleOpenCandidate = useCallback((candidateId: string) => {
    setActiveSection('candidates');
    setSelectedBatchId(null);
    setSelectedBatchCode(null);
    setSelectedCandidateCode(null);
    setSelectedCandidateId(candidateId);
  }, []);

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    if (activeSection === 'dashboard') {
      return [{ label: 'Dashboard' }];
    }
    if (activeSection === 'catalog') {
      return [{ label: 'Programs & Modules' }];
    }
    if (activeSection === 'placement') {
      return [{ label: 'Placement Team' }];
    }
    if (activeSection === 'staff') {
      return [{ label: 'Staff' }];
    }
    if (activeSection === 'batches') {
      if (selectedBatchId) {
        return [
          {
            label: 'Batches',
            onClick: () => {
              setSelectedBatchId(null);
              setSelectedBatchCode(null);
            },
          },
          { label: selectedBatchCode ?? 'Batch Details' },
        ];
      }
      return [{ label: 'Batches' }];
    }
    if (activeSection === 'payments') {
      return [{ label: 'Payments' }];
    }
    if (activeSection === 'document_review') {
      return [{ label: 'Document Review' }];
    }
    if (activeSection === 'reports') {
      return [{ label: 'Reports' }];
    }
    if (selectedCandidateId) {
      return [
        {
          label: 'Candidates',
          onClick: () => {
            setSelectedCandidateId(null);
            setSelectedCandidateCode(null);
          },
        },
        { label: selectedCandidateCode ?? 'Candidate Details' },
      ];
    }
    return [{ label: 'Candidates' }];
  }, [
    activeSection,
    selectedBatchId,
    selectedBatchCode,
    selectedCandidateId,
    selectedCandidateCode,
  ]);

  // 1. Setup check: VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
  if (!envCheck.valid) {
    return <SetupScreen validation={envCheck} />;
  }

  // 2. Password recovery route
  if (isRecoveryRoute) {
    return (
      <ResetPasswordScreen
        onComplete={() => {
          setIsRecoveryRoute(false);
          window.history.replaceState({}, '', '/');
          if (session?.user?.id) {
            void loadUserProfile(session.user.id);
          }
        }}
        onBackToLogin={async () => {
          setIsRecoveryRoute(false);
          window.history.replaceState({}, '', '/');
          if (supabase) {
            await supabase.auth.signOut();
          }
        }}
      />
    );
  }

  // 3. Session initialization loading
  if (authLoading || (session && profileLoading)) {
    return (
      <main
        role="status"
        aria-label="Loading session"
        className="min-h-screen bg-slate-50 flex items-center justify-center px-4"
      >
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-700 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-600">Loading workspace…</p>
        </div>
      </main>
    );
  }

  // 4. Unauthenticated -> Login screen
  if (!session) {
    return <LoginScreen />;
  }

  // 4. Profile read error
  if (profileError) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-lg space-y-4">
          <ErrorState
            title="Could not verify your account profile"
            message={profileError}
            onRetry={() => void loadUserProfile(session.user.id)}
          />
          <div className="text-center">
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
            >
              Sign out and switch account
            </button>
          </div>
        </div>
      </main>
    );
  }

  // 5. Role routing: admin, candidate, sme, or counsellor
  const portalArea = resolvePortalArea(profile);
  if (portalArea === 'candidate' && profile) {
    return (
      <CandidatePortal
        userId={session.user.id}
        profile={profile}
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />
    );
  }

  if (portalArea === 'sme' && profile) {
    return (
      <SmePortal
        userId={session.user.id}
        profile={profile}
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />
    );
  }

  if (portalArea === 'counsellor' && profile) {
    return (
      <CounsellorPortal
        userId={session.user.id}
        profile={profile}
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />
    );
  }

  if (portalArea !== 'admin' || !profile) {
    return (
      <ComingSoonScreen
        profile={profile}
        userEmail={session.user.email}
        mode={
          portalArea === 'admin' ||
          portalArea === 'candidate' ||
          portalArea === 'sme' ||
          portalArea === 'counsellor'
            ? 'missing_profile'
            : portalArea
        }
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />
    );
  }

  // 6. Authenticated Admin Portal
  return (
    <AdminLayout
      profile={profile}
      activeSection={activeSection}
      onNavigate={handleNavigateSection}
      breadcrumbs={breadcrumbs}
      onLogout={handleLogout}
      loggingOut={loggingOut}
    >
      {activeSection === 'dashboard' && (
        <DashboardView onNavigate={handleNavigateSection} />
      )}

      {activeSection === 'catalog' && (
        <CatalogView
          onNavigatePlacement={() => handleNavigateSection('placement')}
        />
      )}

      {activeSection === 'placement' && <PlacementTeamView />}

      {activeSection === 'staff' && (
        <StaffView
          currentUserId={session.user.id}
          onCurrentProfileUpdated={() => void loadUserProfile(session.user.id)}
        />
      )}

      {activeSection === 'batches' &&
        (selectedBatchId ? (
          <BatchDetailView
            batchId={selectedBatchId}
            onBack={() => {
              setSelectedBatchId(null);
              setSelectedBatchCode(null);
            }}
            onSelectCandidate={handleOpenCandidate}
            onBatchCodeLoaded={setSelectedBatchCode}
          />
        ) : (
          <BatchesView onSelectBatch={handleOpenBatch} />
        ))}

      {activeSection === 'candidates' &&
        (selectedCandidateId ? (
          <CandidateDetailView
            candidateId={selectedCandidateId}
            adminUserId={session.user.id}
            onBack={() => {
              setSelectedCandidateId(null);
              setSelectedCandidateCode(null);
            }}
            onSelectBatch={handleOpenBatch}
            onCandidateCodeLoaded={setSelectedCandidateCode}
          />
        ) : (
          <CandidatesView onSelectCandidate={handleOpenCandidate} />
        ))}

      {activeSection === 'payments' && (
        <PaymentsView
          adminUserId={session.user.id}
          onSelectCandidate={handleOpenCandidate}
        />
      )}

      {activeSection === 'document_review' && (
        <DocumentReviewView
          adminUserId={session.user.id}
          onSelectCandidate={handleOpenCandidate}
        />
      )}

      {activeSection === 'reports' && (
        <ReportsView
          onSelectCandidate={handleOpenCandidate}
          onSelectBatch={handleOpenBatch}
        />
      )}
    </AdminLayout>
  );
}
