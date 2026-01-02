
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { firebaseService } from '../services/firebaseService';
import type { Tool, ToolStatus, ToolLog } from '../types';
import TrashIcon from './icons/TrashIcon';
import BackButton from './BackButton';

const ToolManager: React.FC = () => {
    const { t } = useI18n();
    const { showToast } = useToast();

    // State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<'asset' | 'consumable'>('asset');
    const [filterStatus, setFilterStatus] = useState<ToolStatus | 'all'>('all');
    const [editingTool, setEditingTool] = useState<Tool | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewingHistoryToolId, setViewingHistoryToolId] = useState<number | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [type, setType] = useState('');
    const [category, setCategory] = useState<'asset' | 'consumable'>('asset');
    const [serialNumber, setSerialNumber] = useState('');
    const [quantity, setQuantity] = useState<number>(1);
    const [unit, setUnit] = useState('ks');
    const [status, setStatus] = useState<ToolStatus>('available');
    const [assignedWorkerId, setAssignedWorkerId] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [location, setLocation] = useState('');
    const [condition, setCondition] = useState<number>(1);

    // Data
    const tools = useLiveQuery(() => db.tools.toArray());
    const workers = useLiveQuery(() => db.workers.toArray());
    const toolLogs = useLiveQuery(() =>
        viewingHistoryToolId
            ? db.toolLogs.where('toolId').equals(viewingHistoryToolId).reverse().sortBy('timestamp')
            : Promise.resolve([])
        , [viewingHistoryToolId]);

    const resetForm = () => {
        setEditingTool(null);
        setName('');
        setType('');
        setCategory(activeCategory);
        setSerialNumber('');
        setQuantity(1);
        setUnit('ks');
        setStatus('available');
        setAssignedWorkerId('');
        setNotes('');
        setLocation('');
        setCondition(1);
        setIsAddModalOpen(false);
    };

    const handleEdit = (tool: Tool) => {
        setEditingTool(tool);
        setName(tool.name);
        setType(tool.type);
        setCategory(tool.category);
        setSerialNumber(tool.serialNumber || '');
        setQuantity(tool.quantity || 1);
        setUnit(tool.unit || 'ks');
        setStatus(tool.status);
        setAssignedWorkerId(tool.assignedWorkerId ? String(tool.assignedWorkerId) : '');
        setNotes(tool.notes || '');
        setLocation(tool.location || '');
        setCondition(tool.condition || 1);
        setIsAddModalOpen(true);
    };

    const logAction = async (toolId: number, action: ToolLog['action'], notes?: string) => {
        const workerId = action === 'borrow' ? Number(assignedWorkerId) : 0; // 0 or system worker
        const log: ToolLog = {
            toolId,
            workerId: workerId || 0,
            action,
            timestamp: new Date(),
            notes
        };
        await db.toolLogs.add(log);
        if (firebaseService.isReady) {
            firebaseService.upsertRecords('toolLogs', [log]).catch(console.error);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const toolData: Tool = {
            name,
            type,
            category,
            serialNumber: category === 'asset' ? serialNumber : undefined,
            quantity: category === 'consumable' ? quantity : undefined,
            unit,
            status,
            assignedWorkerId: status === 'borrowed' && assignedWorkerId ? Number(assignedWorkerId) : undefined,
            notes,
            location,
            condition: condition as any,
            ...(editingTool ? { id: editingTool.id } : { purchaseDate: new Date() }),
            lastInspection: new Date(),
        };

        try {
            let finalId = toolData.id;

            if (finalId) {
                const oldTool = tools?.find(t => t.id === finalId);
                await db.tools.update(finalId, toolData);

                // Detailed logging for status changes
                if (oldTool && oldTool.status !== status) {
                    const action = status === 'borrowed' ? 'borrow' : status === 'available' ? 'return' : 'repair';
                    await logAction(finalId, action, `Změna stavu z ${oldTool.status} na ${status}`);
                }
            } else {
                finalId = (await db.tools.add(toolData)) as number;
                await logAction(finalId, 'return', 'Prvotní naskladnění');
            }

            // Sync to Firebase
            if (firebaseService.isReady) {
                const toolToSync = { ...toolData, id: finalId };
                firebaseService.upsertRecords('tools', [toolToSync]).catch(console.error);
            }

            resetForm();
            showToast(t('save_success'), 'success');
        } catch (error) {
            console.error("Failed to save tool:", error);
            showToast(t('save_failed'), 'error');
        }
    };

    const handleDelete = async (id: number, name: string) => {
        if (confirm(t('confirm_delete_tool').replace('{name}', name))) {
            await logAction(id, 'scrap', 'Smazání z registru');
            await db.tools.delete(id);
            if (firebaseService.isReady) {
                firebaseService.deleteRecords('tools', [String(id)]).catch(console.error);
            }
        }
    };

    const handleQuickReturn = async (tool: Tool) => {
        const updatedTool = { ...tool, status: 'available' as ToolStatus, assignedWorkerId: undefined };
        await db.tools.update(tool.id!, updatedTool);
        await logAction(tool.id!, 'return', 'Rychlé vrácení');

        if (firebaseService.isReady) {
            firebaseService.upsertRecords('tools', [updatedTool]).catch(console.error);
        }
        showToast(t('tool_action_return'), 'success');
    };

    const filteredTools = useMemo(() => {
        return tools?.filter(tool => {
            const matchesCategory = tool.category === activeCategory;
            const matchesStatus = filterStatus === 'all' || tool.status === filterStatus;
            const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tool.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tool.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesStatus && matchesSearch;
        });
    }, [tools, activeCategory, filterStatus, searchQuery]);

    const getWorkerName = (id?: number) => {
        if (!id) return '-';
        return workers?.find(w => w.id === id)?.name || 'Unknown';
    };

    const getToolIcon = (type: string) => {
        const t = type.toLowerCase();
        if (t.includes('vrtačka') || t.includes('drill')) return '🔫';
        if (t.includes('auto') || t.includes('car')) return '🚗';
        if (t.includes('žebřík') || t.includes('ladder')) return '🪜';
        if (t.includes('měřák') || t.includes('meter')) return '📟';
        if (t.includes('kotouč') || t.includes('blade')) return '💿';
        if (t.includes('vrták') || t.includes('bit')) return '🔩';
        if (t.includes('páska') || t.includes('tape')) return '🩹';
        return '🔧';
    };

    return (
        <div className="space-y-8 pb-24 animate-fade-in text-white max-w-7xl mx-auto px-4">
            <div className="md:hidden pt-4 pl-2">
                <BackButton />
            </div>

            <header className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-8">
                <div className="space-y-4 max-w-2xl">
                    <div className="space-y-2">
                        <h1 className="text-6xl md:text-8xl font-black text-white italic uppercase tracking-tighter leading-[0.8]">
                            {t('tools')}<span className="text-indigo-500">.</span>
                        </h1>
                        <div className="h-2 w-32 bg-indigo-600 rounded-full shadow-[0_4px_20px_rgba(79,70,229,0.5)]" />
                    </div>
                </div>

                <div className="w-full xl:w-auto flex flex-col md:flex-row gap-4">
                    <button
                        onClick={() => { resetForm(); setIsAddModalOpen(true); }}
                        className="group relative px-8 py-5 bg-white text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-[2rem] hover:scale-105 transition-all duration-300 shadow-xl active:scale-95 overflow-hidden"
                    >
                        <div className="relative z-10 flex items-center justify-center gap-3">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                            {t('add_tool')}
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
                            <div className="w-full h-full bg-white opacity-20 mix-blend-overlay"></div>
                        </div>
                    </button>
                </div>
            </header>

            {/* Tabs & Filters */}
            <div className="ios-card p-4 flex flex-col xl:flex-row gap-4 justify-between items-center relative overflow-hidden">
                <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none" />

                <div className="flex p-1 bg-black/20 rounded-2xl w-full xl:w-auto relative z-10">
                    <button
                        onClick={() => setActiveCategory('asset')}
                        className={`flex-1 xl:flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'asset' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        {t('tool_category_asset')}
                    </button>
                    <button
                        onClick={() => setActiveCategory('consumable')}
                        className={`flex-1 xl:flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'consumable' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        {t('tool_category_consumable')}
                    </button>
                </div>

                <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto relative z-10">
                    <div className="relative group flex-1">
                        <input
                            type="text"
                            placeholder={t('search')}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-black/20 rounded-2xl border border-white/5 focus:border-indigo-500/50 outline-none text-xs font-bold transition-all placeholder:text-slate-600 text-white"
                        />
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>

                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value as any)}
                        className="px-6 py-3 bg-black/20 rounded-2xl border border-white/5 text-[10px] font-black uppercase outline-none focus:border-indigo-500/50 text-slate-300 [&>option]:bg-[#020617]"
                    >
                        <option value="all">{t('all_statuses')}</option>
                        <option value="available">{t('tool_status_available')}</option>
                        <option value="borrowed">{t('tool_status_borrowed')}</option>
                        <option value="broken">{t('tool_status_broken')}</option>
                    </select>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredTools?.map(tool => (
                    <div key={tool.id} className="group ios-card relative overflow-hidden flex flex-col h-full hover:scale-[1.02] transition-transform duration-300 active:scale-95">
                        {/* Condition Bar */}
                        <div className="absolute top-0 left-0 right-0 h-1 flex gap-0.5 opacity-50">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className={`flex-1 h-full ${i <= (6 - (tool.condition || 1)) ? 'bg-indigo-500' : 'bg-transparent'}`} />
                            ))}
                        </div>

                        <div className="p-6 flex-1 flex flex-col gap-6">
                            <div className="flex justify-between items-start">
                                <div className="w-16 h-16 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-center text-4xl shadow-inner relative overflow-hidden group-hover:bg-white/[0.07] transition-colors">
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {getToolIcon(tool.type)}
                                </div>

                                {tool.category === 'asset' ? (
                                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${tool.status === 'available' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                        tool.status === 'borrowed' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                        }`}>
                                        {t(`tool_status_${tool.status}` as any)}
                                    </span>
                                ) : (
                                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${(tool.quantity || 0) < 5 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                        }`}>
                                        {(tool.quantity || 0) < 5 ? t('low_stock') : `${tool.quantity} ${tool.unit}`}
                                    </span>
                                )}
                            </div>

                            <div className="space-y-1">
                                <h3 className="text-xl font-black italic tracking-tight text-white line-clamp-2 leading-tight min-h-[3rem]">{tool.name}</h3>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                    <span className="truncate max-w-[50%]">{tool.type}</span>
                                    {tool.brand && (
                                        <>
                                            <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                            <span className="truncate max-w-[50%]">{tool.brand}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {tool.category === 'asset' && tool.status === 'borrowed' && tool.assignedWorkerId && (
                                <div className="mt-auto p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                                        {getWorkerName(tool.assignedWorkerId).substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[8px] font-black text-indigo-300/60 uppercase tracking-wider">{t('has_borrowed')}</p>
                                        <p className="text-xs font-bold text-indigo-100 truncate">{getWorkerName(tool.assignedWorkerId)}</p>
                                    </div>
                                </div>
                            )}

                            {tool.category === 'consumable' && (
                                <div className="mt-auto flex items-center gap-2 text-xs text-slate-400 font-medium bg-black/20 p-3 rounded-xl border border-white/5">
                                    <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    <span className="truncate">{tool.location || 'Neznámá lokace'}</span>
                                </div>
                            )}
                        </div>

                        <div className="p-4 pt-0 grid grid-cols-4 gap-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); handleEdit(tool); }}
                                className="col-span-2 py-3 bg-white/5 hover:bg-white/10 hover:text-white text-slate-400 rounded-xl transition-all flex items-center justify-center group/btn"
                            >
                                <svg className="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); setViewingHistoryToolId(tool.id!); }}
                                className="col-span-1 py-3 bg-white/5 hover:bg-white/10 hover:text-white text-slate-400 rounded-xl transition-all flex items-center justify-center group/btn"
                            >
                                <svg className="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>

                            {tool.category === 'asset' && tool.status === 'borrowed' ? (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleQuickReturn(tool); }}
                                    className="col-span-1 py-3 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-xl transition-all flex items-center justify-center shadow-lg shadow-emerald-900/20 group/btn"
                                >
                                    <svg className="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                </button>
                            ) : (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(tool.id!, tool.name); }}
                                    className="col-span-1 py-3 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl transition-all flex items-center justify-center group/btn"
                                >
                                    <TrashIcon className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* History Panel (Slide-in Logic) */}
            {viewingHistoryToolId && (
                <div className="fixed inset-0 z-[70] flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setViewingHistoryToolId(null)}>
                    <div className="w-full max-w-md h-full bg-[#0a0c1a] border-l border-white/10 p-8 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)] animate-slide-in-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-black italic uppercase tracking-tighter">{t('tool_history')}</h2>
                            <button onClick={() => setViewingHistoryToolId(null)} className="p-2 bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2">
                            {toolLogs?.length === 0 ? (
                                <p className="text-center text-slate-500 font-bold uppercase text-[10px] mt-20">{t('no_history')}</p>
                            ) : (
                                toolLogs?.map((log, i) => (
                                    <div key={log.id} className="relative pl-6 pb-6 border-l border-white/5">
                                        <div className={`absolute top-0 -left-1.5 w-3 h-3 rounded-full border-2 border-[#0a0c1a] ${log.action === 'borrow' ? 'bg-indigo-500' : log.action === 'return' ? 'bg-emerald-500' : 'bg-rose-500'
                                            }`} />
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{new Date(log.timestamp).toLocaleString('cs-CZ')}</p>
                                        <h4 className="font-black text-sm uppercase tracking-tight mt-1">{t(`tool_action_${log.action}` as any)}</h4>
                                        <p className="text-xs font-bold text-slate-300">{log.workerId > 0 ? getWorkerName(log.workerId) : 'Systém'}</p>
                                        {log.notes && <p className="text-[10px] italic text-slate-500 mt-1 opacity-70">"{log.notes}"</p>}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Form */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={resetForm}>
                    <form onSubmit={handleSave} className="w-full max-w-xl bg-[#0f111a] border border-white/10 rounded-[3rem] p-10 shadow-[0_0_100px_rgba(79,70,229,0.1)] relative overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />

                        <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-8">{editingTool ? t('edit_tool') : t('add_tool')}</h2>

                        <div className="space-y-6">
                            <div className="flex p-1 bg-black/40 rounded-2xl border border-white/5">
                                <button type="button" onClick={() => setCategory('asset')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${category === 'asset' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>{t('tool_category_asset')}</button>
                                <button type="button" onClick={() => setCategory('consumable')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${category === 'consumable' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>{t('tool_category_consumable')}</button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('tool_name')}</label>
                                    <input value={name} onChange={e => setName(e.target.value)} required className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 text-white font-bold outline-none focus:border-indigo-500" placeholder="Aku vrtačka..." />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('tool_type')}</label>
                                    <input value={type} onChange={e => setType(e.target.value)} required className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 text-white font-bold outline-none focus:border-indigo-500" placeholder="Vrtačka" />
                                </div>
                            </div>

                            {category === 'asset' ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('serial_number')}</label>
                                        <input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 text-white font-mono outline-none focus:border-indigo-500 placeholder:text-slate-700" placeholder="S/N: 12345..." />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('tool_condition')}</label>
                                        <select value={condition} onChange={e => setCondition(Number(e.target.value))} className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 text-white font-bold outline-none focus:border-indigo-500">
                                            <option value={1} className="bg-[#0f111a]">🌟 Nový / Perfektní</option>
                                            <option value={2} className="bg-[#0f111a]">✅ Velmi dobrý</option>
                                            <option value={3} className="bg-[#0f111a]">🟡 Používaný</option>
                                            <option value={4} className="bg-[#0f111a]">🟠 Opotřebený</option>
                                            <option value={5} className="bg-[#0f111a]">💀 Těsně před smrtí</option>
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4 animate-slide-in-right">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('tool_quantity')}</label>
                                        <div className="flex gap-2">
                                            <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} required className="flex-1 p-4 bg-black/40 rounded-2xl border border-white/10 text-white font-black text-xl outline-none focus:border-emerald-500" />
                                            <input value={unit} onChange={e => setUnit(e.target.value)} required className="w-20 p-4 bg-black/40 rounded-2xl border border-white/10 text-white font-bold text-center outline-none focus:border-emerald-500" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('tool_location')}</label>
                                        <input value={location} onChange={e => setLocation(e.target.value)} className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 text-white font-bold outline-none focus:border-indigo-500" placeholder="Box 4A / Police C" />
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('tool_status')}</label>
                                    <select value={status} onChange={e => setStatus(e.target.value as ToolStatus)} className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 text-white font-bold outline-none focus:border-indigo-500">
                                        <option value="available" className="bg-[#0f111a]">🟢 {t('tool_status_available')}</option>
                                        <option value="borrowed" className="bg-[#0f111a]">🔵 {t('tool_status_borrowed')}</option>
                                        <option value="broken" className="bg-[#0f111a]">🔴 {t('tool_status_broken')}</option>
                                        <option value="service" className="bg-[#0f111a]">🟠 {t('tool_status_service')}</option>
                                        <option value="lost" className="bg-[#0f111a]">⚫ {t('tool_status_lost')}</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('assigned_to')}</label>
                                    <select
                                        value={assignedWorkerId}
                                        onChange={e => setAssignedWorkerId(e.target.value)}
                                        disabled={status !== 'borrowed'}
                                        required={status === 'borrowed'}
                                        className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 text-white font-bold outline-none focus:border-indigo-500 disabled:opacity-30"
                                    >
                                        <option value="" className="bg-[#0f111a]">- {t('select_worker')} -</option>
                                        {workers?.map(w => (
                                            <option key={w.id} value={w.id} className="bg-[#0f111a]">{w.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-10 pt-8 border-t border-white/5">
                            <button type="button" onClick={resetForm} className="px-8 py-4 rounded-2xl bg-white/5 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-white/10 hover:text-white transition-all">{t('cancel')}</button>
                            <button type="submit" className="px-12 py-4 rounded-2xl bg-white text-black font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-xl shadow-white/5">{t('save')}</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default ToolManager;
