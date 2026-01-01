
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { FieldTable } from '../types';
import { getWorkerColor } from '../utils/workerColors';
import { useI18n } from '../contexts/I18nContext';
import { firebaseService } from '../services/firebaseService';
import { soundService } from '../services/soundService';

interface TableModalProps {
    table: FieldTable;
    onClose: () => void;
    onUpdate?: () => void;
    onLogWork?: (table: FieldTable) => void;
}

const TableModal: React.FC<TableModalProps> = ({ table, onClose, onUpdate, onLogWork }) => {
    const { t } = useI18n();
    const [defectNotes, setDefectNotes] = useState(table.defectNotes || '');
    const [photos, setPhotos] = useState(table.photos || []);
    const [isUploading, setIsUploading] = useState(false);
    const [isListening, setIsListening] = useState(false);

    const workers = useLiveQuery(() => db.workers.toArray());

    const completedWorker = table.completedBy
        ? workers?.find(w => w.id === table.completedBy)
        : null;

    const tableColor = completedWorker
        ? getWorkerColor(completedWorker.id!, completedWorker.color, workers)
        : table.status === 'defect' ? '#f43f5e' : '#f59e0b';

    const tableTypeLabels = {
        small: 'IT28 - Malý (1.0 str)',
        medium: 'IT42 - Střední (1.5 str)',
        large: 'IT56 - Velký (2.0 str)',
    };

    const stringsValue = table.tableType === 'small' ? 1.0 : table.tableType === 'large' ? 2.0 : 1.5;

    const handleMarkAsDefect = async () => {
        try {
            await db.fieldTables.update(table.id!, {
                status: 'defect',
                defectNotes: defectNotes,
                photos: photos,
            });

            if (firebaseService.isReady) {
                firebaseService.upsertRecords('fieldTables', [{
                    ...table,
                    id: `${table.projectId}_${table.tableId}`,
                    status: 'defect',
                    defectNotes: defectNotes,
                    photos: photos
                }]).catch(console.error);
            }

            soundService.playError();
            onUpdate?.();
            onClose();
        } catch (error) {
            console.error('Failed to mark table as defect:', error);
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target?.result as string;
                const newPhotos = [...photos, base64];
                setPhotos(newPhotos);
                await db.fieldTables.update(table.id!, { photos: newPhotos });
                setIsUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Photo upload failed:', error);
            setIsUploading(false);
        }
    };

    const toggleListening = () => {
        if (!('webkitSpeechRecognition' in window)) return;
        const SpeechRecognition = (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'cs-CZ';
        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setDefectNotes(prev => prev ? `${prev} ${transcript}` : transcript);
            setIsListening(false);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        if (isListening) recognition.stop(); else recognition.start();
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in overflow-hidden">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={onClose} />

            <div className="relative w-full md:max-w-xl bg-slate-900/95 backdrop-blur-2xl md:rounded-[3rem] rounded-t-[3rem] shadow-2xl border-t md:border border-white/20 max-h-[95vh] flex flex-col overflow-hidden animate-slide-up">

                {/* Header */}
                <div
                    className="p-8 border-b border-white/10 shrink-0 relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${tableColor}20 0%, transparent 100%)` }}
                >
                    <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-5">
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-2xl border-2 border-white/20 shadow-lg"
                                style={{ backgroundColor: tableColor }}
                            >
                                {table.tableId}
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
                                    {t('table') || 'Stůl'} {table.tableId}
                                </h2>
                                <p className="text-indigo-400 text-xs font-black uppercase tracking-widest mt-2">
                                    {tableTypeLabels[table.tableType || 'medium']}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-3 text-gray-400 hover:text-white transition-all bg-white/5 rounded-2xl">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Status Badge */}
                    <div className="mt-6">
                        {table.status === 'completed' ? (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl">
                                <span className="text-emerald-400 font-black text-[10px] uppercase tracking-widest">✓ Hotovo ({completedWorker?.name})</span>
                            </div>
                        ) : table.status === 'defect' ? (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-500/20 border border-rose-500/30 rounded-xl">
                                <span className="text-rose-400 font-black text-[10px] uppercase tracking-widest">⚠️ Závada</span>
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-500">
                                <span className="font-black text-[10px] uppercase tracking-widest italic">Čeká na kabely...</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto grow custom-scrollbar space-y-8 pb-12">

                    {/* Strings Value KPI */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-6 bg-white/5 border border-white/10 rounded-3xl">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Hodnota práce</p>
                            <p className="text-3xl font-black text-white italic tracking-tighter">{stringsValue.toFixed(1)} <span className="text-sm font-normal not-italic opacity-40">str</span></p>
                        </div>
                        <div className="p-6 bg-white/5 border border-white/10 rounded-3xl">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Typ stolu</p>
                            <p className="text-3xl font-black text-white italic tracking-tighter">{(table.tableType || 'M').charAt(0).toUpperCase()}</p>
                        </div>
                    </div>

                    {/* Defect Reporting */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Nahlásit problém / Závadu</h3>
                            <button onClick={toggleListening} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/40' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20'}`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                            </button>
                        </div>
                        <textarea
                            value={defectNotes}
                            onChange={(e) => setDefectNotes(e.target.value)}
                            placeholder="Zde popište závadu (např. krátký kabel, poškozený konektor...)"
                            className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white font-bold text-sm min-h-[100px] outline-none focus:border-rose-500/50 transition-all no-scrollbar"
                        />
                    </div>

                    {/* Photo Evidence */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Fotodokumentace</h3>
                            <label className="cursor-pointer">
                                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploading} />
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest border border-blue-400/20 px-3 py-1.5 rounded-full hover:bg-blue-400 hover:text-white transition-all">
                                    {isUploading ? 'Nahrávám...' : '+ Přidat fotku'}
                                </span>
                            </label>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {photos.map((photo, idx) => (
                                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                                    <img src={photo} alt="" className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer - Only ONE primary action */}
                <div
                    className="p-8 border-t border-white/10 bg-black/40 flex flex-col gap-4 shrink-0"
                    style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
                >
                    <div className="flex gap-3">
                        <button
                            onClick={handleMarkAsDefect}
                            className="flex-1 py-5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 transition-all"
                        >
                            Uložit Závadu
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            soundService.playClick();
                            onLogWork?.(table);
                        }}
                        className="w-full py-6 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-[0.3em] text-xs shadow-2xl shadow-indigo-600/30 active:scale-[0.98] transition-all hover:bg-indigo-500"
                    >
                        Zapsat kabely (stringy) ⚡
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TableModal;
