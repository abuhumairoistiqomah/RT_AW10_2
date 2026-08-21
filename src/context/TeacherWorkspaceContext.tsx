import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import {
  User,
  TeacherWorkspaceBootstrap,
  PendingAssessmentWrite,
  SessionAssessment,
  TeacherStudentSummary,
  FinalEvaluation,
  Teacher
} from '../types';
import { ApiService } from '../services/api';
import {
  hasAssessmentContent,
  deduplicateAssessments
} from '../utils/assessmentResolver';

type SyncStatus = 'SYNCED' | 'SYNCING' | 'PENDING' | 'OFFLINE' | 'ERROR';

interface TeacherWorkspaceContextType {
  workspace: TeacherWorkspaceBootstrap | null;
  isLoading: boolean;
  isRevalidating: boolean;
  syncStatus: SyncStatus;
  syncMessage: string;
  lastSyncedAt: Date | null;
  pendingWrites: PendingAssessmentWrite[];

  activeHalaqahId: string;
  setActiveHalaqahId: (halaqahId: string) => void;

  selectedTeacherId: string;
  setSelectedTeacherId: (teacherId: string) => void;
  availableTeachers: Teacher[];

  preloadWorkspace: (
    forceRefresh?: boolean,
    halaqahIdOverride?: string,
    teacherIdOverride?: string
  ) => Promise<void>;

  refreshWorkspace: () => Promise<void>;

  saveAssessmentOptimistic: (
    payload: any
  ) => Promise<{ success: boolean; error?: string }>;

  deleteAssessmentOptimistic: (
    assessmentId: string,
    participantId?: string,
    sessionConfigId?: string,
    studentId?: string
  ) => Promise<{ success: boolean; error?: string }>;

  saveFinalEvaluationOptimistic: (
    payload: any
  ) => Promise<{ success: boolean; error?: string }>;

  deleteFinalEvaluationOptimistic: (params: {
    finalEvaluationId?: string;
    participantId?: string;
    studentId?: string;
  }) => Promise<{ success: boolean; error?: string }>;

  applyBulkAttendanceOptimistic: (
    sessionConfigId: string,
    studentIds: string[],
    attendanceStatus: 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT'
  ) => Promise<{ success: boolean; error?: string }>;

  retryPendingWrites: () => Promise<void>;
}

const TeacherWorkspaceContext =
  createContext<TeacherWorkspaceContextType | null>(null);

const STORAGE_PREFIX = 'rt_teacher_ws_';
const PENDING_PREFIX = 'rt_teacher_pending_';
const FINAL_EVAL_SENTINEL = '__FINAL_EVALUATION__';

function getWorkspaceCacheKey(
  teacherId: string,
  eventId = 'curr',
  halaqahId = 'def'
): string {
  return `${STORAGE_PREFIX}${teacherId}_${eventId}_${halaqahId}`;
}

function getPendingCacheKey(teacherId: string): string {
  return `${PENDING_PREFIX}${teacherId}`;
}

function isFinalEvaluationWrite(item: PendingAssessmentWrite): boolean {
  return item?.payload?.action === 'saveFinalEvaluation';
}

function isDeleteFinalEvaluationWrite(item: PendingAssessmentWrite): boolean {
  return item?.payload?.action === 'deleteFinalEvaluation';
}

function isAnyFinalEvaluationWrite(item: PendingAssessmentWrite): boolean {
  return isFinalEvaluationWrite(item) || isDeleteFinalEvaluationWrite(item);
}

function isBulkAttendanceWrite(item: PendingAssessmentWrite): boolean {
  return (
    item?.payload?.action === 'bulkSaveSessionAttendance' ||
    Array.isArray(item?.payload?.studentIds)
  );
}

export function clearTeacherWorkspaceCache(
  teacherId?: string,
  eventId?: string
): void {
  try {
    const remove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;

      if (teacherId && eventId) {
        if (key.startsWith(`${STORAGE_PREFIX}${teacherId}_${eventId}`)) {
          remove.push(key);
        }
      } else if (teacherId) {
        if (key.startsWith(`${STORAGE_PREFIX}${teacherId}_`)) {
          remove.push(key);
        }
      } else {
        remove.push(key);
      }
    }

    remove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.error('Error clearing teacher workspace cache:', error);
  }
}

function loadCachedWorkspace(
  teacherId: string,
  eventId?: string,
  halaqahId?: string
): TeacherWorkspaceBootstrap | null {
  if (!teacherId) return null;

  try {
    const exactKey = getWorkspaceCacheKey(
      teacherId,
      eventId || 'curr',
      halaqahId || 'def'
    );

    const exactRaw = localStorage.getItem(exactKey);
    if (exactRaw) {
      const parsed = JSON.parse(exactRaw);
      if (
        parsed?.halaqah &&
        Array.isArray(parsed?.availableHalaqahs) &&
        parsed.availableHalaqahs.length > 0
      ) {
        return parsed;
      }
    }

    // Fallback to another valid cache for this teacher.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${STORAGE_PREFIX}${teacherId}_`)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (
        parsed?.halaqah &&
        Array.isArray(parsed?.availableHalaqahs) &&
        parsed.availableHalaqahs.length > 0
      ) {
        return parsed;
      }
    }

    return null;
  } catch (error) {
    console.error('Error loading cached teacher workspace:', error);
    return null;
  }
}

function saveWorkspaceToCache(
  teacherId: string,
  workspace: TeacherWorkspaceBootstrap
): void {
  if (!teacherId) return;

  // Never destroy a useful cache just because a revalidation returned empty data.
  if (
    !workspace?.halaqah ||
    !Array.isArray(workspace.availableHalaqahs) ||
    workspace.availableHalaqahs.length === 0
  ) {
    return;
  }

  try {
    const eventId = workspace.event?.event_id || 'curr';
    const halaqahId = workspace.halaqah?.halaqah_id || 'def';
    localStorage.setItem(
      getWorkspaceCacheKey(teacherId, eventId, halaqahId),
      JSON.stringify(workspace)
    );
  } catch (error) {
    console.error('Error saving teacher workspace to cache:', error);
  }
}

