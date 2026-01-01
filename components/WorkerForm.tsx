import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import type { Worker, Project } from '../types';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { firebaseService } from '../services/firebaseService';
import { useLiveQuery } from 'dexie-react-hooks';

interface WorkerFormProps {
  worker?: Worker;
  onClose: () => void;
}

const WorkerForm: React.FC<WorkerFormProps> = ({ worker, onClose }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [hourlyRate, setHourlyRate] = useState('0');
  const [panelPrice, setPanelPrice] = useState('0');
  const [stringPrice, setStringPrice] = useState('0');
  const [meterPrice, setMeterPrice] = useState('0');
  const [password, setPassword] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [projectIds, setProjectIds] = useState<number[]>([]);

  const activeProjects = useLiveQuery(() => db.projects.where('status').equals('active').toArray(), []);

  useEffect(() => {
    if (worker) {
      setName(worker.name);
      setHourlyRate(String(worker.hourlyRate || 0));
      setPanelPrice(String(worker.panelPrice || 0));
      setStringPrice(String(worker.stringPrice || 0));
      setMeterPrice(String(worker.meterPrice || 0));
      setPassword(worker.password || '1234');
      setColor(worker.color || '#3b82f6');
      setProjectIds(worker.projectIds || []);
    }
  }, [worker]);

  const handleProjectToggle = (projectId: number) => {
    setProjectIds(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const workerData: Omit<Worker, 'id'> = {
      name,
      hourlyRate: user?.role === 'admin' ? (Number(hourlyRate) || 0) : (worker?.hourlyRate ?? 0),
      panelPrice: user?.role === 'admin' ? (Number(panelPrice) || 0) : (worker?.panelPrice ?? 0),
      stringPrice: user?.role === 'admin' ? (Number(stringPrice) || 0) : (worker?.stringPrice ?? 0),
      meterPrice: user?.role === 'admin' ? (Number(meterPrice) || 0) : (worker?.meterPrice ?? 0),
      password: password,
      username: name.toLowerCase().replace(/\s/g, ''),
      color: color,
      projectIds,
      createdAt: worker?.createdAt || new Date(),
    };

    let finalId = worker?.id;
    if (finalId) {
      await db.workers.update(finalId, workerData);
    } else {
      finalId = (await db.workers.add(workerData as Worker)) as number;
    }

    // Bi-directional sync: Update project's workerIds
    if (activeProjects) {
      for (const project of activeProjects) {
        const isAssigned = projectIds.includes(project.id!);
        const wasAssigned = project.workerIds?.includes(finalId!);

        if (isAssigned && !wasAssigned) {
          const newWorkerIds = [...(project.workerIds || []), finalId!];
          await db.projects.update(project.id!, { workerIds: newWorkerIds });
          firebaseService.updateRecord('projects', String(project.id!), { workerIds: newWorkerIds });
        } else if (!isAssigned && wasAssigned) {
          const newWorkerIds = project.workerIds?.filter(id => id !== finalId!);
          await db.projects.update(project.id!, { workerIds: newWorkerIds });
          firebaseService.updateRecord('projects', String(project.id!), { workerIds: newWorkerIds });
        }
      }
    }

    if (firebaseService.isReady && finalId) {
      firebaseService.upsertRecords('workers', [{ ...workerData, id: finalId }])
        .catch(console.error);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-[#020617]/90 backdrop-blur-xl p-0 md:p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-h-[95vh] md:max-w-xl bg-[#0a0c1a] rounded-t-[3rem] md:rounded-[3rem] shadow-[0_0_100px_rgba(99,102,241,0.1)] border border-white/5 flex flex-col overflow-hidden animate-slide-up" onClick={(e) => e.stopPropagation()}>

        {/* Modal Header */}
        <div className="px-8 py-8 border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
              {worker ? 'Upravit člena' : 'Nový člen'}
            </h2>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Nastavení montážního týmu</p>
          </div>
          <button onClick={onClose} className="p-3 text-slate-500 hover:text-white transition-all bg-white/5 rounded-2xl hover:rotate-90 duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">

          <div className="space-y-6">
            <div className="group relative">
              <label htmlFor="name" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">{t('worker_name')}</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-6 py-5 bg-black/40 text-white text-lg font-bold rounded-3xl border border-white/5 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                placeholder="Např. Roman Novák"
              />
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">{t('assigned_projects')}</label>
              <div className="flex flex-wrap gap-2 p-5 bg-black/40 rounded-3xl border border-white/5">
                {activeProjects?.length === 0 ? (
                  <p className="text-[10px] font-bold text-slate-600 uppercase italic">Žádné aktivní projekty</p>
                ) : (
                  activeProjects?.map(project => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleProjectToggle(project.id!)}
                      className={`group relative flex items-center gap-2 px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-tight transition-all duration-300 border ${projectIds.includes(project.id!)
                        ? 'bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-600/20'
                        : 'bg-white/5 text-slate-400 border-white/5 hover:border-indigo-500/30'}`}>
                      {project.name}
                      {projectIds.includes(project.id!) && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>}
                    </button>
                  ))
                )}
              </div>
            </div>

            {user?.role === 'admin' && (
              <div className="space-y-6 pt-6 border-t border-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1 bg-white/5"></div>
                  <span className="text-[9px] font-black text-indigo-500/50 uppercase tracking-[0.3em]">Finanční nastavení</span>
                  <div className="h-px flex-1 bg-white/5"></div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'rate', label: 'Hodinová sazba (€)', val: hourlyRate, set: setHourlyRate },
                    { id: 'panel', label: 'Cena / Panel (€)', val: panelPrice, set: setPanelPrice },
                    { id: 'string', label: 'Cena / String (€)', val: stringPrice, set: setStringPrice },
                    { id: 'meter', label: 'Cena / Metr (€)', val: meterPrice, set: setMeterPrice }
                  ].map(f => (
                    <div key={f.id} className="space-y-2">
                      <label className="block text-[8px] font-black text-slate-600 uppercase tracking-widest ml-4">{f.label}</label>
                      <input
                        type="number"
                        value={f.val}
                        onChange={(e) => f.set(e.target.value)}
                        className="w-full px-5 py-3.5 bg-black/40 text-white font-black rounded-2xl border border-white/5 focus:border-emerald-500/50 transition-all outline-none"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">{t('password_label')}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-6 py-4 bg-black/40 text-white font-bold rounded-3xl border border-white/5 focus:border-indigo-500/50 outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            <div className="pt-6 border-t border-white/5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 ml-1">{t('worker_color')}</label>
              <div className="flex flex-wrap gap-3 p-5 bg-black/40 rounded-[2.5rem] border border-white/5">
                {['#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ef4444', '#f59e0b', '#22c55e', '#10b981', '#06b6d4', '#4f46e5', '#db2777', '#f97316'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-10 w-10 rounded-2xl ${color === c ? 'ring-4 ring-white ring-offset-4 ring-offset-[#0a0c1a] scale-110 shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'opacity-40 hover:opacity-100'} transition-all duration-300`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-8 border-t border-white/5 bg-white/[0.01] flex flex-col md:flex-row gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-10 py-5 bg-white/5 text-slate-400 font-black rounded-[2rem] hover:bg-white/10 hover:text-white transition-all uppercase tracking-widest text-[11px]"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="flex-1 px-12 py-5 bg-white text-black font-black rounded-[2rem] hover:bg-indigo-600 hover:text-white transition-all shadow-[0_15px_30px_rgba(255,255,255,0.1)] uppercase tracking-[0.2em] text-[11px]"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkerForm;
