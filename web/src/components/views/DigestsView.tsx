import { useState, useEffect } from 'react';
import {
  Calendar,
  Mail,
  Bell,
  CheckCircle2,
  Sparkles,
  Loader2,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Clock,
  Settings,
  AlertCircle,
  FileText,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { subscribeToDigests, deleteDigest, triggerDigest } from '../../services/notes';
import { MarkdownView } from '../common/MarkdownView';
import type { Digest, MediaUrl } from '../../types/note';

interface DigestsViewProps {
  onOpenSettings?: () => void;
}

function formatDigestDisplayDate(dateString: string): string {
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return dateString;
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return dateString;
  }
}

function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DigestsView({ onOpenSettings }: DigestsViewProps) {
  const { userProfile, user } = useAuth();
  const timezone = userProfile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const digestHour = userProfile?.digestHour ?? 6;
  const emailEnabled = userProfile?.emailNotificationsEnabled ?? true;

  const [digests, setDigests] = useState<Digest[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);

  const [todayDate] = useState(() => getTodayDateString());

  // Manual Trigger controls state
  const [targetDate, setTargetDate] = useState(getYesterdayDateString());
  const [forceTrigger, setForceTrigger] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerBanner, setTriggerBanner] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // Expanded items (default expands latest digest)
  const [expandedDigestIds, setExpandedDigestIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Image lightbox preview
  const [previewMedia, setPreviewMedia] = useState<MediaUrl | null>(null);

  // Subscribe to real-time digests collection
  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubscribe = subscribeToDigests(
      user.uid,
      (updatedDigests) => {
        setDigests(updatedDigests);
        setLoading(false);
        // Expand the most recent digest automatically if nothing is open yet
        if (updatedDigests.length > 0) {
          setExpandedDigestIds((prev) => {
            if (prev.size === 0 && updatedDigests[0]?.id) {
              return new Set([updatedDigests[0].id]);
            }
            return prev;
          });
        }
      },
      (err) => {
        console.error('Failed to subscribe to digests:', err);
        setError('Failed to load daily digests.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const toggleExpand = (id: string) => {
    setExpandedDigestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleManualTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDate) return;

    setIsTriggering(true);
    setTriggerBanner(null);

    try {
      const result = await triggerDigest({
        date: targetDate,
        force: forceTrigger,
        sendEmail: emailEnabled,
      });

      if (result.skipped) {
        if (result.reason === 'zero-activity') {
          setTriggerBanner({
            type: 'info',
            message: `Zero-Activity Gate: No notes found on ${result.date}. Digest synthesis skipped.`,
          });
        } else if (result.reason === 'already-generated') {
          setTriggerBanner({
            type: 'info',
            message: `Digest for ${result.date} already exists. Check the archive below, or enable "Force re-generate".`,
          });
        } else {
          setTriggerBanner({
            type: 'info',
            message: `Digest skipped: ${result.reason}`,
          });
        }
      } else {
        const emailNotice = result.emailMessageId
          ? ' Email delivered via Resend!'
          : emailEnabled
            ? ' (No email dispatched)'
            : ' (Email skipped per settings)';
        setTriggerBanner({
          type: 'success',
          message: `Successfully generated digest for ${result.date} (${result.noteCount} notes).${emailNotice}`,
        });
        // Expand the newly triggered digest
        if (result.digestId) {
          setExpandedDigestIds((prev) => new Set([...prev, result.digestId!]));
        }
      }
    } catch (err: any) {
      console.error('Manual digest trigger error:', err);
      setTriggerBanner({
        type: 'error',
        message: err?.message || 'Failed to generate daily digest.',
      });
    } finally {
      setIsTriggering(false);
    }
  };

  const handleDeleteDigest = async (digestId: string) => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to delete this Daily Digest archive?')) return;

    setDeletingId(digestId);
    try {
      await deleteDigest(user.uid, digestId);
    } catch (err) {
      console.error('Failed to delete digest:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyMarkdown = (digest: Digest) => {
    if (!digest.contentMarkdown) return;
    navigator.clipboard.writeText(digest.contentMarkdown);
    setCopiedId(digest.id || digest.date);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const formatScheduleHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:00 ${period}`;
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-400" />
            <span>Daily Digests Archive</span>
          </h2>
          <p className="text-xs text-slate-400">
            Automated intelligence briefings, reflections, and synthesized action items
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-700 hover:bg-slate-800 transition-colors"
            >
              <Settings className="h-3.5 w-3.5 text-slate-400" />
              <span>Digest Settings</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Active</span>
          </div>
        </div>
      </div>

      {/* Scheduler Status Summary Card */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Mail className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">Automated Morning Briefing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Synthesized every day at{' '}
              <span className="font-semibold text-amber-300">{formatScheduleHour(digestHour)}</span>{' '}
              ({timezone})
              {emailEnabled ? (
                <>
                  {' '}and emailed via Resend to{' '}
                  <span className="font-mono text-slate-300">{user?.email}</span>.
                </>
              ) : (
                <> and archived here in your library (email delivery turned off).</>
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t border-slate-800/60 pt-3 text-xs text-slate-400">
          <div>
            <span className="block text-[10px] text-slate-400 uppercase font-semibold">Delivery</span>
            <span className="text-slate-200">{emailEnabled ? 'Resend HTML Email' : 'In-App Archive Only'}</span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-400 uppercase font-semibold">Timezone</span>
            <span className="text-slate-200">{timezone}</span>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="block text-[10px] text-slate-400 uppercase font-semibold">Total Briefings</span>
            <span className="text-slate-200 font-semibold">{digests.length} saved</span>
          </div>
        </div>
      </div>

      {/* Manual "Trigger Digest Now" Control Card */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Trigger Digest On Demand</h3>
          </div>
          <span className="text-[11px] text-slate-400">Testing & Instant Generation</span>
        </div>

        <form onSubmit={handleManualTrigger} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
            {/* Target Date Picker */}
            <div className="sm:col-span-6 space-y-1">
              <label htmlFor="argos-target-date-input" className="block text-[11px] font-medium text-slate-300">
                Target Date (Notes to aggregate)
              </label>
              <div className="relative">
                <input
                  id="argos-target-date-input"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  max={todayDate}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Force checkbox */}
            <div className="sm:col-span-3 flex items-center gap-2 pb-2">
              <input
                id="force-digest"
                type="checkbox"
                checked={forceTrigger}
                onChange={(e) => setForceTrigger(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500/20"
              />
              <label htmlFor="force-digest" className="text-xs text-slate-300 select-none cursor-pointer">
                Force re-generate
              </label>
            </div>

            {/* Trigger Button */}
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={isTriggering || !targetDate}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold text-slate-950 shadow-lg hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTriggering ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Generate Now</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Feedback banner */}
          {triggerBanner && (
            <div
              className={`flex items-start gap-2 rounded-xl p-3 text-xs border animate-in fade-in duration-200 ${
                triggerBanner.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : triggerBanner.type === 'info'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              {triggerBanner.type === 'success' ? (
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : triggerBanner.type === 'info' ? (
                <Bell className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <div className="flex-1 leading-relaxed">{triggerBanner.message}</div>
              <button
                type="button"
                onClick={() => setTriggerBanner(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Digests List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Past Daily Digests ({digests.length})
          </h3>
          {digests.length > 0 && (
            <span className="text-[11px] text-slate-400">Click to expand or collapse</span>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
            <span className="text-xs">Loading digest history...</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-xs text-rose-300">
            <AlertCircle className="h-6 w-6 text-rose-400 mx-auto mb-2" />
            <span>{error}</span>
          </div>
        ) : digests.length === 0 ? (
          /* Empty State */
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-8 sm:p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/60 text-amber-400 mb-3 border border-amber-500/10">
              <Calendar className="h-7 w-7" />
            </div>
            <h4 className="text-sm font-semibold text-white">No previous digests yet</h4>
            <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Capture your notes, ideas, and photos today! Tomorrow at{' '}
              <strong className="text-slate-300">{formatScheduleHour(digestHour)}</strong>, Argos Cloud
              Scheduler will synthesize your first executive morning briefing.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTargetDate(getYesterdayDateString());
                  setForceTrigger(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Test Generate for Yesterday</span>
              </button>
            </div>
          </div>
        ) : (
          /* Digests Accordion / Cards */
          <div className="space-y-3.5">
            {digests.map((digest) => {
              const isExpanded = expandedDigestIds.has(digest.id);
              const formattedDate = formatDigestDisplayDate(digest.date);
              const isCopied = copiedId === (digest.id || digest.date);
              const isDeleting = deletingId === digest.id;

              return (
                <div
                  key={digest.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg overflow-hidden transition-colors hover:border-slate-700/80"
                >
                  {/* Card Header (Click to toggle expand) */}
                  <div
                    onClick={() => toggleExpand(digest.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer gap-2.5 bg-slate-950/40 select-none hover:bg-slate-900/90 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{formattedDate}</h4>
                          <span className="font-mono text-[10px] text-slate-400">({digest.date})</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {/* Note Count Pill */}
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                            <FileText className="h-3 w-3 text-amber-400" />
                            <span>
                              {digest.noteCount} note{digest.noteCount === 1 ? '' : 's'}
                            </span>
                          </span>

                          {/* Media attachments pill */}
                          {digest.mediaUrls && digest.mediaUrls.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                              <ImageIcon className="h-3 w-3 text-indigo-400" />
                              <span>
                                {digest.mediaUrls.length} attachment{digest.mediaUrls.length === 1 ? '' : 's'}
                              </span>
                            </span>
                          )}

                          {/* Email delivery pill */}
                          {digest.emailMessageId ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 font-medium">
                              <Check className="h-3 w-3" />
                              <span>Delivered via Resend</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-700/50 bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-400 font-medium">
                              <Mail className="h-3 w-3 text-slate-400" />
                              <span>In-App Only</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        {isExpanded ? (
                          <>
                            <span>Hide</span>
                            <ChevronUp className="h-4 w-4" />
                          </>
                        ) : (
                          <>
                            <span>Read</span>
                            <ChevronDown className="h-4 w-4" />
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Expanded Content */}
                  {isExpanded && (
                    <div className="p-4 sm:p-5 border-t border-slate-800/80 space-y-5 animate-in fade-in duration-150">
                      {/* Markdown Content */}
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <MarkdownView content={digest.contentMarkdown} />
                      </div>

                      {/* Visual Attachments Section if present */}
                      {digest.mediaUrls && digest.mediaUrls.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                            <ImageIcon className="h-3.5 w-3.5 text-amber-400" />
                            <span>Visual Attachments & Screenshots ({digest.mediaUrls.length})</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {digest.mediaUrls.map((media, mIdx) => (
                              <div
                                key={`${digest.id}-media-${mIdx}`}
                                onClick={() => setPreviewMedia(media)}
                                className="group relative rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-all shadow-md"
                              >
                                <div className="aspect-video w-full overflow-hidden bg-slate-900">
                                  <img
                                    src={media.url}
                                    alt={media.noteTitle || 'Attachment'}
                                    loading="lazy"
                                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                </div>
                                <div className="p-2">
                                  <span className="block truncate text-[11px] font-medium text-slate-200">
                                    {media.noteTitle || 'Attached Image'}
                                  </span>
                                  <span className="text-[10px] text-indigo-400 group-hover:underline flex items-center gap-1 mt-0.5">
                                    <span>Expand</span>
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Card Footer Actions */}
                      <div className="flex items-center justify-between border-t border-slate-800/60 pt-3 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyMarkdown(digest)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800/50 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy Markdown</span>
                              </>
                            )}
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDeleteDigest(digest.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                          title="Delete digest archive"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Zero Activity Notice Rule */}
      <div className="rounded-xl border border-slate-800/50 bg-slate-900/20 p-3.5 text-xs text-slate-400 flex items-start sm:items-center gap-2.5">
        <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
        <span>
          <strong className="text-slate-300">Cost Optimization Gate:</strong> If zero notes were recorded
          during the previous day, Cloud Scheduler automatically skips Gemini Flash synthesis and Resend dispatch to keep token and email usage at zero.
        </span>
      </div>

      {/* Image Preview Lightbox */}
      {previewMedia && (
        <div
          onClick={() => setPreviewMedia(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-4xl w-full rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
              <span className="text-xs font-semibold text-white truncate pr-4">
                {previewMedia.noteTitle || 'Visual Attachment'}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewMedia.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  title="Open original in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewMedia(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 bg-black/40 flex items-center justify-center">
              <img
                src={previewMedia.url}
                alt={previewMedia.noteTitle || 'Attachment'}
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
