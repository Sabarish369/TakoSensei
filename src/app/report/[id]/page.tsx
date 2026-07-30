"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Tako } from "@/components/Tako";
import { SectionNav } from "@/components/SectionNav";
import { getSession, updateSession } from "@/lib/localStore";

type Breakdown = {
  accuracy: number;
  coverage: number;
  clarity: number;
  misconceptions: number;
  questionResponse: number;
};

type MisconceptionItem = {
  userSaid: string;
  notesSay: string;
  whyItMatters?: string;
};

type UnderstandingGapItem = {
  concept: string;
  status: "correct_but_incomplete" | "correct_but_copied" | "unclear";
  userSaid: string;
  assessment: string;
  nextStep: string;
};

type NextMoveData = {
  concept: string;
  whyItMatters?: string;
  revisionBullets?: string[];
  masteryCheck?: string;
};

type InsightsSummary = {
  mastered?: string[];
  totalConcepts?: number;
  message?: string;
};

type ReportInsights = {
  nextMove?: NextMoveData | null;
  misconceptions?: MisconceptionItem[];
  understandingGaps?: UnderstandingGapItem[];
  summary?: InsightsSummary | null;
};

type Report = {
  id: number;
  sessionId: number;
  score: number;
  readiness: string;
  breakdown: Breakdown;
  strengths: string[];
  misunderstandings: { issue: string; better: string }[];
  conceptStatuses: {
    name: string;
    status: "mastered" | "needs_review" | "missed";
  }[];
  bestExplanation: string;
  takoSummary: string;
  nextSteps: string[];
  insights?: ReportInsights | null;
  createdAt: string;
};

type SessionData = {
  id: string;
  topic: string;
  status: string;
};

const READINESS_META: Record<
  string,
  {
    label: string;
    message: string;
    tone: string;
    bar: string;
    bg: string;
    text: string;
    accent: string;
  }
> = {
  "Not Ready": {
    label: "Not Ready",
    message: "Major gaps remain. Start by reviewing the core concepts.",
    tone: "text-red-500",
    bar: "bg-red-500",
    bg: "bg-red-50",
    text: "text-red-600",
    accent: "text-red-400",
  },
  Building: {
    label: "Building",
    message:
      "You understand the basics, but your explanation needs more accuracy and detail.",
    tone: "text-amber-500",
    bar: "bg-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-600",
    accent: "text-amber-400",
  },
  "Almost Ready": {
    label: "Almost Ready",
    message: "You understand the main idea. A few gaps remain before mastery.",
    tone: "text-violet-500",
    bar: "bg-violet-500",
    bg: "bg-violet-50",
    text: "text-violet-600",
    accent: "text-violet-400",
  },
  Ready: {
    label: "Ready",
    message:
      "You explained the topic clearly and covered the key concepts well.",
    tone: "text-emerald-500",
    bar: "bg-emerald-500",
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    accent: "text-emerald-400",
  },
};

const SUB_LABELS: Record<string, string> = {
  accuracy: "Accuracy",
  coverage: "Concept Coverage",
  clarity: "Clarity",
  misconceptions: "Misconception Fix",
  questionResponse: "Question Response",
};

const SUB_DESCRIPTIONS: Record<string, string> = {
  accuracy: "Were the facts stated correct?",
  coverage: "How many core ideas were covered?",
  clarity: "Could Tako follow the explanation?",
  misconceptions: "Did you fix earlier mistakes?",
  questionResponse: "Did you answer Tako directly?",
};

