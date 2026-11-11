import { useEffect, useRef, useState } from 'react';
import { ChevronUp, KeyRound, Laptop, LogOut, Moon, Sun } from 'lucide-react';
import { getInitials } from '../../utils/domain';
import { useTheme } from '../../utils/theme';
import { ChangePasswordModal } from './ChangePasswordModal';

interface AccountMenuProps {
  fullName?: string | null;
  email: string;
  roleLabel?: string;
  avatarUrl?: string | null;
  onLogout: () => void;
  loggingOut?: boolean;
}

export function AccountMenu({
  fullName,
  email,
  roleLabel,
  avatarUrl,
  onLogout,
  loggingOut = false,
}: AccountMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { themeSetting, setTheme } = useTheme();

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [menuOpen]);

  const initials = getInitials(fullName);

  return (
    <>
      <div ref={containerRef} className="relative w-full">
        {/* Trigger Button displaying user photo/initials, name, role label */}
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          className="w-full flex items-center justify-between gap-3 p-2 rounded-lg text-left hover:bg-[#12294A] transition-colors group focus:outline-none focus:ring-2 focus:ring-[#0FA3A3]"
        >
          <div className="flex items-center gap-3 min-w-0">
            {avatarUrl && !imgFailed ? (
              <img
                src={avatarUrl}
                alt={fullName || 'Avatar'}
                onError={() => setImgFailed(true)}
                className="w-9 h-9 rounded-full object-cover border border-[#12294A] shadow-xs shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#12294A] border border-[#0FA3A3]/40 flex items-center justify-center text-xs font-bold text-white shrink-0 select-none font-display">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate leading-tight font-display">
                {fullName || 'User'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-300 truncate">
                {roleLabel && (
                  <span className="font-medium text-[#0FA3A3] truncate">
                    {roleLabel}
                  </span>
                )}
                <span className="text-slate-500" aria-hidden="true">·</span>
                <span className="truncate text-slate-400 text-[11px] font-mono">
                  {email}
                </span>
              </div>
            </div>
          </div>
          <ChevronUp
            className={`w-4 h-4 text-slate-400 transition-transform shrink-0 group-hover:text-white ${
              menuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Dropdown popup */}
        {menuOpen && (
          <div
            role="menu"
            aria-orientation="vertical"
            aria-label="Account options"
            className="absolute bottom-full left-0 right-0 mb-2 bg-[#081629] border border-[#12294A] rounded-xl shadow-xl p-1.5 z-50 space-y-1"
          >
            {roleLabel && (
              <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase text-slate-400 border-b border-[#12294A]">
                {roleLabel}
              </div>
            )}

            {/* Theme switcher */}
            <div className="px-2 py-1.5 border-b border-[#12294A]">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-1.5 px-1">
                <span>Theme</span>
                <span className="text-slate-500 capitalize">{themeSetting}</span>
              </div>
              <div
                role="group"
                aria-label="Theme mode"
                className="grid grid-cols-3 gap-1 bg-[#0B1F3A] p-0.5 rounded-lg border border-[#12294A]"
              >
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex items-center justify-center gap-1 py-1 px-1.5 text-xs font-medium rounded-md transition-colors ${
                    themeSetting === 'light'
                      ? 'bg-[#12294A] text-white shadow-xs font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  aria-pressed={themeSetting === 'light'}
                  title="Light mode"
                >
                  <Sun className={`w-3.5 h-3.5 shrink-0 ${themeSetting === 'light' ? 'text-[#0FA3A3]' : ''}`} />
                  <span className="text-[11px]">Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex items-center justify-center gap-1 py-1 px-1.5 text-xs font-medium rounded-md transition-colors ${
                    themeSetting === 'dark'
                      ? 'bg-[#12294A] text-white shadow-xs font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  aria-pressed={themeSetting === 'dark'}
                  title="Dark mode"
                >
                  <Moon className={`w-3.5 h-3.5 shrink-0 ${themeSetting === 'dark' ? 'text-[#0FA3A3]' : ''}`} />
                  <span className="text-[11px]">Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`flex items-center justify-center gap-1 py-1 px-1.5 text-xs font-medium rounded-md transition-colors ${
                    themeSetting === 'system'
                      ? 'bg-[#12294A] text-white shadow-xs font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  aria-pressed={themeSetting === 'system'}
                  title="Follow system preference"
                >
                  <Laptop className={`w-3.5 h-3.5 shrink-0 ${themeSetting === 'system' ? 'text-[#0FA3A3]' : ''}`} />
                  <span className="text-[11px]">System</span>
                </button>
              </div>
            </div>

            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setModalOpen(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 rounded-lg hover:bg-[#12294A] hover:text-white transition-colors text-left"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#0FA3A3] shrink-0" />
              <span>Change password</span>
            </button>

            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              disabled={loggingOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-300 rounded-lg hover:bg-[#C2413B]/20 hover:text-red-200 transition-colors text-left disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5 text-[#C2413B] shrink-0" />
              <span>{loggingOut ? 'Signing out…' : 'Log out'}</span>
            </button>
          </div>
        )}
      </div>

      <ChangePasswordModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        userEmail={email}
      />
    </>
  );
}
