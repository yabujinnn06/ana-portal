const CACHE = "rw-shell-v3";

function getScopePath() {
  try {
    const scopeUrl = new URL(self.registration.scope);
    return scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
  } catch {
    return "/depo/";
  }
}

self.addEventListener("install", (e) => {
  const base = getScopePath();
  const shell = [base, `${base}index.html`, `${base}manifest.webmanifest`, `${base}icon.svg`];
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(shell)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws") || url.pathname.includes("/api/ws/")) return;
  if (url.origin !== self.location.origin) return;

  const base = getScopePath();
  e.respondWith(
    fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => { try { c.put(req, copy); } catch {} });
      return resp;
    }).catch(() => caches.match(req).then(r => r || caches.match(`${base}index.html`)))
  );
});
