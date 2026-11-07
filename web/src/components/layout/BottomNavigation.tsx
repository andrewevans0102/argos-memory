import { PenSquare, Clock, CheckSquare, Search, Mail } from 'lucide-react';

export type NavTab = 'capture' | 'recent' | 'actions' | 'search' | 'digests';

interface BottomNavigationProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

interface TabConfig {
  id: NavTab;
  label: string;
  icon: typeof PenSquare;
}

const TABS: TabConfig[] = [
  { id: 'capture', label: 'Capture', icon: PenSquare },
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'actions', label: 'Actions', icon: CheckSquare },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'digests', label: 'Digests', icon: Mail },
];

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <nav
      aria-label="App Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-lg pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={`relative flex flex-1 flex-col items-center justify-center py-1.5 transition-all duration-150 ${
                isActive
                  ? 'text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div
                className={`flex h-8 w-12 items-center justify-center rounded-xl transition-colors ${
                  isActive ? 'bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/20' : ''
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
              </div>
              <span className="mt-1 text-[11px] tracking-tight">{label}</span>
              {isActive && (
                <span className="absolute -bottom-1 h-1 w-6 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
