"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createLocalStore, useLocalStore } from "./localStore";
import { DEFAULT_SUBJECTS, type SubjectDef } from "@/lib/constants";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

const subjectStore = createLocalStore<SubjectDef[]>("mouassid:subjects:v1", DEFAULT_SUBJECTS);

/** المواد من الخادم (قابلة للإدارة) مع نسخة مخزنة محلياً وافتراضية للعمل دون اتصال. */
export function useSubjects(): SubjectDef[] {
  const subjects = useLocalStore(subjectStore);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/subjects")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { subjects: SubjectDef[] }) => {
        if (!cancelled && j.subjects?.length) subjectStore.write(j.subjects);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return subjects;
}

/** false أثناء العرض على الخادم/الترطيب ثم true على العميل (لتفادي وميض «غير موجود»). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
