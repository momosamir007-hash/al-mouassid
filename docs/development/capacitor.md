# دراسة Android عبر Capacitor (لم تُنفَّذ)

لا يُنصح بالبدء قبل استقرار نسخة الويب. الخيارات:

1. **Capacitor يحمّل الموقع المنشور** (`server.url` يشير إلى نطاق HTTPS): الأسهل، ويحافظ على Next.js والـ API كما هي، لكنه يتطلب اتصالاً وWebView يحمّل الصفحات (Service Worker يعمل داخل WebView حديث).
2. **تصدير ثابت** (`output: "export"`) داخل الحزمة: يلزم نقل الـ API إلى خادم منفصل وتحويل كل الاستدعاءات إلى عنوان مطلق + CORS/ملفات تعريف ارتباط عبر النطاقات (أو رموز Bearer بدل الكوكي). أكبر جهداً لكنه يعمل دون اتصال بالواجهة.

الإضافات المقترحة: `@capacitor/camera` (التقاط أفضل من `input capture`)، `@capacitor/network`، `@capacitor/preferences`. الخطوات: `npm i @capacitor/core @capacitor/cli @capacitor/android && npx cap init && npx cap add android`.
عند اعتماد الخيار 2 يجب استبدال كوكي الجلسة برمز Authorization وتخزينه في `Preferences`.
