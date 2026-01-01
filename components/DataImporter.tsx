
import React, { useState, useMemo } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { db } from '../services/db';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { Worker, Project } from '../types';
import CheckCircleIcon from './icons/CheckCircleIcon';
import UploadIcon from './icons/UploadIcon';

interface SchemaConfig {
    type: string;
    required: boolean;
    description: string;
}

const DESTINATION_SCHEMAS: Record<'workers' | 'projects', Record<string, SchemaConfig>> = {
    workers: {
        name: { type: 'string', required: true, description: 'Worker full name' },
        hourlyRate: { type: 'number', required: true, description: 'Worker hourly pay rate in Euro' },
    },
    projects: {
        name: { type: 'string', required: true, description: 'Unique project name' },
        description: { type: 'string', required: false, description: 'Detailed project info' },
        status: { type: "'active' | 'completed' | 'on_hold'", required: true, description: 'Current project state' },
    },
};

type DestinationType = keyof typeof DESTINATION_SCHEMAS;
type ImportMethod = 'file';

const DataImporter: React.FC = () => {
    const { t } = useI18n();
    const [method, setMethod] = useState<ImportMethod>('file');
    const [step, setStep] = useState(1);
    const [file, setFile] = useState<File | null>(null);
    const [rawData, setRawData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [destination, setDestination] = useState<DestinationType>('workers');
    const [mappings, setMappings] = useState<{ [key: string]: string }>({});
    const [duplicateHandling, setDuplicateHandling] = useState<'merge' | 'skip'>('skip');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [importResult, setImportResult] = useState<{ new: number, updated: number, skipped: number, warnings: string[] } | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const destinationFields = Object.keys(DESTINATION_SCHEMAS[destination]);

    const resetState = () => {
        setStep(1);
        setFile(null);
        setRawData([]);
        setHeaders([]);
        setMappings({});
        setIsLoading(false);
        setLoadingMessage('');
        setImportResult(null);
    };

    const handleFile = async (selectedFile: File) => {
        setFile(selectedFile);

        setIsLoading(true);
        const extension = selectedFile.name.split('.').pop()?.toLowerCase();

        try {
            if (['csv', 'txt'].includes(extension!)) {
                setLoadingMessage('Parsing CSV...');
                Papa.parse(selectedFile, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        setRawData(results.data);
                        setHeaders(results.meta.fields || []);
                        setStep(2);
                    },
                });
            } else if (['xls', 'xlsx'].includes(extension!)) {
                setLoadingMessage('Parsing Excel file...');
                const reader = new FileReader();
                reader.onload = (e) => {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    const [headerRow, ...dataRows] = json as any[][];
                    setHeaders(headerRow.map(h => String(h)));
                    setRawData(dataRows.map(row => headerRow.reduce((obj, h, i) => ({ ...obj, [h]: row[i] }), {})));
                    setStep(2);
                };
                reader.readAsArrayBuffer(selectedFile);
            } else if (selectedFile.type === 'application/json' || extension === 'json') {
                setLoadingMessage('Parsing JSON...');
                const text = await selectedFile.text();
                const data = JSON.parse(text);
                if (Array.isArray(data) && data.length > 0) {
                    setRawData(data);
                    setHeaders(Object.keys(data[0]));
                    setStep(2);
                } else { throw new Error("JSON must be an array of objects."); }
            } else {
                throw new Error("Unsupported file type for offline import.");
            }
        } catch (error) {
            alert(`Error: ${error instanceof Error ? error.message : 'Could not process file.'}`);
            resetState();
        } finally {
            setIsLoading(false);
        }
    };

    const requiredFields = (Object.entries(DESTINATION_SCHEMAS[destination]) as [string, SchemaConfig][])
        .filter(([_, config]) => config.required)
        .map(([key]) => key);

    const mappedDestinationFields = Object.values(mappings);
    const missingFields = requiredFields.filter(f => !mappedDestinationFields.includes(f));

    const previewData = useMemo(() => {
        if (step !== 3) return [];
        return rawData.slice(0, 5).map(row => {
            const newRow: { [key: string]: any } = {};
            for (const destField of destinationFields) {
                const sourceHeader = Object.keys(mappings).find(h => mappings[h] === destField);
                newRow[destField] = sourceHeader ? row[sourceHeader] : null;
            }
            return newRow;
        });
    }, [step, rawData, mappings, destinationFields]);

    const handleImport = async () => {
        setStep(4);
        setIsLoading(true);

        let newCount = 0, updatedCount = 0, skippedCount = 0;
        const table = db[destination];

        for (const row of rawData) {
            const newRecord: { [key: string]: any } = {};
            let uniqueIdentifier: string | null = null;

            for (const header in mappings) {
                const destField = mappings[header];
                if (destField) {
                    let val = row[header];
                    // Basic type casting
                    if (DESTINATION_SCHEMAS[destination][destField]?.type === 'number') val = Number(val);
                    newRecord[destField] = val;
                    if (destField === 'name') uniqueIdentifier = String(val);
                }
            }

            if (destination === 'workers') {
                newRecord.createdAt = new Date();
                // Basic login generation for imported workers
                if (newRecord.name) {
                    newRecord.username = String(newRecord.name).toLowerCase().replace(/\s/g, '');
                }
            }

            if (!uniqueIdentifier) {
                await (table as any).add(newRecord);
                newCount++;
                continue;
            }

            const existing = await table.where('name').equalsIgnoreCase(uniqueIdentifier).first();

            if (existing) {
                if (duplicateHandling === 'skip') {
                    skippedCount++;
                    continue;
                } else if (duplicateHandling === 'merge') {
                    await table.update(existing.id, newRecord);
                    updatedCount++;
                }
            } else {
                await (table as any).add(newRecord);
                newCount++;
            }
        }

        setImportResult({ new: newCount, updated: updatedCount, skipped: skippedCount, warnings: [] });
        setIsLoading(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <h1 className="text-5xl font-bold text-white [text-shadow:0_4px_12px_rgba(0,0,0,0.5)]">{t('import_data_title')}</h1>
                <div className="flex bg-black/20 p-1 rounded-2xl border border-white/10 backdrop-blur-xl shrink-0">
                    <button
                        onClick={() => { setMethod('file'); resetState(); }}
                        className={`px-4 py-2 rounded-xl text-sm font-black uppercase transition-all flex items-center gap-2 ${method === 'file' ? 'bg-[var(--color-primary)] text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        <UploadIcon className="w-4 h-4" />
                        {t('file_upload')}
                    </button>
                </div>
            </div>

            <div className="p-8 bg-black/20 backdrop-blur-2xl rounded-[3rem] border border-white/10 shadow-2xl min-h-[60vh] relative overflow-hidden">
                {isLoading && <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-50 flex flex-col items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div><p className="text-white text-xl font-black uppercase tracking-widest">{loadingMessage}</p></div>}

                {step === 1 && (
                    <div className="animate-fade-in space-y-8">
                        <div className="flex flex-col md:flex-row gap-8 items-end">
                            <div className="w-full max-w-sm">
                                <label className="block text-sm font-black text-gray-400 uppercase mb-2 tracking-widest">{t('select_import_type')}</label>
                                <select value={destination} onChange={e => setDestination(e.target.value as DestinationType)} className="w-full p-4 bg-black/40 text-white border border-white/10 rounded-2xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-lg font-bold [&>option]:bg-gray-800">
                                    <option value="workers">{t('workers')}</option>
                                    <option value="projects">{t('projects')}</option>
                                </select>
                            </div>
                        </div>

                        {method === 'file' && (
                            <div
                                onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)}
                                className={`flex flex-col justify-center items-center h-80 border-4 border-dashed rounded-[2rem] cursor-pointer transition-all duration-300 ${isDragOver ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 scale-102' : 'border-white/10 hover:border-white/30 hover:bg-white/5'}`}
                                onClick={() => document.getElementById('file-upload-importer')?.click()}
                            >
                                <div className="p-6 bg-white/5 rounded-full mb-4"><UploadIcon className="w-16 h-16 text-gray-400" /></div>
                                <p className="text-2xl font-black text-white uppercase tracking-tighter">{t('upload_file_area')}</p>
                                <p className="text-gray-500 mt-2">CSV, Excel, JSON (Max 5MB)</p>
                                <input id="file-upload-importer" type="file" className="sr-only" onChange={(e) => e.target.files && handleFile(e.target.files[0])} />
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="animate-fade-in">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{t('step_2_map_title')}</h2>
                        </div>

                        <div className={`mb-8 p-6 rounded-3xl border ${missingFields.length === 0 ? 'bg-green-900/20 border-green-500/30' : 'bg-amber-900/20 border-amber-500/30'}`}>
                            <h3 className={`font-black mb-3 flex items-center gap-2 uppercase tracking-widest ${missingFields.length === 0 ? 'text-green-400' : 'text-amber-400'}`}>
                                {missingFields.length === 0 ? <CheckCircleIcon className="w-6 h-6" /> : null}
                                {t('required_fields')}
                            </h3>
                            <div className="flex flex-wrap gap-3">
                                {requiredFields.map(field => {
                                    const isMapped = mappedDestinationFields.includes(field);
                                    return (
                                        <span key={field} className={`px-4 py-2 rounded-xl text-sm font-black border transition-all ${isMapped ? 'bg-green-500/20 text-green-300 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>
                                            {field.toUpperCase()} {isMapped ? '✓' : '✗'}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto custom-scrollbar pr-4">
                            {headers.map(header => (
                                <div key={header} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-2 hover:border-[var(--color-accent)]/30 transition-colors">
                                    <span className="font-black text-gray-400 text-xs uppercase tracking-widest truncate">{header}</span>
                                    <select
                                        value={mappings[header] || ''}
                                        onChange={e => setMappings({ ...mappings, [header]: e.target.value })}
                                        className="w-full p-3 bg-black/40 text-white border border-white/10 rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none font-bold text-sm [&>option]:bg-gray-800"
                                    >
                                        <option value="">{t('unmapped')}</option>
                                        {destinationFields.map(field => <option key={field} value={field}>{field}{requiredFields.includes(field) ? ' *' : ''}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between mt-10 pt-6 border-t border-white/10">
                            <button onClick={() => resetState()} className="px-8 py-4 bg-white/5 text-white font-black rounded-2xl hover:bg-white/10 transition-colors uppercase tracking-widest">{t('back_step')}</button>
                            <button
                                onClick={() => setStep(3)}
                                disabled={missingFields.length > 0}
                                className="px-10 py-4 bg-[var(--color-primary)] text-white font-black rounded-2xl hover:bg-[var(--color-primary-hover)] transition-all shadow-xl uppercase tracking-widest disabled:opacity-30 disabled:grayscale"
                            >
                                {t('next_step')}
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="animate-fade-in">
                        <h2 className="text-3xl font-black mb-8 text-white uppercase tracking-tighter">{t('step_3_preview_title')}</h2>
                        <div className="overflow-x-auto bg-black/30 rounded-3xl border border-white/10 mb-8 shadow-inner custom-scrollbar">
                            <table className="min-w-full divide-y divide-white/10">
                                <thead className="bg-white/5">
                                    <tr className="text-left">
                                        {destinationFields.map(field => (
                                            <th key={field} className="p-5 font-black text-gray-400 text-xs uppercase tracking-widest">{field}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {previewData.map((row, i) => (
                                        <tr key={i} className="hover:bg-white/5 transition-colors">
                                            {destinationFields.map(field => (
                                                <td key={field} className="p-5 text-gray-300 font-bold truncate max-w-[200px]">{String(row[field] ?? '-')}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-white/5 p-6 rounded-3xl border border-white/10 mb-8">
                            <label className="block text-sm font-black text-gray-400 uppercase mb-4 tracking-widest">{t('duplicates_handling')}</label>
                            <div className="flex gap-4">
                                <button onClick={() => setDuplicateHandling('skip')} className={`flex-1 p-4 rounded-2xl font-black transition-all border-2 ${duplicateHandling === 'skip' ? 'bg-indigo-600 border-white text-white shadow-lg' : 'bg-black/20 border-white/10 text-gray-500'}`}>{t('skip_duplicates').toUpperCase()}</button>
                                <button onClick={() => setDuplicateHandling('merge')} className={`flex-1 p-4 rounded-2xl font-black transition-all border-2 ${duplicateHandling === 'merge' ? 'bg-indigo-600 border-white text-white shadow-lg' : 'bg-black/20 border-white/10 text-gray-500'}`}>{t('merge_on_name').toUpperCase()}</button>
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <button onClick={() => setStep(2)} className="px-8 py-4 bg-white/5 text-white font-black rounded-2xl hover:bg-white/10 transition-colors uppercase tracking-widest">{t('back_step')}</button>
                            <button onClick={handleImport} className="px-10 py-4 bg-[var(--color-primary)] text-white font-black rounded-2xl hover:bg-[var(--color-primary-hover)] transition-all shadow-xl uppercase tracking-widest">{t('start_import')}</button>
                        </div>
                    </div>
                )}

                {step === 4 && importResult && (
                    <div className="text-center animate-fade-in flex flex-col items-center justify-center h-full py-12">
                        <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(34,197,94,0.3)] border border-green-500/50">
                            <CheckCircleIcon className="w-12 h-12 text-green-400" />
                        </div>
                        <h2 className="text-5xl font-black mb-10 text-white uppercase tracking-tighter">{t('import_summary')}</h2>
                        <div className="space-y-4 w-full max-w-md bg-black/40 p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                            <div className="flex justify-between items-center border-b border-white/5 pb-4">
                                <span className="text-gray-400 font-bold uppercase text-sm tracking-widest">{t('new_records')}</span>
                                <span className="text-4xl text-green-400 font-black">+{importResult.new}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="text-gray-400 font-bold uppercase text-sm tracking-widest">{t('skipped_records')}</span>
                                <span className="text-2xl text-gray-500 font-black">{importResult.skipped}</span>
                            </div>
                        </div>
                        <button onClick={resetState} className="mt-12 px-12 py-5 bg-[var(--color-primary)] text-white font-black rounded-2xl hover:bg-[var(--color-primary-hover)] transition-all shadow-xl uppercase tracking-widest scale-105">{t('import_another_file')}</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DataImporter;
