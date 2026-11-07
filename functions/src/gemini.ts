import { GoogleGenAI, Type } from "@google/genai";
import * as admin from "firebase-admin";
import { info, warn } from "firebase-functions/logger";
import type { ExtractedNoteData, CitedNote } from "./types.js";

let cachedAiClient: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

/**
 * Returns a cached or newly initialized GoogleGenAI client.
 * Avoids re-initialization overhead during warm cloud function invocations.
 */
export function getGenAIClient(apiKey: string): GoogleGenAI {
  if (!cachedAiClient || cachedApiKey !== apiKey) {
    cachedAiClient = new GoogleGenAI({ apiKey });
    cachedApiKey = apiKey;
  }
  return cachedAiClient;
}

/**
 * Supported or detected mime types.
 */
export function inferMimeType(url: string, contentTypeHeader?: string | null): string {
  if (contentTypeHeader && contentTypeHeader.startsWith("image/")) {
    return contentTypeHeader.split(";")[0].trim();
  }

  const cleanUrl = url.split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".webp")) return "image/webp";
  if (cleanUrl.endsWith(".png")) return "image/png";
  if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) return "image/jpeg";
  if (cleanUrl.endsWith(".gif")) return "image/gif";
  if (cleanUrl.endsWith(".heic")) return "image/heic";

  return "image/webp";
}

/**
 * Parses and sanitizes Gemini output with resilient fallbacks.
 */
export function parseGeminiResponse(
  responseText: string,
  rawText: string
): ExtractedNoteData {
  let parsed: Partial<ExtractedNoteData> = {};

  try {
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/i, "").replace(/\s*```$/, "");
    }
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    warn("Failed to parse Gemini JSON output. Raw response:", responseText, err);
  }

  const defaultTitle = rawText.trim()
    ? rawText.trim().split("\n")[0].slice(0, 50)
    : "Captured Note";

  const title = typeof parsed.title === "string" && parsed.title.trim()
    ? parsed.title.trim()
    : defaultTitle;

  const summary = typeof parsed.summary === "string" && parsed.summary.trim()
    ? parsed.summary.trim()
    : (rawText.trim() || "No summary available.");

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean)
    : ["note"];

  const actionItems = Array.isArray(parsed.actionItems)
    ? parsed.actionItems.map((a) => String(a).trim()).filter(Boolean)
    : [];

  return {
    title,
    summary,
    tags: tags.length > 0 ? tags : ["note"],
    actionItems,
  };
}

/**
 * Download an image buffer from either an HTTP(S) URL or a Google Cloud Storage path/URI.
 */
export async function downloadImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from ${url}: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type");
    const mimeType = inferMimeType(url, contentType);
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mimeType };
  }

  // Handle Cloud Storage gs:// URI
  if (url.startsWith("gs://")) {
    const match = url.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid gs:// URI: ${url}`);
    }
    const [, bucketName, filePath] = match;
    const bucket = admin.storage().bucket(bucketName);
    const [fileBuffer] = await bucket.file(filePath).download();
    const mimeType = inferMimeType(filePath);
    return { buffer: fileBuffer, mimeType };
  }

  // Handle storage file path relative to default bucket
  const bucket = admin.storage().bucket();
  const [fileBuffer] = await bucket.file(url).download();
  const mimeType = inferMimeType(url);
  return { buffer: fileBuffer, mimeType };
}

/**
 * Deterministic fallback note extraction when Gemini is offline, rate-limited, or unavailable.
 */
export function generateFallbackNoteExtraction(
  rawText: string,
  hasImages: boolean
): ExtractedNoteData {
  const cleanText = rawText.trim();
  const firstLine = cleanText ? cleanText.split("\n")[0].trim().slice(0, 50) : "";
  const title = firstLine || (hasImages ? "Captured Attachment" : "Captured Note");
  const summary = cleanText || (hasImages ? "Visual attachment captured." : "No content provided.");
  return {
    title,
    summary,
    tags: hasImages ? ["attachment", "note"] : ["note"],
    actionItems: [],
  };
}

/**
 * Extracts structured title, markdown summary, tags, and action items using Gemini Flash.
 */
