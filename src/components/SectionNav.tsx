"use client";

import { useEffect, useRef, useState } from "react";

export type NavSection = { id: string; label: string };

/**
 * Apple-style minimal dot/rail section navigator.
 * Quiet slack: small pill dots (not lines) that sit idle. On hover, they
 * smoothly expand into the section's label text beside them. Active
 * section gets a solid dark accent and brief expanded text permanently.
 */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const clickLockRef = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onScroll() {
      if (clickLockRef.current) return;
      const marker = window.innerHeight * 0.3;
      let current = sections[0]?.id ?? "";
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= marker) current = s.id;
      }
      setActive((prev) => (prev === current ? prev : current));
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sections]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    clickLockRef.current = true;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickLockRef.current = false;
    }, 700);

    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  return (
    <nav
      aria-label="Report sections"
      className="fixed right-4 top-1/2 z-40 flex flex-col gap-3"
      style={{ right: "max(12px, env(safe-area-inset-right))" }}
    >
      {sections.map((s) => {
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            onClick={() => go(s.id)}
            className="group flex items-center justify-end gap-2 outline-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            title={s.label}
          >
            {/* Label text — appears beside dot on hover, always visible for active */}
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide transition-all duration-300 origin-right whitespace-nowrap ${
                isActive
                  ? 'text-neutral-900 opacity-100 scale-100'
                  : 'text-neutral-400 opacity-0 scale-0 group-hover:opacity-100 group-hover:scale-100'
              }`}
            >
              {s.label}
            </span>

            {/* The dot itself */}
            <span
              className={`rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isActive
                  ? 'h-2.5 w-2.5 bg-neutral-900 scale-110'
                  : 'h-1.5 w-1.5 bg-neutral-300 group-hover:scale-110 group-hover:bg-neutral-500'
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}
