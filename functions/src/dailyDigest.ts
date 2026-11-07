import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { info, warn, error as logError } from "firebase-functions/logger";
import { Resend } from "resend";
import { getFormattedDate, isEmailAllowed } from "./ingestNote.js";
import { synthesizeDailyDigestWithGemini } from "./gemini.js";
import {
  generateEmailHtml,
  generateEmailText,
  formatDisplayDate,
  generateTestEmailHtml,
  generateTestEmailText,
} from "./emailTemplate.js";
import type {
  ActionItem,
  ActionItemEmailView,
  DailyDigestResult,
  Digest,
  MediaUrl,
  Note,
  SendTestEmailRequest,
  SendTestEmailResponse,
  TriggerDigestRequest,
  UserProfileConfig,
} from "./types.js";

/**
 * Calculates yesterday's date string (YYYY-MM-DD) for a given timezone.
 * Handles month boundaries, leap years, and daylight saving time cleanly.
 */
export function getYesterdayDateString(referenceDate: Date, timezone: string): string {
  const todayStr = getFormattedDate(referenceDate, timezone);
  const [year, month, day] = todayStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  utcDate.setUTCDate(utcDate.getUTCDate() - 1);
  return utcDate.toISOString().slice(0, 10);
}

/**
 * Returns the current local hour (0-23) for a given timezone.
 */
export function getLocalHour(referenceDate: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    });
    return parseInt(formatter.format(referenceDate), 10);
  } catch (err) {
    warn(`Failed to get local hour for timezone ${timezone}, fallback to UTC hour:`, err);
    return referenceDate.getUTCHours();
  }
}

/**
 * Extracts and deduplicates all attached media URLs with their note titles.
 */
export function extractMediaUrlsFromNotes(notes: Note[]): MediaUrl[] {
  const mediaUrls: MediaUrl[] = [];
  const seenUrls = new Set<string>();

  for (const note of notes) {
    if (Array.isArray(note.imageUrls)) {
      for (const rawUrl of note.imageUrls) {
        if (typeof rawUrl === "string" && rawUrl.trim().length > 0) {
          const url = rawUrl.trim();
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            mediaUrls.push({
              noteTitle: note.title || "Note Image",
              url,
            });
          }
        }
      }
    }
  }

  return mediaUrls;
}

/**
 * Extracts individual action item descriptions from the "Action Items & Follow-ups"
 * markdown section in daily digest synthesis.
 */
export function extractActionItemsFromDigestMarkdown(contentMarkdown: string): string[] {
  if (!contentMarkdown) return [];

  const sectionRegex = /##\s*Action\s*Items(?:\s*&|\s+and)?\s*Follow-?ups[^\n]*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i;
  const match = contentMarkdown.match(sectionRegex);
  if (!match) return [];

  const lines = match[1].split("\n");
  const items: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check for negative indicator
    if (
      /no pending action items/i.test(line) ||
      /no action items/i.test(line) ||
      /^none\.?$/i.test(line)
    ) {
      continue;
    }

    // Match list item: - [ ] item, - [x] item, - item, * item, 1. item
    const itemMatch = line.match(/^[-*]\s*(?:\[[ xX]?\]\s*)?(.*)$/) || line.match(/^\d+\.\s+(.*)$/);
    if (itemMatch) {
      let text = itemMatch[1].trim();
      text = text.replace(/^\*\*([^*]+)\*\*$/, "$1").replace(/^__([^_]+)__$/, "$1").trim();
      if (text && !items.some((existing) => existing.toLowerCase() === text.toLowerCase())) {
        items.push(text);
      }
    }
  }

  return items;
}

/**
 * Synchronizes action items extracted during daily digest with the user's
 * persistent actions collection in Firestore (`users/{userId}/actions`).
 *
 * 1. Reads all current actions for the user.
 * 2. Deduplicates new actions against existing pending actions.
 * 3. Persists any newly found action items to Firestore.
 * 4. Returns the complete list of actions (both pending and completed)
 *    flagging newly found actions with `isNew: true`.
 */
