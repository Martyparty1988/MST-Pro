
import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { firebaseService } from '../services/firebaseService';
import type { ProjectTask, Project, TimeRecord } from '../types';
import { soundService } from '../services/soundService';
import { useNavigate } from 'react-router-dom';

const MyTasks: React.FC = () => {
    const { currentUser } = useAuth();
    const { t } = useI18n();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const workerId = currentUser?.workerId;

    // Data Queries
    const tasks = useLiveQuery(() =>
        workerId ? db.projectTasks.where('assignedWorkerId').equals(workerId).toArray() : Promise.resolve([])
        , [workerId]);

    const projects = useLiveQuery(() => db.projects.toArray(), []);

    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const activeTask = useMemo(() =>
        tasks?.find(t => t.startTime && !t.endTime && !t.completionDate)
        , [tasks]);

    const pendingTasks = useMemo(() =>
        tasks?.filter(t => !t.startTime && !t.completionDate).sort((a, b) => (a.id || 0) - (b.id || 0))
        , [tasks]);

    const handleStartTask = async (task: ProjectTask) => {
        if (activeTask) {
            showToast("Již máte jeden aktivní úkol. Nejdříve jej dokončete.", "warning");
            return;
        }

        const startTime = new Date();
        try {
            await db.projectTasks.update(task.id!, { startTime });
            if (firebaseService.isReady) {
                await firebaseService.updateRecord('projectTasks', String(task.id!), { startTime: startTime.toISOString() });
            }
            soundService.playClick();
            showToast("Práce zahájena", "success");
        } catch (err) {
            showToast("Chyba při zahájení úkolu", "error");
        }
    };

    const handleFinishTask = async (task: ProjectTask) => {
        const endTime = new Date();
        const startTime = task.startTime ? new Date(task.startTime) : endTime;

        try {
            // 1. Mark task as completed
            await db.projectTasks.update(task.id!, {
                endTime,
                completionDate: endTime
            });

            // 2. Create TimeRecord automatically
            const record: Omit<TimeRecord, 'id'> = {
                workerId: workerId!,
                projectId: task.projectId,
                startTime,
                endTime,
                description: `Úkol: ${task.description}`,
                projectTaskId: task.id,
                tableIds: task.tableIds
            };

            const recordId = await db.records.add(record as TimeRecord);

            // 3. Sync to Firebase
            if (firebaseService.isReady) {
                await firebaseService.updateRecord('projectTasks', String(task.id!), {
                    endTime: endTime.toISOString(),
                    completionDate: endTime.toISOString()
                });
                await firebaseService.upsertRecords('timeRecords', [{
                    ...record,
                    id: recordId,
                    startTime: record.startTime.toISOString(),
                    endTime: record.endTime.toISOString()
                }]);
            }

            soundService.playSuccess();
            showToast("Úkol dokončen a čas zapsán ✅", "success");
        } catch (err) {
            showToast("Chyba při dokončování úkolu", "error");
        }
    };

    const formatDuration = (start: Date, end: Date) => {
        const diff = Math.floor((end.getTime() - start.getTime()) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getProjectName = (projectId: number) => projects?.find(p => p.id === projectId)?.name || 'Neznámý projekt';

    return (
        <div className="space-y-12 pb-24 animate-fade-in max-w-5xl mx-auto p-6 md:p-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative">
                <div className="space-y-1.5 relative z-10 scale-90 origin-left">
                    <h1 className="text-5xl md:text-9xl font-black text-white tracking-tighter uppercase italic leading-[0.85]">
                        Moje<br /><span className="text-indigo-500">Úkoly.</span>
                    </h1>
                </div>

                <div className="ios-card px-5 py-3 border border-white/5 bg-white/[0.02] backdrop-blur-xl relative z-10">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5 opacity-50">Dnes</p>
                    <p className="text-base font-black text-white italic tracking-tighter">{now.toLocaleDateString()}</p>
                </div>

                {/* Background Decoration */}
                <div className="absolute -top-20 -left-20 w-96 h-96 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
            </header>

            {/* Active Task Section */}
            {activeTask ? (
                <section className="relative overflow-hidden rounded-3xl p-6 md:p-10 shadow-xl border border-white/10 group">
                    {/* Dynamic Gradient Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-blue-700 opacity-90 transition-all duration-1000 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-150 mix-blend-soft-light" />

                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/20 blur-[80px] rounded-full animate-pulse" />

                    <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start gap-10">
                        <div className="space-y-6 flex-1">
                            <div className="inline-flex items-center gap-2 bg-black/20 text-white text-[9px] font-black px-4 py-2 rounded-full uppercase tracking-[0.2em] border border-white/10 backdrop-blur-md shadow-lg">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                Právě pracujete
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl md:text-6xl font-black text-white uppercase italic tracking-tighter leading-tight drop-shadow-lg">
                                    {activeTask.description}
                                </h2>
                                <div className="flex items-center gap-3 opacity-90">
                                    <div className="h-px w-8 bg-indigo-300" />
                                    <p className="text-indigo-200 font-bold uppercase text-xs tracking-[0.2em]">{getProjectName(activeTask.projectId)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-3 w-full md:w-auto">
                            <div className="text-right bg-black/20 p-6 rounded-2xl border border-white/10 backdrop-blur-md min-w-[200px] shadow-2xl w-full">
                                <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-1 opacity-60">Doba trvání</p>
                                <p className="text-3xl font-mono font-black text-white tracking-tight">{formatDuration(new Date(activeTask.startTime!), now)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex flex-col sm:flex-row gap-3 relative z-10">
                        <button
                            onClick={() => handleFinishTask(activeTask)}
                            className="flex-1 group/btn relative overflow-hidden bg-white text-black py-4 rounded-xl font-black uppercase tracking-[0.1em] text-[10px] hover:bg-emerald-400 hover:text-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3"
                        >
                            <div className="absolute inset-0 bg-emerald-400 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-500 ease-in-out" />
                            <span className="relative z-10 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                Hotovo / Dokončit
                            </span>
                        </button>
                        <button
                            onClick={() => navigate(`/chat`)}
                            className="px-10 py-6 bg-black/20 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-3 backdrop-blur-md hover:border-white/20"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                            Problém?
                        </button>
                    </div>
                </section>
            ) : (
                <div className="glass-dark border border-white/5 rounded-[3rem] p-16 text-center animate-fade-in relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                    <div className="relative z-10">
                        <div className="w-24 h-24 bg-white/[0.03] rounded-3xl flex items-center justify-center mx-auto mb-8 border border-white/5 shadow-2xl rotate-3 hover:rotate-6 transition-transform duration-500">
                            <svg className="w-10 h-10 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                        </div>
                        <p className="text-3xl font-black text-slate-500 uppercase italic tracking-tighter mb-4 opacity-50">Žádná aktivní práce</p>
                        <p className="text-sm font-bold text-slate-600 uppercase tracking-[0.2em] max-w-sm mx-auto leading-relaxed">Vyberte si úkol z fronty níže a začněte pracovat na něčem úžasném.</p>
                    </div>
                </div>
            )}

            {/* Tasks Queue */}
            <section className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                    <div className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                    <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Fronta Úkolů <span className="text-indigo-500 text-lg not-italic align-top">({pendingTasks?.length || 0})</span></h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendingTasks?.map((task, idx) => (
                        <div
                            key={task.id}
                            className="group ios-card p-6 border border-white/5 hover:border-indigo-500/30 transition-all duration-300 active:scale-[0.98] relative overflow-hidden"
                            style={{ animationDelay: `${idx * 0.05}s` }}
                        >
                            <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                                <div className="w-20 h-20 bg-indigo-500/20 blur-[40px] rounded-full" />
                            </div>

                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div className="p-4 bg-white/[0.03] rounded-2xl text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-lg border border-white/5">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                </div>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] bg-black/20 px-4 py-2 rounded-full border border-white/5 group-hover:border-indigo-500/20 transition-all">Přiřazeno</span>
                            </div>

                            <div className="space-y-4 relative z-10 mb-8">
                                <h4 className="text-2xl font-black text-white leading-none tracking-tight group-hover:text-indigo-300 transition-colors line-clamp-2">{task.description}</h4>
                                <div className="flex items-center gap-3">
                                    <div className="h-px w-6 bg-slate-700 group-hover:bg-indigo-500/50 transition-colors" />
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{getProjectName(task.projectId)}</p>
                                </div>
                            </div>

                            <button
                                onClick={() => handleStartTask(task)}
                                className="w-full bg-white/5 hover:bg-white text-white hover:text-black py-5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all border border-white/5 hover:border-transparent active:scale-95 shadow-lg relative overflow-hidden group/btn"
                            >
                                <span className="relative z-10">Začít pracovat</span>
                                <div className="absolute inset-0 bg-white opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" />
                            </button>
                        </div>
                    ))}

                    {pendingTasks?.length === 0 && (
                        <div className="col-span-full py-20 text-center glass-dark rounded-[3rem] border border-white/5">
                            <p className="text-2xl font-black text-slate-700 uppercase italic tracking-widest opacity-50">
                                Všechny úkoly jsou hotové 🎉
                            </p>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default MyTasks;
