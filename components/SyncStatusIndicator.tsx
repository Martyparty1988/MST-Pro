
import React, { useState, useEffect } from 'react';
import { firebaseService } from '../services/firebaseService';

const SyncStatusIndicator: React.FC = () => {
    const [status, setStatus] = useState({ online: firebaseService.isOnline, pending: firebaseService.pendingOps });

    useEffect(() => {
        const unsubscribe = firebaseService.onStatusChange((online, pending) => {
            setStatus({ online, pending });
        });
        return () => { unsubscribe(); };
    }, []);

    return (
        <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl transition-all">
            {/* Status Dot */}
            <div className="relative">
                <div className={`w-3 h-3 rounded-full ${status.online ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`} />
                {status.online && <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-20" />}
            </div>

            {/* Label */}
            <div className="flex flex-col">
                <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none mb-0.5">
                    {status.online ? 'Online' : 'Offline'}
                </span>
                {status.pending > 0 && (
                    <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-tighter animate-pulse">
                        Synchronizace: {status.pending}
                    </span>
                )}
            </div>

            {/* Icon indicating sync */}
            {status.pending > 0 && (
                <svg className="w-4 h-4 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            )}
        </div>
    );
};

export default SyncStatusIndicator;
