
import React, { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { firebaseService } from '../services/firebaseService';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import usePullToRefresh from '../hooks/usePullToRefresh';
import type { Project } from '../types';
import ProjectForm from './ProjectForm';
import ProjectTasksModal from './ProjectTasksModal';
import ConfirmationModal from './ConfirmationModal';
import ProjectCard from './ProjectCard';
import SearchIcon from './icons/SearchIcon';
import WorkersIcon from './icons/WorkersIcon';
import PlusIcon from './icons/PlusIcon';
import RedoIcon from './icons/RedoIcon';

const Projects: React.FC = () => {
    const { t } = useI18n();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [showForm, setShowForm] = useState(false);
    const [selectedProject, setSelectedProject] = useState<Project | undefined>(undefined);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'on_hold'>('active');
    const [workerFilter, setWorkerFilter] = useState<number | 'all'>('all');
    const [managingTasksFor, setManagingTasksFor] = useState<Project | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

    const projects = useLiveQuery(() => db.projects.toArray(), []);
    const workers = useLiveQuery(() => db.workers.toArray(), []);
    const allTasks = useLiveQuery(() => db.projectTasks.toArray(), []);

    const handleDataRefresh = useCallback(async () => {
        try {
            await firebaseService.synchronize(true); // Full sync on pull
            showToast('Data byla obnovena', 'success');
        } catch (error) {
            console.error("Failed to refresh data:", error);
            showToast('Nepodařilo se obnovit data', 'error');
        }
    }, [showToast]);

    const { isRefreshing } = usePullToRefresh({ onRefresh: handleDataRefresh });

    const projectsWithWorker = useMemo(() => {
        if (workerFilter === 'all' || !allTasks) return null;
        const projectIds = new Set<number>();
        allTasks.forEach(task => {
            if (task.assignedWorkerId === workerFilter) projectIds.add(task.projectId);
        });
        return projectIds;
    }, [workerFilter, allTasks]);

    const filteredProjects = useMemo(() => {
        if (!projects) return [];
        return projects
            .filter(project => statusFilter === 'all' ? true : project.status === statusFilter)
            .filter(project => !searchTerm ? true : project.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .filter(project => workerFilter === 'all' ? true : projectsWithWorker?.has(project.id!))
            .sort((a, b) => {
                if (a.status === 'active' && b.status !== 'active') return -1;
                if (a.status !== 'active' && b.status === 'active') return 1;
                return (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0);
            });
    }, [projects, searchTerm, statusFilter, workerFilter, projectsWithWorker]);

    const handleAdd = () => { setSelectedProject(undefined); setShowForm(true); };
    const handleEdit = (project: Project) => { setSelectedProject(project); setShowForm(true); };
    const confirmDelete = (project: Project) => { setProjectToDelete(project); };

    const handleDelete = async () => {
        if (projectToDelete?.id) {
            await db.transaction('rw', [db.projects, db.projectTasks, db.solarTables, db.fieldTables], async () => {
                await db.projectTasks.where('projectId').equals(projectToDelete.id!).delete();
                await db.solarTables.where('projectId').equals(projectToDelete.id!).delete();
                await db.fieldTables.where('projectId').equals(projectToDelete.id!).delete();
                await db.projects.delete(projectToDelete.id!);
            });
            showToast('Projekt smazán', 'success');
            setProjectToDelete(null);
        }
    };

    const filterOptions: ('all' | 'active' | 'completed' | 'on_hold')[] = ['all', 'active', 'completed', 'on_hold'];

    return (
        <div className="space-y-12 pb-32">
            <div
                className={`fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${isRefreshing ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'}`}
                style={{ top: 'calc(var(--safe-top, 0px) + 1.5rem)' }}
            >
                <div className="bg-indigo-600 text-white rounded-full p-2 shadow-lg ring-4 ring-indigo-500/20">
                    <RedoIcon className="w-5 h-5 animate-spin" />
                </div>
            </div>

            <header className="space-y-8 md:space-y-12">
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-10">
                    <div className="space-y-6 max-w-3xl">
                        <div className="space-y-2">
                            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter uppercase italic leading-[0.8]">
                                {t('projects')}<span className="text-indigo-500 not-italic">.</span>
                            </h1>
                            <div className="h-2 w-32 md:w-48 bg-indigo-600 rounded-full shadow-[0_4px_20px_rgba(79,70,229,0.5)]" />
                        </div>
                        <p className="text-2xl text-slate-400 font-bold tracking-tight pl-2 border-l-4 border-white/5 py-2">
                            Správa a monitoring solárních parků s maximální efektivitou.
                        </p>
                    </div>
                    {user?.role === 'admin' && (
                        <button
                            onClick={handleAdd}
                            className="group relative w-full xl:w-auto overflow-hidden px-12 py-7 bg-white text-black font-black uppercase tracking-[0.3em] text-[10px] rounded-[2.5rem] hover:scale-105 transition-all duration-500 shadow-[0_30px_60px_-15px_rgba(255,255,255,0.15)] active:scale-95"
                        >
                            <div className="relative z-10 flex items-center justify-center gap-4">
                                <PlusIcon className="w-6 h-6" />
                                {t('add_project')}
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        </button>
                    )}
                </div>

                {/* Project Overview Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                        { label: 'Aktivní', value: projects?.filter(p => p.status === 'active').length || 0, color: 'text-emerald-500' },
                        { label: 'Dokončeno', value: projects?.filter(p => p.status === 'completed').length || 0, color: 'text-indigo-400' },
                        { label: 'Celkový výkon', value: '4.2 MWp', color: 'text-amber-500' },
                        { label: 'Efektivita', value: '88%', color: 'text-white' }
                    ].map((stat, i) => (
                        <div key={i} className="glass-dark p-8 rounded-[3rem] border border-white/5 flex flex-col justify-between h-40 group hover:border-indigo-500/30 transition-all duration-500">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
                                <div className="w-2 h-2 rounded-full bg-white/10 group-hover:bg-indigo-500 transition-colors" />
                            </div>
                            <p className={`text-5xl font-black italic tracking-tighter ${stat.color}`}>{stat.value}</p>
                        </div>
                    ))}
                </div>
            </header>

            {/* Search and Filter Section */}
            <div className="p-10 glass-dark rounded-[4rem] border border-white/5 shadow-2xl relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full" />

                <div className="flex flex-col xl:flex-row gap-6 relative z-10">
                    <div className="relative flex-[2] group">
                        <input
                            type="text"
                            placeholder={`${t('search')}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-14 pr-6 py-6 bg-white/[0.03] text-white placeholder-slate-600 border border-white/5 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:bg-white/[0.05] focus:border-indigo-500/30 text-xs font-black uppercase tracking-[0.2em] transition-all"
                        />
                        <SearchIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-600 group-focus-within:text-indigo-500 transition-colors" />
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 flex-1">
                        <div className="relative flex-1 group">
                            <select
                                value={workerFilter}
                                onChange={(e) => setWorkerFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                className="w-full h-full pl-14 pr-10 py-6 bg-white/[0.03] text-white border border-white/5 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:bg-white/[0.05] focus:border-indigo-500/30 text-[10px] font-black uppercase tracking-widest transition-all appearance-none cursor-pointer [&>option]:bg-slate-900"
                            >
                                <option value="all">{t('all_workers')}</option>
                                {workers?.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                            <WorkersIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-600 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 group-hover:text-indigo-500 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>

                        <div className="relative flex-1 group">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="w-full h-full pl-6 pr-10 py-6 bg-white/[0.03] text-white border border-white/5 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:bg-white/[0.05] focus:border-indigo-500/30 text-[10px] font-black uppercase tracking-widest transition-all appearance-none cursor-pointer [&>option]:bg-slate-900"
                            >
                                {filterOptions.map(status => (
                                    <option key={status} value={status}>{t(status as any)}</option>
                                ))}
                            </select>
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 group-hover:text-indigo-500 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredProjects.map((project, idx) => (
                    <ProjectCard
                        key={project.id}
                        project={project}
                        isAdmin={user?.role === 'admin'}
                        onEdit={handleEdit}
                        onDelete={confirmDelete}
                        onManageTasks={setManagingTasksFor}
                    />
                ))}
                {filteredProjects.length === 0 && (
                    <div className="col-span-full py-20 text-center text-slate-500">
                        <SearchIcon className="w-12 h-12 mx-auto mb-4" />
                        <p className="text-lg font-semibold">{t('no_data')}</p>
                    </div>
                )}
            </div>

            {showForm && <ProjectForm project={selectedProject} onClose={() => setShowForm(false)} />}
            {managingTasksFor && <ProjectTasksModal project={managingTasksFor} onClose={() => setManagingTasksFor(null)} />}
            {
                projectToDelete && (
                    <ConfirmationModal
                        title={t('delete_project')}
                        message={`Opravdu chcete smazat projekt "${projectToDelete.name}"? Tato akce je nevratná.`}
                        onConfirm={handleDelete}
                        onCancel={() => setProjectToDelete(null)}
                    />
                )
            }
        </div >
    );
};

export default Projects;
