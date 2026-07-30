"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tako } from "@/components/Tako";
import { SwitchModeModal } from "@/components/SwitchModeModal";
import { getSession, updateSession } from "@/lib/localStore";
import {
  difficultyMeta,
  gradeFromPercent,
  type ExamQuestion,
  type QuestionBank,
} from "@/lib/questionBank";
import type { MarkSchemeResult } from "@/lib/agents/markSchemeGrader";
import { EXAM_BANK_VERSION } from "@/lib/questionBank";
import { markHint } from "@/lib/senseiMode/conversationalize";
import {
  generateCasualPrompt,
  getPhase,
  areRelated,
  type Performance,
} from "@/lib/senseiMode/casualPrompts";

type QState = {
  attempts: number;
  marksEarned: number;
  maxMarks: number;
  status: "not_attempted" | "passed" | "failed";
};

type BankRow = {
  id: number;
  topicName: string;
  totalMarks: number;
  passThreshold: number;
  questions: ExamQuestion[];
  questionStates: Record<string, QState>;
  currentIndex: number;
  totalEarned: number;
  completed: string;
  version?: number;
};

export default function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [bank, setBank] = useState<BankRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<MarkSchemeResult | null>(null);
  const [attemptInfo, setAttemptInfo] = useState<{
    attempts: number;
    maxAttempts: number;
    resolved: boolean;
    passed: boolean;
    advanced: boolean;
    nextIndex: number;
    done: boolean;
  } | null>(null);
  const [tako, setTako] = useState<{
    line: string;
    move: string;
    blueprint: string | null;
    revealPoints: string[] | null;
  } | null>(null);
  const [totalEarned, setTotalEarned] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const s = getSession(id);
      if (!s) {
        setError("Session not found.");
        setLoading(false);
        return;
      }
      // Reuse only the current fixed-paper version. Older cached banks may
      // have fewer than six questions or the wrong total mark allocation.
      if (s.examBank?.version === EXAM_BANK_VERSION) {
        setBank(s.examBank);
        setTotalEarned(s.examBank.totalEarned ?? 0);
        setCurrentIndex(s.examBank.currentIndex ?? 0);
        setCompleted(s.examBank.completed === "yes");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/exam/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: s.topic,
            notes: s.notes,
            concepts: s.concepts,
          }),
        });
        const d = await res.json();
        if (d?.bank) {
          updateSession(id, { examBank: d.bank });
          setBank(d.bank);
          setTotalEarned(0);
          setCurrentIndex(0);
          setCompleted(false);
        } else {
          setError(d?.error ?? "Could not load exam.");
        }
      } catch {
        setError("Could not load exam.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const questions = bank?.questions ?? [];
  const question = questions[currentIndex];

  async function submit(action: "answer" | "skip") {
    if (grading || completed) return;
    if (action === "answer" && !answer.trim()) return;
    setGrading(true);
    try {
      const s = getSession(id);
      const prev = (bank?.questionStates?.[question.id] ?? {}) as any;

      // ── SKIP: purely local state change, no AI needed ──
      if (action === "skip") {
        const nextStates = {
          ...(bank?.questionStates ?? {}),
          [question.id]: {
            attempts: prev.attempts ?? 0,
            marksEarned: prev.marksEarned ?? 0,
            maxMarks: question.totalMarks,
            status: "failed" as const,
          },
        };
        const nextIndex = currentIndex + 1;
        const isDone = nextIndex >= questions.length;
        const earned = Object.values(nextStates).reduce(
          (acc: number, q: any) => acc + (q.marksEarned || 0),
          0
        );
        setBank((b) => (b ? { ...b, questionStates: nextStates } : b));
        updateSession(id, {
          examBank: {
            ...(s?.examBank ?? bank),
            questionStates: nextStates,
            currentIndex: isDone ? currentIndex : nextIndex,
            totalEarned: earned,
            completed: isDone ? "yes" : "no",
          },
        });
        setResult(null);
        setAttemptInfo(null);
        setTako(null);
        setAnswer("");
        setTotalEarned(earned);
        setCurrentIndex(isDone ? currentIndex : nextIndex);
        setCompleted(isDone);
        return;
      }

      const res = await fetch("/api/exam/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          answer: answer.trim(),
          notes: s?.notes ?? null,
          attempts: prev.attempts ?? 0,
          marksEarned: prev.marksEarned ?? 0,
          copyOffenses: prev.copyOffenses ?? 0,
          index: currentIndex,
          total: questions.length,
          startedAt: s?.examBank?.createdAt ?? new Date().toISOString(),
          nextQuestionStem: questions[currentIndex + 1]?.questionText ?? null,
        }),
      });
      const data = await res.json();

      if (data?.takoLine) {
        setTako({
          line: data.takoLine,
          move: data.move ?? "",
          blueprint: data.brief?.blueprint ?? null,
          revealPoints: data.brief?.revealPoints ?? null,
        });
      }
      if (data?.result) setResult(data.result);

      const nextIndex = data.advanced ? currentIndex + 1 : currentIndex;
      const isDone = data.advanced && nextIndex >= questions.length;

      setAttemptInfo({
        attempts: data.attempts,
        maxAttempts: data.maxAttempts,
        resolved: data.resolved,
        passed: data.passed,
        advanced: data.advanced,
        nextIndex,
        done: isDone,
      });

      const nextStates = {
        ...(bank?.questionStates ?? {}),
        [question.id]: data.questionState,
      };
      const earned = Object.values(nextStates).reduce(
        (acc: number, q: any) => acc + (q?.marksEarned || 0),
        0
      );

      setBank((b) => (b ? { ...b, questionStates: nextStates } : b));
      setTotalEarned(earned);

      // Persist to localStorage so a refresh resumes exactly here.
      updateSession(id, {
        examBank: {
          ...(s?.examBank ?? bank),
          questionStates: nextStates,
          currentIndex: isDone ? currentIndex : nextIndex,
          totalEarned: earned,
          completed: isDone ? "yes" : "no",
        },
      });

      // NOTE: we do NOT advance the index here — the user sees Tako's
      // response + the breakdown for THIS question, then advances.
      if (isDone) setCompleted(true);
    } catch {
      setError("Something went wrong grading your answer.");
    } finally {
      setGrading(false);
    }
  }

  function nextQuestion() {
    const adv = attemptInfo;
    setResult(null);
    setAttemptInfo(null);
    setTako(null);
    setAnswer("");
    if (adv?.advanced) {
      setCurrentIndex(adv.nextIndex);
      setCompleted(adv.done);
    }
    setTimeout(() => taRef.current?.focus(), 40);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF9]">
        <Tako size={48} thinking />
      </div>
    );
  }

  if (error || !bank) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#FAFAF9] px-6 text-center">
        <Tako size={56} />
        <h2 className="text-xl font-medium tracking-tight text-neutral-900">
          {error ?? "Exam unavailable"}
        </h2>
        <Link
          href={`/teach/${id}`}
          className="rounded-full bg-neutral-900 px-7 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Back to teaching
        </Link>
      </div>
    );
  }

  const pct = Math.round((totalEarned / bank.totalMarks) * 100);
  const grade = gradeFromPercent(pct);

  return (
    <main className="min-h-screen bg-[#FAFAF9] text-neutral-900 selection:bg-violet-100 selection:text-violet-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-neutral-200/70 bg-white/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-70">
            <span className="text-[15px] font-semibold tracking-tight">TakoSensei</span>
          </Link>
          <div className="flex items-center gap-3">
            {completed ? (
              <Link
                href={`/teach/${id}`}
                className="text-[13px] font-medium text-neutral-400 transition hover:text-neutral-900"
              >
                Sensei Mode
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setSwitchModalOpen(true)}
                className="text-[13px] font-medium text-neutral-400 transition hover:text-neutral-900"
              >
                Sensei Mode
              </button>
            )}
            <span className="rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
              Exam
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-6 py-6">
        {/* Score + progress grid */}
        <section className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300">
                Exam Score
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-neutral-900">
                  {totalEarned}
                </span>
                <span className="text-lg text-neutral-400">/ {bank.totalMarks}</span>
                <span
                  className={`text-sm font-semibold ${
                    pct >= 70 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-500"
                  }`}
                >
                  ({pct}%)
                </span>
              </div>
            </div>
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border-2 text-2xl font-bold ${
                grade === "A"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-600"
                  : grade === "B"
                  ? "border-violet-400 bg-violet-50 text-violet-600"
                  : grade === "C"
                  ? "border-amber-400 bg-amber-50 text-amber-600"
                  : "border-rose-400 bg-rose-50 text-rose-500"
              }`}
            >
              {grade}
            </div>
          </div>

          {/* Linear 6-Question Progress Bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400">
              <span className="uppercase tracking-[0.1em]">
                {completed
                  ? "Exam Complete"
                  : `Question ${currentIndex + 1} of ${questions.length}`}
              </span>
              <span className="tabular-nums">
                {questions.filter((q) => bank.questionStates[q.id]?.status === "passed" || bank.questionStates[q.id]?.status === "failed").length} / {questions.length} answered
              </span>
            </div>
            
            <div className="mt-2.5 flex h-2 w-full gap-1 overflow-hidden rounded-full">
              {questions.map((q, i) => {
                const st = bank.questionStates[q.id];
                const isCurrent = i === currentIndex && !completed;
                const isPassed = st?.status === "passed";
                const isFailed = st?.status === "failed";
                
                return (
                  <div
                    key={q.id}
                    className={`h-full flex-1 transition-colors duration-500 ${
                      isPassed
                        ? "bg-emerald-500"
                        : isFailed
                        ? "bg-rose-400"
                        : isCurrent
                        ? "bg-neutral-900"
                        : "bg-neutral-100"
                    }`}
                  />
                );
              })}
            </div>

            {/* Quick dot legend */}
            <div className="mt-3 flex justify-between">
              {questions.map((q, i) => (
                <div key={q.id} className="flex flex-1 flex-col items-center">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      difficultyMeta(q.difficulty).dot
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {completed ? (
          <section className="mt-6 rounded-3xl border border-neutral-200/80 bg-white p-8 text-center shadow-sm">
            <Tako size={44} thinking />
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-neutral-900">
              Exam Complete — {grade}
            </h2>
            <p className="mt-2 text-[15px] text-neutral-500">
              You scored {totalEarned} / {bank.totalMarks} ({pct}%).
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href={`/report/${id}`}
                className="rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                See Report
              </Link>
              <Link
                href="/"
                className="rounded-full border border-neutral-200 bg-white px-6 py-2.5 text-sm font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
              >
                New Topic
              </Link>
            </div>
          </section>
        ) : question ? (
          <section className="mt-6">
            {/* Question card — conversational Sensei delivery */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-sm">
              {(() => {
                // Build the conversational wrapper for this question.
                const prev = questions[currentIndex - 1];
                const related = prev ? areRelated(question, prev) : false;
                const recentPct = (() => {
                  const done = questions
                    .slice(0, currentIndex)
                    .map(
                      (q) =>
                        (bank.questionStates[q.id]?.marksEarned ?? 0) /
                        (q.totalMarks || 1)
                    );
                  if (done.length === 0) return 0.5;
                  return done.reduce((a, b) => a + b, 0) / done.length;
                })();
                const perf: Performance =
                  recentPct >= 0.8
                    ? "strong"
                    : recentPct >= 0.5
                    ? "average"
                    : "struggling";
                const casualPrompt = generateCasualPrompt(
                  question,
                  getPhase(question.order, questions.length),
                  perf,
                  related
                );
                return (
                  <>
                    <div className="flex items-center gap-2.5">
                      <Tako size={24} />
                      <p className="text-[13px] font-medium text-neutral-400">
                        {casualPrompt}
                      </p>
                      <span className="ml-auto text-[12px] font-semibold text-neutral-300">
                        {markHint(question.totalMarks)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {related && (
                        <span className="rounded-md bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                          This builds on Q{currentIndex}
                        </span>
                      )}
                      <span
                        className={`ml-auto text-[11px] font-semibold ${
                          difficultyMeta(question.difficulty).text
                        }`}
                      >
                        {difficultyMeta(question.difficulty).label}
                      </span>
                    </div>
                  </>
                );
              })()}
              <h2 className="mt-3 text-[1.35rem] font-semibold leading-snug tracking-tight text-neutral-900">
                {question.questionText}
              </h2>

              {!result && (
                <div className="mt-5">
                  <textarea
                    ref={taRef}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Explain it in your own words…"
                    rows={5}
                    className="w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50/50 px-4 py-3 text-[15px] leading-relaxed text-neutral-800 placeholder:text-neutral-300 focus:border-neutral-400 focus:bg-white focus:outline-none"
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={() => submit("skip")}
                      disabled={grading}
                      className="text-xs font-medium text-neutral-400 transition hover:text-neutral-700 disabled:opacity-50"
                    >
                      Skip question
                    </button>
                    <button
                      onClick={() => submit("answer")}
                      disabled={grading || !answer.trim()}
                      className="btn-primary flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-2.5 text-[13px] font-semibold text-white transition enabled:hover:bg-neutral-800 disabled:opacity-40"
                    >
                      {grading ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Grading…
                        </>
                      ) : (
                        "Submit answer"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tako's move-driven voice — short bubble, never a wall of text */}
            {tako && (
              <div className="mt-4 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center">
                    <Tako size={28} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-relaxed text-neutral-800">
                      {tako.line}
                    </p>
                    {tako.blueprint && (
                      <div className="mt-3 rounded-xl border border-violet-200/60 bg-violet-50/60 px-4 py-2.5 font-mono text-[12.5px] leading-relaxed text-violet-800">
                        {tako.blueprint}
                      </div>
                    )}
                    {tako.revealPoints && tako.revealPoints.length > 0 && (
                      <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50/70 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-400">
                          What the examiner wanted
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {tako.revealPoints.map((rp, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-[13px] leading-snug text-neutral-700"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                              {rp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Mark scheme breakdown with per-point justification */}
            {result && (
              <div className="mt-4 rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300">
                    Mark Scheme
                  </h3>
                  <span className="text-lg font-bold tabular-nums text-neutral-900">
                    {result.marksAwarded}/{result.maxMarks}
                  </span>
                </div>

                {!result.commandWordMet && result.commandWordFeedback && (
                  <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-2.5 text-[13px] text-amber-700">
                    <span className="font-semibold">Command word: </span>
                    {result.commandWordFeedback}
                  </div>
                )}

                <ul className="mt-4 space-y-3">
                  {result.breakdown.map((p) => {
                    const earned = p.awarded > 0;
                    return (
                      <li
                        key={p.pointId}
                        className={`rounded-2xl border px-4 py-3 ${
                          earned
                            ? "border-emerald-400 bg-emerald-50"
                            : "border-rose-400 bg-rose-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${
                              earned ? "bg-emerald-500" : "bg-rose-400"
                            }`}
                          >
                            {earned ? (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6L9 17L4 12" />
                              </svg>
                            ) : (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-[14px] font-medium text-neutral-800">
                                {p.content}
                              </p>
                              <span className="shrink-0 text-[12px] font-bold tabular-nums text-neutral-500">
                                {p.awarded}/{p.maxMarks}
                              </span>
                            </div>
                            {/* Justification: why awarded / why NOT awarded */}
                            <p className={`mt-1 text-[13px] leading-relaxed ${earned ? "text-emerald-800" : "text-rose-700"}`}>
                              {p.justification}
                            </p>
                            {earned && p.evidence && (
                              <p className="mt-1 text-[12px] italic text-neutral-400">
                                Your words: &ldquo;{p.evidence}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {result.overallFeedback && (
                  <p className="mt-4 text-[13.5px] leading-relaxed text-neutral-500">
                    {result.overallFeedback}
                  </p>
                )}

                {/* Model answer — revealed only once the question is settled,
                    so the rewrite attempt stays genuine. */}
                {attemptInfo?.resolved && question?.modelAnswer && (
                  <div className="mt-5 rounded-2xl border border-violet-200/70 bg-violet-50/50 p-5">
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-500">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="4" />
                        <circle cx="12" cy="12" r="0.5" fill="currentColor" />
                      </svg>
                      Model Answer · {question.totalMarks}/{question.totalMarks} marks
                    </p>
                    <p className="mt-2.5 text-[14px] leading-[1.65] text-neutral-800">
                      &ldquo;{question.modelAnswer}&rdquo;
                    </p>
                    <p className="mt-2 text-[12px] text-neutral-400">
                      Compare it with your answer — notice how it links every point
                      the examiner needs.
                    </p>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-between">
                  {attemptInfo && !attemptInfo.resolved ? (
                    <>
                      <span className="text-xs font-medium text-neutral-400">
                        Attempt {attemptInfo.attempts}/{attemptInfo.maxAttempts} · {result.marksAwarded}/{result.maxMarks} marks — improve your answer
                      </span>
                      <button
                        onClick={() => {
                          setResult(null);
                          setTimeout(() => taRef.current?.focus(), 40);
                        }}
                        className="btn-primary rounded-full bg-neutral-900 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-neutral-800"
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className={`text-xs font-semibold ${
                          attemptInfo?.passed ? "text-emerald-600" : "text-rose-500"
                        }`}
                      >
                        {attemptInfo?.passed
                          ? `Passed · ${result.marksAwarded}/${result.maxMarks} marks`
                          : `Marks recorded · ${result.marksAwarded}/${result.maxMarks}`}
                      </span>
                      <button
                        onClick={nextQuestion}
                        className="btn-primary rounded-full bg-neutral-900 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-neutral-800"
                      >
                        {currentIndex >= questions.length - 1 && completed
                          ? "Finish"
                          : "Next question →"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : null}
      </div>

      <SwitchModeModal
        isOpen={switchModalOpen}
        targetMode="teach"
        onClose={() => setSwitchModalOpen(false)}
        onConfirm={() => {
          setSwitchModalOpen(false);
          router.push(`/teach/${id}`);
        }}
      />
    </main>
  );
}
