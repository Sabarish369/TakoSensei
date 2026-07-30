"use client";

import React from "react";

/**
 * Single "Quick Review" trigger. No hints, no outlines — just opens the
 * mini-lesson modal with the relevant excerpt from the student's notes.
 * Tako's on-screen question is never rewritten by this action.
 */
export function HelpPanel({
  onRequestQuickReview,
  disabled = false,
  reviewOpened = false,
}: {
  onRequestQuickReview: () => void;
  disabled?: boolean;
  reviewOpened?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2.5 px-1 py-2">
      {reviewOpened && (
        <span className="text-[11px] font-medium text-neutral-400">
          Now answer in your own words
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onRequestQuickReview}
        className="group inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-neutral-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 hover:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.15)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-neutral-400 transition-colors duration-200 group-hover:text-neutral-700"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span>Quick Review</span>
      </button>
    </div>
  );
}
