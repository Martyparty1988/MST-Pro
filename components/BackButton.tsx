import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';

interface BackButtonProps {
    to?: string;
    label?: string;
}

const BackButton: React.FC<BackButtonProps> = ({ to = '/', label }) => {
    const navigate = useNavigate();
    const { t } = useI18n();

    return (
        <button
            onClick={() => navigate(to)}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl transition-all font-bold uppercase tracking-wider text-xs mb-6 active:scale-95 group"
        >
            <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            {label || t('back') || 'ZPĚT'}
        </button>
    );
};

export default BackButton;
