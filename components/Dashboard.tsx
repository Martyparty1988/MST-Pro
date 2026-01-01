
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
  <div className="glass-dark p-8 rounded-[2.5rem] relative overflow-hidden group shadow-2xl transition-all hover:scale-[1.02] border border-white/5">
    <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full blur-3xl opacity-20 ${color}`}></div>
    <div className="flex justify-between items-start mb-6">
      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-white group-hover:scale-110 transition-transform">
        {icon}
      </div>
      {trend && (
        <span className="text-[10px] font-black text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full uppercase tracking-widest border border-emerald-400/20">
          {trend}
        </span>
      )}
    </div>
    <div className="space-y-1">
      <p className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">{value}</p>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] leading-none">{label}</p>
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

  // Sync Status State
  const [syncStatus, setSyncStatus] = useState({ online: firebaseService.isOnline, pending: firebaseService.pendingOps });

  useEffect(() => {
    const unsub = firebaseService.onStatusChange((online, pending) => {
      setSyncStatus({ online, pending });
    });
    return () => { unsub(); };
  }, []);

  // Data Queries
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

    // Generate mini chart data for last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toDateString();
      const count = tables.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === dateStr).length;
      return { name: d.toLocaleDateString('cs-CZ', { weekday: 'short' }), count };
    });

    return { activeProjects, completedTablesToday, last7Days, totalTables: tables.length, completedTables: tables.filter(t => t.status === 'completed').length };
  }, [], { activeProjects: 0, completedTablesToday: 0, last7Days: [], totalTables: 0, completedTables: 0 });

  // Recent Activity Feed
  const recentActivity = useLiveQuery(async () => {
    const tables = await db.fieldTables
      .where('status')
      .equals('completed')
      .toArray();

    const records = await db.records.toArray();
    const workers = await db.workers.toArray();
    const projects = await db.projects.toArray();

    const wMap = new Map(workers.map(w => [w.id, w]));
    const pMap = new Map(projects.map(p => [p.id, p]));

    const combined = [
      ...tables.map(t => ({
        id: `table-${t.id}`,
        type: 'table',
        time: new Date(t.completedAt || 0),
        title: `Stůl ${t.tableId} dokončen`,
        subtitle: pMap.get(t.projectId)?.name || 'Neznámý projekt',
        icon: <MapIcon className="w-4 h-4" />
      })),
      ...records.map(r => ({
        id: `record-${r.id}`,
        type: 'work',
        time: new Date(r.startTime),
        title: `Zapsána práce: ${r.description.substring(0, 20)}...`,
        subtitle: wMap.get(r.workerId)?.name || 'Neznámý pracovník',
        icon: <ClockIcon className="w-4 h-4" />
      }))
    ]
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 5);

    return combined;
  }, []);

  return (
    <div className="space-y-12 pb-32 animate-in fade-in slide-in-from-bottom-5 duration-700 relative">

      {/* Pull to refresh UI */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${isRefreshing ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-10 scale-90 pointer-events-none'}`}
        style={{ top: 'calc(var(--safe-top, 0px) + 1.5rem)' }}
      >
        <div className="bg-indigo-600/90 backdrop-blur-xl text-white rounded-full p-4 shadow-[0_10px_40px_rgba(79,70,229,0.4)] border border-indigo-400/20">
          <RedoIcon className="w-6 h-6 animate-spin" />
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-end gap-8 pt-8 px-4 md:px-0">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-1 w-12 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"></span>
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.5em]">{t('dashboard') || 'Overview'}</span>

            {/* Sync Status Indicator */}
            <div className={`ml-4 flex items-center gap-2 px-3 py-1 rounded-full border ${syncStatus.pending > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : syncStatus.online ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
              {syncStatus.pending > 0 ? (
                <>
                  <RedoIcon className="w-3 h-3 animate-spin" />
                  <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Odesílám ({syncStatus.pending})</span>
                </>
              ) : syncStatus.online ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Online & Zálohováno</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                  <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Offline</span>
                </>
              )}
            </div>
          </div>
          <h1 className="text-6xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-[0.8]">
            Vítejte, {user?.username || 'Marty'}<span className="text-indigo-500 font-normal">.</span>
          </h1>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('dashboard_subtitle') || 'Sledujte svůj pokrok v reálném čase'}</p>
        </div>

        <button
          onClick={() => setIsLoggingWork(true)}
          className="group relative px-10 py-6 bg-white rounded-[2rem] font-black text-black uppercase tracking-widest shadow-[0_20px_50px_-10px_rgba(255,255,255,0.2)] active:scale-95 transition-all overflow-hidden"
        >
          <div className="relative z-10 flex items-center gap-4">
            <div className="p-2 bg-black rounded-lg text-white">
              <ClockIcon className="w-5 h-5" />
            </div>
            {t('log_work') || 'Zapsat Práci'}
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
        </button>
      </header>

      {/* KPI Section */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 px-4 md:px-0">
        <KPICard label="Aktivní Projekty" value={stats.activeProjects} icon={<ProjectsIcon className="w-7 h-7" />} color="bg-blue-500" />
        <KPICard label="Dnešní Pokrok" value={stats.completedTablesToday} icon={<ChartBarIcon className="w-7 h-7" />} color="bg-emerald-500" trend="+12%" />
        <KPICard label="Celková Hotovost" value={`${Math.round((stats.completedTables / (stats.totalTables || 1)) * 100)}%`} icon={<CalendarIcon className="w-7 h-7" />} color="bg-amber-500" />
        <div className="sm:col-span-1">
          <KPICard label="Pracovníci" value={user?.role === 'admin' ? '8 +' : 'Tým A'} icon={<WorkersIcon className="w-7 h-7" />} color="bg-indigo-500" />
        </div>
      </section>

      {/* Charts & Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 px-4 md:px-0">
        {/* Weekly Activity */}
        <div className="lg:col-span-2 space-y-10">
          <div className="glass-dark rounded-[3rem] p-10 shadow-3xl overflow-hidden relative group border border-white/5">
            <div className="flex justify-between items-center mb-10">
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">{t('weekly_activity') || 'Týdenní Aktivita'}</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">{t('completed_tables_count') || 'Počet dokončených stolů'}</p>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.last7Days}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }}
                    dy={15}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(2, 6, 23, 0.9)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '1.5rem',
                      padding: '1rem'
                    }}
                    itemStyle={{ color: '#fff', fontSize: 12, fontWeight: 900 }}
                    cursor={{ stroke: 'rgba(99, 102, 241, 0.2)', strokeWidth: 2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#6366f1"
                    strokeWidth={4}
                    fillOpacity={1}
                    fill="url(#colorCount)"
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="glass-dark rounded-[3rem] p-10 border border-white/5 space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">{t('live_activity') || 'Živý přenos aktivit'}</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Právě se děje</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <RedoIcon className="w-5 h-5 animate-spin-slow" />
              </div>
            </div>

            <div className="space-y-4">
              {recentActivity?.map((act, i) => (
                <div key={act.id} className="group flex items-center gap-6 p-4 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                    {act.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-white uppercase tracking-tight italic leading-tight">{act.title}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{act.subtitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">{act.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
              {!recentActivity?.length && (
                <p className="text-center py-10 text-slate-600 font-bold uppercase tracking-widest text-xs">Zatím žádná aktivita</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-8">
          <div className="flex items-center gap-3 px-2">
            <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-[0.4em]">{t('quick_actions') || 'Rychlé Odkazy'}</h3>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={() => navigate('/field-plans')}
              className="flex items-center gap-6 p-6 glass-dark rounded-[2rem] border border-white/5 hover:border-indigo-500/30 transition-all group shadow-xl"
            >
              <div className="p-4 bg-indigo-500/10 rounded-2xl text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                <MapIcon className="w-7 h-7" />
              </div>
              <div className="text-left space-y-1">
                <p className="text-sm font-black text-white uppercase tracking-tighter italic">{t('plan')}</p>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Interaktivní Mapy</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/attendance')}
              className="flex items-center gap-6 p-6 glass-dark rounded-[2rem] border border-white/5 hover:border-amber-500/30 transition-all group shadow-xl"
            >
              <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                <CalendarIcon className="w-7 h-7" />
              </div>
              <div className="text-left space-y-1">
                <p className="text-sm font-black text-white uppercase tracking-tighter italic">{t('attendance')}</p>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Evidence Docházky</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/stats')}
              className="flex items-center gap-6 p-6 glass-dark rounded-[2rem] border border-white/5 hover:border-blue-500/30 transition-all group shadow-xl"
            >
              <div className="p-4 bg-blue-500/10 rounded-2xl text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                <ChartBarIcon className="w-7 h-7" />
              </div>
              <div className="text-left space-y-1">
                <p className="text-sm font-black text-white uppercase tracking-tighter italic">Stats</p>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Detailní Analýza</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/projects')}
              className="flex items-center gap-6 p-6 glass-dark rounded-[2rem] border border-white/5 hover:border-emerald-500/30 transition-all group shadow-xl"
            >
              <div className="p-4 bg-emerald-500/10 rounded-2xl text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                <ProjectsIcon className="w-7 h-7" />
              </div>
              <div className="text-left space-y-1">
                <p className="text-sm font-black text-white uppercase tracking-tighter italic">{t('projects')}</p>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Přehled Projektů</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Leaderboard Section (Visible on all but small mobiles) */}
      <div className="mt-8">
        <Leaderboard />
      </div>

      {/* Work Entry Modal */}
      {isLoggingWork && (
        <TimeRecordForm onClose={() => setIsLoggingWork(false)} />
      )}
    </div>
  );
};

export default Dashboard;
