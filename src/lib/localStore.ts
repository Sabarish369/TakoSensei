"use client";

/**
 * Client-side session store — replaces the PostgreSQL database entirely.
 *
 * Everything lives in localStorage. The API routes are now stateless compute
 * endpoints that exist only to keep AI keys server-side; they receive state
 * in the request body and return the next state, which we persist here.
 */

import type { ConceptStates } from "./mastery";

export type StoredMessage = {
  id: number;
  role: "user" | "tako";
  content: string;
  meta?: any;
};

export type StoredConcept = {
  name: string;
  status: "locked" | "mastered";
  weight?: number;
  why?: string;
  questionStem?: string;
  commandWord?: string;
  markValue?: number;
  markScheme?: { point: string; keywords: string[] }[];
  examTrap?: string;
  notesEvidence?: string;
};

export type StoredSession = {
  id: string;
  topic: string;
  notes: string | null;
  concepts: StoredConcept[];
  conceptStates: ConceptStates;
  askedQuestions: { conceptName: string; beat: number; text: string }[];
  messages: StoredMessage[];
  understanding: number;
  strikes: number;
  endState: "victory" | "completed" | "disqualified" | null;
  status: "active" | "completed";
  report: any | null;
  examBank: any | null;
  createdAt: string;
  updatedAt: string;
};

const KEY = "takosensei.sessions.v1";
const isBrowser = () => typeof window !== "undefined";

function readAll(): Record<string, StoredSession> {
  if (!isBrowser()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, StoredSession>) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked — fail quietly rather than breaking the drill.
  }
}

export function listSessions(): StoredSession[] {
  return Object.values(readAll()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export function getSession(id: string): StoredSession | null {
  return readAll()[id] ?? null;
}

export function createSession(input: {
  topic: string;
  notes: string | null;
  concepts: StoredConcept[];
}): StoredSession {
  const now = new Date().toISOString();
  const id =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const session: StoredSession = {
    id,
    topic: input.topic,
    notes: input.notes,
    concepts: input.concepts,
    conceptStates: {},
    askedQuestions: [],
    messages: [],
    understanding: 0,
    strikes: 0,
    endState: null,
    status: "active",
    report: null,
    examBank: null,
    createdAt: now,
    updatedAt: now,
  };

  const all = readAll();
  all[id] = session;
  writeAll(all);
  return session;
}

export function updateSession(
  id: string,
  patch: Partial<StoredSession>
): StoredSession | null {
  const all = readAll();
  const existing = all[id];
  if (!existing) return null;
  const next: StoredSession = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  all[id] = next;
  writeAll(all);
  return next;
}

export function appendMessages(
  id: string,
  msgs: { role: "user" | "tako"; content: string; meta?: any }[]
): StoredSession | null {
  const session = getSession(id);
  if (!session) return null;
  let nextId =
    session.messages.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const added = msgs.map((m) => ({ ...m, id: nextId++ }));
  return updateSession(id, { messages: [...session.messages, ...added] });
}

export function deleteSession(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}