export async function syncDigestActionsWithFirestore(
  db: admin.firestore.Firestore,
  userId: string,
  targetDateString: string,
  extractedActionTexts: string[]
): Promise<ActionItemEmailView[]> {
  const actionsRef = db.collection("users").doc(userId).collection("actions");

  let existingDocs: admin.firestore.QueryDocumentSnapshot[] = [];
  try {
    const snapshot = await actionsRef.get();
    existingDocs = snapshot.docs;
  } catch (err) {
    warn(`Failed to read actions for user ${userId}:`, err);
  }

  const existingActions: Array<{
    id: string;
    text: string;
    completed: boolean;
    createdAt?: any;
    sourceDigestDate?: string;
  }> = existingDocs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as ActionItem),
  }));

  const existingPendingTexts = new Set(
    existingActions
      .filter((a) => !a.completed)
      .map((a) => a.text.trim().toLowerCase())
  );

  const newlyCreatedIds = new Set<string>();

  for (const rawText of extractedActionTexts) {
    const cleanText = rawText.trim();
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
          sourceDigestDate: targetDateString,
        };
        await newDocRef.set(actionRecord);
        newlyCreatedIds.add(newDocRef.id);
        existingPendingTexts.add(normalized);
        existingActions.push({
          id: newDocRef.id,
          text: cleanText,
          completed: false,
          sourceDigestDate: targetDateString,
        });
        info(`Saved new action item for user ${userId}: "${cleanText}"`);
      } catch (err) {
        warn(`Failed to write new action item for user ${userId}:`, err);
      }
    }
  }

  const emailActions: ActionItemEmailView[] = existingActions.map((a) => {
    const isNew = newlyCreatedIds.has(a.id) || a.sourceDigestDate === targetDateString;
    return {
      id: a.id,
      text: a.text,
      completed: Boolean(a.completed),
      isNew: !a.completed && isNew,
    };
  });

  // Sort: Pending items first (new items at the top), then completed items
  emailActions.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    if (a.isNew !== b.isNew) {
      return a.isNew ? -1 : 1;
    }
    return 0;
  });

  return emailActions;
}

/**
 * Dispatches an email via Resend SDK.
 */
