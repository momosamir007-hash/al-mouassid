"use client";
import { api, ApiClientError } from "./api";
import { createLocalStore, useLocalStore } from "./localStore";
export interface LocalMessage { id: string; role: "user" | "assistant"; action: string; content: string; provider?: { name: string; isLocal: boolean; model?: string | null } | null; createdAt: number }
export interface LocalExercise { id: string; level: string; subject: string; title: string; text: string; createdAt: number; updatedAt: number; synced: boolean; messages: LocalMessage[] }
const listStore = createLocalStore<LocalExercise[]>("mouassid:exercises:v1", []);
const deletesStore = createLocalStore<string[]>("mouassid:pending-deletes:v1", []);
export const useExercises = () => useLocalStore(listStore);
export const getExercises = () => listStore.read();
export const getPendingDeletes = () => deletesStore.read();
export function newId(): string { return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).slice(0, 64); }
export function makeTitle(text: string): string { const t = text.replace(/\s+/g, " ").trim(); return t.length > 60 ? `${t.slice(0, 60)}…` : t; }
export function createExercise(input: { level: string; subject: string; text: string }): LocalExercise {
  const now = Date.now(); const ex: LocalExercise = { id: newId(), level: input.level, subject: input.subject, text: input.text.trim(), title: makeTitle(input.text), createdAt: now, updatedAt: now, synced: false, messages: [] };
  listStore.write([ex, ...listStore.read()]); return ex;
}
export function updateExercise(id: string, patch: Partial<Pick<LocalExercise, "text" | "level" | "subject">>) {
  listStore.write(listStore.read().map(e => e.id !== id ? e : {
    ...e, ...patch, title: patch.text ? makeTitle(patch.text) : e.title, updatedAt: Date.now(), synced: false,
    // أي تغيير جوهري في نص التمرين/المادة/المستوى يبطل سياق الحل السابق.
    messages: (patch.text !== undefined && patch.text !== e.text) || (patch.subject !== undefined && patch.subject !== e.subject) || (patch.level !== undefined && patch.level !== e.level) ? [] : e.messages,
  }));
}
export function addMessages(id: string, msgs: LocalMessage[], markSynced = false) {
  listStore.write(listStore.read().map(e => {
    if (e.id !== id) return e;
    const known = new Set(e.messages.map(m => m.id));
    return { ...e, messages: [...e.messages, ...msgs.filter(m => !known.has(m.id))].sort((a,b) => a.createdAt-b.createdAt), updatedAt: Date.now(), synced: markSynced ? e.synced : false };
  }));
}
export function removeExercise(id: string) {
  const ex = listStore.read().find(e => e.id === id); listStore.write(listStore.read().filter(e => e.id !== id));
  if (ex) deletesStore.write([...new Set([...deletesStore.read(), id])]);
}
export function clearAllLocal(opts: { keepPendingDeletes?: boolean } = {}) { listStore.write([]); if (!opts.keepPendingDeletes) deletesStore.write([]); }
export function unsyncedCount(): number { return listStore.read().filter(e => !e.synced).length + deletesStore.read().length; }
interface ServerExercise { clientId: string; level: string; subject: string; title: string; text: string; createdAt: number; updatedAt: number; messages: LocalMessage[] }
interface SyncResponse { exercises: ServerExercise[]; deletedClientIds: string[] }
const chunks = <T,>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
let syncPromise: Promise<{ ok: boolean; message: string }> | null = null;

