import React, { useState } from 'react';
import {
  Calendar,
  ChevronRight,
  FileCheck2,
  Home,
  IndianRupee,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  User,
  X,
} from 'lucide-react';
import { AccountMenu } from '../ui/AccountMenu';
import type { Profile } from '../../types/database';

export type CandidateSection =
  | 'home'
  | 'onboarding'
  | 'fees'
  | 'timetable'
  | 'tickets'
  | 'profile';

interface CandidateLayoutProps {
  profile: Profile;
  candidateCode?: string | null;
  activeSection: CandidateSection;
  avatarUrl?: string | null;
  isTimetableLocked?: boolean;
  onNavigate: (section: CandidateSection) => void;
  onLogout: () => void;
  loggingOut?: boolean;
  children: React.ReactNode;
}

const CANDIDATE_NAV: Array<{
  id: CandidateSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'onboarding', label: 'Onboarding', icon: FileCheck2 },
  { id: 'fees', label: 'Fees', icon: IndianRupee },
  { id: 'timetable', label: 'Timetable', icon: Calendar },
  { id: 'tickets', label: 'Tickets', icon: MessageSquare },
  { id: 'profile', label: 'My profile', icon: User },
];

export function CandidateLayout({
  profile,
  candidateCode,
  activeSection,
  avatarUrl,
  isTimetableLocked = false,
  onNavigate,
  onLogout,
  loggingOut = false,
  children,
}: CandidateLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelect = (section: CandidateSection) => {
    onNavigate(section);
    setMobileMenuOpen(false);
  };

  const sectionLabel =
    activeSection === 'home'
      ? 'Home'
      : activeSection === 'onboarding'
        ? 'Onboarding'
        : activeSection === 'fees'
          ? 'Fees'
          : activeSection === 'timetable'
            ? 'Timetable'
            : 'My profile';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Candidate navigation"
        className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-slate-900 text-slate-100 border-r border-slate-800"
      >
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            CohortDesk
          </span>
          {candidateCode && (
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {candidateCode}
            </span>
          )}
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {CANDIDATE_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === 'timetable' && isTimetableLocked && (
                  <span title="Locked until profile photo and consent are completed">
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 shrink-0">
          <AccountMenu
            fullName={profile.full_name || 'Candidate'}
            email={profile.email}
            roleLabel="Candidate"
            avatarUrl={avatarUrl}
            onLogout={onLogout}
            loggingOut={loggingOut}
          />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Candidate navigation menu"
        >
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-64 max-w-[80vw] bg-slate-900 text-slate-100 flex flex-col h-full">
            <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="text-base font-bold tracking-tight text-white">
                CohortDesk
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
              {CANDIDATE_NAV.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.id === 'timetable' && isTimetableLocked && (
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-slate-800">
              <AccountMenu
                fullName={profile.full_name || 'Candidate'}
                email={profile.email}
                roleLabel="Candidate"
                avatarUrl={avatarUrl}
                onLogout={onLogout}
                loggingOut={loggingOut}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-8 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-sm min-w-0"
            >
              <span className="hidden sm:inline text-slate-400 whitespace-nowrap">
                Candidate Portal
              </span>
              <ChevronRight className="hidden sm:inline w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-900 truncate">
                {sectionLabel}
              </span>
            </nav>
          </div>

          {candidateCode && (
            <span className="lg:hidden font-mono text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap shrink-0">
              {candidateCode}
            </span>
          )}
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
