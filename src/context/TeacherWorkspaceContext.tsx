import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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

interface TeacherWorkspaceContextType {
  workspace: TeacherWorkspaceBootstrap | null;
  isLoading: boolean;
  isRevalidating: boolean;
  syncStatus: 'SYNCED' | 'SYNCING' | 'PENDING' | 'ERROR';
  syncMessage: string;
  lastSyncedAt: Date | null;
  pendingWrites: PendingAssessmentWrite[];
  activeHalaqahId: string;
  setActiveHalaqahId: (halaqahId: string) => void;
  selectedTeacherId: string;
  setSelectedTeacherId: (teacherId: string) => void;
  availableTeachers: Teacher[];
  preloadWorkspace: (forceRefresh?: boolean, halaqahIdOverride?: string, teacherIdOverride?: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  saveAssessmentOptimistic: (payload: any) => Promise<{ success: boolean; error?: string }>;
  deleteAssessmentOptimistic: (assessmentId: string, participantId?: string, sessionConfigId?: string, studentId?: string) => Promise<{ success: boolean; error?: string }>;
  saveFinalEvaluationOptimistic: (payload: any) => Promise<{ success: boolean; error?: string }>;
  retryPendingWrites: () => Promise<void>;
}

const TeacherWorkspaceContext = createContext<TeacherWorkspaceContextType | null>(null);

const STORAGE_PREFIX = 'rt_teacher_ws_';
const PENDING_PREFIX = 'rt_teacher_pending_';

function getWorkspaceCacheKey(teacherId: string, eventId: string = 'curr', halaqahId: string = 'def'): string {
  return `${STORAGE_PREFIX}${teacherId}_${eventId}_${halaqahId}`;
}

function getPendingCacheKey(teacherId: string): string {
  return `${PENDING_PREFIX}${teacherId}`;
}

export function clearTeacherWorkspaceCache(teacherId?: string, eventId?: string): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        if (teacherId && eventId) {
          if (k.startsWith(`${STORAGE_PREFIX}${teacherId}_${eventId}`)) {
            keysToRemove.push(k);
          }
        } else if (teacherId) {
          if (k.startsWith(`${STORAGE_PREFIX}${teacherId}_`)) {
            keysToRemove.push(k);
          }
        } else {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.error('Error clearing teacher workspace cache:', e);
  }
}

