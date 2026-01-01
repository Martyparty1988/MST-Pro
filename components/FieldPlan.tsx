
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { FieldTable, Worker, ProjectTask } from '../types';
import { getWorkerColor } from '../utils/workerColors';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { soundService } from '../services/soundService';
import { firebaseService } from '../services/firebaseService';

// --- Sub-components ---

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

const TableItem: React.FC<{
    table: FieldTable;
    zoom: number;
    workers: Worker[];
    isSelected: boolean;
    completedWorker: Worker | null | undefined;
    assignedWorkers: Worker[];
    tasks: ProjectTask[];
    onToggle: (e: React.MouseEvent, id: string) => void;
    onContextMenu: (e: React.MouseEvent, table: FieldTable) => void;
}> = ({ table, zoom, isSelected, completedWorker, assignedWorkers, onToggle, onContextMenu }) => {

    const getStatusColor = () => {
        if (table.status === 'completed' && completedWorker) {
            return getWorkerColor(completedWorker.id!, completedWorker.color, []);
        }
        if (table.status === 'defect') return '#f43f5e';
        if (assignedWorkers.length > 0) return '#f59e0b';
        return '#334155';
    };

    const statusColor = getStatusColor();

    return (
        <div
            onClick={(e) => onToggle(e, table.id!.toString())}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, table); }}
            className={`relative flex flex-col items-center justify-center rounded-2xl transition-all duration-300 cursor-pointer group shadow-xl border-2 ${isSelected ? 'scale-110 z-30 ring-4 ring-indigo-500/50 border-white' : 'hover:scale-105 border-white/10'}`}
            style={{
                width: `${100 * zoom}px`,
                height: `${120 * zoom}px`,
                backgroundColor: isSelected ? '#1e293b' : '#0f172a',
            }}
        >
            {/* Status Indicator Bar */}
            <div
                className="absolute top-0 left-0 w-full h-2 rounded-t-xl transition-colors duration-500"
                style={{ backgroundColor: statusColor }}
            />

            {/* Table ID */}
            <span className="font-black italic tracking-tighter text-white uppercase" style={{ fontSize: `${24 * zoom}px` }}>
                {table.tableId}
            </span>

            {/* Worker Initials / Badges */}
            <div className="flex -space-x-2 mt-2">
                {completedWorker ? (
                    <div
                        className="rounded-lg border-2 border-[#0f172a] flex items-center justify-center font-bold text-white shadow-lg"
                        style={{
                            width: `${24 * zoom}px`,
                            height: `${24 * zoom}px`,
                            fontSize: `${10 * zoom}px`,
                            backgroundColor: getWorkerColor(completedWorker.id!, completedWorker.color, [])
                        }}
                    >
                        {getInitials(completedWorker.name)}
                    </div>
                ) : assignedWorkers.map(w => (
                    <div
                        key={w.id}
                        className="rounded-lg border-2 border-[#0f172a] flex items-center justify-center font-bold text-white shadow-lg"
                        style={{
                            width: `${24 * zoom}px`,
                            height: `${24 * zoom}px`,
                            fontSize: `${10 * zoom}px`,
                            backgroundColor: getWorkerColor(w.id!, w.color, [])
                        }}
                    >
                        {getInitials(w.name)}
                    </div>
                ))}
            </div>

            {/* Selection/Hover effects */}
            {isSelected && (
                <div className="absolute inset-0 bg-indigo-500/10 rounded-2xl animate-pulse pointer-events-none" />
            )}
        </div>
    );
};

const ContextMenu: React.FC<{
    table: FieldTable;
    x: number;
    y: number;
    workers: Worker[];
    onClose: () => void;
    onAction: (action: string, data?: any) => void;
}> = ({ x, y, onClose, onAction }) => {
    useEffect(() => {
        const handleDown = () => onClose();
        window.addEventListener('mousedown', handleDown);
        return () => window.removeEventListener('mousedown', handleDown);
    }, [onClose]);

    return (
        <div
            className="fixed z-[1000] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-3 w-64 animate-zoom-in"
            style={{ left: x, top: y }}
            onMouseDown={e => e.stopPropagation()}
        >
            <div className="space-y-1">
                <button onClick={() => onAction('detail')} className="w-full flex items-center gap-4 p-4 hover:bg-white/5 rounded-2xl transition-all group text-left">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </div>
                    <div>
                        <p className="text-xs font-black text-white uppercase tracking-widest">Detail stolu</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Zobrazit možnosti</p>
                    </div>
                </button>
                <div className="h-px bg-white/5 my-2 mx-4" />
                <button onClick={() => onAction('complete')} className="w-full flex items-center gap-4 p-4 hover:bg-emerald-500/10 rounded-2xl transition-all group text-left">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-xs font-black text-emerald-500 uppercase tracking-widest">Označit hotovo</p>
                </button>
                <button onClick={() => onAction('pending')} className="w-full flex items-center gap-4 p-4 hover:bg-white/5 rounded-2xl transition-all group text-left text-slate-400">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest">Resetovat stav</p>
                </button>
            </div>
        </div>
    );
};

