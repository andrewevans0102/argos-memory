import type { MediaUrl, ActionItemEmailView } from "./types.js";

export interface EmailTemplateParams {
  dateString: string;
  contentMarkdown: string;
  noteCount: number;
  mediaUrls: MediaUrl[];
  userEmail?: string;
  actions?: ActionItemEmailView[];
}

/**
 * Formats a YYYY-MM-DD date string into an elegant human-readable date.
 */
export function formatDisplayDate(dateString: string): string {
  try {
    const [year, month, day] = dateString.split("-").map(Number);
    if (!year || !month || !day) return dateString;
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Escapes HTML characters for safe template rendering.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formats inline Markdown features (bold, italics, code, links).
 */
export function formatInlineMarkdown(text: string): string {
  let escaped = escapeHtml(text);

  // Inline code `code`
  escaped = escaped.replace(
    /`([^`]+)`/g,
    '<code style="background-color: #1e293b; color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;">$1</code>'
  );

  // Bold **text** or __text__
  escaped = escaped.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong style="color: #ffffff; font-weight: 600;">$1</strong>'
  );
  escaped = escaped.replace(
    /__([^_]+)__/g,
    '<strong style="color: #ffffff; font-weight: 600;">$1</strong>'
  );

  // Italics *text* or _text_
  escaped = escaped.replace(
    /\*([^*]+)\*/g,
    '<em style="color: #cbd5e1;">$1</em>'
  );
  escaped = escaped.replace(
    /_([^_]+)_/g,
    '<em style="color: #cbd5e1;">$1</em>'
  );

  return escaped;
}

/**
 * Converts synthesized Markdown content into inline-styled email-safe HTML.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) {
    return '<p style="color: #94a3b8; font-size: 14px; margin: 0;">No content recorded.</p>';
  }

  const lines = markdown.replace(/\r\n/g, "\n").trim().split("\n");
  const htmlBlocks: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  const flushList = () => {
    if (inList) {
      htmlBlocks.push(`</${inList}>`);
      inList = null;
    }
  };

  const flushBlockquote = () => {
    if (inBlockquote) {
      const content = blockquoteLines.map((l) => formatInlineMarkdown(l)).join("<br/>");
      htmlBlocks.push(
        `<blockquote style="border-left: 3px solid #f59e0b; margin: 16px 0; padding: 10px 16px; background-color: #1e293b; color: #e2e8f0; font-style: italic; border-radius: 4px;">${content}</blockquote>`
      );
      inBlockquote = false;
      blockquoteLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      flushBlockquote();
      continue;
    }

    // Blockquote >
    if (trimmed.startsWith(">")) {
      flushList();
      inBlockquote = true;
      blockquoteLines.push(trimmed.replace(/^>\s*/, ""));
      continue;
    } else {
      flushBlockquote();
    }

    // Horizontal rule ---
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      flushList();
      htmlBlocks.push('<hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;" />');
      continue;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      flushList();
      const content = formatInlineMarkdown(trimmed.slice(4));
      htmlBlocks.push(
        `<h3 style="color: #f1f5f9; font-size: 15px; font-weight: 600; margin: 20px 0 8px 0; letter-spacing: -0.01em;">${content}</h3>`
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      const content = formatInlineMarkdown(trimmed.slice(3));
      htmlBlocks.push(
        `<h2 style="color: #ffffff; font-size: 17px; font-weight: 700; margin: 26px 0 10px 0; padding-bottom: 6px; border-bottom: 1px solid #1f2937; letter-spacing: -0.01em;">${content}</h2>`
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      const content = formatInlineMarkdown(trimmed.slice(2));
      htmlBlocks.push(
        `<h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 30px 0 12px 0;">${content}</h1>`
      );
      continue;
    }

    // Checkbox list items - [ ] or - [x]
    const checkboxMatch = trimmed.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
    if (checkboxMatch) {
      if (inList !== "ul") {
        flushList();
        htmlBlocks.push('<ul style="list-style: none; padding-left: 0; margin: 12px 0;">');
        inList = "ul";
      }
      const isChecked = checkboxMatch[1].toLowerCase() === "x";
      const itemText = formatInlineMarkdown(checkboxMatch[2]);
      const checkIcon = isChecked
        ? '<span style="color: #10b981; margin-right: 8px; font-weight: bold;">&#10003;</span>'
        : '<span style="color: #f59e0b; margin-right: 8px; font-weight: bold;">&#9634;</span>';
      htmlBlocks.push(
        `<li style="color: ${
          isChecked ? "#94a3b8" : "#f1f5f9"
        }; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding-left: 4px; text-decoration: ${
          isChecked ? "line-through" : "none"
        };">${checkIcon}${itemText}</li>`
      );
      continue;
    }

    // Unordered list - or *
    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (inList !== "ul") {
        flushList();
        htmlBlocks.push('<ul style="padding-left: 20px; margin: 12px 0; color: #cbd5e1;">');
        inList = "ul";
      }
      const itemText = formatInlineMarkdown(ulMatch[1]);
      htmlBlocks.push(
        `<li style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin-bottom: 6px;">${itemText}</li>`
      );
      continue;
    }

    // Ordered list 1.
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (inList !== "ol") {
        flushList();
        htmlBlocks.push('<ol style="padding-left: 20px; margin: 12px 0; color: #cbd5e1;">');
        inList = "ol";
      }
      const itemText = formatInlineMarkdown(olMatch[1]);
      htmlBlocks.push(
        `<li style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin-bottom: 6px;">${itemText}</li>`
      );
      continue;
    }

    // Standard paragraph
    flushList();
    const content = formatInlineMarkdown(trimmed);
    htmlBlocks.push(
      `<p style="color: #cbd5e1; font-size: 14px; line-height: 1.65; margin: 10px 0;">${content}</p>`
    );
  }

  flushList();
  flushBlockquote();

  return htmlBlocks.join("\n");
}

