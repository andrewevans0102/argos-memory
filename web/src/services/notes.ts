import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from './firebase';
import type {
  Note,
  ActionItem,
  IngestNotePayload,
  IngestNoteResult,
  PendingAttachment,
  QueryNotesPayload,
  QueryNotesResult,
  Digest,
  TriggerDigestPayload,
  TriggerDigestResult,
  SendTestEmailPayload,
  SendTestEmailResult,
} from '../types/note';

export type IngestionStep =
  | 'idle'
  | 'compressing'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error';

export interface IngestionProgress {
  step: IngestionStep;
  progressPercent: number;
  statusText: string;
}

export interface CreateNoteParams {
  userId: string;
  rawText: string;
  attachments: PendingAttachment[];
  onProgress?: (progress: IngestionProgress) => void;
}

/**
 * Uploads compressed media to Firebase Storage under users/{userId}/notes/{noteId}/{filename}
 * and calls the Gemini-powered ingestNote Cloud Function.
 */
export async function createNote({
  userId,
  rawText,
  attachments,
  onProgress,
}: CreateNoteParams): Promise<IngestNoteResult> {
  if (!rawText.trim() && attachments.length === 0) {
    throw new Error('A note must contain either text or at least one image attachment.');
  }

  // Pre-generate noteId to align storage hierarchy with Firestore document path
  const noteId = crypto.randomUUID();
  const imageUrls: string[] = [];

  // 1. Upload attachments if present
  if (attachments.length > 0) {
    onProgress?.({
      step: 'uploading',
      progressPercent: 10,
      statusText: `Uploading ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}...`,
    });

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      const extension = att.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const fileName = `${crypto.randomUUID()}.${extension}`;
      const fileRef = ref(storage, `users/${userId}/notes/${noteId}/${fileName}`);

      // Track individual upload progress
      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(fileRef, att.compressedBlob, {
          contentType: att.mimeType,
        });

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const filePct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            const overallPct = 10 + Math.round(((i + filePct / 100) / attachments.length) * 40);
            onProgress?.({
              step: 'uploading',
              progressPercent: overallPct,
              statusText: `Uploading image ${i + 1} of ${attachments.length}...`,
            });
          },
          (error) => {
            reject(error);
          },
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              imageUrls.push(url);
              resolve();
            } catch (err) {
              reject(err);
            }
          }
        );
      });
    }
  }

  // 2. Call ingestNote Cloud Function for Gemini Flash multimodal extraction
  onProgress?.({
    step: 'processing',
    progressPercent: 60,
    statusText: 'Gemini Flash is analyzing and extracting structured tags...',
  });

  const ingestCallable = httpsCallable<IngestNotePayload, IngestNoteResult>(
    functions,
    'ingestNote'
  );

  const response = await ingestCallable({
    rawText: rawText.trim(),
    imageUrls,
    noteId,
  });

  onProgress?.({
    step: 'complete',
    progressPercent: 100,
    statusText: 'Note saved successfully!',
  });

  return response.data;
}

/**
 * Subscribes to real-time updates of the user's notes, ordered chronologically newest first.
 */
