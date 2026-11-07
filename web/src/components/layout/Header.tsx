import { ArgosHoundLogo } from '../common/ArgosHoundLogo';
import { useAuth } from '../../hooks/useAuth';
import { Wifi, WifiOff, Download, User as UserIcon } from 'lucide-react';

interface HeaderProps {
  isOnline: boolean;
  isInstallable: boolean;
  onInstall: () => void;
  onOpenProfile: () => void;
}

export function Header({ isOnline, isInstallable, onInstall, onOpenProfile }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5">
          <ArgosHoundLogo className="h-9 w-9" />
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-tight text-white text-lg">Argos</span>
            <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400 border border-indigo-500/20">
              PWA
            </span>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Online/Offline indicator */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
              isOnline
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
            }`}
          >
            {isOnline ? (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden sm:inline">Online</span>
                <Wifi className="h-3 w-3 sm:hidden" />
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Offline</span>
              </>
            )}
          </div>

          {/* Install prompt button */}
          {isInstallable && (
            <button
              type="button"
              onClick={onInstall}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Install App</span>
            </button>
          )}

          {/* User profile button */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:bg-slate-800 transition-colors"
            title={user?.email || 'Account'}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600/30 text-indigo-300 font-semibold text-[10px]">
              {user?.email ? user.email[0].toUpperCase() : <UserIcon className="h-3 w-3" />}
            </div>
            <span className="hidden sm:inline-block max-w-[120px] truncate text-slate-300">
              {user?.email?.split('@')[0]}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
