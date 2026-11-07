import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { info, warn } from "firebase-functions/logger";
import { isEmailAllowed } from "./ingestNote.js";
import { synthesizeSearchAnswerWithGemini } from "./gemini.js";
import type {
  Note,
  CitedNote,
  QueryNotesRequest,
  QueryNotesResponse,
} from "./types.js";

export const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
  "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down",
  "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
  "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her",
  "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's",
  "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
  "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
  "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't",
  "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
  "than", "that", "that's", "the", "their", "theirs", "them", "themselves",
  "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up",
  "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
  "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves",
]);

/**
 * Extracts searchable keywords from a query string.
 */
export function extractSearchKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  return Array.from(new Set(tokens));
}

/**
 * Computes a relevance score between a note and user keywords/query.
 */
export function scoreNoteRelevance(
  note: {
    title: string;
    summary: string;
    tags?: string[];
    actionItems?: string[];
    rawText?: string;
    dateString?: string;
  },
  keywords: string[],
  queryLower: string
): number {
  let score = 0;
  const titleLower = (note.title || "").toLowerCase();
  const summaryLower = (note.summary || "").toLowerCase();
  const rawTextLower = (note.rawText || "").toLowerCase();
  const tagsLower = (note.tags || []).map((t) => (t || "").toLowerCase());
  const actionItemsLower = (note.actionItems || []).map((a) => (a || "").toLowerCase());
  const dateString = (note.dateString || "").toLowerCase();

  // Full phrase match bonus
  if (queryLower && queryLower.length > 3) {
    if (titleLower.includes(queryLower)) score += 20;
    if (summaryLower.includes(queryLower)) score += 15;
    if (rawTextLower.includes(queryLower)) score += 10;
  }

  for (const keyword of keywords) {
    // Tag match
    if (tagsLower.includes(keyword)) {
      score += 8;
    } else if (tagsLower.some((t) => t.includes(keyword))) {
      score += 4;
    }

    // Title match
    if (titleLower === keyword) {
      score += 10;
    } else if (titleLower.includes(keyword)) {
      score += 6;
    }

    // Summary match
    if (summaryLower.includes(keyword)) {
      score += 3;
    }

    // Action items match
    if (actionItemsLower.some((a) => a.includes(keyword))) {
      score += 4;
    }

    // Raw text match
    if (rawTextLower.includes(keyword)) {
      score += 2;
    }

    // Date string match (e.g. searching "2026-10-20" or "2026")
    if (dateString && dateString.includes(keyword)) {
      score += 5;
    }
  }

  return score;
}

/**
 * Filters and ranks candidate notes for Ask Argos query.
 */
export function selectCandidateNotes<T extends Note & { id: string }>(
  notes: T[],
  query: string,
  maxCandidates = 20
): T[] {
  if (!notes || notes.length === 0) return [];

  const queryLower = query.toLowerCase().trim();
  const keywords = extractSearchKeywords(queryLower);

  const scored = notes.map((note) => ({
    note,
    score: scoreNoteRelevance(note, keywords, queryLower),
  }));

  // Check if any notes matched keywords
  const hasKeywordMatches = scored.some((item) => item.score > 0);

  if (hasKeywordMatches) {
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Secondary sort: newest first
      const dateA = a.note.dateString || "";
      const dateB = b.note.dateString || "";
      return dateB.localeCompare(dateA);
    });

    // Return all positive scoring notes up to maxCandidates (or at least top candidates)
    const matching = scored.filter((item) => item.score > 0);
    return matching.slice(0, maxCandidates).map((item) => item.note);
  }

  // If no specific keywords matched (e.g. "What did I do recently?"), return recent notes
  return notes.slice(0, maxCandidates);
}

/**
 * Callable Cloud Function: queryNotes
 * Takes natural language query, retrieves relevant note candidates,
 * and uses Gemini Flash to synthesize a direct answer with cited notes.
 */
