"use client";

import { api, ApiClientError } from "./api";
import { createLocalStore, useLocalStore } from "./localStore";

export interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  action: string;
  content: string;
  provider?: { name: string; isLocal: boolean; model?: string | null } | null;
  createdAt: number;
}

export interface LocalExercise {
  /** المعرّف المحلي = clientId على الخادم */
  id: string;
  level: string;
  subject: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  /** هل آخر نسخة مرفوعة للخادم؟ */
  synced: boolean;
  messages: LocalMessage[];
}

const listStore = createLocalStore<LocalExercise[]>("mouassid:exercises:v1", []);
const deletesStore = createLocalStore<string[]>("mouassid:pending-deletes:v1", []);

export const useExercises = () => useLocalStore(listStore);
export const getExercises = () => listStore.read();
export const getPendingDeletes = () => deletesStore.read();

export function newId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).slice(0, 64);
}

export function makeTitle(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

export function createExercise(input: { level: string; subject: string; text: string }): LocalExercise {
  const now = Date.now();
  const ex: LocalExercise = {
    id: newId(),
    level: input.level,
    subject: input.subject,
    text: input.text.trim(),
    title: makeTitle(input.text),
    createdAt: now,
    updatedAt: now,
    synced: false,
    messages: [],
  };
  listStore.write([ex, ...listStore.read()]);
  return ex;
}

export function updateExercise(id: string, patch: Partial<Pick<LocalExercise, "text" | "level" | "subject">>) {
  listStore.write(
    listStore.read().map((e) =>
      e.id === id
        ? { ...e, ...patch, title: patch.text ? makeTitle(patch.text) : e.title, updatedAt: Date.now(), synced: false }
        : e,
    ),
  );
}

export function addMessages(id: string, msgs: LocalMessage[], markSynced = false) {
  listStore.write(
    listStore.read().map((e) => {
      if (e.id !== id) return e;
      const known = new Set(e.messages.map((m) => m.id));
      const merged = [...e.messages, ...msgs.filter((m) => !known.has(m.id))].sort((a, b) => a.createdAt - b.createdAt);
      return { ...e, messages: merged, updatedAt: Date.now(), synced: markSynced ? e.synced : false };
    }),
  );
}

export function removeExercise(id: string) {
  const ex = listStore.read().find((e) => e.id === id);
  listStore.write(listStore.read().filter((e) => e.id !== id));
  // نحذف من الخادم عند أول مزامنة إن كان قد رُفع أو قد يكون رُفع
  if (ex) deletesStore.write([...new Set([...deletesStore.read(), id])]);
}

export function clearAllLocal(opts: { keepPendingDeletes?: boolean } = {}) {
  listStore.write([]);
  if (!opts.keepPendingDeletes) deletesStore.write([]);
}

export function unsyncedCount(): number {
  return listStore.read().filter((e) => !e.synced).length + deletesStore.read().length;
}

interface ServerExercise {
  clientId: string;
  level: string;
  subject: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  messages: LocalMessage[];
}

/**
 * قواعد المزامنة (انظر docs/architecture/sync.md):
 * 1) نرسل الحذف المعلّق ثم التمارين غير المتزامنة.
 * 2) الأحدث (updatedAt) يفوز في حقول التمرين؛ الرسائل تُدمج بالمعرّف.
 * 3) تمارين الخادم غير الموجودة محلياً تُضاف (إلا المحذوفة محلياً).
 */
export async function syncWithServer(): Promise<{ ok: boolean; message: string }> {
  const local = listStore.read();
  const deletes = deletesStore.read();
  try {
    const res = await api<{ exercises: ServerExercise[] }>("/api/exercises/sync", {
      method: "POST",
      json: {
        deletes,
        exercises: local
          .filter((e) => !e.synced)
          .map((e) => ({
            clientId: e.id,
            level: e.level,
            subject: e.subject,
            text: e.text,
            title: e.title,
            updatedAt: e.updatedAt,
          })),
      },
    });
    const byId = new Map(local.map((e) => [e.id, e]));
    const deleted = new Set(deletes);
    const merged: LocalExercise[] = [];
    const seen = new Set<string>();
    for (const s of res.exercises) {
      if (deleted.has(s.clientId)) continue;
      seen.add(s.clientId);
      const l = byId.get(s.clientId);
      if (!l) {
        merged.push({ id: s.clientId, level: s.level, subject: s.subject, title: s.title, text: s.text, createdAt: s.createdAt, updatedAt: s.updatedAt, synced: true, messages: s.messages });
        continue;
      }
      const newer = l.updatedAt >= s.updatedAt ? l : null;
      const known = new Set(l.messages.map((m) => m.id));
      const messages = [...l.messages, ...s.messages.filter((m) => !known.has(m.id))].sort((a, b) => a.createdAt - b.createdAt);
      merged.push({
        ...l,
        ...(newer ? {} : { text: s.text, level: s.level, subject: s.subject, title: s.title, updatedAt: s.updatedAt }),
        messages,
        synced: true,
      });
    }
    // محلي فقط (المحلية الخاصة بحسابات أخرى لا تصل إلى هنا)
    for (const l of local) if (!seen.has(l.id)) merged.push({ ...l, synced: true });
    merged.sort((a, b) => b.updatedAt - a.updatedAt);
    listStore.write(merged);
    deletesStore.write([]);
    return { ok: true, message: "تمت المزامنة بنجاح." };
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 0) return { ok: false, message: "لا يوجد اتصال؛ ستتم المزامنة عند عودة الإنترنت." };
    if (e instanceof ApiClientError && e.status === 401) return { ok: false, message: "سجّل الدخول للمزامنة بين الأجهزة." };
    return { ok: false, message: e instanceof Error ? e.message : "فشلت المزامنة." };
  }
}

// ---- التفضيلات ----
export interface Prefs {
  level: string | null;
  subject: string | null;
  showProvider: boolean;
  ocrLang: string;
}
const prefsStore = createLocalStore<Prefs>("mouassid:prefs:v1", { level: null, subject: null, showProvider: false, ocrLang: "ara+eng" });
export const usePrefs = () => useLocalStore(prefsStore);
export const getPrefs = () => prefsStore.read();
export function setPrefs(patch: Partial<Prefs>) {
  prefsStore.write({ ...prefsStore.read(), ...patch });
}
