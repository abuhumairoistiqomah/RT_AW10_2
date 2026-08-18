import { SessionConfig, EventDay } from '../types';
import { ApiService } from '../services/api';

/**
 * Resolves the visible day label for a session config using 07A_EVENT_DAYS.day_name.
 * Joins 09_SESSION_CONFIG.event_day_id with 07A_EVENT_DAYS.event_day_id.
 * Fallback: If day_name is missing, fallback to "Hari {day_no}".
 * Never returns a blank day label.
 */
export function getSessionDayLabel(eventDayId?: string, eventDays?: EventDay[]): string {
  if (!eventDayId) return 'Hari 1';

  const dayObj = (eventDays || []).find(d => d.event_day_id === eventDayId);
  
  if (dayObj) {
    if (dayObj.day_name && dayObj.day_name.trim() !== '') {
      return dayObj.day_name.trim();
    }
    if (dayObj.day_no != null && dayObj.day_no !== ('' as any)) {
      return `Hari ${dayObj.day_no}`;
    }
  }

  // Fallback if eventDayId has pattern like D01, D1, or day number
  const match = eventDayId.match(/D0*(\d+)/i) || eventDayId.match(/(\d+)/);
  if (match && match[1]) {
    return `Hari ${parseInt(match[1], 10)}`;
  }

  return 'Hari 1';
}

/**
 * Formats time range with en-dash (e.g. "08:00–09:00").
 * Returns empty string if time is not available.
 */
export function formatSessionTimeRange(startTime?: string, endTime?: string): string {
  const normStart = ApiService.normalizeClockTime(startTime);
  const normEnd = ApiService.normalizeClockTime(endTime);

  if (normStart && normEnd) {
    return `${normStart}–${normEnd}`;
  }
  if (normStart) {
    return normStart;
  }
  return '';
}

/**
 * Helper to determine if a session config is active.
 * Handles boolean, string ('TRUE'/'FALSE'), number (1/0) representations.
 */
export function isSessionActive(active: any): boolean {
  if (active === false || active === 'FALSE' || active === 'false' || active === 0 || active === '0') {
    return false;
  }
  return true;
}

/**
 * Authoritative Business Rule:
 * The FINAL EVALUATION session is ALWAYS the LAST ACTIVE session
 * available for the student's / halaqah's Session Group (event_id + session_group_id).
 *
 * Filter: active === TRUE
 * Highest: session_no
 *
 * Example:
 * Group A (1, 2, 3, 4, 5) -> Session 5 = Final Evaluation
 * Group B (1, 2, 3, 4) -> Session 4 = Final Evaluation
 * Group C (1, 2, 3, 4, 5, 6, 7) -> Session 7 = Final Evaluation
 */
export function isFinalEvaluationSession(
  selectedSession?: SessionConfig | null,
  availableSessionConfigs?: SessionConfig[]
): boolean {
  if (!selectedSession) return false;
  if (!isSessionActive(selectedSession.active)) return false;

  if (!availableSessionConfigs || availableSessionConfigs.length === 0) {
    // If no session configs list is provided, fallback to session_type if explicitly set
    return selectedSession.session_type === 'FINAL_EVALUATION';
  }

  // Filter sessions in the SAME event_id and session_group_id that are active
  const sameGroupSessions = availableSessionConfigs.filter(s => {
    if (!s) return false;
    if (!isSessionActive(s.active)) return false;

    if (selectedSession.event_id && s.event_id && selectedSession.event_id !== s.event_id) {
      return false;
    }
    if (selectedSession.session_group_id && s.session_group_id && selectedSession.session_group_id !== s.session_group_id) {
      return false;
    }
    return true;
  });

  if (sameGroupSessions.length === 0) {
    return selectedSession.session_type === 'FINAL_EVALUATION';
  }

  const maxSessionNo = Math.max(
    ...sameGroupSessions.map(s => Number(s.session_no) || 0)
  );

  return Number(selectedSession.session_no) === maxSessionNo && maxSessionNo > 0;
}

/**
 * Standard Desktop / Tablet Session Option Label:
 * Regular: {day_name} • Sesi {session_no} • {start_time}–{end_time}
 * Final Evaluation: {day_name} • Sesi {session_no} • Evaluasi Akhir • {start_time}–{end_time}
 * Examples:
 * "Kamis • Sesi 4 • 19:15–20:15"
 * "Jumat • Sesi 5 • Evaluasi Akhir • 09:00–09:30"
 */