export default function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [session, setSession] = useState<SessionData | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = getSession(id);
        if (cancelled) return;
        if (!s) {
          setLoading(false);
          return;
        }
        setSession({ id: s.id, topic: s.topic, status: s.status });

        // Cached report? Show it immediately — no regeneration cost.
        if (s.report) {
          setReport(s.report);
          setLoading(false);
          return;
        }

        setGenerating(true);
        const gen = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: s.topic,
            notes: s.notes,
            concepts: s.concepts,
            messages: s.messages,
          }),
        });
        const genData = await gen.json();
        if (cancelled) return;
        if (genData?.report) {
          setReport(genData.report);
          updateSession(id, { report: genData.report, status: "completed" });
        }
      } catch {
        // fall through silently
      } finally {
        if (!cancelled) {
          setLoading(false);
          setGenerating(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#FAFAF9]">
        <Tako size={52} thinking />
        <p className="text-sm text-neutral-400 tracking-tight">
          {generating ? "Grading your lesson…" : "Loading report"}
        </p>
      </div>
    );
  }

  if (!session || !report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#FAFAF9] px-6 text-center">
        <Tako size={60} />
        <h2 className="text-xl font-medium tracking-tight text-neutral-900">
          Report unavailable
        </h2>
        <p className="text-sm text-neutral-400">
          We couldn&apos;t generate a score for this session.
        </p>
        <Link
          href="/"
          className="rounded-full bg-neutral-900 px-7 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Start a new session
        </Link>
      </div>
    );
  }

  const meta = READINESS_META[report.readiness] ?? READINESS_META.Building;
  const breakdownKeys: (keyof Report["breakdown"])[] = [
    "accuracy",
    "coverage",
    "clarity",
    "misconceptions",
    "questionResponse",
  ];

  return (
    <ReportView
      report={report}
      session={session}
      meta={meta}
      breakdownKeys={breakdownKeys}
    />
  );
}

