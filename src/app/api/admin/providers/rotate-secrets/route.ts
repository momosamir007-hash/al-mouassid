import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders } from "@/db/schema";
import { decryptSecret, encryptSecret, hasAppSecret } from "@/server/ai/secrets";
import { requireAdmin } from "@/server/auth/session";
import { ApiError, handle, ok } from "@/server/utils/api";

export const dynamic = "force-dynamic";
export async function POST() {
  return handle("admin.providers.rotate-secrets", async () => {
    await requireAdmin();
    if (!hasAppSecret() || !process.env.APP_SECRET_PREVIOUS) throw new ApiError(400, "اضبط APP_SECRET الجديد وAPP_SECRET_PREVIOUS القديم أولاً.", "rotation_config_missing");
    const rows = await db.select({ id: aiProviders.id, apiKeyEnc: aiProviders.apiKeyEnc }).from(aiProviders);
    let rotated = 0;
    await db.transaction(async tx => {
      for (const row of rows) {
        if (!row.apiKeyEnc) continue;
        const plain = decryptSecret(row.apiKeyEnc);
        await tx.update(aiProviders).set({ apiKeyEnc: encryptSecret(plain) }).where(eq(aiProviders.id, row.id));
        rotated++;
      }
    });
    return ok({ ok: true, rotated });
  });
}
