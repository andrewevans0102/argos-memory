import test from "node:test";
import assert from "node:assert/strict";
import {
  inferMimeType,
  parseGeminiResponse,
  generateFallbackNoteExtraction,
  getGenAIClient,
} from "../lib/gemini.js";
import {
  getFormattedDate,
  isEmailAllowed,
  validateIngestPayload,
  persistActionItemsFromNote,
} from "../lib/ingestNote.js";

test("inferMimeType: infers mime types correctly", () => {
  assert.equal(inferMimeType("https://example.com/photo.webp?alt=media"), "image/webp");
  assert.equal(inferMimeType("https://example.com/receipt.png"), "image/png");
  assert.equal(inferMimeType("https://example.com/bill.jpg"), "image/jpeg");
  assert.equal(inferMimeType("https://example.com/bill.jpeg"), "image/jpeg");
  assert.equal(inferMimeType("https://example.com/scan.gif"), "image/gif");
  assert.equal(inferMimeType("https://example.com/document.heic"), "image/heic");

  // Content type header takes precedence if valid image
  assert.equal(inferMimeType("https://example.com/file", "image/png; charset=utf-8"), "image/png");
  assert.equal(inferMimeType("https://example.com/unknown", null), "image/webp");
});

test("parseGeminiResponse: parses pure JSON response", () => {
  const json = JSON.stringify({
    title: "Grocery Shopping List",
    summary: "- Milk\n- Eggs\n- Sourdough Bread",
    tags: ["Shopping", "Food", "Errand"],
    actionItems: ["Buy sourdough at bakery", "Check egg expiration"],
  });

  const res = parseGeminiResponse(json, "Remember to buy groceries");
  assert.equal(res.title, "Grocery Shopping List");
  assert.equal(res.summary, "- Milk\n- Eggs\n- Sourdough Bread");
  assert.deepEqual(res.tags, ["shopping", "food", "errand"]);
  assert.deepEqual(res.actionItems, [
    "Buy sourdough at bakery",
    "Check egg expiration",
  ]);
});

test("parseGeminiResponse: handles markdown-fenced json", () => {
  const fenced = "```json\n" + JSON.stringify({
    title: "Quarterly Taxes",
    summary: "Estimated quarterly payment due on April 15th.",
    tags: ["finance", "taxes"],
    actionItems: ["Submit 1040-ES payment"],
  }) + "\n```";

  const res = parseGeminiResponse(fenced, "Taxes reminder");
  assert.equal(res.title, "Quarterly Taxes");
  assert.deepEqual(res.tags, ["finance", "taxes"]);
  assert.deepEqual(res.actionItems, ["Submit 1040-ES payment"]);
});

test("parseGeminiResponse: fallbacks gracefully when model output is invalid or empty", () => {
  const res = parseGeminiResponse("Something went wrong", "Call plumber for leaking sink tomorrow at 9am");
  assert.equal(res.title, "Call plumber for leaking sink tomorrow at 9am");
  assert.equal(res.summary, "Call plumber for leaking sink tomorrow at 9am");
  assert.deepEqual(res.tags, ["note"]);
  assert.deepEqual(res.actionItems, []);
});

test("getFormattedDate: formats date based on timezone", () => {
  // 2026-03-15 02:00:00 UTC -> in UTC it's 2026-03-15, in Tokyo (+9) it's 2026-03-15
  const date = new Date("2026-03-15T02:00:00Z");
  assert.equal(getFormattedDate(date, "UTC"), "2026-03-15");
  assert.equal(getFormattedDate(date, "America/New_York"), "2026-03-14");
  assert.equal(getFormattedDate(date, "Asia/Tokyo"), "2026-03-15");

  // Invalid timezone falls back to UTC
  assert.equal(getFormattedDate(date, "Invalid/Timezone"), "2026-03-15");
});