// --- Main FieldPlan Component ---
const FieldPlan: React.FC<{ projectId: number, onTableClick?: (table: FieldTable) => void }> = ({ projectId, onTableClick }) => {
    const { t } = useI18n();
    const { user } = useAuth();

    // Data Queries
    const tables = useLiveQuery(() => db.fieldTables.where('projectId').equals(projectId).toArray(), [projectId]);
    const workers = useLiveQuery(() => db.workers.toArray());
    const tasks = useLiveQuery(() => db.projectTasks.where('projectId').equals(projectId).toArray(), [projectId]);

    // UI State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterWorker, setFilterWorker] = useState<number | 'all'>('all');
    const [showLeftSidebar, setShowLeftSidebar] = useState(true);
    const [contextMenu, setContextMenu] = useState<{ table: FieldTable, x: number, y: number } | null>(null);
    const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
    const [isInitializing, setIsInitializing] = useState(false);
    const [activeTool, setActiveTool] = useState<'cursor' | 'complete' | 'defect' | 'pending'>('cursor');

    // Auto-initialize tables if missing
    useEffect(() => {
        const initTables = async () => {
            if (!tables || tables.length > 0 || isInitializing) return;

            const project = await db.projects.get(projectId);
            if (project && project.tables && project.tables.length > 0) {
                setIsInitializing(true);
                const newTables: FieldTable[] = project.tables.map(tData => ({
                    projectId,
                    tableId: typeof tData === 'string' ? tData : tData.id,
                    tableType: typeof tData === 'string' ? 'medium' :
                        (tData.type === 'S' ? 'small' : tData.type === 'L' ? 'large' : 'medium'),
                    status: 'pending',
                    assignedWorkers: []
                }));
                await db.fieldTables.bulkAdd(newTables);
                setIsInitializing(false);
            }
        };
        initTables();
    }, [projectId, tables, isInitializing]);

    // Default to list view on small mobile
    useEffect(() => {
        if (window.innerWidth < 768) {
            setViewMode('list');
            setShowLeftSidebar(false);
        }
    }, []);

    // Zoom/Pan State
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Filtered Tables logic
    const filteredTables = useMemo(() => {
        if (!tables) return [];
        return tables.filter(t => {
            if (filterStatus !== 'all' && t.status !== filterStatus) return false;
            if (filterWorker !== 'all') {
                if (filterStatus === 'completed' && t.completedBy !== filterWorker) return false;
                if (filterStatus !== 'completed' && !t.assignedWorkers?.includes(filterWorker as number)) return false;
            }
            return true;
        });
    }, [tables, filterStatus, filterWorker]);

    // Statistics
    const stats = useMemo(() => {
        if (!tables) return { total: 0, completed: 0, pending: 0, defect: 0, inProgress: 0 };
        return {
            total: tables.length,
            completed: tables.filter(t => t.status === 'completed').length,
            pending: tables.filter(t => t.status === 'pending' && (!t.assignedWorkers || t.assignedWorkers.length === 0)).length,
            inProgress: tables.filter(t => t.status === 'pending' && t.assignedWorkers && t.assignedWorkers.length > 0).length,
            defect: tables.filter(t => t.status === 'defect').length,
        };
    }, [tables]);

    // Handlers
    const handleToggleSelect = useCallback((e: React.MouseEvent, id: string) => {
        const table = tables?.find(t => t.id!.toString() === id);
        if (!table) return;

        if (activeTool !== 'cursor') {
            // Paint Mode Logic
            let updates: any = {};
            if (activeTool === 'complete') {
                updates.status = 'completed';
                updates.completedAt = new Date();
                updates.completedBy = user?.workerId || 0;
                soundService.playSuccess();
            } else if (activeTool === 'pending') {
                updates.status = 'pending';
                updates.completedAt = undefined;
                updates.completedBy = undefined;
                updates.assignedWorkers = [];
                soundService.playClick();
            } else if (activeTool === 'defect') {
                updates.status = 'defect';
                updates.defectNotes = '';
                soundService.playError();
            }

            db.fieldTables.update(table.id!, updates);
            if (firebaseService.isReady) {
                firebaseService.upsertRecords('fieldTables', [{
                    ...table,
                    ...updates,
                    id: `${table.projectId}_${table.tableId}`
                }]).catch(console.error);
            }
            return;
        }

        // Normal Selection / Detail Logic
        onTableClick?.(table);
        setSelectedIds(new Set([id]));
        setLastSelectedId(id);
    }, [tables, activeTool, user, onTableClick]);

    // Zoom/Pan Handlers
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom(prev => Math.max(0.2, Math.min(3, prev * delta)));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0 && (e.target as HTMLElement).classList.contains('canvas-area')) {
            isDragging.current = true;
            startPos.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
            containerRef.current!.style.cursor = 'grabbing';
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) return;
        setOffset({
            x: e.clientX - startPos.current.x,
            y: e.clientY - startPos.current.y
        });
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        if (containerRef.current) containerRef.current.style.cursor = 'default';
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1 && (e.target as HTMLElement).classList.contains('canvas-area')) {
            isDragging.current = true;
            startPos.current = { x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging.current || e.touches.length !== 1) return;
        setOffset({
            x: e.touches[0].clientX - startPos.current.x,
            y: e.touches[0].clientY - startPos.current.y
        });
    };

    return (
        <div className="relative w-full h-[85vh] min-h-[700px] flex overflow-hidden bg-[#020617] font-sans rounded-[3rem] border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.5)]">

            {/* Left Sidebar - Statistics & Filters */}
            <aside className={`transition-all duration-500 h-full border-r border-white/5 bg-black/20 backdrop-blur-3xl shrink-0 flex flex-col ${showLeftSidebar ? 'w-96' : 'w-0 overflow-hidden'}`}>
                <div className="p-8 grow space-y-10 custom-scrollbar overflow-y-auto">
                    <header className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-[0.8] mb-1">FIELD<span className="text-indigo-500">.</span>PLAN</h2>
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Interaktivní</p>
                            </div>
                        </div>
                    </header>

                    <section className="grid grid-cols-2 gap-4">
                        {[
                            { label: 'Celkem', value: stats.total, color: 'text-white', bg: 'bg-white/5' },
                            { label: 'Hotovo', value: stats.completed, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                            { label: 'Proces', value: stats.inProgress, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                            { label: 'Závady', value: stats.defect, color: 'text-rose-500', bg: 'bg-rose-500/10' }
                        ].map((s, i) => (
                            <div key={i} className={`${s.bg} p-5 rounded-[2rem] border border-white/5 group hover:border-white/10 transition-colors`}>
                                <p className={`text-[9px] font-black uppercase tracking-widest mb-1 opacity-50 ${s.color}`}>{s.label}</p>
                                <p className="text-3xl font-black text-white italic tracking-tighter leading-none">{s.value}</p>
                            </div>
                        ))}
                    </section>

                    <section className="space-y-8">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 ml-1">Filtr Stavu</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'all', label: 'Vše' },
                                    { id: 'pending', label: 'Čeká' },
                                    { id: 'completed', label: 'Hotovo' },
                                    { id: 'defect', label: 'Závady' }
                                ].map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setFilterStatus(s.id)}
                                        className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${filterStatus === s.id
                                            ? 'bg-white text-black border-white shadow-lg'
                                            : 'bg-black/40 text-slate-500 border-white/5 hover:border-white/20'}`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 ml-1">Pracovník</label>
                            <div className="relative group">
                                <select
                                    value={filterWorker}
                                    onChange={e => setFilterWorker(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                    className="w-full bg-black/40 border border-white/5 p-5 rounded-[2rem] text-white font-black italic tracking-tighter text-lg outline-none focus:border-indigo-500/50 transition-all appearance-none"
                                >
                                    <option value="all">Všichni členové</option>
                                    {workers?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </section>
                </div>
            </aside>

            {/* Main Interactive Canvas Area */}
            <main ref={containerRef} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleMouseUp} className="canvas-area flex-1 relative bg-[radial-gradient(circle_at_50%_50%,_#111827_0%,_#020617_100%)] overflow-hidden">

                {/* Visual Grid Backdrop */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{
                        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                        backgroundSize: `${60 * zoom}px ${60 * zoom}px`,
                        transform: `translate(${offset.x % (60 * zoom)}px, ${offset.y % (60 * zoom)}px)`
                    }}
                />

                {viewMode === 'map' ? (
                    <>
                        <div className="absolute p-40 pointer-events-none touch-none"
                            style={{
                                transform: `translate(${offset.x}px, ${offset.y}px)`,
                                display: 'grid',
                                gridTemplateColumns: `repeat(auto-fit, minmax(${100 * zoom}px, 1fr))`,
                                width: `${4000 * zoom}px`,
                                gap: `${20 * zoom}px`,
                                transition: isDragging.current ? 'none' : 'transform 0.2s ease-out'
                            }}>
                            {filteredTables.map(table => (
                                <div key={table.id} className="pointer-events-auto">
                                    <TableItem
                                        table={table}
                                        zoom={zoom}
                                        workers={workers || []}
                                        isSelected={selectedIds.has(table.id!.toString())}
                                        completedWorker={table.status === 'completed' ? workers?.find(w => w.id === table.completedBy) : null}
                                        assignedWorkers={table.assignedWorkers?.map(id => workers?.find(w => w.id === id)).filter(Boolean) as Worker[]}
                                        tasks={[]}
                                        onToggle={handleToggleSelect}
                                        onContextMenu={(e, t) => setContextMenu({ table: t, x: e.clientX, y: e.clientY })}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Paint Mode Toolbar */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-2 bg-[#0f172a]/90 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_0_50px_rgba(0,0,0,0.5)] active:scale-[0.98] transition-all">
                            {[
                                { id: 'cursor', label: 'Výběr', icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5' },
                                { id: 'complete', label: 'Hotovo', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
                                { id: 'defect', label: 'Závada', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
                                { id: 'pending', label: 'Reset', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' }
                            ].map(tool => (
                                <button
                                    key={tool.id}
                                    onClick={() => setActiveTool(tool.id as any)}
                                    className={`p-4 rounded-full transition-all flex flex-col items-center justify-center gap-1 min-w-[80px] ${activeTool === tool.id ? 'bg-indigo-600 text-white shadow-lg scale-110' : 'text-slate-400 hover:text-white'}`}
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d={tool.icon} /></svg>
                                    <span className="text-[10px] font-black uppercase tracking-widest">{tool.label}</span>
                                </button>
                            ))}
                        </div>

                        {contextMenu && (
                            <ContextMenu
                                table={contextMenu.table}
                                x={contextMenu.x}
                                y={contextMenu.y}
                                workers={workers || []}
                                onClose={() => setContextMenu(null)}
                                onAction={(action) => {
                                    setContextMenu(null);
                                    if (action === 'detail') onTableClick?.(contextMenu.table);
                                    else {
                                        const updates: any = action === 'complete' ? { status: 'completed', completedAt: new Date(), completedBy: user?.workerId || 0 } : { status: 'pending', completedAt: undefined, completedBy: undefined, assignedWorkers: [] };
                                        db.fieldTables.update(contextMenu.table.id!, updates);
                                        soundService.playSuccess();
                                    }
                                }}
                            />
                        )}
                    </>
                ) : (
                    <div className="absolute inset-0 overflow-y-auto px-6 pt-28 pb-40 space-y-4 bg-[#020617]">
                        {filteredTables.map(table => (
                            <div key={table.id} onClick={() => onTableClick?.(table)} className="bg-[#0a0c1a]/60 border border-white/5 rounded-[2rem] p-6 flex items-center justify-between hover:bg-white/5 transition-all">
                                <div>
                                    <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{table.tableId}</h3>
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{table.status}</span>
                                </div>
                                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-slate-600">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Left Sidebar Toggle */}
                <button
                    onClick={() => setShowLeftSidebar(!showLeftSidebar)}
                    className="absolute left-6 top-8 w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-2xl z-50"
                >
                    <svg className={`w-6 h-6 transition-transform ${showLeftSidebar ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M11 19l-7-7 7-7" /></svg>
                </button>
            </main>
        </div>
    );
};

export default FieldPlan;