export async function sendDigestEmail(params: {
  resendApiKey?: string;
  from?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string | null> {
  const apiKey = params.resendApiKey || process.env.RESEND_API_KEY;
  if (!apiKey) {
    warn("RESEND_API_KEY is not configured. Email dispatch skipped.");
    return null;
  }

  const resend = new Resend(apiKey);
  const from = params.from || process.env.DIGEST_SENDER_EMAIL || "Argos <onboarding@resend.dev>";

  info(`Dispatching Daily Digest email to ${params.to} from ${from}`);

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  if (error) {
    warn(`Resend email dispatch error for ${params.to}:`, error);
    throw new Error(`Resend email dispatch failed: ${error.message} (${error.name})`);
  }

  info(`Daily Digest email successfully delivered to ${params.to}. Message ID: ${data?.id}`);
  return data?.id || null;
}

/**
 * Processes daily digest for a single user:
 * 1. Checks profile for timezone & email
 * 2. Checks idempotency (unless forced)
 * 3. Enforces Zero-Activity Gate (skips Gemini & Resend if 0 notes)
 * 4. Extracts media attachments
 * 5. Calls Gemini Flash for Markdown synthesis
 * 6. Generates polished HTML & plain-text email templates
 * 7. Sends email via Resend
 * 8. Persists digest document in users/{userId}/digests/{targetDateString}
 */
export async function processDailyDigestForUser(
  userId: string,
  options?: {
    targetDateString?: string;
    force?: boolean;
    overrideEmail?: string;
    sendEmail?: boolean;
    resendApiKey?: string;
    geminiApiKey?: string;
  }
): Promise<DailyDigestResult> {
  const db = admin.firestore();

  // 1. Fetch user configuration
  let timezone = "UTC";
  let configuredEmail = options?.overrideEmail;
  let emailNotificationsEnabled = true;

  try {
    const profileDoc = await db.doc(`users/${userId}/profile/config`).get();
    if (profileDoc.exists) {
      const profileData = profileDoc.data() as UserProfileConfig;
      if (profileData?.timezone && typeof profileData.timezone === "string") {
        timezone = profileData.timezone.trim();
      }
      if (!configuredEmail && profileData?.email && typeof profileData.email === "string") {
        configuredEmail = profileData.email.trim();
      }
      if (typeof profileData?.emailNotificationsEnabled === "boolean") {
        emailNotificationsEnabled = profileData.emailNotificationsEnabled;
      }
    }
  } catch (err) {
    warn(`Could not read profile for user ${userId}:`, err);
  }

  // Fallback to Firebase Auth user email if not found in profile
  if (!configuredEmail) {
    try {
      const userRecord = await admin.auth().getUser(userId);
      if (userRecord.email) {
        configuredEmail = userRecord.email;
      }
    } catch (err) {
      warn(`Could not fetch Auth user record for ${userId}:`, err);
    }
  }

  // Target date determination
  const targetDateString =
    options?.targetDateString || getYesterdayDateString(new Date(), timezone);

  const digestDocRef = db.doc(`users/${userId}/digests/${targetDateString}`);

  // 2. Check idempotency: skip if already generated for this date
  if (!options?.force) {
    try {
      const existingDigest = await digestDocRef.get();
      if (existingDigest.exists) {
        info(`Digest already generated for user ${userId} on ${targetDateString}. Skipping.`);
        return {
          userId,
          date: targetDateString,
          skipped: true,
          reason: "already-generated",
          noteCount: (existingDigest.data()?.noteCount as number) || 0,
          digestId: targetDateString,
          emailMessageId: existingDigest.data()?.emailMessageId || null,
        };
      }
    } catch (err) {
      warn(`Idempotency check error for ${userId}/${targetDateString}:`, err);
    }
  }

  // 3. Aggregate yesterday's notes from Firestore
  const notesQuery = await db
    .collection("users")
    .doc(userId)
    .collection("notes")
    .where("dateString", "==", targetDateString)
    .get();

  const notes: Note[] = notesQuery.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Note),
  }));

  // 4. Zero-Activity Digest Gate: skip if 0 notes were created
  if (notes.length === 0) {
    info(
      `Zero-Activity Gate: 0 notes found for user ${userId} on ${targetDateString}. Skipping Gemini synthesis and email dispatch.`
    );
    return {
      userId,
      date: targetDateString,
      skipped: true,
      reason: "zero-activity",
      noteCount: 0,
    };
  }

  // Sort notes chronologically in memory
  notes.sort((a, b) => {
    const timeA = (a.createdAt as any)?.toMillis ? (a.createdAt as any).toMillis() : 0;
    const timeB = (b.createdAt as any)?.toMillis ? (b.createdAt as any).toMillis() : 0;
    return timeA - timeB;
  });

  // 5. Collect all attached image URLs with their corresponding note titles
  const mediaUrls = extractMediaUrlsFromNotes(notes);

  info(
    `Synthesizing digest for user ${userId} on ${targetDateString}: ${notes.length} notes, ${mediaUrls.length} media attachments.`
  );

  // 6. Gemini prompt synthesizing highlights, key accomplishments, and pending action items
  const contentMarkdown = await synthesizeDailyDigestWithGemini(
    targetDateString,
    notes,
    options?.geminiApiKey
  );

  // 6b. Extract action items and synchronize with Firestore persistent actions collection
  const markdownActions = extractActionItemsFromDigestMarkdown(contentMarkdown);
  const noteActions: string[] = [];
  for (const n of notes) {
    if (Array.isArray(n.actionItems)) {
      for (const item of n.actionItems) {
        if (typeof item === "string" && item.trim()) {
          const clean = item.trim();
          if (!markdownActions.some((m) => m.toLowerCase() === clean.toLowerCase())) {
            noteActions.push(clean);
          }
        }
      }
    }
  }
  const allDiscoveredActions = [...markdownActions, ...noteActions];

  const emailActions = await syncDigestActionsWithFirestore(
    db,
    userId,
    targetDateString,
    allDiscoveredActions
  );

  // 7. Construct polished HTML & plain-text email templates
  const emailHtml = generateEmailHtml({
    dateString: targetDateString,
    contentMarkdown,
    noteCount: notes.length,
    mediaUrls,
    userEmail: configuredEmail,
    actions: emailActions,
  });

  const emailText = generateEmailText({
    dateString: targetDateString,
    contentMarkdown,
    noteCount: notes.length,
    mediaUrls,
    userEmail: configuredEmail,
    actions: emailActions,
  });

  // 8. Send email via Resend to the user's email if enabled
  const shouldSendEmail =
    options?.sendEmail !== undefined ? options.sendEmail : emailNotificationsEnabled;

  let emailMessageId: string | null = null;
  if (configuredEmail && shouldSendEmail) {
    try {
      const formattedDate = formatDisplayDate(targetDateString);
      emailMessageId = await sendDigestEmail({
        resendApiKey: options?.resendApiKey,
        to: configuredEmail,
        subject: `Argos Daily Digest — ${formattedDate}`,
        html: emailHtml,
        text: emailText,
      });
    } catch (err) {
      warn(`Failed to dispatch email to ${configuredEmail}:`, err);
    }
  } else if (!shouldSendEmail) {
    info(`Email dispatch skipped for user ${userId} (email notifications disabled).`);
  } else {
    warn(`No email address available for user ${userId}. Skipping email dispatch.`);
  }

  // 9. Save digest document (including mediaUrls) in users/{uid}/digests
  const noteIds = notes.map((n) => n.id).filter((id): id is string => Boolean(id));

  const digestRecord: Digest = {
    date: targetDateString,
    contentMarkdown,
    noteCount: notes.length,
    noteIds,
    mediaUrls,
    emailMessageId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await digestDocRef.set(digestRecord);

  info(
    `Daily Digest successfully generated & saved at users/${userId}/digests/${targetDateString}. Email ID: ${emailMessageId}`
  );

  return {
    userId,
    date: targetDateString,
    skipped: false,
    noteCount: notes.length,
    digestId: targetDateString,
    emailMessageId,
  };
}

