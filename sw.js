// Relay service worker: lets the installed app start and run without a network.
// Pages: network first, cached shell as fallback. Assets: cache first (Vite file names are content-hashed).
// Bump VERSION to drop old caches after a release.
const VERSION = 'relay-v3'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon.png',
  './fonts/archivo.woff2', './fonts/instrument-sans.woff2', './fonts/jetbrains-mono.woff2']

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION)
    await cache.addAll(SHELL)
    // Pre-cache the hashed JS/CSS the shell references, so the very first install already works offline.
    const html = await (await fetch('./index.html', { cache: 'no-store' })).text()
    const assets = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(m => m[1])
    await cache.addAll(assets)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return // e.g. AI API calls go straight to the network
  if (url.pathname.includes('/media/')) return // background video uses range requests; let the browser handle it

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      caches.open(VERSION).then(c => c.put('./index.html', res.clone()))
      return res
    }).catch(() => caches.match('./index.html')))
    return
  }

  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)) }
    return res
  })))
})
