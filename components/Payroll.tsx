
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import type { TimeRecord, Worker, FieldTable } from '../types';
import BackButton from './BackButton';

// Icons
const CashIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const Payroll: React.FC = () => {
    const { t } = useI18n();
    const { user, currentUser } = useAuth();
    const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('week');

    const workers = useLiveQuery(() => db.workers.toArray());
    const records = useLiveQuery(() => db.records.toArray());
    const completedTables = useLiveQuery(() => db.fieldTables.where('status').equals('completed').toArray());
    const projectTasks = useLiveQuery(() => db.projectTasks.toArray());

    const isAdmin = user?.role === 'admin';

    // Calculate start date based on range
    const startDate = useMemo(() => {
        const d = new Date();
        if (dateRange === 'today') d.setHours(0, 0, 0, 0);
        else if (dateRange === 'week') {
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
            d.setDate(diff);
            d.setHours(0, 0, 0, 0);
        } else if (dateRange === 'month') {
            d.setDate(1);
            d.setHours(0, 0, 0, 0);
        }
        return d;
    }, [dateRange]);

    const stats = useMemo(() => {
        if (!workers || !records) return [];

        const filteredRecords = records.filter(r => new Date(r.startTime) >= startDate);
        const filteredTables = completedTables?.filter(t => t.completedAt && new Date(t.completedAt) >= startDate) || [];
        const filteredTasks = projectTasks?.filter(t => t.completionDate && new Date(t.completionDate) >= startDate) || [];

        return workers.map(w => {
            const workerRecords = filteredRecords.filter(r => r.workerId === w.id);

            // 1. Hourly Work
            const hourlyRecords = workerRecords.filter(r => r.workType !== 'task');
            const totalMs = hourlyRecords.reduce((acc, r) => {
                const start = new Date(r.startTime).getTime();
                const end = new Date(r.endTime).getTime();
                return acc + (end - start);
            }, 0);
            const hours = totalMs / (1000 * 60 * 60);
            const hourlyEarnings = hours * (w.hourlyRate || 0);

            // 2. Task Work (Strings)
            const taskRecords = workerRecords.filter(r => r.workType === 'task');
            const totalStrings = taskRecords.reduce((acc, r) => acc + (r.quantity || 0), 0);
            const stringEarnings = totalStrings * (w.stringPrice || 0);

            // 3. Fixed Price Tasks (ProjectTasks)
            const workerTasks = filteredTasks.filter(t => t.assignedWorkerId === w.id);
            const fixedTaskEarnings = workerTasks.reduce((acc, t) => acc + (t.price || 0), 0);

            const totalEarnings = hourlyEarnings + stringEarnings + fixedTaskEarnings;
            const tablesCount = completedTables?.filter(t => t.completedBy === w.id && t.completedAt && new Date(t.completedAt) >= startDate).length || 0;

            const timeSpentOnTasks = taskRecords.reduce((acc, r) => acc + (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()), 0) / 3600000;
            const totalHoursCombined = hours + timeSpentOnTasks;

            return {
                worker: w,
                hours: hours.toFixed(1),
                strings: totalStrings.toFixed(1),
                hourlyEarnings: hourlyEarnings.toFixed(2),
                stringEarnings: stringEarnings.toFixed(2),
                fixedTaskEarnings: fixedTaskEarnings.toFixed(2),
                earnings: totalEarnings.toFixed(2),
                tables: tablesCount,
                tasksCount: workerTasks.length,
                totalHours: totalHoursCombined.toFixed(1),
                efficiency: (totalEarnings / (totalHoursCombined || 1)).toFixed(2)
            };
        }).filter(s => isAdmin || s.worker.id === currentUser?.workerId);
    }, [workers, records, completedTables, projectTasks, startDate, currentUser, isAdmin]);

    const handleExport = () => {
        if (!stats.length) return;

        const headers = [
            "Pracovník",
            "Hodiny",
            "Hodinová odměna (€)",
            "Stringy",
            "Odměna za úkol (€)",
            "Bonusy (€)",
            "Efektivita (€/h)",
            "Celkem k výplatě (€)",
            "Hotových stolů (ks)"
        ];

        const rows = stats.map(s => [
            s.worker.name,
            s.hours.replace('.', ','),
            s.hourlyEarnings.replace('.', ','),
            s.strings.replace('.', ','),
            s.stringEarnings.replace('.', ','),
            s.fixedTaskEarnings.replace('.', ','),
            s.efficiency.replace('.', ','),
            s.earnings.replace('.', ','),
            s.tables
        ]);

        const csvContent = [
            headers.join(';'),
            ...rows.map(r => r.join(';'))
        ].join('\n');

        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Vyplaty_${dateRange}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const totalEarnings = stats.reduce((acc, s) => acc + parseFloat(s.earnings), 0);
    const totalTables = stats.reduce((acc, s) => acc + s.tables, 0);

    return (
        <div className="space-y-8 pb-32 animate-fade-in">
            <header className="flex flex-wrap items-center gap-4 pt-4">
                <BackButton />
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-500/30">
                        <CashIcon className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
                            {t('payroll') || 'Finance a Výplaty'}
                        </h1>
                        <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">
                            {isAdmin ? 'Manažerský přehled odměn' : 'Můj přehled výdělků'}
                        </p>
                    </div>
                </div>

                {isAdmin && (
                    <button
                        onClick={handleExport}
                        className="ml-auto group flex items-center gap-3 px-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.98]"
                    >
                        <div className="p-2 bg-white/10 rounded-xl">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div className="text-left hidden sm:block">
                            <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{t('export_payroll')}</p>
                            <p className="text-[8px] font-bold text-indigo-200 uppercase tracking-tighter opacity-70">CSV • Excel kompatibilní</p>
                        </div>
                    </button>
                )}
            </header>

            {/* Range Selector */}
            <div className="flex gap-2 bg-black/20 p-2 rounded-2xl max-w-md">
                {(['today', 'week', 'month'] as const).map(range => (
                    <button
                        key={range}
                        onClick={() => setDateRange(range)}
                        className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${dateRange === range
                            ? 'bg-white/10 text-white shadow-inner border border-white/10'
                            : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        {t(range) || range}
                    </button>
                ))}
            </div>

            {/* Main Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-8 rounded-[3rem] border border-white/10 relative overflow-hidden group bg-gradient-to-br from-indigo-500/10 to-transparent">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <CashIcon className="w-32 h-32" />
                    </div>
                    <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-2">Celkový výdělek</p>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-6xl font-black text-white">{totalEarnings.toFixed(0)}</h2>
                        <span className="text-2xl font-black text-indigo-500">€</span>
                    </div>
                    <p className="mt-4 text-slate-400 font-bold text-sm">Průměrně {(totalEarnings / (stats.length || 1)).toFixed(0)} € / os</p>
                </div>

                <div className="glass-card p-8 rounded-[3rem] border border-white/10 relative overflow-hidden group bg-gradient-to-br from-emerald-500/10 to-transparent">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <svg className="w-32 h-32 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    </div>
                    <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-2">Výkon Týmu</p>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-6xl font-black text-white">{totalTables}</h2>
                        <span className="text-2xl font-black text-emerald-500">ks</span>
                    </div>
                    <p className="mt-4 text-slate-400 font-bold text-sm">Hotových stolů v tomto období</p>
                </div>
            </div>

            {/* Workers Table */}
            <div className="glass-card rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl">
                <div className="px-8 py-6 border-b border-white/5 bg-black/20 flex justify-between items-center">
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">
                        {isAdmin ? 'Detailní rozpis plateb' : 'Moje statistiky'}
                    </h3>
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/40">
                                <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Pracovník</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Hodiny</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Stringy (Úkol)</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Bonusy / Pole</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Efektivita</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Odměna celkem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {stats.map((s, idx) => (
                                <tr key={s.worker.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-lg"
                                                style={{ backgroundColor: s.worker.color || 'var(--color-accent)' }}
                                            >
                                                {s.worker.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-white font-black uppercase text-sm">{s.worker.name}</p>
                                                <p className="text-gray-500 text-[10px] font-bold tracking-widest">
                                                    {s.worker.hourlyRate}€/h • {s.worker.stringPrice}€/str
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-white font-black text-lg">{s.hours}<span className="text-[10px] text-slate-500 ml-1">h</span></span>
                                            <span className="text-[10px] font-bold text-slate-500">{s.hourlyEarnings} €</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-emerald-400 font-black text-lg">{s.strings}<span className="text-[10px] text-slate-500 ml-1">str</span></span>
                                            <span className="text-[10px] font-bold text-slate-500">{s.stringEarnings} €</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col gap-1">
                                            {Number(s.fixedTaskEarnings) > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                    <span className="text-white font-bold text-xs">{s.tasksCount} bonusů</span>
                                                    <span className="text-[10px] font-bold text-indigo-400">({s.fixedTaskEarnings} €)</span>
                                                </div>
                                            )}
                                            {s.tables > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                                    <span className="text-gray-400 font-bold text-xs">{s.tables} stolů (info)</span>
                                                </div>
                                            )}
                                            {Number(s.fixedTaskEarnings) === 0 && s.tables === 0 && (
                                                <span className="text-slate-600 text-[10px] font-bold">-</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <div className="inline-block px-3 py-1 rounded-lg bg-white/5 border border-white/10">
                                            <span className={`font-black text-sm ${Number(s.efficiency) > 15 ? 'text-emerald-400' : 'text-slate-300'}`}>{isNaN(Number(s.efficiency)) ? '0.00' : s.efficiency}</span>
                                            <span className="text-[10px] text-slate-500 ml-1">€/h</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <p className="text-2xl font-black text-white group-hover:text-indigo-400 transition-colors">{s.earnings} €</p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards View */}
                <div className="md:hidden flex flex-col divide-y divide-white/5">
                    {stats.map((s, idx) => (
                        <div key={s.worker.id} className="p-6 space-y-6">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg"
                                        style={{ backgroundColor: s.worker.color || 'var(--color-accent)' }}
                                    >
                                        {s.worker.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-white font-black uppercase text-base">{s.worker.name}</p>
                                        <p className="text-gray-500 text-[10px] font-bold tracking-widest mt-0.5">
                                            {s.worker.hourlyRate}€/h • {s.worker.stringPrice}€/str
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-black text-white tracking-tighter">{s.earnings} €</p>
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Celkem</p>
                                </div>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Hodiny</p>
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-xl font-black text-white">{s.hours}</span>
                                        <span className="text-[10px] font-bold text-slate-400">{s.hourlyEarnings} €</span>
                                    </div>
                                </div>
                                <div className="p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Stringy</p>
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-xl font-black text-emerald-400">{s.strings}</span>
                                        <span className="text-[10px] font-bold text-slate-400">{s.stringEarnings} €</span>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed List items */}
                            <div className="space-y-3 pt-2">
                                {(Number(s.fixedTaskEarnings) > 0 || s.tables > 0) ? (
                                    <>
                                        {Number(s.fixedTaskEarnings) > 0 && (
                                            <div className="flex items-center justify-between p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                    <span className="text-indigo-200 font-bold text-xs">{s.tasksCount} splněných úkolů</span>
                                                </div>
                                                <span className="text-white font-black text-sm">+{s.fixedTaskEarnings} €</span>
                                            </div>
                                        )}
                                        {s.tables > 0 && (
                                            <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                    <span className="text-emerald-200 font-bold text-xs">{s.tables} hotových stolů</span>
                                                </div>
                                                <span className="text-white font-black text-sm">Info</span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="p-3 text-center text-[10px] font-bold text-slate-600 italic">
                                        Žádné další bonusy ani stoly
                                    </div>
                                )}
                            </div>

                            {/* Efficiency Footer */}
                            <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Efektivita práce</span>
                                <span className={`font-black text-sm ${Number(s.efficiency) > 15 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                    {isNaN(Number(s.efficiency)) ? '0.00' : s.efficiency} €/h
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Motivation Section */}
            {!isAdmin && (
                <div className="p-8 bg-indigo-600 rounded-[3rem] shadow-2xl relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Makáš skvěle! ⚡</h3>
                        <p className="text-indigo-200 font-bold">V tomto týdnu jsi už vydělal o 15% více než minule. Jen tak dál!</p>
                    </div>
                    <div className="absolute -bottom-4 -right-4 text-indigo-500/20">
                        <CashIcon className="w-48 h-48" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Payroll;
