import { endSession } from "@/server/auth/session";
import { handle, ok } from "@/server/utils/api";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle("auth.logout", async () => {
    await endSession();
    return ok({ ok: true });
  });
}
