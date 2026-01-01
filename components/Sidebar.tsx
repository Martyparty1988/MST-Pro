
import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import DashboardIcon from './icons/DashboardIcon';
import ProjectsIcon from './icons/ProjectsIcon';
import SettingsIcon from './icons/SettingsIcon';
import ClockIcon from './icons/ClockIcon';
import ChatIcon from './icons/ChatIcon';
import WorkersIcon from './icons/WorkersIcon';
import ChartBarIcon from './icons/ChartBarIcon';
import DocumentTextIcon from './icons/DocumentTextIcon';
import WrenchIcon from './icons/WrenchIcon';
import CalendarIcon from './icons/CalendarIcon';
import BrainIcon from './icons/BrainIcon';
import NotificationBell from './NotificationBell';

const Sidebar: React.FC<{ className?: string; onClose?: () => void }> = ({ className = '', onClose }) => {
    const { t } = useI18n();
    const { user, logout } = useAuth();

    const navItems = [
        { to: "/", title: t('dashboard'), icon: <DashboardIcon />, roles: ['admin', 'user'] },
        { to: "/projects", title: 'Seznam projektů', icon: <ProjectsIcon />, roles: ['admin', 'user'] },
        { to: "/workers", title: t('workers'), icon: <WorkersIcon />, roles: ['admin'] },
        { to: "/records", title: 'Práce', icon: <ClockIcon />, roles: ['admin', 'user'] },
        { to: "/reports", title: t('reports'), icon: <DocumentTextIcon />, roles: ['admin'] },
        { to: "/stats", title: 'Statistiky', icon: <ChartBarIcon />, roles: ['admin'] },
        { to: "/field-plans", title: 'Projekty', icon: <CalendarIcon />, roles: ['admin', 'user'] },
        { to: "/chat", title: "Firemní chat", icon: <ChatIcon />, roles: ['admin', 'user'] },
        { to: "/tools", title: 'Nářadí', icon: <WrenchIcon />, roles: ['admin'] },
    ];

    const adminItems = [
        { to: "/settings", title: t('settings'), icon: <SettingsIcon />, roles: ['admin'] },
        { to: "/payroll", title: "Mzdy", icon: <BrainIcon />, roles: ['admin'] },
    ];

    const getVisibleItems = (items: any[]) => items.filter(item => item.roles.includes(user?.role || 'user'));

    return (
        <aside className={`flex flex-col w-72 bg-[#020617]/95 backdrop-blur-3xl text-white fixed h-full border-r border-white/5 shadow-[20px_0_40px_rgba(0,0,0,0.5)] z-[100] transition-transform duration-300 ${className}`}>
            {/* Mobile Close Button */}
            {onClose && (
                <button
                    onClick={onClose}
                    className="md:hidden absolute top-6 right-6 p-2 text-slate-400 hover:text-white bg-white/5 rounded-full"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            )}

            <div className="flex flex-col items-center justify-center py-10 border-b border-white/5 relative overflow-hidden shrink-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>
                <Link to="/" className="relative z-10 group" onClick={onClose}>
                    <h1 className="text-4xl font-black italic tracking-tighter text-white group-hover:scale-110 transition-transform duration-300">
                        MST<span className="text-indigo-500">.</span>
                    </h1>
                </Link>
                <div className="mt-2 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] opacity-40">Solar Tracker Pro</div>
            </div>

            <nav className="flex-1 px-6 py-8 space-y-6 overflow-y-auto custom-scrollbar">
                <div>
                    <p className="px-2 mb-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] opacity-60">Menu</p>
                    <div className="space-y-1">
                        {getVisibleItems(navItems).map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={onClose}
                                end={item.to === "/"}
                                className={({ isActive }) =>
                                    `group flex items-center px-4 py-3 text-sm font-black uppercase tracking-tight rounded-2xl transition-all duration-300 ${isActive
                                        ? 'bg-gradient-to-r from-indigo-600/20 to-indigo-600/10 text-white border border-indigo-500/30 shadow-[0_4px_20px_rgba(79,70,229,0.15)] ring-1 ring-white/10'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                    }`
                                }
                            >
                                <div className={`w-6 h-6 mr-3 transition-transform duration-300 group-hover:scale-110`}>{item.icon}</div>
                                <span>{item.title}</span>
                                {item.to === "/" && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>}
                            </NavLink>
                        ))}
                    </div>
                </div>

                {user?.role === 'admin' && (
                    <div>
                        <p className="px-2 mb-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] opacity-60">Admin</p>
                        <div className="space-y-1">
                            {getVisibleItems(adminItems).map(item => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    onClick={onClose}
                                    className={({ isActive }) =>
                                        `group flex items-center px-4 py-3 text-sm font-black uppercase tracking-tight rounded-2xl transition-all duration-300 ${isActive
                                            ? 'bg-gradient-to-r from-emerald-600/20 to-emerald-600/10 text-white border border-emerald-500/30'
                                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                        }`
                                    }
                                >
                                    <div className={`w-6 h-6 mr-3 transition-transform duration-300 group-hover:scale-110`}>{item.icon}</div>
                                    <span>{item.title}</span>
                                </NavLink>
                            ))}
                        </div>
                    </div>
                )}
            </nav>

            <div className="px-6 py-8 border-t border-white/5 bg-white/5 backdrop-blur-md">
                <div className="flex items-center p-3 rounded-2xl bg-black/40 border border-white/5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center mr-4 shadow-xl border border-white/10 ring-2 ring-indigo-500/20">
                        <span className="text-xl font-black italic">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-black uppercase italic tracking-tighter text-white truncate">{user?.username || 'Guest'}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{user?.role || 'User'}</p>
                    </div>
                    <NotificationBell className="w-8 h-8 ml-2" />
                </div>
                <button
                    onClick={logout}
                    className="w-full mt-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-slate-500 hover:text-red-400 transition-colors flex items-center justify-center gap-2 hover:bg-red-500/5 rounded-xl border border-transparent hover:border-red-500/20"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    Odhlásit se
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
