"use client";

import { useSyncExternalStore } from "react";

export interface LocalStore<T> {
  read(): T;
  write(v: T): void;
  subscribe(cb: () => void): () => void;
  getServer(): T;
}

/** مخزن localStorage قابل للاشتراك (يعمل مع useSyncExternalStore). */
export function createLocalStore<T>(key: string, empty: T): LocalStore<T> {
  let cache: T | undefined;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (cache !== undefined) return cache;
    try {
      const raw = localStorage.getItem(key);
      cache = raw ? (JSON.parse(raw) as T) : empty;
    } catch {
      cache = empty;
    }
    return cache as T;
  };
  const write = (v: T) => {
    cache = v;
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* الذاكرة ممتلئة أو التخزين محظور */
    }
    listeners.forEach((l) => l());
  };
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = undefined;
        cb();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  };
  return { read, write, subscribe, getServer: () => empty };
}

export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.read, store.getServer);
}
