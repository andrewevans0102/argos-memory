import test from "node:test";
import assert from "node:assert/strict";
import {
  getYesterdayDateString,
  getLocalHour,
  extractMediaUrlsFromNotes,
  extractActionItemsFromDigestMarkdown,
} from "../lib/dailyDigest.js";
import {
  formatDisplayDate,
  escapeHtml,
  formatInlineMarkdown,
  markdownToHtml,
  buildMediaAttachmentsSection,
  stripActionItemsSectionFromMarkdown,
  buildActionItemsSection,
  generateEmailHtml,
  generateEmailText,
  generateTestEmailHtml,
  generateTestEmailText,
} from "../lib/emailTemplate.js";
import {
  generateFallbackDigestMarkdown,
  synthesizeDailyDigestWithGemini,
} from "../lib/gemini.js";

test("getYesterdayDateString: computes yesterday across dates, months, leap years, and timezones", () => {
  // Regular day
  const midMonth = new Date("2026-10-21T15:00:00Z");
  assert.equal(getYesterdayDateString(midMonth, "UTC"), "2026-10-20");

  // Month boundary (March 1st -> Feb 28 in non-leap year)
  const marchFirst2026 = new Date("2026-03-01T12:00:00Z");
  assert.equal(getYesterdayDateString(marchFirst2026, "UTC"), "2026-02-28");

  // Leap year boundary (March 1st -> Feb 29 in 2024 leap year)
  const marchFirst2024 = new Date("2024-03-01T12:00:00Z");
  assert.equal(getYesterdayDateString(marchFirst2024, "UTC"), "2024-02-29");

  // Year boundary (Jan 1st -> Dec 31 of prior year)
  const newYear = new Date("2026-01-01T12:00:00Z");
  assert.equal(getYesterdayDateString(newYear, "UTC"), "2025-12-31");

  // Timezone difference: At 2026-10-21 02:00 UTC, it's 2026-10-20 in New York (yesterday = 2026-10-19)
  const earlyMorningUtc = new Date("2026-10-21T02:00:00Z");
  assert.equal(getYesterdayDateString(earlyMorningUtc, "America/New_York"), "2026-10-19");
  assert.equal(getYesterdayDateString(earlyMorningUtc, "Asia/Tokyo"), "2026-10-20");
});

test("getLocalHour: extracts local 24-hour hour and falls back gracefully", () => {
  const date = new Date("2026-10-21T10:00:00Z");
  assert.equal(getLocalHour(date, "UTC"), 10);
  // Tokyo is UTC+9 -> 19
  assert.equal(getLocalHour(date, "Asia/Tokyo"), 19);
  // New York is UTC-4 in daylight saving (October) -> 6 AM
  assert.equal(getLocalHour(date, "America/New_York"), 6);

  // Invalid timezone falls back to UTC
  assert.equal(getLocalHour(date, "Nonexistent/Zone"), 10);
});

test("extractMediaUrlsFromNotes: extracts and deduplicates images with note titles", () => {
  const sampleNotes = [
    {
      id: "note-1",
      title: "Home Depot Receipt",
      summary: "Purchased copper pipe fittings and solder.",
      tags: ["home", "receipt"],
      actionItems: ["Keep receipt for tax return"],
      imageUrls: [
        "https://firebasestorage.googleapis.com/v0/b/bucket/receipt1.webp",
        "https://firebasestorage.googleapis.com/v0/b/bucket/receipt2.webp",
      ],
      hasImages: true,
      rawText: "Receipt",
      createdAt: null,
      dateString: "2026-10-20",
    },
    {
      id: "note-2",
      title: "Grocery Ideas",
      summary: "List of items to buy at store.",
      tags: ["food"],
      actionItems: ["Buy milk"],
      imageUrls: [],
      hasImages: false,
      rawText: "Milk",
      createdAt: null,
      dateString: "2026-10-20",
    },
    {
      id: "note-3",
      title: "Duplicate Image Note",
      summary: "Duplicate image upload test.",
      tags: ["test"],
      actionItems: [],
      imageUrls: [
        "https://firebasestorage.googleapis.com/v0/b/bucket/receipt1.webp", // Duplicate of note-1
        "   ", // Whitespace
      ],
      hasImages: true,
      rawText: "Test",
      createdAt: null,
      dateString: "2026-10-20",
    },
  ];

  const media = extractMediaUrlsFromNotes(sampleNotes);
  assert.equal(media.length, 2);
  assert.equal(media[0].noteTitle, "Home Depot Receipt");
  assert.equal(media[0].url, "https://firebasestorage.googleapis.com/v0/b/bucket/receipt1.webp");
  assert.equal(media[1].noteTitle, "Home Depot Receipt");
  assert.equal(media[1].url, "https://firebasestorage.googleapis.com/v0/b/bucket/receipt2.webp");
});

