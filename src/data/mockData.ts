import {
  AppConfig, Lookup, Student, Teacher, User, Event, EventDay,
  SessionGroup, SessionConfig, Halaqah, HalaqahTeacher,
  EventParticipant, SessionAssessment, FinalEvaluation, AuditLog
} from '../types';
import { MASTER_SURAHS } from './surahs';

export { MASTER_SURAHS };

export const INITIAL_CONFIGS: AppConfig[] = [
  { config_key: 'app_name', config_value: 'Rumah Tahfidz LMS', description: 'Application display name', updated_at: '2026-08-10T08:00:00Z' },
  { config_key: 'current_event_id', config_value: 'RT2026-02', description: 'Active event ID', updated_at: '2026-08-10T08:00:00Z' },
  { config_key: 'dashboard_refresh_seconds', config_value: '30', description: 'Dashboard auto refresh interval', updated_at: '2026-08-10T08:00:00Z' },
  { config_key: 'public_dashboard_enabled', config_value: 'true', description: 'Enable public aggregate dashboard', updated_at: '2026-08-10T08:00:00Z' },
  { config_key: 'student_search_enabled', config_value: 'true', description: 'Enable secure student progress search', updated_at: '2026-08-10T08:00:00Z' },
];

export const INITIAL_LOOKUPS: Lookup[] = [
  { lookup_type: 'ATTENDANCE', lookup_code: 'UNASSESSED', lookup_label: 'Belum Dinilai', sort_order: 1, active: true },
  { lookup_type: 'ATTENDANCE', lookup_code: 'PRESENT', lookup_label: 'Hadir', sort_order: 2, active: true },
  { lookup_type: 'ATTENDANCE', lookup_code: 'SICK', lookup_label: 'Sakit', sort_order: 3, active: true },
  { lookup_type: 'ATTENDANCE', lookup_code: 'PERMISSION', lookup_label: 'Izin', sort_order: 4, active: true },
  { lookup_type: 'ATTENDANCE', lookup_code: 'ABSENT', lookup_label: 'Alpa', sort_order: 5, active: true },

  { lookup_type: 'SKILL_STATUS', lookup_code: 'NON_BBL', lookup_label: 'NON_BBL', sort_order: 1, active: true },
  { lookup_type: 'SKILL_STATUS', lookup_code: 'BBL', lookup_label: 'BBL', sort_order: 2, active: true },
  { lookup_type: 'SKILL_STATUS', lookup_code: 'BBLS', lookup_label: 'BBLS', sort_order: 3, active: true },

  { lookup_type: 'COMPLETION_STATUS', lookup_code: 'COMPLETE', lookup_label: 'Tuntas', sort_order: 1, active: true },
  { lookup_type: 'COMPLETION_STATUS', lookup_code: 'INCOMPLETE', lookup_label: 'Belum Tuntas', sort_order: 2, active: true },
];

