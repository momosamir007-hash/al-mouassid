"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import { clearAllLocal, syncWithServer, unsyncedCount } from "@/lib/client/exerciseStore";
import { useOnline } from "@/lib/client/hooks";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "learner" | "admin";
  defaultLevel: string | null;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  syncing: boolean;
  syncMessage: string | null;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const USER_CACHE = "mouassid:user:v1";
const OWNER = "mouassid:owner:v1";

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider مفقود");
  return c;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const online = useOnline();

  const adopt = useCallback((u: User | null) => {
    setUserState(u);
    try {
      if (u) {
        const owner = localStorage.getItem(OWNER);
        // جهاز مشترك: لا نخلط بيانات حساب بحساب آخر
        if (owner && owner !== u.id) clearAllLocal();
        localStorage.setItem(OWNER, u.id);
        localStorage.setItem(USER_CACHE, JSON.stringify(u));
      } else {
        localStorage.removeItem(USER_CACHE);
      }
    } catch {
      /* تجاهل */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: User | null }>("/api/auth/me");
      adopt(res.user);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 0) {
        // دون اتصال: نستعمل آخر مستخدم معروف لعرض البيانات المحلية فقط
        try {
          const cached = localStorage.getItem(USER_CACHE);
          if (cached) setUserState(JSON.parse(cached) as User);
        } catch {
          /* تجاهل */
        }
      }
    } finally {
      setLoading(false);
    }
  }, [adopt]);

  useEffect(() => {
     
    void refresh();
  }, [refresh]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    const r = await syncWithServer();
    setSyncMessage(r.message);
    setSyncing(false);
  }, []);

  // مزامنة تلقائية عند توفر الاتصال وحساب مسجّل
  useEffect(() => {
    if (user && online && !loading) {
       
      void syncNow();
    }
  }, [user, online, loading, syncNow]);

  const logout = useCallback(async () => {
    if (unsyncedCount() > 0 && navigator.onLine) await syncWithServer();
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* حتى لو فشل نُنظّف محلياً */
    }
    clearAllLocal();
    try {
      localStorage.removeItem(OWNER);
      localStorage.removeItem(USER_CACHE);
    } catch {
      /* تجاهل */
    }
    setUserState(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, setUser: adopt, logout, syncing, syncMessage, syncNow }),
    [user, loading, refresh, adopt, logout, syncing, syncMessage, syncNow],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
