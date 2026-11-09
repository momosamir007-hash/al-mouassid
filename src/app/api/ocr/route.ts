import { z } from "zod";
import { cleanOcrOutput } from "@/lib/clarity";
import { getRouter, NoProviderAvailableError } from "@/server/ai";
import { getSessionUser } from "@/server/auth/session";
import { ApiError, clientIp, handle, ok, parseBody } from "@/server/utils/api";
import { rateLimit } from "@/server/utils/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const schema = z.object({
  image: z
    .object({
      mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
      data: z.string().max(6_000_000).regex(/^[A-Za-z0-9+/=]+$/),
    })
    .optional(),
  rawOcrText: z.string().max(6000).optional(),
  lang: z.string().max(32).optional(),
});

const VISION_OCR_SYSTEM = `أنت نظام ذكي متخصص في قراءة صور التمارين المدرسية والجامعية (الرياضيات، الفيزياء، العلوم، اللغة العربية، اللغات الأجنبية) الملتقطة بكاميرا الهاتف أو المسح الضوئي.
مهمتك الوحيدة:
1. استخرج نص التمرين من الصورة بدقة تامة كما هو مكتوب (سواء كان مطبوعاً أو بخط اليد).
2. اكتب المعادلات الرياضية والكسور والأسس والرموز بوضوح وترتيب سليم (يمكنك كتابة الكسور بصيغة $\\frac{a}{b}$ والجذور بصيغة $\\sqrt{x}$ والأسس $x^2$).
3. إذا وُجد في الصورة جدول أو شكل هندسي أو رسم بياني، صِف معطياته الرقمية والهندسية باختصار واضح ضمن نص التمرين حتى يكتمل معنى السؤال.
4. ممنوع منعاً باتاً حل التمرين أو إعطاء أي تلميح أو شرح؛ أخرج نص التمرين المستخرج فقط بدون أي مقدمات أو تعليقات إضافية.`;

const REFINE_OCR_SYSTEM = `أنت مصحح نصوص تعليمية ذكي. النص المرفق تم استخراجه آلياً عبر OCR تقليدي من صورة تمرين دراسي، وقد يحتوي على حروف متقطعة، كلمات عربية أو أجنبية مشوهة، أو رموز وأرقام رياضية مقلوبة.
مهمتك الوحيدة:
1. أصلح الأخطاء الإملائية والتقطيع الناتج عن الـ OCR ورتّب المعادلات والكسور ($\\frac{a}{b}$) والأرقام الرياضية لتصبح واضحة وسليمة.
2. حافظ على نفس لغة التمرين ومعطياته وأرقامه الأصلية دون تغيير.
3. لا تقم بحل التمرين إطلاقاً ولا تضف أي شرح أو إجابة؛ أخرج نص التمرين المصحح فقط بدون أي مقدمات.`;

function cleanExtractedText(raw: string): string {
  const stripped = raw
    .replace(/^```[a-zA-Z]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^(نص التمرين|النص المستخرج|التمرين)\s*[:：]\s*/i, "")
    .trim();
  return cleanOcrOutput(stripped);
}

export async function POST(req: Request) {
  return handle("ocr.ai", async () => {
    const user = await getSessionUser();
    const key = user ? `ocr:u:${user.id}` : `ocr:ip:${clientIp(req)}`;
    if (!(await rateLimit(key, 30, 10 * 60_000))) {
      throw new ApiError(429, "طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة.", "rate_limited");
    }

    const body = await parseBody(req, schema);
    if (!body.image && !body.rawOcrText?.trim()) {
      throw new ApiError(400, "أرسل صورة التمرين أو النص المراد تصحيحه.", "bad_request");
    }

    const router = getRouter();

    // 1. إذا أُرسلت صورة (مع أو بدون نص OCR أولي): نحاول قراءتها بنموذج الرؤية (Vision AI) أولاً
    if (body.image) {
      const userPrompt = body.rawOcrText?.trim()
        ? `اقرأ نص التمرين والمعادلات من الصورة المرفقة بدقة. (ملاحظة مساعدة: استخرج الـ OCR التقليدي النص التالي وقد يكون فيه أخطاء، اعتمد على الصورة أولاً لتصحيحه واستخراج النص الكامل للتمرين فقط دون حله):\n\n${body.rawOcrText.trim()}`
        : "استخرج نص التمرين والمعادلات من هذه الصورة بدقة ووضوح دون حل التمرين.";

      try {
        const res = await router.run({
          task: "text",
          userId: user?.id ?? null,
          request: {
            system: VISION_OCR_SYSTEM,
            messages: [{ role: "user", content: userPrompt }],
            images: [body.image],
            maxTokens: 1200,
            temperature: 0.1,
          },
        });

        if (res.imageUsed) {
          return ok({
            mode: "vision" as const,
            text: cleanExtractedText(res.text),
            provider: { name: res.provider.name, model: res.provider.model, isLocal: res.provider.isLocal },
          });
        }

        // إذا لم يتوفر مزود رؤية وكان لدينا نص OCR أولي، نعيد النص المصحح من المزود النصي
        if (body.rawOcrText?.trim()) {
          return ok({
            mode: "ai_refined" as const,
            text: cleanExtractedText(res.text),
            provider: { name: res.provider.name, model: res.provider.model, isLocal: res.provider.isLocal },
          });
        }

        return ok({
          mode: "needs_local_ocr" as const,
          text: "",
        });
      } catch (e) {
        if (e instanceof NoProviderAvailableError) {
          throw new ApiError(503, "لا يتوفر مزود ذكاء اصطناعي حالياً لقراءة الصورة. استعمل الاستخراج المحلي (Tesseract).", "no_provider");
        }
        throw e;
      }
    }

    // 2. تصحيح نص OCR عبر الذكاء الاصطناعي النصي (حتى بدون نموذج رؤية)
    try {
      const res = await router.run({
        task: "text",
        userId: user?.id ?? null,
        request: {
          system: REFINE_OCR_SYSTEM,
          messages: [
            {
              role: "user",
              content: `صحّح ورتّب نص التمرين التالي المستخرج عبر OCR دون حله:\n\n${body.rawOcrText!.trim()}`,
            },
          ],
          maxTokens: 1000,
          temperature: 0.2,
        },
      });

      return ok({
        mode: "ai_refined" as const,
        text: cleanExtractedText(res.text),
        provider: { name: res.provider.name, model: res.provider.model, isLocal: res.provider.isLocal },
      });
    } catch (e) {
      if (e instanceof NoProviderAvailableError) {
        throw new ApiError(503, "لا يتوفر مزود ذكاء اصطناعي حالياً لتصحيح النص.", "no_provider");
      }
      throw e;
    }
  });
}
