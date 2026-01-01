
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
        <div className="space-y-6 pb-20 animate-fade-in text-white">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <BackButton />
                    <div>
                        <h1 className="text-3xl font-black italic uppercase tracking-tighter leading-none">{t('tools')}</h1>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{t('tools_desc')}</p>
                    </div>
                </div>
                <button
                    onClick={() => { resetForm(); setIsAddModalOpen(true); }}
                    className="w-full md:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-600/20 uppercase text-xs tracking-widest flex items-center justify-center gap-2 active:scale-95"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    {t('add_tool')}
                </button>
            </header>

            {/* Tabs & Filters */}
            <div className="flex flex-col md:flex-row gap-4 justify-between bg-black/20 p-4 rounded-[2.5rem] border border-white/5">
                <div className="flex p-1 bg-black/40 rounded-2xl">
                    <button
                        onClick={() => setActiveCategory('asset')}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'asset' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-white'}`}
                    >
                        {t('tool_category_asset')}
                    </button>
                    <button
                        onClick={() => setActiveCategory('consumable')}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'consumable' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-500 hover:text-white'}`}
                    >
                        {t('tool_category_consumable')}
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative group flex-1 md:w-64">
                        <input
                            type="text"
                            placeholder={t('search')}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-black/40 rounded-2xl border border-white/5 focus:border-indigo-500 outline-none text-xs font-bold transition-all"
                        />
                        <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>

                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value as any)}
                        className="px-4 py-2.5 bg-black/40 rounded-2xl border border-white/5 text-[10px] font-black uppercase outline-none focus:border-indigo-500"
                    >
                        <option value="all">{t('all_statuses')}</option>
                        <option value="available">{t('tool_status_available')}</option>
                        <option value="borrowed">{t('tool_status_borrowed')}</option>
                        <option value="broken">{t('tool_status_broken')}</option>
                        <option value="service">{t('tool_status_service')}</option>
                    </select>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredTools?.map(tool => (
                    <div key={tool.id} className="group relative bg-[#0f111a] border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-indigo-500/30 transition-all hover:-translate-y-2 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                        {/* Condition Indicator */}
                        <div className="absolute top-0 left-0 right-0 h-1 flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className={`flex-1 h-full ${i <= (6 - (tool.condition || 1)) ? 'bg-indigo-500/40' : 'bg-transparent'}`} />
                            ))}
                        </div>

                        <div className="p-8 space-y-4">
                            <div className="flex justify-between items-start">
                                <div className="w-14 h-14 bg-white/5 rounded-3xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                                    {getToolIcon(tool.type)}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    {tool.category === 'asset' ? (
                                        <span className={`px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest ${tool.status === 'available' ? 'bg-emerald-500/20 text-emerald-400' :
                                            tool.status === 'borrowed' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-rose-500/20 text-rose-400'
                                            }`}>
                                            {t(`tool_status_${tool.status}` as any)}
                                        </span>
                                    ) : (
                                        <span className={`px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest ${(tool.quantity || 0) < 5 ? 'bg-rose-500 text-white animate-pulse' : 'bg-black/40 text-slate-400'
                                            }`}>
                                            {(tool.quantity || 0) < 5 ? t('low_stock') : t('tool_status_available')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-black italic uppercase tracking-tighter truncate">{tool.name}</h3>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{tool.type} • {tool.brand || 'No brand'}</p>
                            </div>

                            {tool.category === 'asset' && tool.status === 'borrowed' && tool.assignedWorkerId ? (
                                <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-[10px] font-black">
                                        {getWorkerName(tool.assignedWorkerId).substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[8px] font-black text-slate-500 uppercase">{t('has_borrowed')}</p>
                                        <p className="text-xs font-black truncate">{getWorkerName(tool.assignedWorkerId)}</p>
                                    </div>
                                </div>
                            ) : tool.category === 'consumable' ? (
                                <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 flex justify-between items-center">
                                    <div className="text-left font-black">
                                        <p className="text-[8px] text-slate-500 uppercase">{t('tool_quantity')}</p>
                                        <p className="text-xl italic text-emerald-400">{tool.quantity} <span className="text-[10px] not-italic text-slate-500">{tool.unit}</span></p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[8px] text-slate-500 uppercase">{t('tool_location')}</p>
                                        <p className="text-[10px] uppercase font-black text-white">{tool.location || '?'}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 bg-black/20 rounded-2xl flex justify-between items-center">
                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest ">S/N: {tool.serialNumber || '---'}</span>
                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest ">Loc: {tool.location || '?'}</span>
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <button onClick={() => handleEdit(tool)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">{t('edit')}</button>
                                <button onClick={() => setViewingHistoryToolId(tool.id!)} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl">
                                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </button>
                                {tool.category === 'asset' && tool.status === 'borrowed' && (
                                    <button onClick={() => handleQuickReturn(tool)} className="px-4 py-3 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">
                                        {t('quick_return')}
                                    </button>
                                )}
                                {tool.status !== 'borrowed' && (
                                    <button onClick={() => handleDelete(tool.id!, tool.name)} className="p-3 bg-rose-500/5 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl transition-all">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
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