/**
 * Discovers active users and triggers daily digest generation.
 */
export async function processDailyDigestsForAllUsers(
  referenceDate = new Date(),
  forceAll = false
): Promise<DailyDigestResult[]> {
  const db = admin.firestore();
  const candidateUserIds = new Set<string>();

  // Discover users from Firebase Auth
  try {
    const listUsersResult = await admin.auth().listUsers(1000);
    listUsersResult.users.forEach((u) => candidateUserIds.add(u.uid));
  } catch (err) {
    warn("Could not list users from Auth, falling back to Firestore users collection:", err);
  }

  // Discover users from Firestore collection if needed
  try {
    const userDocs = await db.collection("users").listDocuments();
    userDocs.forEach((doc) => candidateUserIds.add(doc.id));
  } catch (err) {
    warn("Could not list user documents from Firestore:", err);
  }

  const results: DailyDigestResult[] = [];

  for (const userId of candidateUserIds) {
    try {
      // Check user profile for digest hour and timezone
      let timezone = "UTC";
      let digestHour = 6;
      let userEmail: string | undefined;

      try {
        const profileDoc = await db.doc(`users/${userId}/profile/config`).get();
        if (profileDoc.exists) {
          const profileData = profileDoc.data() as UserProfileConfig;
          if (profileData.timezone) timezone = profileData.timezone;
          if (typeof profileData.digestHour === "number") digestHour = profileData.digestHour;
          if (profileData.email) userEmail = profileData.email;
        }
      } catch (err) {
        warn(`Profile fetch error for user ${userId}:`, err);
      }

      // Check allowed emails whitelist
      if (userEmail && !isEmailAllowed(userEmail, process.env.ALLOWED_EMAILS)) {
        info(`Skipping user ${userId} (${userEmail}) — not in ALLOWED_EMAILS whitelist.`);
        continue;
      }

      // If running on an hourly cron, only process users whose local hour equals digestHour
      const cronSchedule = process.env.DIGEST_CRON_SCHEDULE || "0 6 * * *";
      const isHourlyCron = cronSchedule.includes("* * * *");

      if (isHourlyCron && !forceAll) {
        const localHour = getLocalHour(referenceDate, timezone);
        if (localHour !== digestHour) {
          continue; // Not this user's scheduled hour yet
        }
      }

      const result = await processDailyDigestForUser(userId);
      results.push(result);
    } catch (err) {
      logError(`Failed to process daily digest for user ${userId}:`, err);
    }
  }

  return results;
}

