/* 여행 기록장 · 서비스워커
   - 앱 셸(HTML/CSS/JS/아이콘/지도 JSON)은 오프라인에서도 열리도록 캐시
   - 폰트·supabase-js CDN은 런타임 캐시(stale-while-revalidate)
   - Supabase API(인증·데이터)는 항상 네트워크로 통과시킴 (캐시 안 함) */

const VERSION = 'v1';
const SHELL_CACHE = `travel-log-shell-${VERSION}`;
const RUNTIME_CACHE = `travel-log-runtime-${VERSION}`;

const SHELL_ASSETS = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'favicon.svg',
  'favicon.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'data/kr-map.json',
  'data/world-map.json',
  'data/world-outlines.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// 페이지에서 즉시 갱신을 원하면 postMessage({type:'SKIP_WAITING'})
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isSupabase(url) {
  return url.hostname.endsWith('.supabase.co');
}
function isFontStylesheet(url) {
  return url.hostname === 'fonts.googleapis.com';
}
function isFontFile(url) {
  return url.hostname === 'fonts.gstatic.com';
}
function isCdnScript(url) {
  return url.hostname === 'cdn.jsdelivr.net';
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || network || fetch(request);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstDocument(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put('index.html', response.clone());
    return response;
  } catch (err) {
    return (await cache.match(request)) ||
           (await cache.match('index.html')) ||
           (await cache.match('./'));
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 인증·데이터는 건드리지 않는다 (오프라인이면 앱이 자체 오류 처리)
  if (isSupabase(url)) return;

  // 페이지 이동: 네트워크 우선, 실패 시 캐시된 셸
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  if (isFontStylesheet(url) || isCdnScript(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  if (isFontFile(url)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // 그 외는 기본 동작
});
