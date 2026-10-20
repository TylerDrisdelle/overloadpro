// Offline support for the home-screen app. Caches only the app's own files;
// workout data lives in localStorage and is never touched here.
const VERSION = 'ovp-2026-10-20-1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './app-icon.png', './favicon.svg'];

async function precache() {
  const cache = await caches.open(VERSION);
  await cache.addAll(SHELL);
  // Hashed bundles referenced by index.html, plus the fonts their CSS loads.
  const html = await (await fetch('./index.html', {cache: 'no-store'})).text();
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(m => new URL(m[1], self.registration.scope).href);
  const fonts = [];
  for (const css of assets.filter(a => a.endsWith('.css'))) {
    const text = await (await fetch(css)).text();
    for (const m of text.matchAll(/url\(([^)]+)\)/g)) fonts.push(new URL(m[1].replace(/["']/g, ''), css).href);
  }
  // Skip inlined data: fonts and anything off-site; addAll rejects them and would abort the install.
  const own = [...new Set([...assets, ...fonts])].filter(u => new URL(u).origin === self.location.origin);
  await cache.addAll(own);
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ovp-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Network first so new deploys show up; cached shell when offline.
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      if (response.ok) caches.open(VERSION).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(async () => (await caches.match('./index.html')) ?? (await caches.match('./'))));
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit ?? fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(request, copy)); }
    return response;
  })));
});
