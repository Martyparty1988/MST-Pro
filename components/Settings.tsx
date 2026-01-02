
import React, { useState, useEffect } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useBackup } from '../contexts/BackupContext';
import { useToast } from '../contexts/ToastContext';
import { db } from '../services/db';

import { firebaseService } from '../services/firebaseService';
import TrashIcon from './icons/TrashIcon';
import ConfirmationModal from './ConfirmationModal';
import BackupManager from './BackupManager';
import ShareIcon from './icons/ShareIcon';
import BackButton from './BackButton';


const Settings: React.FC = () => {
    const { t, language, setLanguage } = useI18n();
    const [colorTheme, toggleTheme] = useDarkMode();
    const { theme, setTheme } = useTheme();
    const { user } = useAuth();
    const { createBackup, importBackup } = useBackup();
    const { showToast } = useToast();
    const [isResetting, setIsResetting] = useState(false);

    // ✅ OPRAVA: Bezpečná kontrola Notification API
    const notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';

    const handleClearAll = async () => {
        await db.transaction('rw', db.tables, async () => {
            for (const table of db.tables) await table.clear();
        });
        window.location.reload();
    };

    const SettingsSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => (
        <details className="group p-8 bg-[#0a0c1a]/60 backdrop-blur-3xl rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden transition-all" open={defaultOpen}>
            <summary className="text-2xl font-black text-white italic uppercase tracking-tighter cursor-pointer list-none flex items-center justify-between outline-none">
                <span className="flex items-center gap-4">
                    <div className="w-1.5 h-8 bg-indigo-500 rounded-full" />
                    {title}
                </span>
                <svg className="w-8 h-8 transform group-open:rotate-180 transition-transform duration-500 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
            </summary>
            <div className="mt-10 animate-fade-in px-2">
                {children}
            </div>
        </details>
    );

    return (
        <div className="pb-24 max-w-6xl mx-auto px-4">
            <div className="md:hidden mb-8">
                <BackButton />
            </div>

            <header className="mb-16 space-y-4">
                <h1 className="text-7xl font-black text-white italic uppercase tracking-tighter leading-none">
                    NASTAVENÍ<span className="text-indigo-500">.</span>
                </h1>
                <p className="text-slate-500 font-bold uppercase tracking-[0.3em] ml-2">Konfigurace systému a správa dat</p>
                <div className="h-2 w-32 bg-indigo-600 rounded-full ml-2 shadow-[0_4px_20px_rgba(79,70,229,0.5)]" />
            </header>

            <div className="space-y-10">
                {/* Language Section */}
                <SettingsSection title={t('language')} defaultOpen>
                    <div className="grid grid-cols-2 gap-6">
                        {(['cs', 'en'] as const).map(lang => (
                            <button
                                key={lang}
                                onClick={() => { setLanguage(lang); showToast(lang === 'cs' ? 'Jazyk změněn' : 'Language changed', 'success'); }}
                                className={`group relative h-32 rounded-[2.5rem] transition-all overflow-hidden border-2 ${language === lang
                                    ? 'bg-white text-black border-white shadow-2xl'
                                    : 'bg-black/40 border-white/5 text-slate-500 hover:border-white/20 hover:bg-white/5'}`}
                            >
                                <div className="relative z-10 flex flex-col items-center justify-center gap-1">
                                    <span className="text-3xl font-black">{lang.toUpperCase()}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">{lang === 'cs' ? 'Čeština' : 'English'}</span>
                                </div>
                                {language === lang && (
                                    <div className="absolute top-4 right-6 animate-pulse">
                                        <div className="w-3 h-3 bg-indigo-500 rounded-full" />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </SettingsSection>

                {/* Notifications Section */}
                <SettingsSection title="Oznámení" defaultOpen>
                    <div className="bg-black/40 p-10 rounded-[2.5rem] border border-white/5 space-y-10">
                        <div className="flex items-center justify-between flex-wrap gap-6">
                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Aktuální stav</p>
                                <h3 className={`text-2xl font-black italic tracking-tighter uppercase ${notificationPermission === 'granted'
                                        ? 'text-emerald-500'
                                        : notificationPermission === 'denied'
                                            ? 'text-slate-400'
                                            : 'text-slate-500'
                                    }`}>
                                    {notificationPermission === 'granted' ? 'Aktivní' : notificationPermission === 'denied' ? 'Zakázáno' : 'Čeká se'}
                                </h3>
                            </div>

                            <button
                                onClick={async () => {
                                    const token = await firebaseService.requestNotificationPermission(user?.workerId);
                                    if (token) {
                                        showToast('Oznámení povolena!', 'success');
                                        if (typeof Notification !== 'undefined') {
                                            new Notification("MST System", { body: "Oznámení byla úspěšně aktivována." });
                                        }
                                    } else {
                                        showToast('Povolte oznámení v prohlížeči', 'error');
                                    }
                                }}
                                className="group relative px-10 py-5 bg-white text-black font-black rounded-[2rem] hover:scale-105 transition-all active:scale-95 shadow-2xl flex items-center gap-4"
                            >
                                <span className="uppercase tracking-widest text-xs">Povolit & Testovat</span>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                            </button>
                        </div>

                        <div className="p-6 bg-white/[0.03] rounded-3xl border border-white/5 flex flex-col gap-4">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 flex-shrink-0">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <p className="text-slate-400 text-xs font-bold leading-relaxed">
                                    Push notifikace vám umožní dostávat okamžitá upozornění na nové zprávy v chatu a přiřazené úkoly i když nemáte aplikaci otevřenou.
                                </p>
                            </div>

                            {firebaseService.currentFcmToken && (
                                <div className="mt-4 pt-4 border-t border-white/5">
                                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-2">FCM Debug Token</p>
                                    <div className="flex gap-2">
                                        <code className="flex-1 bg-black/40 p-2 rounded-lg text-[10px] text-slate-500 font-mono truncate">
                                            {firebaseService.currentFcmToken}
                                        </code>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(firebaseService.currentFcmToken || '');
                                                showToast('Token zkopírován', 'success');
                                            }}
                                            className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold uppercase transition-all"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </SettingsSection>

                {/* Team & Data - Admin Only */}
                {user?.role === 'admin' && (
                    <>
                        <SettingsSection title={t('backup_restore')}>
                            <BackupManager />
                        </SettingsSection>

                        <SettingsSection title={t('data_management')}>
                            <div className="bg-rose-500/5 p-10 rounded-[2.5rem] border border-rose-500/10 space-y-8">
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-rose-500 italic uppercase">Destruktivní zóna</h3>
                                    <p className="text-slate-500 text-sm font-bold opacity-60">Smazání veškerých lokálních dat v tomto zařízení. Akce je nevratná.</p>
                                </div>

                                <button
                                    onClick={() => setIsResetting(true)}
                                    className="w-full md:w-auto px-10 py-5 bg-rose-600 text-white font-black rounded-3xl hover:bg-rose-700 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-4 group"
                                >
                                    <TrashIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                                    <span className="uppercase tracking-widest text-xs">{t('reset_app_title')}</span>
                                </button>
                            </div>
                        </SettingsSection>
                    </>
                )}
            </div>

            {isResetting && (
                <ConfirmationModal
                    title={t('reset_app_title')}
                    message={t('reset_app_confirm')}
                    confirmLabel="POTVRDIT RESET"
                    onConfirm={handleClearAll}
                    onCancel={() => setIsResetting(false)}
                    variant="danger"
                />
            )}
        </div>
    );
};

export default Settings;
