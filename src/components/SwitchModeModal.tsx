"use client";

import React from "react";
import { Tako } from "./Tako";

/**
 * A beautiful, minimal Apple-style dialog warning that switching modes
 * mid-session will lose current unsaved question and strike progress.
 */
export function SwitchModeModal({
  isOpen,
  targetMode,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  targetMode: "exam" | "sensei" | "teach";
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  const modeName = targetMode === "exam" ? "Exam Mode" : "Sensei Mode";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-[24px] border border-neutral-100 bg-white p-6 shadow-2xl animate-fade-up">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center">
            <Tako size={48} thinking />
          </div>

          <h3 className="text-[17px] font-bold tracking-tight text-neutral-900">
            Switch to {modeName}?
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-neutral-400">
            Your current active session progress on this question will be lost. You can restart the topic in the new mode.
          </p>

          <div className="mt-6 flex w-full flex-col gap-2">
            <button
              onClick={onConfirm}
              className="btn-primary w-full rounded-full bg-neutral-900 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-800"
            >
              Confirm & Switch
            </button>
            <button
              onClick={onClose}
              className="w-full rounded-full border border-neutral-200 bg-white py-2.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-900"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