export async function extractNoteWithGemini(
  rawText: string,
  imageUrls: string[],
  apiKey?: string
): Promise<ExtractedNoteData> {
  const geminiApiKey = apiKey || process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    warn("GEMINI_API_KEY is not configured, using fallback note extractor.");
    return generateFallbackNoteExtraction(rawText, imageUrls.length > 0);
  }

  const ai = getGenAIClient(geminiApiKey);
  const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  // Download image buffers
  const inlineParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  if (imageUrls && imageUrls.length > 0) {
    for (const url of imageUrls) {
      try {
        const { buffer, mimeType } = await downloadImageBuffer(url);
        inlineParts.push({
          inlineData: {
            mimeType,
            data: buffer.toString("base64"),
          },
        });
      } catch (err) {
        warn(`Could not download image from ${url}:`, err);
      }
    }
  }

  const userPromptText = [
    "Analyze the following note and any attached images.",
    "",
    "--- USER NOTE TEXT ---",
    rawText.trim() ? rawText : "(No raw text provided. Extract all context and details from the image(s).)",
    "----------------------",
    "",
    "Instructions:",
    "1. title: Generate a concise, informative title (3-8 words).",
    "2. summary: Create a clean markdown summary capturing key points, OCR transcription of receipts/screenshots/whiteboards, and context.",
    "3. tags: Generate 2-5 relevant lowercase categorical tags (e.g., 'finance', 'receipt', 'work', 'errand', 'health', 'idea').",
    "4. actionItems: Extract any actionable follow-ups, todos, or deadlines. If none are present, provide an empty list [].",
  ].join("\n");

  const contents: any[] = [...inlineParts, userPromptText];

  info(`Calling Gemini model ${modelName} with ${inlineParts.length} images and ${rawText.length} chars text.`);

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction:
          "You are Argos, an intelligent personal memory log companion. You process notes, reflections, thoughts, and multimodal attachments (receipts, screenshots, documents, whiteboard photos). You extract structured information to help the user recall, track, and act on their thoughts accurately.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "A short, concise title summarizing the note (3-8 words)",
            },
            summary: {
              type: Type.STRING,
              description: "Clean markdown summary capturing key points, context, OCR transcriptions, and details",
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "2 to 5 relevant lowercase category tags",
            },
            actionItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Actionable todos or follow-ups mentioned or implied. Empty list if none.",
            },
          },
          required: ["title", "summary", "tags", "actionItems"],
        },
      },
    });

    const responseText = response.text ? response.text.trim() : "";
    return parseGeminiResponse(responseText, rawText);
  } catch (err) {
    warn("Gemini note extraction failed, using fallback:", err);
    return generateFallbackNoteExtraction(rawText, imageUrls.length > 0);
  }
}

/**
 * Generates deterministic fallback markdown when Gemini is offline or unavailable.
 */
export function generateFallbackDigestMarkdown(
  dateString: string,
  notes: Array<{
    title: string;
    summary: string;
    tags?: string[];
    actionItems?: string[];
    rawText?: string;
  }>
): string {
  const allActionItems: string[] = [];
  notes.forEach((n) => {
    if (Array.isArray(n.actionItems)) {
      n.actionItems.forEach((a) => {
        if (a && a.trim() && !allActionItems.includes(a.trim())) {
          allActionItems.push(a.trim());
        }
      });
    }
  });

  const highlights = notes
    .map((n) => {
      const tagsStr = n.tags && n.tags.length > 0 ? ` *(${n.tags.join(", ")})*` : "";
      return `- **${n.title}**${tagsStr}: ${n.summary}`;
    })
    .join("\n");

  const actionItemsSection = allActionItems.length > 0
    ? allActionItems.map((item) => `- [ ] ${item}`).join("\n")
    : "No pending action items recorded for today.";

  return [
    `## Executive Overview`,
    `On ${dateString}, you recorded ${notes.length} note${notes.length === 1 ? "" : "s"} across various activities and thoughts. Here is a summary of your key recordings and actionable follow-ups.`,
    ``,
    `## Key Highlights & Topics`,
    highlights,
    ``,
    `## Action Items & Follow-ups`,
    actionItemsSection,
  ].join("\n");
}

/**
 * Synthesizes highlights, key accomplishments, and pending action items using Gemini Flash.
 * Operates purely on textual note summaries and titles (zero repeated image token costs).
 */
