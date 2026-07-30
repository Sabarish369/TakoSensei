"use client";

import React, { useRef } from "react";
import { Tako } from "@/components/Tako";
import type { ExamQuestion } from "@/lib/questionBank";

export type QuestionWrapper = {
  casualPrompt: string;
  actualQuestion: string;
  markHint: string;
  contextTag?: string;
};

export function SenseiQuestionCard({
  wrapper,
  question,
  questionNumber,
  totalQuestions,
  answer,
  onAnswerChange,
  onSubmit,
  submitting,
}: {
  wrapper: QuestionWrapper;
  question: ExamQuestion;
  questionNumber: number;
  totalQuestions: number;
  answer: string;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="space-y-4">
      {/* Progress tracker */}
      <div className="flex items-center gap-3 text-xs font-medium text-neutral-400">
        <span className="tabular-nums">
          Question {questionNumber}/{totalQuestions}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-neutral-900 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
          />
        </div>
        <span className="text-neutral-300">{wrapper.markHint}</span>
      </div>

      {/* Question card */}
      <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-sm">
        {/* Casual prompt header */}
        <div className="mb-4 flex items-center gap-2.5">
          <Tako size={24} />
          <p className="text-[13px] font-medium text-neutral-400">
            {wrapper.casualPrompt}
          </p>
        </div>

        {/* Context tag */}
        {wrapper.contextTag && (
          <span className="mb-3 inline-block rounded-md bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
            {wrapper.contextTag}
          </span>
        )}

        {/* Conversationally styled question */}
        <h2 className="text-[1.35rem] font-semibold leading-snug tracking-tight text-neutral-900">
          {wrapper.actualQuestion}
        </h2>
      </div>

      {/* Answer input */}
      <div className="rounded-3xl border border-neutral-200/80 bg-white px-4 pb-3 pt-3 shadow-sm transition focus-within:border-neutral-300 focus-within:shadow-md">
        <textarea
          ref={taRef}
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="Explain it in your own words…"
          rows={4}
          className="w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-relaxed text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-neutral-300">
            {question.commandWord.charAt(0).toUpperCase() +
              question.commandWord.slice(1)}{" "}
            · {question.totalMarks} marks
          </span>
          <button
            onClick={onSubmit}
            disabled={submitting || !answer.trim()}
            className="btn-primary flex h-9 items-center gap-2 rounded-full bg-neutral-900 px-5 text-[13px] font-semibold text-white transition enabled:hover:bg-neutral-800 disabled:opacity-40"
          >
            {submitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Checking…
              </>
            ) : (
              "Submit answer"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
