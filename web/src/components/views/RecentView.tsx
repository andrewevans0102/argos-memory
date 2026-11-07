import { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Tag,
  CheckSquare,
  Sparkles,
  Trash2,
  Maximize2,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  Search,
  Loader2,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { subscribeToNotes, deleteNote } from '../../services/notes';
import type { Note } from '../../types/note';

interface RecentViewProps {
  onGoToCapture?: () => void;
}

export function RecentView({ onGoToCapture }: RecentViewProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRawNotes, setExpandedRawNotes] = useState<Record<string, boolean>>({});
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Subscribe to real-time notes updates
  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubscribe = subscribeToNotes(
      user.uid,
      (fetchedNotes) => {
        setNotes(fetchedNotes);
        setLoading(false);
      },
      (err) => {
        setError(`Failed to load notes: ${err.message}`);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const activeNotes = user ? notes : [];
  const isLoading = user ? loading : false;

  // Extract all unique tags across notes for filtering
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((note) => {
      note.tags?.forEach((t) => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Filter notes by search query and active tag
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      // Tag filter
      if (selectedTag && !note.tags?.includes(selectedTag)) {
        return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = note.title?.toLowerCase().includes(query);
        const matchesSummary = note.summary?.toLowerCase().includes(query);
        const matchesRaw = note.rawText?.toLowerCase().includes(query);
        const matchesTag = note.tags?.some((t) => t.toLowerCase().includes(query));
        const matchesActions = note.actionItems?.some((a) => a.toLowerCase().includes(query));
        return matchesTitle || matchesSummary || matchesRaw || matchesTag || matchesActions;
      }
      return true;
    });
  }, [notes, selectedTag, searchQuery]);

  const toggleRawText = (noteId: string) => {
    setExpandedRawNotes((prev) => ({
      ...prev,
      [noteId]: !prev[noteId],
    }));
  };

  const handleDelete = async (noteId: string) => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to delete this note?')) return;

    setDeletingId(noteId);
    try {
      await deleteNote(user.uid, noteId);
    } catch (err: any) {
      alert(`Failed to delete note: ${err?.message || 'Unknown error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const formatNoteTime = (note: Note): string => {
    if (note.createdAt && typeof (note.createdAt as any).toDate === 'function') {
      const date = (note.createdAt as any).toDate() as Date;
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    if (note.dateString) {
      return note.dateString;
    }
    return 'Recently';
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Recent Notes</span>
            {!isLoading && (
              <span className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-normal text-slate-300 border border-slate-700/50">
                {activeNotes.length} {activeNotes.length === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400">
            Chronological memory log synthesized with Gemini Flash
          </p>
        </div>

        {onGoToCapture && (
          <button
            type="button"
            onClick={onGoToCapture}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-xl bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 border border-slate-700/60 hover:bg-slate-700 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>New Capture</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      {activeNotes.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search through titles, summaries, tags, or action items..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-2.5 pl-10 pr-10 text-xs text-slate-200 placeholder-slate-500 backdrop-blur-md focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tag Filter Pills */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-500 font-medium mr-1">Tags:</span>
              {selectedTag && (
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/20 px-2 py-1 text-[11px] font-medium text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors"
                >
                  <span>All</span>
                  <X className="h-3 w-3" />
                </button>
              )}
              {allTags.map((tag) => {
                const isActive = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(isActive ? null : tag)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <Tag className="h-2.5 w-2.5" />
                    <span>#{tag}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
          <p className="text-xs">Loading your memory log...</p>
        </div>
      )}

      {/* Empty State when no notes exist */}
      {!isLoading && activeNotes.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 mb-4 border border-indigo-500/20">
            <Clock className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-white">No memories logged yet</h3>
          <p className="mt-1.5 max-w-sm text-xs text-slate-400 leading-relaxed">
            Start capturing thoughts, tasks, and screenshots. Argos will store, structure, and synthesize them for you.
          </p>

          {onGoToCapture && (
            <button
              type="button"
              onClick={onGoToCapture}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md transition-transform hover:scale-105 active:scale-95"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Capture First Note
            </button>
          )}
        </div>
      )}

      {/* Empty filter results state */}
      {!isLoading && activeNotes.length > 0 && filteredNotes.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 px-6 py-12 text-center text-xs text-slate-400">
          <p>No notes matched your filter criteria.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedTag(null);
            }}
            className="mt-3 text-indigo-400 hover:underline font-medium"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Notes Feed List */}
      {!isLoading && filteredNotes.length > 0 && (
        <div className="space-y-4">
          {filteredNotes.map((note) => {
            const isRawExpanded = expandedRawNotes[note.id] || false;
            const isDeleting = deletingId === note.id;

            return (
              <article
                key={note.id}
                className={`group rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 sm:p-5 shadow-lg backdrop-blur-md transition-all hover:border-slate-700/80 hover:bg-slate-900/70 ${
                  isDeleting ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                {/* Note Header: Title & Time */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors">
                      {note.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-500" />
                        {formatNoteTime(note)}
                      </span>
                      {note.dateString && (
                        <>
                          <span>•</span>
                          <span className="text-slate-500">{note.dateString}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Delete action */}
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    title="Delete note"
                    className="text-slate-600 hover:text-red-400 p-1 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Gemini Summary */}
                {note.summary && (
                  <p className="mt-3 text-xs text-slate-300 leading-relaxed">
                    {note.summary}
                  </p>
                )}

                {/* Attached Images Thumbnail Grid */}
                {note.imageUrls && note.imageUrls.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {note.imageUrls.map((url, idx) => (
                      <div
                        key={idx}
                        className="group/img relative aspect-video overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
                      >
                        <img
                          src={url}
                          alt={`Note attachment ${idx + 1}`}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover/img:scale-105 cursor-pointer"
                          onClick={() => setEnlargedImageUrl(url)}
                        />
                        <button
                          type="button"
                          onClick={() => setEnlargedImageUrl(url)}
                          className="absolute bottom-1 right-1 rounded bg-black/60 p-1 text-slate-200 opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-black/80"
                          title="Enlarge image"
                        >
                          <Maximize2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Items extracted by Gemini */}
                {note.actionItems && note.actionItems.length > 0 && (
                  <div className="mt-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
                      <CheckSquare className="h-3 w-3" /> Action Items ({note.actionItems.length})
                    </div>
                    <ul className="space-y-1 text-xs text-slate-300">
                      {note.actionItems.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-amber-400 font-mono text-[11px] shrink-0">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tags */}
                {note.tags && note.tags.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {note.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          selectedTag === tag
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <Tag className="h-2.5 w-2.5" />
                        <span>#{tag}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Expandable Original User Text */}
                {note.rawText && note.rawText !== note.summary && (
                  <div className="mt-3 border-t border-slate-800/60 pt-2.5">
                    <button
                      type="button"
                      onClick={() => toggleRawText(note.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <FileText className="h-3 w-3" />
                      <span>{isRawExpanded ? 'Hide original capture' : 'View original capture'}</span>
                      {isRawExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>

                    {isRawExpanded && (
                      <div className="mt-2 rounded-xl bg-slate-950/70 p-3 text-xs font-mono text-slate-300 whitespace-pre-wrap border border-slate-800/80">
                        {note.rawText}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Enlarged image preview modal */}
      {enlargedImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] backdrop-blur-sm"
          onClick={() => setEnlargedImageUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-2">
            <button
              type="button"
              onClick={() => setEnlargedImageUrl(null)}
              className="absolute right-4 top-4 rounded-full bg-slate-950/80 p-1.5 text-slate-300 hover:text-white"
              aria-label="Close enlarged preview"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={enlargedImageUrl}
              alt="Enlarged preview"
              className="max-h-[85vh] max-w-[85vw] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