/**
 * Builds the visual attachments HTML section with thumbnail previews and links.
 */
export function buildMediaAttachmentsSection(mediaUrls: MediaUrl[]): string {
  if (!mediaUrls || mediaUrls.length === 0) {
    return "";
  }

  const itemsHtml = mediaUrls
    .map((item, idx) => {
      const safeTitle = escapeHtml(item.noteTitle || `Attachment #${idx + 1}`);
      const safeUrl = escapeHtml(item.url);

      return `
        <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px; margin-bottom: 14px;">
          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display: block; text-decoration: none;">
            <img src="${safeUrl}" alt="${safeTitle}" style="max-width: 100%; max-height: 320px; width: auto; height: auto; object-fit: contain; border-radius: 6px; border: 1px solid #475569; display: block; margin: 0 auto; background-color: #0f172a;" />
          </a>
          <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; padding-top: 8px;">
            <div style="font-size: 12px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;">
              <span style="color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; display: block;">From Note</span>
              <strong style="color: #f1f5f9; font-size: 12px;">${safeTitle}</strong>
            </div>
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color: #f59e0b; font-size: 12px; font-weight: 600; text-decoration: none; display: inline-block; padding: 4px 10px; background-color: #334155; border-radius: 6px;">
              View Image &rarr;
            </a>
          </div>
        </div>
      `;
    })
    .join("\n");

  return `
    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937;">
      <div style="margin-bottom: 14px;">
        <h2 style="color: #ffffff; font-size: 16px; font-weight: 700; margin: 0 0 4px 0; display: flex; align-items: center;">
          <span style="color: #f59e0b; margin-right: 6px;">&#128247;</span> Visual Attachments &amp; Screenshots
          <span style="margin-left: 8px; font-size: 11px; background-color: #f59e0b; color: #0f172a; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">${mediaUrls.length}</span>
        </h2>
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Screenshots and photos captured during the day.</p>
      </div>
      ${itemsHtml}
    </div>
  `;
}