/**
 * Scheduled Cloud Function (2nd Gen): generateDailyDigest
 * Triggers on schedule (default: 6:00 AM) to synthesize yesterday's notes and dispatch emails.
 */
export const generateDailyDigest = onSchedule(
  {
    schedule: process.env.DIGEST_CRON_SCHEDULE || "0 6 * * *",
    timeZone: process.env.DIGEST_TIMEZONE || "UTC",
    secrets: ["GEMINI_API_KEY", "RESEND_API_KEY"],
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async () => {
    info("Starting generateDailyDigest scheduled run...");
    const results = await processDailyDigestsForAllUsers();
    info(
      `Finished generateDailyDigest run. Processed ${results.length} users:`,
      results.map((r) => ({ uid: r.userId, skipped: r.skipped, notes: r.noteCount }))
    );
  }
);

/**
 * Callable Cloud Function: triggerDailyDigest
 * Allows authorized users to trigger or test digest synthesis on-demand.
 */
export const triggerDailyDigest = onCall<TriggerDigestRequest>(
  {
    secrets: ["GEMINI_API_KEY", "RESEND_API_KEY"],
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required to trigger daily digests.");
    }

    const uid = request.auth.uid;
    const userEmail = request.auth.token.email;

    if (!isEmailAllowed(userEmail, process.env.ALLOWED_EMAILS)) {
      throw new HttpsError("permission-denied", "User is not authorized.");
    }

    const customDate = request.data?.date;
    const force = Boolean(request.data?.force);
    const recipientEmail = request.data?.recipientEmail || userEmail;
    const sendEmail = request.data?.sendEmail;

    info(
      `triggerDailyDigest called by user ${uid} (date: ${customDate || "yesterday"}, force: ${force}, sendEmail: ${sendEmail})`
    );

    try {
      const result = await processDailyDigestForUser(uid, {
        targetDateString: customDate,
        force,
        overrideEmail: recipientEmail,
        sendEmail,
      });

      return result;
    } catch (err: any) {
      logError("triggerDailyDigest execution failed:", err);
      throw new HttpsError("internal", err?.message || "Failed to generate daily digest.");
    }
  }
);

/**
 * Callable Cloud Function: sendTestEmail
 * Allows authenticated users to send a test verification email to confirm Resend delivery.
 */
export const sendTestEmail = onCall<SendTestEmailRequest, Promise<SendTestEmailResponse>>(
  {
    secrets: ["RESEND_API_KEY"],
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required to send test email.");
    }

    const uid = request.auth.uid;
    const userEmail = request.auth.token.email;

    if (!isEmailAllowed(userEmail, process.env.ALLOWED_EMAILS)) {
      throw new HttpsError("permission-denied", "User is not authorized.");
    }

    const recipient = (request.data?.recipientEmail || userEmail || "").trim();
    if (!recipient) {
      throw new HttpsError("invalid-argument", "Valid recipient email address is required.");
    }

    const db = admin.firestore();
    let timezone = "UTC";
    let digestHour = 6;

    try {
      const profileDoc = await db.doc(`users/${uid}/profile/config`).get();
      if (profileDoc.exists) {
        const data = profileDoc.data() as UserProfileConfig;
        if (data.timezone) timezone = data.timezone;
        if (typeof data.digestHour === "number") digestHour = data.digestHour;
      }
    } catch (err) {
      warn(`Failed to read user profile in sendTestEmail for ${uid}:`, err);
    }

    const nowIso = new Date().toISOString();
    const html = generateTestEmailHtml({
      userEmail: recipient,
      timezone,
      digestHour,
      serverTimestampIso: nowIso,
    });
    const text = generateTestEmailText({
      userEmail: recipient,
      timezone,
      digestHour,
      serverTimestampIso: nowIso,
    });

    try {
      const messageId = await sendDigestEmail({
        to: recipient,
        subject: "Argos Test Email — Delivery Verified",
        html,
        text,
      });

      return {
        success: true,
        messageId,
        recipient,
        timestamp: nowIso,
      };
    } catch (err: any) {
      logError(`Failed to send test email to ${recipient}:`, err);
      throw new HttpsError("internal", err?.message || "Failed to deliver test email via Resend.");
    }
  }
);
