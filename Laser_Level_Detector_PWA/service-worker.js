const CACHE = 'laser-detector-v1';
const FILES = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json'];

self.addEventListener('install', evt => {
  evt.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', evt => { evt.waitUntil(clients.claim()); });

self.addEventListener('fetch', evt => {
  if (evt.request.method !== 'GET') return;
  evt.respondWith(caches.match(evt.request).then(resp => resp || fetch(evt.request)));
});