/**
 * Strips the Action Items section from the markdown digest content
 * when rendering full persistent actions separately at the bottom of the email.
 */
export function stripActionItemsSectionFromMarkdown(markdown: string): string {
  if (!markdown) return "";
  const sectionRegex = /\n?##\s*Action\s*Items(?:\s*&|\s+and)?\s*Follow-?ups[^\n]*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i;
  return markdown.replace(sectionRegex, "").trim();
}

/**
 * Builds the persistent Action Items HTML section for the bottom of the daily digest email.
 */
export function buildActionItemsSection(actions?: ActionItemEmailView[]): string {
  if (!actions || actions.length === 0) {
    return "";
  }

  const pendingItems = actions.filter((a) => !a.completed);
  const completedItems = actions.filter((a) => a.completed);
  const newItemsCount = actions.filter((a) => a.isNew && !a.completed).length;

  const renderItemHtml = (item: ActionItemEmailView) => {
    const isCompleted = item.completed;
    const safeText = formatInlineMarkdown(item.text);

    if (isCompleted) {
      return `
        <div style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 8px 12px; margin-bottom: 6px; display: flex; align-items: flex-start; opacity: 0.7;">
          <span style="color: #10b981; font-size: 14px; font-weight: bold; margin-right: 10px; line-height: 1.4;">&#10003;</span>
          <div style="flex: 1; font-size: 13px; color: #94a3b8; text-decoration: line-through; line-height: 1.4;">
            ${safeText}
          </div>
        </div>
      `;
    }

    const newBadgeHtml = item.isNew
      ? `<span style="display: inline-block; background-color: #f59e0b; color: #0b0f19; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; margin-left: 8px; vertical-align: middle;">NEW</span>`
      : "";

    return `
      <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; display: flex; align-items: flex-start;">
        <span style="color: #f59e0b; font-size: 15px; font-weight: bold; margin-right: 10px; line-height: 1.4;">&#9634;</span>
        <div style="flex: 1; font-size: 13px; color: #f1f5f9; line-height: 1.4;">
          ${safeText}${newBadgeHtml}
        </div>
      </div>
    `;
  };

  const pendingHtml = pendingItems.map(renderItemHtml).join("\n");
  const completedHtml = completedItems.length > 0
    ? `
      <div style="margin-top: 14px;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.05em; margin-bottom: 6px;">
          Completed (${completedItems.length})
        </div>
        ${completedItems.map(renderItemHtml).join("\n")}
      </div>
    `
    : "";

  return `
    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937;">
      <div style="margin-bottom: 14px;">
        <h2 style="color: #ffffff; font-size: 16px; font-weight: 700; margin: 0 0 4px 0; display: flex; align-items: center;">
          <span style="color: #f59e0b; margin-right: 6px;">&#9745;</span> Action Items &amp; Follow-ups
          <span style="margin-left: 8px; font-size: 11px; background-color: #f59e0b; color: #0f172a; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">
            ${pendingItems.length} Pending
          </span>
          ${
            newItemsCount > 0
              ? `<span style="margin-left: 6px; font-size: 11px; background-color: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #f59e0b; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">${newItemsCount} New</span>`
              : ""
          }
        </h2>
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Active tasks and follow-ups extracted from your notes.</p>
      </div>
      ${pendingHtml}
      ${completedHtml}
    </div>
  `;
}

/**
 * Constructs the full responsive HTML email template for the Daily Digest.
 */