export async function synthesizeDailyDigestWithGemini(
  dateString: string,
  notes: Array<{
    title: string;
    summary: string;
    tags?: string[];
    actionItems?: string[];
    rawText?: string;
    hasImages?: boolean;
  }>,
  apiKey?: string
): Promise<string> {
  if (!notes || notes.length === 0) {
    return "## Executive Overview\nNo notes were recorded for this day.";
  }

  const geminiApiKey = apiKey || process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    warn("GEMINI_API_KEY not configured, using fallback digest generator.");
    return generateFallbackDigestMarkdown(dateString, notes);
  }

  try {
    const ai = getGenAIClient(geminiApiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";

    const notesContext = notes
      .map((note, idx) => {
        const parts = [
          `Note ${idx + 1}: "${note.title}"`,
          `Tags: ${(note.tags || []).join(", ") || "none"}`,
          `Summary: ${note.summary || note.rawText || "(No summary)"}`,
        ];
        if (note.actionItems && note.actionItems.length > 0) {
          parts.push(`Action Items: ${note.actionItems.join("; ")}`);
        }
        if (note.hasImages) {
          parts.push(`[Attached screenshot/image present]`);
        }
        return parts.join("\n");
      })
      .join("\n\n---\n\n");

    const prompt = [
      `You are Argos, Odysseus's faithful hound and an intelligent personal memory log companion.`,
      `Synthesize the following ${notes.length} note(s) captured on ${dateString} into a clean, cohesive, and actionable Daily Digest briefing.`,
      ``,
      `--- NOTES FROM ${dateString} ---`,
      notesContext,
      `-------------------------------`,
      ``,
      `Write a beautifully structured Markdown briefing with the following exact section headers:`,
      ``,
      `## Executive Overview`,
      `A concise 2-4 sentence narrative summarizing the day's primary accomplishments, reflections, and key moments.`,
      ``,
      `## Key Highlights & Topics`,
      `Logical groupings or bullet points (- **Topic / Note Title**: details) synthesizing what was worked on, decided, or recorded. Do not repeat raw notes verbatim; provide insightful summarization.`,
      ``,
      `## Action Items & Follow-ups`,
      `A consolidated, deduplicated markdown checklist (- [ ] Action item) of pending follow-ups and tasks extracted from the notes. Prioritize important items. If there are none, state: "No pending action items recorded for today."`,
      ``,
      `Formatting rules:`,
      `- Return pure Markdown without wrapping in markdown code blocks.`,
      `- Do not include any HTML or preamble text.`,
      `- Ensure tone is encouraging, sharp, and focused on personal clarity.`,
    ].join("\n");

    info(`Synthesizing daily digest for ${dateString} with ${notes.length} notes using ${modelName}`);

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [prompt],
      config: {
        systemInstruction:
          "You are Argos, an intelligent personal memory log companion. You synthesize daily notes, accomplishments, thoughts, and extracted action items into a clean, well-formatted daily digest markdown document.",
      },
    });

    let markdown = (response.text || "").trim();
    if (markdown.startsWith("```markdown")) {
      markdown = markdown.replace(/^```markdown\s*/i, "").replace(/\s*```$/, "");
    } else if (markdown.startsWith("```")) {
      markdown = markdown.replace(/^```\s*/i, "").replace(/\s*```$/, "");
    }

    if (!markdown) {
      warn("Gemini returned empty text for digest synthesis, falling back.");
      return generateFallbackDigestMarkdown(dateString, notes);
    }

    return markdown;
  } catch (err) {
    warn("Gemini daily digest synthesis failed, using fallback:", err);
    return generateFallbackDigestMarkdown(dateString, notes);
  }
}

export interface SearchSynthesisResult {
  answer: string;
  citedNoteIds: string[];
}

/**
 * Parses and validates Gemini JSON output for Ask Argos search synthesis.
 */
