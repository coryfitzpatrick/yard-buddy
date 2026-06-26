// Minimal service worker.
//
// Chrome requires a service worker with a fetch handler before it will fire
// `beforeinstallprompt`. We don't do any caching here on purpose — the goal
// is solely to make the PWA installable, not to add offline behavior (which
// would require thinking through cache invalidation around our auth flows,
// schedule writes, and Stripe callbacks). If/when we want offline support,
// upgrade to a real strategy (e.g. workbox) instead of layering it on this.

self.addEventListener("install", (event) => {
  // Activate immediately on first install so we don't sit in waiting state.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // No-op passthrough. Chrome only needs the listener to exist, not to do work.
  event.respondWith(fetch(event.request));
});
