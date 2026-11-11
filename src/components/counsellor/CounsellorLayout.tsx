import React, { useState } from 'react';
import {
  Calendar,
  ChevronRight,
  GraduationCap,
  Home,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { AccountMenu } from '../ui/AccountMenu';
import { BrandLogo } from '../ui/BrandLogo';
import type { Profile } from '../../types/database';

export type CounsellorSection = 'home' | 'candidates' | 'batches';

export interface CounsellorBreadcrumb {
  label: string;
  onClick?: () => void;
}

export interface CounsellorLayoutProps {
  profile: Profile;
  activeSection: CounsellorSection;
  onNavigate: (section: CounsellorSection) => void;
  onLogout: () => void;
  loggingOut?: boolean;
  breadcrumbs?: CounsellorBreadcrumb[];
  selectedCandidateCode?: string | null;
  onClearSelectedCandidate?: () => void;
  selectedBatchCode?: string | null;
  onClearSelectedBatch?: () => void;
  children: React.ReactNode;
}

const COUNSELLOR_NAV: Array<{
  id: CounsellorSection;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { id: 'home', label: 'Counsellor Home', icon: Home },
  { id: 'candidates', label: 'My Candidates', icon: Users },
  { id: 'batches', label: 'Batches', icon: Calendar },
];

export function CounsellorLayout({
  profile,
  activeSection,
  onNavigate,
  onLogout,
  loggingOut = false,
  breadcrumbs,
  selectedCandidateCode,
  onClearSelectedCandidate,
  selectedBatchCode,
  onClearSelectedBatch,
  children,
}: CounsellorLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelect = (section: CounsellorSection) => {
    onNavigate(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F8FB] flex">
      {/* Desktop Sidebar (260px wide, dark navy #0B1F3A) */}
      <aside
        aria-label="Counsellor navigation"
        className="hidden lg:flex lg:flex-col lg:w-[260px] lg:fixed lg:inset-y-0 bg-[#0B1F3A] text-slate-100 border-r border-[#12294A] z-40"
      >
        <div className="h-16 px-5 flex items-center justify-between bg-[#081629] border-b border-[#12294A] shrink-0">
          <BrandLogo variant="dark" size="md" />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {COUNSELLOR_NAV.map((item) => {
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
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 bg-[#081629]/70 border-t border-[#12294A] shrink-0">
          <AccountMenu
            fullName={profile.full_name || 'Academic Counsellor'}
            email={profile.email}
            roleLabel="Academic Counsellor"
            onLogout={onLogout}
            loggingOut={loggingOut}
          />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Counsellor navigation menu"
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
              {COUNSELLOR_NAV.map((item) => {
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
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-3 bg-[#081629]/70 border-t border-[#12294A]">
              <AccountMenu
                fullName={profile.full_name || 'Academic Counsellor'}
                email={profile.email}
                roleLabel="Academic Counsellor"
                onLogout={onLogout}
                loggingOut={loggingOut}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:pl-[260px] flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-8 bg-white border-b border-[#E3E9F0] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-[#0B1F3A] hover:bg-[#F5F8FB] rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" strokeWidth={1.75} />
            </button>

            <div className="flex items-center gap-2.5 lg:hidden mr-1">
              <BrandLogo variant="light" size="sm" showName={false} />
            </div>

            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-sm min-w-0"
            >
              <span className="hidden sm:inline text-[#5B6B7F] font-medium whitespace-nowrap">
                Academic Counselling
              </span>
              <ChevronRight
                className="hidden sm:inline w-4 h-4 text-[#8E9BAE] shrink-0"
                strokeWidth={1.75}
              />
              {breadcrumbs && breadcrumbs.length > 0 ? (
                breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={crumb.label}>
                      {idx > 0 && (
                        <ChevronRight
                          className="w-4 h-4 text-[#8E9BAE] shrink-0"
                          strokeWidth={1.75}
                        />
                      )}
                      {crumb.onClick && !isLast ? (
                        <button
                          type="button"
                          onClick={crumb.onClick}
                          className="text-[#5B6B7F] hover:text-[#0B1F3A] font-medium transition-colors truncate max-w-[200px]"
                        >
                          {crumb.label}
                        </button>
                      ) : (
                        <span className="font-semibold text-[#0B1F3A] font-display truncate max-w-[240px]">
                          {crumb.label}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <span className="font-semibold text-[#0B1F3A] font-display truncate">
                  {activeSection === 'home'
                    ? 'Counsellor Home'
                    : activeSection === 'candidates'
                      ? selectedCandidateCode
                        ? `Candidate ${selectedCandidateCode}`
                        : 'My Candidates'
                      : selectedBatchCode
                        ? `Batch ${selectedBatchCode}`
                        : 'Batches'}
                </span>
              )}
            </nav>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1280px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
