import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { info, warn } from "firebase-functions/logger";
import { extractNoteWithGemini, generateFallbackNoteExtraction } from "./gemini.js";
import type { ActionItem, IngestNoteRequest, IngestNoteResponse, Note } from "./types.js";

/**
 * Helper to compute YYYY-MM-DD string for a given timezone.
 */
export function getFormattedDate(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  } catch (err) {
    warn(`Invalid timezone "${timezone}", falling back to UTC:`, err);
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Validates whether a user's email is permitted by ALLOWED_EMAILS whitelist.
 */
export function isEmailAllowed(
  email: string | undefined,
  allowedEmailsStr: string | undefined
): boolean {
  if (!allowedEmailsStr || !allowedEmailsStr.trim()) {
    return true; // No whitelist configured, all authenticated users allowed
  }
  if (!email) return false;
  const allowed = allowedEmailsStr
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) return true;
  return allowed.includes(email.toLowerCase().trim());
}

/**
 * Parses and validates raw input parameters for note ingestion.
 */
export function validateIngestPayload(data: any): { rawText: string; imageUrls: string[] } {
  const rawText = (data?.rawText ?? data?.text ?? "").trim();
  const rawImageUrls = data?.imageUrls;
  const imageUrls: string[] = Array.isArray(rawImageUrls)
    ? rawImageUrls
        .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
        .map((url) => url.trim())
    : [];

  if (!rawText && imageUrls.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "A note must contain either non-empty text or at least one image URL."
    );
  }

  return { rawText, imageUrls };
}

/**
 * Persists action items extracted from a note directly into the user's
 * actions collection (`users/{userId}/actions`), ensuring they are immediately
 * available in the app without waiting for the daily digest.
 */
export async function persistActionItemsFromNote(
  db: admin.firestore.Firestore,
  uid: string,
  noteId: string,
  dateString: string,
  actionItems: string[]
): Promise<string[]> {
  if (!actionItems || actionItems.length === 0) {
    return [];
  }

  const actionsRef = db.collection("users").doc(uid).collection("actions");

  let existingPendingTexts = new Set<string>();
  try {
    const existingSnap = await actionsRef.where("completed", "==", false).get();
    existingPendingTexts = new Set(
      existingSnap.docs.map((docSnap) => (docSnap.data().text || "").trim().toLowerCase())
    );
  } catch (err) {
    warn(`Failed to fetch existing actions for user ${uid}:`, err);
  }

  const createdActionIds: string[] = [];

  for (const rawItem of actionItems) {
    if (typeof rawItem !== "string") continue;
    const cleanText = rawItem.trim();
    const normalized = cleanText.toLowerCase();
    if (!normalized) continue;

    if (!existingPendingTexts.has(normalized)) {
      try {
        const newDocRef = actionsRef.doc();
        const actionRecord: ActionItem = {
          text: cleanText,
          completed: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: null,
          sourceDigestDate: dateString,
          sourceNoteId: noteId,
        };
        await newDocRef.set(actionRecord);
        existingPendingTexts.add(normalized);
        createdActionIds.push(newDocRef.id);
        info(`Created action item from note ingestion [${noteId}] for user ${uid}: "${cleanText}"`);
      } catch (err) {
        warn(`Failed to persist action item from note ${noteId}:`, err);
      }
    }
  }

  return createdActionIds;
}

/**
 * Callable Cloud Function: ingestNote
 * Takes text and optional imageUrls, extracts structured metadata via Gemini Flash,
 * and persists the note to users/{uid}/notes.
 */
export const ingestNote = onCall<IngestNoteRequest>(
  {
    secrets: ["GEMINI_API_KEY"],
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (request): Promise<IngestNoteResponse> => {
    // 1. Authenticate user
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated to ingest notes.");
    }

    const uid = request.auth.uid;
    const userEmail = request.auth.token.email;

    // 2. Validate email whitelist if ALLOWED_EMAILS is configured
    if (!isEmailAllowed(userEmail, process.env.ALLOWED_EMAILS)) {
      throw new HttpsError("permission-denied", "User email is not authorized to create notes.");
    }

    // 3. Parse and validate payload
    const { rawText, imageUrls } = validateIngestPayload(request.data);

    const db = admin.firestore();

    // 4. Retrieve user's configured timezone
    let timezone = "UTC";
    try {
      const profileDoc = await db.doc(`users/${uid}/profile/config`).get();
      if (profileDoc.exists) {
        const profileData = profileDoc.data();
        if (typeof profileData?.timezone === "string" && profileData.timezone.trim()) {
          timezone = profileData.timezone.trim();
        }
      }
    } catch (err) {
      warn(`Failed to fetch user profile for timezone (${uid}), defaulting to UTC:`, err);
    }

    const now = new Date();
    const dateString = getFormattedDate(now, timezone);

    // 5. Multimodal extraction using Gemini Flash with graceful fallback
    info(`Processing note for user ${uid} (hasImages: ${imageUrls.length > 0}, textLen: ${rawText.length})`);
    let extracted;
    try {
      extracted = await extractNoteWithGemini(rawText, imageUrls);
    } catch (err: any) {
      warn("Gemini extraction error in ingestNote, falling back to deterministic extraction:", err);
      extracted = generateFallbackNoteExtraction(rawText, imageUrls.length > 0);
    }

    // 6. Persist note in Cloud Firestore
    const notesCollection = db.collection("users").doc(uid).collection("notes");
    const customNoteId = typeof request.data?.noteId === "string" && request.data.noteId.trim()
      ? request.data.noteId.trim()
      : undefined;

    const noteDocRef = customNoteId ? notesCollection.doc(customNoteId) : notesCollection.doc();

    const noteRecord: Note = {
      rawText,
      title: extracted.title,
      summary: extracted.summary,
      tags: extracted.tags,
      actionItems: extracted.actionItems,
      imageUrls,
      hasImages: imageUrls.length > 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      dateString,
    };

    await noteDocRef.set(noteRecord);

    // 7. Immediately persist extracted action items so they appear in Actions view
    if (extracted.actionItems && extracted.actionItems.length > 0) {
      await persistActionItemsFromNote(
        db,
        uid,
        noteDocRef.id,
        dateString,
        extracted.actionItems
      );
    }

    info(`Note created successfully with ID: ${noteDocRef.id} for user: ${uid}`);

    return {
      id: noteDocRef.id,
      rawText,
      title: extracted.title,
      summary: extracted.summary,
      tags: extracted.tags,
      actionItems: extracted.actionItems,
      imageUrls,
      hasImages: imageUrls.length > 0,
      dateString,
      createdAt: now.toISOString(),
    };
  }
);
