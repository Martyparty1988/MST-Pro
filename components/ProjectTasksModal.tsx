import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { useI18n } from '../contexts/I18nContext';
import type { Project, ProjectTask, Worker } from '../types';
import ConfirmationModal from './ConfirmationModal';
import { firebaseService } from '../services/firebaseService';
import ClockIcon from './icons/ClockIcon';
import PlusIcon from './icons/PlusIcon';

interface ProjectTasksModalProps {
    project: Project;
    onClose: () => void;
}

const ProjectTasksModal: React.FC<ProjectTasksModalProps> = ({ project, onClose }) => {
    const { t } = useI18n();
    const tasks = useLiveQuery(() => db.projectTasks.where('projectId').equals(project.id!).toArray(), [project.id]);
    const workers = useLiveQuery(() => db.workers.toArray());

    // Fetch all incomplete tasks to calculate global workload for each worker
    const allActiveTasks = useLiveQuery(() => db.projectTasks.filter(t => !t.completionDate).toArray());
    const projectTables = useLiveQuery(() => db.fieldTables.where('projectId').equals(project.id!).toArray(), [project.id]);

    const [showAddForm, setShowAddForm] = useState(false);
    const [taskType, setTaskType] = useState<'panels' | 'construction' | 'cables'>('construction');
    const [description, setDescription] = useState('');
    const [panelCount, setPanelCount] = useState('');
    const [pricePerPanel, setPricePerPanel] = useState('');
    const [tableSize, setTableSize] = useState<'small' | 'medium' | 'large'>('small');
    const [price, setPrice] = useState('');
    const [hoursSpent, setHoursSpent] = useState('');
    const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
    const [taskToDelete, setTaskToDelete] = useState<number | null>(null);
    const [workerFilter, setWorkerFilter] = useState<number | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');

    const workerMap = useMemo(() => new Map(workers?.map(w => [w.id!, w.name])), [workers]);

    // Filtered tasks logic
    const filteredTasks = useMemo(() => {
        if (!tasks) return [];
        return tasks.filter(task => {
            const matchesWorker = workerFilter === 'all' || task.assignedWorkerId === workerFilter;
            const matchesStatus = statusFilter === 'all'
                ? true
                : statusFilter === 'completed'
                    ? !!task.completionDate
                    : !task.completionDate;
            return matchesWorker && matchesStatus;
        });
    }, [tasks, workerFilter, statusFilter]);

    // Individual Progress Logic
    const workerProgress = useMemo(() => {
        if (!tasks || !workers) return [];
        const stats: Record<number, { name: string, total: number, completed: number }> = {};

        tasks.forEach(task => {
            if (task.assignedWorkerId) {
                if (!stats[task.assignedWorkerId]) {
                    stats[task.assignedWorkerId] = {
                        name: workerMap.get(task.assignedWorkerId) || '?',
                        total: 0,
                        completed: 0
                    };
                }
                stats[task.assignedWorkerId].total++;
                if (task.completionDate) stats[task.assignedWorkerId].completed++;
            }
        });

        return Object.entries(stats).map(([id, data]) => ({
            id: Number(id),
            ...data,
            percent: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
        })).sort((a, b) => b.percent - a.percent);
    }, [tasks, workers, workerMap]);

    // Overall Progress Calculations
    const stats = useMemo(() => {
        if (!tasks) return null;
        const total = tasks.length;
        const completed = tasks.filter(t => t.completionDate).length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        const breakdown = {
            panels: { total: 0, completed: 0 },
            construction: { total: 0, completed: 0 },
            cables: { total: 0, completed: 0 }
        };

        tasks.forEach(t => {
            breakdown[t.taskType].total++;
            if (t.completionDate) breakdown[t.taskType].completed++;
        });

        return { total, completed, percent, breakdown };
    }, [tasks]);

    const workerLoad = useMemo(() => {
        const load: Record<number, number> = {};
        allActiveTasks?.forEach(t => {
            if (t.assignedWorkerId) {
                load[t.assignedWorkerId] = (load[t.assignedWorkerId] || 0) + 1;
            }
        });
        return load;
    }, [allActiveTasks]);

    const resetForm = () => {
        setShowAddForm(false);
        setTaskType('construction');
        setDescription('');
        setPanelCount('');
        setPricePerPanel('');
        setTableSize('small');
        setPrice('');
        setHoursSpent('');
        setSelectedTableIds([]);
    }

    const handleToggleCompletion = async (task: ProjectTask) => {
        const newDate = task.completionDate ? undefined : new Date();
        await db.projectTasks.update(task.id!, {
            completionDate: newDate
        });

        if (firebaseService.isReady) {
            firebaseService.upsertRecords('projectTasks', [{
                ...task,
                completionDate: newDate ? newDate.toISOString() : undefined
            }]).catch(console.error);
        }
    };

    const handleAssignWorker = async (taskId: number, workerId: number | '') => {
        const assignedId = workerId === '' ? undefined : Number(workerId);
        await db.projectTasks.update(taskId, { assignedWorkerId: assignedId });

        if (firebaseService.isReady) {
            const task = await db.projectTasks.get(taskId);
            if (task) {
                firebaseService.upsertRecords('projectTasks', [{
                    ...task,
                    assignedWorkerId: assignedId,
                    tableIds: task.tableIds,
                    completionDate: task.completionDate ? (task.completionDate instanceof Date ? task.completionDate.toISOString() : task.completionDate) : undefined,
                    startTime: task.startTime ? (task.startTime instanceof Date ? task.startTime.toISOString() : task.startTime) : undefined,
                    endTime: task.endTime ? (task.endTime instanceof Date ? task.endTime.toISOString() : task.endTime) : undefined
                }]).catch(console.error);
            }
        }
    };

    const handleDeleteTask = async () => {
        if (taskToDelete !== null) {
            await db.projectTasks.delete(taskToDelete);

            if (firebaseService.isReady) {
                firebaseService.deleteRecords('projectTasks', [String(taskToDelete)])
                    .catch(console.error);
            }

            setTaskToDelete(null);
        }
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        let taskData: Omit<ProjectTask, 'id'>;

        switch (taskType) {
            case 'panels':
                const count = Number(panelCount);
                const perPanel = Number(pricePerPanel);
                if (count <= 0 || perPanel <= 0) return;
                taskData = {
                    projectId: project.id!,
                    taskType: 'panels',
                    description: t('panels_task_desc', { count }),
                    panelCount: count,
                    pricePerPanel: perPanel,
                    price: count * perPanel,
                    hoursSpent: hoursSpent ? Number(hoursSpent) : undefined,
                    tableSize: undefined
                };
                break;
            case 'cables':
                if (Number(price) <= 0) return;
                taskData = {
                    projectId: project.id!,
                    taskType: 'cables',
                    description: t('cables_task_desc', { size: t(tableSize) }),
                    tableSize: tableSize,
                    price: Number(price),
                    hoursSpent: hoursSpent ? Number(hoursSpent) : undefined,
                    panelCount: undefined,
                    pricePerPanel: undefined
                };
                break;
            case 'construction':
            default:
                if (!description.trim() || Number(price) <= 0) return;
                taskData = {
                    projectId: project.id!,
                    taskType: 'construction',
                    description: description.trim(),
                    price: Number(price),
                    hoursSpent: hoursSpent ? Number(hoursSpent) : undefined,
                    tableIds: selectedTableIds.length > 0 ? selectedTableIds : undefined,
                    panelCount: undefined,
                    pricePerPanel: undefined,
                    tableSize: undefined
                };
                break;
        }

        const taskDataToSave = { ...taskData };
        if (selectedTableIds.length > 0) {
            taskDataToSave.tableIds = selectedTableIds;
        }

        const newId = await db.projectTasks.add(taskDataToSave as ProjectTask);

        if (firebaseService.isReady) {
            firebaseService.upsertRecords('projectTasks', [{ ...taskDataToSave, id: newId }])
                .catch(console.error);
        }

        resetForm();
    };

    const calculatedPrice = useMemo(() => {
        if (taskType === 'panels') {
            const count = Number(panelCount);
            const perPanel = Number(pricePerPanel);
            return (count * perPanel) || 0;
        }
        return Number(price) || 0;
    }, [taskType, panelCount, pricePerPanel, price]);

    const taskTypeOptions: { id: 'construction' | 'panels' | 'cables'; label: string }[] = [
        { id: 'construction', label: t('construction') },
        { id: 'panels', label: t('panels') },
        { id: 'cables', label: t('cables') }
    ];

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-slate-950/40 backdrop-blur-md p-0 md:p-6 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full h-[92vh] md:h-auto md:max-h-[90vh] md:max-w-5xl bg-slate-900/90 md:bg-slate-900/80 backdrop-blur-3xl rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl border-t border-white/10 md:border border-white/5 flex flex-col overflow-hidden pb-safe"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex-shrink-0 p-6 md:p-8 pb-4">
                    <div className="flex justify-between items-start mb-6">
                        <div className="space-y-1">
                            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase italic">{t('tasks')}</h2>
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                <p className="text-sm md:text-lg text-blue-200/60 font-bold uppercase tracking-wider">{project.name}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-3 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-2xl transition-all active:scale-90"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>

                    {/* Individual Progress Dashboard */}
                    <div className="mb-6 overflow-hidden">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Týmový výkon</h3>
                            <div className="flex gap-2">
                                <div className="flex bg-black/40 rounded-xl p-1 border border-white/5 mr-2">
                                    {(['all', 'pending', 'completed'] as const).map(status => (
                                        <button
                                            key={status}
                                            onClick={() => setStatusFilter(status)}
                                            className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${statusFilter === status ? 'bg-white text-black' : 'text-slate-500 hover:text-white'}`}
                                        >
                                            {status === 'all' ? 'Vše' : status === 'pending' ? 'Čeká' : 'Hotovo'}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => { setWorkerFilter('all'); setStatusFilter('all'); }}
                                    className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded text-blue-400 hover:text-white transition-colors"
                                >
                                    Resetovat filtr
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                            {workerProgress.map(wp => (
                                <button
                                    key={wp.id}
                                    onClick={() => setWorkerFilter(wp.id)}
                                    className={`flex-shrink-0 min-w-[160px] p-4 rounded-2xl border transition-all ${workerFilter === wp.id ? 'bg-indigo-600/30 border-indigo-500/50 shadow-lg scale-105' : 'bg-white/5 border-white/5 hover:border-white/20'}`}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-black text-white truncate max-w-[80px]">{wp.name}</span>
                                        <span className="text-[10px] font-mono font-bold text-indigo-300">{wp.completed}/{wp.total}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 transition-all duration-700"
                                            style={{ width: `${wp.percent}%` }}
                                        ></div>
                                    </div>
                                    <div className="mt-1 text-[9px] font-bold text-slate-500 text-right uppercase tracking-tighter">
                                        {wp.percent}% Dokončeno
                                    </div>
                                </button>
                            ))}
                            {workerProgress.length === 0 && (
                                <div className="w-full text-center py-4 bg-white/5 rounded-2xl border border-dashed border-white/10">
                                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Zatím žádná přiřazení</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Overall Progress Progress Bar */}
                    {stats && (
                        <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">
                                <span>Celkový postup úkolů</span>
                                <span className="text-white">{stats.percent}% ({stats.completed}/{stats.total})</span>
                            </div>
                            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden shadow-inner">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-1000"
                                    style={{ width: `${stats.percent}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-grow overflow-y-auto px-6 md:px-8 space-y-4 custom-scrollbar">
                    {filteredTasks && filteredTasks.length > 0 ? (
                        filteredTasks.map(task => (
                            <div key={task.id} className={`group relative overflow-hidden rounded-3xl border transition-all duration-300 ${task.completionDate ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none"></div>
                                <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-6 relative z-10">
                                    <div className="flex-grow space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`text-[9px] font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-full border ${task.completionDate ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                                {t(task.taskType)}
                                            </span>
                                            {task.assignedWorkerId && (
                                                <div
                                                    onClick={() => setWorkerFilter(task.assignedWorkerId!)}
                                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-300 rounded-full border border-indigo-500/20 cursor-pointer hover:bg-indigo-500/20 transition-all active:scale-95"
                                                >
                                                    <div className="w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]"></div>
                                                    <span className="text-[9px] font-black uppercase tracking-wider">{workerMap.get(task.assignedWorkerId)}</span>
                                                </div>
                                            )}
                                        </div>
                                        <h4 className={`text-xl font-bold tracking-tight leading-snug ${task.completionDate ? 'text-slate-500 italic' : 'text-white'}`}>
                                            {task.description}
                                        </h4>
                                        {task.tableIds && task.tableIds.length > 0 && (
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {task.tableIds.map(tid => (
                                                    <span key={tid} className="flex items-center gap-1.5 px-2 py-0.5 bg-black/20 border border-white/5 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                        <div className="w-0.5 h-1.5 bg-slate-500/50 rounded-full"></div>
                                                        {tid}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 flex-shrink-0">
                                        <div className="w-full sm:w-auto flex flex-col items-center sm:items-end justify-center px-6 py-3 rounded-2xl bg-black/30 border border-white/5 shadow-inner min-w-[120px]">
                                            <div className="text-lg font-mono font-black text-white">€{task.price.toFixed(2)}</div>
                                            {task.hoursSpent && task.hoursSpent > 0 && (
                                                <div className="text-[9px] font-bold text-emerald-400/70 uppercase tracking-widest mt-0.5">
                                                    €{(task.price / task.hoursSpent).toFixed(2)}/h
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <div className="relative group/select flex-1 sm:flex-none">
                                                <select
                                                    value={task.assignedWorkerId || ''}
                                                    onChange={(e) => handleAssignWorker(task.id!, e.target.value === '' ? '' : Number(e.target.value))}
                                                    className={`w-full sm:w-auto pl-4 pr-10 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest appearance-none border transition-all cursor-pointer focus:ring-2 focus:ring-indigo-500/50 ${task.assignedWorkerId
                                                        ? 'bg-indigo-600/10 text-indigo-300 border-indigo-500/30'
                                                        : 'bg-white/5 text-slate-500 border-white/5 hover:border-white/10'
                                                        } [&>option]:bg-slate-900`}
                                                    disabled={!!task.completionDate}
                                                >
                                                    <option value="">{t('assign_worker')}...</option>
                                                    {workers?.map(w => {
                                                        const load = workerLoad[w.id!] || 0;
                                                        return (
                                                            <option key={w.id} value={w.id}>
                                                                {w.name} ({load})
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleToggleCompletion(task)}
                                                className={`p-3.5 rounded-2xl transition-all shadow-xl active:scale-95 ${task.completionDate
                                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                    : 'bg-emerald-500 text-black border border-emerald-400'
                                                    }`}
                                                title={task.completionDate ? t('mark_as_incomplete') : t('mark_as_complete')}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            </button>

                                            <button
                                                onClick={() => setTaskToDelete(task.id!)}
                                                className="p-3.5 bg-white/5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl transition-all border border-white/5 hover:border-rose-500/20 active:scale-90"
                                                title={t('delete')}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className={`h-1 w-full opacity-20 bg-gradient-to-r ${task.completionDate ? 'from-emerald-500 to-green-600' : 'from-indigo-500 to-blue-600'}`}></div>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
                            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/5 shadow-inner">
                                <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 00 2 2h10a2 2 0 00 2-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                            </div>
                            <div className="space-y-1">
                                <p className="text-2xl font-black text-slate-500 uppercase tracking-tighter italic">{t('no_tasks_found')}</p>
                                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t('no_tasks_found_desc') || "Zatím žádné zapsané úkoly pro tento projekt"}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-shrink-0 p-6 md:p-8 bg-black/20 border-t border-white/5">
                    {showAddForm ? (
                        <form onSubmit={handleAddTask} className="space-y-6 animate-slide-up">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">{t('add_task')}</h3>
                                <div className="inline-flex rounded-2xl bg-black/40 p-1.5 border border-white/10 w-full sm:w-auto overflow-x-auto no-scrollbar">
                                    {taskTypeOptions.map(opt => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setTaskType(opt.id)}
                                            className={`flex-1 sm:flex-none px-5 py-2.5 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest whitespace-nowrap ${taskType === opt.id ? 'bg-white text-black shadow-lg scale-[1.02]' : 'text-slate-500 hover:text-white'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {taskType === 'construction' && (
                                    <>
                                        <div className="md:col-span-2 relative group">
                                            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('task_description')} required className="w-full p-4 bg-black/40 text-white border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 font-bold transition-all" />
                                        </div>
                                        <div className="relative">
                                            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder={t('flat_rate')} min="0" step="0.01" required className="w-full p-4 bg-black/40 text-white border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 font-bold transition-all" />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">€</span>
                                        </div>
                                    </>
                                )}
                                {taskType === 'panels' && (
                                    <>
                                        <div className="relative">
                                            <input type="number" value={panelCount} onChange={e => setPanelCount(e.target.value)} placeholder={t('panel_count')} min="1" step="1" required className="w-full p-4 bg-black/40 text-white border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 font-bold transition-all" />
                                        </div>
                                        <div className="relative">
                                            <input type="number" value={pricePerPanel} onChange={e => setPricePerPanel(e.target.value)} placeholder={t('price_per_panel')} min="0" step="0.01" required className="w-full p-4 bg-black/40 text-white border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 font-bold transition-all" />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">€</span>
                                        </div>
                                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 flex flex-col justify-center">
                                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">{t('total_price')}</span>
                                            <span className="text-lg font-mono font-black text-white leading-none">€{calculatedPrice.toFixed(2)}</span>
                                        </div>
                                    </>
                                )}
                                {taskType === 'cables' && (
                                    <>
                                        <select value={tableSize} onChange={e => setTableSize(e.target.value as any)} className="w-full p-4 bg-black/40 text-white border border-white/10 rounded-2xl font-bold appearance-none transition-all cursor-pointer focus:ring-2 focus:ring-indigo-500/50 [&>option]:bg-slate-900">
                                            <option value="small">{t('small')}</option>
                                            <option value="medium">{t('medium')}</option>
                                            <option value="large">{t('large')}</option>
                                        </select>
                                        <div className="relative">
                                            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder={t('task_price')} min="0" step="0.01" required className="w-full p-4 bg-black/40 text-white border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 font-bold transition-all" />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">€</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex flex-col lg:flex-row gap-6">
                                {/* Estimation Section */}
                                <div className="flex-1 space-y-3">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Odhad času & Efektivita</label>
                                    <div className="flex items-center gap-4">
                                        <div className="relative flex-grow">
                                            <input
                                                type="number"
                                                value={hoursSpent}
                                                onChange={e => setHoursSpent(e.target.value)}
                                                placeholder="Kolik hodin (est.)?"
                                                min="0"
                                                step="0.5"
                                                className="w-full p-4 bg-black/40 text-white border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 font-bold transition-all"
                                            />
                                            <ClockIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 pointer-events-none" />
                                        </div>
                                        {hoursSpent && Number(hoursSpent) > 0 && calculatedPrice > 0 && (
                                            <div className="px-6 py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col items-center justify-center min-w-[120px]">
                                                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-1">Hodinová</span>
                                                <span className="text-sm font-black text-white leading-none">€{(calculatedPrice / Number(hoursSpent)).toFixed(2)}/h</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Table Selector for tasks */}
                                <div className="flex-1 space-y-3">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Přiřadit ke stolům ({selectedTableIds.length})</label>
                                    <div className="flex flex-wrap gap-2 max-h-[88px] overflow-y-auto p-3 bg-black/40 rounded-2xl border border-white/10 custom-scrollbar">
                                        {projectTables?.map(tbl => (
                                            <button
                                                key={tbl.id}
                                                type="button"
                                                onClick={() => {
                                                    const next = [...selectedTableIds];
                                                    const idx = next.indexOf(tbl.tableId);
                                                    if (idx >= 0) next.splice(idx, 1);
                                                    else next.push(tbl.tableId);
                                                    setSelectedTableIds(next);
                                                }}
                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border ${selectedTableIds.includes(tbl.tableId)
                                                    ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20'
                                                    : 'bg-white/5 border-white/5 text-slate-500 hover:text-white hover:border-white/20'
                                                    }`}
                                            >
                                                {tbl.tableId}
                                            </button>
                                        ))}
                                        {(!projectTables || projectTables.length === 0) && (
                                            <p className="text-[10px] text-slate-600 font-bold italic w-full text-center py-2 uppercase tracking-widest">{t('no_tables_defined')}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end pt-2">
                                <button type="button" onClick={resetForm} className="px-8 py-4 bg-white/5 text-slate-400 font-black rounded-2xl hover:bg-white/10 hover:text-white transition-all uppercase tracking-widest text-[10px]">{t('cancel')}</button>
                                <button type="submit" className="flex-1 sm:flex-none px-10 py-4 bg-white text-black font-black rounded-2xl hover:bg-emerald-500 hover:text-white shadow-xl transition-all active:scale-95 uppercase tracking-widest text-[10px]">{t('add')}</button>
                            </div>
                        </form>
                    ) : (
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="w-full py-6 bg-white/5 border-2 border-dashed border-white/10 text-slate-500 font-black rounded-3xl hover:bg-white/10 hover:text-white hover:border-white/30 transition-all uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 active:scale-98"
                        >
                            <PlusIcon className="w-5 h-5" />
                            {t('add_task')}
                        </button>
                    )}
                </div>
            </div>

            {
                taskToDelete !== null && (
                    <ConfirmationModal
                        title={t('delete_task_title')}
                        message={t('confirm_delete')}
                        onConfirm={handleDeleteTask}
                        onCancel={() => setTaskToDelete(null)}
                        variant="danger"
                    />
                )
            }
        </div >
    );
};

export default ProjectTasksModal;