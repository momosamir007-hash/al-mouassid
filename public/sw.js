/* Service Worker – المساعد AL MOUASSID
 * نخزن الملفات الثابتة وصفحة عدم الاتصال فقط. لا نخزن HTML أو RSC أو صفحات الحساب.
 */
const VERSION = "v2";
const CACHE = `mouassid-${VERSION}`;
const STATIC = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(STATIC).catch(() => {});
  try {
    const offline = await fetch("/offline", { cache: "no-store", credentials: "omit" });
    if (offline.ok && !offline.headers.has("set-cookie")) await cache.put("/offline", offline);
  } catch (_) {}
}
self.addEventListener("install", event => event.waitUntil(precache().then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("mouassid-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || req.headers.has("RSC") || req.headers.has("next-router-state-tree")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) caches.open(CACHE).then(cache => cache.put(req, res.clone()));
      return res;
    })));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match("/offline")) || Response.error()));
  }
});