function loadPendingWrites(teacherId: string): PendingAssessmentWrite[] {
  if (!teacherId) return [];

  try {
    const raw = localStorage.getItem(getPendingCacheKey(teacherId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingWrites(
  teacherId: string,
  list: PendingAssessmentWrite[]
): void {
  if (!teacherId) return;

  try {
    const key = getPendingCacheKey(teacherId);
    if (list.length > 0) {
      localStorage.setItem(key, JSON.stringify(list));
    } else {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error('Error saving pending writes:', error);
  }
}

export const TeacherWorkspaceProvider: React.FC<{
  currentUser: User | null;
  children: React.ReactNode;
}> = ({ currentUser, children }) => {
  const isTeacher = currentUser?.role === 'TEACHER';
  const isTeacherOrStaff =
    currentUser?.role === 'TEACHER' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'COORDINATOR';

  const [selectedTeacherId, setSelectedTeacherIdState] = useState('');
  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);

  const effectiveTeacherId = isTeacher
    ? currentUser?.teacher_id || ''
    : selectedTeacherId;

  const initialCacheKey = isTeacher
    ? currentUser?.teacher_id || ''
    : '__ADMIN_ALL__';

  const [workspace, setWorkspace] =
    useState<TeacherWorkspaceBootstrap | null>(() => {
      if (!initialCacheKey) return null;
      const cached = loadCachedWorkspace(initialCacheKey);
      if (cached) {
        console.log(
          '[PERF] ASSESSMENT FORM RENDER: Initialized immediately from local cache'
        );
      }
      return cached;
    });

  const [isLoading, setIsLoading] = useState(
    !workspace && Boolean(isTeacher ? currentUser?.teacher_id : true)
  );
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [activeHalaqahId, setActiveHalaqahIdState] = useState(
    workspace?.halaqah?.halaqah_id || ''
  );
  const [pendingWrites, setPendingWrites] = useState<PendingAssessmentWrite[]>(
    () => loadPendingWrites(initialCacheKey)
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('SYNCED');
  const [syncMessage, setSyncMessage] = useState('Tersinkron');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
    workspace?.lastSyncedAt ? new Date(workspace.lastSyncedAt) : null
  );

  const syncInProgressRef = useRef(false);

  useEffect(() => {
    if (
      currentUser?.role !== 'ADMIN' &&
      currentUser?.role !== 'COORDINATOR'
    ) {
      setAvailableTeachers([]);
      return;
    }

    ApiService.getTeachers()
      .then(teachers => {
        setAvailableTeachers(
          teachers.filter(
            teacher =>
              teacher.active !== false &&
              String(teacher.active) !== 'false'
          )
        );
      })
      .catch(error => {
        console.warn('Failed to load teachers list:', error);
      });
  }, [currentUser?.role]);

  const recomputeStudentProgress = useCallback(
    (
      students: TeacherStudentSummary[],
      assessments: SessionAssessment[],
      evaluations: FinalEvaluation[]
    ): TeacherStudentSummary[] => {
      const assessmentMap = new Map<string, SessionAssessment[]>();

      assessments.forEach(assessment => {
        if (
          assessment.is_deleted ||
          assessment.attendance_status !== 'PRESENT'
        ) {
          return;
        }

        const list = assessmentMap.get(assessment.student_id) || [];
        list.push(assessment);
        assessmentMap.set(assessment.student_id, list);
      });

      const evaluationMap = new Map<string, FinalEvaluation>();
      evaluations.forEach(evaluation => {
        if (evaluation.participant_id) {
          evaluationMap.set(evaluation.participant_id, evaluation);
        }
        if (evaluation.student_id) {
          evaluationMap.set(evaluation.student_id, evaluation);
        }
      });

      return students.map(student => {
        const rows = assessmentMap.get(student.student_id) || [];

        let ziyadahLines = 0;
        let nuroniyyahLines = 0;
        let iqraPages = 0;

        rows.forEach(assessment => {
          const mode =
            assessment.assessment_mode ||
            (assessment.iqra_level != null
              ? 'IQRA'
              : assessment.nuroniyyah_dars
                ? 'NURONIYYAH'
                : 'ZIYADAH');

          if (mode === 'IQRA') {
            iqraPages += Number(assessment.iqra_pages_added) || 0;
          } else if (mode === 'NURONIYYAH') {
            nuroniyyahLines += Number(assessment.lines_added) || 0;
          } else {
            ziyadahLines += Number(assessment.lines_added) || 0;
          }
        });

        const evaluation =
          evaluationMap.get(student.participant_id) ||
          evaluationMap.get(student.student_id);

        return {
          ...student,
          totalLinesAdded: ziyadahLines,
          totalZiyadahLinesAdded: ziyadahLines,
          totalNuroniyyahLinesAdded: nuroniyyahLines,
          totalIqraPagesAdded: iqraPages,
          completionStatus: evaluation
            ? evaluation.completion_status
            : 'NOT_EVALUATED'
        };
      });
    },
    []
  );

  const setStatusFromQueue = useCallback(
    (queue: PendingAssessmentWrite[], revalidating = false) => {
      const cb = ApiService.getCircuitBreakerState();
      const offline =
        cb.isOffline ||
        (typeof navigator !== 'undefined' && !navigator.onLine);

      if (queue.length > 0) {
        if (offline) {
          setSyncStatus('OFFLINE');
          setSyncMessage(
            `Mode Offline — ${queue.length} perubahan aman di perangkat`
          );
          return;
        }

        const failed = queue.some(item => item.status === 'FAILED');
        setSyncStatus(failed ? 'PENDING' : 'SYNCING');
        setSyncMessage(
          failed
            ? `⚠ ${queue.length} perubahan belum tersinkron`
            : 'Menyinkronkan data...'
        );
        return;
      }

      if (offline) {
        setSyncStatus('OFFLINE');
        setSyncMessage('Mode Offline / Cache');
      } else if (revalidating) {
        setSyncStatus('SYNCING');
        setSyncMessage('Memuat pembaruan...');
      } else {
        setSyncStatus('SYNCED');
        setSyncMessage('✓ Tersinkron');
      }
    },
    []
  );

  useEffect(() => {
    setStatusFromQueue(pendingWrites, isRevalidating);
  }, [pendingWrites, isRevalidating, setStatusFromQueue]);

  const mergePendingFinalEvaluations = useCallback(
    (
      serverEvaluations: FinalEvaluation[],
      queue: PendingAssessmentWrite[],
      eventId: string
    ): FinalEvaluation[] => {
      const merged = [...(serverEvaluations || [])];

      queue.forEach(item => {
        if (!isAnyFinalEvaluationWrite(item)) return;

        const payload = item.payload || {};
        const participantId =
          payload.participant_id ||
          payload.participantId ||
          item.participant_id ||
          '';
        const studentId =
          payload.student_id ||
          payload.studentId ||
          item.student_id ||
          '';

        if (isDeleteFinalEvaluationWrite(item)) {
          for (let index = merged.length - 1; index >= 0; index--) {
            const evaluation = merged[index];
            const sameParticipant =
              Boolean(participantId) &&
              evaluation.participant_id === participantId;
            const sameStudent =
              Boolean(studentId) &&
              evaluation.student_id === studentId;

            if (sameParticipant || sameStudent) {
              merged.splice(index, 1);
            }
          }
          return;
        }

        const timestamp = new Date(
          item.localTimestamp || Date.now()
        ).toISOString();

        const index = merged.findIndex(
          evaluation =>
            (participantId &&
              evaluation.participant_id === participantId) ||
            (studentId && evaluation.student_id === studentId)
        );

        const previous = index >= 0 ? merged[index] : undefined;

        const optimistic: FinalEvaluation = {
          final_evaluation_id:
            payload.final_evaluation_id ||
            previous?.final_evaluation_id ||
            `FE-LOCAL-${item.id}`,
          event_id: payload.event_id || item.event_id || eventId,
          participant_id: participantId,
          student_id: studentId,
          evaluation_surah_start:
            payload.evaluation_surah_start ??
            previous?.evaluation_surah_start,
          evaluation_ayah_start:
            payload.evaluation_ayah_start ??
            previous?.evaluation_ayah_start,
          evaluation_surah_end:
            payload.evaluation_surah_end ?? previous?.evaluation_surah_end,
          evaluation_ayah_end:
            payload.evaluation_ayah_end ?? previous?.evaluation_ayah_end,
          final_score: payload.final_score ?? previous?.final_score,
          completion_status:
            payload.completion_status ?? previous?.completion_status,
          skill_status_end:
            payload.skill_status_end ?? previous?.skill_status_end,
          affective_rating:
            payload.affective_rating ?? previous?.affective_rating,
          affective_note:
            payload.affective_note ?? previous?.affective_note ?? '',
          final_note:
            payload.evaluator_notes ??
            payload.final_note ??
            previous?.final_note ??
            '',
          evaluator_teacher_id:
            payload.evaluator_teacher_id ||
            previous?.evaluator_teacher_id ||
            '',
          created_at: previous?.created_at || timestamp,
          updated_at: timestamp
        };

        if (index >= 0) {
          merged[index] = { ...previous!, ...optimistic };
        } else {
          merged.push(optimistic);
        }
      });

      return merged;
    },
    []
  );

  const mergePendingAssessments = useCallback(
    (
      serverData: TeacherWorkspaceBootstrap,
      queue: PendingAssessmentWrite[],
      targetTeacherId: string
    ): SessionAssessment[] => {
      let merged = deduplicateAssessments([
        ...(serverData.assessments || [])
      ]);

      queue.forEach(item => {
        if (isAnyFinalEvaluationWrite(item)) return;

        const payload = item.payload || {};

        if (isBulkAttendanceWrite(item)) {
          const sessionConfigId =
            item.session_config_id || payload.sessionConfigId;
          const studentIds: string[] = payload.studentIds || [];
          const attendanceStatus = payload.attendanceStatus || 'PRESENT';
          const isPresent = attendanceStatus === 'PRESENT';
          const config = serverData.sessionConfigs?.find(
            sc => sc.session_config_id === sessionConfigId
          );

          studentIds.forEach(studentId => {
            const participant = serverData.students.find(
              student => student.student_id === studentId
            );

            const index = merged.findIndex(
              assessment =>
                !assessment.is_deleted &&
                assessment.student_id === studentId &&
                assessment.session_config_id === sessionConfigId
            );

            if (index >= 0) {
              const previous = merged[index];
              merged[index] = {
                ...previous,
                attendance_status: attendanceStatus,
                assessment_status: isPresent
                  ? hasAssessmentContent(previous)
                    ? 'COMPLETED'
                    : 'PENDING'
                  : 'COMPLETED',
                updated_at: new Date(item.localTimestamp).toISOString()
              };
            } else {
              merged.push({
                assessment_id: `ASM-LOCAL-BULK-${item.id}-${studentId.substring(0, 6)}`,
                event_id: serverData.event?.event_id || '',
                event_day_id: config?.event_day_id || '',
                session_config_id: sessionConfigId,
                participant_id: participant?.participant_id || '',
                student_id: studentId,
                halaqah_id: serverData.halaqah?.halaqah_id || '',
                session_no: config?.session_no || 1,
                attendance_status: attendanceStatus,
                assessment_status: isPresent ? 'PENDING' : 'COMPLETED',
                teacher_id: payload.teacherId || targetTeacherId || '',
                is_deleted: false,
                created_at: new Date(item.localTimestamp).toISOString(),
                updated_at: new Date(item.localTimestamp).toISOString()
              });
            }
          });

          return;
        }

        const index = merged.findIndex(
          assessment =>
            !assessment.is_deleted &&
            ((assessment.participant_id &&
              assessment.participant_id === item.participant_id) ||
              (assessment.student_id &&
                assessment.student_id === item.student_id)) &&
            (assessment.session_config_id === item.session_config_id ||
              assessment.session_no === payload.session_no)
        );

        const optimistic: SessionAssessment = {
          assessment_id:
            payload.assessment_id || `ASM-LOCAL-${item.id}`,
          event_id: serverData.event?.event_id || '',
          event_day_id: payload.event_day_id || '',
          session_config_id: item.session_config_id,
          participant_id: item.participant_id,
          student_id: item.student_id,
          halaqah_id: serverData.halaqah?.halaqah_id || '',
          session_no: payload.session_no || 1,
          attendance_status: payload.attendance || 'PRESENT',
          assessment_mode: payload.assessment_mode,
          surah_start: payload.start_surah,
          ayah_start: payload.start_ayah,
          surah_end: payload.end_surah,
          ayah_end: payload.end_ayah,
          lines_added:
            payload.lines_added !== undefined ? payload.lines_added : 0,
          nuroniyyah_dars: payload.nuroniyyah_dars,
          iqra_level: payload.iqra_level,
          iqra_page_start: payload.iqra_page_start,
          iqra_page_end: payload.iqra_page_end,
          iqra_pages_added: payload.iqra_pages_added,
          session_note: payload.notes || '',
          teacher_id: payload.teacher_id || targetTeacherId || '',
          is_deleted: false,
          created_at: new Date(item.localTimestamp).toISOString(),
          updated_at: new Date(item.localTimestamp).toISOString()
        };

        if (index >= 0) {
          merged[index] = optimistic;
        } else {
          merged.push(optimistic);
        }
      });

      return deduplicateAssessments(merged);
    },
    []
  );

  const preloadWorkspace = useCallback(
    async (
      forceRefresh = false,
      halaqahIdOverride?: string,
      teacherIdOverride?: string
    ) => {
      if (!currentUser || !isTeacherOrStaff) return;

      const targetTeacherId =
        teacherIdOverride !== undefined
          ? teacherIdOverride
          : isTeacher
            ? currentUser.teacher_id || ''
            : selectedTeacherId;

      if (isTeacher && !targetTeacherId) {
        setWorkspace(null);
        setIsLoading(false);
        setIsRevalidating(false);
        return;
      }

      const targetHalaqahId =
        halaqahIdOverride !== undefined
          ? halaqahIdOverride
          : activeHalaqahId;

      const cacheKey = isTeacher
        ? currentUser.teacher_id || ''
        : targetTeacherId || '__ADMIN_ALL__';

      const startedAt = performance.now();
      console.log('[PERF] WORKSPACE PRELOAD START');

      if (workspace && !forceRefresh) {
        setIsRevalidating(true);
      } else {
        setIsLoading(true);
      }

      try {
        const serverData = await ApiService.getTeacherWorkspaceBootstrap(
          undefined,
          targetHalaqahId || undefined,
          targetTeacherId?.trim() ? targetTeacherId.trim() : undefined
        );

        console.log(
          `[PERF] WORKSPACE PRELOAD COMPLETE: ${Math.round(
            performance.now() - startedAt
          )}ms`
        );

        const queue = loadPendingWrites(cacheKey);

        const mergedAssessments = mergePendingAssessments(
          serverData,
          queue,
          targetTeacherId
        );

        const mergedFinalEvaluations = mergePendingFinalEvaluations(
          serverData.finalEvaluations || [],
          queue,
          serverData.event?.event_id || ''
        );

        const updatedStudents = recomputeStudentProgress(
          serverData.students || [],
          mergedAssessments,
          mergedFinalEvaluations
        );

        const now = new Date();

        const mergedWorkspace: TeacherWorkspaceBootstrap = {
          ...serverData,
          assessments: mergedAssessments,
          finalEvaluations: mergedFinalEvaluations,
          students: updatedStudents,
          lastSyncedAt: now.toISOString()
        };

        setWorkspace(mergedWorkspace);
        setPendingWrites(queue);

        if (serverData.halaqah?.halaqah_id) {
          setActiveHalaqahIdState(serverData.halaqah.halaqah_id);
        }

        setLastSyncedAt(now);
        saveWorkspaceToCache(cacheKey, mergedWorkspace);
      } catch (error: any) {
        console.warn(
          'Teacher workspace revalidation failed (retaining cached data):',
          error?.message || error
        );

        // Never clear local workspace/cache here.
        const queue = loadPendingWrites(cacheKey);
        setPendingWrites(queue);
        setStatusFromQueue(queue, false);

        if (queue.length === 0) {
          const offline =
            ApiService.getCircuitBreakerState().isOffline ||
            (typeof navigator !== 'undefined' && !navigator.onLine);

          if (!offline) {
            setSyncStatus('ERROR');
            setSyncMessage('Koneksi terganggu (Data lokal aman)');
          }
        }
      } finally {
        setIsLoading(false);
        setIsRevalidating(false);
      }
    },
    [
      currentUser,
      isTeacherOrStaff,
      isTeacher,
      selectedTeacherId,
      activeHalaqahId,
      workspace,
      mergePendingAssessments,
      mergePendingFinalEvaluations,
      recomputeStudentProgress,
      setStatusFromQueue
    ]
  );

  useEffect(() => {
    if (!isTeacherOrStaff) return;

    if (isTeacher && !currentUser?.teacher_id) {
      setWorkspace(null);
      setIsLoading(false);
      return;
    }

    const cacheKey = isTeacher
      ? currentUser?.teacher_id || ''
      : selectedTeacherId || '__ADMIN_ALL__';

    const cached = loadCachedWorkspace(cacheKey);
    if (cached) {
      setWorkspace(cached);
      if (cached.halaqah?.halaqah_id) {
        setActiveHalaqahIdState(cached.halaqah.halaqah_id);
      }
      setIsLoading(false);
    }

    setPendingWrites(loadPendingWrites(cacheKey));

    void preloadWorkspace(false, undefined, effectiveTeacherId);
    // preloadWorkspace is intentionally omitted here to avoid a loop caused by
    // workspace changes recreating the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveTeacherId,
    isTeacherOrStaff,
    isTeacher,
    currentUser?.teacher_id
  ]);

  useEffect(() => {
    const queueKey = isTeacher
      ? currentUser?.teacher_id || ''
      : selectedTeacherId || '__ADMIN_ALL__';

    setPendingWrites(loadPendingWrites(queueKey));
  }, [selectedTeacherId, isTeacher, currentUser?.teacher_id]);

  const retryPendingWrites = useCallback(async () => {
    const cacheKey = isTeacher
      ? currentUser?.teacher_id || ''
      : selectedTeacherId || '__ADMIN_ALL__';

    if (!cacheKey || syncInProgressRef.current) return;

    const queue = loadPendingWrites(cacheKey);
    if (queue.length === 0) {
      setPendingWrites([]);
      setStatusFromQueue([], false);
      return;
    }

    const browserOffline =
      typeof navigator !== 'undefined' && !navigator.onLine;
    const circuitOffline = ApiService.getCircuitBreakerState().isOffline;

    if (browserOffline || circuitOffline) {
      setPendingWrites(queue);
      setSyncStatus('OFFLINE');
      setSyncMessage(
        `Mode Offline — ${queue.length} perubahan aman di perangkat`
      );
      return;
    }

    syncInProgressRef.current = true;
    setSyncStatus('SYNCING');
    setSyncMessage('Menyinkronkan perubahan...');

    const remaining: PendingAssessmentWrite[] = [];
    let stopForNetwork = false;

    try {
      for (const item of queue) {
        if (stopForNetwork) {
          remaining.push(item);
          continue;
        }

        try {
          if (isDeleteFinalEvaluationWrite(item)) {
            await ApiService.deleteFinalEvaluation(
              {
                finalEvaluationId:
                  item.payload.finalEvaluationId ||
                  item.payload.final_evaluation_id ||
                  '',
                participantId:
                  item.payload.participantId ||
                  item.payload.participant_id ||
                  item.participant_id ||
                  '',
                studentId:
                  item.payload.studentId ||
                  item.payload.student_id ||
                  item.student_id ||
                  '',
                eventId:
                  item.payload.eventId ||
                  item.payload.event_id ||
                  item.event_id ||
                  ''
              },
              currentUser?.user_id
            );
          } else if (isFinalEvaluationWrite(item)) {
            const {
              action: _action,
              final_evaluation_id: _localEvaluationId,
              ...finalPayload
            } = item.payload;

            await ApiService.submitFinalEvaluation(
              finalPayload,
              currentUser?.user_id
            );
          } else if (isBulkAttendanceWrite(item)) {
            const studentIds: string[] = item.payload.studentIds || [];
            if (studentIds.length === 0) continue;

            await ApiService.bulkSaveSessionAttendance(
              item.session_config_id || item.payload.sessionConfigId,
              studentIds,
              item.payload.attendanceStatus || 'PRESENT',
              currentUser?.user_id
            );
          } else {
            await ApiService.submitSessionAssessment(
              item.payload,
              currentUser?.user_id
            );
          }
        } catch (error: any) {
          if (
            error instanceof ApiService.NetworkError ||
            error?.isNetworkError
          ) {
            stopForNetwork = true;
          }

          remaining.push({
            ...item,
            status: 'FAILED',
            error: error?.message || 'Gagal tersinkron',
            retryCount: (item.retryCount || 0) + 1
          });
        }
      }
    } finally {
      syncInProgressRef.current = false;
    }

    setPendingWrites(remaining);
    savePendingWrites(cacheKey, remaining);
    setStatusFromQueue(remaining, false);

    if (remaining.length === 0) {
      setLastSyncedAt(new Date());
    }
  }, [
    isTeacher,
    currentUser,
    selectedTeacherId,
    setStatusFromQueue
  ]);

  useEffect(() => {
    const recover = () => {
      void retryPendingWrites();
      void preloadWorkspace(false);
    };

    const onBackendStatus = (event: any) => {
      if (event?.detail?.status === 'ONLINE') {
        void retryPendingWrites();
      } else if (event?.detail?.status === 'OFFLINE') {
        const cacheKey = isTeacher
          ? currentUser?.teacher_id || ''
          : selectedTeacherId || '__ADMIN_ALL__';

        const queue = loadPendingWrites(cacheKey);
        setPendingWrites(queue);
        setStatusFromQueue(queue, false);
      }
    };

    window.addEventListener('online', recover);
    window.addEventListener('rt_app_resumed', recover);
    window.addEventListener('rt_backend_status_change', onBackendStatus);

    return () => {
      window.removeEventListener('online', recover);
      window.removeEventListener('rt_app_resumed', recover);
      window.removeEventListener('rt_backend_status_change', onBackendStatus);
    };
  }, [
    retryPendingWrites,
    preloadWorkspace,
    isTeacher,
    currentUser?.teacher_id,
    selectedTeacherId,
    setStatusFromQueue
  ]);

  const saveAssessmentOptimistic = useCallback(
    async (payload: any): Promise<{ success: boolean; error?: string }> => {
      if (!currentUser || !workspace) {
        return { success: false, error: 'Sesi guru belum siap.' };
      }

      const currentTeacherId = isTeacher
        ? currentUser.teacher_id || ''
        : selectedTeacherId ||
          workspace.assignedTeachers?.[0]?.teacher_id ||
          '';

      const cacheKey = isTeacher
        ? currentUser.teacher_id || ''
        : selectedTeacherId || '__ADMIN_ALL__';

      const eventId = workspace.event?.event_id || '';
      const participantId = payload.participant_id;
      const sessionConfigId = payload.session_config_id;
      const studentId = payload.student_id;
      const nowIso = new Date().toISOString();

      const config = workspace.sessionConfigs.find(
        sc => sc.session_config_id === sessionConfigId
      );

      const existing = workspace.assessments.find(
        assessment =>
          !assessment.is_deleted &&
          assessment.participant_id === participantId &&
          assessment.session_config_id === sessionConfigId
      );

      const payloadWithTeacher = {
        ...payload,
        teacher_id: payload.teacher_id || currentTeacherId
      };

      const optimistic: SessionAssessment = {
        assessment_id: existing?.assessment_id || `ASM-LOCAL-${Date.now()}`,
        event_id: eventId,
        event_day_id: config?.event_day_id || '',
        session_config_id: sessionConfigId,
        participant_id: participantId,
        student_id: studentId,
        halaqah_id: workspace.halaqah?.halaqah_id || '',
        session_no: config?.session_no || payload.session_no || 1,
        attendance_status: payload.attendance,
        assessment_mode: payload.assessment_mode,
        surah_start: payload.start_surah,
        ayah_start: payload.start_ayah,
        surah_end: payload.end_surah,
        ayah_end: payload.end_ayah,
        lines_added:
          payload.lines_added !== undefined ? payload.lines_added : 0,
        nuroniyyah_dars: payload.nuroniyyah_dars,
        iqra_level: payload.iqra_level,
        iqra_page_start: payload.iqra_page_start,
        iqra_page_end: payload.iqra_page_end,
        iqra_pages_added: payload.iqra_pages_added,
        session_note: payload.notes || '',
        teacher_id: payloadWithTeacher.teacher_id,
        is_deleted: false,
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso
      };

      let assessments = [...workspace.assessments];

      const index = assessments.findIndex(
        assessment =>
          !assessment.is_deleted &&
          ((assessment.participant_id &&
            assessment.participant_id === participantId) ||
            (assessment.student_id && assessment.student_id === studentId)) &&
          (assessment.session_config_id === sessionConfigId ||
            assessment.session_no === payload.session_no)
      );

      if (index >= 0) assessments[index] = optimistic;
      else assessments.push(optimistic);

      assessments = deduplicateAssessments(assessments);

      const updatedWorkspace: TeacherWorkspaceBootstrap = {
        ...workspace,
        assessments,
        students: recomputeStudentProgress(
          workspace.students,
          assessments,
          workspace.finalEvaluations
        )
      };

      setWorkspace(updatedWorkspace);
      saveWorkspaceToCache(cacheKey, updatedWorkspace);

      const queueId = `queue-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      const item: PendingAssessmentWrite = {
        id: queueId,
        event_id: eventId,
        participant_id: participantId,
        session_config_id: sessionConfigId,
        student_id: studentId,
        payload: {
          ...payloadWithTeacher,
          assessment_id: optimistic.assessment_id
        },
        localTimestamp: Date.now(),
        status: 'SYNCING',
        retryCount: 0
      };

      const nextQueue: PendingAssessmentWrite[] = [];

      loadPendingWrites(cacheKey).forEach(old => {
        if (
          isBulkAttendanceWrite(old) &&
          old.session_config_id === sessionConfigId
        ) {
          const remainingStudents = (old.payload.studentIds || []).filter(
            (id: string) => id !== studentId && id !== participantId
          );

          if (remainingStudents.length > 0) {
            nextQueue.push({
              ...old,
              payload: { ...old.payload, studentIds: remainingStudents }
            });
          }
          return;
        }

        if (
          !isFinalEvaluationWrite(old) &&
          old.participant_id === participantId &&
          old.session_config_id === sessionConfigId
        ) {
          return;
        }

        nextQueue.push(old);
      });

      nextQueue.push(item);
      setPendingWrites(nextQueue);
      savePendingWrites(cacheKey, nextQueue);
      setStatusFromQueue(nextQueue, false);

      ApiService.submitSessionAssessment(
        payloadWithTeacher,
        currentUser.user_id
      )
        .then(serverAssessment => {
          const queue = loadPendingWrites(cacheKey).filter(
            pending => pending.id !== queueId
          );

          setPendingWrites(queue);
          savePendingWrites(cacheKey, queue);
          setStatusFromQueue(queue, false);

          if (
            serverAssessment?.assessment_id &&
            serverAssessment.assessment_id !== optimistic.assessment_id
          ) {
            setWorkspace(prev => {
              if (!prev) return prev;

              const patched = prev.assessments.map(assessment =>
                assessment.assessment_id === optimistic.assessment_id
                  ? {
                      ...assessment,
                      assessment_id: serverAssessment.assessment_id
                    }
                  : assessment
              );

              const next = { ...prev, assessments: patched };
              saveWorkspaceToCache(cacheKey, next);
              return next;
            });
          }

          if (queue.length === 0) setLastSyncedAt(new Date());
        })
        .catch(error => {
          const queue = loadPendingWrites(cacheKey).map(pending =>
            pending.id === queueId
              ? {
                  ...pending,
                  status: 'FAILED' as const,
                  error: error?.message || 'Gagal tersinkron'
                }
              : pending
          );

          setPendingWrites(queue);
          savePendingWrites(cacheKey, queue);
          setStatusFromQueue(queue, false);
        });

      return { success: true };
    },
    [
      currentUser,
      workspace,
      isTeacher,
      selectedTeacherId,
      recomputeStudentProgress,
      setStatusFromQueue
    ]
  );

  const deleteAssessmentOptimistic = useCallback(
    async (
      assessmentId: string,
      participantId?: string,
      sessionConfigId?: string,
      studentId?: string
    ): Promise<{ success: boolean; error?: string }> => {
      if (!currentUser || !workspace) {
        return { success: false, error: 'Sesi guru belum siap.' };
      }

      const currentTeacherId = isTeacher
        ? currentUser.teacher_id || ''
        : selectedTeacherId ||
          workspace.assignedTeachers?.[0]?.teacher_id ||
          '';

      const cacheKey = isTeacher
        ? currentUser.teacher_id || ''
        : selectedTeacherId || '__ADMIN_ALL__';

      const assessments = workspace.assessments.filter(
        assessment => assessment.assessment_id !== assessmentId
      );

      const updatedWorkspace: TeacherWorkspaceBootstrap = {
        ...workspace,
        assessments,
        students: recomputeStudentProgress(
          workspace.students,
          assessments,
          workspace.finalEvaluations
        )
      };

      setWorkspace(updatedWorkspace);
      saveWorkspaceToCache(cacheKey, updatedWorkspace);

      const nextQueue: PendingAssessmentWrite[] = [];

      loadPendingWrites(cacheKey).forEach(item => {
        if (
          isBulkAttendanceWrite(item) &&
          sessionConfigId &&
          item.session_config_id === sessionConfigId
        ) {
          const remainingStudents = (item.payload.studentIds || []).filter(
            (id: string) => id !== studentId && id !== participantId
          );

          if (remainingStudents.length > 0) {
            nextQueue.push({
              ...item,
              payload: { ...item.payload, studentIds: remainingStudents }
            });
          }
          return;
        }

        if (
          !isFinalEvaluationWrite(item) &&
          participantId &&
          sessionConfigId &&
          item.participant_id === participantId &&
          item.session_config_id === sessionConfigId
        ) {
          return;
        }

        nextQueue.push(item);
      });

      setPendingWrites(nextQueue);
      savePendingWrites(cacheKey, nextQueue);

      ApiService.deleteSessionAssessment(assessmentId, currentTeacherId)
        .then(() => {
          setStatusFromQueue(loadPendingWrites(cacheKey), false);
        })
        .catch(error => {
          console.warn('Failed to sync assessment deletion:', error);
        });

      return { success: true };
    },
    [
      currentUser,
      workspace,
      isTeacher,
      selectedTeacherId,
      recomputeStudentProgress,
      setStatusFromQueue
    ]
  );

  const applyBulkAttendanceOptimistic = useCallback(
    async (
      sessionConfigId: string,
      studentIds: string[],
      attendanceStatus: 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT'
    ): Promise<{ success: boolean; error?: string }> => {
      if (!currentUser || !workspace) {
        return { success: false, error: 'Sesi guru belum siap.' };
      }

      if (!sessionConfigId || studentIds.length === 0) {
        return {
          success: false,
          error: 'Pilih sesi dan minimal satu siswa.'
        };
      }

      const currentTeacherId = isTeacher
        ? currentUser.teacher_id || ''
        : selectedTeacherId ||
          workspace.assignedTeachers?.[0]?.teacher_id ||
          '';

      const cacheKey = isTeacher
        ? currentUser.teacher_id || ''
        : selectedTeacherId || '__ADMIN_ALL__';

      const eventId = workspace.event?.event_id || '';
      const nowIso = new Date().toISOString();
      const config = workspace.sessionConfigs.find(
        sc => sc.session_config_id === sessionConfigId
      );

      let assessments = [...workspace.assessments];

      studentIds.forEach(studentId => {
        const participant = workspace.students.find(
          student => student.student_id === studentId
        );

        const index = assessments.findIndex(
          assessment =>
            !assessment.is_deleted &&
            assessment.student_id === studentId &&
            assessment.session_config_id === sessionConfigId
        );

        const isPresent = attendanceStatus === 'PRESENT';

        if (index >= 0) {
          const previous = assessments[index];
          assessments[index] = {
            ...previous,
            attendance_status: attendanceStatus,
            assessment_status: isPresent
              ? hasAssessmentContent(previous)
                ? 'COMPLETED'
                : 'PENDING'
              : 'COMPLETED',
            updated_at: nowIso
          };
        } else {
          assessments.push({
            assessment_id: `ASM-LOCAL-BULK-${Date.now()}-${studentId.substring(
              0,
              6
            )}`,
            event_id: eventId,
            event_day_id: config?.event_day_id || '',
            session_config_id: sessionConfigId,
            participant_id: participant?.participant_id || '',
            student_id: studentId,
            halaqah_id: workspace.halaqah?.halaqah_id || '',
            session_no: config?.session_no || 1,
            attendance_status: attendanceStatus,
            assessment_status: isPresent ? 'PENDING' : 'COMPLETED',
            teacher_id: currentTeacherId,
            is_deleted: false,
            created_at: nowIso,
            updated_at: nowIso
          });
        }
      });

      assessments = deduplicateAssessments(assessments);

      const updatedWorkspace: TeacherWorkspaceBootstrap = {
        ...workspace,
        assessments,
        students: recomputeStudentProgress(
          workspace.students,
          assessments,
          workspace.finalEvaluations
        )
      };

      setWorkspace(updatedWorkspace);
      saveWorkspaceToCache(cacheKey, updatedWorkspace);

      const queueId = `bulk-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      const item: PendingAssessmentWrite = {
        id: queueId,
        event_id: eventId,
        participant_id: '__BULK__',
        session_config_id: sessionConfigId,
        student_id: '__BULK__',
        payload: {
          action: 'bulkSaveSessionAttendance',
          sessionConfigId,
          studentIds: [...studentIds],
          attendanceStatus,
          teacherId: currentTeacherId,
          actorUserId: currentUser.user_id
        },
        localTimestamp: Date.now(),
        status: 'SYNCING',
        retryCount: 0
      };

      const nextQueue: PendingAssessmentWrite[] = [];

      loadPendingWrites(cacheKey).forEach(old => {
        if (
          isBulkAttendanceWrite(old) &&
          old.session_config_id === sessionConfigId
        ) {
          const remainingStudents = (old.payload.studentIds || []).filter(
            (id: string) => !studentIds.includes(id)
          );

          if (remainingStudents.length > 0) {
            nextQueue.push({
              ...old,
              payload: { ...old.payload, studentIds: remainingStudents }
            });
          }
          return;
        }

        nextQueue.push(old);
      });

      nextQueue.push(item);
      setPendingWrites(nextQueue);
      savePendingWrites(cacheKey, nextQueue);
      setStatusFromQueue(nextQueue, false);

      ApiService.bulkSaveSessionAttendance(
        sessionConfigId,
        studentIds,
        attendanceStatus,
        currentUser.user_id
      )
        .then(() => {
          const queue = loadPendingWrites(cacheKey).filter(
            pending => pending.id !== queueId
          );

          setPendingWrites(queue);
          savePendingWrites(cacheKey, queue);
          setStatusFromQueue(queue, false);

          if (queue.length === 0) setLastSyncedAt(new Date());
        })
        .catch(error => {
          const queue = loadPendingWrites(cacheKey).map(pending =>
            pending.id === queueId
              ? {
                  ...pending,
                  status: 'FAILED' as const,
                  error: error?.message || 'Gagal tersinkron'
                }
              : pending
          );

          setPendingWrites(queue);
          savePendingWrites(cacheKey, queue);
          setStatusFromQueue(queue, false);
        });

      return { success: true };
    },
    [
      currentUser,
      workspace,
      isTeacher,
      selectedTeacherId,
      recomputeStudentProgress,
      setStatusFromQueue
    ]
  );

  const saveFinalEvaluationOptimistic = useCallback(
    async (payload: any): Promise<{ success: boolean; error?: string }> => {
      if (!currentUser || !workspace) {
        return { success: false, error: 'Sesi guru belum siap.' };
      }

      const currentTeacherId = isTeacher
        ? currentUser.teacher_id || ''
        : selectedTeacherId ||
          workspace.assignedTeachers?.[0]?.teacher_id ||
          '';

      const cacheKey = isTeacher
        ? currentUser.teacher_id || ''
        : selectedTeacherId || '__ADMIN_ALL__';

      const eventId = workspace.event?.event_id || '';
      const participantId = payload.participant_id || '';
      const studentId = payload.student_id || '';
      const nowIso = new Date().toISOString();

      const existing = workspace.finalEvaluations.find(
        evaluation =>
          (participantId && evaluation.participant_id === participantId) ||
          (studentId && evaluation.student_id === studentId)
      );

      const payloadWithTeacher = {
        ...payload,
        evaluator_teacher_id:
          payload.evaluator_teacher_id || currentTeacherId
      };

      const localId =
        existing?.final_evaluation_id || `FE-LOCAL-${Date.now()}`;

      const optimistic: FinalEvaluation = {
        final_evaluation_id: localId,
        event_id: eventId,
        participant_id: participantId,
        student_id: studentId,

        // Do not invent Surah 1 / Ayat 1 for empty fields.
        evaluation_surah_start:
          payload.evaluation_surah_start ?? existing?.evaluation_surah_start,
        evaluation_ayah_start:
          payload.evaluation_ayah_start ?? existing?.evaluation_ayah_start,
        evaluation_surah_end:
          payload.evaluation_surah_end ?? existing?.evaluation_surah_end,
        evaluation_ayah_end:
          payload.evaluation_ayah_end ?? existing?.evaluation_ayah_end,

        final_score: payload.final_score,
        completion_status: payload.completion_status,
        skill_status_end: payload.skill_status_end,
        affective_rating: payload.affective_rating,
        affective_note: payload.affective_note || '',
        final_note: payload.evaluator_notes || payload.final_note || '',
        evaluator_teacher_id: payloadWithTeacher.evaluator_teacher_id,
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso
      };

      const evaluations = [...workspace.finalEvaluations];
      const index = evaluations.findIndex(
        evaluation =>
          (participantId && evaluation.participant_id === participantId) ||
          (studentId && evaluation.student_id === studentId)
      );

      if (index >= 0) evaluations[index] = optimistic;
      else evaluations.push(optimistic);

      const updatedWorkspace: TeacherWorkspaceBootstrap = {
        ...workspace,
        finalEvaluations: evaluations,
        students: recomputeStudentProgress(
          workspace.students,
          workspace.assessments,
          evaluations
        )
      };

      // 1) Durable local save first.
      setWorkspace(updatedWorkspace);
      saveWorkspaceToCache(cacheKey, updatedWorkspace);

      // 2) Put Final Evaluation in the persistent queue.
      const queueId = `final-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      const item: PendingAssessmentWrite = {
        id: queueId,
        event_id: eventId,
        participant_id: participantId,
        session_config_id: FINAL_EVAL_SENTINEL,
        student_id: studentId,
        payload: {
          ...payloadWithTeacher,
          action: 'saveFinalEvaluation',
          final_evaluation_id: localId,
          event_id: eventId
        },
        localTimestamp: Date.now(),
        status: 'SYNCING',
        retryCount: 0
      };

      const nextQueue = loadPendingWrites(cacheKey).filter(old => {
        if (!isAnyFinalEvaluationWrite(old)) return true;

        const sameParticipant =
          Boolean(participantId) && old.participant_id === participantId;
        const sameStudent =
          Boolean(studentId) && old.student_id === studentId;

        // Keep only the newest pending Final Evaluation for this student.
        return !(sameParticipant || sameStudent);
      });

      nextQueue.push(item);
      setPendingWrites(nextQueue);
      savePendingWrites(cacheKey, nextQueue);
      setStatusFromQueue(nextQueue, false);

      // 3) Silent background sync.
      ApiService.submitFinalEvaluation(
        payloadWithTeacher,
        currentUser.user_id
      )
        .then(serverEvaluation => {
          const queue = loadPendingWrites(cacheKey).filter(
            pending => pending.id !== queueId
          );

          setPendingWrites(queue);
          savePendingWrites(cacheKey, queue);
          setStatusFromQueue(queue, false);

          if (serverEvaluation?.final_evaluation_id) {
            setWorkspace(prev => {
              if (!prev) return prev;

              const patchedEvaluations = prev.finalEvaluations.map(
                evaluation => {
                  const same =
                    (participantId &&
                      evaluation.participant_id === participantId) ||
                    (studentId && evaluation.student_id === studentId);

                  return same
                    ? {
                        ...evaluation,
                        final_evaluation_id:
                          serverEvaluation.final_evaluation_id
                      }
                    : evaluation;
                }
              );

              const next = {
                ...prev,
                finalEvaluations: patchedEvaluations
              };

              saveWorkspaceToCache(cacheKey, next);
              return next;
            });
          }

          if (queue.length === 0) setLastSyncedAt(new Date());
        })
        .catch(error => {
          console.warn(
            'Optimistic Final Evaluation failed to sync:',
            error?.message || error
          );

          // CRITICAL: local evaluation remains in workspace/cache.
          const queue = loadPendingWrites(cacheKey).map(pending =>
            pending.id === queueId
              ? {
                  ...pending,
                  status: 'FAILED' as const,
                  error:
                    error?.message || 'Gagal menyinkronkan evaluasi'
                }
              : pending
          );

          setPendingWrites(queue);
          savePendingWrites(cacheKey, queue);
          setStatusFromQueue(queue, false);
        });

      // Successful teacher action = safely stored locally.
      return { success: true };
    },
    [
      currentUser,
      workspace,
      isTeacher,
      selectedTeacherId,
      recomputeStudentProgress,
      setStatusFromQueue
    ]
  );


  const deleteFinalEvaluationOptimistic = useCallback(
    async (params: {
      finalEvaluationId?: string;
      participantId?: string;
      studentId?: string;
    }): Promise<{ success: boolean; error?: string }> => {
      if (!currentUser || !workspace) {
        return { success: false, error: 'Sesi guru belum siap.' };
      }

      const participantId = params.participantId || '';
      const studentId = params.studentId || '';

      const existing = workspace.finalEvaluations.find(
        evaluation =>
          (params.finalEvaluationId &&
            evaluation.final_evaluation_id === params.finalEvaluationId) ||
          (participantId && evaluation.participant_id === participantId) ||
          (studentId && evaluation.student_id === studentId)
      );

      if (!existing) {
        return {
          success: false,
          error: 'Evaluasi akhir aktif siswa tidak ditemukan.'
        };
      }

      const resolvedParticipantId =
        participantId || existing.participant_id || '';
      const resolvedStudentId = studentId || existing.student_id || '';
      const eventId = workspace.event?.event_id || existing.event_id || '';

      const cacheKey = isTeacher
        ? currentUser.teacher_id || ''
        : selectedTeacherId || '__ADMIN_ALL__';

      const remainingEvaluations = workspace.finalEvaluations.filter(
        evaluation => {
          const sameParticipant =
            Boolean(resolvedParticipantId) &&
            evaluation.participant_id === resolvedParticipantId;
          const sameStudent =
            Boolean(resolvedStudentId) &&
            evaluation.student_id === resolvedStudentId;

          return !(sameParticipant || sameStudent);
        }
      );

      const updatedWorkspace: TeacherWorkspaceBootstrap = {
        ...workspace,
        finalEvaluations: remainingEvaluations,
        students: recomputeStudentProgress(
          workspace.students,
          workspace.assessments,
          remainingEvaluations
        )
      };

      setWorkspace(updatedWorkspace);
      saveWorkspaceToCache(cacheKey, updatedWorkspace);

      const queueId = `final-delete-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      const deleteItem: PendingAssessmentWrite = {
        id: queueId,
        event_id: eventId,
        participant_id: resolvedParticipantId,
        session_config_id: FINAL_EVAL_SENTINEL,
        student_id: resolvedStudentId,
        payload: {
          action: 'deleteFinalEvaluation',
          finalEvaluationId: existing.final_evaluation_id || '',
          participantId: resolvedParticipantId,
          studentId: resolvedStudentId,
          eventId
        },
        localTimestamp: Date.now(),
        status: 'SYNCING',
        retryCount: 0
      };

      const nextQueue = loadPendingWrites(cacheKey).filter(old => {
        if (!isAnyFinalEvaluationWrite(old)) return true;

        const oldParticipantId =
          old.payload?.participantId ||
          old.payload?.participant_id ||
          old.participant_id ||
          '';
        const oldStudentId =
          old.payload?.studentId ||
          old.payload?.student_id ||
          old.student_id ||
          '';

        const sameParticipant =
          Boolean(resolvedParticipantId) &&
          oldParticipantId === resolvedParticipantId;
        const sameStudent =
          Boolean(resolvedStudentId) &&
          oldStudentId === resolvedStudentId;

        return !(sameParticipant || sameStudent);
      });

      nextQueue.push(deleteItem);
      setPendingWrites(nextQueue);
      savePendingWrites(cacheKey, nextQueue);
      setStatusFromQueue(nextQueue, false);

      ApiService.deleteFinalEvaluation(
        {
          finalEvaluationId: existing.final_evaluation_id || '',
          participantId: resolvedParticipantId,
          studentId: resolvedStudentId,
          eventId
        },
        currentUser.user_id
      )
        .then(() => {
          const queue = loadPendingWrites(cacheKey).filter(
            pending => pending.id !== queueId
          );

          setPendingWrites(queue);
          savePendingWrites(cacheKey, queue);
          setStatusFromQueue(queue, false);

          if (queue.length === 0) {
            setLastSyncedAt(new Date());
          }
        })
        .catch(error => {
          console.warn(
            'Optimistic Final Evaluation delete failed to sync:',
            error?.message || error
          );

          const queue = loadPendingWrites(cacheKey).map(pending =>
            pending.id === queueId
              ? {
                  ...pending,
                  status: 'FAILED' as const,
                  error:
                    error?.message ||
                    'Gagal menyinkronkan penghapusan evaluasi akhir',
                  retryCount: (pending.retryCount || 0) + 1
                }
              : pending
          );

          setPendingWrites(queue);
          savePendingWrites(cacheKey, queue);
          setStatusFromQueue(queue, false);
        });

      return { success: true };
    },
    [
      currentUser,
      workspace,
      isTeacher,
      selectedTeacherId,
      recomputeStudentProgress,
      setStatusFromQueue
    ]
  );

  const refreshWorkspace = useCallback(async () => {
    // Never clear cache before pending writes have had a chance to sync.
    await retryPendingWrites();
    await preloadWorkspace(
      true,
      activeHalaqahId || undefined,
      effectiveTeacherId
    );
  }, [
    retryPendingWrites,
    preloadWorkspace,
    activeHalaqahId,
    effectiveTeacherId
  ]);

  const setSelectedTeacherId = useCallback(
    (teacherId: string) => {
      if (isTeacher) return;

      setSelectedTeacherIdState(teacherId);
      setActiveHalaqahIdState('');

      const cacheKey = teacherId || '__ADMIN_ALL__';
      const cached = loadCachedWorkspace(cacheKey);

      setPendingWrites(loadPendingWrites(cacheKey));

      if (cached) {
        setWorkspace(cached);
        setActiveHalaqahIdState(cached.halaqah?.halaqah_id || '');
        setIsLoading(false);
      } else {
        setWorkspace(null);
        setIsLoading(true);
      }

      void preloadWorkspace(true, undefined, teacherId);
    },
    [isTeacher, preloadWorkspace]
  );

  const setActiveHalaqahId = useCallback(
    (halaqahId: string) => {
      setActiveHalaqahIdState(halaqahId);

      const cacheKey = isTeacher
        ? currentUser?.teacher_id || ''
        : selectedTeacherId || '__ADMIN_ALL__';

      if (cacheKey) {
        const cached = loadCachedWorkspace(
          cacheKey,
          workspace?.event?.event_id,
          halaqahId
        );

        if (cached) setWorkspace(cached);
      }

      void preloadWorkspace(false, halaqahId);
    },
    [
      isTeacher,
      currentUser?.teacher_id,
      selectedTeacherId,
      workspace?.event?.event_id,
      preloadWorkspace
    ]
  );

  return (
    <TeacherWorkspaceContext.Provider
      value={{
        workspace,
        isLoading,
        isRevalidating,
        syncStatus,
        syncMessage,
        lastSyncedAt,
        pendingWrites,
        activeHalaqahId,
        setActiveHalaqahId,
        selectedTeacherId,
        setSelectedTeacherId,
        availableTeachers,
        preloadWorkspace,
        refreshWorkspace,
        saveAssessmentOptimistic,
        deleteAssessmentOptimistic,
        saveFinalEvaluationOptimistic,
        deleteFinalEvaluationOptimistic,
        applyBulkAttendanceOptimistic,
        retryPendingWrites
      }}
    >
      {children}
    </TeacherWorkspaceContext.Provider>
  );
};

export const useTeacherWorkspace = (): TeacherWorkspaceContextType => {
  const context = useContext(TeacherWorkspaceContext);

  if (!context) {
    throw new Error(
      'useTeacherWorkspace must be used within a TeacherWorkspaceProvider'
    );
  }

  return context;
};