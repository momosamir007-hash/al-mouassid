/* Service Worker – المساعد AL MOUASSID
 * - تخزين مسبق لصفحات الواجهة وملفاتها الثابتة لتعمل دون اتصال.
 * - لا تُخزَّن طلبات /api أبداً (بيانات حساسة/متغيرة).
 * - التنقل: الشبكة أولاً ثم النسخة المخزنة ثم صفحة /offline.
 */
const VERSION = "v1";
const CACHE = `mouassid-${VERSION}`;
const PAGES = ["/", "/new", "/capture", "/solve", "/history", "/library", "/settings", "/status", "/login", "/register", "/offline"];
const STATIC = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(STATIC).catch(() => {});
  for (const url of PAGES) {
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) continue;
      const copy = res.clone();
      await cache.put(url, copy);
      // نلتقط ملفات _next/static المذكورة في الصفحة لتعمل الصفحة دون اتصال
      const html = await res.text();
      const assets = new Set(html.match(/\/_next\/static\/[^"'\\) ]+/g) || []);
      for (const a of assets) {
        if (!(await cache.match(a))) {
          try { const r = await fetch(a); if (r.ok) await cache.put(a, r); } catch (_) {}
        }
      }
    } catch (_) { /* نكمل */ }
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("mouassid-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // لا تخزين للـ API

  // ملفات ثابتة: الكاش أولاً
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // تنقل صفحات و RSC: الشبكة أولاً ثم الكاش
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (req.mode === "navigate" || req.headers.get("RSC"))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(async () => {
      const cache = await caches.open(CACHE);
      const hit = (await cache.match(req)) || (await cache.match(url.pathname, { ignoreSearch: true }));
      if (hit) return hit;
      if (req.mode === "navigate") return (await cache.match("/offline")) || Response.error();
      return Response.error();
    })
  );
});
