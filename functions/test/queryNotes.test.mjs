import test from "node:test";
import assert from "node:assert/strict";
import {
  extractSearchKeywords,
  scoreNoteRelevance,
  selectCandidateNotes,
} from "../lib/queryNotes.js";
import {
  parseSearchGeminiResponse,
  generateFallbackSearchAnswer,
  synthesizeSearchAnswerWithGemini,
} from "../lib/gemini.js";

test("extractSearchKeywords: filters stopwords and extracts meaningful tokens", () => {
  const query = "What was the name of the plumber I hired last week?";
  const keywords = extractSearchKeywords(query);

  // 'what', 'was', 'the', 'of', 'the', 'i', 'last' (maybe?), 'week' (not stopword)
  assert.ok(keywords.includes("name"));
  assert.ok(keywords.includes("plumber"));
  assert.ok(keywords.includes("hired"));
  assert.ok(keywords.includes("week"));
  assert.ok(!keywords.includes("what"));
  assert.ok(!keywords.includes("was"));
  assert.ok(!keywords.includes("the"));
  assert.ok(!keywords.includes("of"));
  assert.ok(!keywords.includes("i"));
});

test("extractSearchKeywords: handles punctuation, uppercase, and duplicates", () => {
  const query = "Espresso!! Coffee, coffee grinder? (receipt)";
  const keywords = extractSearchKeywords(query);

  assert.deepEqual(keywords.sort(), ["coffee", "espresso", "grinder", "receipt"].sort());
});

test("scoreNoteRelevance: weights tags, titles, summaries, and exact phrases", () => {
  const note1 = {
    title: "Plumber Invoice for Kitchen Sink",
    summary: "Paid Joe the Plumber $250 for fixing the disposal.",
    tags: ["home", "plumber", "repair"],
    actionItems: ["File invoice with tax documents"],
    rawText: "Plumber Joe $250",
    dateString: "2026-10-15",
  };

  const note2 = {
    title: "Grocery Shopping",
    summary: "Bought milk, apples, and bread.",
    tags: ["groceries"],
    actionItems: [],
    rawText: "Milk and bread",
    dateString: "2026-10-14",
  };

  const keywords = ["plumber", "kitchen"];
  const score1 = scoreNoteRelevance(note1, keywords, "plumber");
  const score2 = scoreNoteRelevance(note2, keywords, "plumber");

  assert.ok(score1 > 20, `Score1 should be high: ${score1}`);
  assert.equal(score2, 0);

  // Exact phrase match in title gives high bonus
  const phraseScore = scoreNoteRelevance(note1, ["kitchen", "sink"], "kitchen sink");
  assert.ok(phraseScore >= 20);
});

test("selectCandidateNotes: ranks highest scoring candidates first and truncates to limit", () => {
  const notes = [
    {
      id: "note-1",
      title: "Routine dentist appointment",
      summary: "Cleaned teeth, scheduled next checkup.",
      tags: ["health"],
      actionItems: [],
      imageUrls: [],
      hasImages: false,
      dateString: "2026-10-10",
      rawText: "Dentist",
      createdAt: null,
    },
    {
      id: "note-2",
      title: "Hired Plumber Mike",
      summary: "Plumber Mike repaired the bathroom leak and charged $180.",
      tags: ["home", "repair", "plumber"],
      actionItems: ["Call Mike back if it leaks again"],
      imageUrls: [],
      hasImages: false,
      dateString: "2026-10-12",
      rawText: "Plumber leak",
      createdAt: null,
    },
    {
      id: "note-3",
      title: "Plumber recommendation from Bob",
      summary: "Bob recommended calling Joe's Plumbing.",
      tags: ["recommendations"],
      actionItems: [],
      imageUrls: [],
      hasImages: false,
      dateString: "2026-10-08",
      rawText: "Plumber recommendation",
      createdAt: null,
    },
  ];

  const candidates = selectCandidateNotes(notes, "Who was the plumber I hired?", 2);
  assert.equal(candidates.length, 2);
  // note-2 has title match, tag match, summary match, and action items match -> highest
  assert.equal(candidates[0].id, "note-2");
  assert.equal(candidates[1].id, "note-3");
});

