"use client";

import React from "react";
import { Tako } from "./Tako";

/** Render inline markdown: **bold**, *italic*, `code`. Safe (no HTML injected). */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold**, *italic*, or `code`, keeping the delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (!part) return;
    const key = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      nodes.push(
        <strong key={key} className="font-semibold text-neutral-900">
          {part.slice(2, -2)}
        </strong>
      );
    } else if (/^\*[^*]+\*$/.test(part)) {
      nodes.push(
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    } else if (/^`[^`]+`$/.test(part)) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[13px] text-neutral-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<React.Fragment key={key}>{part}</React.Fragment>);
    }
  });
  return nodes;
}

/** Lightweight block-level markdown → React (headings, bullets, ordered lists). */
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items;
    if (list.ordered) {
      blocks.push(
        <ol
          key={`ol-${key++}`}
          className="my-2 ml-5 list-decimal space-y-1.5 marker:text-neutral-400"
        >
          {items.map((it, i) => (
            <li key={i} className="pl-1 leading-relaxed">
              {renderInline(it, `oli-${key}-${i}`)}
            </li>
          ))}
        </ol>
      );
    } else {
      blocks.push(
        <ul
          key={`ul-${key++}`}
          className="my-2 ml-4 list-disc space-y-1.5 marker:text-neutral-300"
        >
          {items.map((it, i) => (
            <li key={i} className="pl-1 leading-relaxed">
              {renderInline(it, `uli-${key}-${i}`)}
            </li>
          ))}
        </ul>
      );
    }
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // Horizontal rule / separators from the notes
    if (/^---+$/.test(trimmed)) {
      flushList();
      blocks.push(
        <hr key={`hr-${key++}`} className="my-3 border-neutral-100" />
      );
      continue;
    }

    // Blank line = paragraph break
    if (trimmed === "") {
      flushList();
      continue;
    }

    // Headings (#, ##, ###)
    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const content = heading[2];
      const cls =
        level === 1
          ? "mt-3 mb-1.5 text-[16px] font-bold text-neutral-900"
          : level === 2
          ? "mt-3 mb-1 text-[15px] font-semibold text-neutral-900"
          : "mt-2 mb-1 text-[14px] font-semibold text-neutral-700";
      blocks.push(
        <p key={`h-${key++}`} className={cls}>
          {renderInline(content, `h-${key}`)}
        </p>
      );
      continue;
    }

    // Ordered list item
    const ordered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[2]);
      continue;
    }

    // Bullet list item (-, *, •)
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    // Plain paragraph
    flushList();
    blocks.push(
      <p key={`p-${key++}`} className="my-1.5 leading-relaxed">
        {renderInline(trimmed, `p-${key}`)}
      </p>
    );
  }

  flushList();
  return blocks;
}

export function MiniLessonModal({
  isOpen,
  content,
  onClose,
  onReadyToTry,
}: {
  isOpen: boolean;
  content: string;
  onClose: () => void;
  onReadyToTry: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-2xl animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <Tako size={28} />
            <h3 className="text-base font-semibold text-neutral-900">
              Quick Review
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 transition"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <div className="text-[15px] text-neutral-800">
            {renderMarkdown(content)}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/70 px-6 py-4">
          <p className="text-xs text-neutral-400">
            Read this, then close and explain back to Tako 🐙
          </p>
          <button
            onClick={onReadyToTry}
            className="btn-primary rounded-full bg-neutral-900 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-800"
          >
            Got it — let me try →
          </button>
        </div>
      </div>
    </div>
  );
}