export const INITIAL_TEACHERS: Teacher[] = [
  { teacher_id: 'TCH000001', full_name: 'Ust. Ahmad Syauqi, S.Pd.I', short_name: 'Ust. Ahmad', gender: 'IKHWAN', email: 'ahmad.syauqi@rumahtahfidz.sch.id', phone: '081234567801', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
  { teacher_id: 'TCH000002', full_name: 'Ustdz. Fatimah Az-Zahra, M.Ag', short_name: 'Ustdz. Fatimah', gender: 'AKHWAT', email: 'fatimah.zahra@rumahtahfidz.sch.id', phone: '081234567802', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
  { teacher_id: 'TCH000003', full_name: 'Ust. Muhammad Ridwan, Al-Hafizh', short_name: 'Ust. Ridwan', gender: 'IKHWAN', email: 'm.ridwan@rumahtahfidz.sch.id', phone: '081234567803', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
  { teacher_id: 'TCH000004', full_name: 'Ust. Zayd Al-Khair, Lc.', short_name: 'Ust. Zayd', gender: 'IKHWAN', email: 'zayd.khair@rumahtahfidz.sch.id', phone: '081234567804', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
  { teacher_id: 'TCH000005', full_name: 'Ustdz. Aisyah Humaira, S.Hum', short_name: 'Ustdz. Aisyah', gender: 'AKHWAT', email: 'aisyah.humaira@rumahtahfidz.sch.id', phone: '081234567805', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
];

export const INITIAL_USERS: User[] = [
  { user_id: 'USR000001', username: 'admin', display_name: 'Super Administrator', role: 'ADMIN', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
  { user_id: 'USR000002', username: 'coordinator', display_name: 'Koordinator Tahfidz', role: 'COORDINATOR', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
  { user_id: 'USR000003', username: 'ust.ahmad', display_name: 'Ust. Ahmad Syauqi', role: 'TEACHER', teacher_id: 'TCH000001', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
  { user_id: 'USR000004', username: 'ustdz.fatimah', display_name: 'Ustdz. Fatimah Az-Zahra', role: 'TEACHER', teacher_id: 'TCH000002', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
  { user_id: 'USR000005', username: 'ust.ridwan', display_name: 'Ust. Muhammad Ridwan', role: 'TEACHER', teacher_id: 'TCH000003', active: true, created_at: '2025-07-01T08:00:00Z', updated_at: '2025-07-01T08:00:00Z' },
];

export const INITIAL_STUDENTS: Student[] = [
  { student_id: 'STD000001', nis: '2025001', full_name: 'Abdullah Al-Fatih', gender: 'IKHWAN', grade_level: '7', class_name: '7A', access_code: 'RT-K7M4Q9', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000002', nis: '2025002', full_name: 'Ahmad Raihan Kamil', gender: 'IKHWAN', grade_level: '7', class_name: '7A', access_code: 'RT-W8P2X5', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000003', nis: '2025003', full_name: 'Ali Zainal Abidin', gender: 'IKHWAN', grade_level: '7', class_name: '7A', access_code: 'RT-H3N9J7', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000004', nis: '2025004', full_name: 'Bilal Ramadan', gender: 'IKHWAN', grade_level: '7', class_name: '7B', access_code: 'RT-Y4M6Q2', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  // Intentionally extreme performer: Muhammad Farhan (85 lines)
  { student_id: 'STD000005', nis: '2025005', full_name: 'Muhammad Farhan Al-Hafizh', gender: 'IKHWAN', grade_level: '8', class_name: '8A', access_code: 'RT-B9T5R3', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000006', nis: '2025006', full_name: 'Faris Hibatullah', gender: 'IKHWAN', grade_level: '8', class_name: '8A', access_code: 'RT-C2K8V4', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000007', nis: '2025007', full_name: 'Hamzah Ibrahim', gender: 'IKHWAN', grade_level: '8', class_name: '8B', access_code: 'RT-D7P3M9', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000008', nis: '2025008', full_name: 'Ibrahim Al-Ghazi', gender: 'IKHWAN', grade_level: '9', class_name: '9A', access_code: 'RT-E5N2W6', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000009', nis: '2025009', full_name: 'Luqman Al-Hakim', gender: 'IKHWAN', grade_level: '9', class_name: '9A', access_code: 'RT-F8Q4X1', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000010', nis: '2025010', full_name: 'Umar Abdul Aziz', gender: 'IKHWAN', grade_level: '9', class_name: '9B', access_code: 'RT-G3R7Y5', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },

  // Akhwat students
  { student_id: 'STD000011', nis: '2025011', full_name: 'Aisyah Az-Zahra', gender: 'AKHWAT', grade_level: '7', class_name: '7C', access_code: 'RT-H6S9Z2', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000012', nis: '2025012', full_name: 'Fatimah Nabila', gender: 'AKHWAT', grade_level: '7', class_name: '7C', access_code: 'RT-J2T4A8', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000013', nis: '2025013', full_name: 'Khadijah Al-Kubra', gender: 'AKHWAT', grade_level: '8', class_name: '8C', access_code: 'RT-K5U8B3', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000014', nis: '2025014', full_name: 'Maryam Salma', gender: 'AKHWAT', grade_level: '8', class_name: '8C', access_code: 'RT-M7V2C6', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000015', nis: '2025015', full_name: 'Nabila Syakira', gender: 'AKHWAT', grade_level: '9', class_name: '9C', access_code: 'RT-P3X8E4', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000016', nis: '2025016', full_name: 'Siti Sarah Rahmania', gender: 'AKHWAT', grade_level: '9', class_name: '9C', access_code: 'RT-Q6Y2F7', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000017', nis: '2025017', full_name: 'Zahra Muthmainnah', gender: 'AKHWAT', grade_level: '7', class_name: '7C', access_code: 'RT-R8Z5G9', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
  { student_id: 'STD000018', nis: '2025018', full_name: 'Zulfa Amalia', gender: 'AKHWAT', grade_level: '8', class_name: '8C', access_code: 'RT-T2A6H4', active: true, created_at: '2025-07-15T08:00:00Z', updated_at: '2025-07-15T08:00:00Z' },
];

export const INITIAL_EVENTS: Event[] = [
  { event_id: 'RT2026-01', event_name: 'Rumah Tahfidz 1', academic_year: '2025/2026', sequence_no: 1, start_date: '2025-09-05', end_date: '2025-09-07', status: 'CLOSED', public_dashboard: true, notes: 'Kegiatan Rumah Tahfidz Perdana T.A. 2025/2026', created_at: '2025-08-20T08:00:00Z', updated_at: '2025-09-10T08:00:00Z' },
  { event_id: 'RT2026-02', event_name: 'Rumah Tahfidz 2', academic_year: '2025/2026', sequence_no: 2, start_date: '2025-11-10', end_date: '2025-11-12', status: 'ACTIVE', public_dashboard: true, notes: 'Kegiatan Rumah Tahfidz Ke-2 T.A. 2025/2026 (Sedang Berlangsung)', created_at: '2025-10-25T08:00:00Z', updated_at: '2025-11-10T08:00:00Z' },
  { event_id: 'RT2026-03', event_name: 'Rumah Tahfidz 3', academic_year: '2025/2026', sequence_no: 3, start_date: '2026-01-15', end_date: '2026-01-17', status: 'DRAFT', public_dashboard: false, notes: 'Kegiatan Rumah Tahfidz Ke-3 awal semester genap', created_at: '2025-12-20T08:00:00Z', updated_at: '2025-12-20T08:00:00Z' },
  { event_id: 'RT2026-04', event_name: 'Rumah Tahfidz 4', academic_year: '2025/2026', sequence_no: 4, start_date: '2026-03-02', end_date: '2026-03-04', status: 'DRAFT', public_dashboard: false, notes: 'Persiapan Sambut Ramadan', created_at: '2026-01-10T08:00:00Z', updated_at: '2026-01-10T08:00:00Z' },
  { event_id: 'RT2026-05', event_name: 'Rumah Tahfidz 5', academic_year: '2025/2026', sequence_no: 5, start_date: '2026-04-20', end_date: '2026-04-22', status: 'DRAFT', public_dashboard: false, notes: 'Kegiatan pasca Idul Fitri', created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' },
  { event_id: 'RT2026-06', event_name: 'Rumah Tahfidz 6', academic_year: '2025/2026', sequence_no: 6, start_date: '2026-06-08', end_date: '2026-06-10', status: 'DRAFT', public_dashboard: false, notes: 'Puncak Wisuda & Evaluasi Tahunan', created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' },
];

export const INITIAL_EVENT_DAYS: EventDay[] = [
  // Event 2 (Active multi-day event)
  { event_day_id: 'RT2026-02-D01', event_id: 'RT2026-02', day_no: 1, event_date: '2025-11-10', day_name: 'Hari 1 (Senin)', status: 'COMPLETED', notes: 'Pembukaan & Sesi 1-5' },
  { event_day_id: 'RT2026-02-D02', event_id: 'RT2026-02', day_no: 2, event_date: '2025-11-11', day_name: 'Hari 2 (Selasa)', status: 'ACTIVE', notes: 'Sesi Intensif 6-9' },
  { event_day_id: 'RT2026-02-D03', event_id: 'RT2026-02', day_no: 3, event_date: '2025-11-12', day_name: 'Hari 3 (Rabu)', status: 'SCHEDULED', notes: 'Sesi Akhir & Penutupan 10-11' },

  // Event 1 (Closed)
  { event_day_id: 'RT2026-01-D01', event_id: 'RT2026-01', day_no: 1, event_date: '2025-09-05', day_name: 'Hari 1', status: 'COMPLETED' },
  { event_day_id: 'RT2026-01-D02', event_id: 'RT2026-01', day_no: 2, event_date: '2025-09-06', day_name: 'Hari 2', status: 'COMPLETED' },
  { event_day_id: 'RT2026-01-D03', event_id: 'RT2026-01', day_no: 3, event_date: '2025-09-07', day_name: 'Hari 3', status: 'COMPLETED' },
];

// Session Groups to test 11-session, 7-session, and 5-session groups
export const INITIAL_SESSION_GROUPS: SessionGroup[] = [
  { session_group_id: 'SG2026-01', event_id: 'RT2026-02', group_name: 'Grup Reguler 11 Sesi', description: 'Pola standar 11 sesi dalam 3 hari', active: true },
  { session_group_id: 'SG2026-02', event_id: 'RT2026-02', group_name: 'Grup Intensif 7 Sesi', description: 'Pola 7 sesi dalam 2 hari', active: true },
  { session_group_id: 'SG2026-03', event_id: 'RT2026-02', group_name: 'Grup Ringkas 5 Sesi', description: 'Pola 5 sesi dalam 1 hari', active: true },
];

export const INITIAL_SESSION_CONFIGS: SessionConfig[] = [
  // SG2026-01: 11-session group
  { session_config_id: 'SC01', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-01', session_no: 1, day_session_no: 1, session_name: 'Sesi 1 (Pagi 1)', start_time: '08:00', end_time: '09:15', active: true },
  { session_config_id: 'SC02', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-01', session_no: 2, day_session_no: 2, session_name: 'Sesi 2 (Pagi 2)', start_time: '09:30', end_time: '10:45', active: true },
  { session_config_id: 'SC03', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-01', session_no: 3, day_session_no: 3, session_name: 'Sesi 3 (Siang 1)', start_time: '11:00', end_time: '12:00', active: true },
  { session_config_id: 'SC04', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-01', session_no: 4, day_session_no: 4, session_name: 'Sesi 4 (Sore 1)', start_time: '13:30', end_time: '15:00', active: true },
  { session_config_id: 'SC05', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-01', session_no: 5, day_session_no: 5, session_name: 'Sesi 5 (Malam)', start_time: '16:00', end_time: '17:15', active: true },
  { session_config_id: 'SC06', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D02', session_group_id: 'SG2026-01', session_no: 6, day_session_no: 1, session_name: 'Sesi 6 (Subuh)', start_time: '08:00', end_time: '09:15', active: true },
  { session_config_id: 'SC07', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D02', session_group_id: 'SG2026-01', session_no: 7, day_session_no: 2, session_name: 'Sesi 7 (Duha)', start_time: '09:30', end_time: '10:45', active: true },
  { session_config_id: 'SC08', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D02', session_group_id: 'SG2026-01', session_no: 8, day_session_no: 3, session_name: 'Sesi 8 (Siang)', start_time: '13:30', end_time: '15:00', active: true },
  { session_config_id: 'SC09', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D02', session_group_id: 'SG2026-01', session_no: 9, day_session_no: 4, session_name: 'Sesi 9 (Sore)', start_time: '16:00', end_time: '17:15', active: true },
  { session_config_id: 'SC10', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D03', session_group_id: 'SG2026-01', session_no: 10, day_session_no: 1, session_name: 'Sesi 10 (Ujian Tasmik)', start_time: '08:00', end_time: '10:00', active: true },
  { session_config_id: 'SC11', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D03', session_group_id: 'SG2026-01', session_no: 11, day_session_no: 2, session_name: 'Sesi 11 (Khataman)', start_time: '10:30', end_time: '12:00', active: true },

  // SG2026-02: 7-session group
  { session_config_id: 'SC02-1', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-02', session_no: 1, day_session_no: 1, session_name: 'Sesi 1 (Pagi)', start_time: '08:00', end_time: '09:30', active: true },
  { session_config_id: 'SC02-2', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-02', session_no: 2, day_session_no: 2, session_name: 'Sesi 2 (Siang)', start_time: '10:00', end_time: '11:30', active: true },
  { session_config_id: 'SC02-3', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-02', session_no: 3, day_session_no: 3, session_name: 'Sesi 3 (Sore)', start_time: '14:00', end_time: '15:30', active: true },
  { session_config_id: 'SC02-4', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-02', session_no: 4, day_session_no: 4, session_name: 'Sesi 4 (Malam)', start_time: '16:00', end_time: '17:30', active: true },
  { session_config_id: 'SC02-5', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D02', session_group_id: 'SG2026-02', session_no: 5, day_session_no: 1, session_name: 'Sesi 5 (Subuh)', start_time: '08:00', end_time: '09:30', active: true },
  { session_config_id: 'SC02-6', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D02', session_group_id: 'SG2026-02', session_no: 6, day_session_no: 2, session_name: 'Sesi 6 (Duha)', start_time: '10:00', end_time: '11:30', active: true },
  { session_config_id: 'SC02-7', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D02', session_group_id: 'SG2026-02', session_no: 7, day_session_no: 3, session_name: 'Sesi 7 (Ujian)', start_time: '14:00', end_time: '16:00', active: true },

  // SG2026-03: 5-session group
  { session_config_id: 'SC03-1', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-03', session_no: 1, day_session_no: 1, session_name: 'Sesi 1', start_time: '08:00', end_time: '09:30', active: true },
  { session_config_id: 'SC03-2', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-03', session_no: 2, day_session_no: 2, session_name: 'Sesi 2', start_time: '10:00', end_time: '11:30', active: true },
  { session_config_id: 'SC03-3', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-03', session_no: 3, day_session_no: 3, session_name: 'Sesi 3', start_time: '13:30', end_time: '15:00', active: true },
  { session_config_id: 'SC03-4', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-03', session_no: 4, day_session_no: 4, session_name: 'Sesi 4', start_time: '15:30', end_time: '17:00', active: true },
  { session_config_id: 'SC03-5', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_group_id: 'SG2026-03', session_no: 5, day_session_no: 5, session_name: 'Sesi 5', start_time: '19:30', end_time: '21:00', active: true },
];

export const INITIAL_HALAQAH: Halaqah[] = [
  { halaqah_id: 'H2026-02-001', event_id: 'RT2026-02', halaqah_name: 'Halaqah 01 (Ikhwan 7A/7B)', gender: 'IKHWAN', grade_group: 'Kelas 7', session_group_id: 'SG2026-01', location: 'Masjid Utama Lantai 1', target_ziyadah_lines: 50, target_iqra_pages: 20, active: true, created_at: '2025-10-26T08:00:00Z', updated_at: '2025-10-26T08:00:00Z' },
  { halaqah_id: 'H2026-02-002', event_id: 'RT2026-02', halaqah_name: 'Halaqah 02 (Akhwat 7C/8C)', gender: 'AKHWAT', grade_group: 'Kelas 7 & 8', session_group_id: 'SG2026-01', location: 'Aula Akhwat Lantai 2', target_ziyadah_lines: 40, target_iqra_pages: 15, active: true, created_at: '2025-10-26T08:00:00Z', updated_at: '2025-10-26T08:00:00Z' },
  { halaqah_id: 'H2026-02-003', event_id: 'RT2026-02', halaqah_name: 'Halaqah 03 (Ikhwan 8A/8B)', gender: 'IKHWAN', grade_group: 'Kelas 8', session_group_id: 'SG2026-01', location: 'Ruang Perpustakaan', target_ziyadah_lines: 60, target_iqra_pages: 25, active: true, created_at: '2025-10-26T08:00:00Z', updated_at: '2025-10-26T08:00:00Z' },
  { halaqah_id: 'H2026-02-004', event_id: 'RT2026-02', halaqah_name: 'Halaqah 04 (Ikhwan 9A/9B)', gender: 'IKHWAN', grade_group: 'Kelas 9', session_group_id: 'SG2026-01', location: 'Masjid Utama Serambi Ustaz', target_ziyadah_lines: 50, target_iqra_pages: 20, active: true, created_at: '2025-10-26T08:00:00Z', updated_at: '2025-10-26T08:00:00Z' },
];

export const INITIAL_HALAQAH_TEACHERS: HalaqahTeacher[] = [
  { assignment_id: 'HT001', event_id: 'RT2026-02', halaqah_id: 'H2026-02-001', teacher_id: 'TCH000001', teacher_role: 'PRIMARY', active: true, created_at: '2025-10-27T08:00:00Z', updated_at: '2025-10-27T08:00:00Z' },
  { assignment_id: 'HT002', event_id: 'RT2026-02', halaqah_id: 'H2026-02-002', teacher_id: 'TCH000002', teacher_role: 'PRIMARY', active: true, created_at: '2025-10-27T08:00:00Z', updated_at: '2025-10-27T08:00:00Z' },
  { assignment_id: 'HT003', event_id: 'RT2026-02', halaqah_id: 'H2026-02-003', teacher_id: 'TCH000003', teacher_role: 'PRIMARY', active: true, created_at: '2025-10-27T08:00:00Z', updated_at: '2025-10-27T08:00:00Z' },
  { assignment_id: 'HT004', event_id: 'RT2026-02', halaqah_id: 'H2026-02-004', teacher_id: 'TCH000004', teacher_role: 'PRIMARY', active: true, created_at: '2025-10-27T08:00:00Z', updated_at: '2025-10-27T08:00:00Z' },
];

export const INITIAL_PARTICIPANTS: EventParticipant[] = [
  // Participants for RT2026-01 (Closed event) so FinalEvaluation references exist
  {
    participant_id: 'PRT2026-01-001', event_id: 'RT2026-01', student_id: 'STD000001',
    class_snapshot: '7A', grade_snapshot: '7', skill_status_start: 'NON_BBL', halaqah_id: 'H2026-02-001', session_group_id: 'SG2026-01',
    baseline_surah: 67, baseline_ayah: 1, baseline_note: 'Awal Al-Mulk', baseline_date: '2025-09-05',
    target_surah_start: 67, target_ayah_start: 1, target_surah_end: 67, target_ayah_end: 30, target_lines: 30, target_note: 'Al-Mulk tuntas',
    participant_status: 'COMPLETED', created_at: '2025-08-25T08:00:00Z', updated_at: '2025-09-07T08:00:00Z'
  },
  {
    participant_id: 'PRT2026-01-005', event_id: 'RT2026-01', student_id: 'STD000005',
    class_snapshot: '8A', grade_snapshot: '8', skill_status_start: 'BBL', halaqah_id: 'H2026-02-003', session_group_id: 'SG2026-01',
    baseline_surah: 18, baseline_ayah: 1, baseline_note: 'Al-Kahfi awal', baseline_date: '2025-09-05',
    target_surah_start: 18, target_ayah_start: 1, target_surah_end: 18, target_ayah_end: 30, target_lines: 30, target_note: 'Al-Kahfi 1-30',
    participant_status: 'COMPLETED', created_at: '2025-08-25T08:00:00Z', updated_at: '2025-09-07T08:00:00Z'
  },

  // Participants for RT2026-02 (Active event)
  // Standard complete participant 1
  {
    participant_id: 'PRT2026-02-001', event_id: 'RT2026-02', student_id: 'STD000001',
    class_snapshot: '7A', grade_snapshot: '7', skill_status_start: 'NON_BBL', halaqah_id: 'H2026-02-001', session_group_id: 'SG2026-01',
    baseline_surah: 67, baseline_ayah: 15, baseline_note: 'Al-Mulk sampai ayat 15', baseline_date: '2025-11-05',
    target_surah_start: 67, target_ayah_start: 16, target_surah_end: 67, target_ayah_end: 30, target_lines: 15, target_note: 'Al-Mulk ayat 16-30',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },
  // Standard complete participant 2
  {
    participant_id: 'PRT2026-02-002', event_id: 'RT2026-02', student_id: 'STD000002',
    class_snapshot: '7A', grade_snapshot: '7', skill_status_start: 'BBL', halaqah_id: 'H2026-02-001', session_group_id: 'SG2026-01',
    baseline_surah: 78, baseline_ayah: 20, baseline_note: 'An-Naba sampai ayat 20', baseline_date: '2025-11-05',
    target_surah_start: 78, target_ayah_start: 21, target_surah_end: 78, target_ayah_end: 40, target_lines: 20, target_note: 'An-Naba selesai',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },
  {
    participant_id: 'PRT2026-02-003', event_id: 'RT2026-02', student_id: 'STD000003',
    class_snapshot: '7A', grade_snapshot: '7', skill_status_start: 'BBLS', halaqah_id: 'H2026-02-001', session_group_id: 'SG2026-01',
    baseline_surah: 89, baseline_ayah: 30, baseline_note: 'Selesai Al-Fajr', baseline_date: '2025-11-05',
    target_surah_start: 88, target_ayah_start: 1, target_surah_end: 88, target_ayah_end: 26, target_lines: 26, target_note: 'Al-Ghasyiyah full',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },
  {
    participant_id: 'PRT2026-02-004', event_id: 'RT2026-02', student_id: 'STD000004',
    class_snapshot: '7B', grade_snapshot: '7', skill_status_start: 'NON_BBL', halaqah_id: 'H2026-02-001', session_group_id: 'SG2026-01',
    baseline_surah: 68, baseline_ayah: 10, baseline_note: 'Al-Qalam awal', baseline_date: '2025-11-05',
    target_surah_start: 68, target_ayah_start: 11, target_surah_end: 68, target_ayah_end: 30, target_lines: 20, target_note: 'Al-Qalam lanjutan',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },

  // Extreme Performer: Farhan (STD000005) - memorizes 85 lines
  {
    participant_id: 'PRT2026-02-005', event_id: 'RT2026-02', student_id: 'STD000005',
    class_snapshot: '8A', grade_snapshot: '8', skill_status_start: 'BBLS', halaqah_id: 'H2026-02-003', session_group_id: 'SG2026-01',
    baseline_surah: 18, baseline_ayah: 30, baseline_note: 'Al-Kahfi ayat 30', baseline_date: '2025-11-05',
    target_surah_start: 18, target_ayah_start: 31, target_surah_end: 18, target_ayah_end: 110, target_lines: 80, target_note: 'Target tinggi: Selesaikan Al-Kahfi',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },

  // TEST FIXTURES FOR INCOMPLETE PARTICIPANT SETUP:
  // 1. Participant WITHOUT HALAQAH
  {
    participant_id: 'PRT2026-02-007', event_id: 'RT2026-02', student_id: 'STD000007',
    class_snapshot: '8B', grade_snapshot: '8', skill_status_start: 'NON_BBL',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },
  // 2. Participant WITHOUT BASELINE
  {
    participant_id: 'PRT2026-02-008', event_id: 'RT2026-02', student_id: 'STD000008',
    class_snapshot: '9A', grade_snapshot: '9', skill_status_start: 'BBL', halaqah_id: 'H2026-02-004', session_group_id: 'SG2026-01',
    target_surah_start: 67, target_ayah_start: 1, target_surah_end: 67, target_ayah_end: 15, target_lines: 15, target_note: 'Target awal',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },
  // 3. Participant WITHOUT TARGET
  {
    participant_id: 'PRT2026-02-009', event_id: 'RT2026-02', student_id: 'STD000009',
    class_snapshot: '9A', grade_snapshot: '9', skill_status_start: 'BBLS', halaqah_id: 'H2026-02-004', session_group_id: 'SG2026-01',
    baseline_surah: 78, baseline_ayah: 1, baseline_note: 'An-Naba awal', baseline_date: '2025-11-05',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },
  // 4. Participant MISSING SOME SESSION ASSESSMENTS
  {
    participant_id: 'PRT2026-02-010', event_id: 'RT2026-02', student_id: 'STD000010',
    class_snapshot: '9B', grade_snapshot: '9', skill_status_start: 'NON_BBL', halaqah_id: 'H2026-02-004', session_group_id: 'SG2026-01',
    baseline_surah: 89, baseline_ayah: 1, baseline_note: 'Al-Fajr awal', baseline_date: '2025-11-05',
    target_surah_start: 89, target_ayah_start: 2, target_surah_end: 89, target_ayah_end: 15, target_lines: 12,
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },

  // Akhwat participants
  {
    participant_id: 'PRT2026-02-011', event_id: 'RT2026-02', student_id: 'STD000011',
    class_snapshot: '7C', grade_snapshot: '7', skill_status_start: 'NON_BBL', halaqah_id: 'H2026-02-002', session_group_id: 'SG2026-01',
    baseline_surah: 67, baseline_ayah: 10, baseline_note: 'Al-Mulk 10', baseline_date: '2025-11-05',
    target_surah_start: 67, target_ayah_start: 11, target_surah_end: 67, target_ayah_end: 25, target_lines: 15, target_note: 'Al-Mulk pertengahan',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },
  {
    participant_id: 'PRT2026-02-012', event_id: 'RT2026-02', student_id: 'STD000012',
    class_snapshot: '7C', grade_snapshot: '7', skill_status_start: 'BBL', halaqah_id: 'H2026-02-002', session_group_id: 'SG2026-01',
    baseline_surah: 78, baseline_ayah: 15, baseline_note: 'An-Naba 15', baseline_date: '2025-11-05',
    target_surah_start: 78, target_ayah_start: 16, target_surah_end: 78, target_ayah_end: 40, target_lines: 25, target_note: 'An-Naba tuntas',
    participant_status: 'ACTIVE', created_at: '2025-10-28T08:00:00Z', updated_at: '2025-10-28T08:00:00Z'
  },
];

export const INITIAL_ASSESSMENTS: SessionAssessment[] = [
  // Student 1 (Abdullah Al-Fatih) - Day 1 (Sessions 1 to 5)
  {
    assessment_id: 'ASM000001', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_config_id: 'SC01',
    participant_id: 'PRT2026-02-001', student_id: 'STD000001', halaqah_id: 'H2026-02-001', session_no: 1,
    attendance_status: 'PRESENT', surah_start: 67, ayah_start: 16, surah_end: 67, ayah_end: 18, lines_added: 3,
    session_note: 'Tajwid bagus, makhorijul huruf lancar', teacher_id: 'TCH000001', is_deleted: false, created_at: '2025-11-10T09:10:00Z', updated_at: '2025-11-10T09:10:00Z'
  },
  {
    assessment_id: 'ASM000002', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_config_id: 'SC02',
    participant_id: 'PRT2026-02-001', student_id: 'STD000001', halaqah_id: 'H2026-02-001', session_no: 2,
    attendance_status: 'PRESENT', surah_start: 67, ayah_start: 19, surah_end: 67, ayah_end: 22, lines_added: 4,
    session_note: 'Setoran lancar tanpa salah', teacher_id: 'TCH000001', is_deleted: false, created_at: '2025-11-10T10:40:00Z', updated_at: '2025-11-10T10:40:00Z'
  },
  {
    assessment_id: 'ASM000003', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_config_id: 'SC03',
    participant_id: 'PRT2026-02-001', student_id: 'STD000001', halaqah_id: 'H2026-02-001', session_no: 3,
    attendance_status: 'PRESENT', surah_start: 67, ayah_start: 23, surah_end: 67, ayah_end: 25, lines_added: 3,
    session_note: 'Murajaah ulang ayat 16-22', teacher_id: 'TCH000001', is_deleted: false, created_at: '2025-11-10T11:55:00Z', updated_at: '2025-11-10T11:55:00Z'
  },
  {
    assessment_id: 'ASM000004', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_config_id: 'SC04',
    participant_id: 'PRT2026-02-001', student_id: 'STD000001', halaqah_id: 'H2026-02-001', session_no: 4,
    attendance_status: 'PRESENT', surah_start: 67, ayah_start: 26, surah_end: 67, ayah_end: 28, lines_added: 3,
    session_note: 'Konsentrasi sangat baik', teacher_id: 'TCH000001', is_deleted: false, created_at: '2025-11-10T14:50:00Z', updated_at: '2025-11-10T14:50:00Z'
  },
  {
    assessment_id: 'ASM000005', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_config_id: 'SC05',
    participant_id: 'PRT2026-02-001', student_id: 'STD000001', halaqah_id: 'H2026-02-001', session_no: 5,
    attendance_status: 'PRESENT', surah_start: 67, ayah_start: 29, surah_end: 67, ayah_end: 30, lines_added: 2,
    session_note: 'Target Al-Mulk tuntas di hari ke-1!', teacher_id: 'TCH000001', is_deleted: false, created_at: '2025-11-10T17:10:00Z', updated_at: '2025-11-10T17:10:00Z'
  },

  // Student 1 - Day 2 (Session 6)
  {
    assessment_id: 'ASM000006', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D02', session_config_id: 'SC06',
    participant_id: 'PRT2026-02-001', student_id: 'STD000001', halaqah_id: 'H2026-02-001', session_no: 6,
    attendance_status: 'PRESENT', surah_start: 68, ayah_start: 1, surah_end: 68, ayah_end: 5, lines_added: 5,
    session_note: 'Menambah surah Al-Qalam ayat 1-5', teacher_id: 'TCH000001', is_deleted: false, created_at: '2025-11-11T09:10:00Z', updated_at: '2025-11-11T09:10:00Z'
  },

  // Student 10 (Umar Abdul Aziz) - Only has 1 session assessment out of 11 (missing assessments)
  {
    assessment_id: 'ASM000020', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_config_id: 'SC01',
    participant_id: 'PRT2026-02-010', student_id: 'STD000010', halaqah_id: 'H2026-02-004', session_no: 1,
    attendance_status: 'PRESENT', surah_start: 89, ayah_start: 2, surah_end: 89, ayah_end: 5, lines_added: 4,
    session_note: 'Setoran awal', teacher_id: 'TCH000004', is_deleted: false, created_at: '2025-11-10T09:15:00Z', updated_at: '2025-11-10T09:15:00Z'
  },

  // Extreme Performer: Farhan (STD000005) - 85 lines total
  {
    assessment_id: 'ASM000010', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_config_id: 'SC01',
    participant_id: 'PRT2026-02-005', student_id: 'STD000005', halaqah_id: 'H2026-02-003', session_no: 1,
    attendance_status: 'PRESENT', surah_start: 18, ayah_start: 31, surah_end: 18, ayah_end: 50, lines_added: 20,
    session_note: 'Daya ingat luar biasa. 20 ayat Al-Kahfi sekaligus.', teacher_id: 'TCH000003', is_deleted: false, created_at: '2025-11-10T09:15:00Z', updated_at: '2025-11-10T09:15:00Z'
  },
  {
    assessment_id: 'ASM000011', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_config_id: 'SC02',
    participant_id: 'PRT2026-02-005', student_id: 'STD000005', halaqah_id: 'H2026-02-003', session_no: 2,
    attendance_status: 'PRESENT', surah_start: 18, ayah_start: 51, surah_end: 18, ayah_end: 70, lines_added: 20,
    session_note: 'Lanjut Al-Kahfi 51-70 lancar jaya.', teacher_id: 'TCH000003', is_deleted: false, created_at: '2025-11-10T10:45:00Z', updated_at: '2025-11-10T10:45:00Z'
  },
  {
    assessment_id: 'ASM000012', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D01', session_config_id: 'SC04',
    participant_id: 'PRT2026-02-005', student_id: 'STD000005', halaqah_id: 'H2026-02-003', session_no: 4,
    attendance_status: 'PRESENT', surah_start: 18, ayah_start: 71, surah_end: 18, ayah_end: 95, lines_added: 25,
    session_note: 'Lancar tasmik tanpa kesalahan.', teacher_id: 'TCH000003', is_deleted: false, created_at: '2025-11-10T14:55:00Z', updated_at: '2025-11-10T14:55:00Z'
  },
  {
    assessment_id: 'ASM000013', event_id: 'RT2026-02', event_day_id: 'RT2026-02-D02', session_config_id: 'SC06',
    participant_id: 'PRT2026-02-005', student_id: 'STD000005', halaqah_id: 'H2026-02-003', session_no: 6,
    attendance_status: 'PRESENT', surah_start: 18, ayah_start: 96, surah_end: 18, ayah_end: 110, lines_added: 20,
    session_note: 'Tuntas khatam Surah Al-Kahfi! Total 85 ayat baru.', teacher_id: 'TCH000003', is_deleted: false, created_at: '2025-11-11T09:15:00Z', updated_at: '2025-11-11T09:15:00Z'
  },
];

export const INITIAL_FINAL_EVALUATIONS: FinalEvaluation[] = [
  {
    final_evaluation_id: 'FE2026-01-001', event_id: 'RT2026-01', participant_id: 'PRT2026-01-001', student_id: 'STD000001',
    evaluation_surah_start: 67, evaluation_ayah_start: 1, evaluation_surah_end: 67, evaluation_ayah_end: 30,
    final_score: 92, completion_status: 'COMPLETE', skill_status_end: 'BBL',
    affective_rating: 'A', affective_note: 'Sangat rajin, khusyuk dan disiplin setoran.', final_note: 'Selamat! Target Al-Mulk tuntas.',
    evaluator_teacher_id: 'TCH000001', created_at: '2025-09-07T14:00:00Z', updated_at: '2025-09-07T14:00:00Z'
  },
  {
    final_evaluation_id: 'FE2026-01-005', event_id: 'RT2026-01', participant_id: 'PRT2026-01-005', student_id: 'STD000005',
    evaluation_surah_start: 18, evaluation_ayah_start: 1, evaluation_surah_end: 18, evaluation_ayah_end: 30,
    final_score: 98, completion_status: 'COMPLETE', skill_status_end: 'BBLS',
    affective_rating: 'A', affective_note: 'Teladan mutqin di halaqah.', final_note: 'Istimewa.',
    evaluator_teacher_id: 'TCH000003', created_at: '2025-09-07T14:00:00Z', updated_at: '2025-09-07T14:00:00Z'
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    log_id: 'LOG000001', timestamp: '2025-11-10T08:30:00Z', user_id: 'USR000001', action: 'CREATE_EVENT',
    entity_type: 'EVENT', entity_id: 'RT2026-02', event_id: 'RT2026-02',
    new_data_json: '{"event_name": "Rumah Tahfidz 2", "status": "ACTIVE"}', notes: 'Inisialisasi Rumah Tahfidz 2'
  },
  {
    log_id: 'LOG000002', timestamp: '2025-11-10T09:10:00Z', user_id: 'USR000003', action: 'ASSESSMENT_SAVE',
    entity_type: 'SESSION_ASSESSMENT', entity_id: 'ASM000001', event_id: 'RT2026-02',
    new_data_json: '{"student_id": "STD000001", "lines_added": 3}', notes: 'Input Sesi 1 oleh Ust Ahmad'
  }
];
