/**
 * Reiseplaner Service Worker
 *
 * Strategie:
 *   - Eigene Dateien (HTML, JSON, Icons): Cache-First, fällt auf Netzwerk zurück
 *   - Externe Bibliotheken (Leaflet, Tiles, etc.): Network-First, fällt auf Cache zurück
 *
 * So funktioniert die App offline (für Daten-Eingabe), und Karten werden im
 * Hintergrund aktuell gehalten wenn Internet da ist.
 */

const CACHE_VERSION = 'reiseplaner-v2';

// Eigene Dateien die immer gecached werden sollen
const APP_FILES = [
  './',
  './reiseplanung.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

// Bei Installation: alle App-Dateien laden und cachen
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(APP_FILES).catch(err => {
        console.warn('Some files could not be cached:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Bei Aktivierung: alte Cache-Versionen löschen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Bei jedem Request: entscheiden ob Cache oder Netzwerk
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Nur GET-Requests cachen
  if (event.request.method !== 'GET') return;

  // Eigener App-Origin? → Cache-First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          // Erfolgreiche Responses zusätzlich cachen
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(c => c.put(event.request, copy));
          }
          return response;
        });
      }).catch(() => caches.match('./reiseplanung.html'))
    );
    return;
  }

  // Externe Ressourcen (Leaflet, Tiles, Nominatim, OSRM): Network-First
  event.respondWith(
    fetch(event.request).then(response => {
      // Tiles und Bibliotheken cachen wenn sie geladen werden
      if (response.ok && (
        url.hostname.includes('basemaps.cartocdn.com') ||
        url.hostname.includes('unpkg.com') ||
        url.hostname.includes('cdnjs.cloudflare.com')
      )) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(c => c.put(event.request, copy));
      }
      return response;
    }).catch(() => {
      // Wenn Netzwerk versagt: aus Cache holen
      return caches.match(event.request);
    })
  );
});
