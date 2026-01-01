import React, { useState, useEffect, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { useI18n } from '../contexts/I18nContext';
import MapIcon from './icons/MapIcon';

const ProjectFinder: React.FC = () => {
    const { t } = useI18n();
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ text: string; chunks: any[] } | null>(null);
    const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [useLocation, setUseLocation] = useState(true);

    // Integrate "JSON all data": Fetch ALL relevant app data
    const projects = useLiveQuery(() => db.projects.toArray());
    const workers = useLiveQuery(() => db.workers.toArray());
    const records = useLiveQuery(() => db.records.orderBy('startTime').reverse().limit(50).toArray()); // Recent records
    const solarTables = useLiveQuery(() => db.solarTables.toArray());
    const tableAssignments = useLiveQuery(() => db.tableAssignments.toArray());
    const projectTasks = useLiveQuery(() => db.projectTasks.toArray());
    const dailyLogs = useLiveQuery(() => db.dailyLogs.orderBy('date').reverse().limit(50).toArray()); // Recent logs

    useEffect(() => {
        if (useLocation) {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setLocation({
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                        });
                    },
                    (geolocationError) => {
                        console.error("Geolocation error:", geolocationError);
                    }
                );
            }
        } else {
            setLocation(null);
        }
    }, [useLocation]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setLoading(true);
        setError(null);
        setResult(null);

        // Check if user has selected an API key if required
        if ((window as any).aistudio?.hasSelectedApiKey) {
            const hasKey = await (window as any).aistudio.hasSelectedApiKey();
            if (!hasKey) {
                setError("Prosím, nejprve si v nastavení připojte Gemini API klíč.");
                setLoading(false);
                return;
            }
        }

        if (!import.meta.env.VITE_API_KEY) {
            setError("API key is not configured.");
            setLoading(false);
            return;
        }

        try {
            // Per guidelines: Create a new GoogleGenAI instance right before making an API call
            const api_key = (window as any).aistudio?.apiKey || import.meta.env.VITE_API_KEY || '';
            if (!api_key) throw new Error("API Key not found");
            const ai = new GoogleGenAI({ apiKey: api_key });

            // 1. Prepare Full App Data Context
            const appData = {
                projects: projects?.map(({ planFile, ...p }) => p) || [],
                workers: workers || [],
                tables: solarTables?.map(({ x, y, ...t }) => t) || [],
                assignments: tableAssignments || [],
                tasks: projectTasks || [],
                attendance: dailyLogs || [],
                recentActivity: records || []
            };

            const dataContextString = JSON.stringify(appData, null, 2);

            // 2. Construct Enhanced Prompt
            const fullPrompt = `
            You are a specialized Solar Project Scout and Data Analyst.
            
            USER CONTEXT:
            - Location: ${location ? `${location.latitude}, ${location.longitude}` : 'Unknown'}
            - Query: "${prompt}"
            
            INTERNAL DATABASE (JSON):
            ${dataContextString}
            
            TASKS:
            1. **Search**: Use the 'googleMaps' tool to find real-world locations, solar parks, or construction sites relevant to the query.
            2. **Cross-Reference**: Compare found external results with the 'INTERNAL DATABASE'. 
               - Does a found location match an existing project name or worker activity?
               - If the user asks about specific internal data (e.g. "Who is working at Zarasai?", "Status of table 105"), answer DIRECTLY using the JSON data.
            3. **Synthesize**: Provide a comprehensive answer. 
               - If finding new projects: List them with distance and details.
               - If analyzing existing projects: Report status (e.g., "Zarasai project is active with 150/500 tables completed.").
            
            FORMATTING:
            - Use clear Markdown.
            - Bold key insights.
            - If matching an internal project, clearly label it as **[INTERNAL PROJECT]**.
            `;

            // Using gemini-2.5-flash-image for Maps grounding as per guidelines for 2.5 series
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: fullPrompt,
                config: {
                    tools: [{ googleMaps: {} }],
                },
                ...(location && {
                    toolConfig: {
                        retrievalConfig: {
                            latLng: location,
                        },
                    },
                }),
            });

            const text = response.text;
            const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

            setResult({ text, chunks });

        } catch (err) {
            console.error("Gemini API call failed:", err);
            const msg = err instanceof Error ? err.message : "An unknown error occurred.";
            if (msg.includes("Requested entity was not found")) {
                setError("API klíč nebyl nalezen nebo vypršel. Prosím vyberte ho znovu v nastavení.");
                if ((window as any).aistudio?.openSelectKey) {
                    // Option to reset state if needed
                }
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const renderChunk = (chunk: any, index: number) => {
        if (chunk.maps) {
            return (
                <a
                    key={index}
                    href={chunk.maps.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/10 hover:border-cyan-400/30 group"
                >
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-black/30 rounded-lg group-hover:bg-cyan-900/30 transition-colors">
                            <MapIcon className="w-6 h-6 text-red-400 group-hover:text-cyan-400 transition-colors" />
                        </div>
                        <div>
                            <p className="font-bold text-gray-100 group-hover:text-cyan-300 transition-colors">{chunk.maps.title}</p>
                            <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-semibold">Google Maps</p>
                        </div>
                    </div>
                    {chunk.maps.placeAnswerSources?.reviewSnippets?.map((snippet: any, i: number) => (
                        <blockquote key={i} className="mt-3 pl-3 border-l-2 border-cyan-500/30 text-sm text-gray-400 italic">
                            "{snippet.text}"
                        </blockquote>
                    ))}
                </a>
            );
        } else if (chunk.web) {
            return (
                <a
                    key={index}
                    href={chunk.web.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/10 hover:border-blue-400/30 group"
                >
                    <p className="font-bold text-blue-400 truncate group-hover:text-blue-300 transition-colors">{chunk.web.title}</p>
                    <p className="text-xs text-gray-500 mt-1 truncate">{chunk.web.uri}</p>
                </a>
            );
        }
        return null;
    };


    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-5xl font-bold text-white [text-shadow:0_4px_12_rgba(0,0,0,0.5)] mb-2">{t('project_finder')}</h1>
                    <p className="text-lg text-gray-300">{t('find_projects_nearby')}</p>
                </div>
                <div className="flex items-center gap-3 bg-black/20 p-3 rounded-2xl border border-white/10 backdrop-blur-sm">
                    <span className={`text-sm font-bold flex items-center gap-2 ${location ? 'text-green-400' : 'text-gray-400'}`}>
                        {location ? (
                            <>
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                </span>
                                Location Active
                            </>
                        ) : 'Location Inactive'}
                    </span>
                    <input
                        type="checkbox"
                        checked={useLocation}
                        onChange={(e) => setUseLocation(e.target.checked)}
                        className="toggle toggle-success toggle-sm"
                    />
                </div>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 mb-8">
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={t('search_projects')}
                    className="flex-grow p-4 bg-black/20 text-white placeholder-gray-400 border border-white/20 rounded-2xl focus:ring-blue-400 focus:border-blue-400 text-lg shadow-inner"
                />
                <button
                    type="submit"
                    disabled={loading || !prompt.trim()}
                    className="px-8 py-4 bg-[var(--color-primary)] text-white font-bold rounded-2xl hover:bg-[var(--color-primary-hover)] transition-all shadow-lg text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 hover:scale-105 active:scale-95"
                >
                    {loading ? (
                        <>
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                            {t('looking_for_projects')}
                        </>
                    ) : (
                        <>
                            <MapIcon className="w-6 h-6" />
                            {t('search')}
                        </>
                    )}
                </button>
            </form>

            {error && !loading && (
                <div className="p-4 mb-8 bg-red-900/50 text-red-200 border border-red-700/50 rounded-2xl flex items-center gap-3">
                    <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {error}
                </div>
            )}

            {result && (
                <div className="space-y-8 animate-fade-in">
                    <div className="p-8 bg-black/30 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl">
                        <div
                            className="prose prose-invert max-w-none text-gray-200 text-lg leading-relaxed whitespace-pre-wrap"
                            style={{ '--tw-prose-bold': 'var(--color-accent)', '--tw-prose-links': '#60a5fa' } as React.CSSProperties}
                        >
                            {result.text}
                        </div>
                    </div>

                    {result.chunks.length > 0 && (
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                                <MapIcon className="w-6 h-6 text-[var(--color-accent)]" />
                                {t('sources')}
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {result.chunks.map(renderChunk)}
                            </div>
                        </div>
                    )}

                    {!result.text && result.chunks.length === 0 && (
                        <div className="text-center py-16 bg-black/10 rounded-3xl border border-white/5">
                            <p className="text-gray-400 text-xl">{t('no_results_found')}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ProjectFinder;