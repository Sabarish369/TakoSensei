"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tako } from "@/components/Tako";
import { buildProgress } from "@/lib/progress";
import { HelpPanel } from "@/components/HelpPanel";
import { MiniLessonModal } from "@/components/MiniLessonModal";
import { SwitchModeModal } from "@/components/SwitchModeModal";
import {
  getSession,
  updateSession,
  appendMessages,
} from "@/lib/localStore";

type Message = {
  id: number;
  role: "user" | "tako";
  content: string;
  meta?: { gaps?: string[]; unlocked?: string[] } | null;
};

type Concept = {
  label?: string;
  name?: string;
  unlocked?: boolean;
  status?: "locked" | "mastered";
  weight?: number;
};

type SessionData = {
  id: number;
  topic: string;
  difficulty: string;
  understanding: number;
  concepts: Concept[];
  conceptStates?: Record<string, unknown>;
  strikes?: number;
  endState?: "victory" | "completed" | "disqualified" | null;
};

export default function TeachPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [understanding, setUnderstanding] = useState(0);
  const [masteryProgress, setMasteryProgress] = useState(0);
  const [resolvedCountState, setResolvedCountState] = useState(0);
  const [masteredCountState, setMasteredCountState] = useState(0);
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [sent, setSent] = useState(false);
  const [newQuestionKey, setNewQuestionKey] = useState(0);
  // Smart stopping system UI state
  const [endState, setEndState] = useState<
    "victory" | "disqualified" | "completed" | null
  >(null);
  const [strikes, setStrikes] = useState(0);
  const [miniLessonModalOpen, setMiniLessonModalOpen] = useState(false);
  const [miniLessonContent, setMiniLessonContent] = useState("");
  const [reviewOpenedOnce, setReviewOpenedOnce] = useState(false);
  const [loadingQuickReview, setLoadingQuickReview] = useState(false);
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function requestQuickReview() {
    if (loadingQuickReview || sent || endState) return;
    setLoadingQuickReview(true);
    try {
      const current = getSession(id);
      const res = await fetch("/api/quick-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: current?.topic,
          notes: current?.notes ?? null,
          concepts: current?.concepts ?? [],
        }),
      });
      const data = await res.json();
      // Quick Review is a private study aid: no chat message is added,
      // Tako's on-screen question is preserved untouched, and the modal
      // is filled with the notes-grounded review.
      if (data?.miniLessonContent) {
        setMiniLessonContent(data.miniLessonContent);
        setMiniLessonModalOpen(true);
        setReviewOpenedOnce(true);
      }
    } catch {
      // silent — the button stays available for a retry
    } finally {
      setLoadingQuickReview(false);
    }
  }

  useEffect(() => {
    const s = getSession(id);
    if (!s) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setSession(s as any);
    setMessages(s.messages as any);

    // Fresh session → fetch Tako's opening question so the student always
    // has something real to answer instead of a placeholder.
    if (s.messages.length === 0 && !s.endState) {
      setThinking(true);
      fetch("/api/opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: s.topic,
          notes: s.notes,
          concepts: s.concepts,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.takoMessage) {
            appendMessages(id, [d.takoMessage]);
            const fresh = getSession(id);
            if (fresh) setMessages(fresh.messages as any);
            setNewQuestionKey((k) => k + 1);
          }
        })
        .catch(() => {})
        .finally(() => setThinking(false));
    }
    const initialProgress = buildProgress(
      (s.concepts ?? []).map((c: any) => ({
        name: c.name || c.label || "Concept",
        weight: typeof c.weight === "number" ? c.weight : 0.2,
        status: c.status,
      })),
      (s.conceptStates ?? {}) as any
    );
    setUnderstanding(s.endState ? 100 : initialProgress.completion);
    setMasteryProgress(initialProgress.mastery);
    setResolvedCountState(initialProgress.resolvedCount);
    setMasteredCountState(initialProgress.masteredCount);
    setStrikes(s.strikes ?? 0);
    if (s.endState) setEndState(s.endState);
    setLoading(false);
  }, [id]);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 112) + "px";
  }

  async function send() {
    const content = input.trim();
    if (!content || thinking || sent) return;

    setInput("");
    setThinking(true);
    setSent(true);
    setTimeout(autosize, 0);

    try {
      const current = getSession(id);
      if (!current) return;

      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          topic: current.topic,
          notes: current.notes,
          concepts: current.concepts,
          conceptStates: current.conceptStates,
          askedQuestions: current.askedQuestions,
          strikes: current.strikes,
          messages: current.messages,
          sessionComplete: current.status === "completed",
        }),
      });
      const data = await res.json();

      if (data?.takoMessage) {
        // Persist the two new turns + the next state locally.
        appendMessages(id, [data.userMessage, data.takoMessage]);
        if (data.state) updateSession(id, data.state);

        const fresh = getSession(id);
        if (fresh) {
          setMessages(fresh.messages as any);
          setSession(fresh as any);
        }

        if (data?.progress) {
          setUnderstanding(data.endState ? 100 : data.progress.completion ?? 0);
          setMasteryProgress(data.progress.mastery ?? 0);
          setResolvedCountState(data.progress.resolvedCount ?? 0);
          setMasteredCountState(data.progress.masteredCount ?? 0);
        } else {
          setUnderstanding(data.understanding ?? understanding);
        }
        if (typeof data?.strikes === "number") setStrikes(data.strikes);
        if (data?.endState) setEndState(data.endState);
        setNewQuestionKey((k) => k + 1);
      }
    } catch {
      // silent
    } finally {
      setThinking(false);
      setTimeout(() => setSent(false), 450);
    }
  }

  async function finishLesson() {
    if (finishing) return;
    setFinishing(true);
    updateSession(id, { status: "completed" });
    router.push(`/report/${id}`);
  }

  // Voice teaching: MediaRecorder → /api/transcribe → append into the box.
  async function toggleRecording() {
    if (transcribing || thinking || sent) return;

    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 800) return; // ignore accidental taps

        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "speech.webm");
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          if (!res.ok) throw new Error("no provider");
          const data = await res.json();
          if (data?.text) {
            setInput((prev) => (prev.trim() ? prev.trimEnd() + " " + data.text : data.text));
            setTimeout(autosize, 0);
          }
        } catch {
          // No provider configured / failure — silently stay in typed mode.
        } finally {
          setTranscribing(false);
        }
      };

      rec.start();
      setRecording(true);
    } catch {
      // Mic permission denied or unavailable — quietly keep typed mode.
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF9]">
        <Tako size={48} thinking />
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#FAFAF9] px-6 text-center">
        <Tako size={56} />
        <h2 className="text-xl font-medium tracking-tight text-neutral-900">
          Session not found
        </h2>
        <Link
          href="/"
          className="rounded-full bg-neutral-900 px-7 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Teach something new
        </Link>
      </div>
    );
  }

  const currentTakoMsg = [...messages]
    .reverse()
    .find((m) => m.role === "tako");

  const progressText =
    understanding >= 90
      ? "Mastered"
      : understanding >= 75
      ? "Almost there"
      : understanding >= 50
      ? "Getting it"
      : understanding >= 25
      ? "Curious"
      : "Confused";

  const normalizedConcepts = (session.concepts || []).map((c: any) => ({
    label: c.name || c.label || "Concept",
    unlocked: c.status === "mastered" || c.unlocked === true,
  }));
  const unlockedCount = normalizedConcepts.filter((c) => c.unlocked).length;
  const totalConcepts = normalizedConcepts.length;

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-[#FAFAF9] text-neutral-900 selection:bg-violet-100 selection:text-violet-900">
      {/* Header — same quiet language as landing + report */}
      <header className="relative z-20 shrink-0 border-b border-neutral-200/70 bg-white/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-neutral-900 transition hover:opacity-70"
            >
              <span className="text-[15px] font-semibold tracking-tight">
                TakoSensei
              </span>
            </Link>
            <div className="hidden h-3.5 w-px bg-neutral-200 sm:block" />
            <span className="hidden max-w-[220px] truncate text-[13px] font-medium text-neutral-400 sm:inline">
              {session.topic}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {endState ? (
              <Link
                href={`/exam/${id}`}
                className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
              >
                Exam Mode
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setSwitchModalOpen(true)}
                className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
              >
                Exam Mode
              </button>
            )}
            <button
              onClick={finishLesson}
              disabled={finishing}
              className="rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:bg-neutral-800 disabled:opacity-50"
            >
              {finishing ? "Finishing…" : "Finish"}
            </button>
            <Link
              href="/"
              className="rounded-full px-3.5 py-2 text-[13px] font-medium text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
            >
              Exit
            </Link>
          </div>
        </div>
      </header>

      {/* Single-screen body */}
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col overflow-hidden px-6 py-5 sm:py-6">
        {/* Progress — completion + mastery, one source of truth */}
        <div className="shrink-0 space-y-3">
          <div className="flex items-center gap-4">
            <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center">
              <svg viewBox="0 0 48 48" className="h-[52px] w-[52px] -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  className="text-neutral-100"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={`${(understanding / 100) * 125.66} 125.66`}
                  className="text-sky-500 transition-[stroke-dasharray] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  stroke="currentColor"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[14px] font-semibold tabular-nums tracking-tight text-neutral-900">
                {understanding}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-neutral-800">
                    Session Progress
                  </span>
                  <span className="text-[11px] font-medium text-sky-500 tabular-nums">
                    {resolvedCountState}/{totalConcepts} covered · {understanding}%
                  </span>
                </div>
                <div className="h-[4px] overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-[width] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{ width: `${understanding}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[12px] font-medium text-neutral-500">
                    Mastery
                  </span>
                  <span className="text-[11px] font-medium text-emerald-600 tabular-nums">
                    {masteredCountState}/{totalConcepts} mastered · {masteryProgress}%
                  </span>
                </div>
                <div className="h-[3px] overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{ width: `${masteryProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tako question — centered, quiet, no heavy card chrome */}
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center py-6">
          <div className="mb-5">
            <Tako size={48} thinking={thinking || !!endState} />
          </div>

          <div
            key={newQuestionKey}
            className={`w-full max-h-full overflow-y-auto text-center ${
              thinking ? "" : "tako-question"
            }`}
          >
            {(currentTakoMsg || thinking) && (
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-400">
                {endState ? "Tako says" : "Tako asks"}
              </p>
            )}
            {thinking ? (
              <div className="flex items-center justify-center gap-2.5 py-2">
                <span className="tako-dots">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="text-[14px] font-normal text-neutral-400">
                  Thinking…
                </span>
              </div>
            ) : (
              <h2 className="mx-auto max-w-md text-[1.35rem] font-medium leading-[1.45] tracking-tight text-neutral-900 sm:text-[1.5rem]">
                {currentTakoMsg?.content ?? ""}
              </h2>
            )}
          </div>
        </section>

        {/* ── Smart stopping banners (Apple-style notification) ── */}
        {endState && (
          <div
            className={`end-banner shrink-0 mb-4 overflow-hidden rounded-[22px] border px-5 py-4 text-[15px] font-medium shadow-sm ${
              endState === "victory"
                ? "end-banner-victory border-emerald-200/70 bg-emerald-50/80 text-emerald-800 shadow-emerald-200/30"
                : endState === "completed"
                ? "end-banner-sky border-sky-200/70 bg-sky-50/80 text-sky-800 shadow-sky-200/30"
                : "end-banner-amber border-amber-200/70 bg-amber-50/80 text-amber-800 shadow-amber-200/30"
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                  <Tako size={22} />
                </span>
                <span className="text-[13px] font-bold uppercase tracking-[0.15em] text-neutral-300">
                  {endState === "victory"
                    ? "Mastery Complete"
                    : endState === "completed"
                    ? "Session Complete"
                    : "Session Paused"}
                </span>
              </div>

              <p className="text-[14px] leading-[1.55] text-neutral-700">
                {endState === "victory"
                  ? "Every concept on your checklist is genuinely mastered — you can explain each one clearly in your own words."
                  : endState === "completed"
                  ? "That's a wrap for today. Your report shows exactly what clicked and the single best concept to revisit next."
                  : "Your session ended early, and that's okay. Your report captures everything Tako learned so far."}
              </p>

              <div className="flex items-center gap-3 pt-0.5">
                <Link
                  href={`/report/${id}`}
                  className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-bold shadow-md transition hover:shadow-lg ${
                    endState === "victory"
                      ? "bg-neutral-900 text-white hover:bg-neutral-800"
                      : "bg-neutral-900 text-white hover:bg-neutral-800"
                  }`}
                >
                  {endState === "victory"
                    ? "See Full Report"
                    : endState === "completed"
                    ? "See My Report"
                    : "See Session Report"}
                  <span aria-hidden>→</span>
                </Link>
                <Link
                  href="/"
                  className="text-xs font-medium text-neutral-400 transition hover:text-neutral-700"
                >
                  New Topic
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Subtle nudge at strike 2 — never accusatory */}
        {strikes >= 2 && !endState && (
          <div className="shrink-0 mb-3 flex items-start gap-2 rounded-xl border border-amber-200/60 bg-amber-50/60 px-3.5 py-2 text-[12.5px] leading-snug text-amber-700">
            <span aria-hidden>💡</span>
            <span>
              Tip: try explaining the idea in your own words, like you're teaching a
              friend who's never seen the notes.
            </span>
          </div>
        )}

        {/* Quick Review — one-shot notes review, no hints */}
        {!endState && (
          <HelpPanel
            onRequestQuickReview={requestQuickReview}
            reviewOpened={reviewOpenedOnce}
            disabled={!!endState || loadingQuickReview}
          />
        )}

        {/* Answer box — soft, quiet, always reachable */}
        <section className="shrink-0">
          <div className={`rounded-[22px] border px-4 pb-3 pt-3 transition focus-within:border-neutral-300 focus-within:shadow-[0_8px_28px_-16px_rgba(0,0,0,0.18)] ${
            endState
              ? "border-neutral-200/50 bg-neutral-50/60 opacity-60"
              : "border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          }`}>
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autosize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !endState) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={!!endState}
              placeholder={
                endState
                  ? "Session complete. Review your report above."
                  : "Teach Tako in your own words…"
              }
              className="block w-full resize-none border-none bg-transparent px-1 py-1 text-[15px] leading-relaxed text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
              rows={2}
            />
            <div className="mt-1 flex items-center justify-between gap-3 px-0.5">
              <span className="text-[11px] text-neutral-300">
                {recording
                  ? "Listening… tap the mic to stop"
                  : transcribing
                  ? "Transcribing your voice…"
                  : "Enter to teach · ⇧⏎ new line"}
              </span>
              <div className="flex items-center gap-2">
                {/* Hold-to-speak mic (Whisper via /api/transcribe) */}
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={transcribing || thinking || sent}
                  title={recording ? "Stop recording" : "Voice teach (microphone)"}
                  aria-label={recording ? "Stop recording" : "Voice teach"}
                  className={`btn-primary relative flex h-9 w-9 items-center justify-center rounded-full border transition disabled:opacity-35 ${
                    recording
                      ? "border-red-300 bg-red-50 text-red-500"
                      : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-900"
                  }`}
                >
                  {transcribing ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="2" width="6" height="12" rx="3" />
                      <path d="M5 10a7 7 0 0 0 14 0" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                  )}
                  {recording && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-red-300/40" aria-hidden />
                  )}
                </button>

                <button
                  onClick={send}
                  disabled={!!endState || !input.trim() || thinking || sent}
                  className={`send-btn flex h-9 min-w-[108px] items-center justify-center rounded-full px-5 text-[13px] font-semibold text-white transition disabled:opacity-35 ${
                    sent
                      ? "is-sent bg-emerald-600"
                      : "bg-neutral-900 hover:bg-neutral-800"
                  }`}
                >
                  <span className="send-label">
                    {thinking ? "Thinking…" : "Teach Tako"}
                  </span>
                  <span className="send-check" aria-hidden>
                    {thinking ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M20 6L9 17L4 12"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Concepts — locked concepts are HIDDEN; only revealed when mastered */}
        <section className="mt-5 shrink-0">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300">
              Mastery
            </span>
            <span className="text-[11px] font-medium tabular-nums text-neutral-300">
              {unlockedCount}/{totalConcepts}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {normalizedConcepts.map((c, i) => {
              const isLocked = !c.unlocked;
              return (
                <span
                  key={i}
                  className={`chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${
                    !isLocked
                      ? "unlocked border-emerald-200/60 bg-emerald-50 text-emerald-700"
                      : "locked border-neutral-200/70 bg-white text-neutral-300"
                  }`}
                  title={isLocked ? "Teach this concept to unlock it" : c.label}
                >
                  {!isLocked ? (
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
                  ) : (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <rect x="5" y="11" width="14" height="8" rx="1.5" />
                      <path d="M8 11V7c0-2.2 1.8-4 4-4s4 1.8 4 4v4" />
                    </svg>
                  )}
                  {/* Show "???" when locked; real name only appears on mastery */}
                  {isLocked ? (
                    <span className="tabular-nums tracking-wider opacity-60">???</span>
                  ) : (
                    <span>{c.label}</span>
                  )}
                </span>
              );
            })}
          </div>
        </section>
      </div>

      <MiniLessonModal
        isOpen={miniLessonModalOpen}
        content={miniLessonContent}
        onClose={() => setMiniLessonModalOpen(false)}
        onReadyToTry={() => setMiniLessonModalOpen(false)}
      />

      <SwitchModeModal
        isOpen={switchModalOpen}
        targetMode="exam"
        onClose={() => setSwitchModalOpen(false)}
        onConfirm={() => {
          setSwitchModalOpen(false);
          router.push(`/exam/${id}`);
        }}
      />
    </main>
  );
}
