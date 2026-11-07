import { useState, useRef, type FormEvent } from 'react';
import {
  Search,
  Sparkles,
  HelpCircle,
  X,
  Loader2,
  Calendar,
  Tag,
  CheckSquare,
  Maximize2,
  AlertCircle,
  ArrowRight,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { searchNotes } from '../../services/notes';
import { MarkdownView } from '../common/MarkdownView';
import type { QueryNotesResult, CitedNote } from '../../types/note';

const SUGGESTED_QUERIES = [
  'What did I work on yesterday?',
  'Where did I park the car?',
  'Receipt for espresso machine',
  'Follow-ups from last week\'s team meeting',
  'What are my pending tasks and action items?',
];

export function SearchView() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryNotesResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (queryToSearch: string) => {
    const trimmed = queryToSearch.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await searchNotes({
        query: trimmed,
        limit: 20,
      });

      setResult(response);
      setHistory((prev) => {
        const filtered = prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
        return [trimmed, ...filtered].slice(0, 5);
      });
    } catch (err: any) {
      console.error('Error in Ask Argos search:', err);
      setError(err?.message || 'Failed to search your notes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    handleSearch(suggestion);
  };

  const handleClear = () => {
    setQuery('');
    setResult(null);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* View Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">Ask Argos</h2>
          <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-500/20">
            Semantic Memory
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Query your personal memory log in plain English. Argos filters relevant candidate notes and synthesizes direct answers with cited dates.
        </p>
      </div>

      {/* Search Input Form */}
      <form onSubmit={onSubmit} className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question about your notes, receipts, or past events..."
          disabled={loading || !user}
          className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 py-3.5 pl-12 pr-24 text-sm text-slate-100 placeholder-slate-500 shadow-xl backdrop-blur-md transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {query && !loading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <button
            type="submit"
            disabled={!query.trim() || loading || !user}
            className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span>Ask</span>
                <ArrowRight className="h-3 w-3" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Query Suggestions */}
      {!result && !loading && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Try asking:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => handleSuggestionClick(sample)}
                className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800/80 hover:text-white"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Queries In Current Session */}
      {history.length > 0 && !loading && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
          <Clock className="h-3 w-3" />
          <span>Recent queries:</span>
          {history.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSuggestionClick(q)}
              className="text-slate-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
            >
              "{q}"
            </button>
          ))}
        </div>
      )}

      {/* Error Card */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => handleSearch(query)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-300 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Retry Question</span>
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="rounded-2xl border border-indigo-500/20 bg-slate-900/50 p-6 shadow-xl backdrop-blur-md space-y-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <div>
              <div className="h-4 w-48 rounded bg-slate-800" />
              <div className="mt-1 h-3 w-32 rounded bg-slate-800/60" />
            </div>
          </div>
          <div className="space-y-2.5 pt-2">
            <div className="h-3.5 w-full rounded bg-slate-800/80" />
            <div className="h-3.5 w-5/6 rounded bg-slate-800/80" />
            <div className="h-3.5 w-4/6 rounded bg-slate-800/80" />
          </div>
          <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Searching candidate notes & synthesizing answer...</span>
            <span className="font-mono">Gemini Flash</span>
          </div>
        </div>
      )}

      {/* Conversational Answer Card */}
      {!loading && result && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/30 to-slate-900/70 p-5 sm:p-6 shadow-xl backdrop-blur-md space-y-4">
            {/* Answer Header */}
            <div className="flex items-start justify-between gap-3 border-b border-indigo-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white shadow-md">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-200">
                    Argos Memory Recall
                  </h3>
                  <p className="text-[11px] text-indigo-300">
                    Question: "{result.query}"
                  </p>
                </div>
              </div>

              {result.candidateCount > 0 && (
                <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300 border border-indigo-500/20 shrink-0">
                  {result.candidateCount} candidate{result.candidateCount === 1 ? '' : 's'} reviewed
                </span>
              )}
            </div>

            {/* Answer Content */}
            <div className="text-slate-100 text-xs sm:text-sm">
              <MarkdownView content={result.answer} />
            </div>
          </div>

          {/* Cited Notes Section */}
          {result.citedNotes && result.citedNotes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Cited Notes & Sources ({result.citedNotes.length})
                </h4>
                <span className="text-[11px] text-slate-500">
                  Retrieved from your personal timeline
                </span>
              </div>

              <div className="space-y-3">
                {result.citedNotes.map((note) => (
                  <CitedNoteCard
                    key={note.id}
                    note={note}
                    onEnlargeImage={(url) => setEnlargedImageUrl(url)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* New Question Prompt */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Ask another question</span>
            </button>
          </div>
        </div>
      )}

      {/* Info Card when no search performed yet */}
      {!result && !loading && (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-xs text-slate-400">
          <div className="flex items-start gap-2.5">
            <HelpCircle className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
            <div>
              <span className="font-medium text-slate-300">Intelligent memory retrieval (Phase 6): </span>
              Argos scores and filters candidate notes by relevance and date range before passing context to Gemini Flash, ensuring fast responses with minimal token usage.
            </div>
          </div>
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

interface CitedNoteCardProps {
  note: CitedNote;
  onEnlargeImage: (url: string) => void;
}

function CitedNoteCard({ note, onEnlargeImage }: CitedNoteCardProps) {
  return (
    <article className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 shadow-sm transition-colors hover:border-slate-700/80 hover:bg-slate-900/60 space-y-2.5">
      {/* Title & Date */}
      <div className="flex items-start justify-between gap-2">
        <h5 className="text-xs font-semibold text-white">
          {note.title}
        </h5>
        {note.dateString && (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 shrink-0">
            <Calendar className="h-3 w-3 text-slate-500" />
            {note.dateString}
          </span>
        )}
      </div>

      {/* Summary */}
      {note.summary && (
        <p className="text-xs text-slate-300 leading-relaxed">
          {note.summary}
        </p>
      )}

      {/* Action items if any */}
      {note.actionItems && note.actionItems.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-300 uppercase tracking-wider">
            <CheckSquare className="h-2.5 w-2.5" /> Action Items
          </div>
          <ul className="space-y-0.5 text-[11px] text-slate-300">
            {note.actionItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-amber-400 font-mono text-[10px] shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Image attachments thumbnail preview */}
      {note.imageUrls && note.imageUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {note.imageUrls.map((url, idx) => (
            <div
              key={idx}
              className="group/img relative aspect-video overflow-hidden rounded-lg border border-slate-800 bg-slate-950"
            >
              <img
                src={url}
                alt={`Cited note image ${idx + 1}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform group-hover/img:scale-105 cursor-pointer"
                onClick={() => onEnlargeImage(url)}
              />
              <button
                type="button"
                onClick={() => onEnlargeImage(url)}
                className="absolute bottom-1 right-1 rounded bg-black/60 p-0.5 text-slate-200 opacity-0 group-hover/img:opacity-100 transition-opacity"
                title="Enlarge preview"
              >
                <Maximize2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tags */}
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400 font-medium"
            >
              <Tag className="h-2 w-2" />
              <span>#{tag}</span>
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