export function generateEmailHtml(params: EmailTemplateParams): string {
  const formattedDate = formatDisplayDate(params.dateString);
  const markdownToRender = params.actions !== undefined
    ? stripActionItemsSectionFromMarkdown(params.contentMarkdown)
    : params.contentMarkdown;
  const bodyHtml = markdownToHtml(markdownToRender);
  const mediaHtml = buildMediaAttachmentsSection(params.mediaUrls);
  const actionsHtml = buildActionItemsSection(params.actions);
  const safeUserEmail = escapeHtml(params.userEmail || "user");
  const notePlural = params.noteCount === 1 ? "Note" : "Notes";
  const mediaPlural = params.mediaUrls.length === 1 ? "Image" : "Images";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Argos Daily Digest — ${escapeHtml(formattedDate)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0b0f19; width: 100%; margin: 0; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 620px; width: 100%; background-color: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
          
          <!-- Top Accent Banner -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #f59e0b, #d97706, #78350f); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Header Section -->
          <tr>
            <td style="padding: 28px 28px 20px 28px; background-color: #131c2e; border-bottom: 1px solid #1f2937;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <!-- Brand Badge -->
                    <div style="display: inline-block; background-color: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 9999px; padding: 4px 12px; margin-bottom: 10px;">
                      <span style="color: #f59e0b; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">Argos Memory Log</span>
                    </div>
                    <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0 0 6px 0; letter-spacing: -0.02em;">Daily Briefing</h1>
                    <p style="color: #94a3b8; font-size: 13px; margin: 0; font-weight: 500;">${escapeHtml(formattedDate)}</p>
                  </td>
                  <td align="right" valign="top">
                    <!-- Stat Badges -->
                    <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 8px 12px; text-align: right; display: inline-block;">
                      <div style="color: #f59e0b; font-size: 16px; font-weight: 800; line-height: 1;">${params.noteCount}</div>
                      <div style="color: #94a3b8; font-size: 10px; text-transform: uppercase; font-weight: 600; margin-top: 2px;">${notePlural}</div>
                      ${
                        params.mediaUrls.length > 0
                          ? `<div style="color: #cbd5e1; font-size: 10px; margin-top: 4px; border-top: 1px solid #334155; padding-top: 4px;">${params.mediaUrls.length} ${mediaPlural}</div>`
                          : ""
                      }
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content Section -->
          <tr>
            <td style="padding: 24px 28px;">
              ${bodyHtml}
              ${mediaHtml}
              ${actionsHtml}
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="padding: 20px 28px 28px 28px; background-color: #0d131f; border-top: 1px solid #1f2937; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; font-style: italic; margin: 0 0 10px 0; line-height: 1.5;">
                &ldquo;Argos, Odysseus’s faithful hound, who recognized his master after twenty years of war and wandering.&rdquo;
              </p>
              <div style="color: #64748b; font-size: 11px; line-height: 1.6;">
                Automated 6:00 AM Daily Briefing &bull; Delivered to <span style="color: #cbd5e1;">${safeUserEmail}</span>
                <br />
                Argos &bull; Intelligent Personal Memory Companion
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Constructs a fallback plain-text version of the Daily Digest.
 */
export function generateEmailText(params: EmailTemplateParams): string {
  const formattedDate = formatDisplayDate(params.dateString);
  const markdownToRender = params.actions !== undefined
    ? stripActionItemsSectionFromMarkdown(params.contentMarkdown)
    : params.contentMarkdown;

  const lines: string[] = [
    `ARGOS DAILY DIGEST — ${formattedDate}`,
    `============================================================`,
    `Notes Captured: ${params.noteCount} | Attachments: ${params.mediaUrls.length}`,
    ``,
    markdownToRender,
    ``,
  ];

  if (params.mediaUrls.length > 0) {
    lines.push(`VISUAL ATTACHMENTS & SCREENSHOTS`);
    lines.push(`------------------------------------------------------------`);
    params.mediaUrls.forEach((m, idx) => {
      lines.push(`${idx + 1}. ${m.noteTitle || "Attachment"}`);
      lines.push(`   URL: ${m.url}`);
    });
    lines.push(``);
  }

  if (params.actions && params.actions.length > 0) {
    lines.push(`ACTION ITEMS & FOLLOW-UPS`);
    lines.push(`------------------------------------------------------------`);
    params.actions.forEach((a) => {
      const checkbox = a.completed ? "[x]" : "[ ]";
      const newIndicator = a.isNew ? " [NEW]" : "";
      lines.push(`- ${checkbox}${newIndicator} ${a.text}`);
    });
    lines.push(``);
  }

  lines.push(`============================================================`);
  lines.push(`Argos — Intelligent Personal Memory Companion`);
  lines.push(`Delivered to ${params.userEmail || "user"}`);

  return lines.join("\n");
}

export interface TestEmailParams {
  userEmail: string;
  timezone: string;
  digestHour: number;
  serverTimestampIso: string;
}

/**
 * Constructs a verified delivery test email for settings configuration validation.
 */
export function generateTestEmailHtml(params: TestEmailParams): string {
  const safeUserEmail = escapeHtml(params.userEmail);
  const safeTimezone = escapeHtml(params.timezone);
  const formattedHour = `${params.digestHour.toString().padStart(2, "0")}:00`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Argos Test Email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0b0f19; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 620px; width: 100%; background-color: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #6366f1, #f59e0b, #10b981); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding: 28px 28px 20px 28px; background-color: #131c2e; border-bottom: 1px solid #1f2937;">
              <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 9999px; padding: 4px 12px; margin-bottom: 10px;">
                <span style="color: #10b981; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">Connection Verified</span>
              </div>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0 0 6px 0;">Argos Email Dispatch Test</h1>
              <p style="color: #94a3b8; font-size: 13px; margin: 0;">Your email notification channel has been successfully verified.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 28px;">
              <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
                Hello! This message confirms that Argos is properly configured to send automated Daily Digest emails to your address via <strong>Resend</strong>.
              </p>
              <div style="background-color: #1a2234; border: 1px solid #2d3748; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
                <h3 style="color: #ffffff; font-size: 13px; font-weight: 700; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.05em;">Current Settings</h3>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 13px;">
                  <tr>
                    <td style="color: #94a3b8; padding: 4px 0; width: 140px;">Recipient Email:</td>
                    <td style="color: #ffffff; font-weight: 600; padding: 4px 0; font-family: monospace;">${safeUserEmail}</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8; padding: 4px 0;">Active Timezone:</td>
                    <td style="color: #ffffff; font-weight: 600; padding: 4px 0;">${safeTimezone}</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8; padding: 4px 0;">Daily Schedule:</td>
                    <td style="color: #f59e0b; font-weight: 600; padding: 4px 0;">${formattedHour} Local Time</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8; padding: 4px 0;">Verified At:</td>
                    <td style="color: #cbd5e1; padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtml(params.serverTimestampIso)}</td>
                  </tr>
                </table>
              </div>
              <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0;">
                Every morning, Argos will aggregate notes from the preceding day, run Gemini Flash synthesis for executive highlights and action items, and deliver your digest right here.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 28px 28px 28px; background-color: #0d131f; border-top: 1px solid #1f2937; text-align: center;">
              <div style="color: #64748b; font-size: 11px; line-height: 1.6;">
                Argos &bull; Intelligent Personal Memory Companion
                <br />
                Odysseus’s faithful hound, who recognized his master after twenty years.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Constructs a fallback plain-text version of the test email.
 */
export function generateTestEmailText(params: TestEmailParams): string {
  return [
    `ARGOS EMAIL DISPATCH TEST`,
    `============================================================`,
    `This message confirms that Argos email delivery via Resend is working.`,
    ``,
    `Configuration:`,
    `- Recipient: ${params.userEmail}`,
    `- Timezone: ${params.timezone}`,
    `- Daily Schedule: ${params.digestHour.toString().padStart(2, "0")}:00 Local Time`,
    `- Verified At: ${params.serverTimestampIso}`,
    ``,
    `============================================================`,
    `Argos — Intelligent Personal Memory Companion`,
  ].join("\n");
}
