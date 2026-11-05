/* Generated after the production build. Browser data lives separately in IndexedDB. */
const BUILD_VERSION = __BUILD_VERSION__
const BASE_PATH = __BASE_PATH__
const PRECACHE_PATHS = __PRECACHE_URLS__
const SCOPE = new URL(self.registration.scope)
const CACHE_PREFIX = `training-log-pwa:${encodeURIComponent(SCOPE.href)}:`
const CACHE_NAME = CACHE_PREFIX + BUILD_VERSION
const PRECACHE_URLS = PRECACHE_PATHS.map((path) => new URL(path, self.location.origin).href)
const KNOWN_ASSETS = new Set(PRECACHE_URLS)
const INDEX_URL = new URL(`${BASE_PATH}index.html`, self.location.origin).href

self.addEventListener('install', (event) => {
  // Do not activate over an open workout. The UI offers an explicit update action.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))),
      ),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)
        return (await cache.match(INDEX_URL)) || fetch(event.request)
      })(),
    )
  } else if (KNOWN_ASSETS.has(url.href)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)
        return (await cache.match(url.href)) || fetch(event.request)
      })(),
    )
  }
  // Requests outside the generated asset list (including APIs) use the network.
})