export function subscribeToNotes(
  userId: string,
  onNotesUpdate: (notes: Note[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const notesRef = collection(db, 'users', userId, 'notes');
  const q = query(notesRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const notes: Note[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          rawText: data.rawText || '',
          title: data.title || 'Untitled Note',
          summary: data.summary || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
          imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
          hasImages: Boolean(data.hasImages),
          createdAt: data.createdAt || null,
          dateString: data.dateString || '',
        };
      });
      onNotesUpdate(notes);
    },
    (error) => {
      console.error('Error in notes subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Deletes a note document from Firestore.
 */
export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const noteRef = doc(db, 'users', userId, 'notes', noteId);
  await deleteDoc(noteRef);
}

/**
 * Calls the Gemini-powered queryNotes Cloud Function to search user memories.
 */
export async function searchNotes(payload: QueryNotesPayload): Promise<QueryNotesResult> {
  if (!payload.query.trim()) {
    throw new Error('Search query cannot be empty.');
  }

  const queryCallable = httpsCallable<QueryNotesPayload, QueryNotesResult>(
    functions,
    'queryNotes'
  );

  const response = await queryCallable({
    query: payload.query.trim(),
    limit: payload.limit ?? 20,
    dateRange: payload.dateRange,
  });

  return response.data;
}

/**
 * Subscribes to real-time updates of the user's daily digests, ordered by date descending.
 */
export function subscribeToDigests(
  userId: string,
  onDigestsUpdate: (digests: Digest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const digestsRef = collection(db, 'users', userId, 'digests');
  const q = query(digestsRef, orderBy('date', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const digests: Digest[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          date: data.date || docSnap.id,
          contentMarkdown: data.contentMarkdown || '',
          noteCount: typeof data.noteCount === 'number' ? data.noteCount : 0,
          noteIds: Array.isArray(data.noteIds) ? data.noteIds : [],
          mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls : [],
          emailMessageId: data.emailMessageId ?? null,
          createdAt: data.createdAt || null,
        };
      });
      onDigestsUpdate(digests);
    },
    (error) => {
      console.error('Error in digests subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Deletes a daily digest document from Firestore.
 */
export async function deleteDigest(userId: string, digestId: string): Promise<void> {
  const digestRef = doc(db, 'users', userId, 'digests', digestId);
  await deleteDoc(digestRef);
}

/**
 * Calls the triggerDailyDigest Cloud Function to synthesize or re-generate a daily digest on demand.
 */
export async function triggerDigest(
  payload?: TriggerDigestPayload
): Promise<TriggerDigestResult> {
  const triggerCallable = httpsCallable<TriggerDigestPayload, TriggerDigestResult>(
    functions,
    'triggerDailyDigest'
  );

  const response = await triggerCallable(payload || {});
  return response.data;
}

/**
 * Calls the sendTestEmail Cloud Function to send a verified test email via Resend.
 */
export async function sendTestEmail(
  payload?: SendTestEmailPayload
): Promise<SendTestEmailResult> {
  const testCallable = httpsCallable<SendTestEmailPayload, SendTestEmailResult>(
    functions,
    'sendTestEmail'
  );

  const response = await testCallable(payload || {});
  return response.data;
}

/**
 * Subscribes to real-time updates of the user's action items, ordered by creation date descending.
 */
export function subscribeToActions(
  userId: string,
  onActionsUpdate: (actions: ActionItem[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const actionsRef = collection(db, 'users', userId, 'actions');
  const q = query(actionsRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const actions: ActionItem[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          text: data.text || '',
          completed: Boolean(data.completed),
          createdAt: data.createdAt || null,
          completedAt: data.completedAt || null,
          sourceDigestDate: data.sourceDigestDate || '',
          sourceNoteId: data.sourceNoteId || '',
        };
      });
      onActionsUpdate(actions);
    },
    (error) => {
      console.error('Error in actions subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Toggles an action item between pending and completed.
 */
export async function toggleActionCompletion(
  userId: string,
  actionId: string,
  currentCompleted: boolean
): Promise<void> {
  const actionRef = doc(db, 'users', userId, 'actions', actionId);
  await updateDoc(actionRef, {
    completed: !currentCompleted,
    completedAt: !currentCompleted ? serverTimestamp() : null,
  });
}

/**
 * Deletes an action item permanently from Firestore.
 */
export async function deleteAction(userId: string, actionId: string): Promise<void> {
  const actionRef = doc(db, 'users', userId, 'actions', actionId);
  await deleteDoc(actionRef);
}

/**
 * Manually creates a new action item in Firestore.
 */
export async function createAction(userId: string, text: string): Promise<string> {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error('Action text cannot be empty.');
  }

  const actionsRef = collection(db, 'users', userId, 'actions');
  const docRef = await addDoc(actionsRef, {
    text: cleanText,
    completed: false,
    createdAt: serverTimestamp(),
    completedAt: null,
  });

  return docRef.id;
}

