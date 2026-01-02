import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { useI18n } from '../contexts/I18nContext';
import type { Worker } from '../types';
import WorkerForm from './WorkerForm';
import { useAuth } from '../contexts/AuthContext';
import { firebaseService } from '../services/firebaseService';
import ConfirmationModal from './ConfirmationModal';
import PlusIcon from './icons/PlusIcon';
import SearchIcon from './icons/SearchIcon';
import PencilIcon from './icons/PencilIcon';
import TrashIcon from './icons/TrashIcon';
import BackButton from './BackButton';

const WorkerCard: React.FC<{
  worker: Worker;
  index: number;
  isAdmin: boolean;
  onEdit: (w: Worker) => void;
  onDelete: (w: Worker) => void;
  onClick: (id: number) => void;
}> = ({ worker, index, isAdmin, onEdit, onDelete, onClick }) => {
  const { t } = useI18n();

  return (
    <div
      onClick={() => onClick(worker.id!)}
      className="group ios-card p-6 md:p-8 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-5 relative shadow-xl hover:scale-[1.02] cursor-pointer active:scale-95 transition-all duration-300 bg-white/[0.03] backdrop-blur-xl border border-white/10"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {/* Decorative Blur */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full group-hover:bg-indigo-500/20 transition-colors duration-700" />

      {/* "Detail" hint */}
      <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
      </div>

      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-[2rem] flex items-center justify-center text-2xl md:text-3xl font-black text-white shadow-2xl group-hover:scale-105 transition-transform duration-500 border border-white/10 relative overflow-hidden" style={{ backgroundColor: worker.color || '#6366f1' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
              <span className="relative z-10 drop-shadow-md">{worker.name.substring(0, 2).toUpperCase()}</span>
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-emerald-500 border-[3px] md:border-4 border-[#0a0c1a] shadow-lg"></div>
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="text-xl md:text-2xl font-black text-white italic tracking-tighter uppercase leading-none truncate pr-4">{worker.name}</h3>
            <p className="text-[9px] md:text-[10px] font-black text-indigo-400/60 uppercase tracking-[0.3em] font-mono truncate">Specialista montáže</p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onEdit(worker)}
              className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10 active:scale-90"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(worker)}
              className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all border border-transparent hover:border-rose-500/10 active:scale-90"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="space-y-4 relative z-10 pt-2">
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-black/20 p-4 md:p-5 rounded-2xl border border-white/5 group/stat hover:bg-black/30 transition-colors">
              <span className="block text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 opacity-60">Sazba / h</span>
              <span className="text-lg md:text-xl font-black text-white italic tracking-tighter">€{Number(worker.hourlyRate || 0).toFixed(2)}</span>
            </div>
            <div className="bg-black/20 p-4 md:p-5 rounded-2xl border border-white/5 group/stat hover:bg-black/30 transition-colors">
              <span className="block text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 opacity-60">Projekty</span>
              <span className="text-lg md:text-xl font-black text-white italic tracking-tighter">{worker.projectIds?.length || 0}</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-500/[0.05] to-transparent p-5 md:p-6 rounded-[2rem] border border-white/5 hidden sm:block">
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center group/rate">
                <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2 opacity-50">Panel</span>
                <span className="text-sm font-black text-indigo-300 italic">€{worker.panelPrice}</span>
              </div>
              <div className="text-center border-l border-white/5 group/rate">
                <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2 opacity-50">String</span>
                <span className="text-sm font-black text-indigo-300 italic">€{worker.stringPrice}</span>
              </div>
              <div className="text-center border-l border-white/5 group/rate">
                <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2 opacity-50">Metr</span>
                <span className="text-sm font-black text-indigo-300 italic">€{worker.meterPrice}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isAdmin && (
        <div className="pt-4 border-t border-white/5 mt-auto">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <span>Přiřazené úkoly</span>
            <span className="text-white font-black">12 aktivních</span>
          </div>
        </div>
      )}
    </div>
  );
};

