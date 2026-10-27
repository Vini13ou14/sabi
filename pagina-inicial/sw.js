'use strict';

const STATIC_CACHE = 'sabi-static-v7';
const PAGE_CACHE = 'sabi-pages-v7';
const APP_ASSETS = [
  '/',
  '/index.html',
  '/pages/ficha.html',
  '/pages/mesa.html',
  '/pages/sala.html',
  '/pages/sistema.html',
  '/pages/tutorial.html',
  '/css/style.css',
  '/js/mesa.js',
  '/js/regras.js',
  '/js/sala.js',
  '/js/script.js',
  '/img/Capturar.PNG',
  '/img/app-icon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('sabi-') && key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(PAGE_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) ||
          (await caches.match(url.pathname)) ||
          (await caches.match('/index.html'));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