export function formatSessionOptionLabel(
  sc: SessionConfig,
  eventDays?: EventDay[],
  includeSecondaryName = false,
  allConfigs?: SessionConfig[]
): string {
  const dayName = getSessionDayLabel(sc.event_day_id, eventDays);
  const timeRange = formatSessionTimeRange(sc.start_time, sc.end_time);
  const isFinalEval = isFinalEvaluationSession(sc, allConfigs);
  
  const timePart = timeRange ? ` • ${timeRange}` : '';
  const evalPart = isFinalEval ? ' • Evaluasi Akhir' : '';
  const baseLabel = `${dayName} • Sesi ${sc.session_no}${evalPart}${timePart}`;

  if (includeSecondaryName && sc.session_name) {
    const cleanName = sc.session_name.trim();
    if (cleanName && !cleanName.toLowerCase().match(/^sesi\s*\d+$/i) && cleanName.toLowerCase() !== 'evaluasi akhir') {
      return `${baseLabel} (${cleanName})`;
    }
  }

  return baseLabel;
}

/**
 * Formats mobile display parts for selected session:
 * Line 1: {day_name} • Sesi {session_no} (• Evaluasi Akhir)
 * Line 2: {start_time}–{end_time}
 * Line 3: {session_name} (secondary)
 */
export function getMobileSessionDisplay(
  sc: SessionConfig,
  eventDays?: EventDay[],
  allConfigs?: SessionConfig[]
): {
  primary: string; // e.g. "Kamis • Sesi 4" or "Jumat • Sesi 5 • Evaluasi Akhir"
  time: string;    // e.g. "08:00–09:00"
  secondaryName?: string; // e.g. "Akselerasi Hafalan / Bacaan"
  isFinalEvaluation?: boolean;
} {
  const dayName = getSessionDayLabel(sc.event_day_id, eventDays);
  const time = formatSessionTimeRange(sc.start_time, sc.end_time);
  const isFinalEvaluation = isFinalEvaluationSession(sc, allConfigs);
  const primary = isFinalEvaluation 
    ? `${dayName} • Sesi ${sc.session_no} • Evaluasi Akhir`
    : `${dayName} • Sesi ${sc.session_no}`;
  
  let secondaryName: string | undefined = undefined;
  if (sc.session_name) {
    const cleanName = sc.session_name.trim();
    if (cleanName && !cleanName.toLowerCase().match(/^sesi\s*\d+$/i) && cleanName.toLowerCase() !== 'evaluasi akhir') {
      secondaryName = cleanName;
    }
  }

  return { primary, time, secondaryName, isFinalEvaluation };
}

/**
 * Returns structured compact summary for selected session:
 * dayName: "Kamis"
 * sessionTime: "Sesi 4 • 08:00–09:00" (or "Sesi 5 • Evaluasi Akhir • 09:00–09:30")
 * sessionName: "Akselerasi Hafalan / Bacaan"
 * isFinalEvaluation: boolean
 */
export function getSessionSummaryDetails(
  sc: SessionConfig,
  eventDays?: EventDay[],
  allConfigs?: SessionConfig[]
): {
  dayName: string;
  sessionTime: string;
  sessionName?: string;
  isFinalEvaluation: boolean;
} {
  const dayName = getSessionDayLabel(sc.event_day_id, eventDays);
  const time = formatSessionTimeRange(sc.start_time, sc.end_time);
  const isFinalEvaluation = isFinalEvaluationSession(sc, allConfigs);
  
  let sessionTime = `Sesi ${sc.session_no}`;
  if (isFinalEvaluation) {
    sessionTime += ' • Evaluasi Akhir';
  }
  if (time) {
    sessionTime += ` • ${time}`;
  }
  
  let sessionName: string | undefined = undefined;
  if (sc.session_name) {
    const cleanName = sc.session_name.trim();
    if (cleanName && !cleanName.toLowerCase().match(/^sesi\s*\d+$/i) && cleanName.toLowerCase() !== 'evaluasi akhir') {
      sessionName = cleanName;
    }
  }

  return { dayName, sessionTime, sessionName, isFinalEvaluation };
}

/**
 * Sorts sessions strictly according to requirement:
 * 1. event_day.day_no ASC
 * 2. start_time ASC
 * 3. session_no ASC
 * (Does NOT sort alphabetically by weekday name)
 */
export function sortSessionConfigs(
  configs: SessionConfig[],
  eventDays?: EventDay[]
): SessionConfig[] {
  const dayMap = new Map((eventDays || []).map(d => [d.event_day_id, d]));

  return [...configs].sort((a, b) => {
    const dayA = dayMap.get(a.event_day_id);
    const dayB = dayMap.get(b.event_day_id);

    const dayNoA = dayA?.day_no ?? 999;
    const dayNoB = dayB?.day_no ?? 999;

    if (dayNoA !== dayNoB) {
      return dayNoA - dayNoB;
    }

    const timeA = (a.start_time || '').trim();
    const timeB = (b.start_time || '').trim();
    if (timeA !== timeB) {
      return timeA.localeCompare(timeB);
    }

    return (a.session_no || 0) - (b.session_no || 0);
  });
}
