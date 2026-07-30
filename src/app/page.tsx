"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Tako } from "@/components/Tako";
import { extractTextFromFile } from "@/lib/pdf";
import { createSession, listSessions } from "@/lib/localStore";

type RecentSession = {
  id: string;
  topic: string;
  understanding: number;
};

const DEMO_NOTES = {
  Photosynthesis: `Photosynthesis is the process by which green plants and some other organisms use sunlight to synthesize foods from carbon dioxide and water. It involves two main stages: the light-dependent reactions and the Calvin cycle.

In the light-dependent reactions, chlorophyll in the thylakoid membranes absorbs light energy, which splits water molecules, releasing oxygen and creating ATP and NADPH. These energy carriers are then used in the Calvin cycle to convert carbon dioxide into glucose.

Key concepts include chlorophyll, light-dependent reactions, Calvin cycle, ATP, NADPH, glucose, and oxygen release.`,

  "Newton's Laws": `Newton's three laws of motion describe the relationship between the motion of an object and the forces acting on it.

1. First Law (Inertia): An object at rest stays at rest and an object in motion stays in motion with constant velocity unless acted upon by a net external force.
2. Second Law: The acceleration of an object is directly proportional to the net force acting on it and inversely proportional to its mass (F = ma).
3. Third Law: For every action, there is an equal and opposite reaction.

These laws form the foundation of classical mechanics and are used to predict the behavior of physical systems.`,

  "Supply and demand": `Supply and demand is a model of price determination in a market. The law of demand states that, all else equal, as the price of a product increases, quantity demanded falls. The law of supply states that as the price increases, quantity supplied increases.

Market equilibrium occurs where supply equals demand. If price is above equilibrium, a surplus occurs; if below, a shortage. Elasticity measures how responsive quantity demanded or supplied is to price changes.

Key factors include consumer income, preferences, prices of related goods, production costs, and technology.`,
};

function getWordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function Home() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [difficulty] = useState("Balanced");
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [recent, setRecent] = useState<RecentSession[]>([]);

  const boxRef = useRef<HTMLDivElement>(null);
  const topicRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Recent sessions come from localStorage — no database.
    setRecent(
      listSessions()
        .slice(0, 5)
        .map((s) => ({
          id: s.id,
          topic: s.topic,
          understanding: s.understanding ?? 0,
        }))
    );
  }, []);

  // Clicking outside collapses the editor (Apple Spotlight style)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Escape closes the editor
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setExpanded(false);
      }
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  useEffect(() => {
    autosize();
  }, [notes, expanded]);

  function autosize() {
    const el = taRef.current;
    if (!el || !expanded) return;
    el.style.height = "auto";
    el.style.height = Math.max(220, Math.min(el.scrollHeight, 420)) + "px";
  }

  // Apple-style animated scroll — brings the card to the vertical center of
  // the viewport while it pops, so the user never scrolls manually.
  // Uses a cubic-bezier out-ease (~macOS spring feel) on rAF instead of
  // native smooth scroll, which can't be eased precisely.
  const scrollAnimRef = useRef<number | null>(null);
  function scrollCardToCenter(delay = 0) {
    if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    setTimeout(() => {
      const el = boxRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Estimate full (expanded) height: pill + editor ≈ taller than current rect
      const estimatedHeight = Math.max(rect.height, 560);
      const targetCenter = window.innerHeight / 2;
      // Slight bias upward (~14% below-center is most comfortable for typing)
      const bias = estimatedHeight * 0.06;
      const delta =
        rect.top + rect.height / 2 - targetCenter + bias;

      if (Math.abs(delta) < 2) return;

      const startY = window.scrollY;
      const duration = 620; // matches the bubble spring duration

      function easeOutCubic(t: number) {
        return 1 - Math.pow(1 - t, 3);
      }

      const start = performance.now();
      function frame(now: number) {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        window.scrollTo(0, startY + delta * eased);
        if (t < 1) {
          scrollAnimRef.current = requestAnimationFrame(frame);
        } else {
          scrollAnimRef.current = null;
        }
      }
      scrollAnimRef.current = requestAnimationFrame(frame);
    }, delay);
  }

  function expand(autoFocus = true) {
    if (loading) return;
    setExpanded(true);
    scrollCardToCenter(60);
    if (!autoFocus) return;
    // Apple-style: expand, then gently place the caret where it matters most.
    setTimeout(() => {
      if (document.activeElement === topicRef.current) {
        autosize();
        return; // user clicked the topic input — leave caret alone
      }
      if (topic.trim()) {
        taRef.current?.focus();
      } else {
        topicRef.current?.focus();
      }
      autosize();
    }, 200);
  }

  async function handleFile(file: File) {
    try {
      const text = await extractTextFromFile(file);
      if (text.trim()) {
        setNotes(text.trim());
        if (!topic.trim()) {
          const base = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          setTopic(base.charAt(0).toUpperCase() + base.slice(1));
        }
        expand(false);
      }
    } catch {
      alert("Could not read the file. Please paste the text directly.");
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
    expand(false);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function startSession() {
    const t = topic.trim() || "Study Topic";
    const n = notes.trim();
    if (!n && !topic.trim()) return;

    setLoading(true);
    try {
      // Extract concepts server-side (keeps the AI key private), then
      // persist the whole session in localStorage — no database.
      let concepts: any[] = [];
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: t, notes: n }),
        });
        const data = await res.json();
        if (Array.isArray(data?.concepts)) concepts = data.concepts;
      } catch {
        // Fall through with an empty checklist rather than blocking.
      }

      if (concepts.length === 0) {
        concepts = [
          { name: "Core Concept", status: "locked", weight: 3 },
          { name: "Mechanism", status: "locked", weight: 3 },
          { name: "Real-world Impact", status: "locked", weight: 2 },
        ];
      }

      const session = createSession({
        topic: t,
        notes: n || null,
        concepts,
      });
      router.push(`/mode/${session.id}`);
    } catch {
      setLoading(false);
    }
  }

  function loadDemo(name: keyof typeof DEMO_NOTES) {
    setTopic(name);
    setNotes(DEMO_NOTES[name]);
    expand(false);
  }

  const hasContent = notes.trim().length > 0 || topic.trim().length > 0;
  const wordCount = getWordCount(notes);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FAFAF9] text-neutral-900 selection:bg-violet-100 selection:text-violet-900">
      {/* Ambient background — blurs with the page on focus */}
      <div
        className={`chrome-blur pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(124,58,237,0.08),transparent)] ${
          expanded ? "is-blurred" : ""
        }`}
      />

      {/* Header — blurs away when the input pops */}
      <header
        className={`chrome-blur relative z-20 flex items-center justify-between px-8 py-6 ${
          expanded ? "is-blurred" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight">TakoSensei</span>
        </div>
        <a
          href="https://en.wikipedia.org/wiki/Learning_by_teaching"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-neutral-400 transition hover:text-neutral-900"
        >
          Why teaching works ↗
        </a>
      </header>

      {/* Center content */}
      <div
        className={`relative mx-auto flex min-h-[calc(100vh-100px)] w-full max-w-2xl flex-col items-center justify-center px-6 pb-32 transition-[z-index] ${
          expanded ? "z-40" : "z-10"
        }`}
      >
        {/* Hero — side-by-side layout: Tako on the left, title/subtitle on the right */}
        <div
          className={`chrome-blur-near mb-12 flex items-center justify-center gap-6 sm:gap-8 ${
            expanded ? "is-blurred -translate-y-2" : "opacity-100"
          }`}
        >
          <div className="shrink-0">
            <Tako size={96} thinking />
          </div>
          <div className="flex flex-col text-left">
            <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-6xl">
              TakoSensei
            </h1>
            <p className="mt-2 text-lg font-medium text-neutral-400 sm:text-xl">
              Teach it to learn it.
            </p>
          </div>
        </div>

        {/* ====== SLIM PILL → EXPANDING EDITOR ====== */}
        <div
          ref={boxRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => {
            if (!expanded) expand();
          }}
          className={`apple-input relative w-full cursor-text rounded-[28px] border bg-white ${
            expanded ? "apple-bubble " : ""
          }${
            isDragging
              ? "border-violet-400/80 shadow-[0_20px_60px_-16px_rgba(124,58,237,0.25)] ring-4 ring-violet-400/10"
              : expanded
                ? "border-transparent shadow-[0_32px_90px_-20px_rgba(17,24,39,0.28),0_2px_8px_-2px_rgba(17,24,39,0.06)]"
                : "border-neutral-200 shadow-sm hover:shadow-[0_10px_40px_-16px_rgba(17,24,39,0.14)]"
          }`}
        >
          {/* Drag overlay */}
          <div
            className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[28px] bg-violet-50/80 text-sm font-medium text-violet-700 backdrop-blur-sm transition-opacity duration-300 ${
              isDragging ? "opacity-100" : "opacity-0"
            }`}
          >
            Drop your file here
          </div>

          {/* ── Pill row (always visible) ── */}
          <div className="flex items-center gap-3 px-5 py-[15px]">
            {/* + / upload */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
              className="btn-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Upload notes"
              title="Upload notes (PDF, TXT, MD)"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>

            {/* Topic input — the spine of the pill */}
            <input
              ref={topicRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onFocus={() => expand(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !expanded) {
                  e.preventDefault();
                  startSession();
                }
              }}
              placeholder={expanded ? "Title (optional)" : "What do you want to teach Tako today?"}
              className="w-full bg-transparent text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            />

            {/* attached notes indicator */}
            <span
              className={`hidden shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-600 transition-all duration-300 sm:inline-block ${
                notes.trim() && !expanded ? "scale-100 opacity-100" : "scale-75 opacity-0"
              }`}
            >
              {wordCount} words
            </span>

            {/* (Balanced difficulty is fixed) Removed dropdown */}

            {/* Send arrow */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                startSession();
              }}
              disabled={!hasContent || loading}
              className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition enabled:hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
              aria-label="Start teaching"
            >
              {loading ? (
                <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-neutral-400 border-t-white" />
              ) : (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>

          {/* ── Expanding body (notes editor) ── */}
          <div
            className={`grid transition-[grid-template-rows] duration-[620ms] ease-[cubic-bezier(0.32,0.92,0.34,1)] ${
              expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={`border-t border-neutral-100/80 ${expanded ? "apple-panel-content" : "opacity-0 pointer-events-none"}`}
              >
                {/* Editor */}
                <div className="px-6 pb-2 pt-4">
                  <textarea
                    ref={taRef}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Drop your syllabus, paste your notes, or just start typing what you want to teach Tako today…"
                    className="w-full resize-none bg-transparent text-[15px] leading-[1.65] text-neutral-800 placeholder:text-neutral-300 focus:outline-none"
                    rows={8}
                  />
                </div>

                {/* Bottom bar */}
                <div className="flex items-center justify-between border-t border-neutral-100/60 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-900"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                      </svg>
                      <span>Attach notes</span>
                    </button>
                    <span className="hidden text-[11px] text-neutral-300 sm:inline">
                      {wordCount > 0 ? `${wordCount} words · esc to close` : "PDF, TXT, MD · esc to close"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {notes.trim() && (
                      <button
                        onClick={() => setNotes("")}
                        className="text-xs font-medium text-neutral-400 transition hover:text-neutral-600"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      onClick={startSession}
                      disabled={loading || !hasContent}
                      className="btn-primary flex h-9 items-center gap-2 rounded-full bg-neutral-900 px-5 text-xs font-semibold text-white transition enabled:hover:bg-neutral-800 disabled:opacity-40"
                    >
                      {loading ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          <span>Tako is reading…</span>
                        </>
                      ) : (
                        <>
                          Start Teaching Tako
                          <span>→</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md,.markdown"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </div>

        {/* Demo chips + recents blur away while editing */}
        <div
          className={`chrome-blur-near w-full ${
            expanded ? "is-blurred translate-y-2" : "opacity-100"
          }`}
        >
          {/* Demo chips */}
          {!loading && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <span className="text-sm font-semibold text-neutral-300">Try:</span>
              {Object.keys(DEMO_NOTES).map((name) => (
                <button
                  key={name}
                  onClick={() => loadDemo(name as keyof typeof DEMO_NOTES)}
                  className="btn-primary rounded-full border border-neutral-200 bg-white px-5 py-2 text-sm font-semibold text-neutral-500 shadow-sm transition hover:border-neutral-900 hover:text-neutral-900 hover:shadow"
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* Recent sessions */}
          {recent.length > 0 && (
            <div className="mt-16 w-full">
              <p className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300">
                Recently taught
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {recent.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => router.push(`/teach/${s.id}`)}
                    className="group flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-500 shadow-sm transition hover:border-neutral-900 hover:text-neutral-900"
                  >
                    <span className="max-w-[140px] truncate">{s.topic}</span>
                    <span className="rounded-lg bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-400 group-hover:bg-neutral-900 group-hover:text-white">
                      {s.understanding}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* macOS-style frosted veil — sits behind the popped card, blurring the page */}
      <div
        className={`fixed inset-0 z-30 bg-white/30 backdrop-blur-md transition-opacity duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
          expanded ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => {
          setExpanded(false);
        }}
        aria-hidden
      />
    </main>
  );
}
