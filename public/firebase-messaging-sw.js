
// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// 3️⃣ Firebase Cloud Messaging Service Worker
firebase.initializeApp({
    apiKey: "AIzaSyD5RkJAXUvuBAbuug9C1cU0PGNUMjbaGc8",
    authDomain: "mst-ap.firebaseapp.com",
    databaseURL: "https://mst-ap-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "mst-ap",
    storageBucket: "mst-ap.firebasestorage.app",
    messagingSenderId: "708181032604",
    appId: "1:708181032604:web:4613ca54f8fd5c2805f759",
});

const messaging = firebase.messaging();

// 4️⃣ Background/Lock-screen notification handler
messaging.onBackgroundMessage((payload) => {
    console.log('[sw] Background Message:', payload);

    // Customization as per 6️⃣
    const notificationTitle = payload.notification.title || 'Nová zpráva';
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon-192.svg',
        badge: '/icon-192.svg',
        tag: payload.data.channelId || 'chat', // Group notifications by channel
        data: {
            channelId: payload.data.channelId
        }
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 3️⃣ Click listener - navigate to /chat/{channelId}
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const channelId = event.notification.data.channelId;

    const promiseChain = clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    }).then((windowClients) => {
        // If a window is already open, navigate it
        for (let i = 0; i < windowClients.length; i++) {
            const client = windowClients[i];
            if (client.url.includes('/#/chat') && 'focus' in client) {
                return client.focus().then(c => c.navigate(`/#/chat?channelId=${channelId}`));
            }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
            return clients.openWindow(`/#/chat?channelId=${channelId}`);
        }
    });

    event.waitUntil(promiseChain);
});
