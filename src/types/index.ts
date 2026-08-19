export type Gender = 'IKHWAN' | 'AKHWAT';
export type UserRole = 'ADMIN' | 'COORDINATOR' | 'TEACHER' | 'VIEWER';
export type TeacherRole = 'PRIMARY' | 'ASSISTANT' | 'SUBSTITUTE';
export type SkillStatus = 'NON_BBL' | 'BBL' | 'BBLS';
export type EventStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type AttendanceStatus = 'UNASSESSED' | 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT';
export type CompletionStatus = 'COMPLETE' | 'INCOMPLETE';
export type EvaluationState = CompletionStatus | 'NOT_EVALUATED';

export interface AppConfig {
  config_key: string;
  config_value: string;
  description: string;
  updated_at: string;
}

export interface Lookup {
  lookup_type: 'ATTENDANCE' | 'SKILL_STATUS' | 'COMPLETION_STATUS' | 'TEACHER_ROLE' | 'USER_ROLE';
  lookup_code: string;
  lookup_label: string;
  sort_order: number;
  active: boolean;
}

export interface Student {
  student_id: string;
  nis: string;
  full_name: string;
  gender: Gender;
  grade_level: string; // e.g., '7', '8', '9'
  class_name: string; // e.g., '7A', '8B'
  access_code: string; // Secure lookup code for parent/student
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Teacher {
  teacher_id: string;
  full_name: string;
  short_name: string;
  gender: Gender;
  email: string;
  phone: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Surah {
  surah_no: number;
  surah_name: string;
  surah_name_arabic: string;
  surah_alias: string;
  total_ayah: number;
  active: boolean;
}

export interface User {
  user_id: string;
  username: string;
  display_name: string;
  role: UserRole;
  teacher_id?: string;
  active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Event {
  event_id: string;
  event_name: string;
  academic_year: string; // e.g., '2025/2026'
  sequence_no: number; // 1 to 6
  start_date: string;
  end_date: string;
  status: EventStatus;
  public_dashboard: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EventDay {
  event_day_id: string;
  event_id: string;
  day_no: number;
  event_date: string;
  day_name: string;
  status: 'ACTIVE' | 'COMPLETED' | 'SCHEDULED';
  notes?: string;
}

export interface SessionGroup {
  session_group_id: string;
  event_id: string;
  group_name: string;
  description: string;
  active: boolean;
}

export type SessionType = 'REGULAR' | 'FINAL_EVALUATION';

export interface SessionConfig {
  session_config_id: string;
  event_id: string;
  event_day_id: string;
  session_group_id: string;
  session_no: number; // cumulative session sequence across event
  day_session_no: number; // daily sequence 1, 2, 3...
  session_name: string;
  session_type?: SessionType;
  start_time: string;
  end_time: string;
  active: boolean;
  notes?: string;
}

export type TargetSource = 'HALAQAH' | 'MANUAL';

export interface Halaqah {
  halaqah_id: string;
  event_id: string;
  halaqah_name: string;
  gender: Gender;
  grade_group: string;
  session_group_id: string;
  location: string;
  target_ziyadah_lines?: number;
  target_nuroniyyah_lines?: number;
  target_iqra_pages?: number;
  active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface HalaqahTeacher {
  assignment_id: string;
  event_id: string;
  halaqah_id: string;
  teacher_id: string;
  teacher_role: TeacherRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventParticipant {
  participant_id: string;
  event_id: string;
  student_id: string;
  class_snapshot: string;
  grade_snapshot: string;
  skill_status_start?: SkillStatus | string;
  halaqah_id?: string;
  session_group_id?: string;
  baseline_surah?: number;
  baseline_ayah?: number;
  baseline_note?: string;
  baseline_date?: string;
  target_surah_start?: number;
  target_ayah_start?: number;
  target_surah_end?: number;
  target_ayah_end?: number;
  target_lines?: number;
  target_nuroniyyah_lines?: number;
  target_iqra_pages?: number;
  target_source?: TargetSource;
  target_note?: string;
  assignment_note?: string;
  participant_status: 'ACTIVE' | 'WITHDRAWN' | 'COMPLETED';
  created_at: string;
  updated_at: string;
}

export type AssessmentMode = 'ZIYADAH' | 'NURONIYYAH' | 'IQRA';
export type AssessmentStatus = 'PENDING' | 'COMPLETED';

export interface SessionAssessment {
  assessment_id: string;
  event_id: string;
  event_day_id: string;
  session_config_id: string;
  participant_id: string;
  student_id: string;
  halaqah_id: string;
  session_no: number;
  attendance_status: AttendanceStatus;
  assessment_status?: AssessmentStatus;
  assessment_mode?: AssessmentMode;
  surah_start?: number;
  ayah_start?: number;
  surah_end?: number;
  ayah_end?: number;
  lines_added?: number;
  nuroniyyah_dars?: string;
  iqra_level?: number;
  iqra_page_start?: number;
  iqra_page_end?: number;
  iqra_pages_added?: number;
  session_note?: string;
  teacher_id: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  deleted_by?: string;
}

export interface FinalEvaluation {
  final_evaluation_id: string;
  event_id: string;
  participant_id: string;
  student_id: string;
  evaluation_surah_start: number;
  evaluation_ayah_start: number;
  evaluation_surah_end: number;
  evaluation_ayah_end: number;
  final_score?: number; // 0-100
  completion_status: CompletionStatus;
  skill_status_end: SkillStatus;
  affective_rating?: string; // A, B, C, D or empty
  affective_note?: string;
  final_note?: string;
  evaluator_teacher_id: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  log_id: string;
  timestamp: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  event_id?: string;
  old_data_json?: string;
  new_data_json?: string;
  notes?: string;
}

// Statistical calculation output types for Executive Analytics
export interface SummaryStats {
  count: number;
  totalLines: number;
  mean: number;
  median: number;
  stdDev: number;
  cv: number; // Coefficient of Variation (stdDev / mean)
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
  lowerWhisker: number;
  upperWhisker: number;
  bottom25Avg: number;
  completionRate: number; // percentage
  outliers: number[];
}

export interface DistributionBucket {
  range: string;
  count: number;
  percentage: number;
}

export interface SkillTransition {
  from: SkillStatus;
  to: SkillStatus;
  count: number;
}

export interface PlacementStudent {
  student_id: string;
  nis: string;
  full_name: string;
  gender: Gender;
  grade_level: string;
  class_name: string;
  active: boolean;
}

export interface StudentPlacementBootstrap {
  event: Event | null;
  students: PlacementStudent[];
  participants: EventParticipant[];
  halaqahs: Halaqah[];
}

export interface BulkAssignResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  skippedStudentIds: string[];
  skippedRecords?: Array<{
    studentId: string;
    studentName?: string;
    reason: string;
  }>;
}

export interface TeacherStudentSummary {
  student_id: string;
  participant_id: string;
  nis: string;
  full_name: string;
  access_code: string;
  grade_snapshot?: string;
  class_snapshot?: string;
  grade_class: string;
  gender: Gender;
  skill_status_start?: SkillStatus;
  baseline_surah?: number;
  baseline_ayah?: number;
  target_surah_start?: number;
  target_ayah_start?: number;
  target_surah_end?: number;
  target_ayah_end?: number;
  target_lines?: number;
  target_nuroniyyah_lines?: number;
  target_iqra_pages?: number;
  target_source?: TargetSource;
  targetText: string;
  totalLinesAdded: number;
  totalZiyadahLinesAdded?: number;
  totalNuroniyyahLinesAdded?: number;
  totalIqraPagesAdded?: number;
  completionStatus: string;
  session_group_id?: string;
}

export interface TeacherWorkspaceBootstrap {
  event: Event | null;
  eventDays?: EventDay[];
  halaqah: {
    halaqah_id: string;
    event_id: string;
    halaqah_name: string;
    group_name?: string;
    teacher_name?: string;
    gender: Gender;
    grade_group?: string;
    session_group_id?: string;
    location?: string;
    target_ziyadah_lines?: number;
    target_nuroniyyah_lines?: number;
    target_iqra_pages?: number;
    active: boolean;
  } | null;
  availableHalaqahs: Halaqah[];
  students: TeacherStudentSummary[];
  sessionConfigs: SessionConfig[];
  assessments: SessionAssessment[];
  finalEvaluations: FinalEvaluation[];
  assignedTeachers?: Array<{
    teacher_id: string;
    full_name: string;
    short_name?: string;
    teacher_role: string;
  }>;
  serverTimestamp: string;
  lastSyncedAt?: string;
}

export interface PendingAssessmentWrite {
  id: string; // queue item ID
  event_id: string;
  participant_id: string;
  session_config_id: string;
  student_id: string;
  payload: any;
  localTimestamp: number;
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'SYNCED';
  error?: string;
  retryCount: number;
}