export const queryNotes = onCall<QueryNotesRequest>(
  {
    secrets: ["GEMINI_API_KEY"],
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request): Promise<QueryNotesResponse> => {
    // 1. Authenticate user
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated to query notes.");
    }

    const uid = request.auth.uid;
    const userEmail = request.auth.token.email;

    // 2. Validate whitelist if configured
    if (!isEmailAllowed(userEmail, process.env.ALLOWED_EMAILS)) {
      throw new HttpsError("permission-denied", "User email is not authorized to query notes.");
    }

    // 3. Validate request payload
    const query = (request.data?.query || "").trim();
    if (!query) {
      throw new HttpsError("invalid-argument", "Search query cannot be empty.");
    }

    const maxCandidates = Math.min(Math.max(request.data?.limit ?? 20, 1), 50);
    const dateRange = request.data?.dateRange;

    info(`User ${uid} queried: "${query}" (limit: ${maxCandidates})`);

    const db = admin.firestore();
    const notesRef = db.collection("users").doc(uid).collection("notes");

    let queryRef: admin.firestore.Query = notesRef;

    if (dateRange?.startDate || dateRange?.endDate) {
      if (dateRange?.startDate) {
        queryRef = queryRef.where("dateString", ">=", dateRange.startDate);
      }
      if (dateRange?.endDate) {
        queryRef = queryRef.where("dateString", "<=", dateRange.endDate);
      }
      queryRef = queryRef
        .orderBy("dateString", "desc")
        .orderBy("createdAt", "desc")
        .limit(100);
    } else {
      // Retrieve recent candidate pool (up to 100 notes)
      queryRef = queryRef.orderBy("createdAt", "desc").limit(100);
    }

    let snapshot: admin.firestore.QuerySnapshot;
    try {
      snapshot = await queryRef.get();
    } catch (err: any) {
      warn(`Query failed with composite ordering, falling back to basic fetch for user ${uid}:`, err);
      // Fallback in case index is missing during initial setup
      snapshot = await notesRef.limit(100).get();
    }

    if (snapshot.empty) {
      return {
        query,
        answer: "I couldn't find any recorded notes in your memory log yet. Once you capture notes or screenshots, Argos will be able to search and recall them.",
        citedNotes: [],
        candidateCount: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const allNotes: Array<Note & { id: string }> = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        rawText: data.rawText || "",
        title: data.title || "Untitled Note",
        summary: data.summary || "",
        tags: Array.isArray(data.tags) ? data.tags : [],
        actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
        imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
        hasImages: Boolean(data.hasImages),
        createdAt: data.createdAt,
        dateString: data.dateString || "",
      };
    });

    // 4. Select top ranked candidates based on semantic & keyword relevance
    const selectedNotes = selectCandidateNotes(allNotes, query, maxCandidates);

    const candidateCitedNotes: CitedNote[] = selectedNotes.map((n) => ({
      id: n.id,
      title: n.title,
      dateString: n.dateString,
      summary: n.summary,
      tags: n.tags,
      actionItems: n.actionItems,
      hasImages: n.hasImages,
      imageUrls: n.imageUrls,
    }));

    // 5. Synthesize answer with Gemini Flash
    const synthesis = await synthesizeSearchAnswerWithGemini(query, candidateCitedNotes);

    // 6. Match cited notes
    const citedNoteIdsSet = new Set(synthesis.citedNoteIds);
    let citedNotes = candidateCitedNotes.filter((n) => citedNoteIdsSet.has(n.id));

    // Fallback: If no cited note IDs explicitly matched but candidates exist, provide top candidates
    if (citedNotes.length === 0 && candidateCitedNotes.length > 0) {
      citedNotes = candidateCitedNotes.slice(0, 3);
    }

    info(`Search completed for user ${uid}: returned answer with ${citedNotes.length} cited notes.`);

    return {
      query,
      answer: synthesis.answer,
      citedNotes,
      candidateCount: candidateCitedNotes.length,
      timestamp: new Date().toISOString(),
    };
  }
);
