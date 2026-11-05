import React, { useState } from 'react';
import {
  ChevronRight,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { AccountMenu } from '../ui/AccountMenu';
import type { Profile } from '../../types/database';

export type CounsellorSection = 'home' | 'candidates';

export interface CounsellorBreadcrumb {
  label: string;
  onClick?: () => void;
}

interface CounsellorLayoutProps {
  profile: Profile;
  activeSection: CounsellorSection;
  breadcrumbs: CounsellorBreadcrumb[];
  onNavigate: (section: CounsellorSection) => void;
  onLogout: () => void;
  loggingOut?: boolean;
  children: React.ReactNode;
}

const COUNSELLOR_NAV: Array<{
  id: CounsellorSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'candidates', label: 'My Candidates', icon: GraduationCap },
];

export function CounsellorLayout({
  profile,
  activeSection,
  breadcrumbs,
  onNavigate,
  onLogout,
  loggingOut = false,
  children,
}: CounsellorLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelect = (section: CounsellorSection) => {
    onNavigate(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Counsellor navigation"
        className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-slate-900 text-slate-100 border-r border-slate-800"
      >
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            CohortDesk
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {COUNSELLOR_NAV.map((item) => {
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
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 shrink-0">
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
          className="fixed inset-0 z-40 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Counsellor navigation menu"
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
              {COUNSELLOR_NAV.map((item) => {
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
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-slate-800">
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
                Counsellor Portal
              </span>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={`${crumb.label}-${idx}`}>
                    <ChevronRight
                      className={`${
                        idx === 0 ? 'hidden sm:inline' : 'inline'
                      } w-4 h-4 text-slate-400 shrink-0`}
                    />
                    {crumb.onClick && !isLast ? (
                      <button
                        type="button"
                        onClick={crumb.onClick}
                        className="text-slate-600 hover:text-slate-900 font-medium transition-colors truncate"
                      >
                        {crumb.label}
                      </button>
                    ) : (
                      <span className="font-semibold text-slate-900 truncate">
                        {crumb.label}
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
