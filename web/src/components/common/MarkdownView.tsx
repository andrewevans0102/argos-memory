import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

/**
 * Lightweight, safe Markdown renderer for conversational answers and digest notes.
 */
export function MarkdownView({ content, className = '' }: MarkdownViewProps) {
  if (!content) return null;

  // Split into paragraphs / blocks by double newline or single newline if structured
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let isNumberedList = false;

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    if (isNumberedList) {
      elements.push(
        <ol key={key} className="my-2 ml-4 list-decimal space-y-1 text-slate-300">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
    } else {
      // Check if all or some items are task checkboxes
      const hasTask = listItems.some((item) => /^\[([ xX])\]/.test(item));
      if (hasTask) {
        elements.push(
          <div key={key} className="my-2 space-y-1.5 pl-1">
            {listItems.map((item, idx) => {
              const checkMatch = item.match(/^\[([ xX])\]\s*(.*)$/);
              if (checkMatch) {
                const isChecked = checkMatch[1].toLowerCase() === 'x';
                return (
                  <div key={idx} className="flex items-start gap-2 text-slate-300 leading-relaxed">
                    <span
                      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border mt-0.5 text-[10px] ${
                        isChecked
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-400'
                          : 'border-slate-600 bg-slate-800 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className={isChecked ? 'line-through text-slate-400' : 'text-slate-200'}>
                      {renderInline(checkMatch[2])}
                    </span>
                  </div>
                );
              }
              return (
                <div key={idx} className="flex items-start gap-2 text-slate-300 leading-relaxed">
                  <span className="text-slate-500">•</span>
                  <span>{renderInline(item)}</span>
                </div>
              );
            })}
          </div>
        );
      } else {
        elements.push(
          <ul key={key} className="my-2 ml-4 list-disc space-y-1 text-slate-300">
            {listItems.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        );
      }
    }
    listItems = [];
    isNumberedList = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Check list items
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);

    if (bulletMatch) {
      if (isNumberedList) flushList(`list-n-${i}`);
      listItems.push(bulletMatch[1]);
      continue;
    }

    if (numberedMatch) {
      if (!isNumberedList && listItems.length > 0) flushList(`list-b-${i}`);
      isNumberedList = true;
      listItems.push(numberedMatch[1]);
      continue;
    }

    // Flush any pending list
    if (listItems.length > 0) {
      flushList(`list-${i}`);
    }

    if (!line) {
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${i}`} className="mt-4 mb-1 text-xs font-semibold text-indigo-300 tracking-wide uppercase">
          {renderInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${i}`} className="mt-4 mb-2 text-sm font-bold text-white">
          {renderInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${i}`} className="mt-4 mb-2 text-base font-bold text-white">
          {renderInline(line.slice(2))}
        </h2>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={`quote-${i}`} className="my-2 border-l-2 border-indigo-500/50 pl-3 italic text-slate-400">
          {renderInline(line.slice(2))}
        </blockquote>
      );
    } else {
      elements.push(
        <p key={`p-${i}`} className="my-1.5 leading-relaxed text-slate-200">
          {renderInline(line)}
        </p>
      );
    }
  }

  // Flush remaining list items
  if (listItems.length > 0) {
    flushList('list-final');
  }

  return <div className={`text-xs space-y-1 ${className}`}>{elements}</div>;
}

/**
 * Parses bold, italic, code, and links within a line.
 */
function renderInline(text: string): React.ReactNode {
  // Regex tokenizing inline formats
  // Matches `code`, **bold**, *italic*, [text](url)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-[11px] text-amber-300 border border-slate-700/50"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={idx} className="italic text-slate-300">
          {part.slice(1, -1)}
        </em>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}
