// public/sw.js (그리고 public/service-worker.js)
self.addEventListener('install', (e) => {
  self.skipWaiting(); // 대기 중인 새 워커가 즉시 활성화되도록 함
});

self.addEventListener('activate', (e) => {
  self.registration.unregister()
    .then(() => self.clients.matchAll())
    .then((clients) => {
      clients.forEach((client) => client.navigate(client.url)); // 페이지 강제 새로고침
    });
});