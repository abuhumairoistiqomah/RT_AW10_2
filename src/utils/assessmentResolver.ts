import { SessionAssessment, AttendanceStatus } from '../types';

const hasVal = (v: any): boolean => v !== undefined && v !== null && v !== '';

/**
 * Checks if a session assessment contains actual assessment content
 * (Ziyadah Quran verses, Nuroniyyah dars, or Iqra pages).
 */
export function hasAssessmentContent(a: SessionAssessment | null | undefined): boolean {
  if (!a) return false;

  const mode = a.assessment_mode;

  if (mode === 'IQRA') {
    return (
      hasVal(a.iqra_level) ||
      hasVal(a.iqra_page_start) ||
      hasVal(a.iqra_page_end) ||
      (hasVal(a.iqra_pages_added) && Number(a.iqra_pages_added) > 0)
    );
  }

  if (mode === 'NURONIYYAH') {
    return (
      Boolean(a.nuroniyyah_dars && a.nuroniyyah_dars.trim() !== '') ||
      (hasVal(a.lines_added) && Number(a.lines_added) > 0)
    );
  }

  // ZIYADAH or unspecified
  const hasZiyadahFields = (
    hasVal(a.surah_start) ||
    hasVal(a.ayah_start) ||
    hasVal(a.surah_end) ||
    hasVal(a.ayah_end) ||
    (hasVal(a.lines_added) && Number(a.lines_added) > 0)
  );

  const hasNuroniyyahFields = Boolean(a.nuroniyyah_dars && a.nuroniyyah_dars.trim() !== '');
  const hasIqraFields = hasVal(a.iqra_level) || hasVal(a.iqra_page_start);

  return hasZiyadahFields || hasNuroniyyahFields || hasIqraFields;
}

/**
 * Determines the authoritative assessment mode of an existing assessment.
 * Existing mode ALWAYS takes precedence over student skill defaults.
 */
export function resolveAuthoritativeMode(a: SessionAssessment): 'ZIYADAH' | 'NURONIYYAH' | 'IQRA' {
  if (a.assessment_mode === 'IQRA') return 'IQRA';
  if (a.assessment_mode === 'NURONIYYAH') return 'NURONIYYAH';
  if (a.assessment_mode === 'ZIYADAH') return 'ZIYADAH';

  // If assessment_mode string is missing, infer strictly from content
  if (hasVal(a.iqra_level) || hasVal(a.iqra_page_start) || hasVal(a.iqra_pages_added)) {
    return 'IQRA';
  }

  if (a.nuroniyyah_dars && a.nuroniyyah_dars.trim() !== '') {
    return 'NURONIYYAH';
  }

  return 'ZIYADAH';
}

/**
 * Generates a canonical grouping key for an assessment:
 * event_id + participant_id (or student_id) + session_config_id (or session_no)
 */
export function getLogicalAssessmentKey(
  eventId?: string,
  participantId?: string,
  studentId?: string,
  sessionConfigId?: string,
  sessionNo?: number
): string {
  const pKey = (participantId && participantId.trim() !== '') ? participantId.trim() : (studentId || 'unknown-student');
  const sKey = (sessionConfigId && sessionConfigId.trim() !== '') ? sessionConfigId.trim() : `sess-no-${sessionNo || 1}`;
  const eKey = eventId || 'default-event';
  return `${eKey}::${pKey}::${sKey}`;
}

/**
 * Resolves duplicate assessments for the same logical student/session key.
 * Rules:
 * 1. Prefer a record with real assessment content over an attendance-only PENDING placeholder.
 * 2. If an attendance-only record is newer and has an explicit individual change (e.g. SICK/PERMISSION/ABSENT or updated attendance),
 *    preserve that attendance status while keeping the rich assessment content.
 * 3. If multiple equally complete records exist, pick the most recently updated one.
 */
export function resolveCanonicalAssessment(
  assessments: SessionAssessment[],
  criteria: {
    eventId?: string;
    participantId?: string;
    studentId?: string;
    sessionConfigId?: string;
    sessionNo?: number;
  }
): SessionAssessment | null {
  if (!assessments || assessments.length === 0) return null;

  const matches = assessments.filter(a => {
    if (a.is_deleted) return false;

    const matchesEvent = !criteria.eventId || !a.event_id || a.event_id === criteria.eventId;
    if (!matchesEvent) return false;

    const matchesStudent =
      (criteria.participantId && a.participant_id === criteria.participantId) ||
      (criteria.studentId && a.student_id === criteria.studentId);

    if (!matchesStudent) return false;

    const matchesSession =
      (criteria.sessionConfigId && a.session_config_id === criteria.sessionConfigId) ||
      (criteria.sessionNo !== undefined && Number(a.session_no) === Number(criteria.sessionNo));

    return matchesSession;
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Multiple matching records exist for this logical key
  // Sort them: complete content first, then most recent updated_at/created_at
  const withContent = matches.filter(hasAssessmentContent);
  const withoutContent = matches.filter(m => !hasAssessmentContent(m));

  // Find the latest attendance status across all records (in case a newer attendance patch was applied)
  const sortedAll = [...matches].sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
  const latestRecord = sortedAll[0];

  if (withContent.length > 0) {
    const sortedContent = [...withContent].sort((a, b) => {
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    const primary = sortedContent[0];

    // If there is a newer explicit attendance change (e.g. SICK, PERMISSION, ABSENT or newer status), patch the attendance
    if (latestRecord && latestRecord.assessment_id !== primary.assessment_id) {
      const latestTime = new Date(latestRecord.updated_at || latestRecord.created_at || 0).getTime();
      const primaryTime = new Date(primary.updated_at || primary.created_at || 0).getTime();
      if (latestTime > primaryTime && latestRecord.attendance_status) {
        return {
          ...primary,
          attendance_status: latestRecord.attendance_status,
          assessment_status: latestRecord.attendance_status === 'PRESENT' ? primary.assessment_status : 'COMPLETED',
          updated_at: latestRecord.updated_at || primary.updated_at
        };
      }
    }

    return primary;
  }

  // If none have rich assessment content, pick the most recently updated
  return latestRecord;
}

/**
 * Deduplicates an entire array of session assessments deterministically
 * using the canonical resolver rules.
 */
export function deduplicateAssessments(assessments: SessionAssessment[]): SessionAssessment[] {
  if (!assessments || assessments.length === 0) return [];

  const grouped = new Map<string, SessionAssessment[]>();

  assessments.forEach(a => {
    if (a.is_deleted) return;
    const key = getLogicalAssessmentKey(
      a.event_id,
      a.participant_id,
      a.student_id,
      a.session_config_id,
      a.session_no
    );
    const list = grouped.get(key) || [];
    list.push(a);
    grouped.set(key, list);
  });

  const result: SessionAssessment[] = [];

  grouped.forEach((group, _) => {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      const first = group[0];
      const resolved = resolveCanonicalAssessment(group, {
        eventId: first.event_id,
        participantId: first.participant_id,
        studentId: first.student_id,
        sessionConfigId: first.session_config_id,
        sessionNo: first.session_no
      });
      if (resolved) {
        result.push(resolved);
      }
    }
  });

  return result;
}
