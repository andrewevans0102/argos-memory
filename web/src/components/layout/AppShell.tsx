import { useState } from 'react';
import { Header } from './Header';
import { BottomNavigation, type NavTab } from './BottomNavigation';
import { CaptureView } from '../views/CaptureView';
import { RecentView } from '../views/RecentView';
import { ActionsView } from '../views/ActionsView';
import { SearchView } from '../views/SearchView';
import { DigestsView } from '../views/DigestsView';
import { ProfileModal } from '../common/ProfileModal';
import { usePwa } from '../../hooks/usePwa';
import { WifiOff, Download } from 'lucide-react';

export function AppShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('capture');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { isOnline, isInstallable, installApp } = usePwa();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header */}
      <Header
        isOnline={isOnline}
        isInstallable={isInstallable}
        onInstall={installApp}
        onOpenProfile={() => setIsProfileOpen(true)}
      />

      {/* Offline Alert Strip */}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-300 border-b border-amber-500/20">
          <WifiOff className="h-3.5 w-3.5" />
          <span>You are currently offline. Changes will sync once back online.</span>
        </div>
      )}

      {/* Install App Prompt Card (Mobile banner when installable) */}
      {isInstallable && (
        <div className="sm:hidden mx-4 mt-3 flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200">
          <div>
            <div className="font-semibold text-white">Install Argos PWA</div>
            <div className="text-[11px] text-indigo-300">Fast access from your home screen</div>
          </div>
          <button
            type="button"
            onClick={installApp}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white shadow hover:bg-indigo-500 active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Install</span>
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-6 sm:px-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        {activeTab === 'capture' && (
          <CaptureView onNoteCreated={() => setActiveTab('recent')} />
        )}
        {activeTab === 'recent' && (
          <RecentView onGoToCapture={() => setActiveTab('capture')} />
        )}
        {activeTab === 'actions' && <ActionsView />}
        {activeTab === 'search' && <SearchView />}
        {activeTab === 'digests' && (
          <DigestsView onOpenSettings={() => setIsProfileOpen(true)} />
        )}
      </main>

      {/* Bottom Tab Navigation */}
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Profile & Settings Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        isInstallable={isInstallable}
        onInstall={installApp}
      />
    </div>
  );
}
