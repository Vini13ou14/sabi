'use strict';

/*
 * Estratégia: rede primeiro, cache como reserva.
 * Online, sempre vem a versão mais recente dos arquivos (HTML, JS e CSS andam juntos).
 * Offline, usa a última cópia guardada. Não é mais necessário subir a versão do cache
 * a cada alteração; mude CACHE apenas se quiser descartar tudo o que foi guardado.
 */
const CACHE = 'sabi-v22';
const APP_ASSETS = [
  '/',
  '/index.html',
  '/pages/ficha.html',
  '/pages/mesa.html',
  '/pages/sala.html',
  '/pages/sistema.html',
  '/pages/loja.html',
  '/css/style.css',
  '/js/fichas.js',
  '/js/loja.js',
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
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('sabi-') && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const navegacao = request.mode === 'navigate';
  // Páginas são guardadas só pelo caminho, para que sala.html?id=... não gere uma cópia por mesa.
  const chave = navegacao ? url.pathname : request;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(chave, response.clone()).catch(() => {});
      return response;
    } catch (error) {
      const guardado = await cache.match(chave) ||
        (navegacao ? await cache.match('/index.html') : undefined);
      if (guardado) return guardado;
      throw error;
    }
  })());
});
