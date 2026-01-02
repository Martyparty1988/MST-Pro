
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import DashboardIcon from './icons/DashboardIcon';
import ProjectsIcon from './icons/ProjectsIcon';
import SettingsIcon from './icons/SettingsIcon';
import ClockIcon from './icons/ClockIcon';
import ChatIcon from './icons/ChatIcon';
import ConnectionStatusIndicator from './ConnectionStatusIndicator';
import Sidebar from './Sidebar';
import TimeRecordForm from './TimeRecordForm';
import NotificationBell from './NotificationBell';
import { useState, useEffect } from 'react';

const BottomNavBar: React.FC = () => {
    const { t } = useI18n();
    const { user } = useAuth();

    const navItems = [
        { to: "/", title: t('dashboard'), icon: <DashboardIcon />, roles: ['admin', 'user'] },
        { to: "/projects", title: 'Seznam', icon: <ProjectsIcon />, roles: ['admin', 'user'] },
        { to: "/chat", title: "Chat", icon: <ChatIcon />, roles: ['admin', 'user'] },
        { to: "/records", title: 'Práce', icon: <ClockIcon />, roles: ['admin', 'user'] },
        { to: "/settings", title: t('settings'), icon: <SettingsIcon />, roles: ['admin', 'user'] },
    ];

    const visibleItems = navItems.filter(item => item.roles.includes(user?.role || 'user'));

    return (
        <nav
            className="fixed bottom-0 left-0 z-[100] w-full bg-[#020617]/80 backdrop-blur-2xl border-t border-white/5 md:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
            <div className="flex justify-around items-center h-[--nav-height] px-2">
                {visibleItems.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `flex flex-col items-center justify-center flex-1 transition-all duration-300 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`
                        }
                    >
                        <div className="relative p-1">
                            {React.cloneElement(item.icon as React.ReactElement<{ className?: string }>, {
                                className: `w-6 h-6 transition-transform duration-300`
                            })}
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-widest mt-0.5">
                            {item.title}
                        </span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const isChat = location.pathname === '/chat';
    const [showQuickLog, setShowQuickLog] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (['input', 'textarea'].includes(target.tagName.toLowerCase())) return;
            if (e.key.toLowerCase() === 'z') {
                e.preventDefault();
                setShowQuickLog(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="w-full h-full flex bg-transparent overflow-hidden" style={{ height: '100dvh' }}>
            {/* Desktop Sidebar - Hidden on mobile */}
            <Sidebar className="hidden md:flex" />

            {/* Mobile Sidebar Overlay */}
            <div
                className={`fixed inset-0 z-[200] md:hidden transition-all duration-300 ${isSidebarOpen ? 'bg-black/60 backdrop-blur-sm opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsSidebarOpen(false)}
            >
                <div
                    className={`absolute inset-y-0 left-0 w-72 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                    onClick={e => e.stopPropagation()}
                >
                    <Sidebar className="w-full h-full shadow-2xl" onClose={() => setIsSidebarOpen(false)} />
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden md:ml-64 relative h-full">
                {/* Header - Only for Mobile */}
                <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#020617]/80 backdrop-blur-2xl border-b border-white/5 pt-safe">
                    <div className="flex justify-between items-center h-[--header-height] px-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsSidebarOpen(true)}
                                className="p-1.5 text-slate-400 active:scale-95 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg>
                            </button>
                            <span className="text-lg font-black italic tracking-tighter text-white">MST<span className="text-indigo-500">.</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                            <NotificationBell className="w-9 h-9" />
                            <ConnectionStatusIndicator />
                        </div>
                    </div>
                </header>

                <main
                    className={`flex-1 ${isChat ? 'overflow-hidden flex flex-col' : 'overflow-y-auto custom-scrollbar overscroll-contain'}`}
                    style={{
                        paddingTop: 'calc(var(--header-height) + env(safe-area-inset-top, 0px))',
                        paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom, 0px))',
                    }}
                >
                    <div key={location.pathname} className={`max-w-7xl mx-auto w-full animate-fade-in ${isChat ? 'h-full flex flex-col px-0' : 'px-4 py-4 md:py-8'}`}>
                        {children}
                    </div>
                </main>

                <BottomNavBar />

                {/* FAB - Adjusted for safe areas */}
                <div
                    className="fixed z-40 md:bottom-10 md:right-10"
                    style={{
                        bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + 12px)',
                        right: 'max(16px, env(safe-area-inset-right, 16px))'
                    }}
                >
                    <button
                        onClick={() => setShowQuickLog(true)}
                        className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-full shadow-2xl flex items-center justify-center text-white active:scale-90 transition-transform"
                    >
                        <ClockIcon className="w-7 h-7" />
                    </button>
                </div>
            </div>

            {showQuickLog && (
                <TimeRecordForm onClose={() => setShowQuickLog(false)} />
            )}
        </div>
    );
};

export default Layout;
