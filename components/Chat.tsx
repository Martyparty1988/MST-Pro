import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { firebaseService } from '../services/firebaseService';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { ChatMessage, Worker, Project } from '../types';
import { soundService } from '../services/soundService';

const notifyUser = (message: ChatMessage, showToast: (msg: string, type?: any) => void, t: any) => {
    soundService.playMessageReceived();
    if (navigator.vibrate) navigator.vibrate(200);
    const name = message.senderName || 'Systém';
    showToast(t('new_message_from', { name }).replace('{name}', name), 'info');

    // Increment badge
    if ('setAppBadge' in navigator) {
        (navigator as any).setAppBadge().catch(() => { });
    }

    if (Notification.permission === 'granted' && document.hidden) {
        new Notification(`${message.senderName}`, {
            body: message.text,
            icon: '/icon-192.svg',
            tag: 'chat-msg'
        } as any);
    }
};

const Chat: React.FC = () => {
    const { user, currentUser } = useAuth();
    const { t, language } = useI18n();
    const { showToast } = useToast();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isSending, setIsSending] = useState(false);
    const [typingUsers, setTypingUsers] = useState<string[]>([]);
    const [seenStatus, setSeenStatus] = useState<Record<string, string>>({});
    const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Mobile-specific state: 'list' shows channels, 'chat' shows message window
    const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
    const [activeChannelId, setActiveChannelId] = useState<string>('general');
    const [unreads, setUnreads] = useState<Record<string, any>>({});

    const allProjects = useLiveQuery(() => db.projects.where('status').equals('active').toArray());
    const workers = useLiveQuery(() => db.workers.toArray());

    useEffect(() => {
        if (!currentUser?.workerId || !firebaseService.isReady) return;
        return firebaseService.subscribe(`unread/${currentUser.workerId}`, (data) => {
            setUnreads(data || {});
        });
    }, [currentUser?.workerId]);

    // Filter projects based on user role and assignment
    const projects = useMemo(() => {
        if (!allProjects) return [];
        if (user?.role === 'admin') return allProjects;
        // For workers, only show projects where they are assigned
        return allProjects.filter(p => p.workerIds?.includes(currentUser?.workerId || -1));
    }, [allProjects, user?.role, currentUser?.workerId]);

    const CHAT_LIMIT = 50;

    const handleChannelSelect = (channelId: string) => {
        setActiveChannelId(channelId);
        setMobileView('chat'); // Switch to chat window on mobile
    };

    const handleBackToList = () => {
        setMobileView('list'); // Switch back to channel list on mobile
    };

    useEffect(() => {
        const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        const timer = setTimeout(scrollToBottom, 100);
        return () => clearTimeout(timer);
    }, [messages, mobileView]);

    useEffect(() => {
        if (currentUser?.workerId) {
            firebaseService.requestNotificationPermission(currentUser.workerId);
        }
    }, [currentUser?.workerId]);

    useEffect(() => {
        if (!firebaseService.isReady) return;
        const path = `chat/${activeChannelId}`;
        setMessages([]);

        const unsubscribe = firebaseService.subscribe(path, (data) => {
            if (data) {
                const messageList: ChatMessage[] = Object.values(data);
                messageList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                const lastMsg = messageList[messageList.length - 1];

                setMessages(prev => {
                    if (lastMsg && lastMsg.senderId !== currentUser?.workerId && lastMsg.senderId !== -1) {
                        const isNewest = prev.length === 0 || !prev.find(m => m.id === lastMsg.id);
                        const msgTime = new Date(lastMsg.timestamp).getTime();
                        if (isNewest && (Date.now() - msgTime < 10000)) {
                            notifyUser(lastMsg, showToast, t);
                        }
                    }
                    return messageList.slice(-CHAT_LIMIT);
                });
            } else {
                setMessages([]);
            }
        });

        // Typing Status Subscription
        const unsubTyping = firebaseService.subscribeTypingStatus(activeChannelId, (data) => {
            if (!currentUser?.workerId) return;
            const names = Object.entries(data)
                .filter(([uid]) => Number(uid) !== currentUser.workerId)
                .map(([, info]) => info.name);
            setTypingUsers(names);
        });

        // Seen Status Subscription
        const unsubSeen = firebaseService.subscribe(`chat/${activeChannelId}/seen`, (data) => {
            if (data) setSeenStatus(data);
        });

        // Mark as seen, clear badge and unread RTDB node
        if (currentUser?.workerId) {
            firebaseService.markAsSeen(activeChannelId, currentUser.workerId);
            firebaseService.updateBadge(0);
            firebaseService.setData(`unread/${currentUser.workerId}/${activeChannelId}`, null);
        }

        return () => {
            unsubscribe();
            unsubTyping();
            unsubSeen();
        };
    }, [activeChannelId, currentUser?.workerId, showToast, t]);

    const handleTyping = () => {
        if (!currentUser?.workerId) return;

        firebaseService.setTypingStatus(activeChannelId, currentUser.workerId, currentUser.username || 'User', true);

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            firebaseService.setTypingStatus(activeChannelId, currentUser.workerId, currentUser.username || 'User', false);
        }, 3000);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim()) return;
        setIsSending(true);

        const newMessage: ChatMessage = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            text: inputText.trim(),
            senderId: currentUser?.workerId || -1,
            senderName: currentUser?.username || 'Admin',
            timestamp: new Date().toISOString(),
            channelId: activeChannelId,
            replyTo: replyToMessage?.id
        };

        try {
            await firebaseService.setData(`chat/${activeChannelId}/${newMessage.id}`, newMessage);
            // Clear typing status immediately on send
            if (currentUser?.workerId) {
                firebaseService.setTypingStatus(activeChannelId, currentUser.workerId, currentUser.username || 'User', false);
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            }
            setInputText('');
            setReplyToMessage(null);
            soundService.playClick();
        } catch (error) {
            showToast("Chyba při odesílání", "error");
        } finally {
            setIsSending(false);
        }
    };

    const handleToggleReaction = async (messageId: string, emoji: string) => {
        if (!currentUser?.workerId) return;
        try {
            await firebaseService.toggleReaction(activeChannelId, messageId, emoji, currentUser.workerId);
            soundService.playClick();
        } catch (error) {
            console.error(error);
        }
    };

    const isMe = (msg: ChatMessage) =>
        msg.senderId === currentUser?.workerId ||
        (msg.senderId === -1 && user?.role === 'admin');

    const groupedMessages = useMemo(() => {
        const groups: { date: string, items: { senderId: number, name: string, messages: ChatMessage[] }[] }[] = [];
        messages.forEach((msg) => {
            const dateObj = new Date(msg.timestamp);
            let dateLabel = '';
            if (isNaN(dateObj.getTime())) {
                dateLabel = t('today');
            } else {
                const dateStr = dateObj.toLocaleDateString(language === 'cs' ? 'cs-CZ' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
                dateLabel = dateStr;
                if (dateStr === new Date().toLocaleDateString(language === 'cs' ? 'cs-CZ' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })) {
                    dateLabel = t('today');
                }
            }
            let dateGroup = groups.find(g => g.date === dateLabel);
            if (!dateGroup) {
                dateGroup = { date: dateLabel, items: [] };
                groups.push(dateGroup);
            }
            const lastItemGroup = dateGroup.items[dateGroup.items.length - 1];
            if (lastItemGroup && lastItemGroup.senderId === msg.senderId) {
                lastItemGroup.messages.push(msg);
            } else {
                dateGroup.items.push({ senderId: msg.senderId, name: msg.senderName, messages: [msg] });
            }
        });
        return groups;
    }, [messages, language, t]);

    const activeProjectName = useMemo(() => {
        if (activeChannelId === 'general') return t('general');
        if (activeChannelId.startsWith('dm_')) {
            const parts = activeChannelId.split('_');
            const otherId = parts[1] === String(currentUser?.workerId || -1) ? parts[2] : parts[1];
            return workers?.find(w => String(w.id) === otherId)?.name || 'Soukromý chat';
        }
        return projects?.find(p => `project_${p.id}` === activeChannelId)?.name || 'Project';
    }, [activeChannelId, projects, workers, t, currentUser]);

    // Active Channel Avatar/Color
    const activeChannelColor = useMemo(() => {
        if (activeChannelId === 'general') return '#6366f1';
        if (activeChannelId.startsWith('dm_')) {
            const parts = activeChannelId.split('_');
            const otherId = parts[1] === String(currentUser?.workerId || -1) ? parts[2] : parts[1];
            return workers?.find(w => String(w.id) === otherId)?.color || '#3b82f6';
        }
        return projects?.find(p => `project_${p.id}` === activeChannelId)?.color || '#3b82f6';
    }, [activeChannelId, projects, workers, currentUser]);

    return (
        <div
            className="fixed md:static inset-0 flex flex-col md:flex-row max-w-7xl mx-auto overflow-hidden bg-[#0a0c1a] z-40"
            style={{
                top: 'calc(var(--header-height, 64px) + var(--safe-top, 0px))',
                bottom: 'calc(var(--nav-height, 72px) + var(--safe-bottom, 0px))',
                paddingLeft: 'var(--safe-left, 0px)',
                paddingRight: 'var(--safe-right, 0px)'
            }}
        >
            {/* Sidebar (List View) */}
            <div className={`w-full md:w-96 flex-col shrink-0 h-full border-r border-white/5 bg-black/40 backdrop-blur-3xl transition-all duration-500 ${mobileView === 'list' ? 'flex' : 'hidden md:flex'}`}>
                <div className="p-8 pb-4 border-b border-white/5 space-y-6">
                    <div className="flex items-center justify-between">
                        <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase relative group">
                            {t('channels')}
                            <span className="absolute -bottom-1 left-0 w-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 group-hover:w-full transition-all duration-500"></span>
                        </h1>
                        <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all cursor-pointer">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 custom-scrollbar">
                    {/* General Channel Card */}
                    <button
                        onClick={() => handleChannelSelect('general')}
                        className={`w-full p-5 rounded-[2rem] flex items-center gap-5 transition-all duration-500 group relative overflow-hidden ${activeChannelId === 'general' ? 'bg-indigo-600 shadow-[0_20px_40px_-10px_rgba(79,70,229,0.4)]' : 'bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10'}`}
                    >
                        {activeChannelId === 'general' && (
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/50 to-purple-500/50 mix-blend-overlay"></div>
                        )}
                        <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center font-black text-2xl transition-all duration-500 ${activeChannelId === 'general' ? 'bg-white text-indigo-600 rotate-12' : 'bg-white/5 text-slate-500 group-hover:text-white group-hover:scale-110'}`}>#</div>
                        <div className="text-left flex-1 min-w-0 relative z-10">
                            <div className="flex justify-between items-center mb-1">
                                <span className={`block text-[9px] font-black uppercase tracking-[0.3em] ${activeChannelId === 'general' ? 'text-indigo-200' : 'text-slate-600'}`}>Hlášení</span>
                                {unreads['general'] && activeChannelId !== 'general' && (
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/20">
                                        <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></div>
                                        <span className="text-[8px] font-black tracking-widest leading-none">NEW</span>
                                    </div>
                                )}
                            </div>
                            <span className={`font-black text-lg italic tracking-tight transition-colors ${activeChannelId === 'general' ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{t('general')}</span>
                        </div>
                    </button>

                    <div className="pt-10 pb-4 px-2 flex items-center gap-3">
                        <span className="text-[10px] font-black text-indigo-500/60 uppercase tracking-[0.4em]">Projekty</span>
                        <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/20 to-transparent"></div>
                    </div>

                    {projects.map(p => (
                        <button
                            key={p.id}
                            onClick={() => handleChannelSelect(`project_${p.id}`)}
                            className={`w-full p-4 rounded-[1.75rem] flex items-center gap-4 transition-all duration-300 group ${activeChannelId === `project_${p.id}` ? 'bg-indigo-600 shadow-xl' : 'hover:bg-white/[0.05] border border-transparent hover:border-white/5'}`}
                        >
                            <div className={`w-11 h-11 rounded-[1.2rem] flex items-center justify-center font-black text-sm transition-all ${activeChannelId === `project_${p.id}` ? 'bg-white text-indigo-600' : 'bg-white/5 text-slate-500 group-hover:text-white'}`}>P</div>
                            <div className={`text-left font-black truncate text-sm flex-1 transition-colors italic tracking-tight ${activeChannelId === `project_${p.id}` ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>{p.name}</div>
                            {unreads[`project_${p.id}`] && activeChannelId !== `project_${p.id}` && (
                                <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse mr-2 shadow-[0_0_10px_rgba(244,63,94,0.6)]" />
                            )}
                        </button>
                    ))}

                    <div className="pt-10 pb-4 px-2 flex items-center gap-3">
                        <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.4em]">Kolegové</span>
                        <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/20 to-transparent"></div>
                    </div>

                    {workers?.filter(w => w.id !== currentUser?.workerId).map(w => {
                        const dmId = `dm_${[currentUser?.workerId || -1, w.id].sort((a, b) => Number(a) - Number(b)).join('_')}`;
                        return (
                            <button
                                key={w.id}
                                onClick={() => handleChannelSelect(dmId)}
                                className={`w-full p-4 rounded-[1.75rem] flex items-center gap-4 transition-all duration-300 group ${activeChannelId === dmId ? 'bg-indigo-600 shadow-xl' : 'hover:bg-white/[0.05] border border-transparent hover:border-white/5'}`}
                            >
                                <div
                                    className={`w-11 h-11 rounded-[1.2rem] flex items-center justify-center font-black text-[11px] shadow-lg relative overflow-hidden group-hover:scale-105 transition-transform`}
                                    style={{ backgroundColor: w.color || '#334155' }}
                                >
                                    <div className="absolute inset-0 bg-white/10" />
                                    <span className="relative z-10 text-white drop-shadow-md">{(w.name || '??').substring(0, 2).toUpperCase()}</span>
                                </div>
                                <div className={`text-left font-black truncate text-sm flex-1 transition-colors tracking-tight ${activeChannelId === dmId ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>{w.name}</div>
                                {unreads[dmId] && activeChannelId !== dmId && (
                                    <div className="flex items-center justify-center w-6 h-6 rounded-xl bg-rose-500 text-[10px] font-black text-white animate-bounce mr-2 shadow-lg">1</div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Chat Area (Chat Window View) */}
            <div className={`flex-1 flex flex-col h-full relative overflow-hidden ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'}`}>
                <div className="absolute inset-0 bg-[#020617]" />
                <div className="absolute -top-[20%] -right-[20%] w-[80%] h-[80%] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />

                {/* Header */}
                <div className="relative z-10 px-8 py-7 border-b border-white/5 bg-black/40 backdrop-blur-2xl flex items-center gap-6 shrink-0 shadow-2xl">
                    <button
                        onClick={handleBackToList}
                        className="md:hidden p-4 -ml-4 text-slate-400 hover:text-white hover:bg-white/5 rounded-[1.5rem] transition-all active:scale-95 group"
                    >
                        <svg className="w-6 h-6 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1 overflow-hidden flex items-center gap-4">
                        <div className={`hidden sm:flex w-12 h-12 rounded-2xl items-center justify-center font-black text-white text-lg shadow-lg border border-white/10`} style={{ backgroundColor: activeChannelColor }}>
                            {activeProjectName.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="truncate">
                            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter truncate leading-none mb-1.5">{activeProjectName}</h2>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgb(16,185,129)]"></span>
                                <span className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.3em]">{t('active_now') || 'ONLINE'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {Notification.permission !== 'granted' && (
                            <button
                                onClick={() => currentUser?.workerId && firebaseService.requestNotificationPermission(currentUser.workerId)}
                                className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white p-4 rounded-2xl hover:scale-105 transition-all shadow-xl group/notif flex items-center justify-center border border-indigo-500/20"
                                title="Zapnout notifikace"
                            >
                                <svg className="w-5 h-5 group-hover/notif:animate-swing" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                            </button>
                        )}
                        <button className="hidden sm:flex p-4 text-slate-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-2xl transition-all active:scale-95">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                        </button>
                    </div>
                </div>

                {/* Messages Container */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-10 custom-scrollbar relative z-10">
                    {groupedMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center animate-fade-in opacity-50 space-y-4">
                            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/5 flex items-center justify-center italic font-black text-6xl text-slate-700">?</div>
                            <p className="font-black uppercase tracking-[0.2em] text-xs text-slate-600">Zatím žádné zprávy</p>
                        </div>
                    ) : (
                        groupedMessages.map(group => (
                            <div key={group.date} className="space-y-6">
                                <div className="flex items-center gap-4 py-2 opacity-60">
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] bg-black/20 px-3 py-1 rounded-full border border-white/5 backdrop-blur-sm">{group.date}</span>
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                                </div>
                                {group.items.map((item, idx) => {
                                    const senderMe = isMe({ senderId: item.senderId } as any);
                                    return (
                                        <div key={idx} className={`flex gap-4 ${senderMe ? 'flex-row-reverse' : 'flex-row'} animate-slide-up group/msg max-w-[90%] md:max-w-4xl ${senderMe ? 'ml-auto' : 'mr-auto'}`}>
                                            <div
                                                className="w-11 h-11 rounded-2xl flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-xl border border-white/10 group-hover:scale-110 transition-transform relative overflow-hidden"
                                                style={{ backgroundColor: workers?.find(w => w.id === item.senderId)?.color || '#3b82f6' }}
                                            >
                                                <div className="absolute inset-0 bg-black/10"></div>
                                                <span className="relative z-10">{(item.name || '??').substring(0, 2).toUpperCase()}</span>
                                            </div>
                                            <div className={`flex flex-col space-y-1.5 ${senderMe ? 'items-end' : 'items-start'} flex-1 min-w-0`}>
                                                {!senderMe && (
                                                    <span className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-[0.2em] mb-1">
                                                        {item.name}
                                                    </span>
                                                )}
                                                {item.messages.map((msg, msgIdx) => (
                                                    <div
                                                        key={msg.id}
                                                        className={`relative transition-all group/bubble ${msg.isSystem ? 'w-full flex justify-center py-6' : ''}`}
                                                    >
                                                        {msg.isSystem ? (
                                                            <div className="bg-white/[0.03] border border-white/5 px-8 py-4 rounded-[2rem] flex items-center gap-4 max-w-[90%] backdrop-blur-xl shadow-2xl animate-fade-in group-hover:bg-white/[0.05] transition-all">
                                                                <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                                                </div>
                                                                <span className="text-sm font-bold text-slate-300 italic">
                                                                    {msg.text}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="relative group/content">
                                                                {/* Reaction Toolbar */}
                                                                <div className={`absolute -top-12 z-[100] flex gap-1 p-1 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-[1.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] opacity-0 scale-90 pointer-events-none group-hover/bubble:opacity-100 group-hover/bubble:scale-100 group-hover/bubble:pointer-events-auto transition-all duration-300 ${senderMe ? 'right-0' : 'left-0'}`}>
                                                                    {['👍', '❤️', '🔥', '👏', '😂', '😮'].map(emoji => (
                                                                        <button
                                                                            key={emoji}
                                                                            onClick={() => handleToggleReaction(msg.id, emoji)}
                                                                            className="w-10 h-10 flex items-center justify-center hover:scale-125 transition-all text-xl active:scale-90"
                                                                        >
                                                                            {emoji}
                                                                        </button>
                                                                    ))}
                                                                    <div className="w-px h-6 bg-white/10 mx-2 self-center"></div>
                                                                    <button
                                                                        onClick={() => setReplyToMessage(msg)}
                                                                        className="px-5 text-[10px] font-black text-white uppercase tracking-widest hover:text-indigo-400 transition-colors flex items-center"
                                                                    >
                                                                        Odpovědět
                                                                    </button>
                                                                </div>

                                                                <div
                                                                    className={`px-7 py-5 rounded-[2rem] text-[15px] leading-[1.6] shadow-2xl backdrop-blur-md transition-all relative border border-white/5 ${senderMe
                                                                        ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-sm shadow-indigo-900/40 border-indigo-500/30'
                                                                        : 'bg-white/[0.08] text-slate-100 rounded-tl-sm shadow-black/40 hover:bg-white/[0.12] border-white/10'}`}
                                                                >
                                                                    {msg.replyTo && (
                                                                        <div className="mb-4 p-4 bg-black/30 rounded-2xl border-l-[6px] border-indigo-500/50 text-[11px] font-bold text-slate-400 italic line-clamp-2">
                                                                            {messages.find(m => m.id === msg.replyTo)?.text || 'Původní zpráva smazána'}
                                                                        </div>
                                                                    )}
                                                                    <span className="selection:bg-white selection:text-indigo-600">
                                                                        {msg.text}
                                                                    </span>
                                                                    <span className={`text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 block text-right mt-3 pointer-events-none ${senderMe ? 'text-indigo-100' : 'text-slate-400'}`}>
                                                                        {(() => {
                                                                            const d = new Date(msg.timestamp);
                                                                            return isNaN(d.getTime()) ? 'Právě teď' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                                        })()}
                                                                    </span>
                                                                </div>

                                                                {/* Display Reactions */}
                                                                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                                                    <div className={`flex flex-wrap gap-1.5 mt-2.5 ${senderMe ? 'justify-end' : 'justify-start'}`}>
                                                                        {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                                                                            const reactedByMe = userIds.includes(currentUser?.workerId || -1);
                                                                            return (
                                                                                <button
                                                                                    key={emoji}
                                                                                    onClick={() => handleToggleReaction(msg.id, emoji)}
                                                                                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border text-[11px] font-black transition-all hover:scale-105 active:scale-90 ${reactedByMe ? 'bg-indigo-600 text-white border-indigo-500/50 shadow-lg shadow-indigo-600/30' : 'bg-white/[0.05] border-white/5 text-slate-400 hover:border-white/10'}`}
                                                                                >
                                                                                    <span className="text-sm">{emoji}</span>
                                                                                    <span>{userIds.length}</span>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}

                                                                {/* Seen Status */}
                                                                {msgIdx === item.messages.length - 1 && (
                                                                    <div className={`flex items-center -space-x-1.5 mt-2.5 ${senderMe ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
                                                                        {Object.entries(seenStatus)
                                                                            .filter(([uid, timestamp]) => {
                                                                                const userIdNum = Number(uid);
                                                                                if (userIdNum === (currentUser?.workerId || -1)) return false;
                                                                                const seenTime = new Date(timestamp).getTime();
                                                                                const msgTime = new Date(msg.timestamp).getTime();
                                                                                return seenTime >= msgTime;
                                                                            })
                                                                            .map(([uid]) => {
                                                                                const w = workers?.find(worker => String(worker.id) === uid);
                                                                                return (
                                                                                    <div
                                                                                        key={uid}
                                                                                        className="w-5 h-5 rounded-lg border-2 border-[#020617] text-[8px] font-black flex items-center justify-center text-white shadow-xl hover:translate-y-[-2px] transition-transform animate-in fade-in zoom-in duration-300"
                                                                                        style={{ backgroundColor: w?.color || '#334155' }}
                                                                                        title={`Viděno: ${w?.name}`}
                                                                                    >
                                                                                        {(w?.name || '?').substring(0, 1).toUpperCase()}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Typing Indicator */}
                {typingUsers.length > 0 && (
                    <div className="absolute bottom-24 left-8 text-xs font-bold text-indigo-400 animate-pulse flex items-center gap-2">
                        <span className="flex gap-0.5">
                            <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </span>
                        {typingUsers.join(', ')} {typingUsers.length === 1 ? 'píše...' : 'píší...'}
                    </div>
                )}

                {/* Input Area */}
                <div className="p-4 md:p-10 bg-black/40 backdrop-blur-3xl border-t border-white/5 shrink-0 relative z-20">
                    <div className="max-w-5xl mx-auto flex flex-col gap-6">
                        {replyToMessage && (
                            <div className="p-5 bg-indigo-500/10 border-l-[6px] border-indigo-600 rounded-2xl flex justify-between items-center animate-slide-up shadow-xl backdrop-blur-xl">
                                <div className="flex-1 truncate group">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 group-hover:animate-ping"></div>
                                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Odpověď pro {replyToMessage.senderName}</p>
                                    </div>
                                    <p className="text-sm text-slate-300 truncate italic font-medium px-1 leading-relaxed">"{replyToMessage.text}"</p>
                                </div>
                                <button
                                    onClick={() => setReplyToMessage(null)}
                                    className="p-3 hover:bg-white/10 rounded-2xl text-slate-500 hover:text-white transition-all shadow-inner active:rotate-90 duration-300"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleSend} className="flex gap-4 md:gap-5 relative group/form">
                            <div className="hidden sm:flex p-2 bg-white/5 hover:bg-indigo-600/20 rounded-[1.75rem] border border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer items-center justify-center shrink-0 w-16 group/btn">
                                <svg className="w-6 h-6 text-slate-500 group-hover:text-indigo-400 group-hover:rotate-90 transition-all duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M12 6v12m6-6H6" /></svg>
                            </div>

                            <div className="flex-1 relative flex items-center">
                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={e => { setInputText(e.target.value); handleTyping(); }}
                                    placeholder={t('type_message')}
                                    className="w-full bg-white/[0.04] border border-white/10 rounded-[2.2rem] px-8 py-6 text-base text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-[12px] focus:ring-indigo-500/5 transition-all font-bold tracking-tight shadow-inner pr-16 md:pr-10"
                                />
                                <div className="absolute right-6 md:hidden">
                                    <button
                                        type="submit"
                                        disabled={!inputText.trim() || isSending}
                                        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${inputText.trim() ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/5 text-slate-700'}`}
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={!inputText.trim() || isSending}
                                className="hidden md:flex group bg-indigo-600 disabled:opacity-20 disabled:grayscale disabled:scale-95 text-white px-12 rounded-[2.2rem] font-black uppercase tracking-[0.3em] text-[11px] active:scale-95 transition-all shadow-[0_20px_40px_rgba(79,70,229,0.4)] relative overflow-hidden items-center gap-3"
                            >
                                <span className="relative z-10 italic">Odeslat</span>
                                <svg className="w-4 h-4 relative z-10 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Chat;
