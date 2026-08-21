import {
  AppConfig, Lookup, Student, Teacher, User, Event, EventDay,
  SessionGroup, SessionConfig, Halaqah, HalaqahTeacher,
  EventParticipant, SessionAssessment, FinalEvaluation, AuditLog,
  SummaryStats, DistributionBucket, SkillTransition, SkillStatus,
  CompletionStatus, EvaluationState, AttendanceStatus, BulkAssignResult,
  StudentPlacementBootstrap, PlacementStudent, TeacherWorkspaceBootstrap,
  TeacherStudentSummary, AssessmentMode, TargetSource
} from '../types';
import {
  INITIAL_CONFIGS, INITIAL_LOOKUPS, INITIAL_STUDENTS, INITIAL_TEACHERS,
  INITIAL_USERS, INITIAL_EVENTS, INITIAL_EVENT_DAYS, INITIAL_SESSION_GROUPS,
  INITIAL_SESSION_CONFIGS, INITIAL_HALAQAH, INITIAL_HALAQAH_TEACHERS,
  INITIAL_PARTICIPANTS, INITIAL_ASSESSMENTS, INITIAL_FINAL_EVALUATIONS,
  INITIAL_AUDIT_LOGS
} from '../data/mockData';
import { calculateStats, getDistributionBuckets, getStudentLinesMap, calculateSkillTransitions } from '../utils/statistics';
import { getCurrentIso } from '../utils/date';
import { getSurahByNo } from '../utils/quran';
import { generateRandomAccessCode } from '../utils/accessCode';
import { formatParticipantTarget, getEffectiveTargets } from '../utils/targetUtils';

const DEFAULT_API_URL =
  'https://script.google.com/macros/s/AKfycbz-KXpzp1fknAHcxRHFLbzo4bLQUH61gR8NA5Orjxs_kGE2MhafyuvGZzw4LmCP43CG0A/exec';

export function resolveApiUrl(): string {
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('rt_api_url_override');
    if (override && override.trim() !== '') return override.trim();
  }
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '' && !envUrl.includes('YOUR_DEPLOYMENT_ID')) {
    return envUrl.trim();
  }
  return DEFAULT_API_URL || '';
}

export function getRuntimeApiUrl(): string { return resolveApiUrl(); }
export function setRuntimeApiUrl(url: string): void {
  if (typeof window !== 'undefined') localStorage.setItem('rt_api_url_override', (url || '').trim());
}
export function clearRuntimeApiUrl(): void {
  if (typeof window !== 'undefined') localStorage.removeItem('rt_api_url_override');
}

export function validateApiUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = (url || '').trim();
  if (!trimmed) return { valid: false, error: 'URL Google Apps Script wajib diisi.' };
  if (!trimmed.startsWith('https://')) return { valid: false, error: 'URL harus menggunakan protokol aman HTTPS (https://).' };
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== 'script.google.com') return { valid: false, error: 'Host domain URL harus script.google.com.' };
    if (!parsed.pathname.includes('/macros/s/')) return { valid: false, error: 'Format URL Web App harus memiliki path /macros/s/.' };
    if (!trimmed.split('?')[0].endsWith('/exec')) return { valid: false, error: 'URL Google Apps Script Web App harus diakhiri dengan /exec.' };
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: 'Format URL tidak valid: ' + (e.message || 'Error parsing URL') };
  }
}

const isMockMode = import.meta.env.VITE_USE_MOCK_DATA === 'true';

const STORAGE_KEYS = {
  CONFIGS: 'rt_lms_configs', LOOKUPS: 'rt_lms_lookups', STUDENTS: 'rt_lms_students',
  TEACHERS: 'rt_lms_teachers', USERS: 'rt_lms_users', EVENTS: 'rt_lms_events',
  EVENT_DAYS: 'rt_lms_event_days', SESSION_GROUPS: 'rt_lms_session_groups',
  SESSION_CONFIGS: 'rt_lms_session_configs', HALAQAH: 'rt_lms_halaqah',
  HALAQAH_TEACHERS: 'rt_lms_halaqah_teachers', PARTICIPANTS: 'rt_lms_participants',
  ASSESSMENTS: 'rt_lms_assessments', FINAL_EVALUATIONS: 'rt_lms_final_evaluations',
  AUDIT_LOGS: 'rt_lms_audit_logs', DRAFTS: 'rt_lms_drafts',
  PENDING_WRITES: 'rt_lms_pending_writes', USER: 'rt_current_user',
  AUTH_TOKEN: 'rt_auth_token', SESSIONS: 'rt_lms_sessions'
};

function getAuthToken(): string { return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || ''; }
function setAuthToken(token: string): void {
  if (token) localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  else localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
}
function getStoredUser(): User | null {
  try { const raw = localStorage.getItem(STORAGE_KEYS.USER); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function setStoredUser(user: User | null): void {
  if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEYS.USER);
}
function notifyAuthExpired(): void {
  setAuthToken(''); setStoredUser(null);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rt_auth_expired', { detail: { message: 'Sesi login telah berakhir. Silakan masuk kembali.' } }));
}

/**
 * RUMAH TAHFIDZ LMS
 * NETWORK RESILIENCE PATCH
 *
 * Tujuan:
 * - Normal request: 20 detik
 * - Login: 45 detik
 * - Auth validate/logout: 25 detik
 * - Heavy read: 45 detik
 * - Direct write: 30 detik
 * - Health/warm-up: 20 detik
 * - Pre-warm Google Apps Script setelah frontend load
 *
 * Cara pakai:
 * 1. Di src/services/api.ts, replace bagian network lama mulai dari:
 *      export const REQUEST_TIMEOUT_MS = 8000;
 *    sampai tepat sebelum:
 *      function loadData<T>(...)
 *    dengan SECTION A di bawah.
 *
 * 2. Di dalam class ApiService, tambahkan SECTION B sebelum testConnection().
 *
 * 3. Di ApiService.testConnection(), ganti timeout hardcoded 8000 menjadi:
 *      HEALTH_TIMEOUT_MS
 *
 * 4. Replace block paling bawah:
 *      if (typeof window !== 'undefined') { ... }
 *    dengan SECTION C.
 *
 * Tidak perlu edit Code.gs.
 * Setelah itu build + redeploy Vercel.
 */

// ====================================================
// SECTION A
// REPLACE NETWORK LAYER LAMA
// ====================================================

export const REQUEST_TIMEOUT_MS = 20000;
export const LOGIN_TIMEOUT_MS = 45000;
export const AUTH_TIMEOUT_MS = 25000;
export const HEAVY_READ_TIMEOUT_MS = 45000;
export const WRITE_TIMEOUT_MS = 30000;
export const HEALTH_TIMEOUT_MS = 20000;

export const CIRCUIT_BREAKER_MAX_FAILURES = 3;
export const CIRCUIT_BREAKER_COOLDOWN_MS = 30000;

function getRequestTimeoutMs(action: string): number {
  switch (action) {
    case 'login':
      return LOGIN_TIMEOUT_MS;

    case 'validateSession':
    case 'logout':
      return AUTH_TIMEOUT_MS;

    case 'getExecutiveAnalytics':
    case 'getAdminOverview':
    case 'getCompletenessReport':
    case 'getTeacherWorkspaceBootstrap':
    case 'getMyHalaqahData':
    case 'getStudentPlacementBootstrap':
    case 'getSessionAssessments':
    case 'getFinalEvaluations':
    case 'getEventParticipants':
      return HEAVY_READ_TIMEOUT_MS;

    case 'saveSessionAssessment':
    case 'bulkSaveSessionAttendance':
    case 'saveFinalEvaluation':
    case 'saveStudent':
    case 'saveTeacher':
    case 'saveUser':
    case 'saveEvent':
    case 'saveEventDay':
    case 'saveSessionGroup':
    case 'saveSessionConfig':
    case 'saveHalaqah':
    case 'saveHalaqahTeacher':
    case 'deleteHalaqahTeacher':
    case 'bulkRegisterAndAssignStudentsToHalaqah':
    case 'bulkAssignStudentsToHalaqah':
    case 'updateParticipantTarget':
    case 'resetUserPassword':
    case 'regenerateAccessCode':
    case 'updateAppConfig':
    case 'deleteSessionAssessment':
      return WRITE_TIMEOUT_MS;

    default:
      return REQUEST_TIMEOUT_MS;
  }
}

export class NetworkError extends Error {
  isNetworkError = true;
  isTimeout: boolean;
  status?: number;

  constructor(
    message: string,
    isTimeout = false,
    status?: number
  ) {
    super(message);
    this.name = 'NetworkError';
    this.isTimeout = isTimeout;
    this.status = status;
  }
}

interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
}

const circuitBreaker: CircuitBreakerState = {
  failureCount: 0,
  lastFailureTime: 0,
  status: 'ONLINE'
};

export function getCircuitBreakerState() {
  const isCooldownActive =
    circuitBreaker.status === 'OFFLINE' &&
    Date.now() - circuitBreaker.lastFailureTime <
      CIRCUIT_BREAKER_COOLDOWN_MS;

  const remainingCooldownSeconds =
    isCooldownActive
      ? Math.ceil(
          (
            CIRCUIT_BREAKER_COOLDOWN_MS -
            (Date.now() - circuitBreaker.lastFailureTime)
          ) / 1000
        )
      : 0;

  return {
    status: isCooldownActive
      ? ('OFFLINE' as const)
      : circuitBreaker.failureCount > 0
      ? ('DEGRADED' as const)
      : ('ONLINE' as const),
    failureCount: circuitBreaker.failureCount,
    isOffline: isCooldownActive,
    remainingCooldownSeconds
  };
}

export function recordCircuitSuccess(): void {
  if (
    circuitBreaker.failureCount > 0 ||
    circuitBreaker.status !== 'ONLINE'
  ) {
    circuitBreaker.failureCount = 0;
    circuitBreaker.status = 'ONLINE';

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('rt_backend_status_change', {
          detail: {
            status: 'ONLINE',
            failureCount: 0
          }
        })
      );
    }
  }
}

export function recordCircuitFailure(error?: any): void {
  circuitBreaker.failureCount++;
  circuitBreaker.lastFailureTime = Date.now();

  circuitBreaker.status =
    circuitBreaker.failureCount >=
    CIRCUIT_BREAKER_MAX_FAILURES
      ? 'OFFLINE'
      : 'DEGRADED';

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('rt_backend_status_change', {
        detail: {
          status: circuitBreaker.status,
          failureCount: circuitBreaker.failureCount,
          error:
            error?.message ||
            'Network transport failure'
        }
      })
    );
  }
}

export function resetCircuitBreaker(): void {
  circuitBreaker.failureCount = 0;
  circuitBreaker.lastFailureTime = 0;
  circuitBreaker.status = 'ONLINE';

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('rt_backend_status_change', {
        detail: {
          status: 'ONLINE',
          failureCount: 0
        }
      })
    );
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (err: any) {
    if (
      err?.name === 'AbortError' ||
      controller.signal.aborted
    ) {
      const seconds = Math.round(
        timeoutMs / 1000
      );

      throw new NetworkError(
        `Batas waktu koneksi habis (${seconds} detik). ` +
          'Google Apps Script sedang lambat atau mengalami cold start. ' +
          'Silakan coba kembali.',
        true
      );
    }

    throw new NetworkError(
      `Koneksi jaringan terputus atau server tidak dapat dihubungi: ${
        err?.message || 'Network request failed'
      }`
    );
  } finally {
    clearTimeout(timer);
  }
}

let isRevalidatingAuth = false;

async function apiPost<T>(
  action: string,
  payload: any = {},
  customUrl?: string,
  retryCount = 0
): Promise<T> {
  const targetUrl = (
    customUrl || resolveApiUrl()
  ).trim();

  if (
    !targetUrl ||
    targetUrl.includes('YOUR_DEPLOYMENT_ID')
  ) {
    throw new Error(
      'Konfigurasi URL Google Apps Script belum diatur. ' +
        'Silakan atur URL di pengaturan database.'
    );
  }

  const token = getAuthToken();

  let res: Response;

  try {
    const timeoutMs =
      getRequestTimeoutMs(action);

    res = await fetchWithTimeout(
      targetUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action,
          payload,
          authToken: token
        })
      },
      timeoutMs
    );
  } catch (err: any) {
    recordCircuitFailure(err);
    throw err;
  }

  if (!res.ok) {
    const httpErr = new NetworkError(
      `HTTP Error ${res.status}: Gagal terhubung ke backend server.`,
      false,
      res.status
    );

    recordCircuitFailure(httpErr);
    throw httpErr;
  }

  let json: any;

  try {
    json = await res.json();
  } catch {
    const e = new NetworkError(
      'Format respons server tidak valid (bukan JSON).'
    );

    recordCircuitFailure(e);
    throw e;
  }

  if (!json.success) {
    const isAuthErr =
      json.error?.code === 'AUTH_REQUIRED' ||
      json.error?.message?.includes('AUTH_REQUIRED') ||
      json.error?.message?.includes(
        'Sesi login telah berakhir'
      );

    if (
      isAuthErr &&
      action !== 'validateSession' &&
      action !== 'login' &&
      retryCount === 0 &&
      token
    ) {
      if (!isRevalidatingAuth) {
        isRevalidatingAuth = true;

        try {
          const valRes =
            await ApiService.validateSession();

          isRevalidatingAuth = false;

          if (valRes?.valid) {
            return await apiPost<T>(
              action,
              payload,
              customUrl,
              retryCount + 1
            );
          }
        } catch {
          isRevalidatingAuth = false;
        }
      }

      notifyAuthExpired();
    }

    recordCircuitSuccess();

    throw new Error(
      json.error?.message ||
        'Gagal menyimpan data ke Google Apps Script backend.'
    );
  }

  recordCircuitSuccess();

  return json.data as T;
}

