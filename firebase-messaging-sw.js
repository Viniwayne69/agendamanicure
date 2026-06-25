importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBnNYXIbX5DT9vJrTiwMmxPbwxKtRM7P8c",
  authDomain: "calendariomanicure-f7bd1.firebaseapp.com",
  projectId: "calendariomanicure-f7bd1",
  storageBucket: "calendariomanicure-f7bd1.firebasestorage.app",
  messagingSenderId: "898498392786",
  appId: "1:898498392786:web:83df8982154b1e45cd730b"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || "Novo agendamento";
  const options = {
    body: payload.notification?.body || "Uma nova reserva chegou na agenda.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: {
      url: payload.fcmOptions?.link || "/"
    }
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
