import React, { useState, useMemo, useEffect } from 'react';
import { User, AttendanceStatus, EventDay, TeacherStudentSummary } from '../../types';
import { useTeacherWorkspace } from '../../context/TeacherWorkspaceContext';
import { TeacherSyncBadge } from './TeacherSyncBadge';
import { ApiService } from '../../services/api';
import { formatSessionOptionLabel, sortSessionConfigs, isFinalEvaluationSession as checkIsFinalEvaluationSession } from '../../utils/sessionFormatter';
import { formatSkillBadgeText, formatSplitProgressDisplay } from '../../utils/targetUtils';
import { SessionSummaryCard } from '../common/SessionSummaryCard';
import { StudentSessionHistoryModal } from './StudentSessionHistoryModal';
import {
  Users, BookOpen, CheckCircle2, ChevronRight,
  Layers, Check, UserCheck, CheckSquare, Square,
  Loader2, AlertCircle, Calendar, Clock, Eye
} from 'lucide-react';

interface MyHalaqahProps {
  currentUser: User | null;
  onNavigateToAssessment: (studentId?: string, sessionNo?: number) => void;
  onNavigateToEvaluation?: (studentId?: string, sessionConfigId?: string) => void;
}

export const MyHalaqah: React.FC<MyHalaqahProps> = ({ currentUser, onNavigateToAssessment, onNavigateToEvaluation }) => {
  const {
    workspace,
    isLoading,
    isRevalidating,
    activeHalaqahId,
    setActiveHalaqahId,
    selectedTeacherId,
    setSelectedTeacherId,
    availableTeachers,
    refreshWorkspace
  } = useTeacherWorkspace();

  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<TeacherStudentSummary | null>(null);
  const [isSavingBulk, setIsSavingBulk] = useState<boolean>(false);
  const [bulkFeedback, setBulkFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [eventDays, setEventDays] = useState<EventDay[]>(workspace?.eventDays || []);

  const isAdminOrCoord = currentUser?.role === 'ADMIN' || currentUser?.role === 'COORDINATOR';

  useEffect(() => {
    if (workspace?.eventDays && workspace.eventDays.length > 0) {
      setEventDays(workspace.eventDays);
    } else if (workspace?.event?.event_id) {
      ApiService.getEventDays(workspace.event.event_id).then(days => {
        setEventDays(days);
      }).catch(err => {
        console.warn('Failed to load event days in MyHalaqah:', err);
      });
    }
  }, [workspace?.event?.event_id, workspace?.eventDays]);

  const sessionConfigs = useMemo(() => {
    const raw = (workspace?.sessionConfigs || []).filter(sc => sc.active);
    return sortSessionConfigs(raw, eventDays);
  }, [workspace?.sessionConfigs, eventDays]);

  // Set default selected session if none selected or not in list
  useEffect(() => {
    if (sessionConfigs.length > 0) {
      if (!selectedSessionId || !sessionConfigs.some(sc => sc.session_config_id === selectedSessionId)) {
        setSelectedSessionId(sessionConfigs[0].session_config_id);
      }
    } else {
      setSelectedSessionId('');
    }
  }, [sessionConfigs, selectedSessionId]);

  const students = workspace?.students || [];
  const finalEvaluations = workspace?.finalEvaluations || [];
  const evaluatedStudentsCount = useMemo(() => {
    return students.filter(st =>
      finalEvaluations.some(fe => fe.student_id === st.student_id || (st.participant_id && fe.participant_id === st.participant_id))
    ).length;
  }, [students, finalEvaluations]);

  const selectedSessionConfig = useMemo(() => {
    return sessionConfigs.find(sc => sc.session_config_id === selectedSessionId) || null;
  }, [sessionConfigs, selectedSessionId]);

  const isFinalEvaluationSession = useMemo(() => {
    return checkIsFinalEvaluationSession(selectedSessionConfig, sessionConfigs);
  }, [selectedSessionConfig, sessionConfigs]);

  // Assessments for current selected session
  const sessionAssessmentsMap = useMemo(() => {
    const map = new Map<string, { attendance_status: AttendanceStatus; assessment_status?: string; hasProgress: boolean }>();
    if (!workspace?.assessments || !selectedSessionId) return map;

    workspace.assessments.forEach(a => {
      if (!a.is_deleted && a.session_config_id === selectedSessionId) {
        const hasQuran = a.surah_start != null && a.surah_start !== ('' as any) && a.lines_added != null && a.lines_added !== ('' as any);
        const hasNuroniyyah = (a.assessment_mode === 'NURONIYYAH' || a.nuroniyyah_dars != null) && a.lines_added != null && a.lines_added !== ('' as any);
        const hasIqra = a.iqra_level != null && a.iqra_level !== ('' as any) && a.iqra_page_start != null && a.iqra_page_start !== ('' as any);
        map.set(a.student_id, {
          attendance_status: a.attendance_status,
          assessment_status: a.assessment_status,
          hasProgress: hasQuran || hasNuroniyyah || hasIqra || (a.lines_added != null && Number(a.lines_added) > 0)
        });
      }
    });

    return map;
  }, [workspace?.assessments, selectedSessionId]);

  // Select all / Deselect all
  const isAllSelected = students.length > 0 && selectedStudentIds.length === students.length;
  const isSomeSelected = selectedStudentIds.length > 0 && selectedStudentIds.length < students.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(students.map(s => s.student_id));
    }
  };

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Bulk Attendance Action Handler
  const handleBulkAttendance = async (status: 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT', targetStudentIds?: string[]) => {
    const studentIdsToSubmit = targetStudentIds || selectedStudentIds;

    if (!selectedSessionId) {
      setBulkFeedback({ type: 'error', message: 'Silakan pilih sesi terlebih dahulu.' });
      return;
    }

    if (studentIdsToSubmit.length === 0) {
      setBulkFeedback({ type: 'error', message: 'Pilih minimal satu siswa untuk mengisi presensi.' });
      return;
    }

    setIsSavingBulk(true);
    setBulkFeedback(null);

    const statusLabels: Record<string, string> = {
      PRESENT: 'Hadir',
      SICK: 'Sakit',
      PERMISSION: 'Izin',
      ABSENT: 'Alpa'
    };

    try {
      const res = await ApiService.bulkSaveSessionAttendance(
        selectedSessionId,
        studentIdsToSubmit,
        status,
        currentUser?.user_id
      );

      await refreshWorkspace();
      
      setBulkFeedback({
        type: 'success',
        message: `Presensi [${statusLabels[status]}] untuk ${res.updatedCount || studentIdsToSubmit.length} siswa berhasil disimpan.`
      });
      
      // Clear selection after successful bulk save
      setSelectedStudentIds([]);
    } catch (err: any) {
      setBulkFeedback({
        type: 'error',
        message: err.message || 'Gagal menyimpan presensi massal. Silakan coba lagi.'
      });
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleAllPresentShortcut = () => {
    if (students.length === 0) return;
    const allIds = students.map(s => s.student_id);
    handleBulkAttendance('PRESENT', allIds);
  };

  // 1. Admin/Coordinator without a selected teacher
  if (isAdminOrCoord && !selectedTeacherId) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white rounded border border-slate-200 shadow-sm text-center space-y-6 animate-in fade-in">
        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
          <UserCheck className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">Pilih Guru untuk melihat workspace halaqah</h2>
          <p className="text-xs text-slate-500">
            Sebagai Administrator / Koordinator, silakan pilih guru untuk mengakses kelompok halaqah dan lembar kerja penilaian.
          </p>
        </div>
        <div className="text-left space-y-2">
          <label className="text-xs font-bold text-slate-700">Pilih Guru Pengampu:</label>
          <select
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">-- Pilih Guru --</option>
            {availableTeachers.map(t => (
              <option key={t.teacher_id} value={t.teacher_id}>
                {t.full_name} {t.short_name ? `(${t.short_name})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  // 2. Loading state: while fetching fresh data, always show loading indicator
  if ((isLoading || isRevalidating) && !workspace?.halaqah) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 font-medium">Memeriksa penugasan halaqah...</p>
        </div>
      </div>
    );
  }

  const halaqah = workspace?.halaqah;
  const availableHalaqahs = workspace?.availableHalaqahs || [];

  // 3. No halaqah assigned - only show after loading completes and confirms no assignment
  if (!halaqah || availableHalaqahs.length === 0) {
    if (isAdminOrCoord) {
      return (
        <div className="max-w-md mx-auto my-12 p-8 bg-white rounded border border-slate-200 shadow-sm text-center space-y-6 animate-in fade-in">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <Users className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">Guru Belum Memiliki Penugasan Halaqah</h2>
            <p className="text-xs text-slate-500">
              Guru yang dipilih belum memiliki penugasan kelompok halaqah aktif di kegiatan ini. Anda dapat memilih guru lain di bawah ini.
            </p>
          </div>
          <div className="text-left space-y-2">
            <label className="text-xs font-bold text-slate-700">Ganti Pilihan Guru:</label>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">-- Pilih Guru --</option>
              {availableTeachers.map(t => (
                <option key={t.teacher_id} value={t.teacher_id}>
                  {t.full_name} {t.short_name ? `(${t.short_name})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mx-auto">
          <Users className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Belum Ada Penugasan Halaqah</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Akun Anda saat ini belum ditugaskan pada kelompok halaqah aktif di kegiatan ini. Silakan hubungi koordinator/administrator untuk alokasi kelompok.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6 w-full max-w-full">
      
      {/* Top Sync & Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 w-full">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
          {/* Teacher Selector for Admin / Coordinator */}
          {isAdminOrCoord && availableTeachers.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500">Guru:</label>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500"
              >
                {availableTeachers.map(t => (
                  <option key={t.teacher_id} value={t.teacher_id}>
                    {t.full_name} {t.short_name ? `(${t.short_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Halaqah Selector */}
          {availableHalaqahs.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500">Halaqah:</label>
              <select
                value={activeHalaqahId || halaqah.halaqah_id}
                onChange={(e) => setActiveHalaqahId(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500"
              >
                {availableHalaqahs.map(h => (
                  <option key={h.halaqah_id} value={h.halaqah_id}>
                    {h.halaqah_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="self-start sm:self-auto">
          <TeacherSyncBadge />
        </div>
      </div>

      {/* Group Info Header */}
      <div className="bg-slate-900 text-white p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl border border-slate-800 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4 sm:gap-6 border-l-4 border-l-blue-500 w-full min-w-0">
        <div className="space-y-1.5 sm:space-y-2 w-full min-w-0 max-w-full flex-1">
          <div className="inline-flex items-center space-x-1.5 sm:space-x-2 bg-slate-800 px-2.5 py-1 rounded text-xs text-blue-400 font-semibold border border-slate-700">
            <Layers className="w-3.5 h-3.5" />
            <span>Kelompok Binaan Guru</span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white line-clamp-2 break-normal">{halaqah.group_name || halaqah.halaqah_name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-400 leading-relaxed">
            <span>Guru: <strong className="text-white">{halaqah.teacher_name}</strong></span>
            <span>&bull;</span>
            <span>Kapasitas: <strong className="text-white">{students.length}</strong> Siswa</span>
            {((halaqah.target_ziyadah_lines != null && halaqah.target_ziyadah_lines > 0) || (halaqah.target_nuroniyyah_lines != null && halaqah.target_nuroniyyah_lines > 0) || (halaqah.target_iqra_pages != null && halaqah.target_iqra_pages > 0)) && (
              <>
                <span>&bull;</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-950/80 border border-blue-700/60 text-blue-200 font-semibold text-xs">
                  <span>Target Kelompok:</span>
                  <strong className="text-white">
                    {[
                      halaqah.target_ziyadah_lines ? `${halaqah.target_ziyadah_lines} Baris Ziyadah` : null,
                      (halaqah.target_nuroniyyah_lines || halaqah.target_iqra_pages) ? `${halaqah.target_nuroniyyah_lines || halaqah.target_iqra_pages} Baris Nuroniyyah` : null
                    ].filter(Boolean).join(' • ')}
                  </strong>
                </span>
              </>
            )}
            {sessionConfigs.some(sc => checkIsFinalEvaluationSession(sc, sessionConfigs)) && (
              <>
                <span>&bull;</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-900/60 border border-purple-700 text-purple-200 font-semibold text-xs">
                  <span>Evaluasi Akhir:</span>
                  <strong className="text-white">{evaluatedStudentsCount} / {students.length}</strong>
                  <span>selesai</span>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full xl:w-auto shrink-0">
          {isFinalEvaluationSession ? (
            <button
              onClick={() => {
                if (onNavigateToEvaluation) {
                  onNavigateToEvaluation(undefined, selectedSessionConfig?.session_config_id);
                } else {
                  onNavigateToAssessment(undefined, selectedSessionConfig?.session_no);
                }
              }}
              className="w-full sm:w-auto justify-center px-4 sm:px-5 py-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold text-xs sm:text-sm rounded-lg shadow-sm transition flex items-center space-x-2 min-h-[44px] sm:min-h-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>Buka Form Evaluasi Akhir</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigateToAssessment(undefined, selectedSessionConfig?.session_no)}
              className="w-full sm:w-auto justify-center px-4 sm:px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs sm:text-sm rounded-lg shadow-sm transition flex items-center space-x-2 min-h-[44px] sm:min-h-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>Input Sesi Hafalan Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {bulkFeedback && (
        <div
          className={`p-3.5 sm:p-4 rounded-xl border text-xs font-semibold flex items-center justify-between animate-in fade-in ${
            bulkFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {bulkFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span className="leading-snug">{bulkFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBulkFeedback(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-3 p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bulk Attendance & Roster Card */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-3.5 sm:p-6 w-full max-w-full">
        
        {/* Bulk Attendance Controls Header (Sticky on Mobile) */}
        <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md -mx-3.5 sm:mx-0 px-3.5 sm:px-4 py-3 sm:py-4 border-b sm:border border-slate-200 sm:rounded-xl shadow-xs space-y-3">
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-4">
            
            {/* Session Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 shrink-0">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Pilih Sesi Presensi:</span>
              </div>
              {sessionConfigs.length > 0 ? (
                <select
                  value={selectedSessionId}
                  onChange={(e) => {
                    setSelectedSessionId(e.target.value);
                    setBulkFeedback(null);
                  }}
                  className="w-full sm:w-auto px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 shadow-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {sessionConfigs.map(sc => (
                    <option key={sc.session_config_id} value={sc.session_config_id}>
                      {formatSessionOptionLabel(sc, eventDays, false, sessionConfigs)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-amber-600 font-medium italic">Tidak ada sesi aktif untuk kelompok ini.</span>
              )}
            </div>

            {/* Selection Counter & Quick shortcut */}
            <div className="flex items-center justify-between sm:justify-end gap-2">
              <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs">
                {selectedStudentIds.length} dari {students.length} siswa dipilih
              </span>
              <button
                type="button"
                disabled={isSavingBulk || students.length === 0 || !selectedSessionId}
                onClick={handleAllPresentShortcut}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-2xs transition flex items-center space-x-1.5 shrink-0"
              >
                {isSavingBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                <span>Semua Hadir</span>
              </button>
            </div>
          </div>

          {/* Compact Session Summary Context */}
          {selectedSessionConfig && (
            <div className="pt-2 border-t border-slate-200/70">
              <SessionSummaryCard
                sessionConfig={selectedSessionConfig}
                eventDays={eventDays}
                allSessionConfigs={sessionConfigs}
              />
            </div>
          )}

          {/* Bulk Action Buttons */}
          <div className="pt-2.5 border-t border-slate-200/80">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 sm:hidden">
              Tandai Presensi:
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
                Tandai Presensi:
              </span>
              <button
                type="button"
                disabled={isSavingBulk || selectedStudentIds.length === 0 || !selectedSessionId}
                onClick={() => handleBulkAttendance('PRESENT')}
                className="min-h-[42px] sm:min-h-0 px-3 py-2 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center space-x-1.5"
              >
                {isSavingBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Hadir ({selectedStudentIds.length})</span>
              </button>

              <button
                type="button"
                disabled={isSavingBulk || selectedStudentIds.length === 0 || !selectedSessionId}
                onClick={() => handleBulkAttendance('SICK')}
                className="min-h-[42px] sm:min-h-0 px-3 py-2 sm:py-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center space-x-1.5"
              >
                <span>Sakit</span>
              </button>

              <button
                type="button"
                disabled={isSavingBulk || selectedStudentIds.length === 0 || !selectedSessionId}
                onClick={() => handleBulkAttendance('PERMISSION')}
                className="min-h-[42px] sm:min-h-0 px-3 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center space-x-1.5"
              >
                <span>Izin</span>
              </button>

              <button
                type="button"
                disabled={isSavingBulk || selectedStudentIds.length === 0 || !selectedSessionId}
                onClick={() => handleBulkAttendance('ABSENT')}
                className="min-h-[42px] sm:min-h-0 px-3 py-2 sm:py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center space-x-1.5"
              >
                <span>Alpa</span>
              </button>
            </div>
          </div>
        </div>

        {/* Header Roster Title */}
        <div className="flex items-center justify-between pb-2 pt-1 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-xs sm:text-sm uppercase text-slate-800">Daftar Siswa & Presensi Sesi</h3>
            <p className="text-[11px] sm:text-xs text-slate-500">
              Pilih checkbox siswa untuk presensi massal, atau klik "Input Sesi" untuk mengisi setoran hafalan.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
            {students.length} Siswa
          </span>
        </div>

        {/* ============================================================ */}
        {/* MOBILE CARDS VIEW (< 768px / md:hidden) */}
        {/* ============================================================ */}
        <div className="block md:hidden space-y-3">
          
          {/* Mobile Select All Bar */}
          <div className="flex items-center justify-between py-1.5 px-2 bg-slate-50 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="flex items-center space-x-2.5 text-xs font-bold text-slate-700 hover:text-blue-600 transition min-h-[40px]"
            >
              {isAllSelected ? (
                <CheckSquare className="w-5 h-5 text-blue-600" />
              ) : isSomeSelected ? (
                <CheckSquare className="w-5 h-5 text-blue-400" />
              ) : (
                <Square className="w-5 h-5 text-slate-400" />
              )}
              <span>{isAllSelected ? 'Batalkan Pilih Semua' : 'Pilih Semua Siswa'}</span>
            </button>
            <span className="text-[11px] font-semibold text-slate-500">
              {selectedStudentIds.length}/{students.length} dipilih
            </span>
          </div>

          {/* Student Cards List */}
          <div className="space-y-3">
            {students.map((st) => {
              const isSelected = selectedStudentIds.includes(st.student_id);
              const sessionAsm = sessionAssessmentsMap.get(st.student_id);
              const finalEval = finalEvaluations.find(fe => fe.student_id === st.student_id || (st.participant_id && fe.participant_id === st.participant_id));
              const isEvaluated = Boolean(finalEval);

              return (
                <div
                  key={st.student_id}
                  onClick={() => setSelectedStudentForHistory(st)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedStudentForHistory(st);
                    }
                  }}
                  title="Klik untuk melihat riwayat sesi siswa"
                  aria-label={`Lihat riwayat sesi untuk ${st.full_name}`}
                  className={`cursor-pointer rounded-xl border p-3.5 space-y-3 transition shadow-2xs group focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isSelected
                      ? 'bg-blue-50/40 border-blue-400 ring-1 ring-blue-400/30'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'
                  }`}
                >
                  {/* Card Header: Checkbox + Student Name + Class & NIS */}
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStudent(st.student_id);
                      }}
                      className="min-w-[44px] min-h-[44px] -ml-2 -mt-1 flex items-center justify-center text-slate-500 hover:text-blue-600 transition shrink-0"
                      aria-label={`Pilih ${st.full_name}`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300 hover:text-slate-500" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-700 transition leading-tight">
                          {st.full_name}
                        </h4>
                        <span className="text-[11px] text-blue-600 font-semibold opacity-80 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                          <span>Riwayat</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-slate-500 font-medium">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                          {st.grade_class}
                        </span>
                        <span className="font-semibold text-slate-600">
                          {formatSkillBadgeText(st.skill_status_start)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Attendance / Evaluation Status Badge */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                    {isFinalEvaluationSession ? (
                      isEvaluated ? (
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-xs font-bold border border-emerald-200 inline-flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>✓ Evaluasi Selesai</span>
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md text-xs font-bold border border-amber-200 inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Belum Dievaluasi</span>
                        </span>
                      )
                    ) : (
                      sessionAsm ? (
                        sessionAsm.attendance_status === 'PRESENT' ? (
                          sessionAsm.hasProgress || sessionAsm.assessment_status === 'COMPLETED' ? (
                            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-xs font-bold border border-emerald-200 inline-flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Hadir • Tuntas</span>
                            </span>
                          ) : (
                            <span className="bg-sky-50 text-sky-700 px-2.5 py-1 rounded-md text-xs font-bold border border-sky-200 inline-flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                              <span>Hadir • Belum Dinilai</span>
                            </span>
                          )
                        ) : sessionAsm.attendance_status === 'SICK' ? (
                          <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md text-xs font-bold border border-amber-200">
                            Sakit
                          </span>
                        ) : sessionAsm.attendance_status === 'PERMISSION' ? (
                          <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-xs font-bold border border-blue-200">
                            Izin
                          </span>
                        ) : sessionAsm.attendance_status === 'ABSENT' ? (
                          <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-md text-xs font-bold border border-rose-200">
                            Alpa
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200">
                            Belum Presensi
                          </span>
                        )
                      ) : (
                        <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200">
                          Belum Presensi
                        </span>
                      )
                    )}

                    {/* Completion status pill */}
                    {st.completionStatus === 'COMPLETE' ? (
                      <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-300 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Target Tuntas</span>
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">
                        Belum Tuntas
                      </span>
                    )}
                  </div>

                  {/* Target & Current Progress Info Box */}
                  <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Target Acara</p>
                      <p className="font-semibold text-slate-700 mt-0.5">{st.targetText || 'Belum ditentukan'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Progress</p>
                      <p className="font-bold text-blue-600 mt-0.5">
                        {formatSplitProgressDisplay(st)}
                      </p>
                    </div>
                  </div>

                  {/* Action Button */}
                  {isFinalEvaluationSession ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onNavigateToEvaluation) {
                          onNavigateToEvaluation(st.student_id, selectedSessionConfig?.session_config_id);
                        } else {
                          onNavigateToAssessment(st.student_id, selectedSessionConfig?.session_no);
                        }
                      }}
                      className={`w-full py-2.5 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-2 shadow-xs min-h-[44px] ${
                        isEvaluated
                          ? 'bg-purple-700 hover:bg-purple-800 active:bg-purple-900'
                          : 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800'
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>{isEvaluated ? 'Lihat / Edit Evaluasi' : 'Isi Evaluasi'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToAssessment(st.student_id, selectedSessionConfig?.session_no);
                      }}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-2 shadow-xs min-h-[44px]"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Input Sesi</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* ============================================================ */}
        {/* DESKTOP TABLE VIEW (>= 768px / hidden md:block) */}
        {/* ============================================================ */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-medium text-[10px] uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12 text-center">
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="p-1 text-slate-600 hover:text-blue-600 transition"
                      title={isAllSelected ? 'Batalkan Pilih Semua' : 'Pilih Semua'}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : isSomeSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="py-3 px-4">Nama Siswa</th>
                <th className="py-3 px-4">Kelas</th>
                <th className="py-3 px-4">Status Presensi</th>
                <th className="py-3 px-4">Target Acara</th>
                <th className="py-3 px-4">Total Penambahan</th>
                <th className="py-3 px-4">Status Target</th>
                <th className="py-3 px-4 text-right">Aksi Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st) => {
                const isSelected = selectedStudentIds.includes(st.student_id);
                const sessionAsm = sessionAssessmentsMap.get(st.student_id);
                const finalEval = finalEvaluations.find(fe => fe.student_id === st.student_id || (st.participant_id && fe.participant_id === st.participant_id));
                const isEvaluated = Boolean(finalEval);

                return (
                  <tr
                    key={st.student_id}
                    onClick={() => setSelectedStudentForHistory(st)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedStudentForHistory(st);
                      }
                    }}
                    title="Klik untuk melihat riwayat sesi siswa"
                    aria-label={`Lihat riwayat sesi untuk ${st.full_name}`}
                    className={`cursor-pointer transition-colors group focus:outline-none focus:bg-blue-50 ${
                      isSelected ? 'bg-blue-50/50 hover:bg-blue-100/50' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    {/* Checkbox "PILIH" */}
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStudent(st.student_id);
                          }}
                          className="p-1 text-slate-600 hover:text-blue-600 transition"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Student Name & Skill */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition">
                            {st.full_name}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium">{formatSkillBadgeText(st.skill_status_start)}</p>
                        </div>
                        <span className="opacity-0 group-hover:opacity-100 text-blue-600 transition ml-auto shrink-0" title="Lihat riwayat sesi">
                          <Eye className="w-4 h-4" />
                        </span>
                      </div>
                    </td>

                    {/* Class */}
                    <td className="py-3 px-4 font-medium text-slate-700">{st.grade_class}</td>

                    {/* Session Attendance & Assessment / Evaluation Status */}
                    <td className="py-3 px-4">
                      {isFinalEvaluationSession ? (
                        isEvaluated ? (
                          <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded text-[11px] font-bold border border-emerald-200 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>✓ Evaluasi Selesai</span>
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded text-[11px] font-bold border border-amber-200 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Belum Dievaluasi</span>
                          </span>
                        )
                      ) : (
                        sessionAsm ? (
                          sessionAsm.attendance_status === 'PRESENT' ? (
                            sessionAsm.hasProgress || sessionAsm.assessment_status === 'COMPLETED' ? (
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[11px] font-bold border border-emerald-200 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Hadir • Tuntas</span>
                              </span>
                            ) : (
                              <span className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded text-[11px] font-bold border border-sky-200 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-sky-600" />
                                <span>Hadir • Belum Dinilai</span>
                              </span>
                            )
                          ) : sessionAsm.attendance_status === 'SICK' ? (
                            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[11px] font-bold border border-amber-200">
                              Sakit
                            </span>
                          ) : sessionAsm.attendance_status === 'PERMISSION' ? (
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px] font-bold border border-blue-200">
                              Izin
                            </span>
                          ) : sessionAsm.attendance_status === 'ABSENT' ? (
                            <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded text-[11px] font-bold border border-rose-200">
                              Alpa
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Belum Presensi</span>
                          )
                        ) : (
                          <span className="text-slate-400 text-xs italic">Belum Presensi</span>
                        )
                      )}
                    </td>

                    {/* Target Event */}
                    <td className="py-3 px-4 font-medium text-slate-700">{st.targetText || 'Belum ditentukan'}</td>

                    {/* Total Lines Added */}
                    <td className="py-3 px-4 font-bold text-blue-600">{formatSplitProgressDisplay(st)}</td>

                    {/* Target Completion Status */}
                    <td className="py-3 px-4">
                      {st.completionStatus === 'COMPLETE' ? (
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded text-[10px] font-bold border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Tuntas</span>
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded text-[10px] font-bold border border-amber-200">
                          Belum Tuntas
                        </span>
                      )}
                    </td>

                    {/* Assessment / Evaluation Action */}
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {isFinalEvaluationSession ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onNavigateToEvaluation) {
                              onNavigateToEvaluation(st.student_id, selectedSessionConfig?.session_config_id);
                            } else {
                              onNavigateToAssessment(st.student_id, selectedSessionConfig?.session_no);
                            }
                          }}
                          className={`px-3 py-1.5 font-bold text-xs rounded border transition inline-flex items-center space-x-1 shadow-sm ${
                            isEvaluated
                              ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                              : 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600'
                          }`}
                        >
                          <span>{isEvaluated ? 'Lihat / Edit Evaluasi' : 'Isi Evaluasi'}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToAssessment(st.student_id, selectedSessionConfig?.session_no);
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-blue-700 font-bold text-xs rounded border border-slate-200 transition inline-flex items-center space-x-1 shadow-sm"
                        >
                          <span>Input Sesi</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Session History Modal */}
      {selectedStudentForHistory && (
        <StudentSessionHistoryModal
          student={selectedStudentForHistory}
          halaqahName={halaqah.group_name || halaqah.halaqah_name || 'Halaqah'}
          sessionConfigs={workspace?.sessionConfigs || []}
          assessments={workspace?.assessments || []}
          finalEvaluations={workspace?.finalEvaluations || []}
          eventDays={eventDays}
          onClose={() => setSelectedStudentForHistory(null)}
          onNavigateToAssessment={onNavigateToAssessment}
          onNavigateToEvaluation={onNavigateToEvaluation}
        />
      )}

    </div>
  );
};
