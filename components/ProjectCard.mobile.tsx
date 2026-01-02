
import React, { useMemo, useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Project } from '../types';
import { useI18n } from '../contexts/I18nContext';
import PencilIcon from './icons/PencilIcon';
import TrashIcon from './icons/TrashIcon';
import useSwipe from '../hooks/useSwipe';

const ProjectCardMobile: React.FC<{
    project: Project;
    isAdmin: boolean;
    onEdit: (p: Project) => void;
    onDelete: (p: Project) => void;
    onManageTasks: (p: Project) => void;
}> = ({ project, isAdmin, onEdit, onDelete, onManageTasks }) => {
    const { t } = useI18n();
    const [isSwiped, setIsSwiped] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    const tasks = useLiveQuery(() => db.projectTasks.where('projectId').equals(project.id!).toArray(), [project.id]);

    const stats = useMemo(() => {
        const totalTasks = tasks?.length || 0;
        const completedTasks = tasks?.filter(t => !!t.completionDate).length || 0;
        const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        return { totalTasks, completedTasks, taskProgress };
    }, [tasks]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'bg-emerald-500';
            case 'completed': return 'bg-indigo-500';
            case 'on_hold': return 'bg-amber-500';
            default: return 'bg-slate-500';
        }
    };

    const handleSwipeLeft = () => {
        if (isAdmin) {
            setIsSwiped(true);
        }
    };

    const handleSwipeRight = () => {
        setIsSwiped(false);
    };

    const swipeHandlers = useSwipe({ onSwipeLeft: handleSwipeLeft, onSwipeRight: handleSwipeRight, threshold: 40 });

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        onEdit(project);
        setIsSwiped(false);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete(project);
        setIsSwiped(false);
    };

    const handleCardClick = () => {
        if (isSwiped) {
            setIsSwiped(false);
        } else {
            onManageTasks(project);
        }
    }

    return (
        <div className="relative w-full overflow-hidden" ref={cardRef}>
            <div
                className={`transition-transform duration-300 ease-in-out transform ${isSwiped ? '-translate-x-32' : 'translate-x-0'}`}
                {...swipeHandlers}
                onClick={handleCardClick}
            >
                <div className="ios-card p-5 flex flex-col gap-4 active:bg-slate-700/50 transition-all border border-white/5 shadow-lg">
                    <div className="flex justify-between items-start gap-3">
                        <h3 className="font-black text-white text-lg tracking-tight italic uppercase pr-2 leading-tight">{project.name}</h3>
                        <div className={`shrink-0 px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full text-white flex items-center gap-1.5 ${getStatusColor(project.status)} bg-opacity-20 border border-white/10`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(project.status)} animate-pulse`}></span>
                            {t(project.status as any)}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-end">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest opacity-60">{t('tasks')}</span>
                            <span className="text-[11px] font-black text-white italic">{stats.completedTasks} <span className="text-slate-600">/ {stats.totalTasks}</span></span>
                        </div>
                        <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-indigo-500 h-full rounded-full transition-all duration-700" style={{ width: `${stats.taskProgress}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>

            {isAdmin && (
                <div className="absolute top-0 right-0 h-full flex items-center" style={{ pointerEvents: isSwiped ? 'auto' : 'none' }}>
                    <div
                        className={`flex transition-opacity duration-300 ${isSwiped ? 'opacity-100' : 'opacity-0'}`}
                    >
                        <button
                            onClick={handleEdit}
                            className="w-16 h-full flex items-center justify-center bg-blue-600 text-white"
                            aria-label={t('edit')}
                        >
                            <PencilIcon className="w-6 h-6" />
                        </button>
                        <button
                            onClick={handleDelete}
                            className="w-16 h-full flex items-center justify-center bg-red-600 text-white"
                            aria-label={t('delete')}
                        >
                            <TrashIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectCardMobile;
