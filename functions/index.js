
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * 1️⃣ Real-time Chat Push Notifications (Firestore Trigger)
 * Triggered when a new message is created in any channel.
 */
exports.onMessageCreate = functions.firestore
    .document('channels/{channelId}/messages/{messageId}')
    .onCreate(async (snapshot, context) => {
        const message = snapshot.data();
        const { channelId, messageId } = context.params;

        if (!message || message.senderId === -1) return null; // Ignore system messages

        // 6️⃣ Notification payload construction
        const payload = {
            notification: {
                title: message.senderName || 'Nová zpráva',
                body: message.text.length > 35 ? message.text.substring(0, 32) + '...' : message.text,
                icon: 'https://mst-ap.web.app/icon-192.svg', // Use absolute URL for absolute reliability
                badge: '1', // Incrementing is complex, setting to 1 as a signal
            },
            data: {
                channelId: channelId,
                messageId: messageId,
                clickAction: `/chat/${channelId}` // 3️⃣ Custom data for routing
            },
            android: {
                notification: {
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK', // Legacy but sometimes helps
                    sound: 'default'
                }
            },
            apns: {
                payload: {
                    aps: {
                        badge: 1,
                        sound: 'default',
                        'mutable-content': 1 // Enable service worker manipulation
                    }
                }
            }
        };

        const tokens = [];

        // Fetch all workers to find targets and check "mute" status
        // Note: For production, you'd store tokens in a separate collection or use groups
        const workersSnap = await admin.firestore().collection('workers').get();
        const allWorkers = workersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (channelId === 'general') {
            // Global channel - send to everyone except sender
            allWorkers.forEach(w => {
                if (String(w.id) !== String(message.senderId) && w.fcmToken && !w.muteNotifications) {
                    tokens.push(w.fcmToken);
                }
            });
        } else if (channelId.startsWith('project_')) {
            // Project channel - send to project members
            const projectId = channelId.replace('project_', '');
            const projectSnap = await admin.firestore().collection('projects').doc(projectId).get();
            const project = projectSnap.data();
            const memberIds = project?.workerIds || [];

            allWorkers.forEach(w => {
                if (memberIds.includes(Number(w.id)) && String(w.id) !== String(message.senderId) && w.fcmToken && !w.muteNotifications) {
                    tokens.push(w.fcmToken);
                }
            });
        } else if (channelId.startsWith('dm_')) {
            // Private message (dm_ID1_ID2)
            const ids = channelId.split('_').slice(1);
            const targetId = ids.find(id => String(id) !== String(message.senderId));

            const targetWorker = allWorkers.find(w => String(w.id) === String(targetId));
            if (targetWorker && targetWorker.fcmToken && !targetWorker.muteNotifications) {
                tokens.push(targetWorker.fcmToken);
                payload.notification.title = `Zpráva od: ${message.senderName}`;
            }
        }

        if (tokens.length > 0) {
            try {
                // Remove duplicates
                const uniqueTokens = [...new Set(tokens)];

                const fcmMessages = uniqueTokens.map(token => ({
                    token: token,
                    notification: payload.notification,
                    data: payload.data,
                    apns: payload.apns
                }));

                const response = await admin.messaging().sendEach(fcmMessages);
                console.log(`✅ Push Sent: ${response.successCount} success / ${response.failureCount} failure. Channel: ${channelId}`);

                // --- Update Unread Badge in RTDB (for UI sync) ---
                const unreadUpdates = {};
                uniqueTokens.forEach(token => {
                    const w = allWorkers.find(worker => worker.fcmToken === token);
                    if (w) {
                        unreadUpdates[`unread/${w.id}/${channelId}`] = {
                            text: message.text,
                            senderName: message.senderName,
                            timestamp: admin.database.ServerValue.TIMESTAMP
                        };
                    }
                });

                if (Object.keys(unreadUpdates).length > 0) {
                    await admin.database().ref().update(unreadUpdates);
                }

            } catch (error) {
                console.error('❌ FCM Error:', error);
            }
        }

        return null;
    });

/**
 * Cleanup function for old typing statuses (RTDB)
 */
exports.cleanupTyping = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    const cutoff = Date.now() - (5 * 60 * 1000); // 5 min
    const chatRef = admin.database().ref('chat');
    const snapshot = await chatRef.once('value');
    const channels = snapshot.val();

    if (!channels) return null;

    for (const channelId in channels) {
        if (channels[channelId].typing) {
            const typing = channels[channelId].typing;
            for (const userId in typing) {
                if (typing[userId].timestamp < cutoff) {
                    await chatRef.child(`${channelId}/typing/${userId}`).remove();
                }
            }
        }
    }
    return null;
});