/** مزامنة على دفعات مع دمج أحدث نسخة محلية بعد عودة الشبكة، وعدم محو تغييرات حدثت أثناء الطلب. */
export function syncWithServer(): Promise<{ ok: boolean; message: string }> {
  if (syncPromise) return syncPromise;
  syncPromise = performSync().finally(() => { syncPromise = null; });
  return syncPromise;
}
async function performSync(): Promise<{ ok: boolean; message: string }> {
  const snapshot = listStore.read(); const submittedDeletes = deletesStore.read();
  const pending = snapshot.filter(e => !e.synced);
  const deleteChunks = chunks(submittedDeletes, 500); const exerciseChunks = chunks(pending, 200);
  const countRequests = Math.max(1, deleteChunks.length, exerciseChunks.length);
  let server: SyncResponse | null = null;
  try {
    for (let i = 0; i < countRequests; i++) {
      const res = await api<SyncResponse>("/api/exercises/sync", {
        method: "POST", json: {
          deletes: i < deleteChunks.length ? deleteChunks[i] : [],
          exercises: i < exerciseChunks.length ? exerciseChunks[i].map(e => ({ clientId: e.id, level: e.level, subject: e.subject, text: e.text, title: e.title, updatedAt: e.updatedAt })) : [],
        },
      });
      server = res;
    }
    if (!server) throw new Error("لم يُرجع الخادم بيانات المزامنة.");
    const current = listStore.read(); const currentById = new Map(current.map(e => [e.id, e]));
    const snapshotById = new Map(snapshot.map(e => [e.id, e]));
    const deleted = new Set(server.deletedClientIds ?? []);
    const merged: LocalExercise[] = []; const seen = new Set<string>();
    for (const s of server.exercises) {
      if (deleted.has(s.clientId)) continue;
      seen.add(s.clientId);
      const local = currentById.get(s.clientId);
      if (!local) { merged.push({ id: s.clientId, level: s.level, subject: s.subject, title: s.title, text: s.text, createdAt: s.createdAt, updatedAt: s.updatedAt, synced: true, messages: s.messages }); continue; }
      const snap = snapshotById.get(local.id);
      const changedDuringRequest = !snap || local.updatedAt > snap.updatedAt || local.messages.length > snap.messages.length;
      const localWins = changedDuringRequest || local.updatedAt > s.updatedAt;
      const known = new Set(local.messages.map(m => m.id));
      const messages = [...local.messages, ...s.messages.filter(m => !known.has(m.id))].sort((a,b) => a.createdAt-b.createdAt);
      merged.push({ ...local, ...(localWins ? {} : { text: s.text, level: s.level, subject: s.subject, title: s.title, updatedAt: s.updatedAt }), messages, synced: !localWins });
    }
    // أي عنصر أُنشئ أثناء انتظار الشبكة أو لم يصل للخادم يبقى غير متزامن ولا نعلّمه synced خطأً.
    for (const local of current) if (!seen.has(local.id) && !deleted.has(local.id)) merged.push({ ...local, synced: false });
    merged.sort((a,b) => b.updatedAt-a.updatedAt);
    const writeOk = listStore.write(merged);
    const stillPendingDeletes = deletesStore.read().filter(id => !submittedDeletes.includes(id) && !deleted.has(id));
    const deleteWriteOk = deletesStore.write(stillPendingDeletes);
    if (!writeOk || !deleteWriteOk) return { ok: false, message: "وصلت البيانات إلى الخادم، لكن تعذّر حفظ نسخة الجهاز. لا تغلق الصفحة قبل التأكد من التخزين المحلي." };
    return { ok: true, message: "تمت المزامنة بنجاح." };
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 0) return { ok: false, message: "لا يوجد اتصال؛ ستبقى البيانات المحلية محفوظة للمزامنة لاحقاً." };
    if (e instanceof ApiClientError && e.status === 401) return { ok: false, message: "سجّل الدخول للمزامنة بين الأجهزة." };
    return { ok: false, message: e instanceof Error ? e.message : "فشلت المزامنة." };
  }
}

export interface Prefs { level: string | null; subject: string | null; showProvider: boolean; ocrLang: string }
const prefsStore = createLocalStore<Prefs>("mouassid:prefs:v1", { level: null, subject: null, showProvider: false, ocrLang: "ara+eng" });
export const usePrefs = () => useLocalStore(prefsStore);
export const getPrefs = () => prefsStore.read();
export function setPrefs(patch: Partial<Prefs>) { prefsStore.write({ ...prefsStore.read(), ...patch }); }

export function archiveLocalData(owner: string): boolean {
  try {
    const snapshot = { exercises: listStore.read(), pendingDeletes: deletesStore.read(), prefs: prefsStore.read() };
    localStorage.setItem(`mouassid:archive:v1:${owner}`, JSON.stringify(snapshot));
    return true;
  } catch { return false; }
}
export function restoreLocalData(owner: string): boolean {
  try {
    const raw = localStorage.getItem(`mouassid:archive:v1:${owner}`);
    if (!raw) { clearAllLocal(); prefsStore.write({ level: null, subject: null, showProvider: false, ocrLang: "ara+eng" }); return true; }
    const data = JSON.parse(raw) as { exercises: LocalExercise[]; pendingDeletes: string[]; prefs: Prefs };
    if (!Array.isArray(data.exercises) || !Array.isArray(data.pendingDeletes)) return false;
    const a = listStore.write(data.exercises); const b = deletesStore.write(data.pendingDeletes);
    if (data.prefs) prefsStore.write(data.prefs);
    return a && b;
  } catch { return false; }
}

