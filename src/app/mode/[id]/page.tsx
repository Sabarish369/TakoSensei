"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tako } from "@/components/Tako";
import { getSession } from "@/lib/localStore";

type SessionData = {
  id: number;
  topic: string;
  concepts?: { name?: string; label?: string }[];
  notes?: string | null;
};

type Mode = "exam" | "sensei";

export default function ModeSelectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<Mode | null>(null);
  const [launching, setLaunching] = useState<Mode | null>(null);

  useEffect(() => {
    const s = getSession(id);
    setSession(
      s
        ? { id: 0, topic: s.topic, concepts: s.concepts as any, notes: s.notes }
        : null
    );
    setLoading(false);
  }, [id]);

  function launch(mode: Mode) {
    if (launching) return;
    setLaunching(mode);
    // Small delay lets the press animation land before navigating.
    setTimeout(() => {
      router.push(mode === "exam" ? `/exam/${id}` : `/teach/${id}`);
    }, 260);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF9]">
        <Tako size={48} thinking />
      </div>
    );
  }

  const conceptCount = session?.concepts?.length ?? 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FAFAF9] text-neutral-900 selection:bg-violet-100 selection:text-violet-900">
      {/* Ambient wash — same language as the landing page */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(124,58,237,0.08),transparent)]" />

      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-8 py-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition hover:opacity-70"
        >
          <span className="text-[15px] font-semibold tracking-tight">
            TakoSensei
          </span>
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-neutral-400 transition hover:text-neutral-900"
        >
          New topic
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 pb-12 pt-20">
        
        {/* Title block */}
        <div className="mb-14 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Notes ready
            {conceptCount > 0 ? ` · ${conceptCount} concepts found` : ""}
          </p>
          <h1 className="mt-4 text-[2.5rem] font-bold leading-[1.05] tracking-tight text-neutral-900 sm:text-[3.25rem]">
            Choose your mode
          </h1>
          {session?.topic && (
            <p className="mt-3 text-[16px] font-medium text-neutral-500">
              {session.topic}
            </p>
          )}
        </div>

        {/* ── The Graphic Cards ── */}
        <div className="grid w-full max-w-[800px] gap-8 sm:grid-cols-2">
          
          {/* EXAM MODE CARD */}
          <button
            onClick={() => launch("exam")}
            onMouseEnter={() => setHovered("exam")}
            onMouseLeave={() => setHovered(null)}
            disabled={!!launching}
            className={`mode-card group relative aspect-[4/5] w-full overflow-hidden rounded-[32px] p-2 text-left transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              launching === "exam"
                ? "scale-[0.96] opacity-80"
                : hovered === "exam"
                ? "scale-[1.02] shadow-[0_32px_80px_-24px_rgba(124,58,237,0.35)]"
                : "scale-100 shadow-[0_16px_40px_-16px_rgba(124,58,237,0.15)] hover:shadow-[0_24px_60px_-20px_rgba(124,58,237,0.25)]"
            } ${launching && launching !== "exam" ? "opacity-30 scale-95" : ""}`}
          >
            {/* Deep colorful background */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 transition-transform duration-700 group-hover:scale-105" />
            
            {/* Abstract 3D-ish floating shapes for Exam Mode */}
            <div className="pointer-events-none absolute inset-0 opacity-90 transition-transform duration-1000 group-hover:scale-110">
              {/* Shape 1 */}
              <div className="absolute -left-4 top-10 h-32 w-48 -rotate-12 rounded-[2rem] bg-gradient-to-br from-white/30 to-white/0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] backdrop-blur-md" />
              {/* Shape 2 */}
              <div className="absolute right-4 top-32 h-24 w-24 rotate-45 rounded-3xl bg-gradient-to-tr from-white/40 to-white/5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)] backdrop-blur-lg" />
              {/* Shape 3 */}
              <div className="absolute -bottom-8 left-12 h-40 w-40 rotate-[30deg] rounded-[3rem] bg-gradient-to-br from-white/20 to-white/0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-xl" />
              
              {/* Little sparkles */}
              <svg className="absolute left-1/4 top-1/4 h-6 w-6 text-white/80" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0l2 9 9 2-9 2-2 9-2-9-9-2 9-2 2-9z" />
              </svg>
              <svg className="absolute right-1/4 top-1/3 h-4 w-4 text-white/60" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0l2 9 9 2-9 2-2 9-2-9-9-2 9-2 2-9z" />
              </svg>
            </div>

            {/* Inner content container (the white outline layer) */}
            <div className="relative flex h-full w-full flex-col justify-end overflow-hidden rounded-[24px] border-[3px] border-white/20 bg-gradient-to-t from-black/60 via-black/10 to-transparent p-6 sm:p-8 transition-colors duration-500 group-hover:border-white/40">
              
              <div className="relative z-10 translate-y-2 transition-transform duration-500 group-hover:translate-y-0">
                <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.2em] text-white/70">
                  Quick Revision
                </p>
                <h2 className="text-[2.2rem] font-bold leading-tight tracking-tight text-white sm:text-[2.6rem]">
                  Exam Mode
                </h2>
                
                {/* Reveal on hover info */}
                <div className="mt-4 grid grid-rows-[0fr] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:grid-rows-[1fr]">
                  <div className="overflow-hidden">
                    <p className="mb-4 text-[14px] leading-relaxed text-white/80">
                      Six exam-style questions graded point-by-point against a real mark scheme.
                    </p>
                    <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                      {launching === "exam" ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Starting…
                        </>
                      ) : (
                        <>
                          Start Drill
                          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </button>

          {/* SENSEI MODE CARD */}
          <button
            onClick={() => launch("sensei")}
            onMouseEnter={() => setHovered("sensei")}
            onMouseLeave={() => setHovered(null)}
            disabled={!!launching}
            className={`mode-card group relative aspect-[4/5] w-full overflow-hidden rounded-[32px] p-2 text-left transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              launching === "sensei"
                ? "scale-[0.96] opacity-80"
                : hovered === "sensei"
                ? "scale-[1.02] shadow-[0_32px_80px_-24px_rgba(16,185,129,0.35)]"
                : "scale-100 shadow-[0_16px_40px_-16px_rgba(16,185,129,0.15)] hover:shadow-[0_24px_60px_-20px_rgba(16,185,129,0.25)]"
            } ${launching && launching !== "sensei" ? "opacity-30 scale-95" : ""}`}
          >
            {/* Deep colorful background */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 transition-transform duration-700 group-hover:scale-105" />
            
            {/* Abstract 3D-ish floating shapes for Sensei Mode */}
            <div className="pointer-events-none absolute inset-0 opacity-90 transition-transform duration-1000 group-hover:scale-110">
              {/* Big center sphere-ish */}
              <div className="absolute -right-8 top-20 h-48 w-48 rounded-full bg-gradient-to-tr from-white/30 to-white/0 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)] backdrop-blur-md" />
              {/* Small floater */}
              <div className="absolute left-6 top-16 h-16 w-16 rounded-[1rem] bg-gradient-to-bl from-white/40 to-white/5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)] backdrop-blur-lg rotate-12" />
              {/* Bottom pill */}
              <div className="absolute -bottom-6 -left-6 h-28 w-40 -rotate-12 rounded-full bg-gradient-to-t from-white/20 to-white/0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-xl" />
              
              {/* Little sparkles */}
              <svg className="absolute right-1/3 top-1/4 h-7 w-7 text-white/90" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0l2 9 9 2-9 2-2 9-2-9-9-2 9-2 2-9z" />
              </svg>
            </div>

            {/* Inner content container */}
            <div className="relative flex h-full w-full flex-col justify-end overflow-hidden rounded-[24px] border-[3px] border-white/20 bg-gradient-to-t from-black/60 via-black/10 to-transparent p-6 sm:p-8 transition-colors duration-500 group-hover:border-white/40">
              
              <div className="relative z-10 translate-y-2 transition-transform duration-500 group-hover:translate-y-0">
                <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.2em] text-white/70">
                  Deep Learning
                </p>
                <h2 className="text-[2.2rem] font-bold leading-tight tracking-tight text-white sm:text-[2.6rem]">
                  Sensei Mode
                </h2>
                
                {/* Reveal on hover info */}
                <div className="mt-4 grid grid-rows-[0fr] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:grid-rows-[1fr]">
                  <div className="overflow-hidden">
                    <p className="mb-4 text-[14px] leading-relaxed text-white/80">
                      Teach Tako out loud. Socratic back-and-forth until the core ideas truly click.
                    </p>
                    <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                      {launching === "sensei" ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Starting…
                        </>
                      ) : (
                        <>
                          Start Teaching
                          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </button>
        </div>

        {/* Footer hint */}
        <p className="mt-10 text-center text-[13px] font-medium text-neutral-400">
          You can switch modes anytime — progress is saved.
        </p>
      </div>
    </main>
  );
}