test("selectCandidateNotes: falls back to recent notes when query has no matching keywords", () => {
  const notes = [
    {
      id: "n-1",
      title: "Note 1",
      summary: "Summary 1",
      tags: [],
      actionItems: [],
      imageUrls: [],
      hasImages: false,
      dateString: "2026-10-10",
      rawText: "Text 1",
      createdAt: null,
    },
    {
      id: "n-2",
      title: "Note 2",
      summary: "Summary 2",
      tags: [],
      actionItems: [],
      imageUrls: [],
      hasImages: false,
      dateString: "2026-10-09",
      rawText: "Text 2",
      createdAt: null,
    },
  ];

  // Stopwords only query
  const candidates = selectCandidateNotes(notes, "what was that", 1);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, "n-1");
});

test("parseSearchGeminiResponse: parses structured JSON and validates citedNoteIds", () => {
  const candidates = [
    {
      id: "note-100",
      title: "Espresso Machine Purchase",
      dateString: "2026-10-12",
      summary: "Purchased Breville Bambino for $299.",
      tags: ["coffee"],
      hasImages: true,
    },
    {
      id: "note-200",
      title: "Coffee Beans Order",
      dateString: "2026-10-14",
      summary: "Ordered Ethiopian Yirgacheffe beans.",
      tags: ["coffee"],
      hasImages: false,
    },
  ];

  const jsonResponse = JSON.stringify({
    answer: "You bought a Breville Bambino espresso machine on October 12, 2026 for $299.",
    citedNoteIds: ["note-100", "non-existent-id"],
  });

  const parsed = parseSearchGeminiResponse(jsonResponse, candidates);
  assert.equal(parsed.answer, "You bought a Breville Bambino espresso machine on October 12, 2026 for $299.");
  assert.deepEqual(parsed.citedNoteIds, ["note-100"]);
});

test("parseSearchGeminiResponse: handles code fences and infers cited notes from title mention", () => {
  const candidates = [
    {
      id: "note-abc",
      title: "Plumber Joe's Service",
      dateString: "2026-09-01",
      summary: "Fixed main pipe line.",
      tags: ["repair"],
      hasImages: false,
    },
  ];

  const responseText = "```\nPlumber Joe's Service was performed on September 1st.\n```";
  const parsed = parseSearchGeminiResponse(responseText, candidates);

  assert.ok(parsed.answer.includes("Plumber Joe's Service"));
  assert.deepEqual(parsed.citedNoteIds, ["note-abc"]);
});

test("generateFallbackSearchAnswer: generates clean structured markdown bullets", () => {
  // Empty
  const emptyRes = generateFallbackSearchAnswer("anything", []);
  assert.ok(emptyRes.answer.includes("couldn't find any relevant notes"));
  assert.deepEqual(emptyRes.citedNoteIds, []);

  // With notes
  const notes = [
    {
      id: "note-1",
      title: "Team Meeting",
      dateString: "2026-10-18",
      summary: "Discussed Q4 roadmap and architecture deliverables.",
      tags: ["work"],
      hasImages: false,
    },
  ];

  const res = generateFallbackSearchAnswer("team meeting", notes);
  assert.ok(res.answer.includes("Team Meeting"));
  assert.ok(res.answer.includes("2026-10-18"));
  assert.deepEqual(res.citedNoteIds, ["note-1"]);
});

test("synthesizeSearchAnswerWithGemini: returns fallback when API key is missing or empty notes", async () => {
  const emptyNotesRes = await synthesizeSearchAnswerWithGemini("test query", []);
  assert.ok(emptyNotesRes.answer.includes("could not find any notes"));

  const fallbackRes = await synthesizeSearchAnswerWithGemini(
    "Where is my receipt?",
    [
      {
        id: "note-receipt",
        title: "Apple Store Receipt",
        dateString: "2026-10-15",
        summary: "Purchased USB-C adapter.",
        tags: ["tech", "receipt"],
        hasImages: true,
      },
    ],
    "" // No API key
  );

  assert.ok(fallbackRes.answer.includes("Apple Store Receipt"));
  assert.deepEqual(fallbackRes.citedNoteIds, ["note-receipt"]);
});
