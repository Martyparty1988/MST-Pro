
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import TimeRecordForm from './TimeRecordForm';
import Leaderboard from './Leaderboard';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';

// Icons
import ProjectsIcon from './icons/ProjectsIcon';
import ClockIcon from './icons/ClockIcon';
import MapIcon from './icons/MapIcon';
import CalendarIcon from './icons/CalendarIcon';
import ChartBarIcon from './icons/ChartBarIcon';
import WorkersIcon from './icons/WorkersIcon';
import RedoIcon from './icons/RedoIcon';
import { soundService } from '../services/soundService';
import usePullToRefresh from '../hooks/usePullToRefresh';
import { firebaseService } from '../services/firebaseService';
import { useToast } from '../contexts/ToastContext';

const KPICard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  trend?: string;
}> = ({ label, value, icon, color, trend }) => (
  <div className="ios-card p-5 relative overflow-hidden group shadow-xl transition-all active:scale-[0.98]">
    <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full blur-3xl opacity-10 ${color}`}></div>
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-white">
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: 'w-5 h-5' }) : icon}
      </div>
      {trend && (
        <span className="text-[9px] font-black text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full uppercase tracking-widest border border-emerald-400/20">
          {trend}
        </span>
      )}
    </div>
    <div className="space-y-1">
      <p className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">{value}</p>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] leading-none">{label}</p>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isLoggingWork, setIsLoggingWork] = useState(false);

  const handleDataRefresh = async () => {
    try {
      await firebaseService.synchronize(true);
      showToast('Data byla obnovena', 'success');
    } catch (error) {
      console.error("Failed to refresh data:", error);
      showToast('Nepodařilo se obnovit data', 'error');
    }
  };

  const { isRefreshing } = usePullToRefresh({ onRefresh: handleDataRefresh });

  const [syncStatus, setSyncStatus] = useState({ online: firebaseService.isOnline, pending: firebaseService.pendingOps });

  useEffect(() => {
    const unsub = firebaseService.onStatusChange((online, pending) => {
      setSyncStatus({ online, pending });
    });
    return () => { unsub(); };
  }, []);

  const stats = useLiveQuery(async () => {
    const projects = await db.projects.toArray();
    const tables = await db.fieldTables.toArray();
    const activeProjects = projects.filter(p => p.status === 'active').length;
    const completedTablesToday = tables.filter(t => {
      if (!t.completedAt) return false;
      const compDate = new Date(t.completedAt).toDateString();
      const today = new Date().toDateString();
      return compDate === today;
    }).length;

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toDateString();
      const count = tables.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === dateStr).length;
      return { name: d.toLocaleDateString('cs-CZ', { weekday: 'short' }), count };
    });

    return { activeProjects, completedTablesToday, last7Days, totalTables: tables.length, completedTables: tables.filter(t => t.status === 'completed').length };
  }, [], { activeProjects: 0, completedTablesToday: 0, last7Days: [], totalTables: 0, completedTables: 0 });

  const recentActivity = useLiveQuery(async () => {
    const tables = await db.fieldTables.where('status').equals('completed').toArray();
    const records = await db.records.toArray();
    const workers = await db.workers.toArray();
    const projects = await db.projects.toArray();

    const wMap = new Map(workers.map(w => [w.id, w]));
    const pMap = new Map(projects.map(p => [p.id, p]));

    return [
      ...tables.map(t => ({
        id: `table-${t.id}`, type: 'table', time: new Date(t.completedAt || 0),
        title: `Stůl ${t.tableId} hotov`, subtitle: pMap.get(t.projectId)?.name || 'Projekt',
        icon: <MapIcon className="w-4 h-4" />
      })),
      ...records.map(r => ({
        id: `record-${r.id}`, type: 'work', time: new Date(r.startTime),
        title: `Práce zapsána`, subtitle: wMap.get(r.workerId)?.name || 'Pracovník',
        icon: <ClockIcon className="w-4 h-4" />
      }))
    ].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 5);
  }, []);

  return (
    <div className="space-y-6 md:space-y-12 pb-20 animate-fade-in relative px-2 md:px-0">

      {/* Pull to refresh UI */}
      <div className={`fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${isRefreshing ? 'opacity-100 translate-y-4 scale-100' : 'opacity-0 -translate-y-10 scale-90 pointer-events-none'}`}>
        <div className="bg-indigo-600/90 backdrop-blur-xl text-white rounded-full p-3 shadow-2xl border border-indigo-400/20">
          <RedoIcon className="w-5 h-5 animate-spin" />
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pt-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 bg-indigo-500 rounded-full"></span>
            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.4em]">{t('dashboard')}</span>

            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${syncStatus.pending > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : syncStatus.online ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
              <div className={`w-1 h-1 rounded-full ${syncStatus.pending > 0 ? 'bg-amber-500 animate-pulse' : syncStatus.online ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
              <span className="text-[8px] font-black uppercase tracking-widest">{syncStatus.pending > 0 ? `Sync (${syncStatus.pending})` : syncStatus.online ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          <h1 className="text-4xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-[0.9]">
            Vítejte, {user?.username || 'Marty'}<span className="text-indigo-500 font-normal">.</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] opacity-40">Smart Solar Management</p>
        </div>

        <button
          onClick={() => setIsLoggingWork(true)}
          className="group relative w-full md:w-auto px-6 py-4 bg-white rounded-2xl font-black text-black uppercase tracking-widest shadow-xl active:scale-95 transition-all overflow-hidden"
        >
          <div className="relative z-10 flex items-center justify-center gap-3">
            <ClockIcon className="w-5 h-5" />
            <span className="text-[11px]">{t('log_work')}</span>
          </div>
        </button>
      </header>

      {/* KPI Section */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Aktivní Projekty" value={stats.activeProjects} icon={<ProjectsIcon />} color="bg-blue-500" />
        <KPICard label="Dnešní Pokrok" value={stats.completedTablesToday} icon={<ChartBarIcon />} color="bg-emerald-500" trend="+12%" />
        <KPICard label="Celková Hotovost" value={`${Math.round((stats.completedTables / (stats.totalTables || 1)) * 100)}%`} icon={<CalendarIcon />} color="bg-amber-500" />
        <KPICard label="Pracovníci" value={user?.role === 'admin' ? '8 +' : 'Tým A'} icon={<WorkersIcon />} color="bg-indigo-500" />
      </section>

      {/* Charts & Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="ios-card p-6 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-white italic uppercase tracking-tighter">{t('weekly_activity')}</h3>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Počet stolů</p>
              </div>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.last7Days}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 900 }} dy={10} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '0.5rem' }} itemStyle={{ color: '#fff', fontSize: 10, fontWeight: 900 }} />
                  <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ios-card p-6 space-y-4">
            <h3 className="text-sm font-black text-white italic uppercase tracking-tighter">{t('live_activity')}</h3>
            <div className="space-y-3">
              {recentActivity?.map((act, i) => (
                <div key={act.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-indigo-400 shrink-0">{act.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white uppercase tracking-tight italic truncate">{act.title}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest truncate">{act.subtitle}</p>
                  </div>
                  <div className="text-[9px] font-black text-indigo-400 uppercase">{act.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.4em] px-2">{t('quick_actions')}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            {[
              { to: '/field-plans', icon: <MapIcon />, label: t('plan'), color: 'indigo' },
              { to: '/attendance', icon: <CalendarIcon />, label: t('attendance'), color: 'amber' },
              { to: '/stats', icon: <ChartBarIcon />, label: 'Stats', color: 'blue' },
              { to: '/projects', icon: <ProjectsIcon />, label: t('projects'), color: 'emerald' }
            ].map((link, i) => (
              <button key={i} onClick={() => navigate(link.to)} className="flex items-center gap-3 p-4 ios-card hover:border-indigo-500/30 transition-all text-left group">
                <div className={`p-2 rounded-lg bg-${link.color}-500/10 text-${link.color}-400 group-hover:bg-${link.color}-500 group-hover:text-white transition-all shrink-0`}>
                  {React.isValidElement(link.icon) ? React.cloneElement(link.icon as React.ReactElement<any>, { className: 'w-5 h-5' }) : link.icon}
                </div>
                <span className="text-xs font-black text-white uppercase tracking-tighter italic truncate">{link.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Leaderboard />

      {isLoggingWork && (
        <TimeRecordForm onClose={() => setIsLoggingWork(false)} />
      )}
    </div>
  );
};

export default Dashboard;