test("generateFallbackDigestMarkdown: structures notes into clean sections with deduplicated action items", () => {
  const notes = [
    {
      title: "Quarterly Taxes",
      summary: "Filed estimated quarterly taxes with IRS.",
      tags: ["finance", "taxes"],
      actionItems: ["Save confirmation PDF", "Check bank balance next Tuesday"],
    },
    {
      title: "Dentist Appointment",
      summary: "Teeth cleaning completed, no cavities.",
      tags: ["health"],
      actionItems: ["Schedule 6-month checkup in April", "Save confirmation PDF"], // Duplicate action item
    },
  ];

  const markdown = generateFallbackDigestMarkdown("2026-10-20", notes);

  assert.ok(markdown.includes("## Executive Overview"));
  assert.ok(markdown.includes("On 2026-10-20, you recorded 2 notes"));
  assert.ok(markdown.includes("## Key Highlights & Topics"));
  assert.ok(markdown.includes("- **Quarterly Taxes** *(finance, taxes)*: Filed estimated quarterly taxes with IRS."));
  assert.ok(markdown.includes("- **Dentist Appointment** *(health)*: Teeth cleaning completed, no cavities."));
  assert.ok(markdown.includes("## Action Items & Follow-ups"));
  assert.ok(markdown.includes("- [ ] Save confirmation PDF"));
  assert.ok(markdown.includes("- [ ] Check bank balance next Tuesday"));
  assert.ok(markdown.includes("- [ ] Schedule 6-month checkup in April"));

  // Verify deduplication
  const occurrences = markdown.split("- [ ] Save confirmation PDF").length - 1;
  assert.equal(occurrences, 1);
});

test("synthesizeDailyDigestWithGemini: returns empty message for 0 notes and uses fallback when no API key", async () => {
  const emptyRes = await synthesizeDailyDigestWithGemini("2026-10-20", []);
  assert.ok(emptyRes.includes("No notes were recorded"));

  const fallbackRes = await synthesizeDailyDigestWithGemini(
    "2026-10-20",
    [{ title: "Test Note", summary: "Summary here", tags: ["test"], actionItems: ["Do test"] }],
    "" // empty apiKey
  );
  assert.ok(fallbackRes.includes("## Executive Overview"));
  assert.ok(fallbackRes.includes("Test Note"));
});

test("formatDisplayDate: formats YYYY-MM-DD into human-readable date", () => {
  const formatted = formatDisplayDate("2026-10-20");
  assert.ok(formatted.includes("October"));
  assert.ok(formatted.includes("20"));
  assert.ok(formatted.includes("2026"));

  // Malformed date fallback
  assert.equal(formatDisplayDate("invalid-date"), "invalid-date");
});

test("escapeHtml & formatInlineMarkdown: protects against XSS and formats markdown inlines", () => {
  assert.equal(
    escapeHtml('<script>alert("xss")</script> & \'test\''),
    "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#039;test&#039;"
  );

  const formatted = formatInlineMarkdown("Use `npm test` and **strong text** with *emphasis*");
  assert.ok(formatted.includes("<code"));
  assert.ok(formatted.includes("npm test</code>"));
  assert.ok(formatted.includes("<strong"));
  assert.ok(formatted.includes("strong text</strong>"));
  assert.ok(formatted.includes("<em"));
  assert.ok(formatted.includes("emphasis</em>"));
});

test("markdownToHtml: converts headings, lists, checkboxes, blockquotes, and paragraphs", () => {
  const input = [
    "# Top Title",
    "## Section Header",
    "### Subsection",
    "",
    "A regular paragraph with **bold** and `code`.",
    "",
    "> A memorable quote from Odysseus",
    "",
    "---",
    "",
    "- First bullet",
    "- Second bullet",
    "",
    "1. Ordered item 1",
    "2. Ordered item 2",
    "",
    "- [ ] Pending task",
    "- [x] Finished task",
  ].join("\n");

  const html = markdownToHtml(input);

  assert.ok(html.includes("<h1"));
  assert.ok(html.includes("Top Title</h1>"));
  assert.ok(html.includes("<h2"));
  assert.ok(html.includes("Section Header</h2>"));
  assert.ok(html.includes("<h3"));
  assert.ok(html.includes("Subsection</h3>"));
  assert.ok(html.includes("<p"));
  assert.ok(html.includes("A regular paragraph"));
  assert.ok(html.includes("<blockquote"));
  assert.ok(html.includes("A memorable quote from Odysseus</blockquote>"));
  assert.ok(html.includes("<hr"));
  assert.ok(html.includes("<ul"));
  assert.ok(html.includes("First bullet</li>"));
  assert.ok(html.includes("<ol"));
  assert.ok(html.includes("Ordered item 1</li>"));
  assert.ok(html.includes("Pending task</li>"));
  assert.ok(html.includes("line-through")); // finished task
  assert.ok(html.includes("Finished task</li>"));
});

