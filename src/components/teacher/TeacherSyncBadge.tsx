import React from 'react';
import { useTeacherWorkspace } from '../../context/TeacherWorkspaceContext';
import { RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

export const TeacherSyncBadge: React.FC = () => {
  const {
    syncStatus,
    syncMessage,
    lastSyncedAt,
    isRevalidating,
    pendingWrites,
    refreshWorkspace,
    retryPendingWrites
  } = useTeacherWorkspace();

  const formattedTime = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : '-';

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      {/* Sync Status Badge */}
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition shadow-sm ${
          syncStatus === 'SYNCED'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
            : syncStatus === 'SYNCING'
            ? 'bg-blue-50 text-blue-800 border border-blue-200/80'
            : 'bg-amber-50 text-amber-900 border border-amber-300'
        }`}
      >
        {syncStatus === 'SYNCED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
        {syncStatus === 'SYNCING' && <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />}
        {(syncStatus === 'PENDING' || syncStatus === 'ERROR') && (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        )}
        <span className="font-semibold">{syncMessage}</span>
      </div>

      {/* Last Synced Time */}
      {lastSyncedAt && (
        <span className="text-slate-400 flex items-center gap-1 text-[11px] hidden sm:inline-flex">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>Diperbarui: {formattedTime}</span>
        </span>
      )}

      {/* Retry Failed / Pending button */}
      {pendingWrites.some(p => p.status === 'FAILED') && (
        <button
          onClick={() => retryPendingWrites()}
          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold shadow-sm transition"
        >
          Coba Lagi
        </button>
      )}

      {/* Manual Refresh Button */}
      <button
        onClick={() => refreshWorkspace()}
        disabled={isRevalidating}
        className="p-1.5 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 rounded border border-slate-200 shadow-sm transition disabled:opacity-50"
        title="Muat ulang data guru dari server"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRevalidating ? 'animate-spin text-blue-600' : ''}`} />
      </button>
    </div>
  );
};
