import { useEffect, useRef, useState } from 'react';
import { ChevronUp, KeyRound, LogOut } from 'lucide-react';
import { getInitials } from '../../utils/domain';
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
        {/* Trigger Button displaying user name & email */}
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          className="w-full flex items-center justify-between gap-3 p-2.5 rounded-lg text-left hover:bg-slate-800/90 transition-colors group"
        >
          <div className="flex items-center gap-3 min-w-0">
            {avatarUrl && !imgFailed ? (
              <img
                src={avatarUrl}
                alt={fullName || 'Avatar'}
                onError={() => setImgFailed(true)}
                className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-900/60 border border-blue-700/60 flex items-center justify-center text-xs font-semibold text-blue-200 shrink-0 select-none">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate leading-tight">
                {fullName || 'User'}
              </p>
              <p className="text-xs text-slate-400 truncate mt-0.5 leading-tight">
                {email}
              </p>
            </div>
          </div>
          <ChevronUp
            className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${
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
            className="absolute bottom-full left-0 right-0 mb-2 bg-slate-900 border border-slate-700/80 rounded-xl shadow-xl p-1.5 z-50 space-y-1"
          >
            {roleLabel && (
              <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase text-slate-400 border-b border-slate-800">
                {roleLabel}
              </div>
            )}

            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setModalOpen(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-left"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-400 shrink-0" />
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
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-300 rounded-lg hover:bg-red-950/40 hover:text-red-200 transition-colors text-left disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5 text-red-400 shrink-0" />
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