test("buildMediaAttachmentsSection: builds responsive preview cards with links", () => {
  // Empty media returns empty string
  assert.equal(buildMediaAttachmentsSection([]), "");

  const media = [
    {
      noteTitle: "Plumbing Receipt",
      url: "https://example.com/receipt.webp",
    },
    {
      noteTitle: "Whiteboard Architecture",
      url: "https://example.com/whiteboard.png",
    },
  ];

  const html = buildMediaAttachmentsSection(media);
  assert.ok(html.includes("Visual Attachments &amp; Screenshots"));
  assert.ok(html.includes("Plumbing Receipt"));
  assert.ok(html.includes("https://example.com/receipt.webp"));
  assert.ok(html.includes("Whiteboard Architecture"));
  assert.ok(html.includes("https://example.com/whiteboard.png"));
  assert.ok(html.includes("View Image &rarr;"));
});

test("generateEmailHtml: produces complete Argos branded email template", () => {
  const html = generateEmailHtml({
    dateString: "2026-10-20",
    contentMarkdown: "## Highlights\n- All systems running smoothly.",
    noteCount: 3,
    mediaUrls: [
      {
        noteTitle: "Server Metrics",
        url: "https://example.com/metrics.webp",
      },
    ],
    userEmail: "odysseus@ithaca.gr",
  });

  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("Argos"));
  assert.ok(html.includes("Daily Briefing"));
  assert.ok(html.includes("3"));
  assert.ok(html.includes("Notes"));
  assert.ok(html.includes("1 Image"));
  assert.ok(html.includes("All systems running smoothly."));
  assert.ok(html.includes("Visual Attachments &amp; Screenshots"));
  assert.ok(html.includes("Server Metrics"));
  assert.ok(html.includes("https://example.com/metrics.webp"));
  assert.ok(html.includes("odysseus@ithaca.gr"));
  assert.ok(html.includes("Argos, Odysseus’s faithful hound"));
});

test("generateEmailText: produces clean plaintext fallback with attachments", () => {
  const text = generateEmailText({
    dateString: "2026-10-20",
    contentMarkdown: "## Highlights\n- Completed project phase.",
    noteCount: 2,
    mediaUrls: [
      {
        noteTitle: "Diagram",
        url: "https://example.com/diagram.webp",
      },
    ],
    userEmail: "user@example.com",
  });

  assert.ok(text.includes("ARGOS DAILY DIGEST"));
  assert.ok(text.includes("Notes Captured: 2 | Attachments: 1"));
  assert.ok(text.includes("Completed project phase."));
  assert.ok(text.includes("VISUAL ATTACHMENTS & SCREENSHOTS"));
  assert.ok(text.includes("1. Diagram"));
  assert.ok(text.includes("https://example.com/diagram.webp"));
  assert.ok(text.includes("user@example.com"));
});

test("generateTestEmailHtml: formats verified configuration test email", () => {
  const html = generateTestEmailHtml({
    userEmail: "odysseus@ithaca.gr",
    timezone: "America/New_York",
    digestHour: 7,
    serverTimestampIso: "2026-10-22T10:00:00.000Z",
  });

  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("Argos Email Dispatch Test"));
  assert.ok(html.includes("Connection Verified"));
  assert.ok(html.includes("odysseus@ithaca.gr"));
  assert.ok(html.includes("America/New_York"));
  assert.ok(html.includes("07:00 Local Time"));
  assert.ok(html.includes("2026-10-22T10:00:00.000Z"));
  assert.ok(html.includes("Resend"));
});

test("generateTestEmailText: produces clean plaintext test email", () => {
  const text = generateTestEmailText({
    userEmail: "test@example.com",
    timezone: "Europe/London",
    digestHour: 6,
    serverTimestampIso: "2026-10-22T10:00:00.000Z",
  });

  assert.ok(text.includes("ARGOS EMAIL DISPATCH TEST"));
  assert.ok(text.includes("Recipient: test@example.com"));
  assert.ok(text.includes("Timezone: Europe/London"));
  assert.ok(text.includes("Daily Schedule: 06:00 Local Time"));
  assert.ok(text.includes("Verified At: 2026-10-22T10:00:00.000Z"));
});

