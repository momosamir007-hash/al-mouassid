# نظرة معمارية

## الخريطة

```
src/
  app/                      واجهة Next.js (الصفحات) + مسارات REST في app/api
  components/               مكونات React (عرض فقط، بلا منطق تعليمي)
  lib/                      كود نقي مشترك: constants, arith (حساب آمن), clarity (وضوح التمرين)
  lib/client/               خدمات المتصفح: api, exerciseStore (محلي+مزامنة), image, ocr, capabilities
  server/
    ai/                     AI PROVIDER MANAGER + AI ROUTER
      providers/            محوّلات: openai-compatible, gemini, anthropic, ollama
      router.ts             الاختيار والتحويل التلقائي
      store.ts, status.ts   حفظ الحالة والاستهلاك في PostgreSQL
      secrets.ts            تشفير المفاتيح
    learning/               PROGRESSIVE LEARNING ENGINE (actions, levels, prompts, engine, privacy)
    conversation/           إدارة المحادثة وحفظ السياق
    auth/                   كلمات المرور (scrypt) والجلسات
    utils/                  api, logger, ratelimit
  db/schema.ts              مخطط Drizzle
tests/                      اختبارات vitest
public/                     manifest, sw.js, icons
```

## الفصل بين الطبقات (شرط المواصفة)

| الطبقة | الملفات | تعتمد على |
|---|---|---|
| منطق التعليم | `server/learning/*`, `lib/arith.ts`, `lib/clarity.ts` | لا شيء (يستقبل `AiRouter` كمعامل) |
| إدارة المحادثة | `server/conversation/*` | قاعدة البيانات |
| الاتصال بالمزودين | `server/ai/*` | لا يعرف شيئاً عن التعليم |
| عرض الإجابة | `components/*`, `app/*` | تستدعي API فقط؛ **لا تعليمات تعليمية داخل React** |

تعليمات الأزرار والمستويات والمواد موجودة حصراً في `server/learning/actions.ts` و`levels.ts` و`prompts.ts`.
واجهة React لا تعرف سوى تسميات الأزرار.

## قواعد المنتج المطبَّقة في الكود

- الزر غير «الحل الكامل» يضيف إلى التعليمات: «ممنوع منعاً باتاً كشف الحل النهائي» (مُختبر).
- التمرين غير الواضح يُرفض في الواجهة وفي الخادم قبل أي استدعاء (`lib/clarity.ts`).
- نص التمرين وإجابة المتعلم تُعامل كبيانات لا كأوامر (حماية من حقن التعليمات)، ويُحذف البريد/الهاتف منها قبل الإرسال.
- التحقق الحسابي الحتمي (`lib/arith.ts`) يُمرَّر للنموذج كحقيقة مؤكدة، ويعمل وحده عند غياب أي مزود، وفي المتصفح دون اتصال. لا `eval`.
- عند تعذر كل المزودين: رسالة صريحة 503 بلا إجابة مخترعة.

## الأمان

- المفاتيح: إما اسم متغير بيئة (الأفضل) أو AES-256-GCM في القاعدة بمفتاح `APP_SECRET`؛ لا تُرجَع من أي API (فقط المصدر وآخر 4 أحرف)، وتُحذف من رسائل الأخطاء (`redactSecret`).
- كلمات المرور: scrypt مع ملح. الجلسات: رمز عشوائي، يُخزَّن hash فقط، كوكي `HttpOnly; SameSite=Lax` (و`Secure` خلف HTTPS).
- CSRF: `SameSite=Lax` + اشتراط `application/json` في كل الطلبات المعدِّلة.
- تحديد المعدل: تسجيل/دخول/مساعدة (في الذاكرة؛ يحتاج Redis عند تشغيل أكثر من نسخة).
- الصلاحيات: `requireUser` / `requireAdmin` على كل مسار حساس.
- السجلات: أخطاء تقنية فقط دون نصوص التمارين أو الأسرار.
- صور التمارين: لا تُخزَّن؛ تُعالج في المتصفح وتُرسل مع الطلب فقط بموافقة المستخدم.

## الجداول

`users, sessions, subjects, ai_providers, ai_usage, exercises, help_messages` (انظر `src/db/schema.ts`).