test("isEmailAllowed: enforces allowed emails whitelist", () => {
  // Empty or undefined whitelist allows all
  assert.equal(isEmailAllowed("user@test.com", undefined), true);
  assert.equal(isEmailAllowed("user@test.com", ""), true);
  assert.equal(isEmailAllowed("user@test.com", "  "), true);

  // Whitelist configured
  const whitelist = "alice@example.com, bob@example.com";
  assert.equal(isEmailAllowed("alice@example.com", whitelist), true);
  assert.equal(isEmailAllowed("ALICE@EXAMPLE.COM", whitelist), true);
  assert.equal(isEmailAllowed("bob@example.com", whitelist), true);
  assert.equal(isEmailAllowed("eve@example.com", whitelist), false);
  assert.equal(isEmailAllowed(undefined, whitelist), false);
});

test("validateIngestPayload: validates and extracts input correctly", () => {
  // RawText or text
  assert.deepEqual(validateIngestPayload({ rawText: "Hello Argos" }), {
    rawText: "Hello Argos",
    imageUrls: [],
  });
  assert.deepEqual(validateIngestPayload({ text: "Hello Argos" }), {
    rawText: "Hello Argos",
    imageUrls: [],
  });

  // imageUrls
  assert.deepEqual(
    validateIngestPayload({
      rawText: "Receipt",
      imageUrls: ["https://example.com/receipt.webp", " ", null, 123],
    }),
    {
      rawText: "Receipt",
      imageUrls: ["https://example.com/receipt.webp"],
    }
  );

  // Missing both text and imageUrls throws error
  assert.throws(() => validateIngestPayload({}), /A note must contain either/);
  assert.throws(() => validateIngestPayload({ rawText: "   ", imageUrls: [] }), /A note must contain either/);
});

test("generateFallbackNoteExtraction: generates clean title and summary fallback", () => {
  const textNote = generateFallbackNoteExtraction("Dentist appointment next Tuesday at 3pm\nBring insurance card", false);
  assert.equal(textNote.title, "Dentist appointment next Tuesday at 3pm");
  assert.equal(textNote.summary, "Dentist appointment next Tuesday at 3pm\nBring insurance card");
  assert.deepEqual(textNote.tags, ["note"]);
  assert.deepEqual(textNote.actionItems, []);

  const imageNote = generateFallbackNoteExtraction("", true);
  assert.equal(imageNote.title, "Captured Attachment");
  assert.equal(imageNote.summary, "Visual attachment captured.");
  assert.deepEqual(imageNote.tags, ["attachment", "note"]);
  assert.deepEqual(imageNote.actionItems, []);
});

test("getGenAIClient: caches client instance across calls with identical key", () => {
  const client1 = getGenAIClient("test-key-123");
  const client2 = getGenAIClient("test-key-123");
  assert.equal(client1, client2);

  const client3 = getGenAIClient("different-key-456");
  assert.notEqual(client1, client3);
});

test("persistActionItemsFromNote: persists new action items and deduplicates against pending", async () => {
  const createdRecords = [];
  const existingRecords = [
    { text: "Already pending task", completed: false },
  ];

  const mockDb = {
    collection: (col) => {
      assert.equal(col, "users");
      return {
        doc: (uid) => {
          assert.equal(uid, "test-user-1");
          return {
            collection: (subCol) => {
              assert.equal(subCol, "actions");
              return {
                where: (field, op, val) => {
                  assert.equal(field, "completed");
                  assert.equal(op, "==");
                  assert.equal(val, false);
                  return {
                    get: async () => ({
                      docs: existingRecords.map((r) => ({
                        data: () => r,
                      })),
                    }),
                  };
                },
                doc: () => {
                  const id = `act-${createdRecords.length + 1}`;
                  return {
                    id,
                    set: async (record) => {
                      createdRecords.push({ id, ...record });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const actionIds = await persistActionItemsFromNote(
    mockDb,
    "test-user-1",
    "note-123",
    "2026-10-21",
    [
      "Already pending task", // duplicate - should be skipped
      "Call the plumber",     // new
      "Buy lightbulbs",       // new
      "   ",                 // empty - should be skipped
    ]
  );

  assert.equal(actionIds.length, 2);
  assert.equal(createdRecords.length, 2);
  assert.equal(createdRecords[0].text, "Call the plumber");
  assert.equal(createdRecords[0].completed, false);
  assert.equal(createdRecords[0].sourceNoteId, "note-123");
  assert.equal(createdRecords[0].sourceDigestDate, "2026-10-21");
  assert.equal(createdRecords[1].text, "Buy lightbulbs");
});
