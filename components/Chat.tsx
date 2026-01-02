import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { firebaseService } from '../services/firebaseService';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { ChatMessage, Worker, Project } from '../types';
import { soundService } from '../services/soundService';
import UploadIcon from './icons/UploadIcon';
import TrashIcon from './icons/TrashIcon';

const notifyUser = (message: ChatMessage, showToast: (msg: string, type?: any) => void, t: any) => {
    soundService.playMessageReceived();
    if (navigator.vibrate) navigator.vibrate(200);
    const name = message.senderName || 'Systém';
    showToast(t('new_message_from', { name }).replace('{name}', name), 'info');

    // Increment badge
    if ('setAppBadge' in navigator) {
        (navigator as any).setAppBadge().catch(() => { });
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        try {
            new Notification(`${message.senderName}`, {
                body: message.text || (message.imageUrl ? '📷 Fotografie' : 'Nová zpráva'),
                icon: '/icon-192.svg',
                tag: 'chat-msg'
            } as any);
        } catch (e) {
            console.warn('Failed to show notification', e);
        }
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

    // File Upload State
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Mobile-specific state: 'list' shows channels, 'chat' shows message window
    const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
    const [activeChannelId, setActiveChannelId] = useState<string>('general');
    const [unreads, setUnreads] = useState<Record<string, any>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const location = useLocation();

    // Category Collapsed States
    const [isGeneralOpen, setIsGeneralOpen] = useState(true);
    const [isProjectsOpen, setIsProjectsOpen] = useState(true);
    const [isPeopleOpen, setIsPeopleOpen] = useState(true);

    // Handle initial channel from URL (for notifications)
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const chanId = params.get('channelId');
        if (chanId) {
            setActiveChannelId(chanId);
            setMobileView('chat');
        }
    }, [location.search]);

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
        let filtered = allProjects;
        if (user?.role !== 'admin') {
            filtered = allProjects.filter(p => p.workerIds?.includes(currentUser?.workerId || -1));
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(query));
        }
        return filtered;
    }, [allProjects, user?.role, currentUser?.workerId, searchQuery]);

    const filteredWorkers = useMemo(() => {
        if (!workers) return [];
        let filtered = workers.filter(w => w.id !== currentUser?.workerId);
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(w => w.name.toLowerCase().includes(query));
        }
        return filtered;
    }, [workers, currentUser?.workerId, searchQuery]);

    const CHAT_LIMIT = 50;

    const handleChannelSelect = (channelId: string) => {
        setActiveChannelId(channelId);
        setMobileView('chat'); // Switch to chat window on mobile
        setSearchQuery(''); // Clear search on select
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

        // Subscribe to messages via Firestore (as requested)
        const unsubscribe = firebaseService.subscribeMessagesFirestore(activeChannelId, (messageList) => {
            const lastMsg = messageList[messageList.length - 1];

            setMessages(prev => {
                if (lastMsg && lastMsg.senderId !== currentUser?.workerId && lastMsg.senderId !== -1) {
                    const isNewest = prev.length === 0 || !prev.find(m => m.id === lastMsg.id);
                    const msgTime = new Date(lastMsg.timestamp).getTime();
                    // Only notify if message is less than 10s old (prevent notification storm on first load)
                    if (isNewest && (Date.now() - msgTime < 10000)) {
                        notifyUser(lastMsg, showToast, t);
                    }
                }
                return messageList;
            });
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

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                showToast('Soubor je příliš velký (max 5MB)', 'error');
                return;
            }
            setAttachedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() && !attachedFile) return;
        setIsSending(true);

        try {
            let imageUrl = undefined;
            if (attachedFile) {
                const path = `chat-media/${activeChannelId}/${Date.now()}_${attachedFile.name}`;
                imageUrl = await firebaseService.uploadFile(attachedFile, path);
            }

            const newMessage: any = {
                text: inputText.trim(),
                senderId: currentUser?.workerId || -1,
                senderName: currentUser?.username || 'Admin',
                channelId: activeChannelId,
                imageUrl: imageUrl
            };

            if (replyToMessage?.id) {
                newMessage.replyTo = replyToMessage.id;
            }

            await firebaseService.sendMessageFirestore(activeChannelId, newMessage);
            // Clear typing status immediately on send
            if (currentUser?.workerId) {
                firebaseService.setTypingStatus(activeChannelId, currentUser.workerId, currentUser.username || 'User', false);
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            }
            setInputText('');
            setReplyToMessage(null);
            setAttachedFile(null);
            setPreviewUrl(null);
            if (fileInputRef.current) fileInputRef.current.value = '';

            soundService.playClick();
        } catch (error: any) {
            console.error("Send Error:", error);
            showToast(`Chyba: ${error.message || 'Nepodařilo se odeslat'}`, "error");
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
        return allProjects?.find(p => `project_${p.id}` === activeChannelId)?.name || 'Project';
    }, [activeChannelId, allProjects, workers, t, currentUser]);

    // Active Channel Avatar/Color
    const activeChannelColor = useMemo(() => {
        if (activeChannelId === 'general') return '#6366f1';
        if (activeChannelId.startsWith('dm_')) {
            const parts = activeChannelId.split('_');
            const otherId = parts[1] === String(currentUser?.workerId || -1) ? parts[2] : parts[1];
            return workers?.find(w => String(w.id) === otherId)?.color || '#3b82f6';
        }
        return allProjects?.find(p => `project_${p.id}` === activeChannelId)?.color || '#3b82f6';
    }, [activeChannelId, allProjects, workers, currentUser]);

    return (
        <div className="flex flex-col md:flex-row h-full w-full overflow-hidden bg-[#020617] relative z-0 md:rounded-2xl shadow-2xl">
            {/* Sidebar (List View) */}
            <div className={`w-full md:w-80 flex-col shrink-0 h-full border-r border-white/5 bg-black/40 backdrop-blur-3xl transition-all duration-500 ${mobileView === 'list' ? 'flex' : 'hidden md:flex'}`}>
                <div className="p-6 pb-4 border-b border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-black text-white italic tracking-tighter uppercase relative group">
                            {t('channels')}
                            <span className="absolute -bottom-1 left-0 w-8 h-0.5 bg-indigo-500"></span>
                        </h1>
                    </div>

                    {/* Search Input */}
                    <div className="relative group">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Hledat..."
                            className="w-full bg-white/5 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/30 transition-all font-bold"
                        />
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 custom-scrollbar">
                    {/* General Channel */}
                    {(!searchQuery || t('general').toLowerCase().includes(searchQuery.toLowerCase())) && (
                        <div className="mb-4">
                            <button
                                onClick={() => setIsGeneralOpen(!isGeneralOpen)}
                                className="w-full flex items-center justify-between px-2 py-2 mb-1 group"
                            >
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-indigo-400 transition-colors">Global</span>
                                <svg className={`w-3 h-3 text-slate-600 transition-transform ${isGeneralOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                            </button>

                            {isGeneralOpen && (
                                <button
                                    onClick={() => handleChannelSelect('general')}
                                    className={`w-full p-3 rounded-2xl flex items-center gap-3 transition-all duration-300 group relative overflow-hidden ${activeChannelId === 'general' ? 'bg-indigo-600/20 border border-indigo-500/30' : 'bg-white/[0.03] hover:bg-white/[0.06] border border-transparent'}`}
                                >
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-lg transition-all ${activeChannelId === 'general' ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-500 group-hover:text-white'}`}>#</div>
                                    <div className="text-left flex-1 min-w-0">
                                        <span className={`font-black text-xs italic tracking-tight transition-colors ${activeChannelId === 'general' ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{t('general')}</span>
                                    </div>
                                    {unreads['general'] && activeChannelId !== 'general' && (
                                        <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                                    )}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Projects Category */}
                    {projects.length > 0 && (
                        <div className="mb-4">
                            <button
                                onClick={() => setIsProjectsOpen(!isProjectsOpen)}
                                className="w-full flex items-center justify-between px-2 py-2 mb-1 group"
                            >
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-indigo-400 transition-colors">Projekty</span>
                                <svg className={`w-3 h-3 text-slate-600 transition-transform ${isProjectsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                            </button>

                            {isProjectsOpen && (
                                <div className="space-y-1">
                                    {projects.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleChannelSelect(`project_${p.id}`)}
                                            className={`w-full p-3 rounded-2xl flex items-center gap-3 transition-all duration-300 group ${activeChannelId === `project_${p.id}` ? 'bg-indigo-600 shadow-xl' : 'bg-white/[0.03] hover:bg-white/[0.06] border border-transparent hover:border-white/5'}`}
                                        >
                                            <div className={`w-9 h-9 rounded-[0.8rem] flex items-center justify-center font-black text-[10px] transition-all ${activeChannelId === `project_${p.id}` ? 'bg-white text-indigo-600' : 'bg-white/5 text-slate-500 group-hover:text-white'}`}>P</div>
                                            <div className={`text-left font-black truncate text-xs flex-1 transition-colors italic tracking-tight ${activeChannelId === `project_${p.id}` ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>{p.name}</div>
                                            {unreads[`project_${p.id}`] && activeChannelId !== `project_${p.id}` && (
                                                <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse mr-2 shadow-[0_0_10px_rgba(244,63,94,0.6)]" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* People Category */}
                    {filteredWorkers.length > 0 && (
                        <div className="mb-20">
                            <button
                                onClick={() => setIsPeopleOpen(!isPeopleOpen)}
                                className="w-full flex items-center justify-between px-2 py-2 mb-1 group"
                            >
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-emerald-400 transition-colors">Lidé</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-slate-600 bg-white/5 px-2 py-0.5 rounded-full">{filteredWorkers.length}</span>
                                    <svg className={`w-3 h-3 text-slate-600 transition-transform ${isPeopleOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </button>

                            {isPeopleOpen && (
                                <div className="space-y-1">
                                    {filteredWorkers.map(w => {
                                        const dmId = `dm_${[currentUser?.workerId || -1, w.id].sort((a, b) => Number(a) - Number(b)).join('_')}`;
                                        return (
                                            <button
                                                key={w.id}
                                                onClick={() => handleChannelSelect(dmId)}
                                                className={`w-full p-3 rounded-2xl flex items-center gap-3 transition-all duration-300 group ${activeChannelId === dmId ? 'bg-indigo-600 shadow-xl' : 'bg-white/[0.03] hover:bg-white/[0.06] border border-transparent hover:border-white/5'}`}
                                            >
                                                <div
                                                    className={`w-9 h-9 rounded-[0.8rem] flex items-center justify-center font-black text-[9px] shadow-lg relative overflow-hidden group-hover:scale-105 transition-transform`}
                                                    style={{ backgroundColor: w.color || '#334155' }}
                                                >
                                                    <div className="absolute inset-0 bg-white/10" />
                                                    <span className="relative z-10 text-white drop-shadow-md">{(w.name || '??').substring(0, 2).toUpperCase()}</span>
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col items-start gap-0.5">
                                                    <div className={`text-left font-black truncate text-xs transition-colors tracking-tight ${activeChannelId === dmId ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>{w.name}</div>
                                                </div>
                                                {unreads[dmId] && activeChannelId !== dmId && (
                                                    <div className="flex items-center justify-center w-5 h-5 rounded-lg bg-rose-500 text-[9px] font-black text-white animate-bounce mr-1 shadow-lg">1</div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {projects.length === 0 && filteredWorkers.length === 0 && searchQuery && (
                        <div className="py-12 text-center opacity-40">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Nic nenalezeno</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area (Chat Window View) */}
            <div className={`flex-1 flex flex-col h-full relative overflow-hidden ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'}`}>
                <div className="absolute inset-0 bg-[#020617]" />
                <div className="absolute -top-[20%] -right-[20%] w-[80%] h-[80%] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />

                {/* Header */}
                <div className="relative z-10 px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-2xl flex items-center gap-4 shrink-0">
                    <button
                        onClick={handleBackToList}
                        className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white transition-all active:scale-90"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1 overflow-hidden flex items-center gap-3">
                        <div className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center font-black text-white shadow-lg`} style={{ backgroundColor: activeChannelColor }}>
                            {activeProjectName.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="truncate">
                            <h2 className="text-xl font-black text-white italic uppercase tracking-tighter truncate leading-tight">{activeProjectName}</h2>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Aktivní</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
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
                                                                    className={`px-6 py-4 rounded-[1.75rem] text-[15px] leading-[1.6] shadow-2xl backdrop-blur-md transition-all relative border border-white/5 ${senderMe
                                                                        ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-sm shadow-indigo-900/40 border-indigo-500/30'
                                                                        : 'bg-white/[0.08] text-slate-100 rounded-tl-sm shadow-black/40 hover:bg-white/[0.12] border-white/10'}`}
                                                                >
                                                                    {msg.replyTo && (
                                                                        <div className="mb-3 p-3 bg-black/30 rounded-xl border-l-[4px] border-indigo-500/50 text-[11px] font-bold text-slate-400 italic line-clamp-2">
                                                                            {messages.find(m => m.id === msg.replyTo)?.text || 'Původní zpráva smazána'}
                                                                        </div>
                                                                    )}
                                                                    <div className="selection:bg-white selection:text-indigo-600 break-words overflow-hidden">
                                                                        {msg.imageUrl && (
                                                                            <img
                                                                                src={msg.imageUrl}
                                                                                alt="Uploaded content"
                                                                                className="rounded-lg mb-2 max-w-full max-h-64 object-cover border border-black/10 cursor-pointer hover:opacity-90 transition-opacity"
                                                                                onClick={() => window.open(msg.imageUrl, '_blank')}
                                                                            />
                                                                        )}
                                                                        {msg.text}
                                                                    </div>
                                                                    <div className={`text-[9px] font-bold uppercase tracking-[0.15em] opacity-40 block text-right mt-2 pointer-events-none ${senderMe ? 'text-indigo-100' : 'text-slate-400'}`}>
                                                                        {(() => {
                                                                            const d = new Date(msg.timestamp);
                                                                            return isNaN(d.getTime()) ? 'Právě teď' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                                        })()}
                                                                    </div>
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
                <div className="p-4 bg-black/60 backdrop-blur-3xl border-t border-white/5 shrink-0 relative z-20">
                    <div className="max-w-5xl mx-auto flex flex-col gap-3">
                        {replyToMessage && (
                            <div className="p-3 bg-indigo-500/10 border-l-4 border-indigo-600 rounded-xl flex justify-between items-center animate-slide-up">
                                <div className="flex-1 truncate">
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{replyToMessage.senderName}</p>
                                    <p className="text-xs text-slate-400 truncate italic">"{replyToMessage.text}"</p>
                                </div>
                                <button
                                    onClick={() => setReplyToMessage(null)}
                                    className="p-2 text-slate-500 hover:text-white transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        )}

                        {/* Image Preview */}
                        {attachedFile && previewUrl && (
                            <div className="p-3 bg-indigo-500/10 border-l-4 border-indigo-600 rounded-xl flex justify-between items-center animate-slide-up">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <img src={previewUrl} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-white/10" />
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest truncate">{attachedFile.name}</p>
                                        <p className="text-xs text-slate-400 italic">{(attachedFile.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setAttachedFile(null);
                                        setPreviewUrl(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="p-2 text-slate-500 hover:text-white transition-all"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleSend} className="flex gap-3 relative group/form">
                            {/* File Input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                accept="image/*"
                                className="hidden"
                            />

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-11 h-[3.2rem] shrink-0 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 flex items-center justify-center text-slate-400 hover:text-indigo-400 transition-all active:scale-95"
                            >
                                <UploadIcon className="w-5 h-5" />
                            </button>

                            <div className="flex-1 relative flex items-center">
                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={e => { setInputText(e.target.value); handleTyping(); }}
                                    placeholder={t('type_message')}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-3.5 text-base text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/30 transition-all font-bold tracking-tight shadow-inner pr-14"
                                />
                                <div className="absolute right-3">
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
