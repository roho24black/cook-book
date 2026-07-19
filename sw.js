const CACHE_NAME = 'cookbook-v13';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './recipes-seed.js',
  './recipes-seed-v2.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/main.js',
  './js/firebase-init.js',
  './js/constants.js',
  './js/utils.js',
  './js/store.js',
  './js/seed.js',
  './js/render-list.js',
  './js/detail.js',
  './js/form.js',
  './js/cooking-mode.js',
  './js/shopping-list.js',
  './js/gallery-reviews-feed.js',
  './js/bottom-nav.js',
  './js/import-recipe.js',
  './js/admin-auth.js',
  './js/admin-config.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache Firestore/Firebase network calls — always go to network for those
  if (url.origin.includes('googleapis.com') || url.origin.includes('firebaseio.com') || url.origin.includes('gstatic.com')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
