import React, { useMemo, useState } from 'react';
import { useTeacherWorkspace } from '../../context/TeacherWorkspaceContext';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  WifiOff
} from 'lucide-react';

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

  const [manualSyncing, setManualSyncing] = useState(false);

  const formattedTime = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : '-';

  /**
   * IMPORTANT:
   * The old button fired:
   *
   *   retryPendingWrites();
   *   refreshWorkspace();
   *
   * at the same time.
   *
   * That creates a race:
   * - write to Spreadsheet is still running
   * - refresh reads the old Spreadsheet row
   * - stale server data can arrive before the write completes
   *
   * "Sinkronkan" must ONLY retry pending writes.
   * Refresh remains a separate explicit action.
   */
  const handleRetryPending = async () => {
    if (manualSyncing || isRevalidating) return;

    setManualSyncing(true);

    try {
      await retryPendingWrites();
    } catch (error) {
      console.warn(
        '[TeacherSyncBadge] Retry pending writes gagal:',
        error
      );
    } finally {
      setManualSyncing(false);
    }
  };

  const handleRefresh = async () => {
    if (manualSyncing || isRevalidating) return;

    try {
      await refreshWorkspace();
    } catch (error) {
      console.warn(
        '[TeacherSyncBadge] Refresh workspace gagal:',
        error
      );
    }
  };

  const firstPendingError = useMemo(() => {
    const failed = pendingWrites.find(
      (item: any) =>
        item?.status === 'FAILED' &&
        String(item?.error || '').trim()
    ) as any;

    if (failed?.error) {
      return String(failed.error);
    }

    const withError = pendingWrites.find(
      (item: any) =>
        String(item?.error || '').trim()
    ) as any;

    return withError?.error
      ? String(withError.error)
      : '';
  }, [pendingWrites]);

  const isBusy =
    manualSyncing ||
    syncStatus === 'SYNCING';

  const badgeClasses =
    syncStatus === 'SYNCED'
      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
      : syncStatus === 'SYNCING'
      ? 'bg-blue-50 text-blue-800 border border-blue-200/80'
      : syncStatus === 'OFFLINE'
      ? 'bg-slate-100 text-slate-800 border border-slate-300'
      : 'bg-amber-50 text-amber-900 border border-amber-300';

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {/* Sync Status Badge */}
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition shadow-sm ${badgeClasses}`}
        >
          {syncStatus === 'SYNCED' && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          )}

          {(syncStatus === 'SYNCING' || manualSyncing) && (
            <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
          )}

          {syncStatus === 'OFFLINE' && !manualSyncing && (
            <WifiOff className="w-3.5 h-3.5 text-slate-600" />
          )}

          {(syncStatus === 'PENDING' || syncStatus === 'ERROR') &&
            !manualSyncing && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            )}

          <span className="font-semibold">
            {manualSyncing
              ? 'Menyinkronkan perubahan...'
              : syncMessage}
          </span>
        </div>

        {/* Last Synced Time */}
        {lastSyncedAt && (
          <span className="text-slate-400 flex items-center gap-1 text-[11px] hidden sm:inline-flex">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Diperbarui: {formattedTime}</span>
          </span>
        )}

        {/* Retry Pending */}
        {(pendingWrites.length > 0 ||
          syncStatus === 'OFFLINE' ||
          syncStatus === 'ERROR') && (
          <button
            type="button"
            onClick={handleRetryPending}
            disabled={manualSyncing || isRevalidating}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            title={
              pendingWrites.length > 0
                ? 'Coba kirim ulang perubahan yang tersimpan di perangkat'
                : 'Coba hubungkan kembali ke backend'
            }
          >
            {manualSyncing && (
              <RefreshCw className="w-3 h-3 animate-spin" />
            )}

            <span>
              {manualSyncing
                ? 'Sinkronisasi...'
                : pendingWrites.length > 0
                ? `Sinkronkan (${pendingWrites.length})`
                : 'Coba Hubungkan'}
            </span>
          </button>
        )}

        {/* Manual Refresh - intentionally separate from retry */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRevalidating || manualSyncing || isBusy}
          className="p-1.5 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 rounded border border-slate-200 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Muat ulang data guru dari server setelah sinkronisasi selesai"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              isRevalidating
                ? 'animate-spin text-blue-600'
                : ''
            }`}
          />
        </button>
      </div>

      {/* Surface the real pending error so debugging does not require guessing. */}
      {pendingWrites.length > 0 && firstPendingError && (
        <div
          className="max-w-[520px] text-[10px] sm:text-[11px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 break-words"
          title={firstPendingError}
        >
          <span className="font-bold">Sync tertunda:</span>{' '}
          {firstPendingError}
        </div>
      )}
    </div>
  );
};