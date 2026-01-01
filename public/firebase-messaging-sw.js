// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the
// messagingSenderId.
firebase.initializeApp({
    apiKey: "AIzaSyD5RkJAXUvuBAbuug9C1cU0PGNUMjbaGc8",
    authDomain: "mst-ap.firebaseapp.com",
    databaseURL: "https://mst-ap-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "mst-ap",
    storageBucket: "mst-ap.firebasestorage.app",
    messagingSenderId: "708181032604",
    appId: "1:708181032604:web:4613ca54f8fd5c2805f759",
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // Customize notification here
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: payload.notification.icon || '/icon-192.svg',
        badge: '/icon-192.svg' // Add badge
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