function loadCachedWorkspace(teacherId: string, eventId?: string, halaqahId?: string): TeacherWorkspaceBootstrap | null {
  if (!teacherId) return null;
  try {
    const key = getWorkspaceCacheKey(teacherId, eventId || 'curr', halaqahId || 'def');
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.halaqah && parsed.availableHalaqahs && parsed.availableHalaqahs.length > 0) {
        return parsed;
      }
    }
    // Fallback: check any key matching this teacher
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${STORAGE_PREFIX}${teacherId}_`)) {
        const item = localStorage.getItem(k);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed && parsed.halaqah && parsed.availableHalaqahs && parsed.availableHalaqahs.length > 0) {
            return parsed;
          }
        }
      }
    }
    return null;
  } catch (e) {
    console.error('Error loading cached teacher workspace:', e);
    return null;
  }
}

function saveWorkspaceToCache(teacherId: string, workspace: TeacherWorkspaceBootstrap): void {
  if (!teacherId) return;
  // If teacher has no assigned halaqahs, do NOT persist a stale null cache
  if (!workspace || !workspace.halaqah || !workspace.availableHalaqahs || workspace.availableHalaqahs.length === 0) {
    clearTeacherWorkspaceCache(teacherId);
    return;
  }
  try {
    const eventId = workspace.event?.event_id || 'curr';
    const halaqahId = workspace.halaqah?.halaqah_id || 'def';
    const key = getWorkspaceCacheKey(teacherId, eventId, halaqahId);
    localStorage.setItem(key, JSON.stringify(workspace));
  } catch (e) {
    console.error('Error saving teacher workspace to cache:', e);
  }
}

function loadPendingWrites(teacherId: string): PendingAssessmentWrite[] {
  if (!teacherId) return [];
  try {
    const key = getPendingCacheKey(teacherId);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingWrites(teacherId: string, list: PendingAssessmentWrite[]): void {
  if (!teacherId) return;
  try {
    const key = getPendingCacheKey(teacherId);
    if (list.length > 0) {
      localStorage.setItem(key, JSON.stringify(list));
    } else {
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.error('Error saving pending writes:', e);
  }
}

export const TeacherWorkspaceProvider: React.FC<{
  currentUser: User | null;
  children: React.ReactNode;
}> = ({ currentUser, children }) => {
  const isTeacher = currentUser?.role === 'TEACHER';
  const isTeacherOrStaff = currentUser?.role === 'TEACHER' || currentUser?.role === 'ADMIN' || currentUser?.role === 'COORDINATOR';

  // Initial teacher resolution
  const [selectedTeacherId, setSelectedTeacherIdState] = useState<string>(() => {
    if (currentUser?.teacher_id && currentUser.teacher_id.trim() !== '') {
      return currentUser.teacher_id.trim();
    }
    return '';
  });

  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);

  // Load teachers for ADMIN / COORDINATOR
  useEffect(() => {
    if (currentUser?.role === 'ADMIN' || currentUser?.role === 'COORDINATOR') {
      ApiService.getTeachers().then(teachers => {
        const active = teachers.filter(t => t.active !== false && String(t.active) !== 'false');
        setAvailableTeachers(active);
      }).catch(err => {
        console.warn('Failed to load teachers list:', err);
      });
    }
  }, [currentUser?.role]);

  // If currentUser prop updates and has linked teacher_id, sync selectedTeacherId
  useEffect(() => {
    if (currentUser?.teacher_id && currentUser.teacher_id.trim() !== '') {
      setSelectedTeacherIdState(currentUser.teacher_id.trim());
    } else if (currentUser?.role === 'TEACHER') {
      setSelectedTeacherIdState('');
    }
  }, [currentUser?.teacher_id, currentUser?.role]);

  const effectiveTeacherId = isTeacher ? (currentUser?.teacher_id || '') : selectedTeacherId;

  const [workspace, setWorkspace] = useState<TeacherWorkspaceBootstrap | null>(() => {
    const initialTeacherId = currentUser?.teacher_id || '';
    if (initialTeacherId) {
      const cached = loadCachedWorkspace(initialTeacherId);
      if (cached) {
        console.log('[PERF] ASSESSMENT FORM RENDER: Initialized immediately from local cache');
        return cached;
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(!workspace && Boolean(effectiveTeacherId));
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false);
  const [activeHalaqahId, setActiveHalaqahId] = useState<string>(() => workspace?.halaqah?.halaqah_id || '');
  const [pendingWrites, setPendingWrites] = useState<PendingAssessmentWrite[]>(() => {
    return effectiveTeacherId ? loadPendingWrites(effectiveTeacherId) : [];
  });
  const [syncStatus, setSyncStatus] = useState<'SYNCED' | 'SYNCING' | 'PENDING' | 'ERROR'>('SYNCED');
  const [syncMessage, setSyncMessage] = useState<string>('Tersinkron');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(() => {
    return workspace?.lastSyncedAt ? new Date(workspace.lastSyncedAt) : null;
  });

  const syncInProgressRef = useRef(false);

  // Helper to recompute students with assessments
  const recomputeStudentProgress = useCallback((
    students: TeacherStudentSummary[],
    assessments: SessionAssessment[],
    evaluations: FinalEvaluation[]
  ): TeacherStudentSummary[] => {
    const studentAsmsMap = new Map<string, SessionAssessment[]>();
    assessments.forEach(a => {
      if (!a.is_deleted && a.attendance_status === 'PRESENT') {
        const list = studentAsmsMap.get(a.student_id) || [];
        list.push(a);
        studentAsmsMap.set(a.student_id, list);
      }
    });

    const evalMap = new Map<string, FinalEvaluation>();
    evaluations.forEach(e => {
      if (e.participant_id) evalMap.set(e.participant_id, e);
      if (e.student_id) evalMap.set(e.student_id, e);
    });

    return students.map(s => {
      const asms = studentAsmsMap.get(s.student_id) || [];
      const totalLines = asms.reduce((sum, a) => sum + (Number(a.lines_added) || 0), 0);
      const studentEval = evalMap.get(s.participant_id) || evalMap.get(s.student_id);
      return {
        ...s,
        totalLinesAdded: totalLines,
        completionStatus: studentEval ? studentEval.completion_status : (s.completionStatus || 'NOT_EVALUATED')
      };
    });
  }, []);

  // Update sync status text based on pending writes
  useEffect(() => {
    if (pendingWrites.length > 0) {
      const failed = pendingWrites.filter(p => p.status === 'FAILED').length;
      if (failed > 0) {
        setSyncStatus('PENDING');
        setSyncMessage(`⚠ ${failed} perubahan belum tersinkron`);
      } else {
        setSyncStatus('SYNCING');
        setSyncMessage('Menyinkronkan data...');
      }
    } else if (isRevalidating) {
      setSyncStatus('SYNCING');
      setSyncMessage('Memuat pembaruan...');
    } else {
      setSyncStatus('SYNCED');
      setSyncMessage('✓ Tersinkron');
    }
  }, [pendingWrites, isRevalidating]);

  // Preload / fetch workspace with Stale-While-Revalidate
  const preloadWorkspace = useCallback(async (
    forceRefresh = false,
    halaqahIdOverride?: string,
    teacherIdOverride?: string
  ) => {
    if (!currentUser || !isTeacherOrStaff) return;
    const targetTeacherId = teacherIdOverride !== undefined
      ? teacherIdOverride
      : (isTeacher ? (currentUser.teacher_id || '') : selectedTeacherId);

    if (!targetTeacherId) {
      setWorkspace(null);
      setIsLoading(false);
      setIsRevalidating(false);
      return;
    }

    const targetHalaqah = halaqahIdOverride !== undefined ? halaqahIdOverride : activeHalaqahId;

    const tStart = performance.now();
    console.log('[PERF] WORKSPACE PRELOAD START');

    // If we have cached data and it's not force refresh, mark revalidating but do not block UI
    if (workspace && !forceRefresh) {
      setIsRevalidating(true);
    } else if (!workspace || forceRefresh) {
      setIsLoading(true);
    }

    try {
      const serverData = await ApiService.getTeacherWorkspaceBootstrap(undefined, targetHalaqah, targetTeacherId);
      const tEnd = performance.now();
      console.log(`[PERF] WORKSPACE PRELOAD COMPLETE: ${Math.round(tEnd - tStart)}ms`);

      if (forceRefresh) {
        console.log(`[PERF] BACKGROUND REFRESH COMPLETE: ${Math.round(tEnd - tStart)}ms`);
      }

      // Merge server data with pending writes to protect optimistic changes
      const currentPending = loadPendingWrites(targetTeacherId);
      let mergedAssessments = [...serverData.assessments];

      currentPending.forEach(pending => {
        const pPayload = pending.payload;
        const existingIdx = mergedAssessments.findIndex(a =>
          a.participant_id === pending.participant_id &&
          a.session_config_id === pending.session_config_id
        );

        const optimisticAsm: SessionAssessment = {
          assessment_id: pPayload.assessment_id || `ASM-LOCAL-${pending.id}`,
          event_id: serverData.event?.event_id || '',
          event_day_id: pPayload.event_day_id || '',
          session_config_id: pending.session_config_id,
          participant_id: pending.participant_id,
          student_id: pending.student_id,
          halaqah_id: serverData.halaqah?.halaqah_id || '',
          session_no: pPayload.session_no || 1,
          attendance_status: pPayload.attendance || 'PRESENT',
          surah_start: pPayload.start_surah,
          ayah_start: pPayload.start_ayah,
          surah_end: pPayload.end_surah,
          ayah_end: pPayload.end_ayah,
          lines_added: pPayload.lines_added || 0,
          session_note: pPayload.notes,
          teacher_id: pPayload.teacher_id || targetTeacherId,
          is_deleted: false,
          created_at: new Date(pending.localTimestamp).toISOString(),
          updated_at: new Date(pending.localTimestamp).toISOString()
        };

        if (existingIdx >= 0) {
          mergedAssessments[existingIdx] = optimisticAsm;
        } else {
          mergedAssessments.push(optimisticAsm);
        }
      });

      const updatedStudents = recomputeStudentProgress(
        serverData.students,
        mergedAssessments,
        serverData.finalEvaluations
      );

      const now = new Date();
      const updatedWorkspace: TeacherWorkspaceBootstrap = {
        ...serverData,
        students: updatedStudents,
        assessments: mergedAssessments,
        lastSyncedAt: now.toISOString()
      };

      setWorkspace(updatedWorkspace);
      if (serverData.halaqah?.halaqah_id) {
        setActiveHalaqahId(serverData.halaqah.halaqah_id);
      } else {
        setActiveHalaqahId('');
      }
      setLastSyncedAt(now);
      saveWorkspaceToCache(targetTeacherId, updatedWorkspace);
    } catch (err: any) {
      console.warn('Teacher workspace revalidation failed:', err.message);
      setSyncStatus(pendingWrites.length > 0 ? 'PENDING' : 'ERROR');
      setSyncMessage(pendingWrites.length > 0 ? `⚠ ${pendingWrites.length} belum tersinkron` : 'Mode Offline / Cache');
    } finally {
      setIsLoading(false);
      setIsRevalidating(false);
    }
  }, [currentUser, isTeacherOrStaff, isTeacher, selectedTeacherId, activeHalaqahId, workspace, pendingWrites.length, recomputeStudentProgress]);

  // Initial preload on mount or when teacher identity becomes available
  useEffect(() => {
    if (isTeacherOrStaff && effectiveTeacherId) {
      // 1. Try to load cached data immediately
      const cached = loadCachedWorkspace(effectiveTeacherId);
      if (cached) {
        setWorkspace(cached);
        if (cached.halaqah?.halaqah_id) {
          setActiveHalaqahId(cached.halaqah.halaqah_id);
        }
        setIsLoading(false);
      }
      // 2. Run stale-while-revalidate in background
      preloadWorkspace(false, undefined, effectiveTeacherId);
    } else if (isTeacherOrStaff && !effectiveTeacherId) {
      setWorkspace(null);
      setIsLoading(false);
    }
  }, [effectiveTeacherId, isTeacherOrStaff]);

  // Change teacher explicitly (ADMIN/COORDINATOR)
  const setSelectedTeacherId = useCallback((newTeacherId: string) => {
    if (isTeacher) return; // Strict TEACHER role rule: never change identity

    const oldTeacherId = selectedTeacherId;
    if (oldTeacherId && oldTeacherId !== newTeacherId) {
      clearTeacherWorkspaceCache(oldTeacherId);
    }

    setSelectedTeacherIdState(newTeacherId);
    setActiveHalaqahId('');

    if (!newTeacherId) {
      setWorkspace(null);
      setIsLoading(false);
      return;
    }

    // Check if new teacher has cached data
    const cached = loadCachedWorkspace(newTeacherId);
    if (cached) {
      setWorkspace(cached);
      if (cached.halaqah?.halaqah_id) {
        setActiveHalaqahId(cached.halaqah.halaqah_id);
      }
      setIsLoading(false);
    } else {
      setWorkspace(null);
      setIsLoading(true);
    }

    // Preload fresh workspace for selected teacher
    preloadWorkspace(true, undefined, newTeacherId);
  }, [isTeacher, selectedTeacherId, preloadWorkspace]);

  // Retry pending write queue
  const retryPendingWrites = useCallback(async () => {
    if (!effectiveTeacherId || syncInProgressRef.current) return;
    const currentQueue = loadPendingWrites(effectiveTeacherId);
    if (currentQueue.length === 0) return;

    syncInProgressRef.current = true;
    setSyncStatus('SYNCING');
    setSyncMessage('Menyinkronkan perubahan...');

    const remainingQueue: PendingAssessmentWrite[] = [];

    for (const item of currentQueue) {
      try {
        await ApiService.submitSessionAssessment(item.payload, currentUser?.user_id);
      } catch (err: any) {
        remainingQueue.push({
          ...item,
          status: 'FAILED',
          error: err.message || 'Gagal tersinkron',
          retryCount: item.retryCount + 1
        });
      }
    }

    setPendingWrites(remainingQueue);
    savePendingWrites(effectiveTeacherId, remainingQueue);
    syncInProgressRef.current = false;

    if (remainingQueue.length === 0) {
      setSyncStatus('SYNCED');
      setSyncMessage('✓ Tersinkron');
      setLastSyncedAt(new Date());
    } else {
      setSyncStatus('PENDING');
      setSyncMessage(`⚠ ${remainingQueue.length} perubahan belum tersinkron`);
    }
  }, [effectiveTeacherId, currentUser?.user_id]);

  // Optimistic Save Assessment
  const saveAssessmentOptimistic = useCallback(async (payload: any): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser || !workspace) {
      return { success: false, error: 'Sesi guru belum siap.' };
    }
    const currentTeacherId = effectiveTeacherId || currentUser.teacher_id || currentUser.user_id;
    const eventId = workspace.event?.event_id || '';
    const participantId = payload.participant_id;
    const sessionConfigId = payload.session_config_id;
    const studentId = payload.student_id;
    const nowIso = new Date().toISOString();

    const matchingConfig = workspace.sessionConfigs.find(sc => sc.session_config_id === sessionConfigId);
    const existingAsm = workspace.assessments.find(a =>
      !a.is_deleted &&
      a.participant_id === participantId &&
      a.session_config_id === sessionConfigId
    );

    const payloadWithTeacher = {
      ...payload,
      teacher_id: payload.teacher_id || currentTeacherId
    };

    const optimisticAsm: SessionAssessment = {
      assessment_id: existingAsm?.assessment_id || `ASM-LOCAL-${Date.now()}`,
      event_id: eventId,
      event_day_id: matchingConfig?.event_day_id || '',
      session_config_id: sessionConfigId,
      participant_id: participantId,
      student_id: studentId,
      halaqah_id: workspace.halaqah?.halaqah_id || '',
      session_no: matchingConfig?.session_no || payload.session_no || 1,
      attendance_status: payload.attendance,
      assessment_mode: payload.assessment_mode,
      surah_start: payload.start_surah,
      ayah_start: payload.start_ayah,
      surah_end: payload.end_surah,
      ayah_end: payload.end_ayah,
      lines_added: payload.lines_added || 0,
      iqra_level: payload.iqra_level,
      iqra_page_start: payload.iqra_page_start,
      iqra_page_end: payload.iqra_page_end,
      session_note: payload.notes || '',
      teacher_id: payloadWithTeacher.teacher_id,
      is_deleted: false,
      created_at: existingAsm?.created_at || nowIso,
      updated_at: nowIso
    };

    // 1. Immediately update in-memory assessments
    let newAssessments = [...workspace.assessments];
    const asmIndex = newAssessments.findIndex(a =>
      a.participant_id === participantId && a.session_config_id === sessionConfigId
    );
    if (asmIndex >= 0) {
      newAssessments[asmIndex] = optimisticAsm;
    } else {
      newAssessments.push(optimisticAsm);
    }

    // 2. Recompute student progress immediately
    const updatedStudents = recomputeStudentProgress(
      workspace.students,
      newAssessments,
      workspace.finalEvaluations
    );

    const updatedWorkspace: TeacherWorkspaceBootstrap = {
      ...workspace,
      assessments: newAssessments,
      students: updatedStudents,
      lastSyncedAt: nowIso
    };

    // 3. Update React state & cache
    setWorkspace(updatedWorkspace);
    saveWorkspaceToCache(currentTeacherId, updatedWorkspace);

    // 4. Update Pending Write Queue
    const queueItemId = `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const pendingItem: PendingAssessmentWrite = {
      id: queueItemId,
      event_id: eventId,
      participant_id: participantId,
      session_config_id: sessionConfigId,
      student_id: studentId,
      payload: { ...payloadWithTeacher, assessment_id: optimisticAsm.assessment_id },
      localTimestamp: Date.now(),
      status: 'SYNCING',
      retryCount: 0
    };

    let nextQueue = pendingWrites.filter(p => !(p.participant_id === participantId && p.session_config_id === sessionConfigId));
    nextQueue.push(pendingItem);
    setPendingWrites(nextQueue);
    savePendingWrites(currentTeacherId, nextQueue);

    setSyncStatus('SYNCING');
    setSyncMessage('Menyimpan...');

    // 5. Send background sync request
    ApiService.submitSessionAssessment(payloadWithTeacher, currentUser.user_id)
      .then(serverAsm => {
        const finalQueue = loadPendingWrites(currentTeacherId).filter(p => p.id !== queueItemId && !(p.participant_id === participantId && p.session_config_id === sessionConfigId));
        setPendingWrites(finalQueue);
        savePendingWrites(currentTeacherId, finalQueue);

        if (serverAsm?.assessment_id && serverAsm.assessment_id !== optimisticAsm.assessment_id) {
          setWorkspace(prev => {
            if (!prev) return null;
            const patched = prev.assessments.map(a =>
              a.assessment_id === optimisticAsm.assessment_id ? { ...a, assessment_id: serverAsm.assessment_id } : a
            );
            const patchedWs = { ...prev, assessments: patched };
            saveWorkspaceToCache(currentTeacherId, patchedWs);
            return patchedWs;
          });
        }

        if (finalQueue.length === 0) {
          setSyncStatus('SYNCED');
          setSyncMessage('✓ Tersinkron');
          setLastSyncedAt(new Date());
        }
      })
      .catch(err => {
        console.warn('Optimistic assessment write failed to sync:', err.message);
        const failedQueue = loadPendingWrites(currentTeacherId).map(p => {
          if (p.id === queueItemId || (p.participant_id === participantId && p.session_config_id === sessionConfigId)) {
            return { ...p, status: 'FAILED' as const, error: err.message || 'Gagal tersinkron' };
          }
          return p;
        });
        setPendingWrites(failedQueue);
        savePendingWrites(currentTeacherId, failedQueue);
        setSyncStatus('PENDING');
        setSyncMessage(`⚠ ${failedQueue.length} perubahan belum tersinkron`);
      });

    return { success: true };
  }, [currentUser, workspace, pendingWrites, effectiveTeacherId, recomputeStudentProgress]);

  // Optimistic Delete Assessment
  const deleteAssessmentOptimistic = useCallback(async (
    assessmentId: string,
    participantId?: string,
    sessionConfigId?: string,
    studentId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser || !workspace) {
      return { success: false, error: 'Sesi guru belum siap.' };
    }
    const currentTeacherId = effectiveTeacherId || currentUser.teacher_id || currentUser.user_id;

    // 1. Immediately soft delete from local assessments
    const updatedAssessments = workspace.assessments.filter(a => a.assessment_id !== assessmentId);
    const updatedStudents = recomputeStudentProgress(
      workspace.students,
      updatedAssessments,
      workspace.finalEvaluations
    );

    const updatedWorkspace: TeacherWorkspaceBootstrap = {
      ...workspace,
      assessments: updatedAssessments,
      students: updatedStudents,
      lastSyncedAt: new Date().toISOString()
    };

    setWorkspace(updatedWorkspace);
    saveWorkspaceToCache(currentTeacherId, updatedWorkspace);

    // Remove from pending write queue if it was pending
    const remainingQueue = pendingWrites.filter(p => !(participantId && sessionConfigId && p.participant_id === participantId && p.session_config_id === sessionConfigId));
    setPendingWrites(remainingQueue);
    savePendingWrites(currentTeacherId, remainingQueue);

    // 2. Call delete API in background
    ApiService.deleteSessionAssessment(assessmentId, currentTeacherId)
      .then(() => {
        setSyncStatus('SYNCED');
        setSyncMessage('✓ Tersinkron');
      })
      .catch(err => {
        console.warn('Failed to sync assessment deletion:', err);
      });

    return { success: true };
  }, [currentUser, workspace, pendingWrites, effectiveTeacherId, recomputeStudentProgress]);

  // Optimistic Save Final Evaluation
  const saveFinalEvaluationOptimistic = useCallback(async (payload: any): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser || !workspace) {
      return { success: false, error: 'Sesi guru belum siap.' };
    }
    const currentTeacherId = effectiveTeacherId || currentUser.teacher_id || currentUser.user_id;
    const eventId = workspace.event?.event_id || '';
    const participantId = payload.participant_id;
    const studentId = payload.student_id;
    const nowIso = new Date().toISOString();

    const existingEval = workspace.finalEvaluations.find(e =>
      e.participant_id === participantId || e.student_id === studentId
    );

    const payloadWithTeacher = {
      ...payload,
      evaluator_teacher_id: payload.evaluator_teacher_id || currentTeacherId
    };

    const optimisticEval: FinalEvaluation = {
      final_evaluation_id: existingEval?.final_evaluation_id || `FE-LOCAL-${Date.now()}`,
      event_id: eventId,
      participant_id: participantId,
      student_id: studentId,
      evaluation_surah_start: payload.evaluation_surah_start || 1,
      evaluation_ayah_start: payload.evaluation_ayah_start || 1,
      evaluation_surah_end: payload.evaluation_surah_end || 1,
      evaluation_ayah_end: payload.evaluation_ayah_end || 1,
      final_score: payload.final_score,
      completion_status: payload.completion_status || 'INCOMPLETE',
      skill_status_end: payload.skill_status_end || 'NON_BBL',
      affective_rating: payload.affective_rating,
      affective_note: payload.affective_note,
      final_note: payload.evaluator_notes || payload.final_note,
      evaluator_teacher_id: payloadWithTeacher.evaluator_teacher_id,
      created_at: existingEval?.created_at || nowIso,
      updated_at: nowIso
    };

    let newEvals = [...workspace.finalEvaluations];
    const evalIdx = newEvals.findIndex(e => e.participant_id === participantId || e.student_id === studentId);
    if (evalIdx >= 0) {
      newEvals[evalIdx] = optimisticEval;
    } else {
      newEvals.push(optimisticEval);
    }

    const updatedStudents = recomputeStudentProgress(
      workspace.students,
      workspace.assessments,
      newEvals
    );

    const updatedWorkspace: TeacherWorkspaceBootstrap = {
      ...workspace,
      finalEvaluations: newEvals,
      students: updatedStudents,
      lastSyncedAt: nowIso
    };

    setWorkspace(updatedWorkspace);
    saveWorkspaceToCache(currentTeacherId, updatedWorkspace);

    setSyncStatus('SYNCING');
    setSyncMessage('Menyimpan evaluasi...');

    ApiService.submitFinalEvaluation(payloadWithTeacher, currentUser.user_id)
      .then(serverEval => {
        if (serverEval?.final_evaluation_id) {
          setWorkspace(prev => {
            if (!prev) return null;
            const patched = prev.finalEvaluations.map(e =>
              e.participant_id === participantId ? { ...e, final_evaluation_id: serverEval.final_evaluation_id } : e
            );
            const patchedWs = { ...prev, finalEvaluations: patched };
            saveWorkspaceToCache(currentTeacherId, patchedWs);
            return patchedWs;
          });
        }
        setSyncStatus('SYNCED');
        setSyncMessage('✓ Tersinkron');
        setLastSyncedAt(new Date());
      })
      .catch(err => {
        setSyncStatus('ERROR');
        setSyncMessage('Gagal menyinkronkan evaluasi: ' + err.message);
      });

    return { success: true };
  }, [currentUser, workspace, effectiveTeacherId, recomputeStudentProgress]);

  // Handle manual refresh
  const refreshWorkspace = useCallback(async () => {
    if (effectiveTeacherId) {
      clearTeacherWorkspaceCache(effectiveTeacherId);
    }
    await retryPendingWrites();
    await preloadWorkspace(true, activeHalaqahId || undefined, effectiveTeacherId);
  }, [effectiveTeacherId, activeHalaqahId, retryPendingWrites, preloadWorkspace]);

  // Switch halaqah handler
  const handleSetActiveHalaqahId = useCallback((newHalaqahId: string) => {
    setActiveHalaqahId(newHalaqahId);
    if (effectiveTeacherId) {
      const cached = loadCachedWorkspace(effectiveTeacherId, workspace?.event?.event_id, newHalaqahId);
      if (cached) {
        setWorkspace(cached);
      }
    }
    preloadWorkspace(false, newHalaqahId);
  }, [effectiveTeacherId, workspace?.event?.event_id, preloadWorkspace]);

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
        setActiveHalaqahId: handleSetActiveHalaqahId,
        selectedTeacherId,
        setSelectedTeacherId,
        availableTeachers,
        preloadWorkspace,
        refreshWorkspace,
        saveAssessmentOptimistic,
        deleteAssessmentOptimistic,
        saveFinalEvaluationOptimistic,
        retryPendingWrites
      }}
    >
      {children}
    </TeacherWorkspaceContext.Provider>
  );
};

export const useTeacherWorkspace = (): TeacherWorkspaceContextType => {
  const ctx = useContext(TeacherWorkspaceContext);
  if (!ctx) {
    throw new Error('useTeacherWorkspace must be used within a TeacherWorkspaceProvider');
  }
  return ctx;
};
