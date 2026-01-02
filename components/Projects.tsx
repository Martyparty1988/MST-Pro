
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
            await firebaseService.synchronize(true);
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

    return (
        <div className="space-y-6 md:space-y-12 pb-20 animate-fade-in relative px-2 md:px-0">
            {/* Pull to refresh UI */}
            <div className={`fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${isRefreshing ? 'opacity-100 translate-y-4 scale-100' : 'opacity-0 -translate-y-10 scale-90 pointer-events-none'}`}>
                <div className="bg-indigo-600/90 backdrop-blur-xl text-white rounded-full p-3 shadow-2xl border border-indigo-400/20">
                    <RedoIcon className="w-5 h-5 animate-spin" />
                </div>
            </div>

            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6 pt-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="h-0.5 w-6 bg-indigo-500 rounded-full"></span>
                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.4em]">{t('projects')}</span>
                    </div>
                    <h1 className="text-3xl md:text-6xl font-black text-white italic tracking-tighter uppercase leading-[0.9]">
                        {t('projects')}<span className="text-indigo-500 not-italic">.</span>
                    </h1>
                </div>
                {user?.role === 'admin' && (
                    <button
                        onClick={handleAdd}
                        className="group relative w-full md:w-auto px-6 py-3 md:py-5 bg-white text-black font-black uppercase tracking-widest text-[10px] md:text-[11px] rounded-2xl active:scale-95 transition-all shadow-xl overflow-hidden"
                    >
                        <div className="relative z-10 flex items-center justify-center gap-3">
                            <PlusIcon className="w-5 h-5" />
                            {t('add_project')}
                        </div>
                    </button>
                )}
            </header>

            {/* Project Overview Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Aktivní', value: projects?.filter(p => p.status === 'active').length || 0, color: 'text-emerald-500' },
                    { label: 'Hotovo', value: projects?.filter(p => p.status === 'completed').length || 0, color: 'text-indigo-400' },
                    { label: 'Výkon', value: '4.2 MWp', color: 'text-amber-500' },
                    { label: 'Efekt', value: '88%', color: 'text-white' }
                ].map((stat, i) => (
                    <div key={i} className="ios-card p-5 flex flex-col justify-between h-32 active:scale-[0.98] transition-transform">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest opacity-50">{stat.label}</p>
                        <p className={`text-3xl font-black italic tracking-tighter ${stat.color}`}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Search and Filter Section */}
            <div className="p-6 md:p-8 ios-card shadow-xl">
                <div className="flex flex-col xl:flex-row gap-4 relative z-10">
                    <div className="relative flex-[2] group">
                        <input
                            type="text"
                            placeholder={`${t('search')}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 h-14 bg-white/[0.03] text-white border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500/30 text-xs font-black uppercase tracking-widest transition-all"
                        />
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 flex-1">
                        <div className="relative flex-1">
                            <select
                                value={workerFilter}
                                onChange={(e) => setWorkerFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                className="w-full h-14 pl-12 pr-4 bg-white/5 text-white border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500/30 text-[10px] font-black uppercase tracking-widest appearance-none"
                            >
                                <option value="all">{t('all_workers')}</option>
                                {workers?.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                            <WorkersIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 pointer-events-none" />
                        </div>

                        <div className="relative flex-1">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="w-full h-14 px-4 bg-white/5 text-white border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500/30 text-[10px] font-black uppercase tracking-widest appearance-none"
                            >
                                {(['all', 'active', 'completed', 'on_hold'] as const).map(status => (
                                    <option key={status} value={status}>{t(status as any)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredProjects.map((project) => (
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
                        <SearchIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="text-sm font-black uppercase tracking-widest">{t('no_data')}</p>
                    </div>
                )}
            </div>

            {showForm && <ProjectForm project={selectedProject} onClose={() => setShowForm(false)} />}
            {managingTasksFor && <ProjectTasksModal project={managingTasksFor} onClose={() => setManagingTasksFor(null)} />}
            {projectToDelete && (
                <ConfirmationModal
                    title={t('delete_project')}
                    message={`Opravdu chcete smazat projekt "${projectToDelete.name}"? Tato akce je nevratná.`}
                    onConfirm={handleDelete}
                    onCancel={() => setProjectToDelete(null)}
                />
            )}
        </div>
    );
};

export default Projects;
