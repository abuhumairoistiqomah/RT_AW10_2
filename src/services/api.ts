import {
  AppConfig, Lookup, Student, Teacher, User, Event, EventDay,
  SessionGroup, SessionConfig, Halaqah, HalaqahTeacher,
  EventParticipant, SessionAssessment, FinalEvaluation, AuditLog,
  SummaryStats, DistributionBucket, SkillTransition, SkillStatus,
  CompletionStatus, EvaluationState, AttendanceStatus, BulkAssignResult,
  StudentPlacementBootstrap, PlacementStudent, TeacherWorkspaceBootstrap,
  TeacherStudentSummary
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
import { formatParticipantTarget } from '../utils/targetUtils';

// Read Environment Variables & Runtime Database Connection
const DEFAULT_API_URL =
  'https://script.google.com/macros/s/AKfycbwtfcT21Q-Uq1Mwp1HoIlCSkIkc8AlghuKLTKS8vXNSt_MX0K5uIEBP8t7qT2wMZCXs4g/exec';

export function resolveApiUrl(): string {
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('rt_api_url_override');
    if (override && override.trim() !== '') {
      return override.trim();
    }
  }
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '' && !envUrl.includes('YOUR_DEPLOYMENT_ID')) {
    return envUrl.trim();
  }
  return DEFAULT_API_URL || '';
}

export function getRuntimeApiUrl(): string {
  return resolveApiUrl();
}

export function setRuntimeApiUrl(url: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('rt_api_url_override', (url || '').trim());
  }
}

export function clearRuntimeApiUrl(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('rt_api_url_override');
  }
}

export function validateApiUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'URL Google Apps Script wajib diisi.' };
  }
  if (!trimmed.startsWith('https://')) {
    return { valid: false, error: 'URL harus menggunakan protokol aman HTTPS (https://).' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== 'script.google.com') {
      return { valid: false, error: 'Host domain URL harus script.google.com.' };
    }
    if (!parsed.pathname.includes('/macros/s/')) {
      return { valid: false, error: 'Format URL Web App harus memiliki path /macros/s/.' };
    }
    const pathWithoutQuery = trimmed.split('?')[0];
    if (!pathWithoutQuery.endsWith('/exec')) {
      return { valid: false, error: 'URL Google Apps Script Web App harus diakhiri dengan /exec.' };
    }
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: 'Format URL tidak valid: ' + (e.message || 'Error parsing URL') };
  }
}

const isMockMode =
  import.meta.env.VITE_USE_MOCK_DATA === 'true';

// Local storage keys
const STORAGE_KEYS = {
  CONFIGS: 'rt_lms_configs',
  LOOKUPS: 'rt_lms_lookups',
  STUDENTS: 'rt_lms_students',
  TEACHERS: 'rt_lms_teachers',
  USERS: 'rt_lms_users',
  EVENTS: 'rt_lms_events',
  EVENT_DAYS: 'rt_lms_event_days',
  SESSION_GROUPS: 'rt_lms_session_groups',
  SESSION_CONFIGS: 'rt_lms_session_configs',
  HALAQAH: 'rt_lms_halaqah',
  HALAQAH_TEACHERS: 'rt_lms_halaqah_teachers',
  PARTICIPANTS: 'rt_lms_participants',
  ASSESSMENTS: 'rt_lms_assessments',
  FINAL_EVALUATIONS: 'rt_lms_final_evaluations',
  AUDIT_LOGS: 'rt_lms_audit_logs',
  DRAFTS: 'rt_lms_drafts',
  USER: 'rt_current_user',
  AUTH_TOKEN: 'rt_auth_token',
  SESSIONS: 'rt_lms_sessions'
};

function getAuthToken(): string {
  return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
}

function setAuthToken(token: string): void {
  if (token) {
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  } else {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  }
}

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: User | null): void {
  if (user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.USER);
  }
}

function notifyAuthExpired(): void {
  setAuthToken('');
  setStoredUser(null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rt_auth_expired', {
      detail: { message: 'Sesi login telah berakhir. Silakan masuk kembali.' }
    }));
  }
}

// Remote API helpers
let isRevalidatingAuth = false;

async function apiGet<T>(action: string, params: Record<string, string | undefined> = {}, customUrl?: string, retryCount = 0): Promise<T> {
  const targetUrl = (customUrl || resolveApiUrl()).trim();
  if (!targetUrl || targetUrl.includes('YOUR_DEPLOYMENT_ID')) {
    throw new Error('Konfigurasi URL Google Apps Script belum diatur. Silakan atur URL di pengaturan database.');
  }

  const queryParams = new URLSearchParams();
  queryParams.append('action', action);

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      queryParams.append(k, v);
    }
  });

  const url = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}${queryParams.toString()}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP Error ${res.status}: Gagal terhubung ke backend server.`);
  }

  const json = await res.json();
  if (!json.success) {
    const isAuthErr = json.error?.code === 'AUTH_REQUIRED' || 
                      json.error?.message?.includes('AUTH_REQUIRED') ||
                      json.error?.message?.includes('Sesi login telah berakhir');

    if (isAuthErr && action !== 'validateSession' && action !== 'login' && retryCount === 0 && getAuthToken()) {
      if (!isRevalidatingAuth) {
        isRevalidatingAuth = true;
        try {
          const valRes = await ApiService.validateSession();
          isRevalidatingAuth = false;
          if (valRes && valRes.valid) {
            return await apiGet<T>(action, params, customUrl, retryCount + 1);
          }
        } catch {
          isRevalidatingAuth = false;
        }
      }
      notifyAuthExpired();
    }
    throw new Error(json.error?.message || 'Gagal mengambil data dari Google Apps Script backend.');
  }

  return json.data as T;
}

async function apiPost<T>(action: string, payload: any = {}, customUrl?: string, retryCount = 0): Promise<T> {
  const targetUrl = (customUrl || resolveApiUrl()).trim();
  if (!targetUrl || targetUrl.includes('YOUR_DEPLOYMENT_ID')) {
    throw new Error('Konfigurasi URL Google Apps Script belum diatur. Silakan atur URL di pengaturan database.');
  }

  const token = getAuthToken();
  const body = JSON.stringify({
    action,
    payload,
    authToken: token
  });

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body
  });

  if (!res.ok) {
    throw new Error(`HTTP Error ${res.status}: Gagal terhubung ke backend server.`);
  }

  const json = await res.json();
  if (!json.success) {
    const isAuthErr = json.error?.code === 'AUTH_REQUIRED' || 
                      json.error?.message?.includes('AUTH_REQUIRED') ||
                      json.error?.message?.includes('Sesi login telah berakhir');

    if (isAuthErr && action !== 'validateSession' && action !== 'login' && retryCount === 0 && token) {
      if (!isRevalidatingAuth) {
        isRevalidatingAuth = true;
        try {
          const valRes = await ApiService.validateSession();
          isRevalidatingAuth = false;
          if (valRes && valRes.valid) {
            return await apiPost<T>(action, payload, customUrl, retryCount + 1);
          }
        } catch {
          isRevalidatingAuth = false;
        }
      }
      notifyAuthExpired();
    }
    throw new Error(json.error?.message || 'Gagal menyimpan data ke Google Apps Script backend.');
  }

  return json.data as T;
}

// Local storage fallback helper
function loadData<T>(key: string, defaultData: T): T {
  try {
    let raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultData));
      return defaultData;
    }
    if (raw.includes('AKHWAN') || raw.includes('Akhwan')) {
      raw = raw.replace(/"AKHWAN"/g, '"AKHWAT"').replace(/Akhwan/g, 'Akhwat');
      localStorage.setItem(key, raw);
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error loading localStorage key ${key}`, e);
    return defaultData;
  }
}