function ReportView({
  report,
  session,
  meta,
  breakdownKeys,
}: {
  report: Report;
  session: SessionData;
  meta: (typeof READINESS_META)[string];
  breakdownKeys: (keyof Report["breakdown"])[];
}) {
  // Scroll-reveal: fade + rise sections as they enter the viewport.
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(".reveal")
    );
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const mastered = report.conceptStatuses.filter(
    (c) => c.status === "mastered"
  ).length;
  const needsReview = report.conceptStatuses.filter(
    (c) => c.status === "needs_review"
  ).length;
  const missedCount = report.conceptStatuses.filter(
    (c) => c.status === "missed"
  ).length;

  const insights: ReportInsights | null | undefined = report.insights;
  const misconceptions = insights?.misconceptions ?? [];
  const understandingGaps = insights?.understandingGaps ?? [];
  const nextMove = insights?.nextMove ?? null;
  const hasInsights = !!insights;

  // Build nav dynamically so links only point at sections that will render.
  const navSections = [
    { id: "overview", label: "Overview" },
    { id: "breakdown", label: "Score Breakdown" },
    { id: "strengths", label: "What Went Well" },
    ...(nextMove ? [{ id: "next-move", label: "Your Next Move" }] : []),
    ...(understandingGaps.length > 0
      ? [{ id: "understanding-gaps", label: "To Strengthen" }]
      : []),
    ...(hasInsights
      ? [{ id: "misconceptions", label: "Misconceptions" }]
      : []),
    { id: "concepts", label: "Concepts" },
    { id: "understanding", label: "Tako's Understanding" },
    { id: "explanation", label: "Clearest Explanation" },
    { id: "next", label: "Next Step" },
  ];

  return (
    <main className="min-h-screen bg-[#FAFAF9] text-neutral-900 selection:bg-violet-100 selection:text-violet-900">
      {/* Apple-style thin vertical section navigator */}
      <SectionNav sections={navSections} />

      {/* Minimal header — same style as landing page */}
      <header className="sticky top-0 z-20 border-b border-neutral-200/70 bg-white/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-neutral-900 transition hover:opacity-70"
          >
            <span className="text-[15px] font-semibold tracking-tight">
              TakoSensei
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-neutral-400 hover:text-neutral-900 transition-colors"
          >
            New Topic
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-6 pt-14 sm:px-8 sm:pt-16">
        {/* ── Overview ─ */}
        <section id="overview" className="reveal scroll-mt-24 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-neutral-300">
            Learning Report
          </p>
          <h1 className="mt-3 text-[2.75rem] font-semibold tracking-tighter text-neutral-900 sm:text-[3.5rem] leading-[1.05]">
            {session.topic}
          </h1>

          <div className="mt-10">
            <div className="inline-flex items-baseline gap-2">
              <span className="text-[6.5rem] font-extrabold tracking-tighter text-neutral-900 leading-none tabular-nums sm:text-[8rem]">
                {report.score}
              </span>
              <span className="text-2xl font-medium text-neutral-300">
                /100
              </span>
            </div>

            <div className="mt-5 flex items-center justify-center gap-3">
              <span
                className={`inline-block rounded-full px-4 py-1 text-[13px] font-semibold tracking-tight ${meta.bg} ${meta.text}`}
              >
                {meta.label}
              </span>
            </div>

            <p className="mt-6 text-[15px] leading-relaxed text-neutral-400 font-normal">
              {meta.message}
            </p>
          </div>

          <div className="mt-8 mx-auto max-w-xs">
            <div className="h-[3px] overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-full rounded-full ${meta.bar} transition-[width] duration-900 ease-[cubic-bezier(0.22,1,0.36,1)]`}
                style={{ width: `${report.score}%` }}
              />
            </div>
          </div>
        </section>

        <Divider />

        {/* ── Score Breakdown ── */}
        <section id="breakdown" className="reveal scroll-mt-24 mt-12">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300 mb-7">
            Score Breakdown
          </h2>
          <div className="space-y-6">
            {breakdownKeys.map((k) => {
              const value = report.breakdown[k];
              return (
                <div key={k} className="group">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div>
                      <h3 className="text-[14px] font-medium text-neutral-800 leading-tight">
                        {SUB_LABELS[k]}
                      </h3>
                      <p className="text-[11px] text-neutral-300 mt-0.5">
                        {SUB_DESCRIPTIONS[k]}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold text-neutral-500 tabular-nums tracking-tight">
                      {value}
                    </span>
                  </div>
                  <div className="h-[2px] overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        value >= 75
                          ? meta.bar
                          : value >= 55
                          ? "bg-violet-400"
                          : "bg-amber-400"
                      }`}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <Divider />

        {/* ── Strengths ── */}
        <section id="strengths" className="reveal scroll-mt-24 mt-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300 mb-5">
            What went well
          </h2>
          <ul className="space-y-2.5">
            {report.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-3 group">
                <span className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17L4 12" />
                  </svg>
                </span>
                <p className="text-[14.5px] leading-[1.55] text-neutral-600 font-normal">
                  {s}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Your Next Move (notes-grounded priority + 2-min revision) ── */}
        {nextMove && (
          <>
            <Divider />
            <section id="next-move" className="reveal scroll-mt-24 mt-14">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-300">
                Your Next Move
              </p>
              <h2 className="mt-2 text-[13px] font-medium text-neutral-500">
                Focus on
              </h2>
              <h3 className="mt-1 text-[2.2rem] sm:text-[3rem] font-bold leading-[1.02] tracking-tighter text-neutral-900">
                {nextMove.concept}
              </h3>
              {nextMove.whyItMatters && (
                <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-neutral-500">
                  {nextMove.whyItMatters}
                </p>
              )}

              {nextMove.revisionBullets &&
                nextMove.revisionBullets.length > 0 && (
                  <div className="mt-8">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-neutral-900 text-white">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-900">
                        2-Minute Master Revision
                      </span>
                    </div>
                    <ol className="mt-4 space-y-3">
                      {nextMove.revisionBullets.map((b, i) => (
                        <li key={i} className="flex gap-3.5">
                          <span className="mt-[2px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[12px] font-bold tabular-nums text-neutral-700">
                            {i + 1}
                          </span>
                          <span className="text-[14.5px] leading-[1.6] text-neutral-700">
                            {b}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

              {nextMove.masteryCheck && (
                <div className="mt-8 rounded-2xl border-l-[3px] border-violet-400 bg-violet-50/40 px-5 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">
                    Mastery Check
                  </div>
                  <p className="mt-1.5 text-[14.5px] leading-[1.6] text-neutral-700">
                    <span className="font-semibold text-neutral-900">
                      You&apos;ve mastered it when you can explain:{" "}
                    </span>
                    <span className="italic">
                      &ldquo;{nextMove.masteryCheck}&rdquo;
                    </span>
                  </p>
                </div>
              )}
            </section>
          </>
        )}

        {/* ── Understanding to Strengthen (not errors) ── */}
        {understandingGaps.length > 0 && (
          <>
            <Divider />
            <section
              id="understanding-gaps"
              className="reveal scroll-mt-24 mt-14"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-300">
                Understanding to Strengthen
              </p>
              <h2 className="mt-2 text-[1.7rem] sm:text-[2rem] font-bold leading-[1.1] tracking-tight text-neutral-900">
                Correct ideas that need a deeper explanation
              </h2>
              <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-neutral-400">
                These responses were not identified as contradictions. They simply need
                more independent explanation before mastery can be verified.
              </p>

              <div className="mt-7 space-y-4">
                {understandingGaps.map((gap, i) => {
                  const statusLabel =
                    gap.status === "correct_but_copied"
                      ? "Correct, but restate it yourself"
                      : gap.status === "correct_but_incomplete"
                      ? "Correct, but incomplete"
                      : "Needs a clearer explanation";
                  return (
                    <article
                      key={`${gap.concept}-${i}`}
                      className="rounded-2xl border border-sky-100 bg-sky-50/35 px-5 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-[14px] font-semibold text-neutral-900">
                          {gap.concept}
                        </h3>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700 ring-1 ring-sky-100">
                          {statusLabel}
                        </span>
                      </div>
                      <blockquote className="mt-3 border-l-2 border-sky-300 pl-3 text-[14px] leading-[1.55] text-neutral-700">
                        &ldquo;{gap.userSaid}&rdquo;
                      </blockquote>
                      <p className="mt-3 text-[13.5px] leading-relaxed text-neutral-600">
                        {gap.assessment}
                      </p>
                      <p className="mt-2 text-[13px] leading-relaxed text-sky-800">
                        <span className="font-semibold">Try next — </span>
                        {gap.nextStep}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* ── Misconceptions We Caught (verified contradictions only) ── */}
        {hasInsights && (
          <>
            <Divider />
            <section
              id="misconceptions"
              className="reveal scroll-mt-24 mt-14"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-300">
                Misconceptions We Caught
              </p>
              <h2 className="mt-2 text-[1.7rem] sm:text-[2rem] font-bold leading-[1.1] tracking-tight text-neutral-900">
                Explicit claims that conflicted with your notes
              </h2>
              <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-neutral-400">
                Only direct contradictions appear here. Brief, copied, or incomplete
                explanations are kept separately under Understanding to Strengthen.
              </p>

              {misconceptions.length > 0 ? (
                <ol className="mt-8 space-y-5">
                  {misconceptions.map((m, i) => (
                    <li
                      key={i}
                      className="group transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5"
                    >
                      <div className="flex items-start gap-4">
                        <span className="mt-1 text-[11px] font-bold tabular-nums text-neutral-300">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="grid flex-1 gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-red-100 bg-red-50/40 px-4 py-3 transition-colors group-hover:border-red-200">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-red-500">
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                              >
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                              You said
                            </div>
                            <blockquote className="mt-1.5 text-[14px] leading-[1.55] text-neutral-700">
                              &ldquo;{m.userSaid}&rdquo;
                            </blockquote>
                          </div>
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 transition-colors group-hover:border-emerald-200">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600">
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M20 6L9 17L4 12" />
                              </svg>
                              Your notes say
                            </div>
                            <blockquote className="mt-1.5 text-[14px] leading-[1.55] text-neutral-700">
                              &ldquo;{m.notesSay}&rdquo;
                            </blockquote>
                          </div>
                        </div>
                      </div>
                      {m.whyItMatters && (
                        <p className="mt-2.5 ml-9 text-[13px] italic leading-relaxed text-neutral-500">
                          <span className="font-semibold not-italic text-neutral-700">
                            Why this matters —{" "}
                          </span>
                          {m.whyItMatters}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 px-5 py-4">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17L4 12" />
                    </svg>
                  </span>
                  <p className="text-[14px] leading-[1.55] text-emerald-800">
                    <span className="font-semibold">
                      No contradictions were detected.
                    </span>{" "}
                    Nothing you explicitly claimed conflicted with your uploaded
                    notes.
                  </p>
                </div>
              )}
            </section>
          </>
        )}

        <Divider />

        {/* ── Concepts ─ */}
        <section id="concepts" className="reveal scroll-mt-24 mt-10">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300">
              Concepts
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-neutral-300 font-medium">
              <span className="text-emerald-600">{mastered} mastered</span>
              <span className="text-amber-600">{needsReview} review</span>
              <span className="text-red-400">{missedCount} missed</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {report.conceptStatuses.map((c, i) => {
              const tone =
                c.status === "mastered"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                  : c.status === "needs_review"
                  ? "bg-amber-50 text-amber-600 border-amber-200/50"
                  : "bg-neutral-50 text-neutral-300 border-neutral-200/50";
              const icon =
                c.status === "mastered" ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17L4 12" />
                  </svg>
                ) : c.status === "needs_review" ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M12 9v4M12 17h.01" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                ) : (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="5" y="11" width="14" height="8" rx="1.5" />
                    <path d="M8 11V7c0-2.2 1.8-4 4-4s4 1.8 4 4v4" />
                  </svg>
                );
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium ${tone}`}
                >
                  <span className="opacity-70">{icon}</span>
                  <span>{c.name}</span>
                </span>
              );
            })}
          </div>
        </section>

        <Divider />

        {/* ── Tako's Final Understanding ── */}
        {report.takoSummary && (
          <section
            id="understanding"
            className="reveal scroll-mt-24 text-center"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300">
              Tako&apos;s Final Understanding
            </p>
            <blockquote className="mt-5 rounded-[28px] bg-neutral-50 border border-neutral-100 px-8 py-7 text-[16px] leading-[1.7] text-neutral-700 font-normal tracking-tight">
              <span className="text-violet-300 text-3xl leading-none">
                &ldquo;
              </span>
              {report.takoSummary}
              <span className="text-violet-300 text-3xl leading-none">
                &rdquo;
              </span>
            </blockquote>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              <Tako size={28} />
              <span className="text-[11px] font-medium text-neutral-300">
                Tako
              </span>
            </div>
          </section>
        )}

        <Divider />

        {/* ── Clearest Explanation ── */}
        {report.bestExplanation && (
          <section id="explanation" className="reveal scroll-mt-24">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300 mb-5">
              Your Clearest Explanation
            </h2>
            <div className="rounded-[20px] border border-neutral-100 bg-white/60 px-7 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <blockquote className="text-[15.5px] leading-[1.7] text-neutral-800 font-normal">
                &ldquo;{report.bestExplanation}&rdquo;
              </blockquote>
              <p className="mt-3 text-[11px] text-neutral-300">
                Keep this phrasing for next time.
              </p>
            </div>
          </section>
        )}

        <Divider />

        {/* ── Next Step (action buttons + supporting list) ── */}
        <section id="next" className="reveal scroll-mt-24">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300 mb-5">
            Next Step
          </h2>
          {report.nextSteps && report.nextSteps.length > 0 && (
            <ul className="space-y-2.5 mb-8">
              {report.nextSteps.map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                  <span className="text-[14.5px] leading-[1.5] text-neutral-600 font-normal">
                    {s}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-3 sm:gap-4">
            <Link
              href={`/teach/${session.id}`}
              className="flex-1 rounded-[18px] bg-neutral-900 px-6 py-3.5 text-center text-sm font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] hover:bg-neutral-800 transition hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] active:scale-[0.99]"
            >
              Practice Again
            </Link>
            <Link
              href="/"
              className="flex-1 rounded-[18px] border border-neutral-200 bg-white px-6 py-3.5 text-center text-sm font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-[0.99]"
            >
              Teach Another Topic
            </Link>
          </div>
        </section>

        <footer className="mt-16 flex items-center justify-between text-[11px] text-neutral-300 font-normal tracking-tight">
          <span>TakoSensei</span>
          <span>
            {new Date(report.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </footer>
      </div>
    </main>
  );
}

function Divider() {
  return <div className="my-12 h-px bg-neutral-200/60" />;
}
