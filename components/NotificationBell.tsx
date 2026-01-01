
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { firebaseService } from '../services/firebaseService';

const NotificationBell: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [unreadCount, setUnreadCount] = useState(0);
    const [lastUnread, setLastUnread] = useState<any>(null);

    useEffect(() => {
        if (!currentUser?.workerId || !firebaseService.isReady) return;

        const path = `unread/${currentUser.workerId}`;
        const unsubscribe = firebaseService.subscribe(path, (data) => {
            if (data) {
                const channels = Object.keys(data);
                setUnreadCount(channels.length);

                // Get the most recent unread message to show a small hint if needed
                const mostRecent = Object.values(data).sort((a: any, b: any) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                )[0];
                setLastUnread(mostRecent);
            } else {
                setUnreadCount(0);
                setLastUnread(null);
            }
        });

        return () => unsubscribe();
    }, [currentUser?.workerId, firebaseService.isReady]);

    if (unreadCount === 0) {
        return (
            <button
                onClick={() => navigate('/chat')}
                className={`relative p-3 text-slate-500 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${className}`}
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            </button>
        );
    }

    return (
        <button
            onClick={() => navigate('/chat')}
            className={`relative p-3 group transition-all active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center ${className}`}
        >
            <div className="absolute top-1 right-1 z-10 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg border-2 border-[#1a1d37] group-hover:scale-125 transition-transform animate-bounce">
                {unreadCount}
            </div>

            <svg className="w-6 h-6 text-indigo-400 group-hover:text-white transition-colors animate-swing" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>

            {/* Subtle popover hint on desktop */}
            {lastUnread && (
                <div key="unread-hint" className="hidden md:block absolute top-14 right-0 w-64 p-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all pointer-events-none text-left">
                    <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1">Nová zpráva od {lastUnread.senderName}</p>
                    <p className="text-xs text-white font-bold truncate opacity-90">{lastUnread.text}</p>
                </div>
            )}
        </button>
    );
};

export default NotificationBell;
