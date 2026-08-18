import React from 'react';
import { SessionConfig, EventDay } from '../../types';
import { getSessionSummaryDetails } from '../../utils/sessionFormatter';
import { Calendar, Clock, BookMarked } from 'lucide-react';

interface SessionSummaryCardProps {
  sessionConfig: SessionConfig | null;
  eventDays?: EventDay[];
  allSessionConfigs?: SessionConfig[];
  className?: string;
  variant?: 'compact' | 'badge' | 'detailed';
}

export const SessionSummaryCard: React.FC<SessionSummaryCardProps> = ({
  sessionConfig,
  eventDays,
  allSessionConfigs,
  className = '',
  variant = 'compact'
}) => {
  if (!sessionConfig) return null;

  const { dayName, sessionTime, sessionName, isFinalEvaluation } = getSessionSummaryDetails(
    sessionConfig,
    eventDays,
    allSessionConfigs
  );

  if (variant === 'badge') {
    return (
      <div className={`inline-flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-3 py-1.5 ${isFinalEvaluation ? 'bg-purple-50 border-purple-200/80' : 'bg-blue-50 border-blue-200/80'} border rounded-lg text-xs ${className}`}>
        <div className={`flex items-center space-x-1.5 font-bold ${isFinalEvaluation ? 'text-purple-900' : 'text-blue-900'}`}>
          <Calendar className={`w-3.5 h-3.5 ${isFinalEvaluation ? 'text-purple-600' : 'text-blue-600'} shrink-0`} />
          <span>{dayName}</span>
          <span className={isFinalEvaluation ? 'text-purple-300' : 'text-blue-300'}>•</span>
          <span>{sessionTime}</span>
        </div>
        {sessionName && (
          <span className={`text-[11px] ${isFinalEvaluation ? 'text-purple-700/80' : 'text-blue-700/80'} font-medium truncate`}>
            ({sessionName})
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      id="session-selected-summary"
      className={`p-3 ${isFinalEvaluation ? 'bg-purple-50/70 hover:bg-purple-50/90 border-purple-200/90' : 'bg-slate-50/90 hover:bg-slate-50 border-slate-200/90'} transition rounded-xl border shadow-2xs space-y-1 text-xs ${className}`}
    >
      {/* Line 1: Day Name & Optional Final Eval Tag */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center space-x-1.5 font-extrabold ${isFinalEvaluation ? 'text-purple-700' : 'text-blue-700'} uppercase tracking-wide text-[11px]`}>
          <Calendar className={`w-3.5 h-3.5 ${isFinalEvaluation ? 'text-purple-600' : 'text-blue-600'} shrink-0`} />
          <span>{dayName}</span>
        </div>
        {isFinalEvaluation && (
          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-extrabold rounded uppercase tracking-wider border border-purple-200">
            Evaluasi Akhir
          </span>
        )}
      </div>

      {/* Line 2: Sesi & Time */}
      <div className="flex items-center space-x-1.5 font-bold text-slate-800 text-xs sm:text-sm">
        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span>{sessionTime}</span>
      </div>

      {/* Line 3: Session Name / Description (Secondary) */}
      {sessionName && (
        <div className="flex items-center space-x-1.5 text-[11px] font-medium text-slate-600 pt-0.5 border-t border-slate-200/60">
          <BookMarked className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="truncate">{sessionName}</span>
        </div>
      )}
    </div>
  );
};
