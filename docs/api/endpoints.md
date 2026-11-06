# واجهة REST

كل الردود JSON. الأخطاء: `{ "error": "رسالة عربية", "code": "…" }`. الطلبات المعدِّلة تتطلب `Content-Type: application/json`.

| المسار | الطريقة | الصلاحية | الوظيفة |
|---|---|---|---|
| `/api/health` | GET | عام | فحص القاعدة |
| `/api/status` | GET | عام | حالة القاعدة والمزودين (بلا أسرار/أخطاء داخلية)؛ المحلي يُفحص حياً |
| `/api/subjects` | GET | عام | المواد المفعّلة (تُبذَر عند الفراغ) |
| `/api/auth/register` `login` `logout` | POST | عام/جلسة | حسابات؛ أول مستخدم = مدير |
| `/api/auth/me` | GET / PATCH / DELETE | جلسة | الملف الشخصي؛ الحذف يتطلب كلمة المرور |
| `/api/help` | POST | جلسة | طلب مساعدة (أحد الأزرار السبعة) |
| `/api/exercises` | GET / DELETE | جلسة | سجل المستخدم / حذف الكل |
| `/api/exercises/sync` | POST | جلسة | مزامنة ثنائية الاتجاه |
| `/api/admin/providers` | GET / POST | مدير | قائمة (مع الاستهلاك والأخطاء) / إضافة |
| `/api/admin/providers/:id` | PATCH / DELETE | مدير | تعديل/حذف (يُرفع الإيقاف المؤقت) |
| `/api/admin/providers/:id/test` | POST | مدير | اختبار اتصال حقيقي (طلب صغير جداً) |
| `/api/admin/router-test` | POST | مدير | تجربة الموجّه كاملاً مع قائمة المحاولات |
| `/api/admin/subjects` `/:id` | GET POST PATCH DELETE | مدير | إدارة المواد |

## `POST /api/help`
```json
{ "clientId": "uuid", "level": "primary|middle|secondary|university", "subject": "math",
  "exerciseText": "احسب 12 + 7 × 3",
  "action": "hint_1|hint_2|first_step|next_step|explain_other|check_answer|full_solution",
  "studentAnswer": "اختياري (مطلوب لـ check_answer)",
  "image": { "mime": "image/jpeg", "data": "base64" } }
```
نجاح: `{ userMessage, message{content, provider{name,isLocal,model}}, source: "ai"|"local", imageRequested, imageUsed, fallbacks[] }`.
أخطاء: `401 unauthenticated` · `400 needs_answer` · `422 unclear` (+`reasons`) · `429 rate_limited` · `503 no_provider` (+`attempts`).
الصورة لا تُخزَّن: تُمرَّر للمزود في هذا الطلب فقط.
