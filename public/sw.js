const CACHE_NAME = 'ops-sigap-shell-v1-2';
const CORE_URLS = ['/', '/manifest.json', '/icon.svg'];

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);

  for (const url of CORE_URLS) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (response.ok) {
        await cache.put(url, response.clone());
      }
    } catch {
      // Best effort. Runtime requests can still populate the cache later.
    }
  }

  try {
    const response = await fetch('/', { cache: 'no-cache' });
    if (!response.ok) return;

    const html = await response.clone().text();
    await cache.put('/', response);

    const assetUrls = new Set();
    const matcher = /(?:src|href)=["']([^"'#]+)["']/g;
    let match;

    while ((match = matcher.exec(html)) !== null) {
      try {
        const url = new URL(match[1], self.location.origin);
        if (
          url.origin === self.location.origin
          && !url.pathname.startsWith('/api/')
          && !url.pathname.startsWith('/api')
        ) {
          assetUrls.add(url.pathname + url.search);
        }
      } catch {
        // Ignore malformed or unsupported asset references.
      }
    }

    await Promise.allSettled(
      [...assetUrls].map(async (url) => {
        try {
          const assetResponse = await fetch(url, { cache: 'no-cache' });
          if (assetResponse.ok) {
            await cache.put(url, assetResponse);
          }
        } catch {
          // Best effort.
        }
      }),
    );
  } catch {
    // Shell fetch can fail during a flaky install. A later update can retry.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheApplicationShell().then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('ops-sigap-shell-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache or intercept authenticated/dynamic APIs.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/', response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('/')) || Response.error();
        }),
    );
    return;
  }

  const cacheableDestination = ['script', 'style', 'font', 'image', 'manifest', 'worker'].includes(request.destination);
  const looksLikeAsset = url.pathname.startsWith('/assets/');
  if (!cacheableDestination && !looksLikeAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      });
    }),
  );
});