test("extractActionItemsFromDigestMarkdown: extracts, trims, and deduplicates items", () => {
  const markdown = `
## Executive Overview
A busy and productive day.

## Key Highlights & Topics
- **Meeting with Alice**: Discussed project milestones.

## Action Items & Follow-ups
- [ ] Email accountant the Q3 reports
- [x] Pay utility bill
- Call the veterinarian for Argos checkup
* **Email accountant the Q3 reports**
1. Check flight status
`;

  const extracted = extractActionItemsFromDigestMarkdown(markdown);
  assert.equal(extracted.length, 4);
  assert.equal(extracted[0], "Email accountant the Q3 reports");
  assert.equal(extracted[1], "Pay utility bill");
  assert.equal(extracted[2], "Call the veterinarian for Argos checkup");
  assert.equal(extracted[3], "Check flight status");

  // Handles negative phrasing
  const emptyMarkdown = `
## Executive Overview
Quiet day.

## Action Items & Follow-ups
No pending action items recorded for today.
`;
  assert.deepEqual(extractActionItemsFromDigestMarkdown(emptyMarkdown), []);
});

test("stripActionItemsSectionFromMarkdown: removes the action items section cleanly", () => {
  const markdown = `## Executive Overview
Everything went well.

## Key Highlights & Topics
- **Work**: Finished feature.

## Action Items & Follow-ups
- [ ] Do something
- [ ] Another item
`;

  const stripped = stripActionItemsSectionFromMarkdown(markdown);
  assert.ok(stripped.includes("## Executive Overview"));
  assert.ok(stripped.includes("## Key Highlights & Topics"));
  assert.ok(!stripped.includes("## Action Items & Follow-ups"));
  assert.ok(!stripped.includes("Do something"));
});

test("buildActionItemsSection: displays actions with NEW badges and completed styles", () => {
  const actions = [
    { id: "1", text: "New task from today", completed: false, isNew: true },
    { id: "2", text: "Existing pending task", completed: false, isNew: false },
    { id: "3", text: "Completed older task", completed: true, isNew: false },
  ];

  const html = buildActionItemsSection(actions);
  assert.ok(html.includes("Action Items &amp; Follow-ups"));
  assert.ok(html.includes("2 Pending"));
  assert.ok(html.includes("1 New"));
  assert.ok(html.includes("New task from today"));
  assert.ok(html.includes(">NEW</span>"));
  assert.ok(html.includes("Existing pending task"));
  assert.ok(html.includes("Completed (1)"));
  assert.ok(html.includes("line-through"));
  assert.ok(html.includes("Completed older task"));
});

test("generateEmailHtml: renders persistent action items section at bottom of email", () => {
  const html = generateEmailHtml({
    dateString: "2026-10-21",
    contentMarkdown: "## Key Highlights & Topics\n- Did research.",
    noteCount: 1,
    mediaUrls: [
      { noteTitle: "Screenshot", url: "https://example.com/pic.webp" },
    ],
    userEmail: "odysseus@ithaca.gr",
    actions: [
      { id: "a1", text: "Schedule dentist", completed: false, isNew: true },
      { id: "a2", text: "Buy dog food", completed: true, isNew: false },
    ],
  });

  assert.ok(html.includes("Action Items &amp; Follow-ups"));
  assert.ok(html.includes("Schedule dentist"));
  assert.ok(html.includes(">NEW</span>"));
  assert.ok(html.includes("Buy dog food"));
  // Verify action items appears after media attachments
  const mediaPos = html.indexOf("Visual Attachments &amp; Screenshots");
  const actionPos = html.indexOf("Action Items &amp; Follow-ups");
  assert.ok(mediaPos < actionPos, "Action items should appear after media attachments at bottom");
});

test("generateEmailText: includes actions with [NEW] and [x] at bottom", () => {
  const text = generateEmailText({
    dateString: "2026-10-21",
    contentMarkdown: "Overview content.",
    noteCount: 1,
    mediaUrls: [],
    userEmail: "user@example.com",
    actions: [
      { id: "a1", text: "First new task", completed: false, isNew: true },
      { id: "a2", text: "Older completed task", completed: true, isNew: false },
    ],
  });

  assert.ok(text.includes("ACTION ITEMS & FOLLOW-UPS"));
  assert.ok(text.includes("- [ ] [NEW] First new task"));
  assert.ok(text.includes("- [x] Older completed task"));
});