export function parseSearchGeminiResponse(
  responseText: string,
  candidateNotes: CitedNote[]
): SearchSynthesisResult {
  let parsed: Partial<SearchSynthesisResult> = {};

  try {
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/i, "").replace(/\s*```$/, "");
    }
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    warn("Failed to parse Gemini search JSON output:", responseText, err);
  }

  const validNoteIdSet = new Set(candidateNotes.map((n) => n.id));

  let citedNoteIds: string[] = [];
  if (Array.isArray(parsed.citedNoteIds)) {
    citedNoteIds = parsed.citedNoteIds
      .map((id) => String(id).trim())
      .filter((id) => validNoteIdSet.has(id));
  }

  let answer = typeof parsed.answer === "string" && parsed.answer.trim()
    ? parsed.answer.trim()
    : responseText.trim();

  // If answer was empty or raw JSON dump, use fallback
  if (!answer || answer.startsWith("{")) {
    const fallback = generateFallbackSearchAnswer("", candidateNotes);
    answer = fallback.answer;
    if (citedNoteIds.length === 0) {
      citedNoteIds = fallback.citedNoteIds;
    }
  }

  // If no cited IDs were extracted, try to find candidate IDs or titles mentioned in the answer
  if (citedNoteIds.length === 0 && candidateNotes.length > 0) {
    for (const note of candidateNotes) {
      if (answer.toLowerCase().includes(note.title.toLowerCase()) || answer.includes(note.id)) {
        citedNoteIds.push(note.id);
      }
    }
    // If still empty, default to the top candidate if available
    if (citedNoteIds.length === 0 && candidateNotes.length > 0) {
      citedNoteIds = [candidateNotes[0].id];
    }
  }

  return { answer, citedNoteIds };
}

/**
 * Deterministic fallback for search answers when Gemini is offline or unavailable.
 */
export function generateFallbackSearchAnswer(
  _query: string,
  candidateNotes: CitedNote[]
): SearchSynthesisResult {
  if (!candidateNotes || candidateNotes.length === 0) {
    return {
      answer: "I couldn't find any relevant notes in your memory log matching that query.",
      citedNoteIds: [],
    };
  }

  const topNotes = candidateNotes.slice(0, 5);
  const notesBullets = topNotes
    .map((n) => `- **${n.title}** (${n.dateString}): ${n.summary}`)
    .join("\n");

  const answer = [
    `Based on your notes, here are the entries most relevant to your question:`,
    ``,
    notesBullets,
  ].join("\n");

  return {
    answer,
    citedNoteIds: topNotes.map((n) => n.id),
  };
}

/**
 * Synthesizes a natural language answer with cited notes using Gemini Flash.
 * Operates purely on textual note summaries and titles (zero repeated image token costs).
 */
export async function synthesizeSearchAnswerWithGemini(
  query: string,
  candidateNotes: CitedNote[],
  apiKey?: string
): Promise<SearchSynthesisResult> {
  if (!candidateNotes || candidateNotes.length === 0) {
    return {
      answer: "I searched your memory log, but could not find any notes related to your query.",
      citedNoteIds: [],
    };
  }

  const geminiApiKey = apiKey || process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    warn("GEMINI_API_KEY not configured, using fallback search synthesizer.");
    return generateFallbackSearchAnswer(query, candidateNotes);
  }

  try {
    const ai = getGenAIClient(geminiApiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";

    const notesContext = candidateNotes
      .map((note) => {
        const parts = [
          `[Note ID: ${note.id}]`,
          `Date: ${note.dateString}`,
          `Title: ${note.title}`,
          `Tags: ${(note.tags || []).join(", ") || "none"}`,
          `Summary: ${note.summary}`,
        ];
        if (note.actionItems && note.actionItems.length > 0) {
          parts.push(`Action Items: ${note.actionItems.join("; ")}`);
        }
        return parts.join("\n");
      })
      .join("\n\n---\n\n");

    const prompt = [
      `User Question: "${query}"`,
      ``,
      `--- CANDIDATE MEMORY NOTES (${candidateNotes.length} notes) ---`,
      notesContext,
      `-------------------------------------------------------`,
      ``,
      `Instructions:`,
      `1. Directly and conversationally answer the user's question using facts and details exclusively from the provided notes.`,
      `2. Mention dates or timing when relevant (e.g., "On October 20th...").`,
      `3. If the provided notes do not contain the answer, say honestly that you could not find the information in their recorded notes. Do not hallucinate.`,
      `4. In "citedNoteIds", list the exact IDs of any notes whose contents contributed to the answer.`,
    ].join("\n");

    info(`Synthesizing search answer for query "${query}" with ${candidateNotes.length} notes using ${modelName}`);

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [prompt],
      config: {
        systemInstruction:
          "You are Argos, Odysseus's faithful hound and an intelligent personal memory log companion. You help the user recall details from their past notes and multimodal memories accurately, politely, and concisely.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: {
              type: Type.STRING,
              description: "Direct markdown answer answering the user's question based on their notes, citing specific dates and context.",
            },
            citedNoteIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of note IDs that were relevant or cited in the answer. Empty array if none.",
            },
          },
          required: ["answer", "citedNoteIds"],
        },
      },
    });

    const responseText = response.text ? response.text.trim() : "";
    return parseSearchGeminiResponse(responseText, candidateNotes);
  } catch (err) {
    warn("Gemini search answer synthesis failed, using fallback:", err);
    return generateFallbackSearchAnswer(query, candidateNotes);
  }
}

