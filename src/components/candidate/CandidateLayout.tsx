import React, { useState } from 'react';
import {
  Calendar,
  FileCheck2,
  Home,
  IndianRupee,
  Lock,
  Menu,
  MessageSquare,
  MoreHorizontal,
  User,
  X,
} from 'lucide-react';
import { AccountMenu } from '../ui/AccountMenu';
import { BrandLogo } from '../ui/BrandLogo';
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
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'onboarding', label: 'Onboarding', icon: FileCheck2 },
  { id: 'fees', label: 'Fees', icon: IndianRupee },
  { id: 'timetable', label: 'Timetable', icon: Calendar },
  { id: 'tickets', label: 'Tickets', icon: MessageSquare },
  { id: 'profile', label: 'My profile', icon: User },
];

const BOTTOM_NAV_ITEMS: Array<{
  id: CandidateSection;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'onboarding', label: 'Onboarding', icon: FileCheck2 },
  { id: 'fees', label: 'Fees', icon: IndianRupee },
  { id: 'tickets', label: 'Tickets', icon: MessageSquare },
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

  const sectionDescriptions: Record<CandidateSection, string> = {
    home: 'Your enrollment overview, next installments, and onboarding steps.',
    onboarding: 'Complete your profile photo, document uploads, and consent agreements.',
    fees: 'Installment schedule, fee balance, and payment submissions.',
    timetable: 'Weekly scheduled classes and live session links.',
    tickets: 'Helpdesk requests, support messages, and administrative follow-up.',
    profile: 'Your verified enrollment credentials and registered contact info.',
  };

  const sectionTitles: Record<CandidateSection, string> = {
    home: 'Student Dashboard',
    onboarding: 'Onboarding & Verification',
    fees: 'Fees & Payments',
    timetable: 'Class Timetable',
    tickets: 'Support Tickets',
    profile: 'My Profile',
  };

  return (
    <div className="min-h-screen bg-[#F5F8FB] flex flex-col md:flex-row">
      {/* Desktop Sidebar (260px wide, dark navy #0B1F3A) */}
      <aside
        aria-label="Candidate navigation"
        className="hidden md:flex md:flex-col md:w-[260px] md:fixed md:inset-y-0 bg-[#0B1F3A] text-slate-100 border-r border-[#12294A] z-40"
      >
        <div className="h-16 px-5 flex items-center justify-between bg-[#081629] border-b border-[#12294A] shrink-0">
          <BrandLogo variant="dark" size="md" />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {CANDIDATE_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap group ${
                  isActive
                    ? 'bg-[#12294A] text-white before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#0FA3A3] before:rounded-r'
                    : 'text-slate-300 hover:text-white hover:bg-[#12294A]/70'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-[#0FA3A3]' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                  strokeWidth={1.75}
                />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.id === 'timetable' && isTimetableLocked && (
                  <span title="Locked until profile photo and consent are completed">
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.75} />
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 bg-[#081629]/70 border-t border-[#12294A] shrink-0">
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

      {/* Mobile Top Bar (Under 768px) */}
      <header className="md:hidden sticky top-0 z-30 h-14 px-4 bg-white border-b border-[#E3E9F0] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open full menu"
            className="p-2 -ml-2 text-[#0B1F3A] hover:bg-[#F5F8FB] rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <BrandLogo variant="light" size="sm" />
        </div>

        {candidateCode && (
          <span className="font-mono text-xs font-semibold text-[#0B7C7C] bg-[#E6F6F6] px-2 py-0.5 rounded tabular-nums">
            {candidateCode}
          </span>
        )}
      </header>

      {/* Mobile Navigation Drawer (Under 768px) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Candidate navigation menu"
        >
          <div
            className="fixed inset-0 bg-[#0B1F3A]/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-[260px] max-w-[85vw] bg-[#0B1F3A] text-slate-100 flex flex-col h-full shadow-2xl">
            <div className="h-16 px-5 flex items-center justify-between bg-[#081629] border-b border-[#12294A]">
              <BrandLogo variant="dark" size="sm" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-[#12294A] rounded-lg transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {CANDIDATE_NAV.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#12294A] text-white before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#0FA3A3] before:rounded-r'
                        : 'text-slate-300 hover:text-white hover:bg-[#12294A]/70'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#0FA3A3]' : 'text-slate-400'}`}
                      strokeWidth={1.75}
                    />
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.id === 'timetable' && isTimetableLocked && (
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.75} />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="p-3 bg-[#081629]/70 border-t border-[#12294A]">
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

      {/* Main Content Viewport */}
      <div className="flex-1 md:pl-[260px] flex flex-col min-w-0">
        <header className="hidden md:flex sticky top-0 z-30 h-16 px-6 sm:px-8 bg-white border-b border-[#E3E9F0] items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A] font-display tracking-tight">
              {sectionTitles[activeSection]}
            </h1>
            <p className="text-xs text-[#5B6B7F] truncate">
              {sectionDescriptions[activeSection]}
            </p>
          </div>

          {candidateCode && (
            <div className="flex items-center gap-2 px-3 py-1 bg-[#E6F6F6] border border-[#0FA3A3]/20 rounded-lg">
              <span className="text-[11px] font-medium text-[#0B7C7C]">Code:</span>
              <span className="font-mono text-xs font-semibold text-[#0B1F3A] tabular-nums">
                {candidateCode}
              </span>
            </div>
          )}
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1280px] w-full mx-auto pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Under 768px: Home, Onboarding, Fees, Tickets + More) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E3E9F0] z-30 flex items-center justify-around px-2 py-1.5 shadow-lg"
      >
        {BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-lg transition-colors min-h-[44px] ${
                isActive
                  ? 'text-[#0FA3A3] font-semibold'
                  : 'text-[#5B6B7F] hover:text-[#0B1F3A]'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
              <span className="text-[11px] mt-0.5 leading-tight truncate">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="More navigation options"
          className="flex-1 flex flex-col items-center justify-center py-1 px-1 text-[#5B6B7F] hover:text-[#0B1F3A] rounded-lg transition-colors min-h-[44px]"
        >
          <MoreHorizontal className="w-5 h-5 shrink-0" strokeWidth={1.75} />
          <span className="text-[11px] mt-0.5 leading-tight">More</span>
        </button>
      </nav>
    </div>
  );
}
