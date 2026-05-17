// Service Worker for Web Push notifications
// Place this file at: public/sw.js

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: "Intent Swap", body: event.data.text() }; }

  const { title = "Intent Swap", body = "", url = "https://intent-swap-phi.vercel.app" } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      requireInteraction: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "https://intent-swap-phi.vercel.app";
  event.waitUntil(clients.openWindow(url));
});
