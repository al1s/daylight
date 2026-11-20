'use strict';
const CACHE = 'daylight-notebook-v1';
const FILES = ['./', './index.html', './app.css', './app.js', './diary-core.js', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
const PATHS = new Set(FILES.map(function (path) { return new URL(path, self.location.href).pathname; }));
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key.startsWith('daylight-notebook-') && key !== CACHE; }).map(function (key) { return caches.delete(key); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !PATHS.has(url.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(function (response) {
      if (response.ok && !response.redirected && (response.headers.get('content-type') || '').includes('text/html')) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.put('./index.html', copy); }));
      }
      return response;
    }).catch(function () { return caches.match('./index.html').then(function (cached) { return cached || Response.error(); }); }));
  } else {
    event.respondWith(caches.match(event.request).then(function (cached) { return cached || fetch(event.request); }));
  }
});
