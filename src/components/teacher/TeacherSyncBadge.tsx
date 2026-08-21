import React, { useMemo, useState } from 'react';
import { useTeacherWorkspace } from '../../context/TeacherWorkspaceContext';
import { RefreshCw, CheckCircle2, AlertTriangle, Clock, WifiOff } from 'lucide-react';

export const TeacherSyncBadge: React.FC = () => {
  const {
    workspace,
    syncStatus,
    syncMessage,
    lastSyncedAt,
    isRevalidating,
    pendingWrites,
    refreshWorkspace,
    retryPendingWrites
  } = useTeacherWorkspace();

  const [manualSyncing, setManualSyncing] = useState(false);

  const students = useMemo(
    () => (Array.isArray(workspace?.students) ? workspace.students : []),
    [workspace?.students]
  );

  const formattedTime = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : '-';

  const resolveStudentName = (studentId?: string, participantId?: string): string => {
    const found = students.find((s: any) =>
      (studentId && String(s?.student_id || '') === String(studentId)) ||
      (participantId && String(s?.participant_id || '') === String(participantId))
    );
    return found?.full_name ? String(found.full_name) : '';
  };

  const getPendingSubjectLabel = (item: any): string => {
    const payload = item?.payload || {};

    if (item?.action === 'saveSessionAssessment') {
      const a = payload.assessment || payload;
      const name = resolveStudentName(a?.student_id, a?.participant_id);
      return name ? `Data ${name}` : 'Data siswa';
    }

    if (item?.action === 'saveFinalEvaluation') {
      const e = payload.finalEvaluation || payload.evaluation || payload;
      const name = resolveStudentName(e?.student_id, e?.participant_id);
      return name ? `Data ${name}` : 'Data siswa';
    }

    if (item?.action === 'deleteFinalEvaluation') {
      const name = resolveStudentName(
        payload.studentId || payload.student_id,
        payload.participantId || payload.participant_id
      );
      return name ? `Data ${name}` : 'Data siswa';
    }

    if (item?.action === 'bulkSaveSessionAttendance') {
      const ids: string[] = Array.isArray(payload.studentIds) ? payload.studentIds : [];
      const names = ids.map(id => resolveStudentName(id)).filter(Boolean);

      if (names.length === 1) return `Data ${names[0]}`;
      if (names.length > 1 && names.length <= 3) return `Data ${names.join(', ')}`;
      if (names.length > 3) return `Data ${names.slice(0, 3).join(', ')} +${names.length - 3} siswa`;
      if (ids.length > 1) return `Data ${ids.length} siswa`;
      return 'Data siswa';
    }

    const generic = payload.assessment || payload.finalEvaluation || payload.evaluation || payload;
    const name = resolveStudentName(
      generic?.student_id || generic?.studentId,
      generic?.participant_id || generic?.participantId
    );
    return name ? `Data ${name}` : 'Data siswa';
  };

  const handleRetryPending = async () => {
    if (manualSyncing || isRevalidating) return;
    setManualSyncing(true);
    try {
      await retryPendingWrites();
    } catch (error) {
      console.warn('[TeacherSyncBadge] Retry pending writes gagal:', error);
    } finally {
      setManualSyncing(false);
    }
  };

  const handleRefresh = async () => {
    if (manualSyncing || isRevalidating) return;
    try {
      await refreshWorkspace();
    } catch (error) {
      console.warn('[TeacherSyncBadge] Refresh workspace gagal:', error);
    }
  };

  const firstPendingProblem = useMemo(() => {
    const queue = Array.isArray(pendingWrites) ? pendingWrites : [];

    const candidate =
      queue.find((item: any) =>
        item?.status === 'FAILED' &&
        String(item?.error || item?.lastError || '').trim()
      ) ||
      queue.find((item: any) =>
        String(item?.error || item?.lastError || '').trim()
      );

    if (!candidate) return null;

    const errorText = String(
      (candidate as any)?.error || (candidate as any)?.lastError || ''
    ).trim();

    if (!errorText) return null;

    return {
      subjectLabel: getPendingSubjectLabel(candidate),
      errorText
    };
  }, [pendingWrites, students]);

  const isBusy = manualSyncing || syncStatus === 'SYNCING';

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
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition shadow-sm ${badgeClasses}`}>
          {syncStatus === 'SYNCED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
          {(syncStatus === 'SYNCING' || manualSyncing) && <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />}
          {syncStatus === 'OFFLINE' && !manualSyncing && <WifiOff className="w-3.5 h-3.5 text-slate-600" />}
          {(syncStatus === 'PENDING' || syncStatus === 'ERROR') && !manualSyncing && (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          )}
          <span className="font-semibold">
            {manualSyncing ? 'Menyinkronkan perubahan...' : syncMessage}
          </span>
        </div>

        {lastSyncedAt && (
          <span className="text-slate-400 flex items-center gap-1 text-[11px] hidden sm:inline-flex">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Diperbarui: {formattedTime}</span>
          </span>
        )}

        {(pendingWrites.length > 0 || syncStatus === 'OFFLINE' || syncStatus === 'ERROR') && (
          <button
            type="button"
            onClick={handleRetryPending}
            disabled={manualSyncing || isRevalidating}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {manualSyncing && <RefreshCw className="w-3 h-3 animate-spin" />}
            <span>
              {manualSyncing
                ? 'Sinkronisasi...'
                : pendingWrites.length > 0
                ? `Sinkronkan (${pendingWrites.length})`
                : 'Coba Hubungkan'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRevalidating || manualSyncing || isBusy}
          className="p-1.5 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 rounded border border-slate-200 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Muat ulang data guru dari server setelah sinkronisasi selesai"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRevalidating ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {pendingWrites.length > 0 && firstPendingProblem && (
        <div
          className="max-w-[620px] text-[10px] sm:text-[11px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 break-words"
          title={`${firstPendingProblem.subjectLabel}: ${firstPendingProblem.errorText}`}
        >
          <span className="font-bold">Sync tertunda:</span>{' '}
          <span className="font-semibold">{firstPendingProblem.subjectLabel}</span>{' '}
          — {firstPendingProblem.errorText}
        </div>
      )}
    </div>
  );
};