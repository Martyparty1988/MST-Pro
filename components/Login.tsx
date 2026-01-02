
import React, { useState } from 'react';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    updateProfile
} from 'firebase/auth';
import { firebaseService } from '../services/firebaseService';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { db } from '../services/db';
import type { Worker } from '../types';

import AdminLoginModal from './AdminLoginModal';

const Login: React.FC = () => {
    const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showAdminLogin, setShowAdminLogin] = useState(false);

    const { t } = useI18n();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await signInWithEmailAndPassword(firebaseService.getAuth, email, password);
        } catch (err: any) {
            console.error(err);
            setError(t('login_error'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password !== confirmPassword) {
            setError(t('passwords_do_not_match'));
            return;
        }
        setIsLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(firebaseService.getAuth, email, password);
            if (userCredential.user) {
                await updateProfile(userCredential.user, { displayName: name });
                const newWorker: Omit<Worker, 'id'> = {
                    name,
                    username: email.split('@')[0],
                    hourlyRate: 0, panelPrice: 0, stringPrice: 0, meterPrice: 0,
                    createdAt: new Date(),
                    color: '#3b82f6'
                };
                const id = await db.workers.add(newWorker as Worker);
                if (firebaseService.isReady) {
                    await firebaseService.upsertRecords('workers', [{ ...newWorker, id }]);
                }
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Registration failed");
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setIsLoading(true);
        try {
            await sendPasswordResetEmail(firebaseService.getAuth, email);
            setMessage(t('reset_link_sent'));
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Reset failed");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col items-center bg-[#020617] relative overflow-y-auto px-6">
            {/* Safe Area Notch Handling for Header */}
            <div className="w-full text-center pt-[calc(env(safe-area-inset-top)+20px)] pb-8 animate-fade-in shrink-0">
                <div className="inline-block p-4 rounded-3xl bg-white/[0.03] border border-white/5 mb-4 shadow-xl">
                    <h1 className="text-4xl font-black text-white tracking-tighter italic leading-none">
                        MST<span className="text-indigo-500">.</span>
                    </h1>
                </div>
                <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.4em] opacity-40">
                    Smart Solar Management
                </p>
            </div>

            <div className="w-full max-w-sm flex-1 flex flex-col justify-start pb-safe">
                {/* Auth Card */}
                <div className="glass-dark p-6 rounded-[2.5rem] border border-white/5 shadow-2xl animate-fade-in">
                    {mode === 'login' && (
                        <form onSubmit={handleLogin} className="space-y-5">
                            <h2 className="text-xl font-black text-white italic uppercase tracking-tighter">
                                {t('login')}
                            </h2>

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('email')}</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full h-12 bg-white/[0.03] border border-white/5 rounded-xl px-4 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/30 transition-all font-bold text-sm"
                                        placeholder="vas@email.cz"
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('password')}</label>
                                        <button type="button" onClick={() => setMode('reset')} className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{t('reset_password')}?</button>
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full h-12 bg-white/[0.03] border border-white/5 rounded-xl px-4 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/30 transition-all font-bold text-sm"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            </div>

                            {error && (
                                <p className="text-rose-400 text-[10px] font-black uppercase text-center tracking-widest bg-rose-500/10 p-3 rounded-lg">{error}</p>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-12 bg-white text-black font-black uppercase tracking-[0.1em] text-[11px] rounded-xl active:scale-95 disabled:opacity-50 transition-all shadow-xl"
                            >
                                {isLoading ? t('processing') : t('login')}
                            </button>

                            <button
                                type="button"
                                onClick={() => setMode('register')}
                                className="w-full py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors text-center"
                            >
                                {t('dont_have_account')} <span className="text-indigo-400">{t('create_account')}</span>
                            </button>
                        </form>
                    )}

                    {mode === 'register' && (
                        <form onSubmit={handleRegister} className="space-y-4">
                            <h2 className="text-xl font-black text-white italic uppercase tracking-tighter">{t('create_account')}</h2>
                            <div className="space-y-3">
                                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full h-11 bg-white/[0.03] border border-white/5 rounded-xl px-4 text-white text-sm" placeholder={t('worker_name')} required />
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-11 bg-white/[0.03] border border-white/5 rounded-xl px-4 text-white text-sm" placeholder={t('email')} required />
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full h-11 bg-white/[0.03] border border-white/5 rounded-xl px-4 text-white text-sm" placeholder={t('password')} required />
                                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full h-11 bg-white/[0.03] border border-white/5 rounded-xl px-4 text-white text-sm" placeholder={t('confirm_password')} required />
                            </div>
                            {error && <p className="text-rose-400 text-[9px] uppercase text-center bg-rose-500/10 p-2 rounded-lg">{error}</p>}
                            <button type="submit" disabled={isLoading} className="w-full h-12 bg-indigo-600 text-white font-black uppercase tracking-widest text-[11px] rounded-xl active:scale-95 transition-all">{isLoading ? t('processing') : t('register')}</button>
                            <button type="button" onClick={() => setMode('login')} className="w-full text-[9px] font-black text-slate-500 uppercase text-center">{t('already_have_account')} <span className="text-indigo-400">{t('login')}</span></button>
                        </form>
                    )}

                    {mode === 'reset' && (
                        <form onSubmit={handleReset} className="space-y-6">
                            <h2 className="text-xl font-black text-white italic uppercase tracking-tighter">{t('reset_password')}</h2>
                            <p className="text-slate-500 text-[10px] font-bold px-1">{t('reset_password_desc')}</p>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-12 bg-white/[0.03] border border-white/5 rounded-xl px-4 text-white text-sm" placeholder={email} required />
                            {error && <p className="text-rose-400 text-[9px] uppercase text-center bg-rose-500/10 p-2 rounded-lg">{error}</p>}
                            {message && <p className="text-emerald-400 text-[9px] uppercase text-center bg-emerald-500/10 p-2 rounded-lg">{message}</p>}
                            <button type="submit" disabled={isLoading} className="w-full h-12 bg-white text-black font-black uppercase text-[11px] rounded-xl active:scale-95 transition-all">{isLoading ? t('processing') : t('send_reset_link')}</button>
                            <button type="button" onClick={() => setMode('login')} className="w-full text-[9px] font-black text-slate-500 uppercase text-center">{t('back_to_login')}</button>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div className="py-10 text-center flex flex-col items-center gap-3">
                    <p className="text-[8px] font-black text-slate-700 uppercase tracking-[0.4em] flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-800" />
                        &copy; 2026 MST TECHNOLOGY
                        <span className="w-4 h-px bg-slate-800" />
                    </p>
                    <button onClick={() => setShowAdminLogin(true)} className="text-[8px] font-black text-slate-800 uppercase tracking-widest">Admin Access</button>
                </div>
            </div>

            {showAdminLogin && <AdminLoginModal onClose={() => setShowAdminLogin(false)} />}
        </div>
    );
};

export default Login;
