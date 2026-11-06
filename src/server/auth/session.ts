import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { ApiError } from "@/server/utils/api";

const COOKIE = "mouassid_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "learner" | "admin";
  defaultLevel: string | null;
}

export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(sessions).values({ tokenHash: sha(token), userId, expiresAt });
  const h = await headers();
  const secure = h.get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha(token)));
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      defaultLevel: users.defaultLevel,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha(token)))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role as SessionUser["role"], defaultLevel: row.defaultLevel };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new ApiError(401, "سجّل الدخول أولاً.", "unauthenticated");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new ApiError(403, "هذه الصفحة لصاحب المنصة فقط.", "forbidden");
  return u;
}
