import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Paperclip,
  Image as ImageIcon,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Tag,
  CheckSquare,
  ArrowRight,
  Maximize2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { compressImage, formatBytes } from '../../utils/imageCompressor';
import { createNote, type IngestionProgress } from '../../services/notes';
import type { PendingAttachment, IngestNoteResult } from '../../types/note';

interface CaptureViewProps {
  onNoteCreated?: () => void;
}

export function CaptureView({ onNoteCreated }: CaptureViewProps) {
  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<IngestionProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastCreatedNote, setLastCreatedNote] = useState<IngestNoteResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on initial mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      attachments.forEach((att) => URL.revokeObjectURL(att.previewUrl));
    };
  }, [attachments]);

  /**
   * Processes a list of image files or blobs: compresses them to WebP (max 1600px)
   * and creates pending attachments with instant previews.
   */
  const handleFiles = useCallback(async (files: (File | Blob)[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setIsCompressing(true);
    setErrorMessage(null);

    const newAttachments: PendingAttachment[] = [];

    for (const file of imageFiles) {
      try {
        const compressed = await compressImage(file);
        const previewUrl = URL.createObjectURL(compressed.blob);
        const resolvedFile =
          file instanceof File
            ? file
            : new File([compressed.blob], `screenshot-${Date.now()}.webp`, {
                type: compressed.mimeType,
              });

        newAttachments.push({
          id: crypto.randomUUID(),
          file: resolvedFile,
          previewUrl,
          originalSize: compressed.originalSize,
          compressedBlob: compressed.blob,
          compressedSize: compressed.compressedSize,
          width: compressed.width,
          height: compressed.height,
          mimeType: compressed.mimeType,
        });
      } catch (err: any) {
        console.error('Failed to compress image:', err);
        setErrorMessage(`Could not process one of the images: ${err?.message || 'Unknown error'}`);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsCompressing(false);
  }, []);

  /**
   * Handle pasting images from clipboard directly into the textarea or capture card
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedBlobs: Blob[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            pastedBlobs.push(blob);
          }
        }
      }

      if (pastedBlobs.length > 0) {
        // Prevent default only if images were pasted (allows text paste if no images)
        e.preventDefault();
        handleFiles(pastedBlobs);
      }
    },
    [handleFiles]
  );

  /**
   * Handle standard file input change
   */
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      // Reset input value so re-selecting the same file triggers change
      e.target.value = '';
    }
  };

  /**
   * Handle drag-and-drop
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  /**
   * Remove an attachment before submitting
   */
  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  /**
   * Submit note to Firebase Storage and Gemini ingestion function
   */
  const handleSubmit = async () => {
    if (!user) {
      setErrorMessage('You must be signed in to capture notes.');
      return;
    }

    if (!noteText.trim() && attachments.length === 0) {
      setErrorMessage('Please enter some text or attach an image.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setLastCreatedNote(null);

    try {
      const result = await createNote({
        userId: user.uid,
        rawText: noteText,
        attachments,
        onProgress: (p) => setProgress(p),
      });

      // Clear form inputs
      setNoteText('');
      attachments.forEach((att) => URL.revokeObjectURL(att.previewUrl));
      setAttachments([]);
      setLastCreatedNote(result);
      setProgress(null);
    } catch (err: any) {
      console.error('Note ingestion failed:', err);
      setErrorMessage(
        err?.message || 'Failed to ingest note. Please check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Keyboard shortcut: Cmd+Enter or Ctrl+Enter to submit
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isSubmitting && (noteText.trim() || attachments.length > 0)) {
        handleSubmit();
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* Intro banner */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Instant Capture</h2>
            <p className="text-xs text-slate-400">
              Type thoughts or paste screenshots. Gemini structures, tags, and extracts action items.
            </p>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Capture error: </span>
            {errorMessage}
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Success notification banner after note is ingested */}
      {lastCreatedNote && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-200 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <div className="font-semibold text-white text-sm">
                  "{lastCreatedNote.title}"
                </div>
                <p className="text-slate-300 mt-1 line-clamp-2">
                  {lastCreatedNote.summary}
                </p>

                {/* Generated Tags */}
                {lastCreatedNote.tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {lastCreatedNote.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/20"
                      >
                        <Tag className="h-2.5 w-2.5" /> #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action Items */}
                {lastCreatedNote.actionItems.length > 0 && (
                  <div className="mt-2 text-slate-300">
                    <span className="text-[11px] font-medium text-amber-300 flex items-center gap-1">
                      <CheckSquare className="h-3 w-3" /> {lastCreatedNote.actionItems.length} action item(s) detected
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onNoteCreated && (
                <button
                  type="button"
                  onClick={onNoteCreated}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white shadow hover:bg-emerald-500 active:scale-95"
                >
                  <span>View Feed</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setLastCreatedNote(null)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Dismiss note alert"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main capture card */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-2xl border transition-all duration-200 bg-slate-900/60 p-4 shadow-xl sm:p-6 backdrop-blur-md ${
          isDragging
            ? 'border-indigo-400 ring-2 ring-indigo-500/40 bg-indigo-950/20'
            : 'border-slate-800/80'
        }`}
      >
        {/* Text input area */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            rows={5}
            placeholder="What's on your mind? Or paste a screenshot directly (Ctrl+V / Cmd+V)..."
            className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />

          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-indigo-950/80 border-2 border-dashed border-indigo-400 text-indigo-200 text-xs font-semibold backdrop-blur-xs">
              Drop screenshot or image here to attach
            </div>
          )}
        </div>

        {/* Compressing indicator */}
        {isCompressing && (
          <div className="mt-3 flex items-center gap-2 text-xs text-indigo-400 animate-pulse">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Downsampling and optimizing image to WebP (max 1600px)...</span>
          </div>
        )}

        {/* Attachment Previews Grid */}
        {attachments.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium text-slate-300">
                Attached Images ({attachments.length})
              </span>
              <span className="text-[11px] text-emerald-400">
                Optimized with client-side WebP compression
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {attachments.map((att) => {
                const savingsPct = Math.max(
                  0,
                  Math.round(((att.originalSize - att.compressedSize) / att.originalSize) * 100)
                );

                return (
                  <div
                    key={att.id}
                    className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-1.5 shadow"
                  >
                    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900">
                      <img
                        src={att.previewUrl}
                        alt="Attachment preview"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <button
                        type="button"
                        onClick={() => setEnlargedImageUrl(att.previewUrl)}
                        className="absolute bottom-1 left-1 rounded bg-black/60 p-1 text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
                        title="Enlarge preview"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="mt-2 px-1 pb-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          {att.width}×{att.height}px
                        </span>
                        <span className="text-emerald-400 font-medium">
                          {formatBytes(att.compressedSize)}
                        </span>
                      </div>
                      {savingsPct > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Reduced by {savingsPct}% (was {formatBytes(att.originalSize)})
                        </div>
                      )}
                    </div>

                    {/* Remove button */}
                    {!isSubmitting && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="absolute right-2.5 top-2.5 rounded-full bg-slate-950/80 p-1 text-slate-300 hover:bg-red-500 hover:text-white transition-colors"
                        title="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress indicator during ingestion */}
        {isSubmitting && progress && (
          <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-indigo-200 font-medium">
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                {progress.statusText}
              </span>
              <span>{progress.progressPercent}%</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-indigo-500 transition-all duration-300"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Attachment drop area & action buttons */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
          <div className="flex items-center gap-2">
            <label
              htmlFor="image-upload"
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 ${
                isSubmitting ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5 text-indigo-400" />
              <span>Attach Image</span>
              <input
                id="image-upload"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                disabled={isSubmitting}
                onChange={handleFileInputChange}
                className="hidden"
              />
            </label>

            <span className="text-[11px] text-slate-500 hidden sm:inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              Paste from clipboard supported (Ctrl+V)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 hidden sm:inline">
              ⌘ + Enter to send
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || isCompressing || (!noteText.trim() && attachments.length === 0)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Ingesting...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Ingest Note</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Enlarged image preview modal */}
      {enlargedImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] backdrop-blur-sm"
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

      {/* Helpful tips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-3.5">
          <div className="font-medium text-slate-300 mb-1 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" /> WebP Downsampling
          </div>
          Screenshots are scaled to max 1600px and converted to WebP client-side before upload to conserve bandwidth and storage.
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-3.5">
          <div className="font-medium text-slate-300 mb-1 flex items-center gap-1.5">
            <CheckSquare className="h-3.5 w-3.5 text-indigo-400" /> One-Time Multimodal
          </div>
          Gemini Flash inspects attachments once during ingestion, extracting context and action items to eliminate repeated token costs.
        </div>
      </div>
    </div>
  );
}
