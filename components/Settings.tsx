
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

    const notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';

    const handleClearAll = async () => {
        await db.transaction('rw', db.tables, async () => {
            for (const table of db.tables) await table.clear();
        });
        window.location.reload();
    };

    return (
        <div className="pb-24 max-w-lg mx-auto px-4 md:px-0 space-y-8">
            <div className="md:hidden pt-4 pl-2">
                <BackButton />
            </div>

            <header className="space-y-4 px-2">
                <h1 className="text-6xl md:text-7xl font-black text-white italic uppercase tracking-tighter leading-[0.8]">
                    Konfigurace<span className="text-indigo-500">.</span>
                </h1>
                <p className="text-slate-500 font-bold uppercase tracking-[0.3em] pl-1 text-xs md:text-sm">Systém & Data</p>
                <div className="h-1.5 w-24 bg-indigo-600 rounded-full ml-1 shadow-[0_4px_20px_rgba(79,70,229,0.5)]" />
            </header>

            {/* Language Section */}
            <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-4 mb-2">Jazyk / Language</h2>
                <div className="ios-card p-2 flex gap-2">
                    {(['cs', 'en'] as const).map(lang => (
                        <button
                            key={lang}
                            onClick={() => { setLanguage(lang); showToast(lang === 'cs' ? 'Jazyk změněn' : 'Language changed', 'success'); }}
                            className={`flex-1 relative py-4 rounded-xl transition-all overflow-hidden flex items-center justify-center gap-2 ${language === lang
                                ? 'bg-white text-black shadow-lg'
                                : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
                        >
                            <span className="text-sm font-black uppercase tracking-wider">{lang === 'cs' ? 'Čeština' : 'English'}</span>
                            {language === lang && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />}
                        </button>
                    ))}
                </div>
            </section>

            {/* Notifications Section */}
            <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-4 mb-2">Notifikace</h2>
                <div className="ios-card p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h3 className="text-white font-bold text-lg">Push Oznámení</h3>
                            <p className="text-xs text-slate-400 font-medium">Upozornění na nové zprávy a úkoly</p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${notificationPermission === 'granted'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-800 text-slate-400 border-white/5'
                            }`}>
                            {notificationPermission === 'granted' ? 'Zapnuto' : 'Vypnuto'}
                        </div>
                    </div>

                    {notificationPermission !== 'granted' && (
                        <button
                            onClick={async () => {
                                const token = await firebaseService.requestNotificationPermission(user?.workerId);
                                if (token) {
                                    showToast('Oznámení povolena!', 'success');
                                    if (typeof Notification !== 'undefined') new Notification("MST System", { body: "Oznámení aktivována." });
                                } else {
                                    showToast('Povolte oznámení v prohlížeči', 'error');
                                }
                            }}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                        >
                            Povolit Notifikace
                        </button>
                    )}

                    {firebaseService.currentFcmToken && (
                        <div className="pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                                <code className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                                    {firebaseService.currentFcmToken}
                                </code>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(firebaseService.currentFcmToken || '');
                                        showToast('Token zkopírován', 'success');
                                    }}
                                    className="text-[10px] font-bold text-indigo-400 uppercase hover:text-white transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Admin Data Management */}
            {user?.role === 'admin' && (
                <>
                    <section className="space-y-3">
                        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-4 mb-2">Zálohování</h2>
                        <div className="ios-card p-6">
                            <BackupManager />
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[10px] font-black text-rose-500/50 uppercase tracking-[0.3em] pl-4 mb-2">Nebezpečná zóna</h2>
                        <div className="ios-card p-6 border-rose-500/20 bg-rose-500/[0.02]">
                            <div className="flex items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <h3 className="text-white font-bold text-sm">Resetovat Aplikaci</h3>
                                    <p className="text-[10px] text-slate-400">Smaže všechna lokální data</p>
                                </div>
                                <button
                                    onClick={() => setIsResetting(true)}
                                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap"
                                >
                                    Smazat data
                                </button>
                            </div>
                        </div>
                    </section>
                </>
            )}

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
