import React, { useState } from 'react';
import {
  BookOpen,
  Briefcase,
  Calendar,
  ChevronRight,
  FileCheck,
  FileSpreadsheet,
  GraduationCap,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Users,
  X,
} from 'lucide-react';
import type { Profile } from '../types/database';
import { AccountMenu } from './ui/AccountMenu';

export type AdminSection =
  | 'dashboard'
  | 'catalog'
  | 'placement'
  | 'staff'
  | 'batches'
  | 'candidates'
  | 'payments'
  | 'document_review'
  | 'reports'
  | 'tickets';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface AdminLayoutProps {
  profile: Profile;
  activeSection: AdminSection;
  onNavigate: (section: AdminSection) => void;
  breadcrumbs: BreadcrumbItem[];
  primaryAction?: React.ReactNode;
  openTicketsCount?: number;
  onLogout: () => void;
  loggingOut?: boolean;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: AdminSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'catalog', label: 'Programs & Modules', icon: BookOpen },
  { id: 'placement', label: 'Placement Team', icon: Briefcase },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'batches', label: 'Batches', icon: Calendar },
  { id: 'candidates', label: 'Candidates', icon: GraduationCap },
  { id: 'payments', label: 'Payments', icon: IndianRupee },
  { id: 'document_review', label: 'Document Review', icon: FileCheck },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { id: 'tickets', label: 'Tickets', icon: MessageSquare },
];

export function AdminLayout({
  profile,
  activeSection,
  onNavigate,
  breadcrumbs,
  primaryAction,
  openTicketsCount,
  onLogout,
  loggingOut = false,
  children,
}: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelectNav = (section: AdminSection) => {
    onNavigate(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-slate-900 text-slate-100 border-r border-slate-800"
      >
        <div className="h-14 px-5 flex items-center border-b border-slate-800 shrink-0">
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            CohortDesk
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.id === 'tickets' &&
                  typeof openTicketsCount === 'number' &&
                  openTicketsCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500 text-white tabular-nums">
                      {openTicketsCount}
                    </span>
                  )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 shrink-0">
          <AccountMenu
            fullName={profile.full_name || 'Administrator'}
            email={profile.email}
            roleLabel="Administrator"
            onLogout={onLogout}
            loggingOut={loggingOut}
          />
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
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
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectNav(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.id === 'tickets' &&
                      typeof openTicketsCount === 'number' &&
                      openTicketsCount > 0 && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500 text-white tabular-nums">
                          {openTicketsCount}
                        </span>
                      )}
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-slate-800">
              <AccountMenu
                fullName={profile.full_name || 'Administrator'}
                email={profile.email}
                roleLabel="Administrator"
                onLogout={onLogout}
                loggingOut={loggingOut}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace */}
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

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 whitespace-nowrap">
                Admin
              </span>
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={`${crumb.label}-${index}`}>
                    <ChevronRight
                      className={`w-4 h-4 text-slate-400 shrink-0 ${
                        index === 0 ? 'hidden sm:inline' : ''
                      }`}
                    />
                    {crumb.onClick && !isLast ? (
                      <button
                        type="button"
                        onClick={crumb.onClick}
                        className="text-slate-600 hover:text-slate-900 font-medium transition-colors whitespace-nowrap shrink-0"
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

          <div className="flex items-center gap-3 shrink-0">{primaryAction}</div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
