"use client";

import { useEffect } from "react";

/** يسجّل Service Worker للتثبيت والعمل دون اتصال (في الإنتاج فقط). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