const Workers: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'rate_asc' | 'rate_desc'>('name');
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [editingWorker, setEditingWorker] = useState<Worker | undefined>(undefined);

  const workers = useLiveQuery(() => db.workers.toArray(), []);

  const filteredWorkers = useMemo(() => {
    if (!workers) return [];
    const min = minRate !== '' ? Number(minRate) : 0;
    const max = maxRate !== '' ? Number(maxRate) : Infinity;

    return workers
      .filter(worker => {
        const matchesName = worker.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRate = worker.hourlyRate >= min && worker.hourlyRate <= max;
        return matchesName && matchesRate;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'rate_asc') return a.hourlyRate - b.hourlyRate;
        if (sortBy === 'rate_desc') return b.hourlyRate - a.hourlyRate;
        return 0;
      });
  }, [workers, searchTerm, minRate, maxRate, sortBy]);

  const handleAdd = () => {
    setEditingWorker(undefined);
    setShowForm(true);
  };

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setShowForm(true);
  };

  const confirmDelete = (worker: Worker) => {
    setWorkerToDelete(worker);
  };

  const handleDelete = async () => {
    if (workerToDelete?.id) {
      await db.workers.delete(workerToDelete.id);
      setWorkerToDelete(null);

      // Sync Delete to Firebase
      if (firebaseService.isReady) {
        firebaseService.deleteRecords('workers', [String(workerToDelete.id)])
          .catch(console.error);
      }
    }
  };

  return (
    <div className="space-y-6 md:space-y-12 pb-24 max-w-7xl mx-auto px-2 md:px-4">
      <div className="md:hidden pt-safe pl-2">
        <BackButton />
      </div>

      <header className="space-y-8 md:space-y-12 pt-2 md:pt-0">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6 md:gap-10 px-2 md:px-0">
          <div className="space-y-4 md:space-y-6 max-w-3xl">
            <div className="space-y-1 md:space-y-2">
              <h1 className="text-6xl md:text-9xl font-black text-white tracking-tighter uppercase italic leading-[0.8] md:leading-[0.7]">
                {t('team')}<span className="text-indigo-500 not-italic">.</span>
              </h1>
              <div className="h-1.5 md:h-2 w-32 md:w-48 bg-indigo-600 rounded-full shadow-[0_4px_20px_rgba(79,70,229,0.5)]" />
            </div>
            <p className="text-lg md:text-2xl text-slate-400 font-bold tracking-tight pl-2 border-l-4 border-white/5 py-1 md:py-2 max-w-[90%]">
              Správa montážních čet a jejich výkonnosti v reálném čase.
            </p>
          </div>
          {user?.role === 'admin' && (
            <button
              onClick={handleAdd}
              className="group relative w-full md:w-auto overflow-hidden px-8 py-5 md:px-12 md:py-7 bg-white text-black font-black uppercase tracking-[0.3em] text-[10px] rounded-[2rem] md:rounded-[2.5rem] hover:scale-105 transition-all duration-500 shadow-[0_30px_60px_-15px_rgba(255,255,255,0.15)] active:scale-95"
            >
              <div className="relative z-10 flex items-center justify-center gap-3 md:gap-4">
                <PlusIcon className="w-5 h-5 md:w-6 md:h-6" />
                {t('add_worker')}
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </button>
          )}
        </div>

        {/* Team Stats Quick Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 px-1 md:px-0">
          {[
            { label: 'Celkem expertů', value: workers?.length || 0, icon: 'Users' },
            { label: 'Nasazení dnes', value: workers?.length ? Math.floor(workers.length * 0.8) : 0, color: 'text-emerald-500' },
            { label: 'Pracovní hodiny', value: '142h', color: 'text-indigo-400' },
            { label: 'Efektivita', value: '94%', color: 'text-amber-500' }
          ].map((stat, i) => (
            <div key={i} className="ios-card p-5 md:p-8 flex flex-col justify-between h-32 md:h-40 group border border-white/5 hover:border-indigo-500/30 transition-all duration-500">
              <div className="flex items-center justify-between">
                <p className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1 truncate">{stat.label}</p>
                <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white/10 group-hover:bg-indigo-500 transition-colors" />
              </div>
              <p className={`text-3xl md:text-5xl font-black italic tracking-tighter ${stat.color || 'text-white'}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      </header>

      {/* Enhanced Filter Section */}
      <div className="p-6 md:p-10 ios-card relative overflow-hidden mx-1 md:mx-0">
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/5 blur-[100px] rounded-full" />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 md:gap-10 relative z-10">
          {/* Name Search */}
          <div className="lg:col-span-2 space-y-3 md:space-y-4">
            <label className="block text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">{t('search')}</label>
            <div className="relative group">
              <input
                type="text"
                placeholder={`${t('search')}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 md:pl-14 pr-6 py-4 md:py-6 bg-black/20 text-white placeholder-slate-600 border border-white/5 rounded-2xl md:rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:bg-white/[0.05] focus:border-indigo-500/30 text-xs font-black uppercase tracking-[0.2em] transition-all"
              />
              <SearchIcon className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-slate-600 group-focus-within:text-indigo-500 transition-colors" />
            </div>
          </div>

          {/* Sorting and Range Filters */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div className="space-y-3 md:space-y-4">
              <label className="block text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Seřadit</label>
              <div className="relative group">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-5 md:px-6 py-4 md:py-6 bg-black/20 text-white border border-white/5 rounded-2xl md:rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:bg-white/[0.05] focus:border-indigo-500/30 text-[10px] font-black uppercase tracking-widest transition-all appearance-none cursor-pointer [&>option]:bg-[#020617]"
                >
                  <option value="name">Jméno (A-Z)</option>
                  <option value="rate_asc">Sazba (Vzestupně)</option>
                  <option value="rate_desc">Sazba (Sestupně)</option>
                </select>
                <div className="absolute right-5 md:right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 group-hover:text-indigo-500 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            {user?.role === 'admin' && (
              <>
                <div className="hidden md:block space-y-4">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Min. €/h</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={minRate}
                    onChange={(e) => setMinRate(e.target.value)}
                    className="w-full px-6 py-6 bg-black/20 text-white placeholder-slate-700 border border-white/5 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:bg-white/[0.05] text-[10px] font-black transition-all"
                  />
                </div>
                <div className="hidden md:block space-y-4">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Max. €/h</label>
                  <input
                    type="number"
                    placeholder="100"
                    value={maxRate}
                    onChange={(e) => setMaxRate(e.target.value)}
                    className="w-full px-6 py-6 bg-black/20 text-white placeholder-slate-700 border border-white/5 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:bg-white/[0.05] text-[10px] font-black transition-all"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredWorkers.map((worker, idx) => (
          <WorkerCard
            key={worker.id}
            worker={worker}
            index={idx}
            isAdmin={user?.role === 'admin'}
            onEdit={handleEdit}
            onDelete={confirmDelete}
            onClick={(id) => navigate(`/workers/${id}`)}
          />
        ))}

        {filteredWorkers.length === 0 && (
          <div className="col-span-full py-32 text-center glass-card rounded-[3rem] border border-white/5 bg-white/[0.01]">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <SearchIcon className="w-10 h-10 text-gray-600" />
            </div>
            <p className="text-gray-500 text-2xl font-black uppercase tracking-widest italic opacity-50">{t('no_data')}</p>
          </div>
        )}
      </div>

      {showForm && (
        <WorkerForm
          worker={editingWorker}
          onClose={() => setShowForm(false)}
        />
      )}

      {workerToDelete && (
        <ConfirmationModal
          title={t('delete_worker_title')}
          message={t('delete_worker_confirm_name', { name: workerToDelete.name })}
          onConfirm={handleDelete}
          onCancel={() => setWorkerToDelete(null)}
        />
      )}
    </div>
  );
};

export default Workers;