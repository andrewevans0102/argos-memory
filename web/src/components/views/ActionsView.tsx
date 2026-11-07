import { useState, useEffect, useMemo } from 'react';
import {
  CheckSquare,
  Square,
  Trash2,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  subscribeToActions,
  toggleActionCompletion,
  deleteAction,
  createAction,
} from '../../services/notes';
import type { ActionItem } from '../../types/note';

type FilterType = 'pending' | 'completed' | 'all';

export function ActionsView() {
  const { user } = useAuth();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterType>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [newActionText, setNewActionText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Subscribe to real-time action items updates
  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubscribe = subscribeToActions(
      user.uid,
      (fetchedActions) => {
        setActions(fetchedActions);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching actions:', err);
        setError(`Failed to load action items: ${err.message}`);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const pendingCount = useMemo(
    () => actions.filter((a) => !a.completed).length,
    [actions]
  );
  const completedCount = useMemo(
    () => actions.filter((a) => a.completed).length,
    [actions]
  );

  const filteredActions = useMemo(() => {
    return actions.filter((action) => {
      // Status filter
      if (filter === 'pending' && action.completed) return false;
      if (filter === 'completed' && !action.completed) return false;

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return action.text.toLowerCase().includes(query);
      }

      return true;
    });
  }, [actions, filter, searchQuery]);

  const handleToggle = async (action: ActionItem) => {
    if (!user) return;
    setTogglingId(action.id);
    try {
      await toggleActionCompletion(user.uid, action.id, action.completed);
    } catch (err: any) {
      console.error('Failed to toggle action:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (actionId: string) => {
    if (!user) return;
    if (!window.confirm('Delete this action item entirely?')) return;

    setDeletingId(actionId);
    try {
      await deleteAction(user.uid, actionId);
    } catch (err: any) {
      console.error('Failed to delete action:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newActionText.trim()) return;

    setIsAdding(true);
    try {
      await createAction(user.uid, newActionText.trim());
      setNewActionText('');
    } catch (err: any) {
      console.error('Failed to create action:', err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-in fade-in duration-150">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-amber-400" />
            <span>Action Items &amp; Follow-ups</span>
          </h2>
          <p className="text-xs text-slate-400">
            Persistent tasks extracted from your daily digests and notes
          </p>
        </div>

        {/* Counter Stats */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 font-medium text-amber-400">
            <Clock className="h-3.5 w-3.5" />
            <span>{pendingCount} Pending</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{completedCount} Done</span>
          </div>
        </div>
      </div>

      {/* Quick Add Action Form */}
      <form onSubmit={handleCreateAction} className="relative">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2 shadow-lg focus-within:border-amber-500/50 transition-colors">
          <input
            type="text"
            value={newActionText}
            onChange={(e) => setNewActionText(e.target.value)}
            placeholder="Add a new action item or follow-up..."
            className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isAdding || !newActionText.trim()}
            className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAdding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span>Add</span>
          </button>
        </div>
      </form>

      {/* Controls: Filter Pills & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-800/80 bg-slate-900/60 p-1 text-xs">
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`rounded-lg px-3 py-1 font-medium transition-colors ${
              filter === 'pending'
                ? 'bg-amber-500/10 text-amber-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('completed')}
            className={`rounded-lg px-3 py-1 font-medium transition-colors ${
              filter === 'completed'
                ? 'bg-emerald-500/10 text-emerald-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Completed ({completedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg px-3 py-1 font-medium transition-colors ${
              filter === 'all'
                ? 'bg-indigo-500/10 text-indigo-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({actions.length})
          </button>
        </div>

        {/* Search Input */}
        {actions.length > 0 && (
          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actions..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-colors"
            />
          </div>
        )}
      </div>

      {/* Actions List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500 mb-2" />
          <span className="text-xs">Loading action items...</span>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-xs text-rose-300">
          <AlertCircle className="h-6 w-6 text-rose-400 mx-auto mb-2" />
          <span>{error}</span>
        </div>
      ) : filteredActions.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-8 sm:p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/60 text-amber-400 mb-3 border border-amber-500/10">
            <Sparkles className="h-7 w-7" />
          </div>
          <h4 className="text-sm font-semibold text-white">
            {searchQuery
              ? 'No matching action items'
              : filter === 'pending'
                ? 'All caught up! No pending actions.'
                : filter === 'completed'
                  ? 'No completed action items yet'
                  : 'No action items recorded yet'}
          </h4>
          <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            {searchQuery
              ? 'Try adjusting your search terms.'
              : filter === 'pending'
                ? 'When Argos detects action items in your daily notes or digests, they will automatically appear here and in your morning email.'
                : 'Items marked as completed will be archived here for reference.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredActions.map((action) => {
            const isToggling = togglingId === action.id;
            const isDeleting = deletingId === action.id;

            return (
              <div
                key={action.id}
                className={`group flex items-start justify-between gap-3 rounded-xl border p-3.5 transition-all duration-150 ${
                  action.completed
                    ? 'border-slate-800/50 bg-slate-950/40 opacity-75'
                    : 'border-slate-800 bg-slate-900/70 shadow-sm hover:border-slate-700'
                }`}
              >
                {/* Completion Checkbox */}
                <button
                  type="button"
                  disabled={isToggling}
                  onClick={() => handleToggle(action)}
                  className="mt-0.5 shrink-0 rounded text-slate-400 hover:text-amber-400 focus:outline-none transition-colors"
                  title={action.completed ? 'Mark as pending' : 'Mark as completed'}
                >
                  {isToggling ? (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  ) : action.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Square className="h-4 w-4 text-amber-400/80 hover:text-amber-300" />
                  )}
                </button>

                {/* Action Text and Meta */}
                <div className="flex-1 min-w-0">
                  <div
                    onClick={() => handleToggle(action)}
                    className={`cursor-pointer text-xs leading-relaxed select-none ${
                      action.completed
                        ? 'line-through text-slate-500'
                        : 'text-slate-100 font-medium'
                    }`}
                  >
                    {action.text}
                  </div>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-slate-500">
                    {action.sourceDigestDate && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-800/60 px-1.5 py-0.5 text-slate-400">
                        <Calendar className="h-2.5 w-2.5 text-indigo-400" />
                        <span>Digest {action.sourceDigestDate}</span>
                      </span>
                    )}
                    {action.completed && action.completedAt && (
                      <span className="text-emerald-500/80">Completed</span>
                    )}
                  </div>
                </div>

                {/* Delete Action Button */}
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDelete(action.id)}
                  className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors focus:outline-none disabled:opacity-50"
                  title="Delete action item entirely"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
