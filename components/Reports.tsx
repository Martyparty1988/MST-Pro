
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { useI18n } from '../contexts/I18nContext';
import type { TimeRecord, Worker, Project, ProjectTask } from '../types';
import DocumentTextIcon from './icons/DocumentTextIcon';
import DownloadIcon from './icons/DownloadIcon';

// Helper to get today's date in YYYY-MM-DD format
const getTodayString = () => new Date().toISOString().split('T')[0];

const Reports: React.FC = () => {
    const { t } = useI18n();
    const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
    const [selectedDate, setSelectedDate] = useState(getTodayString);
    const [selectedWeek, setSelectedWeek] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const [reportData, setReportData] = useState<{ records: TimeRecord[], tasks: ProjectTask[] } | null>(null);
    const [reportStats, setReportStats] = useState<{ totalHours: number; totalHourlyCost: number; totalTaskCost: number; title: string } | null>(null);

    const workers = useLiveQuery(() => db.workers.toArray());
    const projects = useLiveQuery(() => db.projects.toArray());
    const allRecords = useLiveQuery(() => db.records.toArray());
    const allTasks = useLiveQuery(() => db.projectTasks.toArray());

    const workerMap = useMemo(() => new Map<number, Worker>(workers?.map(w => [w.id!, w]) || []), [workers]);
    const projectMap = useMemo(() => new Map<number, Project>(projects?.map(p => [p.id!, p]) || []), [projects]);

    const handleGenerateReport = () => {
        if (!allRecords || !workers || !allTasks) {
            setReportData({ records: [], tasks: [] });
            return;
        }

        let startDate: Date;
        let endDate: Date;
        let title = '';

        switch (reportType) {
            case 'daily': {
                if (!selectedDate) return;
                startDate = new Date(selectedDate);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(selectedDate);
                endDate.setHours(23, 59, 59, 999);
                title = `${t('report_for')} ${startDate.toLocaleDateString()}`;
                break;
            }
            case 'weekly': {
                if (!selectedWeek) return;
                const [year, week] = selectedWeek.split('-W').map(Number);
                const firstDayOfYear = new Date(year, 0, 1);
                const days = (week - 1) * 7;
                startDate = new Date(firstDayOfYear.setDate(firstDayOfYear.getDate() + days - firstDayOfYear.getDay() + 1));
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                endDate.setHours(23, 59, 59, 999);
                title = `${t('report_for')} ${t('week')} ${week}, ${year}`;
                break;
            }
            case 'monthly': {
                if (!selectedMonth) return;
                const [year, month] = selectedMonth.split('-').map(Number);
                startDate = new Date(year, month - 1, 1);
                endDate = new Date(year, month, 0);
                endDate.setHours(23, 59, 59, 999);
                title = `${t('report_for')} ${startDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`;
                break;
            }
            case 'custom': {
                if (!customStart || !customEnd) return;
                startDate = new Date(customStart);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(customEnd);
                endDate.setHours(23, 59, 59, 999);
                title = `${t('report_for')} ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
                break;
            }
            default:
                return;
        }

        const filteredRecords = allRecords.filter(record => {
            const recordTime = new Date(record.startTime).getTime();
            return recordTime >= startDate.getTime() && recordTime <= endDate.getTime();
        });

        const filteredTasks = allTasks.filter(task => {
            if (!task.completionDate) return false;
            const taskTime = new Date(task.completionDate).getTime();
            return taskTime >= startDate.getTime() && taskTime <= endDate.getTime();
        });

        let totalHours = 0;
        let totalHourlyCost = 0;

        filteredRecords.forEach(record => {
            const durationMs = new Date(record.endTime).getTime() - new Date(record.startTime).getTime();
            const durationHours = durationMs / (1000 * 60 * 60);
            totalHours += durationHours;

            const worker = workerMap.get(record.workerId);
            if (worker) {
                totalHourlyCost += durationHours * worker.hourlyRate;
            }
        });

        const totalTaskCost = filteredTasks.reduce((sum, task) => sum + task.price, 0);

        setReportData({
            records: filteredRecords.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
            tasks: filteredTasks.sort((a, b) => new Date(a.completionDate!).getTime() - new Date(b.completionDate!).getTime())
        });
        setReportStats({ totalHours, totalHourlyCost, totalTaskCost, title });
    };

    const handleExportCSV = () => {
        if (!reportData) return;

        const escapeCSV = (str: string) => {
            if (typeof str !== 'string') return str;
            const escaped = str.replace(/"/g, '""');
            return `"${escaped}"`;
        };

        const headers = [
            t('type'),
            t('worker_name'),
            t('project_name'),
            t('description'),
            t('date_or_start_time'),
            t('end_time'),
            t('duration'),
            t('cost')
        ];

        const recordRows = reportData.records.map(record => {
            const worker = workerMap.get(record.workerId);
            const workerName = worker?.name || 'N/A';
            const projectName = projectMap.get(record.projectId)?.name || 'N/A';
            const startTime = new Date(record.startTime).toLocaleString();
            const endTime = new Date(record.endTime).toLocaleString();
            const durationMs = new Date(record.endTime).getTime() - new Date(record.startTime).getTime();
            const hours = Math.floor(durationMs / 3600000);
            const minutes = Math.floor((durationMs % 3600000) / 60000);
            const duration = `${hours}h ${minutes}m`;
            const cost = ((durationMs / (1000 * 60 * 60)) * (worker?.hourlyRate || 0)).toFixed(2);

            return [
                escapeCSV('Hourly'),
                escapeCSV(workerName),
                escapeCSV(projectName),
                escapeCSV(record.description),
                escapeCSV(startTime),
                escapeCSV(endTime),
                escapeCSV(duration),
                escapeCSV(cost)
            ].join(',');
        });

        const taskRows = reportData.tasks.map(task => {
            const workerName = task.assignedWorkerId ? (workerMap.get(task.assignedWorkerId)?.name || 'N/A') : 'N/A';
            const projectName = projectMap.get(task.projectId)?.name || 'N/A';
            const completionDate = new Date(task.completionDate!).toLocaleDateString();

            return [
                escapeCSV('Task'),
                escapeCSV(workerName),
                escapeCSV(projectName),
                escapeCSV(task.description),
                escapeCSV(completionDate),
                escapeCSV(''),
                escapeCSV(''),
                escapeCSV(task.price.toFixed(2))
            ].join(',');
        });

        const csvContent = [headers.map(escapeCSV).join(','), ...recordRows, ...taskRows].join('\n');

        // Use UTF-8 with BOM for Excel compatibility
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `MST_Report_${reportStats?.title.replace(/[^a-z0-9]/gi, '_') || 'export'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const renderDateInputs = () => {
        switch (reportType) {
            case 'daily':
                return <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full p-5 bg-black/40 text-white border border-white/5 rounded-3xl outline-none focus:border-indigo-500/50 transition-all text-sm font-bold" />;
            case 'weekly':
                return <input type="week" value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} className="w-full p-5 bg-black/40 text-white border border-white/5 rounded-3xl outline-none focus:border-indigo-500/50 transition-all text-sm font-bold" />;
            case 'monthly':
                return <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full p-5 bg-black/40 text-white border border-white/5 rounded-3xl outline-none focus:border-indigo-500/50 transition-all text-sm font-bold" />;
            case 'custom':
                return (
                    <div className="flex flex-col sm:flex-row gap-4 w-full">
                        <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="flex-1 p-5 bg-black/40 text-white border border-white/5 rounded-3xl outline-none focus:border-indigo-500/50 transition-all text-sm font-bold" placeholder={t('start_date')} />
                        <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="flex-1 p-5 bg-black/40 text-white border border-white/5 rounded-3xl outline-none focus:border-indigo-500/50 transition-all text-sm font-bold" placeholder={t('end_date')} />
                    </div>
                );
            default:
                return null;
        }
    }

    const calculateDuration = (start: Date, end: Date) => {
        const diffMs = new Date(end).getTime() - new Date(start).getTime();
        if (diffMs < 0) return 'Invalid';
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        return `${hours}h ${minutes}m`;
    };

    return (
        <div>
            <div className="flex items-center gap-4 mb-8">
                <DocumentTextIcon className="w-12 h-12 text-[var(--color-accent)]" />
                <h1 className="text-5xl font-bold text-white [text-shadow:0_4px_12px_rgba(0,0,0,0.5)]">{t('reports')}</h1>
            </div>

            {/* Report Generator Controls */}
            <div className="p-10 bg-[#0a0c1a]/60 backdrop-blur-3xl rounded-[3rem] border border-white/5 shadow-2xl mb-12 animate-slide-up">
                <div className="flex flex-col lg:flex-row gap-10 items-end">
                    <div className="flex-1 space-y-4 w-full">
                        <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] ml-2">{t('report_type')}</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 bg-black/40 rounded-3xl border border-white/5">
                            {(['daily', 'weekly', 'monthly', 'custom'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setReportType(type)}
                                    className={`py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${reportType === type ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-white'}`}
                                >
                                    {t(type as any)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 space-y-4 w-full">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('select_period') || 'Období'}</label>
                        <div className="flex flex-col sm:flex-row gap-4">
                            {renderDateInputs()}
                        </div>
                    </div>

                    <button
                        onClick={handleGenerateReport}
                        className="w-full lg:w-auto px-12 py-5 bg-white text-black font-black rounded-3xl hover:bg-indigo-600 hover:text-white transition-all shadow-xl uppercase tracking-[0.2em] text-xs active:scale-95"
                    >
                        {t('generate_report')}
                    </button>
                </div>
            </div>

            {reportData && reportStats && (
                <div className="space-y-12 animate-fade-in print:p-0">
                    {/* Header with Export */}
                    <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-white/5 pb-10">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Exportované data</span>
                            </div>
                            <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">{reportStats.title}</h2>
                        </div>
                        <button
                            onClick={handleExportCSV}
                            className="flex items-center gap-3 px-8 py-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black rounded-3xl hover:bg-emerald-500 hover:text-white transition-all shadow-xl uppercase tracking-widest text-[10px] active:scale-95"
                        >
                            <DownloadIcon className="w-4 h-4" />
                            {t('export_csv')}
                        </button>
                    </div>

                    {/* Top Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="group p-8 bg-black/40 backdrop-blur-xl rounded-[2.5rem] border border-white/5 hover:border-indigo-500/30 transition-all shadow-lg overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                                <DocumentTextIcon className="w-32 h-32" />
                            </div>
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">{t('total_hourly_cost')}</h3>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-white italic tracking-tighter">€{reportStats.totalHourlyCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-600 mt-2 uppercase tracking-tight">{reportStats.totalHours.toFixed(2)} {t('hours')}</p>
                        </div>

                        <div className="group p-8 bg-black/40 backdrop-blur-xl rounded-[2.5rem] border border-white/5 hover:border-indigo-500/30 transition-all shadow-lg overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                                <DocumentTextIcon className="w-32 h-32" />
                            </div>
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">{t('total_task_cost')}</h3>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-white italic tracking-tighter">€{reportStats.totalTaskCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-600 mt-2 uppercase tracking-tight">{reportData.tasks.length} {t('tasks')}</p>
                        </div>

                        <div className="group p-1 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2.5rem] shadow-2xl shadow-indigo-500/10">
                            <div className="h-full w-full p-8 bg-[#0a0c1a]/95 backdrop-blur-3xl rounded-[2.4rem]">
                                <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-6">{t('total_cost')}</h3>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-5xl font-black text-white italic tracking-tighter">€{(reportStats.totalHourlyCost + reportStats.totalTaskCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="mt-4 flex gap-2">
                                    <span className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black text-white uppercase tracking-tighter">Brutto</span>
                                    <span className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black text-indigo-300 uppercase tracking-tighter">Verified</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Lists */}
                    <div className="space-y-20 pt-10">
                        {/* Records Table */}
                        <div className="space-y-8">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-black text-white italic tracking-tighter uppercase">{t('work_log')}</h3>
                                <div className="px-4 py-1.5 bg-white/5 rounded-full border border-white/5">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{reportData.records.length} záznamů</span>
                                </div>
                            </div>

                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-hidden rounded-[2rem] border border-white/5 bg-black/20">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-white/[0.02]">
                                        <tr>
                                            <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('worker_name')}</th>
                                            <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('project_name')}</th>
                                            <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest hidden md:table-cell">{t('description')}</th>
                                            <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">{t('duration')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {reportData.records.map(record => (
                                            <tr key={record.id} className="group hover:bg-white/[0.02] transition-colors">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-300 uppercase italic">
                                                            {workerMap.get(record.workerId)?.name.substring(0, 2)}
                                                        </div>
                                                        <span className="text-sm font-black text-white italic tracking-tight uppercase">{workerMap.get(record.workerId)?.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">{projectMap.get(record.projectId)?.name}</span>
                                                </td>
                                                <td className="px-8 py-6 hidden md:table-cell">
                                                    <span className="text-xs text-slate-500 leading-relaxed font-medium block max-w-xs truncate group-hover:max-w-none group-hover:whitespace-normal transition-all">{record.description}</span>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <span className="text-sm font-black text-white italic tracking-tighter">{calculateDuration(record.startTime, record.endTime)}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Records Cards */}
                            <div className="md:hidden space-y-4">
                                {reportData.records.map(record => (
                                    <div key={record.id} className="bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-300 uppercase italic">
                                                    {workerMap.get(record.workerId)?.name.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-white italic uppercase">{workerMap.get(record.workerId)?.name}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{projectMap.get(record.projectId)?.name}</p>
                                                </div>
                                            </div>
                                            <span className="text-lg font-black text-white italic tracking-tighter">{calculateDuration(record.startTime, record.endTime)}</span>
                                        </div>
                                        <div className="pt-3 border-t border-white/5">
                                            <p className="text-xs text-slate-400 leading-relaxed">{record.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Tasks Table */}
                        <div className="space-y-8">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-black text-white italic tracking-tighter uppercase">{t('tasks')}</h3>
                                <div className="px-4 py-1.5 bg-white/5 rounded-full border border-white/5">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{reportData.tasks.length} položek</span>
                                </div>
                            </div>

                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-hidden rounded-[2rem] border border-white/5 bg-black/20">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-white/[0.02]">
                                        <tr>
                                            <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('worker_name')}</th>
                                            <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('project_name')}</th>
                                            <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest hidden md:table-cell">{t('task_description')}</th>
                                            <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">{t('cost')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {reportData.tasks.map(task => (
                                            <tr key={task.id} className="group hover:bg-white/[0.02] transition-colors">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-[10px] font-black text-purple-300 uppercase italic">
                                                            {(task.assignedWorkerId ? workerMap.get(task.assignedWorkerId)?.name : '?')?.substring(0, 2)}
                                                        </div>
                                                        <span className="text-sm font-black text-white italic tracking-tight uppercase truncate max-w-[120px]">
                                                            {task.assignedWorkerId ? workerMap.get(task.assignedWorkerId)?.name : t('unassigned')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">{projectMap.get(task.projectId)?.name}</span>
                                                </td>
                                                <td className="px-8 py-6 hidden md:table-cell">
                                                    <span className="text-xs text-slate-500 leading-relaxed font-medium block max-w-xs">{task.description}</span>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <span className="text-sm font-black text-white italic tracking-tighter">€{task.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Tasks Cards */}
                            <div className="md:hidden space-y-4">
                                {reportData.tasks.map(task => (
                                    <div key={task.id} className="bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xs font-black text-purple-300 uppercase italic">
                                                    {(task.assignedWorkerId ? workerMap.get(task.assignedWorkerId)?.name : '?')?.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-white italic uppercase truncate max-w-[120px]">
                                                        {task.assignedWorkerId ? workerMap.get(task.assignedWorkerId)?.name : t('unassigned')}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{projectMap.get(task.projectId)?.name}</p>
                                                </div>
                                            </div>
                                            <span className="text-lg font-black text-white italic tracking-tighter">€{task.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="pt-3 border-t border-white/5">
                                            <p className="text-xs text-slate-400 leading-relaxed">{task.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reports;