function loadData<T>(key: string, defaultData: T): T {
  try {
    let raw = localStorage.getItem(key);
    if (!raw) { localStorage.setItem(key, JSON.stringify(defaultData)); return defaultData; }
    if (raw.includes('AKHWAN') || raw.includes('Akhwan')) {
      raw = raw.replace(/"AKHWAN"/g, '"AKHWAT"').replace(/Akhwan/g, 'Akhwat');
      localStorage.setItem(key, raw);
    }
    return JSON.parse(raw);
  } catch (e) { console.error(`Error loading localStorage key ${key}`, e); return defaultData; }
}
function saveData<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch (e) { console.error(`Error saving localStorage key ${key}`, e); }
}

type PendingWriteAction = 'saveSessionAssessment' | 'bulkSaveSessionAttendance' | 'saveFinalEvaluation';
export interface PendingWriteItem {
  id: string; action: PendingWriteAction; payload: any; dedupeKey: string;
  createdAt: string; updatedAt: string; attempts: number; lastError?: string;
}

let pendingFlushPromise: Promise<{ syncedCount: number; remainingCount: number; failedCount: number }> | null = null;

function readPendingWritesLocal(): PendingWriteItem[] {
  try { const raw = localStorage.getItem(STORAGE_KEYS.PENDING_WRITES); if (!raw) return []; const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; }
  catch (e) { console.error('[Pending Sync] Failed reading queue:', e); return []; }
}
function notifyPendingWritesChanged(items?: PendingWriteItem[]): void {
  if (typeof window === 'undefined') return;
  const queue = items || readPendingWritesLocal();
  window.dispatchEvent(new CustomEvent('rt_pending_sync_change', { detail: { count: queue.length, pendingWrites: queue } }));
}
function writePendingWritesLocal(items: PendingWriteItem[]): void {
  try { localStorage.setItem(STORAGE_KEYS.PENDING_WRITES, JSON.stringify(items)); notifyPendingWritesChanged(items); }
  catch (e) { console.error('[Pending Sync] Failed saving queue:', e); }
}
function createPendingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `SYNC_${crypto.randomUUID()}`;
  return `SYNC_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}
function isRetryableSyncError(error: any): boolean {
  if (error instanceof NetworkError || error?.isNetworkError || error?.name === 'NetworkError') return true;
  const status = Number(error?.status);
  if (status === 404 || status === 408 || status === 429 || status >= 500) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('failed to fetch') || message.includes('network') || message.includes('timeout') || message.includes('batas waktu') || message.includes('gagal terhubung') || message.includes('http error 404');
}
function enqueuePendingWrite(action: PendingWriteAction, payload: any, dedupeKey: string): PendingWriteItem {
  const queue = readPendingWritesLocal(); const now = getCurrentIso();
  const idx = queue.findIndex(i => i.dedupeKey === dedupeKey);
  if (idx >= 0) {
    queue[idx] = { ...queue[idx], action, payload, updatedAt: now, lastError: undefined };
    writePendingWritesLocal(queue); return queue[idx];
  }
  const item: PendingWriteItem = { id: createPendingId(), action, payload, dedupeKey, createdAt: now, updatedAt: now, attempts: 0 };
  queue.push(item); writePendingWritesLocal(queue); return item;
}
function removePendingWrite(id: string): void { writePendingWritesLocal(readPendingWritesLocal().filter(i => i.id !== id)); }
function updatePendingWriteError(id: string, error: any): void {
  const queue = readPendingWritesLocal(); const idx = queue.findIndex(i => i.id === id); if (idx < 0) return;
  queue[idx] = { ...queue[idx], attempts: (queue[idx].attempts || 0) + 1, lastError: String(error?.message || error || 'Sync gagal'), updatedAt: getCurrentIso() };
  writePendingWritesLocal(queue);
}

function removePendingAttendanceForAssessment(assessment: SessionAssessment): void {
  const studentId = String(assessment.student_id || '').trim();
  const sessionConfigId = String(assessment.session_config_id || '').trim();
  if (!studentId || !sessionConfigId) return;
  const next: PendingWriteItem[] = [];
  readPendingWritesLocal().forEach(item => {
    if (item.action !== 'bulkSaveSessionAttendance' || String(item.payload?.sessionConfigId || '') !== sessionConfigId) { next.push(item); return; }
    const ids: string[] = Array.isArray(item.payload?.studentIds) ? item.payload.studentIds : [];
    if (!ids.includes(studentId)) { next.push(item); return; }
    const remainingIds = ids.filter(id => id !== studentId);
    if (remainingIds.length) next.push({ ...item, payload: { ...item.payload, studentIds: remainingIds }, dedupeKey: `attendance:${sessionConfigId}:${remainingIds.slice().sort().join(',')}`, updatedAt: getCurrentIso() });
  });
  writePendingWritesLocal(next);
}

function applyAttendanceOverlay(a: SessionAssessment, attendanceStatus: string): SessionAssessment {
  const status = String(attendanceStatus || '').toUpperCase() as AttendanceStatus;
  if (status === 'PRESENT') return { ...a, attendance_status: 'PRESENT', assessment_status: a.assessment_status || 'PENDING' } as SessionAssessment;
  return { ...a, attendance_status: status, assessment_status: 'COMPLETED', surah_start: undefined, ayah_start: undefined, surah_end: undefined, ayah_end: undefined, lines_added: undefined, assessment_mode: undefined, nuroniyyah_dars: undefined, iqra_level: undefined, iqra_page_start: undefined, iqra_page_end: undefined, iqra_pages_added: undefined, updated_at: getCurrentIso() } as any;
}

function overlayPendingWritesOnAssessments(serverAssessments: SessionAssessment[], context?: { eventId?: string; halaqahId?: string; sessionConfigs?: SessionConfig[]; students?: Array<{ student_id: string; participant_id: string }> }): SessionAssessment[] {
  const result = [...(serverAssessments || [])];
  const queue = readPendingWritesLocal().slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const upsert = (asm: SessionAssessment) => {
    if (context?.eventId && asm.event_id && asm.event_id !== context.eventId) return;
    const idx = result.findIndex(x => !x.is_deleted && x.event_id === asm.event_id && x.participant_id === asm.participant_id && x.session_config_id === asm.session_config_id);
    if (idx >= 0) result[idx] = { ...result[idx], ...asm }; else result.push(asm);
  };
  queue.forEach(item => {
    if (item.action === 'saveSessionAssessment') {
      const asm = item.payload?.assessment as SessionAssessment;
      if (asm) upsert({ ...asm, ...({ __pendingSync: true } as any) });
      return;
    }
    if (item.action !== 'bulkSaveSessionAttendance') return;
    const sessionConfigId = String(item.payload?.sessionConfigId || '');
    const attendanceStatus = String(item.payload?.attendanceStatus || '');
    const studentIds: string[] = Array.isArray(item.payload?.studentIds) ? item.payload.studentIds : [];
    const sc = context?.sessionConfigs?.find(x => x.session_config_id === sessionConfigId);
    studentIds.forEach(studentId => {
      const idx = result.findIndex(a => a.student_id === studentId && a.session_config_id === sessionConfigId && !a.is_deleted);
      if (idx >= 0) { result[idx] = { ...applyAttendanceOverlay(result[idx], attendanceStatus), ...({ __pendingSync: true } as any) }; return; }
      const st = context?.students?.find(s => s.student_id === studentId);
      if (!st || !sc) return;
      const now = getCurrentIso();
      result.push({ assessment_id: `LOCAL_PENDING_${sessionConfigId}_${studentId}`, event_id: context?.eventId || sc.event_id, event_day_id: sc.event_day_id, session_config_id: sessionConfigId, participant_id: st.participant_id, student_id: studentId, halaqah_id: context?.halaqahId || '', session_no: sc.session_no, attendance_status: attendanceStatus as AttendanceStatus, assessment_status: attendanceStatus === 'PRESENT' ? 'PENDING' : 'COMPLETED', teacher_id: '', is_deleted: false, created_at: now, updated_at: now, __pendingSync: true } as any);
    });
  });
  return result;
}

function applyPendingOverlayToWorkspace<T extends Record<string, any>>(workspace: T): T {
  if (!workspace || typeof workspace !== 'object') return workspace;
  const ws = workspace as any;
  const merged = overlayPendingWritesOnAssessments(ws.assessments || ws.sessions || [], { eventId: ws.event?.event_id, halaqahId: ws.halaqah?.halaqah_id, sessionConfigs: ws.sessionConfigs || [], students: ws.students || [] });
  const students = (ws.students || []).map((student: any) => {
    const asms = merged.filter(a => a.student_id === student.student_id && !a.is_deleted && a.attendance_status === 'PRESENT');
    let zi = 0, nur = 0, iqra = 0;
    asms.forEach(a => {
      const mode = String(a.assessment_mode || '').toUpperCase();
      if (mode === 'IQRA') iqra += Number((a as any).iqra_pages_added) || 0;
      else if (mode === 'NURONIYYAH') nur += Number(a.lines_added) || 0;
      else if (mode === 'ZIYADAH') zi += Number(a.lines_added) || 0;
      else if ((a as any).nuroniyyah_dars) nur += Number(a.lines_added) || 0;
      else if ((a as any).iqra_level || (a as any).iqra_page_start || (a as any).iqra_page_end) iqra += Number((a as any).iqra_pages_added) || 0;
      else zi += Number(a.lines_added) || 0;
    });
    return { ...student, totalLinesAdded: zi, totalZiyadahLinesAdded: zi, totalNuroniyyahLinesAdded: nur, totalIqraPagesAdded: iqra };
  });
  return { ...workspace, assessments: merged, ...(ws.sessions ? { sessions: merged } : {}), students } as T;
}

export class ApiService {
  // ====================================================
// SECTION B
// TAMBAHKAN DI DALAM `export class ApiService {`
// LETAKKAN SEBELUM `static async testConnection(...)`
// ====================================================

static async warmBackend(): Promise<void> {
  if (isMockMode) return;

  const baseUrl = resolveApiUrl().trim();

  if (
    !baseUrl ||
    baseUrl.includes('YOUR_DEPLOYMENT_ID')
  ) {
    return;
  }

  try {
    const url =
      `${baseUrl}${
        baseUrl.includes('?') ? '&' : '?'
      }action=health`;

    await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      },
      HEALTH_TIMEOUT_MS
    );
  } catch (error) {
    // Warm-up sengaja silent.
    // Gagal warmup tidak otomatis dianggap logout.
    console.debug(
      '[Backend Warmup] GAS belum siap, request nyata akan mencoba lagi.',
      error
    );
  }
}
  static async testConnection(customUrl?: string): Promise<{ connected: boolean; message: string; data?: any }> {
    const urlToTest = (customUrl || resolveApiUrl()).trim();
    const validation = validateApiUrl(urlToTest);
    if (!validation.valid) return { connected: false, message: validation.error || 'URL tidak valid' };
    try {
      const url = `${urlToTest}${urlToTest.includes('?') ? '&' : '?'}action=health`;
      const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } }, HEALTH_TIMEOUT_MS);
      if (!res.ok) { recordCircuitFailure(); return { connected: false, message: `HTTP Error ${res.status} saat menghubungi Web App.` }; }
      const json = await res.json();
      if (json?.success && json?.data?.spreadsheetConnected === true) { recordCircuitSuccess(); return { connected: true, message: 'Database Google Sheets Terhubung', data: json.data }; }
      return { connected: false, message: json?.error?.message || 'Spreadsheet tidak terhubung atau Web App belum siap.' };
    } catch (e: any) { recordCircuitFailure(e); return { connected: false, message: `Gagal terhubung: ${e.message || 'Koneksi bermasalah'}` }; }
  }

  static async checkHealth(): Promise<{ connected: boolean; message: string; lastChecked?: string }> {
    if (isMockMode) return { connected: true, message: 'Mode Mock' };
    const currentUrl = resolveApiUrl();
    if (!currentUrl || currentUrl.includes('YOUR_DEPLOYMENT_ID')) return { connected: false, message: 'Database Tidak Terhubung (URL belum dikonfigurasi)' };
    const r = await this.testConnection(currentUrl);
    return { connected: r.connected, message: r.connected ? 'Google Sheets Terhubung' : (r.message || 'Database Tidak Terhubung'), lastChecked: new Date().toLocaleTimeString('id-ID') };
  }

  static getRuntimeApiUrl = getRuntimeApiUrl;
  static setRuntimeApiUrl = setRuntimeApiUrl;
  static clearRuntimeApiUrl = clearRuntimeApiUrl;
  static validateApiUrl = validateApiUrl;
  static resolveApiUrl = resolveApiUrl;
  static isMockMode = isMockMode;
  static getCircuitBreakerState = getCircuitBreakerState;
  static resetCircuitBreaker = resetCircuitBreaker;
  static recordCircuitSuccess = recordCircuitSuccess;
  static recordCircuitFailure = recordCircuitFailure;
  static NetworkError = NetworkError;
  static getStoredUser = getStoredUser;
  static setStoredUser = setStoredUser;
  static getAuthToken = getAuthToken;
  static setAuthToken = setAuthToken;

  static getPendingWrites(): PendingWriteItem[] { return readPendingWritesLocal(); }
  static getPendingSyncCount(): number { return readPendingWritesLocal().length; }
  static getPendingChangesCount(): number { return this.getPendingSyncCount(); }

  static async flushPendingWrites(): Promise<{ syncedCount: number; remainingCount: number; failedCount: number }> {
    if (isMockMode) { writePendingWritesLocal([]); return { syncedCount: 0, remainingCount: 0, failedCount: 0 }; }
    if (pendingFlushPromise) return pendingFlushPromise;
    pendingFlushPromise = (async () => {
      let syncedCount = 0, failedCount = 0;
      const queue = readPendingWritesLocal();
      for (const item of queue) {
        try {
          await apiPost<any>(item.action, item.payload);
          removePendingWrite(item.id);
          syncedCount++;
        } catch (error: any) {
          failedCount++;
          updatePendingWriteError(item.id, error);
          console.warn('[Pending Sync] Sync gagal:', item.action, error);
          if (isRetryableSyncError(error)) break;
          // Validation/auth problem: keep this item, but continue so unrelated items can still sync.
          continue;
        }
      }
      const remaining = readPendingWritesLocal();
      if (syncedCount > 0) {
        this.clearWorkspaceCache();
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rt_backend_data_changed', { detail: { source: 'pending-sync', syncedCount } }));
      }
      return { syncedCount, remainingCount: remaining.length, failedCount };
    })();
    try { return await pendingFlushPromise; } finally { pendingFlushPromise = null; }
  }
  static async syncPendingChanges() { return this.flushPendingWrites(); }

  static async searchLoginAccounts(query: string): Promise<Array<{ username: string; display_name: string }>> {
    const trimmed = (query || '').trim().toLowerCase(); if (!trimmed || trimmed.length < 2) return [];
    if (!isMockMode) { try { return (await apiPost<Array<{ username: string; display_name: string }>>('searchLoginAccounts', { query: trimmed })) || []; } catch { return []; } }
    const users = loadData<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS).filter(u => u.active === true || String(u.active).toLowerCase() === 'true');
    const matches: Array<{ username: string; display_name: string }> = [];
    for (const u of users) {
      const un = (u.username || '').trim(), dn = (u.display_name || '').trim();
      if (un.toLowerCase().includes(trimmed) || dn.toLowerCase().includes(trimmed)) { matches.push({ username: un, display_name: dn }); if (matches.length >= 8) break; }
    }
    return matches;
  }

  static async login(username: string, password: string): Promise<{ token: string; user: User }> {
    if (!isMockMode) {
      const r = await apiPost<{ token: string; user: User }>('login', { username, password });
      if (r.token) setAuthToken(r.token); if (r.user) setStoredUser(r.user); return r;
    }
    const users = loadData<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    const found = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!found) throw new Error('Username atau password tidak cocok.');
    if (found.active === false || String(found.active).toLowerCase() === 'false') throw new Error('Akun Anda sudah tidak aktif. Silakan hubungi administrator.');
    const token = `SES_MOCK_${found.user_id}_${Date.now()}`, now = getCurrentIso();
    const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []);
    sessions.unshift({ session_token: token, user_id: found.user_id, role: found.role, teacher_id: found.teacher_id || '', created_at: now, last_seen_at: now, revoked: false, revoked_at: '' });
    saveData(STORAGE_KEYS.SESSIONS, sessions); setAuthToken(token); setStoredUser(found); return { token, user: found };
  }

  static async logout(): Promise<void> {
    const token = getAuthToken();
    if (!isMockMode) { try { await apiPost('logout', {}); } catch {} }
    else if (token) {
      const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []); const idx = sessions.findIndex(s => s.session_token === token);
      if (idx >= 0) { sessions[idx].revoked = true; sessions[idx].revoked_at = getCurrentIso(); saveData(STORAGE_KEYS.SESSIONS, sessions); }
    }
    setAuthToken(''); setStoredUser(null);
  }

  static async validateSession(): Promise<{ valid: boolean; user?: User }> {
    const token = getAuthToken(); if (!token) return { valid: false };
    if (!isMockMode) {
      try {
        const r = await apiPost<{ valid: boolean; user?: User }>('validateSession', {});
        if (r?.valid && r.user) { setStoredUser(r.user); return r; }
        notifyAuthExpired(); return { valid: false };
      } catch (e: any) {
        if (e instanceof NetworkError || e?.isNetworkError || e?.name === 'NetworkError') {
          console.warn('[Network Resilience] validateSession skipped logout due to network transport failure:', e.message);
          const stored = getStoredUser(); return stored ? { valid: true, user: stored } : { valid: false };
        }
        const msg = String(e?.message || '');
        if (msg.includes('AUTH_REQUIRED') || msg.includes('tidak valid') || msg.includes('berakhir') || msg.includes('tidak aktif')) notifyAuthExpired();
        return { valid: false };
      }
    }
    const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []), storedUser = getStoredUser();
    const foundSession = sessions.find(s => s.session_token === token);
    if (foundSession) {
      if (foundSession.revoked === true || String(foundSession.revoked).toLowerCase() === 'true') { notifyAuthExpired(); return { valid: false }; }
      const user = loadData<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS).find(u => u.user_id === foundSession.user_id);
      if (!user || user.active === false || String(user.active).toLowerCase() === 'false') { notifyAuthExpired(); return { valid: false }; }
      setStoredUser(user); return { valid: true, user };
    }
    if (storedUser) return { valid: true, user: storedUser };
    notifyAuthExpired(); return { valid: false };
  }

  static async cleanupRevokedSessions(): Promise<{ success: boolean; deletedCount: number }> {
    if (!isMockMode) return apiPost('cleanupRevokedSessions', {});
    const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []), cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const kept = sessions.filter(s => !(String(s.revoked).toLowerCase() === 'true' && s.revoked_at && new Date(s.revoked_at).getTime() < cutoff));
    saveData(STORAGE_KEYS.SESSIONS, kept); return { success: true, deletedCount: sessions.length - kept.length };
  }

  static async getAppConfigs(): Promise<AppConfig[]> { return !isMockMode ? apiPost('getAppConfigs') : loadData(STORAGE_KEYS.CONFIGS, INITIAL_CONFIGS); }
  static async getConfigValue(key: string, fallback: string): Promise<string> { const x = (await this.getAppConfigs()).find(c => c.config_key === key); return x ? x.config_value : fallback; }
  static async updateAppConfig(key: string, value: string, actorUserId?: string): Promise<void> {
    if (!isMockMode) { await apiPost('updateAppConfig', { key, value }); return; }
    const configs = await this.getAppConfigs(); const idx = configs.findIndex(c => c.config_key === key);
    if (idx >= 0) { configs[idx].config_value = value; configs[idx].updated_at = getCurrentIso(); }
    else configs.push({ config_key: key, config_value: value, description: key, updated_at: getCurrentIso() });
    saveData(STORAGE_KEYS.CONFIGS, configs); await this.addAuditLog('UPDATE_CONFIG', 'CONFIG', key, undefined, JSON.stringify({ key, value }), undefined, actorUserId);
  }
  static async getLookups(): Promise<Lookup[]> { return !isMockMode ? apiPost('getLookups') : loadData(STORAGE_KEYS.LOOKUPS, INITIAL_LOOKUPS); }

  static async getEvents(): Promise<Event[]> { return !isMockMode ? apiPost('getEvents') : loadData(STORAGE_KEYS.EVENTS, INITIAL_EVENTS); }
  static async getCurrentEvent(): Promise<Event> {
    if (!isMockMode) return apiPost('getCurrentEvent');
    const events = await this.getEvents(), configs = await this.getAppConfigs(), id = configs.find(c => c.config_key === 'current_event_id')?.config_value;
    return (id && events.find(e => e.event_id === id)) || events.find(e => e.status === 'ACTIVE') || events[0];
  }
  static async saveEvent(evt: Event, actorUserId?: string): Promise<Event> {
    if (!isMockMode) return apiPost('saveEvent', { event: evt });
    const list = await this.getEvents(); list.unshift(evt); saveData(STORAGE_KEYS.EVENTS, list); await this.addAuditLog('CREATE_EVENT', 'EVENT', evt.event_id, undefined, JSON.stringify(evt), undefined, actorUserId, evt.event_id); return evt;
  }
  static async updateEvent(evt: Event, actorUserId?: string): Promise<Event> {
    if (!isMockMode) return apiPost('saveEvent', { event: evt });
    const list = await this.getEvents(), idx = list.findIndex(e => e.event_id === evt.event_id);
    if (idx >= 0) { const old = list[idx]; list[idx] = { ...evt, updated_at: getCurrentIso() }; saveData(STORAGE_KEYS.EVENTS, list); await this.addAuditLog('UPDATE_EVENT', 'EVENT', evt.event_id, JSON.stringify(old), JSON.stringify(evt), undefined, actorUserId, evt.event_id); }
    return evt;
  }

  static async getEventDays(eventId?: string): Promise<EventDay[]> { if (!isMockMode) return apiPost('getEventDays', { eventId }); const x = loadData<EventDay[]>(STORAGE_KEYS.EVENT_DAYS, INITIAL_EVENT_DAYS); return eventId ? x.filter(d => d.event_id === eventId) : x; }
  static async saveEventDay(day: EventDay, actorUserId?: string): Promise<EventDay> {
    if (!isMockMode) return apiPost('saveEventDay', { eventDay: day });
    const x = loadData<EventDay[]>(STORAGE_KEYS.EVENT_DAYS, INITIAL_EVENT_DAYS), idx = x.findIndex(d => d.event_day_id === day.event_day_id), old = idx >= 0 ? x[idx] : undefined;
    if (idx >= 0) x[idx] = day; else x.push(day); saveData(STORAGE_KEYS.EVENT_DAYS, x);
    await this.addAuditLog(idx >= 0 ? 'UPDATE_EVENT_DAY' : 'CREATE_EVENT_DAY', 'EVENT_DAY', day.event_day_id, old ? JSON.stringify(old) : undefined, JSON.stringify(day), undefined, actorUserId, day.event_id); return day;
  }

  static async getSessionGroups(eventId?: string): Promise<SessionGroup[]> { if (!isMockMode) return apiPost('getSessionGroups', { eventId }); const x = loadData<SessionGroup[]>(STORAGE_KEYS.SESSION_GROUPS, INITIAL_SESSION_GROUPS); return eventId ? x.filter(g => g.event_id === eventId) : x; }
  static async saveSessionGroup(sg: SessionGroup, actorUserId?: string): Promise<SessionGroup> {
    if (!isMockMode) return apiPost('saveSessionGroup', { sessionGroup: sg });
    const x = loadData<SessionGroup[]>(STORAGE_KEYS.SESSION_GROUPS, INITIAL_SESSION_GROUPS), idx = x.findIndex(g => g.session_group_id === sg.session_group_id), old = idx >= 0 ? x[idx] : undefined;
    if (idx >= 0) x[idx] = sg; else x.push(sg); saveData(STORAGE_KEYS.SESSION_GROUPS, x);
    await this.addAuditLog(idx >= 0 ? 'UPDATE_SESSION_GROUP' : 'CREATE_SESSION_GROUP', 'SESSION_GROUP', sg.session_group_id, old ? JSON.stringify(old) : undefined, JSON.stringify(sg), undefined, actorUserId, sg.event_id); return sg;
  }

  static normalizeClockTime(timeVal: any): string {
    if (timeVal == null) return ''; if (timeVal instanceof Date) return `${String(timeVal.getHours()).padStart(2, '0')}:${String(timeVal.getMinutes()).padStart(2, '0')}`;
    const str = String(timeVal).trim(); if (!str) return '';
    let m = str.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/); if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
    m = str.match(/^([0]?[1-9]|1[0-2]):([0-5]\d)(?::[0-5]\d)?\s*([AP]M)$/i); if (m) { let h = parseInt(m[1], 10); const pm = m[3].toUpperCase() === 'PM'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; return `${String(h).padStart(2, '0')}:${m[2]}`; }
    m = str.match(/T([01]?\d|2[0-3]):([0-5]\d)/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
  }
  static normalizeTime(timeVal: any): string { return this.normalizeClockTime(timeVal); }
  static formatClockTime(timeVal: any): string { return this.normalizeClockTime(timeVal) || '--:--'; }
  static async getSessionConfigs(eventId?: string): Promise<SessionConfig[]> {
    if (!isMockMode) return (await apiPost<SessionConfig[]>('getSessionConfigs', { eventId }) || []).map(sc => ({ ...sc, start_time: this.normalizeTime(sc.start_time), end_time: this.normalizeTime(sc.end_time) }));
    const x = loadData<SessionConfig[]>(STORAGE_KEYS.SESSION_CONFIGS, INITIAL_SESSION_CONFIGS), list = eventId ? x.filter(s => s.event_id === eventId) : x;
    return list.map(sc => ({ ...sc, start_time: this.normalizeTime(sc.start_time), end_time: this.normalizeTime(sc.end_time) }));
  }
  static async saveSessionConfig(sc: SessionConfig, actorUserId?: string): Promise<SessionConfig> {
    const payload = { ...sc, start_time: this.normalizeTime(sc.start_time), end_time: this.normalizeTime(sc.end_time) };
    if (!isMockMode) return apiPost('saveSessionConfig', { sessionConfig: payload });
    const x = loadData<SessionConfig[]>(STORAGE_KEYS.SESSION_CONFIGS, INITIAL_SESSION_CONFIGS), idx = x.findIndex(s => s.session_config_id === sc.session_config_id), old = idx >= 0 ? x[idx] : undefined;
    if (idx >= 0) x[idx] = payload; else x.push(payload); saveData(STORAGE_KEYS.SESSION_CONFIGS, x);
    await this.addAuditLog(idx >= 0 ? 'UPDATE_SESSION_CONFIG' : 'CREATE_SESSION_CONFIG', 'SESSION_CONFIG', sc.session_config_id, old ? JSON.stringify(old) : undefined, JSON.stringify(payload), undefined, actorUserId, sc.event_id); return payload;
  }

  static async getStudents(): Promise<Student[]> { return !isMockMode ? apiPost('getStudents') : loadData(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS); }
  static async getStudentsForRole(userRole?: string, teacherId?: string): Promise<Student[]> {
    if (!isMockMode) return apiPost('getStudents');
    const students = await this.getStudents(); if (userRole === 'ADMIN') return students;
    if (userRole === 'TEACHER' && teacherId) {
      const evt = await this.getCurrentEvent(), allowed = new Set<string>();
      if (evt?.event_id) {
        const ids = new Set((await this.getHalaqahTeachers(evt.event_id)).filter(x => x.teacher_id === teacherId && x.active).map(x => x.halaqah_id));
        (await this.getEventParticipants(evt.event_id)).forEach(p => { if (ids.has(p.halaqah_id)) allowed.add(p.student_id); });
      }
      return students.filter(s => allowed.has(s.student_id)).map(s => ({ ...s, access_code: '' }));
    }
    return students.map(s => ({ ...s, access_code: '' }));
  }
  static async regenerateAccessCode(studentId: string, actorUserId?: string): Promise<{ success: boolean; newAccessCode: string }> {
    if (!isMockMode) return apiPost('regenerateAccessCode', { studentId });
    const students = await this.getStudents(), s = students.find(x => x.student_id === studentId); if (!s) throw new Error('Siswa tidak ditemukan.');
    const old = s.access_code, code = generateRandomAccessCode(students.map(x => x.access_code)); s.access_code = code; s.updated_at = getCurrentIso(); saveData(STORAGE_KEYS.STUDENTS, students);
    await this.addAuditLog('REGENERATE_ACCESS_CODE', 'STUDENT', studentId, JSON.stringify({ access_code: old }), JSON.stringify({ access_code: code }), undefined, actorUserId); return { success: true, newAccessCode: code };
  }
  static async saveStudent(student: Student, actorUserId?: string): Promise<Student> {
    if (!isMockMode) return apiPost('saveStudent', { student });
    const x = await this.getStudents(), idx = x.findIndex(s => s.student_id === student.student_id), old = idx >= 0 ? x[idx] : undefined;
    if (idx >= 0) x[idx] = { ...student, updated_at: getCurrentIso() }; else x.unshift(student); saveData(STORAGE_KEYS.STUDENTS, x);
    await this.addAuditLog(idx >= 0 ? 'UPDATE_STUDENT' : 'CREATE_STUDENT', 'STUDENT', student.student_id, old ? JSON.stringify(old) : undefined, JSON.stringify(student), undefined, actorUserId); return student;
  }
  static async getTeachers(): Promise<Teacher[]> { return !isMockMode ? apiPost('getTeachers') : loadData(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS); }
  static async saveTeacher(teacher: Teacher, actorUserId?: string): Promise<Teacher> {
    if (!isMockMode) return apiPost('saveTeacher', { teacher });
    const x = await this.getTeachers(), idx = x.findIndex(t => t.teacher_id === teacher.teacher_id), old = idx >= 0 ? x[idx] : undefined;
    if (idx >= 0) x[idx] = { ...teacher, updated_at: getCurrentIso() }; else x.unshift(teacher); saveData(STORAGE_KEYS.TEACHERS, x);
    await this.addAuditLog(idx >= 0 ? 'UPDATE_TEACHER' : 'CREATE_TEACHER', 'TEACHER', teacher.teacher_id, old ? JSON.stringify(old) : undefined, JSON.stringify(teacher), undefined, actorUserId); return teacher;
  }

  static async getUsers(): Promise<User[]> { return !isMockMode ? apiPost('getUsers') : loadData(STORAGE_KEYS.USERS, INITIAL_USERS); }
  static async saveUser(user: User, password?: string, actorUserId?: string): Promise<User> {
    const payload: any = { ...user }; if (password?.trim()) payload.password = password.trim(); if (!isMockMode) return apiPost('saveUser', { user: payload });
    const x = await this.getUsers(), lower = user.username.trim().toLowerCase(), dup = x.find(u => u.user_id !== user.user_id && u.username.trim().toLowerCase() === lower); if (dup) throw new Error(`Username "${user.username}" sudah digunakan oleh akun lain (${dup.display_name}).`);
    const idx = x.findIndex(u => u.user_id === user.user_id), now = getCurrentIso(), clean: User = { user_id: user.user_id, username: user.username.trim(), display_name: user.display_name.trim(), role: user.role, teacher_id: user.role === 'TEACHER' ? (user.teacher_id || '') : '', active: user.active, created_at: user.created_at || now, updated_at: now, last_login_at: user.last_login_at || '' };
    if (idx >= 0) x[idx] = clean; else x.unshift(clean); saveData(STORAGE_KEYS.USERS, x); await this.addAuditLog(idx >= 0 ? 'UPDATE_USER' : 'CREATE_USER', 'USER', clean.user_id, undefined, JSON.stringify(clean), undefined, actorUserId); return clean;
  }
  static async resetUserPassword(userId: string, newPassword: string, actorUserId?: string): Promise<{ success: boolean; message: string }> {
    if (!newPassword?.trim()) throw new Error('Password baru wajib diisi.'); if (!isMockMode) return apiPost('resetUserPassword', { userId, newPassword: newPassword.trim() });
    const users = loadData<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS), u = users.find(x => x.user_id === userId); if (!u) throw new Error('Pengguna tidak ditemukan.'); u.updated_at = getCurrentIso(); saveData(STORAGE_KEYS.USERS, users);
    await this.addAuditLog('RESET_USER_PASSWORD', 'USER', userId, undefined, JSON.stringify({ username: u.username, display_name: u.display_name, reset_at: u.updated_at }), 'Reset password berhasil dilakukan oleh Admin', actorUserId); return { success: true, message: 'Password pengguna berhasil diperbarui.' };
  }

  static async getHalaqahList(eventId?: string): Promise<Halaqah[]> { if (!isMockMode) return apiPost('getHalaqahList', { eventId }); const x = loadData<Halaqah[]>(STORAGE_KEYS.HALAQAH, INITIAL_HALAQAH); return eventId ? x.filter(h => h.event_id === eventId) : x; }
  static async saveHalaqah(halaqah: Halaqah, actorUserId?: string): Promise<Halaqah> {
    if (!isMockMode) return apiPost('saveHalaqah', { halaqah }); const x = await this.getHalaqahList(), idx = x.findIndex(h => h.halaqah_id === halaqah.halaqah_id), old = idx >= 0 ? x[idx] : undefined; if (idx >= 0) x[idx] = halaqah; else x.push(halaqah); saveData(STORAGE_KEYS.HALAQAH, x); await this.addAuditLog(idx >= 0 ? 'UPDATE_HALAQAH' : 'CREATE_HALAQAH', 'HALAQAH', halaqah.halaqah_id, old ? JSON.stringify(old) : undefined, JSON.stringify(halaqah), undefined, actorUserId, halaqah.event_id); return halaqah;
  }
  static async getHalaqahTeachers(eventId?: string): Promise<HalaqahTeacher[]> { if (!isMockMode) return apiPost('getHalaqahTeachers', { eventId }); let x = loadData<HalaqahTeacher[]>(STORAGE_KEYS.HALAQAH_TEACHERS, INITIAL_HALAQAH_TEACHERS).filter(a => a.active === true || String(a.active).toLowerCase() === 'true'); return eventId ? x.filter(a => a.event_id === eventId) : x; }
  static clearWorkspaceCache(teacherId?: string, eventId?: string): void {
    try { const rm: string[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k?.startsWith('rt_teacher_ws_')) continue; if (teacherId && eventId) { if (k.startsWith(`rt_teacher_ws_${teacherId}_${eventId}`)) rm.push(k); } else if (teacherId) { if (k.startsWith(`rt_teacher_ws_${teacherId}_`)) rm.push(k); } else rm.push(k); } rm.forEach(k => localStorage.removeItem(k)); } catch (e) { console.error('Error clearing workspace cache:', e); }
  }
  static async saveHalaqahTeacher(ht: HalaqahTeacher, actorUserId?: string): Promise<HalaqahTeacher> {
    this.clearWorkspaceCache(ht.teacher_id, ht.event_id); if (!isMockMode) { const r = await apiPost<HalaqahTeacher>('saveHalaqahTeacher', { halaqahTeacher: ht }); this.clearWorkspaceCache(ht.teacher_id, ht.event_id); return r; }
    const x = loadData<HalaqahTeacher[]>(STORAGE_KEYS.HALAQAH_TEACHERS, INITIAL_HALAQAH_TEACHERS), idx = x.findIndex(i => i.event_id === ht.event_id && i.halaqah_id === ht.halaqah_id && i.teacher_id === ht.teacher_id), now = getCurrentIso();
    if (idx >= 0) { x[idx] = { ...x[idx], active: true, teacher_role: ht.teacher_role, updated_at: now }; saveData(STORAGE_KEYS.HALAQAH_TEACHERS, x); return x[idx]; }
    const n = { ...ht, active: true, updated_at: now }; x.push(n); saveData(STORAGE_KEYS.HALAQAH_TEACHERS, x); return n;
  }
  static async deleteHalaqahTeacher(assignmentId: string, actorUserId?: string): Promise<{ deleted: boolean; assignmentId: string; teacherId?: string; halaqahId?: string }> {
    if (!assignmentId) throw new Error('ID penugasan tidak ditemukan. Data tidak dapat dihapus.'); this.clearWorkspaceCache();
    if (!isMockMode) { const r = await apiPost<any>('deleteHalaqahTeacher', { assignmentId }); this.clearWorkspaceCache(r?.teacherId); return r; }
    let x = loadData<HalaqahTeacher[]>(STORAGE_KEYS.HALAQAH_TEACHERS, INITIAL_HALAQAH_TEACHERS), item = x.find(i => i.assignment_id === assignmentId); x = x.filter(i => i.assignment_id !== assignmentId); saveData(STORAGE_KEYS.HALAQAH_TEACHERS, x); return { deleted: true, assignmentId, teacherId: item?.teacher_id, halaqahId: item?.halaqah_id };
  }

  static async getEventParticipants(eventId?: string): Promise<EventParticipant[]> { if (!isMockMode) return apiPost('getEventParticipants', { eventId }); const x = loadData<EventParticipant[]>(STORAGE_KEYS.PARTICIPANTS, INITIAL_PARTICIPANTS); return eventId ? x.filter(p => p.event_id === eventId) : x; }
  static async getStudentPlacementBootstrap(eventId?: string): Promise<StudentPlacementBootstrap> {
    if (!isMockMode) return apiPost('getStudentPlacementBootstrap', { eventId });
    const [events, students, participants, halaqahs] = await Promise.all([this.getEvents(), this.getStudents(), this.getEventParticipants(eventId), this.getHalaqahList(eventId)]);
    const event = (eventId ? events.find(e => e.event_id === eventId) : null) || events.find(e => e.status === 'ACTIVE') || events[0] || null;
    return { event, students: students.map(s => ({ student_id: s.student_id, nis: s.nis, full_name: s.full_name, gender: s.gender, grade_level: s.grade_level, class_name: s.class_name, active: s.active })), participants: event ? participants.filter(p => p.event_id === event.event_id) : participants, halaqahs: event ? halaqahs.filter(h => h.event_id === event.event_id) : halaqahs };
  }

  static async getTeacherWorkspaceBootstrap(eventId?: string, halaqahId?: string, teacherId?: string): Promise<TeacherWorkspaceBootstrap> {
    if (!isMockMode) {
      const serverData = await apiPost<TeacherWorkspaceBootstrap>('getTeacherWorkspaceBootstrap', { eventId, halaqahId, teacherId });
      return applyPendingOverlayToWorkspace(serverData);
    }
    const [events, eventDays, halaqahs, hts, teachers, participants, students, assessments, evals, configs] = await Promise.all([this.getEvents(), this.getEventDays(eventId), this.getHalaqahList(eventId), this.getHalaqahTeachers(eventId), this.getTeachers(), this.getEventParticipants(eventId), this.getStudents(), this.getSessionAssessments(eventId), this.getFinalEvaluations(eventId), this.getSessionConfigs(eventId)]);
    const event = (eventId ? events.find(e => e.event_id === eventId) : null) || events.find(e => e.status === 'ACTIVE') || events[0] || null;
    if (!event) return { event: null, halaqah: null, availableHalaqahs: [], students: [], sessionConfigs: [], assessments: [], finalEvaluations: [], serverTimestamp: new Date().toISOString() } as any;
    const currentUser = this.getStoredUser(), resolvedTeacherId = currentUser?.role === 'TEACHER' ? currentUser.teacher_id : (teacherId?.trim() || null);
    let available = halaqahs.filter(h => h.event_id === event.event_id && (h.active === true || String(h.active).toLowerCase() === 'true'));
    if (resolvedTeacherId) { const ids = new Set(hts.filter(x => x.teacher_id === resolvedTeacherId && x.active).map(x => x.halaqah_id)); available = available.filter(h => ids.has(h.halaqah_id)); }
    const selected = (halaqahId ? available.find(h => h.halaqah_id === halaqahId) : null) || available[0] || null;
    if (!selected) return { event, halaqah: null, availableHalaqahs: available, students: [], sessionConfigs: [], assessments: [], finalEvaluations: [], serverTimestamp: new Date().toISOString() } as any;
    const parts = participants.filter(p => p.event_id === event.event_id && p.halaqah_id === selected.halaqah_id), ids = new Set(parts.map(p => p.student_id)), pids = new Set(parts.map(p => p.participant_id));
    const tasms = assessments.filter(a => a.event_id === event.event_id && !a.is_deleted && (a.halaqah_id === selected.halaqah_id || ids.has(a.student_id))), tevals = evals.filter(e => e.event_id === event.event_id && (ids.has(e.student_id) || pids.has(e.participant_id))), tcfgs = selected.session_group_id ? configs.filter(c => c.event_id === event.event_id && c.session_group_id === selected.session_group_id) : configs.filter(c => c.event_id === event.event_id);
    const mapped = parts.map(p => {
      const st = students.find(s => s.student_id === p.student_id), fe = tevals.find(e => e.student_id === p.student_id || e.participant_id === p.participant_id); let zi=0,nur=0,iqra=0;
      tasms.filter(a => a.student_id === p.student_id && a.attendance_status === 'PRESENT').forEach(a => { const m = String(a.assessment_mode || '').toUpperCase(); if (m === 'IQRA') iqra += Number((a as any).iqra_pages_added)||0; else if (m === 'NURONIYYAH') nur += Number(a.lines_added)||0; else zi += Number(a.lines_added)||0; });
      return { student_id:p.student_id, participant_id:p.participant_id, nis:st?.nis||'', full_name:st?.full_name||'Siswa', access_code:st?.access_code||'', grade_snapshot:p.grade_snapshot, class_snapshot:p.class_snapshot, grade_class:`${p.grade_snapshot||''} (${p.class_snapshot||''})`, gender:st?.gender||selected.gender||'IKHWAN', skill_status_start:p.skill_status_start ? String(p.skill_status_start).toUpperCase().trim() as SkillStatus : undefined, baseline_surah:p.baseline_surah, baseline_ayah:p.baseline_ayah, target_surah_start:p.target_surah_start, target_ayah_start:p.target_ayah_start, target_surah_end:p.target_surah_end, target_ayah_end:p.target_ayah_end, target_lines:p.target_lines, target_nuroniyyah_lines:p.target_nuroniyyah_lines, target_iqra_pages:p.target_iqra_pages, target_source:p.target_source, targetText:formatParticipantTarget(p,selected), totalLinesAdded:zi, totalZiyadahLinesAdded:zi, totalNuroniyyahLinesAdded:nur, totalIqraPagesAdded:iqra, completionStatus:fe?fe.completion_status:'NOT_EVALUATED', session_group_id:p.session_group_id||selected.session_group_id } as any;
    });
    const assignments = hts.filter(x => x.halaqah_id === selected.halaqah_id && x.active), primary = assignments.find(x => x.teacher_role === 'PRIMARY') || assignments[0], teacher = primary ? teachers.find(t => t.teacher_id === primary.teacher_id) : null;
    return { event, eventDays, halaqah:{ ...selected, group_name:selected.halaqah_name, teacher_name:teacher?.full_name||'Guru Tahfidz', target_nuroniyyah_lines:selected.target_nuroniyyah_lines ?? selected.target_iqra_pages }, availableHalaqahs:available, students:mapped, sessionConfigs:tcfgs, assessments:tasms, finalEvaluations:tevals, assignedTeachers:assignments.map(a => { const t=teachers.find(x=>x.teacher_id===a.teacher_id); return { teacher_id:a.teacher_id, full_name:t?.full_name||'Guru Tahfidz', short_name:t?.short_name||'', teacher_role:a.teacher_role||'PRIMARY' }; }), serverTimestamp:new Date().toISOString() } as any;
  }

  static async bulkRegisterAndAssignStudentsToHalaqah(eventId: string, studentIds: string[], targetHalaqahId: string, actorUserId?: string): Promise<BulkAssignResult> {
    if (!isMockMode) return apiPost('bulkRegisterAndAssignStudentsToHalaqah', { eventId, studentIds, targetHalaqahId });
    const ps = loadData<EventParticipant[]>(STORAGE_KEYS.PARTICIPANTS, INITIAL_PARTICIPANTS), students = loadData<Student[]>(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS), halaqahs = loadData<Halaqah[]>(STORAGE_KEYS.HALAQAH, INITIAL_HALAQAH), target = targetHalaqahId ? halaqahs.find(h => h.halaqah_id === targetHalaqahId) : null;
    let createdCount=0,updatedCount=0; const skippedRecords:Array<{studentId:string;studentName?:string;reason:string}>=[];
    studentIds.forEach(sid => {
      const s=students.find(x=>x.student_id===sid); if(!s){skippedRecords.push({studentId:sid,reason:'Data siswa tidak ditemukan di Master Siswa.'});return;} if(!s.active){skippedRecords.push({studentId:sid,studentName:s.full_name,reason:'Status siswa tidak aktif di Master Siswa.'});return;}
      if(target?.gender&&s.gender&&target.gender!==s.gender){skippedRecords.push({studentId:sid,studentName:s.full_name,reason:`Gender siswa (${s.gender}) tidak sesuai dengan gender halaqah (${target.gender})`});return;}
      const p=ps.find(x=>x.event_id===eventId&&x.student_id===sid), now=getCurrentIso();
      if(p){p.halaqah_id=targetHalaqahId;p.session_group_id=target?.session_group_id||p.session_group_id||'';if(target&&p.target_source==='HALAQAH'){if(p.skill_status_start==='NON_BBL'){p.target_nuroniyyah_lines=target.target_nuroniyyah_lines;p.target_lines=undefined;}else{p.target_lines=target.target_ziyadah_lines;p.target_nuroniyyah_lines=undefined;}}p.updated_at=now;updatedCount++;}
      else{ps.push({participant_id:`PART_${typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').substring(0,16):Math.random().toString(36).substring(2,12)}`,event_id:eventId,student_id:s.student_id,class_snapshot:s.class_name||'',grade_snapshot:s.grade_level||'',skill_status_start:'' as any,halaqah_id:targetHalaqahId,session_group_id:target?.session_group_id||'',target_lines:undefined,target_nuroniyyah_lines:undefined,target_iqra_pages:undefined,target_source:target?('HALAQAH' as any):undefined,participant_status:'ACTIVE',created_at:now,updated_at:now} as any);createdCount++;}
    });
    saveData(STORAGE_KEYS.PARTICIPANTS,ps); const skippedStudentIds=skippedRecords.map(r=>r.studentId);
    await this.addAuditLog('BULK_REGISTER_ASSIGN_HALAQAH','PARTICIPANT',targetHalaqahId||eventId,undefined,JSON.stringify({createdCount,updatedCount,skippedCount:skippedRecords.length,targetHalaqahId}),undefined,actorUserId,eventId);
    return {createdCount,updatedCount,skippedCount:skippedRecords.length,skippedStudentIds,skippedRecords};
  }
  static async bulkAssignStudentsToHalaqah(eventId:string,studentIds:string[],targetHalaqahId:string,actorUserId?:string):Promise<BulkAssignResult>{return this.bulkRegisterAndAssignStudentsToHalaqah(eventId,studentIds,targetHalaqahId,actorUserId);}

  static async updateParticipantBaselineTarget(p: EventParticipant, actorUserId?: string): Promise<EventParticipant> {
    if (!isMockMode) return apiPost('updateParticipantTarget', { participant: p });
    const x=loadData<EventParticipant[]>(STORAGE_KEYS.PARTICIPANTS,INITIAL_PARTICIPANTS),idx=x.findIndex(i=>i.participant_id===p.participant_id);
    if(idx>=0){const old=x[idx];x[idx]={...p,updated_at:getCurrentIso()};saveData(STORAGE_KEYS.PARTICIPANTS,x);await this.addAuditLog('UPDATE_BASELINE_TARGET','PARTICIPANT',p.participant_id,JSON.stringify(old),JSON.stringify(p),undefined,actorUserId,p.event_id);}return p;
  }

  static async getSessionAssessments(eventId?: string): Promise<SessionAssessment[]> {
    if (!isMockMode) {
      const server = await apiPost<SessionAssessment[]>('getSessionAssessments', { eventId });
      return overlayPendingWritesOnAssessments(server || [], { eventId });
    }
    const x=loadData<SessionAssessment[]>(STORAGE_KEYS.ASSESSMENTS,INITIAL_ASSESSMENTS);return eventId?x.filter(a=>a.event_id===eventId&&!a.is_deleted):x.filter(a=>!a.is_deleted);
  }

  static async saveSessionAssessment(asm: SessionAssessment, actorUserId?: string): Promise<SessionAssessment> {
    if (!isMockMode) {
      removePendingAttendanceForAssessment(asm);
      const dedupeKey=`assessment:${asm.event_id}:${asm.participant_id}:${asm.session_config_id}`;
      const pending=enqueuePendingWrite('saveSessionAssessment',{assessment:asm},dedupeKey);
      try {
        const saved=await apiPost<SessionAssessment>('saveSessionAssessment',{assessment:asm});
        removePendingWrite(pending.id);this.clearWorkspaceCache();
        if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('rt_backend_data_changed',{detail:{source:'assessment-save',studentId:asm.student_id,sessionConfigId:asm.session_config_id}}));
        return saved;
      } catch(error:any) {
        updatePendingWriteError(pending.id,error);
        if(isRetryableSyncError(error)){console.warn('[Pending Sync] Assessment disimpan lokal dan akan disinkronkan ulang.',error);return {...asm,...({__pendingSync:true}as any)};}
        throw error;
      }
    }
    const x=loadData<SessionAssessment[]>(STORAGE_KEYS.ASSESSMENTS,INITIAL_ASSESSMENTS),idx=x.findIndex(a=>!a.is_deleted&&a.event_id===asm.event_id&&a.participant_id===asm.participant_id&&a.session_config_id===asm.session_config_id);
    if(idx>=0){const old=x[idx],upd={...old,...asm,assessment_id:old.assessment_id,updated_at:getCurrentIso()};x[idx]=upd;saveData(STORAGE_KEYS.ASSESSMENTS,x);await this.addAuditLog('UPDATE_ASSESSMENT','SESSION_ASSESSMENT',upd.assessment_id,JSON.stringify(old),JSON.stringify(upd),undefined,actorUserId||asm.teacher_id,asm.event_id);return upd;}
    x.push(asm);saveData(STORAGE_KEYS.ASSESSMENTS,x);await this.addAuditLog('CREATE_ASSESSMENT','SESSION_ASSESSMENT',asm.assessment_id,undefined,JSON.stringify(asm),undefined,actorUserId||asm.teacher_id,asm.event_id);return asm;
  }

  static async deleteSessionAssessment(assessmentId:string,deletedBy:string):Promise<void>{
    if(!isMockMode){await apiPost('deleteSessionAssessment',{assessmentId});return;}
    const x=loadData<SessionAssessment[]>(STORAGE_KEYS.ASSESSMENTS,INITIAL_ASSESSMENTS),idx=x.findIndex(a=>a.assessment_id===assessmentId);if(idx>=0){const old=x[idx];x[idx].is_deleted=true;x[idx].deleted_at=getCurrentIso();x[idx].deleted_by=deletedBy;saveData(STORAGE_KEYS.ASSESSMENTS,x);await this.addAuditLog('SOFT_DELETE_ASSESSMENT','SESSION_ASSESSMENT',assessmentId,JSON.stringify(old),JSON.stringify(x[idx]),undefined,deletedBy,old.event_id);}
  }

  static async bulkSaveSessionAttendance(sessionConfigId:string,studentIds:string[],attendanceStatus:'PRESENT'|'SICK'|'PERMISSION'|'ABSENT',actorUserId?:string):Promise<{success:boolean;updatedCount:number;updatedAssessments:SessionAssessment[]}> {
    if(!isMockMode){
      const ids=[...new Set(studentIds)].filter(Boolean);if(!ids.length)return{success:true,updatedCount:0,updatedAssessments:[]};
      enqueuePendingWrite('bulkSaveSessionAttendance',{sessionConfigId,studentIds:ids,attendanceStatus},`attendance:${sessionConfigId}:${ids.slice().sort().join(',')}`);
      void this.flushPendingWrites().catch(e=>console.warn('[Silent Attendance] Background sync tertunda:',e));
      return{success:true,updatedCount:ids.length,updatedAssessments:[]};
    }
    const scs=loadData<SessionConfig[]>(STORAGE_KEYS.SESSION_CONFIGS,INITIAL_SESSION_CONFIGS),sc=scs.find(x=>x.session_config_id===sessionConfigId);if(!sc)throw new Error('Konfigurasi sesi tidak ditemukan.');
    const parts=loadData<EventParticipant[]>(STORAGE_KEYS.PARTICIPANTS,INITIAL_PARTICIPANTS).filter(p=>p.event_id===sc.event_id),list=loadData<SessionAssessment[]>(STORAGE_KEYS.ASSESSMENTS,INITIAL_ASSESSMENTS),now=getCurrentIso();let updatedCount=0;const updatedAssessments:SessionAssessment[]=[];
    studentIds.forEach(sid=>{const p=parts.find(x=>x.student_id===sid);if(!p)return;const idx=list.findIndex(a=>!a.is_deleted&&a.event_id===sc.event_id&&a.participant_id===p.participant_id&&a.session_config_id===sessionConfigId),present=attendanceStatus==='PRESENT';
      if(idx>=0){const old=list[idx],hasQ=old.surah_start!=null&&old.lines_added!=null,hasN=(old.assessment_mode==='NURONIYYAH'||old.nuroniyyah_dars!=null)&&old.lines_added!=null,hasI=(old as any).iqra_level!=null&&(old as any).iqra_page_start!=null&&(old as any).iqra_page_end!=null&&(old as any).iqra_pages_added!=null;const upd={...old,attendance_status:attendanceStatus,assessment_status:present?((hasQ||hasN||hasI)?'COMPLETED':'PENDING'):'COMPLETED',event_day_id:sc.event_day_id,session_no:sc.session_no,halaqah_id:p.halaqah_id||old.halaqah_id,student_id:p.student_id,updated_at:now,is_deleted:false,...(present?{}:{surah_start:undefined,ayah_start:undefined,surah_end:undefined,ayah_end:undefined,lines_added:undefined,assessment_mode:undefined,nuroniyyah_dars:undefined,iqra_level:undefined,iqra_page_start:undefined,iqra_page_end:undefined,iqra_pages_added:undefined})} as any;list[idx]=upd;updatedAssessments.push(upd);updatedCount++;}
      else{const n={assessment_id:`ASM_${typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').substring(0,16):Math.random().toString(36).substring(2,12)}`,event_id:sc.event_id,event_day_id:sc.event_day_id,session_config_id:sc.session_config_id,participant_id:p.participant_id,student_id:p.student_id,halaqah_id:p.halaqah_id||'',session_no:sc.session_no,attendance_status:attendanceStatus,assessment_status:present?'PENDING':'COMPLETED',teacher_id:actorUserId||'',is_deleted:false,created_at:now,updated_at:now} as any;list.push(n);updatedAssessments.push(n);updatedCount++;}
    });
    saveData(STORAGE_KEYS.ASSESSMENTS,list);return{success:true,updatedCount,updatedAssessments};
  }

  static async getFinalEvaluations(eventId?:string):Promise<FinalEvaluation[]>{if(!isMockMode)return apiPost('getFinalEvaluations',{eventId});const x=loadData<FinalEvaluation[]>(STORAGE_KEYS.FINAL_EVALUATIONS,INITIAL_FINAL_EVALUATIONS);return eventId?x.filter(e=>e.event_id===eventId):x;}
  static async saveFinalEvaluation(fe:FinalEvaluation,actorUserId?:string):Promise<FinalEvaluation>{
    if(!isMockMode)return apiPost('saveFinalEvaluation',{finalEvaluation:fe});
    const x=loadData<FinalEvaluation[]>(STORAGE_KEYS.FINAL_EVALUATIONS,INITIAL_FINAL_EVALUATIONS),idx=x.findIndex(e=>e.event_id===fe.event_id&&(e.participant_id===fe.participant_id||e.student_id===fe.student_id));if(idx>=0){const old=x[idx],upd={...old,...fe,final_evaluation_id:old.final_evaluation_id,updated_at:getCurrentIso()};x[idx]=upd;saveData(STORAGE_KEYS.FINAL_EVALUATIONS,x);return upd;}x.push(fe);saveData(STORAGE_KEYS.FINAL_EVALUATIONS,x);return fe;
  }

  static async getAuditLogs():Promise<AuditLog[]>{return !isMockMode?apiPost('getAuditLogs'):loadData(STORAGE_KEYS.AUDIT_LOGS,INITIAL_AUDIT_LOGS);}
  static async addAuditLog(action:string,entityType:string,entityId:string,oldData?:string,newData?:string,notes?:string,actorUserId?:string,eventId?:string):Promise<void>{if(!isMockMode)return;const logs=await this.getAuditLogs();logs.unshift({log_id:`LOG${String(logs.length+1).padStart(6,'0')}`,timestamp:getCurrentIso(),user_id:actorUserId||'SYSTEM_USER',action,entity_type:entityType,entity_id:entityId,event_id:eventId,old_data_json:oldData,new_data_json:newData,notes});saveData(STORAGE_KEYS.AUDIT_LOGS,logs);}

  static async saveDraftLocal(draftKey:string,draftData:any):Promise<void>{const d=loadData<Record<string,any>>(STORAGE_KEYS.DRAFTS,{});d[draftKey]={data:draftData,timestamp:getCurrentIso()};saveData(STORAGE_KEYS.DRAFTS,d);}
  static async getDraftLocal(draftKey:string):Promise<any|null>{return loadData<Record<string,any>>(STORAGE_KEYS.DRAFTS,{})[draftKey]?.data||null;}
  static async clearDraftLocal(draftKey:string):Promise<void>{const d=loadData<Record<string,any>>(STORAGE_KEYS.DRAFTS,{});delete d[draftKey];saveData(STORAGE_KEYS.DRAFTS,d);}

  static async getMyHalaqahData(teacherId:string,eventId?:string,selectedHalaqahId?:string){
    if(!teacherId?.trim())return{halaqah:null,students:[],sessions:[],assessments:[],sessionConfigs:[]};
    if(!isMockMode){const server=await apiPost<any>('getMyHalaqahData',{teacherId,eventId,selectedHalaqahId});return applyPendingOverlayToWorkspace(server);}
    const evt=eventId?(await this.getEvents()).find(e=>e.event_id===eventId):await this.getCurrentEvent();if(!evt?.event_id)return{halaqah:null,students:[],sessions:[],assessments:[],sessionConfigs:[]};
    const [hs,hts,teachers,parts,students,asms,evals,configs]=await Promise.all([this.getHalaqahList(evt.event_id),this.getHalaqahTeachers(evt.event_id),this.getTeachers(),this.getEventParticipants(evt.event_id),this.getStudents(),this.getSessionAssessments(evt.event_id),this.getFinalEvaluations(evt.event_id),this.getSessionConfigs(evt.event_id)]);
    const assign=hts.find(h=>h.teacher_id===teacherId&&h.active),h=assign?hs.find(x=>x.halaqah_id===assign.halaqah_id&&x.active):null;if(!h)return{halaqah:null,students:[],sessions:[],assessments:[],sessionConfigs:[]};
    const hparts=parts.filter(p=>p.halaqah_id===h.halaqah_id),ids=new Set(hparts.map(p=>p.student_id)),hasms=asms.filter(a=>a.halaqah_id===h.halaqah_id||ids.has(a.student_id));
    const mapped=hparts.map(p=>{const st=students.find(s=>s.student_id===p.student_id),fe=evals.find(e=>e.student_id===p.student_id||e.participant_id===p.participant_id);let zi=0,nur=0,iqra=0;hasms.filter(a=>a.student_id===p.student_id&&a.attendance_status==='PRESENT').forEach(a=>{const m=String(a.assessment_mode||'').toUpperCase();if(m==='IQRA')iqra+=Number((a as any).iqra_pages_added)||0;else if(m==='NURONIYYAH')nur+=Number(a.lines_added)||0;else zi+=Number(a.lines_added)||0;});return{student_id:p.student_id,participant_id:p.participant_id,nis:st?.nis||'',full_name:st?.full_name||'Siswa',access_code:st?.access_code||'',grade_class:`${p.grade_snapshot} (${p.class_snapshot})`,skill_status_start:p.skill_status_start?String(p.skill_status_start).toUpperCase().trim() as SkillStatus:undefined,target_lines:p.target_lines,target_nuroniyyah_lines:p.target_nuroniyyah_lines,target_iqra_pages:p.target_iqra_pages,target_source:p.target_source,targetText:formatParticipantTarget(p,h),totalLinesAdded:zi,totalZiyadahLinesAdded:zi,totalNuroniyyahLinesAdded:nur,totalIqraPagesAdded:iqra,completionStatus:fe?fe.completion_status:'NOT_EVALUATED'};});
    const teacher=teachers.find(t=>t.teacher_id===teacherId),sessionConfigs=h.session_group_id?configs.filter(c=>c.session_group_id===h.session_group_id):configs;return{event:evt,halaqah:{halaqah_id:h.halaqah_id,group_name:h.halaqah_name,teacher_name:teacher?.full_name||'Guru Tahfidz',session_group_id:h.session_group_id},students:mapped,sessions:hasms,assessments:hasms,sessionConfigs};
  }

  static async submitSessionAssessment(payload:any,actorUserId?:string){
    if(!payload.student_id&&!payload.participant_id)throw new Error('Siswa / Peserta wajib dipilih.');
    const evt=payload.event_id?(await this.getEvents()).find(e=>e.event_id===payload.event_id):await this.getCurrentEvent(),event_id=evt?.event_id;if(!event_id)throw new Error('Event aktif tidak ditemukan.');
    const participant=(await this.getEventParticipants(event_id)).find(p=>(payload.participant_id&&p.participant_id===payload.participant_id)||(payload.student_id&&p.student_id===payload.student_id));if(!participant)throw new Error('Siswa tidak terdaftar sebagai peserta aktif pada kegiatan ini.');
    const configs=await this.getSessionConfigs(event_id);let matching=payload.session_config_id?configs.find(sc=>sc.session_config_id===payload.session_config_id):null;if(!matching&&payload.session_no)matching=configs.find(sc=>sc.session_no===Number(payload.session_no)&&(participant.session_group_id?sc.session_group_id===participant.session_group_id:true))||configs.find(sc=>sc.session_no===Number(payload.session_no));if(!matching)throw new Error(`Pengaturan sesi #${payload.session_no||1} tidak ditemukan untuk grup sesi ini.`);
    const teacherId=(payload.teacher_id||'').trim();if(isMockMode&&!teacherId)throw new Error('ID Guru (teacher_id) wajib diisi.');
    const attendanceStatus:AttendanceStatus=payload.attendance_status||payload.attendance||'UNASSESSED';
    let surah_start:number|undefined,ayah_start:number|undefined,surah_end:number|undefined,ayah_end:number|undefined,lines_added:number|undefined,assessment_mode:AssessmentMode|undefined,nuroniyyah_dars:string|undefined,iqra_level:number|undefined,iqra_page_start:number|undefined,iqra_page_end:number|undefined,iqra_pages_added:number|undefined;

    if(attendanceStatus==='PRESENT'){
      const explicitMode=String(payload.assessment_mode||'').trim().toUpperCase() as AssessmentMode|'';
      const rawLines=payload.lines_added??payload.totalLines;
      const ss=payload.surah_start??payload.start_surah;
      const as=payload.ayah_start??payload.start_ayah;
      const se=payload.surah_end??payload.end_surah;
      const ae=payload.ayah_end??payload.end_ayah;
      const dars=payload.nuroniyyah_dars;
      const l=payload.iqra_level??payload.iqraLevel;
      const ps=payload.iqra_page_start??payload.iqraPageStart;
      const pe=payload.iqra_page_end??payload.iqraPageEnd;
      const pa=payload.iqra_pages_added??payload.iqraPagesAdded??payload.totalPages;

      // Attendance may be stored without setoran.
      // Auto-suggested start fields do not count as a setoran by themselves.
      const hasZiyadahInput=(rawLines!=null&&rawLines!=='')||(ae!=null&&ae!=='');
      const hasNuroniyyahInput=rawLines!=null&&rawLines!=='';
      const hasIqraInput=(pe!=null&&pe!=='')||(pa!=null&&pa!=='');

      let hasSetoranInput=false;
      if(explicitMode==='NURONIYYAH')hasSetoranInput=hasNuroniyyahInput;
      else if(explicitMode==='IQRA')hasSetoranInput=hasIqraInput;
      else if(explicitMode==='ZIYADAH')hasSetoranInput=hasZiyadahInput;
      else hasSetoranInput=hasIqraInput||hasNuroniyyahInput||hasZiyadahInput;

      if(hasSetoranInput){
        const mode:AssessmentMode=explicitMode==='NURONIYYAH'||explicitMode==='IQRA'||explicitMode==='ZIYADAH'
          ? explicitMode
          : (dars?'NURONIYYAH':((l!=null&&l!=='')||(ps!=null&&ps!=='')||(pe!=null&&pe!==''))?'IQRA':'ZIYADAH');
        assessment_mode=mode;

        if(mode==='NURONIYYAH'){
          if(!dars||!String(dars).trim())throw new Error('Untuk status HADIR pada mode Nuroniyyah, data Ad-Dars wajib dipilih.');
          if(rawLines==null||rawLines===''||isNaN(Number(rawLines)))throw new Error('Untuk status HADIR, jumlah baris (lines_added) wajib diisi.');
          nuroniyyah_dars=String(dars);lines_added=Number(rawLines);
          if(!Number.isFinite(lines_added)||lines_added<0)throw new Error('Jumlah baris Nuroniyyah harus berupa angka 0 atau lebih.');
        }else if(mode==='IQRA'){
          if(l==null||l==='')throw new Error('Untuk mode Iqra, Jilid wajib dipilih.');
          if(ps==null||ps==='')throw new Error('Untuk mode Iqra, Halaman Awal wajib diisi.');
          if(pe==null||pe==='')throw new Error('Untuk mode Iqra, Halaman Akhir wajib diisi.');
          if(pa==null||pa==='')throw new Error('Untuk mode Iqra, Penambahan Halaman wajib diisi.');
          iqra_level=Number(l);iqra_page_start=Number(ps);iqra_page_end=Number(pe);iqra_pages_added=Number(pa);
          if(!Number.isFinite(iqra_level)||iqra_level<1||iqra_level>6)throw new Error('Jilid Iqra harus antara 1 sampai 6.');
          if(!Number.isFinite(iqra_page_start)||iqra_page_start<1)throw new Error('Halaman Awal Iqra tidak valid.');
          if(!Number.isFinite(iqra_page_end)||iqra_page_end<1)throw new Error('Halaman Akhir Iqra tidak valid.');
          if(!Number.isFinite(iqra_pages_added)||iqra_pages_added<0)throw new Error('Penambahan Halaman Iqra tidak valid.');
          lines_added=undefined;nuroniyyah_dars=undefined;
        }else{
          if(ss==null||ss===''||as==null||as===''||se==null||se===''||ae==null||ae==='')throw new Error('Untuk status HADIR pada mode Hafalan Al-Qur\'an, data Surah dan Ayat (awal & akhir) wajib diisi.');
          if(rawLines==null||rawLines===''||isNaN(Number(rawLines)))throw new Error('Untuk status HADIR, jumlah baris (lines_added) wajib diisi.');
          surah_start=Number(ss);ayah_start=Number(as);surah_end=Number(se);ayah_end=Number(ae);lines_added=Number(rawLines);
          if(!Number.isFinite(surah_start)||!Number.isFinite(ayah_start)||!Number.isFinite(surah_end)||!Number.isFinite(ayah_end)||!Number.isFinite(lines_added)||lines_added<0)throw new Error('Data Hafalan Al-Qur\'an mengandung angka yang tidak valid.');
        }
      }
      // No setoran input: assessment_mode and all progress fields stay undefined.
      // Backend will save PRESENT + PENDING attendance only.
    }

    const asm={assessment_id:`ASM-${Date.now()}-${Math.random().toString(36).substring(2,6)}`,event_id,event_day_id:matching.event_day_id,session_config_id:matching.session_config_id,participant_id:participant.participant_id,student_id:participant.student_id,halaqah_id:participant.halaqah_id,session_no:matching.session_no,attendance_status:attendanceStatus,assessment_mode,nuroniyyah_dars,iqra_level,iqra_page_start,iqra_page_end,iqra_pages_added,surah_start,ayah_start,surah_end,ayah_end,lines_added,session_note:payload.notes||payload.session_note||'',teacher_id:teacherId,is_deleted:false,created_at:getCurrentIso(),updated_at:getCurrentIso()} as any as SessionAssessment;
    return this.saveSessionAssessment(asm,actorUserId||teacherId);
  }

  static async submitFinalEvaluation(payload:any,actorUserId?:string){
    if(!payload.student_id&&!payload.participant_id)throw new Error('Siswa / Peserta wajib dipilih.');const evt=payload.event_id?(await this.getEvents()).find(e=>e.event_id===payload.event_id):await this.getCurrentEvent(),event_id=evt?.event_id;if(!event_id)throw new Error('Event aktif tidak ditemukan.');const p=(await this.getEventParticipants(event_id)).find(x=>(payload.participant_id&&x.participant_id===payload.participant_id)||(payload.student_id&&x.student_id===payload.student_id));if(!p)throw new Error('Siswa tidak terdaftar sebagai peserta aktif pada kegiatan ini.');const teacherId=(payload.evaluator_teacher_id||payload.teacher_id||'').trim();if(isMockMode&&!teacherId)throw new Error('ID Guru Evaluator (evaluator_teacher_id) wajib diisi.');if(!payload.completion_status||payload.completion_status==='NOT_EVALUATED')throw new Error('Status ketuntasan (completion_status) wajib diisi.');if(!payload.skill_status_end)throw new Error('Kategori skill akhir (skill_status_end) wajib diisi.');
    const ss=payload.evaluation_surah_start??payload.start_surah,as=payload.evaluation_ayah_start??payload.start_ayah,se=payload.evaluation_surah_end??payload.end_surah,ae=payload.evaluation_ayah_end??payload.end_ayah,skill=String(payload.skill_status_end).toUpperCase();if((skill==='BBL'||skill==='BBLS')&&(ss==null||as==null||se==null||ae==null))throw new Error('Jangkauan Surah dan Ayat evaluasi akhir wajib diisi.');
    const fe={final_evaluation_id:`FEVAL-${Date.now()}-${Math.random().toString(36).substring(2,6)}`,event_id,participant_id:p.participant_id,student_id:p.student_id,evaluation_surah_start:ss!=null?Number(ss):undefined,evaluation_ayah_start:as!=null?Number(as):undefined,evaluation_surah_end:se!=null?Number(se):undefined,evaluation_ayah_end:ae!=null?Number(ae):undefined,final_score:payload.final_score!=null&&payload.final_score!==''?Number(payload.final_score):undefined,completion_status:payload.completion_status as CompletionStatus,skill_status_end:payload.skill_status_end as SkillStatus,affective_rating:payload.affective_rating||undefined,affective_note:payload.affective_note||'',final_note:payload.evaluator_notes||payload.final_note||'',evaluator_teacher_id:teacherId,created_at:getCurrentIso(),updated_at:getCurrentIso()} as any as FinalEvaluation;return this.saveFinalEvaluation(fe,actorUserId||teacherId);
  }

  static async getAdminOverview(eventId?: string) {
    if (!isMockMode) return apiPost<any>('getAdminOverview', { eventId });
    const activeEvt = eventId ? (await this.getEvents()).find(e => e.event_id === eventId) : await this.getCurrentEvent();
    const event_id = activeEvt?.event_id;
    if (!event_id) return { activeEvent: null, metrics: { totalStudents: 0, totalHalaqahs: 0, inputCompletionRate: 0 }, teachersProgress: [], anomalies: [] };
    const [participants,halaqahs,assessments,sessionConfigs,halaqahTeachers,teachers,students]=await Promise.all([this.getEventParticipants(event_id),this.getHalaqahList(event_id),this.getSessionAssessments(event_id),this.getSessionConfigs(event_id),this.getHalaqahTeachers(event_id),this.getTeachers(),this.getStudents()]);
    let expected=0;participants.forEach(p=>{if(p.session_group_id)expected+=sessionConfigs.filter(sc=>sc.active&&sc.session_group_id===p.session_group_id).length;});
    const teachersProgress=halaqahTeachers.filter(ht=>ht.active).map(ht=>{const t=teachers.find(x=>x.teacher_id===ht.teacher_id),h=halaqahs.find(x=>x.halaqah_id===ht.halaqah_id),parts=participants.filter(p=>p.halaqah_id===ht.halaqah_id);let exp=0;parts.forEach(p=>{if(p.session_group_id)exp+=sessionConfigs.filter(sc=>sc.active&&sc.session_group_id===p.session_group_id).length;});const act=assessments.filter(a=>a.halaqah_id===ht.halaqah_id).length;return{teacherName:t?.full_name||'Guru Tahfidz',groupName:h?.halaqah_name||'Halaqah',completedSessions:act,totalSessions:exp,percentage:exp>0?Math.min(100,Math.round(act/exp*100)):100};});
    const anomalies:any[]=[];assessments.forEach(a=>{if(String(a.assessment_mode||'').toUpperCase()!=='ZIYADAH')return;const lines=Number(a.lines_added)||0;if(lines>40){const s=students.find(x=>x.student_id===a.student_id);anomalies.push({studentName:s?.full_name||'Siswa',sessionNo:a.session_no,description:`Setoran melampaui ${lines} baris dalam 1 sesi (perlu verifikasi)`});}});
    return{activeEvent:activeEvt,metrics:{totalStudents:participants.length,totalHalaqahs:halaqahs.length,inputCompletionRate:expected>0?Math.min(100,Number((assessments.length/expected*100).toFixed(1))):0},teachersProgress,anomalies};
  }

  static async getCompletenessReport(eventId?: string) {
    if (!isMockMode) return apiPost<any>('getCompletenessReport', { eventId });
    const evt=eventId?(await this.getEvents()).find(e=>e.event_id===eventId):await this.getCurrentEvent(),id=evt?.event_id;
    if(!id)return{event:null,counts:{totalParticipants:0,withoutHalaqahCount:0,withoutSessionGroupCount:0,withoutBaselineCount:0,withoutTargetCount:0,withoutFinalEvalCount:0},issues:{withoutHalaqah:[],withoutSessionGroup:[],withoutBaseline:[],withoutTarget:[],withoutFinalEval:[]},halaqahReports:[]};
    const [parts,students,hs,asms,evals,configs]=await Promise.all([this.getEventParticipants(id),this.getStudents(),this.getHalaqahList(id),this.getSessionAssessments(id),this.getFinalEvaluations(id),this.getSessionConfigs(id)]);
    const withoutHalaqah=parts.filter(p=>!p.halaqah_id),withoutSessionGroup=parts.filter(p=>!p.session_group_id),withoutBaseline=parts.filter(p=>{const s=String(p.skill_status_start||'').toUpperCase();return(s==='BBL'||s==='BBLS')&&(p.baseline_surah==null||p.baseline_ayah==null);}),withoutTarget=parts.filter(p=>{const h=hs.find(x=>x.halaqah_id===p.halaqah_id),t=getEffectiveTargets(p,h);return t.ziyadahLines==null&&t.nuroniyyahLines==null;}),withoutFinalEval=parts.filter(p=>!evals.some(e=>e.student_id===p.student_id||e.participant_id===p.participant_id));
    const mapIssue=(p:EventParticipant)=>({student_id:p.student_id,name:students.find(s=>s.student_id===p.student_id)?.full_name||'Siswa',class:`${p.grade_snapshot||''} (${p.class_snapshot||''})`});
    const halaqahReports=hs.map(h=>{const hp=parts.filter(p=>p.halaqah_id===h.halaqah_id);let exp=0;hp.forEach(p=>{if(p.session_group_id)exp+=configs.filter(c=>c.active&&c.session_group_id===p.session_group_id).length;});const act=asms.filter(a=>a.halaqah_id===h.halaqah_id).length;return{halaqah_id:h.halaqah_id,halaqah_name:h.halaqah_name,studentCount:hp.length,submittedSessions:act,expectedSessions:exp,missingCount:Math.max(0,exp-act),percentage:exp>0?Math.min(100,Math.round(act/exp*100)):0};});
    return{event:evt,counts:{totalParticipants:parts.length,withoutHalaqahCount:withoutHalaqah.length,withoutSessionGroupCount:withoutSessionGroup.length,withoutBaselineCount:withoutBaseline.length,withoutTargetCount:withoutTarget.length,withoutFinalEvalCount:withoutFinalEval.length},issues:{withoutHalaqah:withoutHalaqah.map(mapIssue),withoutSessionGroup:withoutSessionGroup.map(mapIssue),withoutBaseline:withoutBaseline.map(mapIssue),withoutTarget:withoutTarget.map(mapIssue),withoutFinalEval:withoutFinalEval.map(mapIssue)},halaqahReports};
  }

  static async getExecutiveAnalytics(params:{academicYearFilter?:string;eventId?:string;analyticsMode?:'SINGLE'|'ANNUAL'|'COHORT'|'SKILL';gradeFilter?:string;genderFilter?:string;halaqahFilter?:string;}) {
    if(!isMockMode)return apiPost<any>('getExecutiveAnalytics',params);
    const events=(await this.getEvents()).filter(e=>!params.academicYearFilter||params.academicYearFilter==='ALL'||e.academic_year===params.academicYearFilter),students=await this.getStudents(),studentMap=new Map(students.map(s=>[s.student_id,s]));
    const filterParts=(parts:EventParticipant[])=>parts.filter(p=>{const s=studentMap.get(p.student_id);if(!s)return false;if(params.gradeFilter&&params.gradeFilter!=='ALL'&&p.grade_snapshot!==params.gradeFilter&&s.grade_level!==params.gradeFilter)return false;if(params.genderFilter&&params.genderFilter!=='ALL'&&s.gender!==params.genderFilter)return false;if(params.halaqahFilter&&params.halaqahFilter!=='ALL'&&p.halaqah_id!==params.halaqahFilter)return false;return true;});
    let cohort:Set<string>|null=null;if(params.analyticsMode==='COHORT'){const sets=await Promise.all(events.map(async e=>new Set(filterParts(await this.getEventParticipants(e.event_id)).map(p=>p.student_id))));cohort=sets.length?new Set([...sets[0]].filter(id=>sets.every(s=>s.has(id)))):new Set();}
    const target=params.eventId?(events.find(e=>e.event_id===params.eventId)||(await this.getEvents()).find(e=>e.event_id===params.eventId)):await this.getCurrentEvent();
    const compute=async(id:string)=>{let parts=filterParts(await this.getEventParticipants(id));if(cohort)parts=parts.filter(p=>cohort!.has(p.student_id));const asms=await this.getSessionAssessments(id),evals=await this.getFinalEvaluations(id),map=new Map<string,SessionAssessment[]>();asms.filter(a=>!a.is_deleted).forEach(a=>map.set(a.student_id,[...(map.get(a.student_id)||[]),a]));const vals:number[]=[];let missing=0;parts.forEach(p=>{const arr=(map.get(p.student_id)||[]).filter(a=>a.attendance_status==='PRESENT'&&String(a.assessment_mode||'').toUpperCase()==='ZIYADAH');if(arr.length)vals.push(arr.reduce((s,a)=>s+(Number(a.lines_added)||0),0));else missing++;});const stats=calculateStats(vals),dist=getDistributionBuckets(vals),skillMap:Record<string,SkillStatus>={},comp=new Map<string,CompletionStatus>();evals.forEach(e=>{skillMap[e.student_id]=e.skill_status_end;skillMap[e.participant_id]=e.skill_status_end;comp.set(e.student_id,e.completion_status);comp.set(e.participant_id,e.completion_status);});let evaluated=0,notEval=0,complete=0,incomplete=0;parts.forEach(p=>{const c=comp.get(p.student_id)||comp.get(p.participant_id);if(c){evaluated++;if(c==='COMPLETE')complete++;else incomplete++;}else notEval++;});const coverage=parts.length?Number((evaluated/parts.length*100).toFixed(1)):0,rate=evaluated?Number((complete/evaluated*100).toFixed(1)):0;stats.completionRate=rate;const tr=calculateSkillTransitions(parts,skillMap);return{participantCount:parts.length,validProgressCount:vals.length,missingProgressCount:missing,evaluatedCount:evaluated,notEvaluatedCount:notEval,evaluationCoverage:coverage,completedCount:complete,incompleteCount:incomplete,completionRateAmongEvaluated:rate,stats,distributionBuckets:dist,skillTransitions:tr.transitions,notEvaluatedSkillCount:tr.notEvaluatedSkillCount,participants:parts};};
    const sorted=[...events].sort((a,b)=>a.sequence_no-b.sequence_no);
    if(params.analyticsMode==='ANNUAL'||params.analyticsMode==='COHORT'){const series=await Promise.all(sorted.map(async e=>{const m=await compute(e.event_id);return{eventId:e.event_id,eventName:e.event_name,academicYear:e.academic_year,sequenceNo:e.sequence_no,participantCount:m.participantCount,validProgressCount:m.validProgressCount,missingProgressCount:m.missingProgressCount,evaluatedCount:m.evaluatedCount,completedCount:m.completedCount,incompleteCount:m.incompleteCount,evaluationCoverage:m.evaluationCoverage,completionRateAmongEvaluated:m.completionRateAmongEvaluated,stats:m.stats,totalLines:m.stats.totalLines,meanLines:m.stats.mean,medianLines:m.stats.median,stdDev:m.stats.stdDev,cv:m.stats.cv};}));if(params.analyticsMode==='ANNUAL')return{mode:'ANNUAL',eventsCount:sorted.length,annualData:series};const tm=target?.event_id?await compute(target.event_id):{};return{mode:'COHORT',eventsCount:sorted.length,cohortSize:cohort?.size||0,cohortData:series,event:target,...tm};}
    if(!target?.event_id)return{mode:params.analyticsMode||'SINGLE',event:null,participantCount:0,validProgressCount:0,missingProgressCount:0,evaluatedCount:0,notEvaluatedCount:0,evaluationCoverage:0,completedCount:0,incompleteCount:0,completionRateAmongEvaluated:0,stats:calculateStats([]),distributionBuckets:[],skillTransitions:[],notEvaluatedSkillCount:0,cohortSize:cohort?.size||0};
    return{mode:params.analyticsMode||'SINGLE',event:target,...await compute(target.event_id),cohortSize:cohort?.size||0};
  }

  static async getStudentPublicProgress(input:string|{accessCode:string;nis?:string},eventId?:string){
    let access='',nis='';if(typeof input==='object'&&input){access=(input.accessCode||'').trim();nis=(input.nis||'').trim();}else access=String(input||'').trim();if(!access)return{success:false,message:'Kode Akses wajib diisi untuk melihat perkembangan siswa.'};
    if(!isMockMode){try{return{success:true,...await apiPost<any>('publicStudentProgress',{accessCode:access,eventId})};}catch(e:any){return{success:false,message:e.message||'Kode Akses siswa tidak ditemukan.'};}}
    const students=await this.getStudents(),s=students.find(x=>x.access_code.toLowerCase()===access.toLowerCase());if(!s)return{success:false,message:'Kode Akses siswa tidak ditemukan. Periksa kembali penulisan kode Anda.'};if(nis&&s.nis.toLowerCase()!==nis.toLowerCase())return{success:false,message:'Kombinasi NIS dan Kode Akses tidak cocok.'};const evt=eventId?(await this.getEvents()).find(e=>e.event_id===eventId):await this.getCurrentEvent();if(!evt?.event_id)return{success:false,message:'Kegiatan tidak aktif atau tidak ditemukan.'};const p=(await this.getEventParticipants(evt.event_id)).find(x=>x.student_id===s.student_id);if(!p)return{success:false,message:`Siswa tidak terdaftar sebagai peserta pada kegiatan ${evt.event_name}.`};const asms=(await this.getSessionAssessments(evt.event_id)).filter(a=>a.student_id===s.student_id&&!a.is_deleted).sort((a,b)=>a.session_no-b.session_no),evals=await this.getFinalEvaluations(evt.event_id),fe=evals.find(e=>e.student_id===s.student_id||e.participant_id===p.participant_id),h=(await this.getHalaqahList(evt.event_id)).find(x=>x.halaqah_id===p.halaqah_id),target=getEffectiveTargets(p,h),base=p.baseline_surah?getSurahByNo(p.baseline_surah):null;
    const zi=asms.filter(a=>a.attendance_status==='PRESENT'&&String(a.assessment_mode||'').toUpperCase()==='ZIYADAH').reduce((sum,a)=>sum+(Number(a.lines_added)||0),0),nur=asms.filter(a=>a.attendance_status==='PRESENT'&&String(a.assessment_mode||'').toUpperCase()==='NURONIYYAH').reduce((sum,a)=>sum+(Number(a.lines_added)||0),0),iqra=asms.filter(a=>a.attendance_status==='PRESENT'&&String(a.assessment_mode||'').toUpperCase()==='IQRA').reduce((sum,a)=>sum+(Number((a as any).iqra_pages_added)||0),0);
    return{success:true,studentName:s.full_name,nis:s.nis,gradeClass:`${p.grade_snapshot} (${p.class_snapshot})`,eventName:evt.event_name||'Rumah Tahfidz',baselineText:base?`${base.surah_name} (Ayat 1–${p.baseline_ayah||1})`:'Belum diisi',targetText:target.displayText,totalLinesAdded:zi,totalZiyadahLinesAdded:zi,totalNuroniyyahLinesAdded:nur,totalIqraPagesAdded:iqra,completionStatus:fe?fe.completion_status:'NOT_EVALUATED',sessions:asms.map(a=>({sessionNo:a.session_no,attendance:a.attendance_status,assessment_mode:a.assessment_mode,assessmentMode:a.assessment_mode,nuroniyyah_dars:a.nuroniyyah_dars,nuroniyyahDars:a.nuroniyyah_dars,surahName:a.surah_start?getSurahByNo(a.surah_start)?.surah_name||`Surah #${a.surah_start}`:null,ayahRange:a.ayah_start!=null&&a.ayah_end!=null?`${a.ayah_start}–${a.ayah_end}`:null,linesAdded:a.lines_added??null,iqraLevel:(a as any).iqra_level,iqraPageStart:(a as any).iqra_page_start,iqraPageEnd:(a as any).iqra_page_end,iqraPagesAdded:(a as any).iqra_pages_added}))};
  }

  static async generateSmartHalaqahProposal(eventId:string,config:{maxGroupSize?:number;balanceGender?:boolean;balanceSkill?:boolean}){
    const parts=await this.getEventParticipants(eventId),students=await this.getStudents(),max=config.maxGroupSize||8,groups:any[]=[];let i=1;
    const build=(gender:'IKHWAN'|'AKHWAT')=>{const list=parts.filter(p=>students.find(s=>s.student_id===p.student_id)?.gender===gender);for(let n=0;n<list.length;n+=max){const slice=list.slice(n,n+max);groups.push({id:`PROP-${gender==='IKHWAN'?'IKH':'AKH'}-${i}`,name:`Halaqah Proposal ${i} (${gender==='IKHWAN'?'Ikhwan':'Akhwat'})`,gender,studentCount:slice.length,students:slice.map(p=>({student_id:p.student_id,name:students.find(s=>s.student_id===p.student_id)?.full_name||'Siswa',skill:p.skill_status_start}))});i++;}};build('IKHWAN');build('AKHWAT');return{totalStudents:parts.length,maxGroupSize:max,totalProposedGroups:groups.length,proposedGroups:groups};
  }
}

if (typeof window !== 'undefined') {
  // Bangunkan GAS 0.5 detik setelah frontend mulai hidup.
  // Ini non-blocking; user tidak perlu menunggu prewarm selesai.
  window.setTimeout(() => {
    void ApiService.warmBackend();
  }, 500);

  window.addEventListener('online', () => {
    // Saat internet kembali, bangunkan backend lalu
    // jalankan pending sync seperti sebelumnya.
    void ApiService.warmBackend();

    void ApiService.flushPendingWrites().catch(
      error =>
        console.warn(
          '[Pending Sync] Auto-sync setelah online gagal:',
          error
        )
    );
  });
}