function saveData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving localStorage key ${key}`, e);
  }
}

export class ApiService {
  // Real Backend Health & Connection Testing
  static async testConnection(customUrl?: string): Promise<{ connected: boolean; message: string; data?: any }> {
    const urlToTest = (customUrl || resolveApiUrl()).trim();
    const validation = validateApiUrl(urlToTest);
    if (!validation.valid) {
      return { connected: false, message: validation.error || 'URL tidak valid' };
    }

    try {
      const queryParams = new URLSearchParams();
      queryParams.append('action', 'health');
      const url = `${urlToTest}${urlToTest.includes('?') ? '&' : '?'}${queryParams.toString()}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        return { connected: false, message: `HTTP Error ${res.status} saat menghubungi Web App.` };
      }

      const json = await res.json();
      if (json && json.success && json.data && json.data.spreadsheetConnected === true) {
        return { connected: true, message: 'Database Google Sheets Terhubung', data: json.data };
      }

      return {
        connected: false,
        message: (json && json.error && json.error.message) || 'Spreadsheet tidak terhubung atau Web App belum siap.'
      };
    } catch (e: any) {
      return { connected: false, message: `Gagal terhubung: ${e.message || 'Koneksi bermasalah'}` };
    }
  }

  static async checkHealth(): Promise<{ connected: boolean; message: string; lastChecked?: string }> {
    if (isMockMode) {
      return { connected: true, message: 'Mode Mock' };
    }
    const currentUrl = resolveApiUrl();
    if (!currentUrl || currentUrl.includes('YOUR_DEPLOYMENT_ID')) {
      return { connected: false, message: 'Database Tidak Terhubung (URL belum dikonfigurasi)' };
    }
    const testRes = await this.testConnection(currentUrl);
    return {
      connected: testRes.connected,
      message: testRes.connected ? 'Google Sheets Terhubung' : (testRes.message || 'Database Tidak Terhubung'),
      lastChecked: new Date().toLocaleTimeString('id-ID')
    };
  }

  // Runtime URL helpers
  static getRuntimeApiUrl = getRuntimeApiUrl;
  static setRuntimeApiUrl = setRuntimeApiUrl;
  static clearRuntimeApiUrl = clearRuntimeApiUrl;
  static validateApiUrl = validateApiUrl;
  static resolveApiUrl = resolveApiUrl;
  static isMockMode = isMockMode;

  // Auth Methods
  static getStoredUser = getStoredUser;
  static setStoredUser = setStoredUser;
  static getAuthToken = getAuthToken;
  static setAuthToken = setAuthToken;

  static async searchLoginAccounts(query: string): Promise<Array<{ username: string; display_name: string }>> {
    const trimmed = (query || '').trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) {
      return [];
    }

    const currentUrl = resolveApiUrl();
    if (!isMockMode && currentUrl && !currentUrl.includes('YOUR_DEPLOYMENT_ID')) {
      try {
        const res = await apiPost<Array<{ username: string; display_name: string }>>('searchLoginAccounts', { query: trimmed });
        return res || [];
      } catch (e) {
        return [];
      }
    }

    // Mock search
    const users = loadData<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    const activeUsers = users.filter(u => u.active === true || String(u.active).toLowerCase() === 'true');
    const matches: Array<{ username: string; display_name: string }> = [];

    for (const u of activeUsers) {
      const uName = (u.username || '').trim();
      const dName = (u.display_name || '').trim();
      if (uName.toLowerCase().includes(trimmed) || dName.toLowerCase().includes(trimmed)) {
        matches.push({
          username: uName,
          display_name: dName
        });
        if (matches.length >= 8) break;
      }
    }

    return matches;
  }

  static async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const currentUrl = resolveApiUrl();
    if (!isMockMode && currentUrl && !currentUrl.includes('YOUR_DEPLOYMENT_ID')) {
      const res = await apiPost<{ token: string; user: User }>('login', { username, password });
      if (res.token) {
        setAuthToken(res.token);
      }
      if (res.user) {
        setStoredUser(res.user);
      }
      return res;
    }

    // Mock Login with persistent mock session store
    const users = loadData<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    const found = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!found) {
      throw new Error('Username atau password tidak cocok.');
    }
    if (found.active === false || String(found.active).toLowerCase() === 'false') {
      throw new Error('Akun Anda sudah tidak aktif. Silakan hubungi administrator.');
    }

    const token = `SES_MOCK_${found.user_id}_${Date.now()}`;
    const nowIso = getCurrentIso();
    const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []);
    sessions.unshift({
      session_token: token,
      user_id: found.user_id,
      role: found.role,
      teacher_id: found.teacher_id || '',
      created_at: nowIso,
      last_seen_at: nowIso,
      revoked: false,
      revoked_at: ''
    });
    saveData(STORAGE_KEYS.SESSIONS, sessions);

    setAuthToken(token);
    setStoredUser(found);
    return { token, user: found };
  }

  static async logout(): Promise<void> {
    const token = getAuthToken();
    const currentUrl = resolveApiUrl();
    if (!isMockMode && currentUrl && !currentUrl.includes('YOUR_DEPLOYMENT_ID')) {
      try {
        await apiPost('logout', {});
      } catch (e) {
        // ignore logout network errors
      }
    } else if (token) {
      // Mock logout: mark session revoked
      const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []);
      const sessIdx = sessions.findIndex(s => s.session_token === token);
      if (sessIdx >= 0) {
        sessions[sessIdx].revoked = true;
        sessions[sessIdx].revoked_at = getCurrentIso();
        saveData(STORAGE_KEYS.SESSIONS, sessions);
      }
    }
    setAuthToken('');
    setStoredUser(null);
  }

  static async validateSession(): Promise<{ valid: boolean; user?: User }> {
    const token = getAuthToken();
    if (!token) {
      return { valid: false };
    }

    const currentUrl = resolveApiUrl();
    if (!isMockMode && currentUrl && !currentUrl.includes('YOUR_DEPLOYMENT_ID')) {
      try {
        const res = await apiPost<{ valid: boolean; user?: User }>('validateSession', {});
        if (res && res.valid && res.user) {
          setStoredUser(res.user);
          return res;
        }
        notifyAuthExpired();
        return { valid: false };
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (msg.includes('AUTH_REQUIRED') || msg.includes('tidak valid') || msg.includes('berakhir') || msg.includes('tidak aktif')) {
          notifyAuthExpired();
        }
        return { valid: false };
      }
    }

    // Mock validation
    const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []);
    const foundSession = sessions.find(s => s.session_token === token);
    const storedUser = getStoredUser();

    if (foundSession) {
      if (foundSession.revoked === true || String(foundSession.revoked).toLowerCase() === 'true') {
        notifyAuthExpired();
        return { valid: false };
      }
      const users = loadData<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
      const user = users.find(u => u.user_id === foundSession.user_id);
      if (!user || user.active === false || String(user.active).toLowerCase() === 'false') {
        notifyAuthExpired();
        return { valid: false };
      }
      setStoredUser(user);
      return { valid: true, user };
    } else if (token && storedUser) {
      const users = loadData<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
      const user = users.find(u => u.user_id === storedUser.user_id);
      if (!user || user.active === false || String(user.active).toLowerCase() === 'false') {
        notifyAuthExpired();
        return { valid: false };
      }
      setStoredUser(user);
      return { valid: true, user };
    }

    notifyAuthExpired();
    return { valid: false };
  }

  static async cleanupRevokedSessions(): Promise<{ success: boolean; deletedCount: number }> {
    if (!isMockMode) {
      return apiPost<{ success: boolean; deletedCount: number }>('cleanupRevokedSessions', {});
    }
    const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []);
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const kept = sessions.filter(s => {
      const isRev = s.revoked === true || String(s.revoked).toLowerCase() === 'true';
      if (isRev && s.revoked_at) {
        const t = new Date(s.revoked_at).getTime();
        if (t && t < thirtyDaysAgo) return false;
      }
      return true;
    });
    const deletedCount = sessions.length - kept.length;
    saveData(STORAGE_KEYS.SESSIONS, kept);
    return { success: true, deletedCount };
  }

  // Configs
  static async getAppConfigs(): Promise<AppConfig[]> {
    if (!isMockMode) {
      return apiPost<AppConfig[]>('getAppConfigs');
    }
    return loadData(STORAGE_KEYS.CONFIGS, INITIAL_CONFIGS);
  }

  static async getConfigValue(key: string, fallback: string): Promise<string> {
    const configs = await this.getAppConfigs();
    const found = configs.find(c => c.config_key === key);
    return found ? found.config_value : fallback;
  }

  static async updateAppConfig(key: string, value: string, actorUserId?: string): Promise<void> {
    if (!isMockMode) {
      await apiPost('updateAppConfig', { key, value });
      return;
    }
    const configs = await this.getAppConfigs();
    const idx = configs.findIndex(c => c.config_key === key);
    if (idx >= 0) {
      configs[idx].config_value = value;
      configs[idx].updated_at = getCurrentIso();
    } else {
      configs.push({ config_key: key, config_value: value, description: key, updated_at: getCurrentIso() });
    }
    saveData(STORAGE_KEYS.CONFIGS, configs);
    await this.addAuditLog('UPDATE_CONFIG', 'CONFIG', key, undefined, JSON.stringify({ key, value }), undefined, actorUserId);
  }

  // Lookups
  static async getLookups(): Promise<Lookup[]> {
    if (!isMockMode) {
      return apiPost<Lookup[]>('getLookups');
    }
    return loadData(STORAGE_KEYS.LOOKUPS, INITIAL_LOOKUPS);
  }

  // Events
  static async getEvents(): Promise<Event[]> {
    if (!isMockMode) {
      return apiPost<Event[]>('getEvents');
    }
    return loadData(STORAGE_KEYS.EVENTS, INITIAL_EVENTS);
  }

  static async getCurrentEvent(): Promise<Event> {
    if (!isMockMode) {
      return apiPost<Event>('getCurrentEvent');
    }
    const events = await this.getEvents();
    const configs = await this.getAppConfigs();
    const foundConfig = configs.find(c => c.config_key === 'current_event_id');
    const currentId = foundConfig?.config_value;
    const active = (currentId && events.find(e => e.event_id === currentId)) || events.find(e => e.status === 'ACTIVE') || events[0];
    return active;
  }

  static async saveEvent(evt: Event, actorUserId?: string): Promise<Event> {
    if (!isMockMode) {
      return apiPost<Event>('saveEvent', { event: evt });
    }
    const events = await this.getEvents();
    events.unshift(evt);
    saveData(STORAGE_KEYS.EVENTS, events);
    await this.addAuditLog('CREATE_EVENT', 'EVENT', evt.event_id, undefined, JSON.stringify(evt), undefined, actorUserId, evt.event_id);
    return evt;
  }

  static async updateEvent(evt: Event, actorUserId?: string): Promise<Event> {
    if (!isMockMode) {
      return apiPost<Event>('saveEvent', { event: evt });
    }
    const events = await this.getEvents();
    const idx = events.findIndex(e => e.event_id === evt.event_id);
    if (idx >= 0) {
      const old = events[idx];
      events[idx] = { ...evt, updated_at: getCurrentIso() };
      saveData(STORAGE_KEYS.EVENTS, events);
      await this.addAuditLog('UPDATE_EVENT', 'EVENT', evt.event_id, JSON.stringify(old), JSON.stringify(evt), undefined, actorUserId, evt.event_id);
    }
    return evt;
  }

  // Event Days
  static async getEventDays(eventId?: string): Promise<EventDay[]> {
    if (!isMockMode) {
      return apiPost<EventDay[]>('getEventDays', { eventId });
    }
    const days = loadData<EventDay[]>(STORAGE_KEYS.EVENT_DAYS, INITIAL_EVENT_DAYS);
    if (eventId) {
      return days.filter(d => d.event_id === eventId);
    }
    return days;
  }

  static async saveEventDay(day: EventDay, actorUserId?: string): Promise<EventDay> {
    if (!isMockMode) {
      return apiPost<EventDay>('saveEventDay', { eventDay: day });
    }
    const days = loadData<EventDay[]>(STORAGE_KEYS.EVENT_DAYS, INITIAL_EVENT_DAYS);
    const idx = days.findIndex(d => d.event_day_id === day.event_day_id);
    if (idx >= 0) {
      const old = days[idx];
      days[idx] = day;
      await this.addAuditLog('UPDATE_EVENT_DAY', 'EVENT_DAY', day.event_day_id, JSON.stringify(old), JSON.stringify(day), undefined, actorUserId, day.event_id);
    } else {
      days.push(day);
      await this.addAuditLog('CREATE_EVENT_DAY', 'EVENT_DAY', day.event_day_id, undefined, JSON.stringify(day), undefined, actorUserId, day.event_id);
    }
    saveData(STORAGE_KEYS.EVENT_DAYS, days);
    return day;
  }

  // Session Groups Service
  static async getSessionGroups(eventId?: string): Promise<SessionGroup[]> {
    if (!isMockMode) {
      return apiPost<SessionGroup[]>('getSessionGroups', { eventId });
    }
    const list = loadData<SessionGroup[]>(STORAGE_KEYS.SESSION_GROUPS, INITIAL_SESSION_GROUPS);
    if (eventId) {
      return list.filter(g => g.event_id === eventId);
    }
    return list;
  }

  static async saveSessionGroup(sg: SessionGroup, actorUserId?: string): Promise<SessionGroup> {
    if (!isMockMode) {
      return apiPost<SessionGroup>('saveSessionGroup', { sessionGroup: sg });
    }
    const list = loadData<SessionGroup[]>(STORAGE_KEYS.SESSION_GROUPS, INITIAL_SESSION_GROUPS);
    const idx = list.findIndex(g => g.session_group_id === sg.session_group_id);
    if (idx >= 0) {
      const old = list[idx];
      list[idx] = sg;
      saveData(STORAGE_KEYS.SESSION_GROUPS, list);
      await this.addAuditLog('UPDATE_SESSION_GROUP', 'SESSION_GROUP', sg.session_group_id, JSON.stringify(old), JSON.stringify(sg), undefined, actorUserId, sg.event_id);
    } else {
      list.push(sg);
      saveData(STORAGE_KEYS.SESSION_GROUPS, list);
      await this.addAuditLog('CREATE_SESSION_GROUP', 'SESSION_GROUP', sg.session_group_id, undefined, JSON.stringify(sg), undefined, actorUserId, sg.event_id);
    }
    return sg;
  }

  // Session Configs & Clock Time helpers
  static normalizeClockTime(timeVal: any): string {
    if (timeVal === undefined || timeVal === null) return '';
    if (timeVal instanceof Date) {
      const h = String(timeVal.getHours()).padStart(2, '0');
      const m = String(timeVal.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
    const str = String(timeVal).trim();
    if (!str) return '';

    // Match HH:mm or HH:mm:ss or H:mm:ss or H:mm
    const match = str.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`;
    }

    // Match 12-hour format e.g. "8:00 AM" or "08:00:00 PM"
    const match12 = str.match(/^([0]?[1-9]|1[0-2]):([0-5]\d)(?::[0-5]\d)?\s*([AP]M)$/i);
    if (match12) {
      let hourNum = parseInt(match12[1], 10);
      const isPM = match12[3].toUpperCase() === 'PM';
      if (isPM && hourNum < 12) hourNum += 12;
      if (!isPM && hourNum === 12) hourNum = 0;
      return `${String(hourNum).padStart(2, '0')}:${match12[2]}`;
    }

    // Match ISO date string with time e.g. 1899-12-30T08:00:00.000Z
    const matchIso = str.match(/T([01]?\d|2[0-3]):([0-5]\d)/);
    if (matchIso) {
      return `${matchIso[1].padStart(2, '0')}:${matchIso[2]}`;
    }

    return '';
  }

  static normalizeTime(timeVal: any): string {
    return ApiService.normalizeClockTime(timeVal);
  }

  static formatClockTime(timeVal: any): string {
    return ApiService.normalizeClockTime(timeVal) || '--:--';
  }

  static async getSessionConfigs(eventId?: string): Promise<SessionConfig[]> {
    if (!isMockMode) {
      const res = await apiPost<SessionConfig[]>('getSessionConfigs', { eventId });
      return (res || []).map(sc => ({
        ...sc,
        start_time: ApiService.normalizeTime(sc.start_time),
        end_time: ApiService.normalizeTime(sc.end_time)
      }));
    }
    const scs = loadData<SessionConfig[]>(STORAGE_KEYS.SESSION_CONFIGS, INITIAL_SESSION_CONFIGS);
    const list = eventId ? scs.filter(s => s.event_id === eventId) : scs;
    return list.map(sc => ({
      ...sc,
      start_time: ApiService.normalizeTime(sc.start_time),
      end_time: ApiService.normalizeTime(sc.end_time)
    }));
  }

  static async saveSessionConfig(sc: SessionConfig, actorUserId?: string): Promise<SessionConfig> {
    const payload: SessionConfig = {
      ...sc,
      start_time: ApiService.normalizeTime(sc.start_time),
      end_time: ApiService.normalizeTime(sc.end_time)
    };

    if (!isMockMode) {
      const saved = await apiPost<SessionConfig>('saveSessionConfig', { sessionConfig: payload });
      return {
        ...saved,
        start_time: ApiService.normalizeTime(saved.start_time || payload.start_time),
        end_time: ApiService.normalizeTime(saved.end_time || payload.end_time)
      };
    }
    const scs = loadData<SessionConfig[]>(STORAGE_KEYS.SESSION_CONFIGS, INITIAL_SESSION_CONFIGS);
    const idx = scs.findIndex(s => s.session_config_id === payload.session_config_id);
    if (idx >= 0) {
      const old = scs[idx];
      scs[idx] = payload;
      await this.addAuditLog('UPDATE_SESSION_CONFIG', 'SESSION_CONFIG', payload.session_config_id, JSON.stringify(old), JSON.stringify(payload), undefined, actorUserId, payload.event_id);
    } else {
      scs.push(payload);
      await this.addAuditLog('CREATE_SESSION_CONFIG', 'SESSION_CONFIG', payload.session_config_id, undefined, JSON.stringify(payload), undefined, actorUserId, payload.event_id);
    }
    saveData(STORAGE_KEYS.SESSION_CONFIGS, scs);
    return payload;
  }

  // Master Students & Teachers
  static async getStudents(): Promise<Student[]> {
    if (!isMockMode) {
      return apiPost<Student[]>('getStudents');
    }
    return loadData(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
  }

  static async getStudentsForRole(userRole?: string, teacherId?: string): Promise<Student[]> {
    if (!isMockMode) {
      // Server enforces role-based access code masking
      return apiPost<Student[]>('getStudents');
    }

    const students = await this.getStudents();
    if (userRole === 'ADMIN') {
      return students;
    }
    // Teachers, Coordinators, Viewers must not receive access codes
    if (userRole === 'TEACHER' && teacherId) {
      const currentEvt = await this.getCurrentEvent();
      const event_id = currentEvt?.event_id;
      let allowedStudentIds = new Set<string>();
      if (event_id) {
        const halaqahTeachers = await this.getHalaqahTeachers(event_id);
        const teacherAssgns = halaqahTeachers.filter(ht => ht.teacher_id === teacherId && ht.active);
        if (teacherAssgns.length > 0) {
          const assignedHalaqahIds = new Set(teacherAssgns.map(ht => ht.halaqah_id));
          const participants = await this.getEventParticipants(event_id);
          participants.forEach(p => {
            if (assignedHalaqahIds.has(p.halaqah_id)) {
              allowedStudentIds.add(p.student_id);
            }
          });
        }
      }
      return students.filter(s => allowedStudentIds.has(s.student_id)).map(s => ({ ...s, access_code: '' }));
    }
    return students.map(s => ({ ...s, access_code: '' }));
  }

  static async regenerateAccessCode(studentId: string, actorUserId?: string): Promise<{ success: boolean; newAccessCode: string }> {
    if (!isMockMode) {
      return apiPost<{ success: boolean; newAccessCode: string }>('regenerateAccessCode', { studentId });
    }
    const students = await this.getStudents();
    const student = students.find(s => s.student_id === studentId);
    if (!student) {
      throw new Error('Siswa tidak ditemukan.');
    }
    const existingCodes = students.map(s => s.access_code);
    const newCode = generateRandomAccessCode(existingCodes);
    const oldCode = student.access_code;
    student.access_code = newCode;
    student.updated_at = getCurrentIso();
    saveData(STORAGE_KEYS.STUDENTS, students);
    await this.addAuditLog('REGENERATE_ACCESS_CODE', 'STUDENT', studentId, JSON.stringify({ access_code: oldCode }), JSON.stringify({ access_code: newCode }), undefined, actorUserId);
    return { success: true, newAccessCode: newCode };
  }

  static async saveStudent(student: Student, actorUserId?: string): Promise<Student> {
    if (!isMockMode) {
      return apiPost<Student>('saveStudent', { student });
    }
    const students = await this.getStudents();
    const idx = students.findIndex(s => s.student_id === student.student_id);
    if (idx >= 0) {
      const old = students[idx];
      students[idx] = { ...student, updated_at: getCurrentIso() };
      saveData(STORAGE_KEYS.STUDENTS, students);
      await this.addAuditLog('UPDATE_STUDENT', 'STUDENT', student.student_id, JSON.stringify(old), JSON.stringify(student), undefined, actorUserId);
    } else {
      students.unshift(student);
      saveData(STORAGE_KEYS.STUDENTS, students);
      await this.addAuditLog('CREATE_STUDENT', 'STUDENT', student.student_id, undefined, JSON.stringify(student), undefined, actorUserId);
    }
    return student;
  }

  static async getTeachers(): Promise<Teacher[]> {
    if (!isMockMode) {
      return apiPost<Teacher[]>('getTeachers');
    }
    return loadData(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS);
  }

  static async saveTeacher(teacher: Teacher, actorUserId?: string): Promise<Teacher> {
    if (!isMockMode) {
      return apiPost<Teacher>('saveTeacher', { teacher });
    }
    const teachers = await this.getTeachers();
    const idx = teachers.findIndex(t => t.teacher_id === teacher.teacher_id);
    if (idx >= 0) {
      const old = teachers[idx];
      teachers[idx] = { ...teacher, updated_at: getCurrentIso() };
      saveData(STORAGE_KEYS.TEACHERS, teachers);
      await this.addAuditLog('UPDATE_TEACHER', 'TEACHER', teacher.teacher_id, JSON.stringify(old), JSON.stringify(teacher), undefined, actorUserId);
    } else {
      teachers.unshift(teacher);
      saveData(STORAGE_KEYS.TEACHERS, teachers);
      await this.addAuditLog('CREATE_TEACHER', 'TEACHER', teacher.teacher_id, undefined, JSON.stringify(teacher), undefined, actorUserId);
    }
    return teacher;
  }

  // Users
  static async getUsers(): Promise<User[]> {
    if (!isMockMode) {
      return apiPost<User[]>('getUsers');
    }
    return loadData(STORAGE_KEYS.USERS, INITIAL_USERS);
  }

  static async saveUser(user: User, password?: string, actorUserId?: string): Promise<User> {
    const payload: any = { ...user };
    if (password && password.trim()) {
      payload.password = password.trim();
    }

    if (!isMockMode) {
      return apiPost<User>('saveUser', { user: payload });
    }

    const users = await this.getUsers();

    // Check case-insensitive uniqueness
    const usernameLower = user.username.trim().toLowerCase();
    const dup = users.find(u => u.user_id !== user.user_id && u.username.trim().toLowerCase() === usernameLower);
    if (dup) {
      throw new Error(`Username "${user.username}" sudah digunakan oleh akun lain (${dup.display_name}).`);
    }

    const idx = users.findIndex(u => u.user_id === user.user_id);
    const passwordChanged = Boolean(password && password.trim());
    const nowIso = getCurrentIso();

    const cleanUser: User = {
      user_id: user.user_id,
      username: user.username.trim(),
      display_name: user.display_name.trim(),
      role: user.role,
      teacher_id: user.role === 'TEACHER' ? (user.teacher_id || '') : '',
      active: user.active,
      created_at: user.created_at || nowIso,
      updated_at: nowIso,
      last_login_at: user.last_login_at || ''
    };

    if (idx >= 0) {
      const old = users[idx];
      users[idx] = cleanUser;
      saveData(STORAGE_KEYS.USERS, users);
      await this.addAuditLog('UPDATE_USER', 'USER', cleanUser.user_id, JSON.stringify(old), JSON.stringify(cleanUser), undefined, actorUserId);
    } else {
      users.unshift(cleanUser);
      saveData(STORAGE_KEYS.USERS, users);
      await this.addAuditLog('CREATE_USER', 'USER', cleanUser.user_id, undefined, JSON.stringify(cleanUser), undefined, actorUserId);
    }

    if (passwordChanged || cleanUser.active === false || String(cleanUser.active).toLowerCase() === 'false') {
      const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []);
      let changed = false;
      sessions.forEach(s => {
        if (s.user_id === cleanUser.user_id && !s.revoked) {
          s.revoked = true;
          s.revoked_at = nowIso;
          changed = true;
        }
      });
      if (changed) {
        saveData(STORAGE_KEYS.SESSIONS, sessions);
      }
    }

    return cleanUser;
  }

  static async resetUserPassword(userId: string, newPassword: string, actorUserId?: string): Promise<{ success: boolean; message: string }> {
    if (!newPassword || !newPassword.trim()) {
      throw new Error('Password baru wajib diisi.');
    }

    if (!isMockMode) {
      return apiPost<{ success: boolean; message: string }>('resetUserPassword', { userId, newPassword: newPassword.trim() });
    }

    const users = loadData<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    const targetUser = users.find(u => u.user_id === userId);
    if (!targetUser) {
      throw new Error('Pengguna tidak ditemukan.');
    }

    const nowIso = getCurrentIso();
    targetUser.updated_at = nowIso;
    saveData(STORAGE_KEYS.USERS, users);

    // Revoke all active mock sessions for this user
    const sessions = loadData<any[]>(STORAGE_KEYS.SESSIONS, []);
    let changed = false;
    sessions.forEach(s => {
      if (s.user_id === userId && !s.revoked) {
        s.revoked = true;
        s.revoked_at = nowIso;
        changed = true;
      }
    });
    if (changed) {
      saveData(STORAGE_KEYS.SESSIONS, sessions);
    }

    await this.addAuditLog('RESET_USER_PASSWORD', 'USER', userId, undefined, JSON.stringify({
      username: targetUser.username,
      display_name: targetUser.display_name,
      reset_at: nowIso
    }), 'Reset password berhasil dilakukan oleh Admin', actorUserId);

    return { success: true, message: 'Password pengguna berhasil diperbarui.' };
  }

  // Halaqah
  static async getHalaqahList(eventId?: string): Promise<Halaqah[]> {
    if (!isMockMode) {
      return apiPost<Halaqah[]>('getHalaqahList', { eventId });
    }
    const list = loadData<Halaqah[]>(STORAGE_KEYS.HALAQAH, INITIAL_HALAQAH);
    if (eventId) {
      return list.filter(h => h.event_id === eventId);
    }
    return list;
  }

  static async saveHalaqah(halaqah: Halaqah, actorUserId?: string): Promise<Halaqah> {
    if (!isMockMode) {
      return apiPost<Halaqah>('saveHalaqah', { halaqah });
    }
    const list = await this.getHalaqahList();
    const idx = list.findIndex(h => h.halaqah_id === halaqah.halaqah_id);
    if (idx >= 0) {
      const old = list[idx];
      list[idx] = halaqah;
      saveData(STORAGE_KEYS.HALAQAH, list);
      await this.addAuditLog('UPDATE_HALAQAH', 'HALAQAH', halaqah.halaqah_id, JSON.stringify(old), JSON.stringify(halaqah), undefined, actorUserId, halaqah.event_id);
    } else {
      list.push(halaqah);
      saveData(STORAGE_KEYS.HALAQAH, list);
      await this.addAuditLog('CREATE_HALAQAH', 'HALAQAH', halaqah.halaqah_id, undefined, JSON.stringify(halaqah), undefined, actorUserId, halaqah.event_id);
    }
    return halaqah;
  }

  static async getHalaqahTeachers(eventId?: string): Promise<HalaqahTeacher[]> {
    if (!isMockMode) {
      return apiPost<HalaqahTeacher[]>('getHalaqahTeachers', { eventId });
    }
    const ht = loadData<HalaqahTeacher[]>(STORAGE_KEYS.HALAQAH_TEACHERS, INITIAL_HALAQAH_TEACHERS);
    let activeHt = ht.filter(item => item.active === true || String(item.active).toLowerCase() === 'true');
    if (eventId) {
      activeHt = activeHt.filter(item => item.event_id === eventId);
    }
    return activeHt;
  }

  static clearWorkspaceCache(teacherId?: string, eventId?: string): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rt_teacher_ws_')) {
          if (teacherId && eventId) {
            if (k.startsWith(`rt_teacher_ws_${teacherId}_${eventId}`)) {
              keysToRemove.push(k);
            }
          } else if (teacherId) {
            if (k.startsWith(`rt_teacher_ws_${teacherId}_`)) {
              keysToRemove.push(k);
            }
          } else {
            keysToRemove.push(k);
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.error('Error clearing workspace cache:', e);
    }
  }

  static async saveHalaqahTeacher(ht: HalaqahTeacher, actorUserId?: string): Promise<HalaqahTeacher> {
    this.clearWorkspaceCache(ht.teacher_id, ht.event_id);
    if (!isMockMode) {
      const res = await apiPost<HalaqahTeacher>('saveHalaqahTeacher', { halaqahTeacher: ht });
      this.clearWorkspaceCache(ht.teacher_id, ht.event_id);
      return res;
    }
    const list = loadData<HalaqahTeacher[]>(STORAGE_KEYS.HALAQAH_TEACHERS, INITIAL_HALAQAH_TEACHERS);
    const nowIso = getCurrentIso();

    // Check duplicate by event_id + halaqah_id + teacher_id
    const matchIdx = list.findIndex(
      item => item.event_id === ht.event_id && item.halaqah_id === ht.halaqah_id && item.teacher_id === ht.teacher_id
    );

    if (matchIdx >= 0) {
      const existing = list[matchIdx];
      const old = { ...existing };
      existing.active = true;
      existing.teacher_role = ht.teacher_role;
      existing.updated_at = nowIso;
      saveData(STORAGE_KEYS.HALAQAH_TEACHERS, list);
      await this.addAuditLog('ASSIGN_HALAQAH_TEACHER', 'HALAQAH_TEACHER', existing.assignment_id, JSON.stringify(old), JSON.stringify(existing), undefined, actorUserId, existing.event_id);
      this.clearWorkspaceCache(existing.teacher_id, existing.event_id);
      return existing;
    } else {
      const newHt = { ...ht, active: true, updated_at: nowIso };
      list.push(newHt);
      saveData(STORAGE_KEYS.HALAQAH_TEACHERS, list);
      await this.addAuditLog('ASSIGN_HALAQAH_TEACHER', 'HALAQAH_TEACHER', newHt.assignment_id, undefined, JSON.stringify(newHt), undefined, actorUserId, newHt.event_id);
      this.clearWorkspaceCache(newHt.teacher_id, newHt.event_id);
      return newHt;
    }
  }

  static async deleteHalaqahTeacher(assignmentId: string, actorUserId?: string): Promise<{ deleted: boolean; assignmentId: string; teacherId?: string; halaqahId?: string }> {
    if (!assignmentId) {
      throw new Error('ID penugasan tidak ditemukan. Data tidak dapat dihapus.');
    }
    console.log('DELETE REQUEST SENT:', assignmentId);
    this.clearWorkspaceCache();
    if (!isMockMode) {
      const response = await apiPost<{ deleted: boolean; assignmentId: string; teacherId?: string; halaqahId?: string }>('deleteHalaqahTeacher', { assignmentId });
      console.log('DELETE RESPONSE:', response);
      if (response && response.teacherId) {
        this.clearWorkspaceCache(response.teacherId);
      } else {
        this.clearWorkspaceCache();
      }
      return response;
    }
    let list = loadData<HalaqahTeacher[]>(STORAGE_KEYS.HALAQAH_TEACHERS, INITIAL_HALAQAH_TEACHERS);
    const item = list.find(i => i.assignment_id === assignmentId);
    if (item) {
      list = list.filter(i => i.assignment_id !== assignmentId);
      saveData(STORAGE_KEYS.HALAQAH_TEACHERS, list);
      await this.addAuditLog('DELETE_HALAQAH_TEACHER', 'HALAQAH_TEACHER', assignmentId, JSON.stringify(item), undefined, undefined, actorUserId, item?.event_id);
      this.clearWorkspaceCache(item.teacher_id, item.event_id);
    }
    const mockRes = { deleted: true, assignmentId, teacherId: item?.teacher_id, halaqahId: item?.halaqah_id };
    console.log('DELETE RESPONSE:', mockRes);
    return mockRes;
  }

  // Event Participants
  static async getEventParticipants(eventId?: string): Promise<EventParticipant[]> {
    if (!isMockMode) {
      return apiPost<EventParticipant[]>('getEventParticipants', { eventId });
    }
    const ps = loadData<EventParticipant[]>(STORAGE_KEYS.PARTICIPANTS, INITIAL_PARTICIPANTS);
    if (eventId) {
      return ps.filter(p => p.event_id === eventId);
    }
    return ps;
  }

  static async getStudentPlacementBootstrap(eventId?: string): Promise<StudentPlacementBootstrap> {
    if (!isMockMode) {
      return apiPost<StudentPlacementBootstrap>('getStudentPlacementBootstrap', { eventId });
    }
    const [events, students, participants, halaqahs] = await Promise.all([
      this.getEvents(),
      this.getStudents(),
      this.getEventParticipants(eventId),
      this.getHalaqahList(eventId)
    ]);
    const targetEvent = (eventId ? events.find(e => e.event_id === eventId) : null) ||
      events.find(e => e.status === 'ACTIVE') || events[0] || null;
    const filteredParticipants = targetEvent
      ? participants.filter(p => p.event_id === targetEvent.event_id)
      : participants;
    const filteredHalaqahs = targetEvent
      ? halaqahs.filter(h => h.event_id === targetEvent.event_id)
      : halaqahs;
    const projectedStudents: PlacementStudent[] = students.map(s => ({
      student_id: s.student_id,
      nis: s.nis,
      full_name: s.full_name,
      gender: s.gender,
      grade_level: s.grade_level,
      class_name: s.class_name,
      active: s.active
    }));
    return {
      event: targetEvent,
      students: projectedStudents,
      participants: filteredParticipants,
      halaqahs: filteredHalaqahs
    };
  }

  static async getTeacherWorkspaceBootstrap(eventId?: string, halaqahId?: string, teacherId?: string): Promise<TeacherWorkspaceBootstrap> {
    if (!isMockMode) {
      return apiPost<TeacherWorkspaceBootstrap>('getTeacherWorkspaceBootstrap', { eventId, halaqahId, teacherId });
    }
    const [events, eventDays, halaqahs, halaqahTeachers, teachers, participants, students, assessments, evaluations, sessionConfigs] = await Promise.all([
      this.getEvents(),
      this.getEventDays(eventId),
      this.getHalaqahList(eventId),
      loadData<HalaqahTeacher[]>(STORAGE_KEYS.HALAQAH_TEACHERS, INITIAL_HALAQAH_TEACHERS),
      this.getTeachers(),
      this.getEventParticipants(eventId),
      this.getStudents(),
      this.getSessionAssessments(eventId),
      this.getFinalEvaluations(eventId),
      this.getSessionConfigs(eventId)
    ]);
    const targetEvent = (eventId ? events.find(e => e.event_id === eventId) : null) ||
      events.find(e => e.status === 'ACTIVE') || events[0] || null;
    const currentUser = this.getStoredUser();
    const isTeacher = currentUser?.role === 'TEACHER';
    const resolvedTeacherId = isTeacher ? currentUser?.teacher_id : (teacherId || currentUser?.teacher_id);

    if (!targetEvent) {
      return {
        event: null,
        halaqah: null,
        availableHalaqahs: [],
        students: [],
        sessionConfigs: [],
        assessments: [],
        finalEvaluations: [],
        serverTimestamp: new Date().toISOString()
      };
    }

    let availableHalaqahs: Halaqah[] = [];
    if (resolvedTeacherId) {
      const myAssignedIds = halaqahTeachers
        .filter(ht => ht.teacher_id === resolvedTeacherId && (ht.active === true || String(ht.active).toLowerCase() === 'true') && (targetEvent ? ht.event_id === targetEvent.event_id : true))
        .map(ht => ht.halaqah_id);

      availableHalaqahs = halaqahs.filter(h => h.event_id === targetEvent.event_id && (h.active === true || String(h.active).toLowerCase() === 'true') && myAssignedIds.includes(h.halaqah_id));
    } else {
      // ADMIN or COORDINATOR without specific teacher selected: all halaqahs for this event
      availableHalaqahs = halaqahs.filter(h => h.event_id === targetEvent.event_id && (h.active === true || String(h.active).toLowerCase() === 'true'));
    }

    const selectedHalaqah = (halaqahId ? availableHalaqahs.find(h => h.halaqah_id === halaqahId) : null) || availableHalaqahs[0] || null;
    if (!selectedHalaqah) {
      return {
        event: targetEvent,
        halaqah: null,
        availableHalaqahs,
        students: [],
        sessionConfigs: [],
        assessments: [],
        finalEvaluations: [],
        serverTimestamp: new Date().toISOString()
      };
    }

    const assignments = halaqahTeachers.filter(ht => ht.halaqah_id === selectedHalaqah.halaqah_id && ht.active);
    const assignedTeachers = assignments.map(ht => {
      const t = teachers.find(teach => teach.teacher_id === ht.teacher_id);
      return {
        teacher_id: ht.teacher_id,
        full_name: t?.full_name || 'Guru Tahfidz',
        short_name: t?.short_name || '',
        teacher_role: ht.teacher_role || 'PRIMARY'
      };
    });
    const primaryAssignment = assignments.find(ht => ht.teacher_role === 'PRIMARY') || assignments[0];
    const teacherObj = primaryAssignment ? teachers.find(t => t.teacher_id === primaryAssignment.teacher_id) : null;

    const targetParticipants = participants.filter(p => p.event_id === targetEvent.event_id && p.halaqah_id === selectedHalaqah.halaqah_id);
    const targetStudentIds = new Set(targetParticipants.map(p => p.student_id));
    const targetParticipantIds = new Set(targetParticipants.map(p => p.participant_id));

    const targetAssessments = assessments.filter(a =>
      a.event_id === targetEvent.event_id &&
      !a.is_deleted &&
      (a.halaqah_id === selectedHalaqah.halaqah_id || targetStudentIds.has(a.student_id))
    );

    const targetEvaluations = evaluations.filter(e =>
      e.event_id === targetEvent.event_id &&
      (targetStudentIds.has(e.student_id) || targetParticipantIds.has(e.participant_id))
    );

    const targetConfigs = selectedHalaqah.session_group_id
      ? sessionConfigs.filter(sc => sc.event_id === targetEvent.event_id && sc.session_group_id === selectedHalaqah.session_group_id)
      : sessionConfigs.filter(sc => sc.event_id === targetEvent.event_id);

    const studentMap = new Map(students.filter(s => targetStudentIds.has(s.student_id)).map(s => [s.student_id, s]));
    const evalMap = new Map();
    targetEvaluations.forEach(e => {
      if (e.participant_id) evalMap.set(e.participant_id, e);
      if (e.student_id) evalMap.set(e.student_id, e);
    });

    const studentAsmsMap = new Map<string, SessionAssessment[]>();
    targetAssessments.forEach(a => {
      if (a.attendance_status === 'PRESENT') {
        const list = studentAsmsMap.get(a.student_id) || [];
        list.push(a);
        studentAsmsMap.set(a.student_id, list);
      }
    });

    const mappedStudents: TeacherStudentSummary[] = targetParticipants.map(p => {
      const st = studentMap.get(p.student_id);
      const studentEval = evalMap.get(p.participant_id) || evalMap.get(p.student_id);
      const studentAsms = studentAsmsMap.get(p.student_id) || [];
      const totalLines = studentAsms.reduce((sum, a) => sum + (Number(a.lines_added) || 0), 0);

      return {
        student_id: p.student_id,
        participant_id: p.participant_id,
        nis: st?.nis || '',
        full_name: st?.full_name || 'Siswa',
        access_code: st?.access_code || '',
        grade_snapshot: p.grade_snapshot,
        class_snapshot: p.class_snapshot,
        grade_class: `${p.grade_snapshot || ''} (${p.class_snapshot || ''})`,
        gender: st?.gender || selectedHalaqah.gender || 'IKHWAN',
        skill_status_start: p.skill_status_start || 'NON_BBL',
        baseline_surah: p.baseline_surah,
        baseline_ayah: p.baseline_ayah,
        target_surah_start: p.target_surah_start,
        target_ayah_start: p.target_ayah_start,
        target_surah_end: p.target_surah_end,
        target_ayah_end: p.target_ayah_end,
        target_lines: p.target_lines,
        target_iqra_pages: p.target_iqra_pages,
        target_source: p.target_source,
        targetText: formatParticipantTarget(p),
        totalLinesAdded: totalLines,
        completionStatus: studentEval ? studentEval.completion_status : 'NOT_EVALUATED',
        session_group_id: p.session_group_id || selectedHalaqah.session_group_id
      };
    });

    return {
      event: targetEvent,
      eventDays: targetEvent ? eventDays.filter(d => d.event_id === targetEvent.event_id) : eventDays,
      halaqah: {
        halaqah_id: selectedHalaqah.halaqah_id,
        event_id: targetEvent.event_id,
        halaqah_name: selectedHalaqah.halaqah_name,
        group_name: selectedHalaqah.halaqah_name,
        teacher_name: teacherObj ? teacherObj.full_name : 'Guru Tahfidz',
        gender: selectedHalaqah.gender || 'IKHWAN',
        grade_group: selectedHalaqah.grade_group,
        session_group_id: selectedHalaqah.session_group_id,
        location: selectedHalaqah.location,
        active: true
      },
      availableHalaqahs,
      students: mappedStudents,
      sessionConfigs: targetConfigs,
      assessments: targetAssessments,
      finalEvaluations: targetEvaluations,
      assignedTeachers,
      serverTimestamp: new Date().toISOString()
    };
  }

  static async bulkRegisterAndAssignStudentsToHalaqah(
    eventId: string,
    studentIds: string[],
    targetHalaqahId: string,
    actorUserId?: string
  ): Promise<BulkAssignResult> {
    if (!isMockMode) {
      return apiPost<BulkAssignResult>(
        'bulkRegisterAndAssignStudentsToHalaqah',
        { eventId, studentIds, targetHalaqahId }
      );
    }
    const ps = loadData<EventParticipant[]>(STORAGE_KEYS.PARTICIPANTS, INITIAL_PARTICIPANTS);
    const allStudents = loadData<Student[]>(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    const halaqahs = loadData<Halaqah[]>(STORAGE_KEYS.HALAQAH, INITIAL_HALAQAH);
    const targetHalaqah = targetHalaqahId ? halaqahs.find(h => h.halaqah_id === targetHalaqahId) : null;

    let createdCount = 0;
    let updatedCount = 0;
    const skippedRecords: Array<{ studentId: string; studentName?: string; reason: string }> = [];

    studentIds.forEach(sid => {
      const student = allStudents.find(s => s.student_id === sid);
      if (!student) {
        skippedRecords.push({ studentId: sid, reason: 'Data siswa tidak ditemukan di Master Siswa.' });
        return;
      }

      if (!student.active) {
        skippedRecords.push({ studentId: sid, studentName: student.full_name, reason: 'Status siswa tidak aktif di Master Siswa.' });
        return;
      }

      if (targetHalaqah && targetHalaqah.gender && student.gender && targetHalaqah.gender !== student.gender) {
        skippedRecords.push({
          studentId: sid,
          studentName: student.full_name,
          reason: `Gender siswa (${student.gender}) tidak sesuai dengan gender halaqah (${targetHalaqah.gender})`
        });
        return;
      }

      const existing = ps.find(p => p.event_id === eventId && p.student_id === sid);
      const nowIso = getCurrentIso();

      if (existing) {
        existing.halaqah_id = targetHalaqahId;
        existing.session_group_id = targetHalaqah ? (targetHalaqah.session_group_id || '') : (existing.session_group_id || '');
        
        // Target assignment rules on move:
        // If target_source === 'HALAQAH', derive new target from new halaqah defaults.
        // If target_source === 'MANUAL', preserve student's manual target.
        // If target_source is blank (legacy data), do not overwrite non-empty participant target.
        if (targetHalaqah && existing.target_source === 'HALAQAH') {
          const skill = existing.skill_status_start;
          if (skill === 'NON_BBL') {
            existing.target_iqra_pages = targetHalaqah.target_iqra_pages != null ? targetHalaqah.target_iqra_pages : undefined;
            existing.target_lines = undefined;
            existing.target_source = 'HALAQAH';
          } else if (skill === 'BBL' || skill === 'BBLS') {
            existing.target_lines = targetHalaqah.target_ziyadah_lines != null ? targetHalaqah.target_ziyadah_lines : undefined;
            existing.target_iqra_pages = undefined;
            existing.target_source = 'HALAQAH';
          }
        }

        existing.updated_at = nowIso;
        updatedCount++;
      } else {
        const newPartId = 'PART_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').substring(0, 16) : Math.random().toString(36).substring(2, 12));
        
        let targetLines: number | undefined = undefined;
        let targetIqraPages: number | undefined = undefined;
        let targetSource: any = undefined;

        // If target halaqah exists and student has initial skill (or default)
        // Derive target server-side
        if (targetHalaqah) {
          targetSource = 'HALAQAH';
        }

        const newParticipant: EventParticipant = {
          participant_id: newPartId,
          event_id: eventId,
          student_id: student.student_id,
          class_snapshot: student.class_name || '',
          grade_snapshot: student.grade_level || '',
          skill_status_start: '' as any,
          halaqah_id: targetHalaqahId,
          session_group_id: targetHalaqah ? (targetHalaqah.session_group_id || '') : '',
          target_lines: targetLines,
          target_iqra_pages: targetIqraPages,
          target_source: targetSource,
          participant_status: 'ACTIVE',
          created_at: nowIso,
          updated_at: nowIso
        };
        ps.push(newParticipant);
        createdCount++;
      }
    });

    saveData(STORAGE_KEYS.PARTICIPANTS, ps);
    const skippedStudentIds = skippedRecords.map(r => r.studentId);
    await this.addAuditLog(
      'BULK_REGISTER_ASSIGN_HALAQAH',
      'PARTICIPANT',
      targetHalaqahId || eventId,
      undefined,
      JSON.stringify({ createdCount, updatedCount, skippedCount: skippedRecords.length, targetHalaqahId }),
      undefined,
      actorUserId,
      eventId
    );
    return {
      createdCount,
      updatedCount,
      skippedCount: skippedRecords.length,
      skippedStudentIds,
      skippedRecords
    };
  }

  static async bulkAssignStudentsToHalaqah(
    eventId: string,
    studentIds: string[],
    targetHalaqahId: string,
    actorUserId?: string
  ): Promise<BulkAssignResult> {
    return this.bulkRegisterAndAssignStudentsToHalaqah(eventId, studentIds, targetHalaqahId, actorUserId);
  }

  static async updateParticipantBaselineTarget(p: EventParticipant, actorUserId?: string): Promise<EventParticipant> {
    if (!isMockMode) {
      return apiPost<EventParticipant>('updateParticipantTarget', { participant: p });
    }
    const ps = loadData<EventParticipant[]>(STORAGE_KEYS.PARTICIPANTS, INITIAL_PARTICIPANTS);
    const idx = ps.findIndex(item => item.participant_id === p.participant_id);
    if (idx >= 0) {
      const old = ps[idx];
      ps[idx] = { ...p, updated_at: getCurrentIso() };
      saveData(STORAGE_KEYS.PARTICIPANTS, ps);
      await this.addAuditLog('UPDATE_BASELINE_TARGET', 'PARTICIPANT', p.participant_id, JSON.stringify(old), JSON.stringify(p), undefined, actorUserId, p.event_id);
    }
    return p;
  }

  // Session Assessments - UPSERT by event_id + participant_id + session_config_id
  static async getSessionAssessments(eventId?: string): Promise<SessionAssessment[]> {
    if (!isMockMode) {
      return apiPost<SessionAssessment[]>('getSessionAssessments', { eventId });
    }
    const list = loadData<SessionAssessment[]>(STORAGE_KEYS.ASSESSMENTS, INITIAL_ASSESSMENTS);
    if (eventId) {
      return list.filter(a => a.event_id === eventId && !a.is_deleted);
    }
    return list.filter(a => !a.is_deleted);
  }

  static async saveSessionAssessment(asm: SessionAssessment, actorUserId?: string): Promise<SessionAssessment> {
    if (!isMockMode) {
      return apiPost<SessionAssessment>('saveSessionAssessment', { assessment: asm });
    }
    const list = loadData<SessionAssessment[]>(STORAGE_KEYS.ASSESSMENTS, INITIAL_ASSESSMENTS);
    const idx = list.findIndex(a => 
      !a.is_deleted &&
      a.event_id === asm.event_id &&
      a.participant_id === asm.participant_id &&
      a.session_config_id === asm.session_config_id
    );
    
    if (idx >= 0) {
      const old = list[idx];
      const updatedItem: SessionAssessment = {
        ...old,
        ...asm,
        assessment_id: old.assessment_id,
        updated_at: getCurrentIso()
      };
      list[idx] = updatedItem;
      saveData(STORAGE_KEYS.ASSESSMENTS, list);
      await this.addAuditLog('UPDATE_ASSESSMENT', 'SESSION_ASSESSMENT', updatedItem.assessment_id, JSON.stringify(old), JSON.stringify(updatedItem), undefined, actorUserId || asm.teacher_id, asm.event_id);
      return updatedItem;
    } else {
      list.push(asm);
      saveData(STORAGE_KEYS.ASSESSMENTS, list);
      await this.addAuditLog('CREATE_ASSESSMENT', 'SESSION_ASSESSMENT', asm.assessment_id, undefined, JSON.stringify(asm), undefined, actorUserId || asm.teacher_id, asm.event_id);
      return asm;
    }
  }

  static async deleteSessionAssessment(assessmentId: string, deletedBy: string): Promise<void> {
    if (!isMockMode) {
      await apiPost('deleteSessionAssessment', { assessmentId });
      return;
    }
    const list = loadData<SessionAssessment[]>(STORAGE_KEYS.ASSESSMENTS, INITIAL_ASSESSMENTS);
    const idx = list.findIndex(a => a.assessment_id === assessmentId);
    if (idx >= 0) {
      const old = list[idx];
      list[idx].is_deleted = true;
      list[idx].deleted_at = getCurrentIso();
      list[idx].deleted_by = deletedBy;
      saveData(STORAGE_KEYS.ASSESSMENTS, list);
      await this.addAuditLog('SOFT_DELETE_ASSESSMENT', 'SESSION_ASSESSMENT', assessmentId, JSON.stringify(old), JSON.stringify(list[idx]), undefined, deletedBy, old.event_id);
    }
  }

  static async bulkSaveSessionAttendance(
    sessionConfigId: string,
    studentIds: string[],
    attendanceStatus: 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT',
    actorUserId?: string
  ): Promise<{ success: boolean; updatedCount: number; updatedAssessments: SessionAssessment[] }> {
    if (!isMockMode) {
      return apiPost<{ success: boolean; updatedCount: number; updatedAssessments: SessionAssessment[] }>(
        'bulkSaveSessionAttendance',
        { sessionConfigId, studentIds, attendanceStatus }
      );
    }

    const configs = loadData<SessionConfig[]>(STORAGE_KEYS.SESSION_CONFIGS, INITIAL_SESSION_CONFIGS);
    const sConfig = configs.find(sc => sc.session_config_id === sessionConfigId);
    if (!sConfig) {
      throw new Error('Konfigurasi sesi tidak ditemukan.');
    }

    const eventId = sConfig.event_id;
    const participants = loadData<EventParticipant[]>(STORAGE_KEYS.PARTICIPANTS, INITIAL_PARTICIPANTS).filter(p => p.event_id === eventId);
    const list = loadData<SessionAssessment[]>(STORAGE_KEYS.ASSESSMENTS, INITIAL_ASSESSMENTS);
    const nowIso = getCurrentIso();
    let updatedCount = 0;
    const updatedAssessments: SessionAssessment[] = [];

    studentIds.forEach(sid => {
      const participant = participants.find(p => p.student_id === sid);
      if (!participant) return;

      const existingIdx = list.findIndex(a =>
        !a.is_deleted &&
        a.event_id === eventId &&
        a.participant_id === participant.participant_id &&
        a.session_config_id === sessionConfigId
      );

      const isPresent = attendanceStatus === 'PRESENT';

      if (existingIdx >= 0) {
        const existing = list[existingIdx];
        const hasQuran = existing.surah_start != null && existing.surah_start !== ('' as any) && existing.lines_added != null;
        const hasIqra = existing.iqra_level != null && existing.iqra_page_start != null;

        const updated: SessionAssessment = {
          ...existing,
          attendance_status: attendanceStatus,
          assessment_status: isPresent ? ((hasQuran || hasIqra) ? 'COMPLETED' : 'PENDING') : 'COMPLETED',
          event_day_id: sConfig.event_day_id,
          session_no: sConfig.session_no,
          halaqah_id: participant.halaqah_id || existing.halaqah_id,
          student_id: participant.student_id,
          updated_at: nowIso,
          is_deleted: false,
          ...(isPresent ? {} : {
            surah_start: undefined,
            ayah_start: undefined,
            surah_end: undefined,
            ayah_end: undefined,
            lines_added: undefined,
            iqra_level: undefined,
            iqra_page_start: undefined,
            iqra_page_end: undefined
          })
        };
        list[existingIdx] = updated;
        updatedAssessments.push(updated);
        updatedCount++;
      } else {
        const newAsmId = 'ASM_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').substring(0, 16) : Math.random().toString(36).substring(2, 12));
        const newAsm: SessionAssessment = {
          assessment_id: newAsmId,
          event_id: eventId,
          event_day_id: sConfig.event_day_id,
          session_config_id: sConfig.session_config_id,
          participant_id: participant.participant_id,
          student_id: participant.student_id,
          halaqah_id: participant.halaqah_id || '',
          session_no: sConfig.session_no,
          attendance_status: attendanceStatus,
          assessment_status: isPresent ? 'PENDING' : 'COMPLETED',
          teacher_id: actorUserId || '',
          is_deleted: false,
          created_at: nowIso,
          updated_at: nowIso
        };
        list.push(newAsm);
        updatedAssessments.push(newAsm);
        updatedCount++;
      }
    });

    saveData(STORAGE_KEYS.ASSESSMENTS, list);
    await this.addAuditLog(
      'BULK_ATTENDANCE',
      'SESSION_ASSESSMENT',
      sessionConfigId,
      undefined,
      JSON.stringify({ sessionConfigId, studentCount: updatedCount, status: attendanceStatus }),
      `Presensi massal ${updatedCount} siswa (${attendanceStatus})`,
      actorUserId,
      eventId
    );

    return {
      success: true,
      updatedCount,
      updatedAssessments
    };
  }

  // Final Evaluations - UPSERT by event_id + participant_id
  static async getFinalEvaluations(eventId?: string): Promise<FinalEvaluation[]> {
    if (!isMockMode) {
      return apiPost<FinalEvaluation[]>('getFinalEvaluations', { eventId });
    }
    const evals = loadData<FinalEvaluation[]>(STORAGE_KEYS.FINAL_EVALUATIONS, INITIAL_FINAL_EVALUATIONS);
    if (eventId) {
      return evals.filter(e => e.event_id === eventId);
    }
    return evals;
  }

  static async saveFinalEvaluation(fe: FinalEvaluation, actorUserId?: string): Promise<FinalEvaluation> {
    if (!isMockMode) {
      return apiPost<FinalEvaluation>('saveFinalEvaluation', { finalEvaluation: fe });
    }
    const evals = loadData<FinalEvaluation[]>(STORAGE_KEYS.FINAL_EVALUATIONS, INITIAL_FINAL_EVALUATIONS);
    const idx = evals.findIndex(e => e.event_id === fe.event_id && (e.participant_id === fe.participant_id || e.student_id === fe.student_id));
    if (idx >= 0) {
      const old = evals[idx];
      const updatedItem: FinalEvaluation = {
        ...old,
        ...fe,
        final_evaluation_id: old.final_evaluation_id,
        updated_at: getCurrentIso()
      };
      evals[idx] = updatedItem;
      saveData(STORAGE_KEYS.FINAL_EVALUATIONS, evals);
      await this.addAuditLog('UPDATE_FINAL_EVALUATION', 'FINAL_EVALUATION', updatedItem.final_evaluation_id, JSON.stringify(old), JSON.stringify(updatedItem), undefined, actorUserId || fe.evaluator_teacher_id, fe.event_id);
      return updatedItem;
    } else {
      evals.push(fe);
      saveData(STORAGE_KEYS.FINAL_EVALUATIONS, evals);
      await this.addAuditLog('SAVE_FINAL_EVALUATION', 'FINAL_EVALUATION', fe.final_evaluation_id, undefined, JSON.stringify(fe), undefined, actorUserId || fe.evaluator_teacher_id, fe.event_id);
      return fe;
    }
  }

  // Audit Log
  static async getAuditLogs(): Promise<AuditLog[]> {
    if (!isMockMode) {
      return apiPost<AuditLog[]>('getAuditLogs');
    }
    return loadData(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
  }

  static async addAuditLog(
    action: string,
    entityType: string,
    entityId: string,
    oldData?: string,
    newData?: string,
    notes?: string,
    actorUserId?: string,
    eventId?: string
  ): Promise<void> {
    if (!isMockMode) {
      // Backend handles audit logging for write actions automatically
      return;
    }
    const logs = await this.getAuditLogs();
    const newLog: AuditLog = {
      log_id: `LOG${String(logs.length + 1).padStart(6, '0')}`,
      timestamp: getCurrentIso(),
      user_id: actorUserId || 'SYSTEM_USER',
      action,
      entity_type: entityType,
      entity_id: entityId,
      event_id: eventId,
      old_data_json: oldData,
      new_data_json: newData,
      notes
    };
    logs.unshift(newLog);
    saveData(STORAGE_KEYS.AUDIT_LOGS, logs);
  }

  // Draft Buffer for Offline Resilience
  static async saveDraftLocal(draftKey: string, draftData: any): Promise<void> {
    const drafts = loadData<Record<string, any>>(STORAGE_KEYS.DRAFTS, {});
    drafts[draftKey] = { data: draftData, timestamp: getCurrentIso() };
    saveData(STORAGE_KEYS.DRAFTS, drafts);
  }

  static async getDraftLocal(draftKey: string): Promise<any | null> {
    const drafts = loadData<Record<string, any>>(STORAGE_KEYS.DRAFTS, {});
    return drafts[draftKey]?.data || null;
  }

  static async clearDraftLocal(draftKey: string): Promise<void> {
    const drafts = loadData<Record<string, any>>(STORAGE_KEYS.DRAFTS, {});
    delete drafts[draftKey];
    saveData(STORAGE_KEYS.DRAFTS, drafts);
  }

  // Secure Individual Student Progress Lookup for Parents
  static async getStudentPublicProgress(input: string | { accessCode: string; nis?: string }, eventId?: string) {
    let reqAccessCode = '';
    let reqNis = '';

    if (typeof input === 'object' && input !== null) {
      reqAccessCode = (input.accessCode || '').trim();
      reqNis = (input.nis || '').trim();
    } else {
      reqAccessCode = String(input || '').trim();
    }

    if (!reqAccessCode) {
      return { success: false, message: 'Kode Akses wajib diisi untuk melihat perkembangan siswa.' };
    }

    if (!isMockMode) {
      try {
        const res = await apiPost<any>('publicStudentProgress', { accessCode: reqAccessCode, eventId });
        return { success: true, ...res };
      } catch (e: any) {
        return { success: false, message: e.message || 'Kode Akses siswa tidak ditemukan.' };
      }
    }

    // Mock Mode lookup
    const students = await this.getStudents();
    const cleanAccessCode = reqAccessCode.toLowerCase();
    const cleanNis = reqNis.toLowerCase();

    let matchedStudent = students.find(s => s.access_code.toLowerCase() === cleanAccessCode);

    if (!matchedStudent) {
      const nisStudent = students.find(s => s.nis.toLowerCase() === cleanAccessCode);
      if (nisStudent) {
        return {
          success: false,
          message: 'Demi keamanan data siswa, NIS saja tidak dapat digunakan. Silakan masukkan Kode Akses resmi (contoh: RT-K7M4Q9) yang tertera pada kartu atau surat edaran.'
        };
      }
      return { success: false, message: 'Kode Akses siswa tidak ditemukan. Periksa kembali penulisan kode Anda.' };
    }

    if (cleanNis && matchedStudent.nis.toLowerCase() !== cleanNis) {
      return { success: false, message: 'Kombinasi NIS dan Kode Akses tidak cocok.' };
    }

    const currentEvt = eventId ? (await this.getEvents()).find(e => e.event_id === eventId) : await this.getCurrentEvent();
    const event_id = currentEvt?.event_id;

    if (!event_id) {
      return { success: false, message: 'Kegiatan tidak aktif atau tidak ditemukan.' };
    }

    const participants = await this.getEventParticipants(event_id);
    const participant = participants.find(p => p.student_id === matchedStudent.student_id);

    if (!participant) {
      return { success: false, message: `Siswa tidak terdaftar sebagai peserta pada kegiatan ${currentEvt?.event_name}.` };
    }

    const allAssessments = await this.getSessionAssessments(event_id);
    const studentAssessments = allAssessments
      .filter(a => a.student_id === matchedStudent.student_id && !a.is_deleted)
      .sort((a, b) => a.session_no - b.session_no);

    const evals = await this.getFinalEvaluations(event_id);
    const studentEval = evals.find(e => e.student_id === matchedStudent.student_id || e.participant_id === participant.participant_id);

    const totalLinesAdded = studentAssessments
      .filter(a => a.attendance_status === 'PRESENT')
      .reduce((sum, a) => sum + (a.lines_added || 0), 0);

    const baselineSurahObj = participant.baseline_surah ? getSurahByNo(participant.baseline_surah) : null;
    const targetSurahStartObj = participant.target_surah_start ? getSurahByNo(participant.target_surah_start) : null;
    const targetSurahEndObj = participant.target_surah_end ? getSurahByNo(participant.target_surah_end) : null;

    const baselineText = baselineSurahObj 
      ? `${baselineSurahObj.surah_name} (Ayat 1–${participant.baseline_ayah || 1})`
      : 'Belum diisi';

    const targetText = (targetSurahStartObj && targetSurahEndObj)
      ? `${targetSurahStartObj.surah_name} Ayat ${participant.target_ayah_start || 1} s/d ${targetSurahEndObj.surah_name} Ayat ${participant.target_ayah_end || 1}`
      : 'Belum diisi';

    return {
      success: true,
      studentName: matchedStudent.full_name,
      nis: matchedStudent.nis,
      gradeClass: `${participant.grade_snapshot} (${participant.class_snapshot})`,
      eventName: currentEvt?.event_name || 'Rumah Tahfidz',
      baselineText,
      targetText,
      targetLines: participant.target_lines != null && participant.target_lines > 0 ? participant.target_lines : null,
      totalLinesAdded,
      completionStatus: studentEval ? studentEval.completion_status : ('NOT_EVALUATED' as EvaluationState),
      sessions: studentAssessments.map(a => {
        const isPresent = a.attendance_status === 'PRESENT';
        const sObj = isPresent && a.surah_start != null ? getSurahByNo(a.surah_start) : null;
        return {
          sessionNo: a.session_no,
          attendance: a.attendance_status,
          surahName: isPresent ? (sObj?.surah_name || (a.surah_start ? `Surah #${a.surah_start}` : null)) : null,
          ayahRange: isPresent && a.ayah_start != null && a.ayah_end != null ? `${a.ayah_start}–${a.ayah_end}` : null,
          linesAdded: isPresent && a.lines_added != null ? a.lines_added : null
        };
      })
    };
  }

  // Teacher Halaqah Group Data Helper
  static async getMyHalaqahData(teacherId: string, eventId?: string, selectedHalaqahId?: string) {
    if (!teacherId || teacherId.trim() === '') {
      return { halaqah: null, students: [], sessions: [], sessionConfigs: [] };
    }

    if (!isMockMode) {
      return apiPost<any>('getMyHalaqahData', { teacherId, eventId, selectedHalaqahId });
    }

    const currentEvt = eventId ? (await this.getEvents()).find(e => e.event_id === eventId) : await this.getCurrentEvent();
    const event_id = currentEvt?.event_id;

    if (!event_id) {
      return { halaqah: null, students: [], sessions: [], sessionConfigs: [] };
    }

    const halaqahList = await this.getHalaqahList(event_id);
    const halaqahTeachers = await this.getHalaqahTeachers(event_id);
    const teachers = await this.getTeachers();
    
    const teacherAssgn = halaqahTeachers.find(ht => ht.teacher_id === teacherId && ht.active);
    if (!teacherAssgn) {
      return { halaqah: null, students: [], sessions: [], sessionConfigs: [] };
    }

    const currentHalaqah = halaqahList.find(h => h.halaqah_id === teacherAssgn.halaqah_id && h.active);
    if (!currentHalaqah) {
      return { halaqah: null, students: [], sessions: [], sessionConfigs: [] };
    }

    const teacherObj = teachers.find(t => t.teacher_id === teacherId);

    const allParticipants = await this.getEventParticipants(event_id);
    const halaqahParticipants = allParticipants.filter(p => p.halaqah_id === currentHalaqah.halaqah_id);
    const studentIdsInHalaqah = new Set(halaqahParticipants.map(p => p.student_id));

    const students = await this.getStudents();
    const allAssessments = await this.getSessionAssessments(event_id);
    const halaqahAssessments = allAssessments.filter(a => a.halaqah_id === currentHalaqah.halaqah_id || studentIdsInHalaqah.has(a.student_id));

    const linesMap = getStudentLinesMap(halaqahAssessments);
    const evals = await this.getFinalEvaluations(event_id);

    const mappedStudents = halaqahParticipants.map(p => {
      const st = students.find(s => s.student_id === p.student_id);
      const studentEval = evals.find(e => e.student_id === p.student_id || e.participant_id === p.participant_id);
      return {
        student_id: p.student_id,
        participant_id: p.participant_id,
        nis: st?.nis || '',
        full_name: st?.full_name || 'Siswa',
        access_code: st?.access_code || '',
        grade_class: `${p.grade_snapshot} (${p.class_snapshot})`,
        target_lines: p.target_lines,
        target_iqra_pages: p.target_iqra_pages,
        target_source: p.target_source,
        targetText: formatParticipantTarget(p),
        totalLinesAdded: linesMap[p.student_id] || 0,
        completionStatus: studentEval ? studentEval.completion_status : ('NOT_EVALUATED' as EvaluationState)
      };
    });

    const allSessionConfigs = await this.getSessionConfigs(event_id);
    const sessionConfigs = currentHalaqah.session_group_id
      ? allSessionConfigs.filter(sc => sc.session_group_id === currentHalaqah.session_group_id)
      : allSessionConfigs;

    return {
      halaqah: {
        halaqah_id: currentHalaqah.halaqah_id,
        group_name: currentHalaqah.halaqah_name,
        teacher_name: teacherObj?.full_name || 'Guru Tahfidz',
        session_group_id: currentHalaqah.session_group_id
      },
      students: mappedStudents,
      sessions: halaqahAssessments,
      sessionConfigs
    };
  }

  // Submit Session Assessment Helper
  static async submitSessionAssessment(payload: any, actorUserId?: string) {
    if (!payload.student_id && !payload.participant_id) {
      throw new Error('Siswa / Peserta wajib dipilih.');
    }

    const currentEvt = payload.event_id 
      ? (await this.getEvents()).find(e => e.event_id === payload.event_id)
      : await this.getCurrentEvent();
    
    const event_id = currentEvt?.event_id;
    if (!event_id) throw new Error('Event aktif tidak ditemukan.');

    const participants = await this.getEventParticipants(event_id);
    const participant = participants.find(p => 
      (payload.participant_id && p.participant_id === payload.participant_id) ||
      (payload.student_id && p.student_id === payload.student_id)
    );

    if (!participant) {
      throw new Error('Siswa tidak terdaftar sebagai peserta aktif pada kegiatan ini.');
    }

    const sessionConfigs = await this.getSessionConfigs(event_id);
    let matchingConfig = payload.session_config_id 
      ? sessionConfigs.find(sc => sc.session_config_id === payload.session_config_id)
      : null;

    if (!matchingConfig && payload.session_no) {
      matchingConfig = sessionConfigs.find(sc => 
        sc.session_no === Number(payload.session_no) &&
        (participant.session_group_id ? sc.session_group_id === participant.session_group_id : true)
      ) || sessionConfigs.find(sc => sc.session_no === Number(payload.session_no));
    }

    if (!matchingConfig) {
      throw new Error(`Pengaturan sesi #${payload.session_no || 1} tidak ditemukan untuk grup sesi ini.`);
    }

    const teacherId = (payload.teacher_id || '').trim();
    if (isMockMode && !teacherId) {
      throw new Error('ID Guru (teacher_id) wajib diisi.');
    }

    const attendanceStatus: AttendanceStatus = payload.attendance_status || payload.attendance || 'UNASSESSED';

    let surah_start: number | undefined;
    let ayah_start: number | undefined;
    let surah_end: number | undefined;
    let ayah_end: number | undefined;
    let lines_added: number | undefined;

    if (attendanceStatus === 'PRESENT') {
      const sStart = payload.surah_start ?? payload.start_surah;
      const aStart = payload.ayah_start ?? payload.start_ayah;
      const sEnd = payload.surah_end ?? payload.end_surah;
      const aEnd = payload.ayah_end ?? payload.end_ayah;
      const rawLines = payload.lines_added ?? payload.totalLines;

      if (sStart == null || aStart == null || sEnd == null || aEnd == null) {
        throw new Error('Untuk status HADIR, data Surah dan Ayat (awal & akhir) wajib diisi.');
      }
      if (rawLines == null) {
        throw new Error('Untuk status HADIR, jumlah baris (lines_added) wajib diisi.');
      }

      surah_start = Number(sStart);
      ayah_start = Number(aStart);
      surah_end = Number(sEnd);
      ayah_end = Number(aEnd);
      lines_added = Number(rawLines);
    } else {
      surah_start = undefined;
      ayah_start = undefined;
      surah_end = undefined;
      ayah_end = undefined;
      lines_added = undefined;
    }

    const asm: SessionAssessment = {
      assessment_id: `ASM-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      event_id: event_id,
      event_day_id: matchingConfig.event_day_id,
      session_config_id: matchingConfig.session_config_id,
      participant_id: participant.participant_id,
      student_id: participant.student_id,
      halaqah_id: participant.halaqah_id,
      session_no: matchingConfig.session_no,
      attendance_status: attendanceStatus,
      surah_start,
      ayah_start,
      surah_end,
      ayah_end,
      lines_added,
      session_note: payload.notes || payload.session_note || '',
      teacher_id: teacherId,
      is_deleted: false,
      created_at: getCurrentIso(),
      updated_at: getCurrentIso()
    };

    return this.saveSessionAssessment(asm, actorUserId || teacherId);
  }

  // Submit Final Evaluation Helper
  static async submitFinalEvaluation(payload: any, actorUserId?: string) {
    if (!payload.student_id && !payload.participant_id) {
      throw new Error('Siswa / Peserta wajib dipilih.');
    }

    const currentEvt = payload.event_id 
      ? (await this.getEvents()).find(e => e.event_id === payload.event_id)
      : await this.getCurrentEvent();

    const event_id = currentEvt?.event_id;
    if (!event_id) throw new Error('Event aktif tidak ditemukan.');

    const participants = await this.getEventParticipants(event_id);
    const participant = participants.find(p => 
      (payload.participant_id && p.participant_id === payload.participant_id) ||
      (payload.student_id && p.student_id === payload.student_id)
    );

    if (!participant) {
      throw new Error('Siswa tidak terdaftar sebagai peserta aktif pada kegiatan ini.');
    }

    const teacherId = (payload.evaluator_teacher_id || payload.teacher_id || '').trim();
    if (isMockMode && !teacherId) {
      throw new Error('ID Guru Evaluator (evaluator_teacher_id) wajib diisi.');
    }

    if (!payload.completion_status || payload.completion_status === 'NOT_EVALUATED') {
      throw new Error('Status ketuntasan (completion_status) wajib diisi.');
    }
    if (!payload.skill_status_end) {
      throw new Error('Kategori skill akhir (skill_status_end) wajib diisi.');
    }

    const sStart = payload.evaluation_surah_start ?? payload.start_surah;
    const aStart = payload.evaluation_ayah_start ?? payload.start_ayah;
    const sEnd = payload.evaluation_surah_end ?? payload.end_surah;
    const aEnd = payload.evaluation_ayah_end ?? payload.end_ayah;

    if (sStart == null || aStart == null || sEnd == null || aEnd == null) {
      throw new Error('Jangkauan Surah dan Ayat evaluasi akhir wajib diisi.');
    }

    const fe: FinalEvaluation = {
      final_evaluation_id: `FEVAL-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      event_id: event_id,
      participant_id: participant.participant_id,
      student_id: participant.student_id,
      evaluation_surah_start: Number(sStart),
      evaluation_ayah_start: Number(aStart),
      evaluation_surah_end: Number(sEnd),
      evaluation_ayah_end: Number(aEnd),
      final_score: payload.final_score != null && payload.final_score !== '' ? Number(payload.final_score) : undefined,
      completion_status: payload.completion_status as CompletionStatus,
      skill_status_end: payload.skill_status_end as SkillStatus,
      affective_rating: payload.affective_rating || undefined,
      affective_note: payload.affective_note || '',
      final_note: payload.evaluator_notes || payload.final_note || '',
      evaluator_teacher_id: teacherId,
      created_at: getCurrentIso(),
      updated_at: getCurrentIso()
    };

    return this.saveFinalEvaluation(fe, actorUserId || teacherId);
  }

  // Admin Operational Command Center Overview Helper
  static async getAdminOverview(eventId?: string) {
    if (!isMockMode) {
      return apiPost<any>('getAdminOverview', { eventId });
    }
    const activeEvt = eventId ? (await this.getEvents()).find(e => e.event_id === eventId) : await this.getCurrentEvent();
    const event_id = activeEvt?.event_id;

    if (!event_id) {
      return {
        activeEvent: null,
        metrics: { totalStudents: 0, totalHalaqahs: 0, inputCompletionRate: 0 },
        teachersProgress: [],
        anomalies: []
      };
    }

    const participants = await this.getEventParticipants(event_id);
    const halaqahs = await this.getHalaqahList(event_id);
    const assessments = await this.getSessionAssessments(event_id);
    const sessionConfigs = await this.getSessionConfigs(event_id);
    const halaqahTeachers = await this.getHalaqahTeachers(event_id);
    const teachers = await this.getTeachers();

    const totalStudents = participants.length;
    const totalHalaqahs = halaqahs.length;

    let totalExpectedAssessments = 0;
    participants.forEach(p => {
      if (p.session_group_id && p.session_group_id.trim() !== '') {
        const activeConfigsForGroup = sessionConfigs.filter(sc => 
          sc.active && sc.session_group_id === p.session_group_id
        );
        totalExpectedAssessments += activeConfigsForGroup.length;
      }
    });

    const actualAssessmentsCount = assessments.length;
    const inputCompletionRate = totalExpectedAssessments > 0 
      ? Math.min(100, Number(((actualAssessmentsCount / totalExpectedAssessments) * 100).toFixed(1)))
      : 0;

    const teachersProgress = halaqahTeachers.filter(ht => ht.active).map(ht => {
      const teacherObj = teachers.find(t => t.teacher_id === ht.teacher_id);
      const halaqahObj = halaqahs.find(h => h.halaqah_id === ht.halaqah_id);
      
      const groupParticipants = participants.filter(p => p.halaqah_id === ht.halaqah_id);
      let expectedForGroup = 0;
      groupParticipants.forEach(p => {
        if (p.session_group_id && p.session_group_id.trim() !== '') {
          const configs = sessionConfigs.filter(sc => 
            sc.active && sc.session_group_id === p.session_group_id
          );
          expectedForGroup += configs.length;
        }
      });

      const actualForGroup = assessments.filter(a => a.halaqah_id === ht.halaqah_id).length;
      const percentage = expectedForGroup > 0 
        ? Math.min(100, Math.round((actualForGroup / expectedForGroup) * 100))
        : 100;

      return {
        teacherName: teacherObj?.full_name || 'Guru Tahfidz',
        groupName: halaqahObj?.halaqah_name || 'Halaqah',
        completedSessions: actualForGroup,
        totalSessions: expectedForGroup,
        percentage
      };
    });

    const students = await this.getStudents();
    const anomalies: any[] = [];

    assessments.forEach(a => {
      if (a.lines_added > 40) {
        const st = students.find(s => s.student_id === a.student_id);
        anomalies.push({
          studentName: st?.full_name || 'Siswa',
          sessionNo: a.session_no,
          description: `Setoran melampaui ${a.lines_added} baris dalam 1 sesi (perlu verifikasi)`
        });
      }
    });

    return {
      activeEvent: activeEvt,
      metrics: {
        totalStudents,
        totalHalaqahs,
        inputCompletionRate
      },
      teachersProgress,
      anomalies
    };
  }

  // Operational Completeness Checker for Administrators
  static async getCompletenessReport(eventId?: string) {
    if (!isMockMode) {
      return apiPost<any>('getCompletenessReport', { eventId });
    }
    const activeEvt = eventId ? (await this.getEvents()).find(e => e.event_id === eventId) : await this.getCurrentEvent();
    const event_id = activeEvt?.event_id;

    if (!event_id) {
      return {
        event: null,
        counts: { totalParticipants: 0, withoutHalaqahCount: 0, withoutSessionGroupCount: 0, withoutBaselineCount: 0, withoutTargetCount: 0, withoutFinalEvalCount: 0 },
        issues: { withoutHalaqah: [], withoutSessionGroup: [], withoutBaseline: [], withoutTarget: [], withoutFinalEval: [] },
        halaqahReports: []
      };
    }

    const participants = await this.getEventParticipants(event_id);
    const students = await this.getStudents();
    const halaqahs = await this.getHalaqahList(event_id);
    const assessments = await this.getSessionAssessments(event_id);
    const evals = await this.getFinalEvaluations(event_id);
    const sessionConfigs = await this.getSessionConfigs(event_id);

    const withoutHalaqah = participants.filter(p => !p.halaqah_id || p.halaqah_id.trim() === '');
    const withoutSessionGroup = participants.filter(p => !p.session_group_id || p.session_group_id.trim() === '');
    const withoutBaseline = participants.filter(p => p.baseline_surah == null || p.baseline_ayah == null);
    const withoutTarget = participants.filter(p => p.target_surah_start == null || p.target_lines == null || p.target_lines === 0);
    const withoutFinalEval = participants.filter(p => !evals.some(e => e.student_id === p.student_id || e.participant_id === p.participant_id));

    const halaqahReports = halaqahs.map(h => {
      const hParts = participants.filter(p => p.halaqah_id === h.halaqah_id);
      let expectedRecordCount = 0;
      hParts.forEach(p => {
        if (p.session_group_id && p.session_group_id.trim() !== '') {
          const configs = sessionConfigs.filter(sc => 
            sc.active && sc.session_group_id === p.session_group_id
          );
          expectedRecordCount += configs.length;
        }
      });

      const actualAsms = assessments.filter(a => a.halaqah_id === h.halaqah_id);
      const missingCount = Math.max(0, expectedRecordCount - actualAsms.length);
      const percentage = expectedRecordCount > 0 ? Math.round((actualAsms.length / expectedRecordCount) * 100) : 100;

      return {
        halaqah_id: h.halaqah_id,
        halaqah_name: h.halaqah_name,
        studentCount: hParts.length,
        submittedSessions: actualAsms.length,
        expectedSessions: expectedRecordCount,
        missingCount,
        percentage: Math.min(100, percentage)
      };
    });

    return {
      event: activeEvt,
      counts: {
        totalParticipants: participants.length,
        withoutHalaqahCount: withoutHalaqah.length,
        withoutSessionGroupCount: withoutSessionGroup.length,
        withoutBaselineCount: withoutBaseline.length,
        withoutTargetCount: withoutTarget.length,
        withoutFinalEvalCount: withoutFinalEval.length,
      },
      issues: {
        withoutHalaqah: withoutHalaqah.map(p => ({
          student_id: p.student_id,
          name: students.find(s => s.student_id === p.student_id)?.full_name || 'Siswa',
          class: `${p.grade_snapshot} (${p.class_snapshot})`
        })),
        withoutSessionGroup: withoutSessionGroup.map(p => ({
          student_id: p.student_id,
          name: students.find(s => s.student_id === p.student_id)?.full_name || 'Siswa',
          class: `${p.grade_snapshot} (${p.class_snapshot})`
        })),
        withoutBaseline: withoutBaseline.map(p => ({
          student_id: p.student_id,
          name: students.find(s => s.student_id === p.student_id)?.full_name || 'Siswa'
        })),
        withoutTarget: withoutTarget.map(p => ({
          student_id: p.student_id,
          name: students.find(s => s.student_id === p.student_id)?.full_name || 'Siswa'
        })),
        withoutFinalEval: withoutFinalEval.map(p => ({
          student_id: p.student_id,
          name: students.find(s => s.student_id === p.student_id)?.full_name || 'Siswa'
        }))
      },
      halaqahReports
    };
  }

  // Executive Analytics Method
  static async getExecutiveAnalytics(params: {
    academicYearFilter?: string;
    eventId?: string;
    analyticsMode?: 'SINGLE' | 'ANNUAL' | 'COHORT' | 'SKILL';
    gradeFilter?: string;
    genderFilter?: string;
    halaqahFilter?: string;
  }) {
    if (!isMockMode) {
      return apiPost<any>('getExecutiveAnalytics', params);
    }
    const allEvents = await this.getEvents();
    
    const filteredEvents = (params.academicYearFilter && params.academicYearFilter !== 'ALL')
      ? allEvents.filter(e => e.academic_year === params.academicYearFilter)
      : allEvents;

    const students = await this.getStudents();
    const studentMap = new Map(students.map(s => [s.student_id, s]));

    const filterParticipants = (parts: EventParticipant[]) => {
      return parts.filter(p => {
        const st = studentMap.get(p.student_id);
        if (!st) return false;

        if (params.gradeFilter && params.gradeFilter !== 'ALL') {
          if (p.grade_snapshot !== params.gradeFilter && st.grade_level !== params.gradeFilter) return false;
        }
        if (params.genderFilter && params.genderFilter !== 'ALL') {
          if (st.gender !== params.genderFilter) return false;
        }
        if (params.halaqahFilter && params.halaqahFilter !== 'ALL') {
          if (p.halaqah_id !== params.halaqahFilter) return false;
        }
        return true;
      });
    };

    let cohortStudentIds: Set<string> | null = null;
    if (params.analyticsMode === 'COHORT') {
      const eventStudentSets = await Promise.all(
        filteredEvents.map(async evt => {
          const rawParts = await this.getEventParticipants(evt.event_id);
          const fp = filterParticipants(rawParts);
          return new Set(fp.map(p => p.student_id));
        })
      );

      if (eventStudentSets.length > 0) {
        cohortStudentIds = new Set(
          [...eventStudentSets[0]].filter(sid => eventStudentSets.every(set => set.has(sid)))
        );
      } else {
        cohortStudentIds = new Set();
      }
    }

    const targetEvent = params.eventId
      ? (filteredEvents.find(e => e.event_id === params.eventId) || allEvents.find(e => e.event_id === params.eventId) || await this.getCurrentEvent())
      : await this.getCurrentEvent();

    const targetEventId = targetEvent?.event_id;

    const computeEventMetrics = async (evtId: string) => {
      const rawParts = await this.getEventParticipants(evtId);
      let participants = filterParticipants(rawParts);

      if (cohortStudentIds) {
        participants = participants.filter(p => cohortStudentIds!.has(p.student_id));
      }

      const assessments = await this.getSessionAssessments(evtId);
      const evaluations = await this.getFinalEvaluations(evtId);

      const studentAsmMap = new Map<string, SessionAssessment[]>();
      assessments.filter(a => !a.is_deleted).forEach(a => {
        const existing = studentAsmMap.get(a.student_id) || [];
        existing.push(a);
        studentAsmMap.set(a.student_id, existing);
      });

      const validProgressLines: number[] = [];
      let missingProgressCount = 0;

      participants.forEach(p => {
        const asms = studentAsmMap.get(p.student_id);
        if (asms && asms.length > 0) {
          const presentAsms = asms.filter(a => a.attendance_status === 'PRESENT');
          if (presentAsms.length > 0) {
            const totalLines = presentAsms.reduce((sum, a) => sum + (a.lines_added || 0), 0);
            validProgressLines.push(totalLines);
          } else {
            missingProgressCount++;
          }
        } else {
          missingProgressCount++;
        }
      });

      const participantCount = participants.length;
      const validProgressCount = validProgressLines.length;

      const stats = calculateStats(validProgressLines);
      const distributionBuckets = getDistributionBuckets(validProgressLines);

      const evalMap: Record<string, SkillStatus> = {};
      const completionMap = new Map<string, CompletionStatus>();

      evaluations.forEach(e => {
        evalMap[e.student_id] = e.skill_status_end;
        evalMap[e.participant_id] = e.skill_status_end;
        completionMap.set(e.student_id, e.completion_status);
        completionMap.set(e.participant_id, e.completion_status);
      });

      let evaluatedCount = 0;
      let notEvaluatedCount = 0;
      let completedCount = 0;
      let incompleteCount = 0;

      participants.forEach(p => {
        const compStatus = completionMap.get(p.student_id) || completionMap.get(p.participant_id);
        if (compStatus) {
          evaluatedCount++;
          if (compStatus === 'COMPLETE') completedCount++;
          else incompleteCount++;
        } else {
          notEvaluatedCount++;
        }
      });

      const evaluationCoverage = participantCount > 0
        ? Number(((evaluatedCount / participantCount) * 100).toFixed(1))
        : 0;

      const completionRateAmongEvaluated = evaluatedCount > 0
        ? Number(((completedCount / evaluatedCount) * 100).toFixed(1))
        : 0;

      stats.completionRate = completionRateAmongEvaluated;

      const { transitions: skillTransitions, notEvaluatedSkillCount } = calculateSkillTransitions(participants, evalMap);

      return {
        participantCount,
        validProgressCount,
        missingProgressCount,
        evaluatedCount,
        notEvaluatedCount,
        evaluationCoverage,
        completedCount,
        incompleteCount,
        completionRateAmongEvaluated,
        stats,
        distributionBuckets,
        skillTransitions,
        notEvaluatedSkillCount,
        participants
      };
    };

    if (params.analyticsMode === 'ANNUAL') {
      const sortedEvents = [...filteredEvents].sort((a, b) => a.sequence_no - b.sequence_no);
      const annualData = await Promise.all(
        sortedEvents.map(async evt => {
          const metrics = await computeEventMetrics(evt.event_id);
          return {
            eventId: evt.event_id,
            eventName: evt.event_name,
            academicYear: evt.academic_year,
            sequenceNo: evt.sequence_no,
            participantCount: metrics.participantCount,
            validProgressCount: metrics.validProgressCount,
            missingProgressCount: metrics.missingProgressCount,
            evaluatedCount: metrics.evaluatedCount,
            completedCount: metrics.completedCount,
            incompleteCount: metrics.incompleteCount,
            evaluationCoverage: metrics.evaluationCoverage,
            completionRateAmongEvaluated: metrics.completionRateAmongEvaluated,
            stats: metrics.stats,
            totalLines: metrics.stats.totalLines,
            meanLines: metrics.stats.mean,
            medianLines: metrics.stats.median,
            stdDev: metrics.stats.stdDev,
            cv: metrics.stats.cv
          };
        })
      );

      return {
        mode: 'ANNUAL',
        eventsCount: sortedEvents.length,
        annualData
      };
    }

    if (params.analyticsMode === 'COHORT') {
      const sortedEvents = [...filteredEvents].sort((a, b) => a.sequence_no - b.sequence_no);
      const cohortData = await Promise.all(
        sortedEvents.map(async evt => {
          const metrics = await computeEventMetrics(evt.event_id);
          return {
            eventId: evt.event_id,
            eventName: evt.event_name,
            academicYear: evt.academic_year,
            sequenceNo: evt.sequence_no,
            participantCount: metrics.participantCount,
            validProgressCount: metrics.validProgressCount,
            missingProgressCount: metrics.missingProgressCount,
            evaluatedCount: metrics.evaluatedCount,
            completedCount: metrics.completedCount,
            incompleteCount: metrics.incompleteCount,
            evaluationCoverage: metrics.evaluationCoverage,
            completionRateAmongEvaluated: metrics.completionRateAmongEvaluated,
            stats: metrics.stats,
            totalLines: metrics.stats.totalLines,
            meanLines: metrics.stats.mean,
            medianLines: metrics.stats.median,
            stdDev: metrics.stats.stdDev,
            cv: metrics.stats.cv
          };
        })
      );

      const targetMetrics = targetEventId ? await computeEventMetrics(targetEventId) : null;

      return {
        mode: 'COHORT',
        eventsCount: sortedEvents.length,
        cohortSize: cohortStudentIds ? cohortStudentIds.size : 0,
        cohortData,
        event: targetEvent,
        ...(targetMetrics || {})
      };
    }

    if (!targetEventId) {
      return {
        mode: params.analyticsMode || 'SINGLE',
        event: null,
        participantCount: 0,
        validProgressCount: 0,
        missingProgressCount: 0,
        evaluatedCount: 0,
        notEvaluatedCount: 0,
        evaluationCoverage: 0,
        completedCount: 0,
        incompleteCount: 0,
        completionRateAmongEvaluated: 0,
        stats: calculateStats([]),
        distributionBuckets: [],
        skillTransitions: [],
        notEvaluatedSkillCount: 0,
        cohortSize: cohortStudentIds ? cohortStudentIds.size : 0
      };
    }

    const targetMetrics = await computeEventMetrics(targetEventId);

    return {
      mode: params.analyticsMode || 'SINGLE',
      event: targetEvent,
      ...targetMetrics,
      cohortSize: cohortStudentIds ? cohortStudentIds.size : 0
    };
  }

  // Smart Halaqah Distribution Generator (Proposal Preview)
  static async generateSmartHalaqahProposal(eventId: string, config: { maxGroupSize?: number; balanceGender?: boolean; balanceSkill?: boolean }) {
    const participants = await this.getEventParticipants(eventId);
    const students = await this.getStudents();
    const maxGroupSize = config.maxGroupSize || 8;

    const ikhwanList = participants.filter(p => {
      const st = students.find(s => s.student_id === p.student_id);
      return st?.gender === 'IKHWAN';
    });

    const akhwatList = participants.filter(p => {
      const st = students.find(s => s.student_id === p.student_id);
      return st?.gender === 'AKHWAT';
    });

    const proposedGroups: any[] = [];
    let groupIndex = 1;

    for (let i = 0; i < ikhwanList.length; i += maxGroupSize) {
      const slice = ikhwanList.slice(i, i + maxGroupSize);
      proposedGroups.push({
        id: `PROP-IKH-${groupIndex}`,
        name: `Halaqah Proposal ${groupIndex} (Ikhwan)`,
        gender: 'IKHWAN',
        studentCount: slice.length,
        students: slice.map(p => ({
          student_id: p.student_id,
          name: students.find(s => s.student_id === p.student_id)?.full_name || 'Siswa',
          skill: p.skill_status_start
        }))
      });
      groupIndex++;
    }

    for (let i = 0; i < akhwatList.length; i += maxGroupSize) {
      const slice = akhwatList.slice(i, i + maxGroupSize);
      proposedGroups.push({
        id: `PROP-AKH-${groupIndex}`,
        name: `Halaqah Proposal ${groupIndex} (Akhwat)`,
        gender: 'AKHWAT',
        studentCount: slice.length,
        students: slice.map(p => ({
          student_id: p.student_id,
          name: students.find(s => s.student_id === p.student_id)?.full_name || 'Siswa',
          skill: p.skill_status_start
        }))
      });
      groupIndex++;
    }

    return {
      totalStudents: participants.length,
      maxGroupSize,
      totalProposedGroups: proposedGroups.length,
      proposedGroups
    };
  }
}
