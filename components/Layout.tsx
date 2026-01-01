
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
        { to: "/", title: t('dashboard'), icon: <DashboardIcon className="w-8 h-8" />, roles: ['admin', 'user'] },
        { to: "/projects", title: 'Seznam', icon: <ProjectsIcon className="w-8 h-8" />, roles: ['admin', 'user'] },
        { to: "/chat", title: "Chat", icon: <ChatIcon className="w-8 h-8" />, roles: ['admin', 'user'] },
        { to: "/records", title: 'Práce', icon: <ClockIcon className="w-8 h-8" />, roles: ['admin', 'user'] },
        { to: "/settings", title: t('settings'), icon: <SettingsIcon className="w-8 h-8" />, roles: ['admin', 'user'] },
    ];

    const visibleItems = navItems.filter(item => item.roles.includes(user?.role || 'user'));

    return (
        <nav
            className="fixed bottom-0 left-0 z-[100] w-full bg-[#020617]/95 backdrop-blur-3xl border-t border-white/5 md:hidden shadow-[0_-15px_50px_rgba(0,0,0,0.8)] pb-safe"
        >
            <div className="flex justify-around items-center px-2 py-3 safe-x">
                {visibleItems.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `group flex flex-col items-center justify-center w-full gap-1 transition-all duration-300 touch-manipulation min-h-[64px] rounded-2xl ${isActive
                                ? 'text-white'
                                : 'text-slate-500'}`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <div className={`relative p-3 rounded-2xl transition-all duration-500 ${isActive ? 'bg-indigo-600 shadow-lg scale-110 -translate-y-1 border border-white/20' : 'bg-transparent'}`}>
                                    {React.cloneElement(item.icon as React.ReactElement<{ className?: string }>, {
                                        className: `w-6 h-6 transition-colors ${isActive ? "text-white" : "text-slate-500"}`
                                    })}
                                </div>
                                <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${isActive ? 'opacity-100 text-indigo-400' : 'opacity-0 h-0 hidden'}`}>
                                    {item.title}
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { t } = useI18n();
    const location = useLocation();
    const isChat = location.pathname === '/chat';
    const [showQuickLog, setShowQuickLog] = useState(false);

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
        <div className="w-full h-full flex bg-transparent overflow-hidden h-screen-safe">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden md:ml-64 relative">
                {/* Header - Only for Mobile */}
                <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#020617]/90 backdrop-blur-3xl border-b border-white/5 pt-safe shadow-xl">
                    <div className="flex justify-between items-center h-16 px-6 safe-x">
                        <div className="flex items-center gap-3">
                            <span className="text-xl font-black italic tracking-tighter text-white">MST<span className="text-indigo-500">.</span></span>
                        </div>
                        <div className="flex items-center gap-4">
                            <NotificationBell className="w-10 h-10 -mr-2" />
                            <ConnectionStatusIndicator />
                        </div>
                    </div>
                </header>

                <main
                    className={`flex-1 ${isChat ? 'overflow-hidden flex flex-col' : 'overflow-y-auto custom-scrollbar overscroll-contain'}`}
                    style={{
                        paddingTop: 'calc(var(--header-height, 64px) + var(--safe-top, 0px) + 1rem)',
                        paddingBottom: 'calc(var(--nav-height, 72px) + var(--safe-bottom, 0px) + 2rem)',
                    }}
                >
                    <div key={location.pathname} className={`max-w-7xl mx-auto w-full safe-x animate-fade-in ${isChat ? 'h-full flex flex-col px-0' : 'px-4 md:px-8'}`}>
                        {children}
                    </div>
                </main>

                {/* Bottom Nav for mobile */}
                <BottomNavBar />

                {/* Global FAB - Log Work */}
                <div
                    className="fixed z-40 md:bottom-10 md:right-10"
                    style={{
                        bottom: 'calc(var(--nav-height) + var(--safe-bottom) + 20px)',
                        right: 'max(16px, var(--safe-right))'
                    }}
                >
                    <button
                        onClick={() => setShowQuickLog(true)}
                        className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-700 rounded-full shadow-[0_15px_40px_rgba(0,0,0,0.5)] flex items-center justify-center text-white active:scale-95 transition-all hover:scale-105 border border-white/20"
                        title="Zapsat práci (Z)"
                    >
                        <ClockIcon className="w-8 h-8 drop-shadow-lg" />
                    </button>
                </div>
            </div>

            {/* Global Quick Log Modal */}
            {showQuickLog && (
                <TimeRecordForm onClose={() => setShowQuickLog(false)} />
            )}
        </div>
    );
};

export default Layout;
