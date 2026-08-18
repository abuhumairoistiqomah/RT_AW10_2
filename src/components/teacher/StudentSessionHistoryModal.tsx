import React, { useMemo } from 'react';
import {
  TeacherStudentSummary,
  SessionAssessment,
  FinalEvaluation,
  SessionConfig,
  EventDay,
  SkillStatus
} from '../../types';
import { getSurahByNo } from '../../utils/quran';
import {
  getSessionDayLabel,
  formatSessionTimeRange,
  isFinalEvaluationSession,
  isSessionActive
} from '../../utils/sessionFormatter';
import {
  X,
  Calendar,
  Clock,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Award,
  Sparkles,
  HelpCircle,
  FileText,
  User,
  GraduationCap
} from 'lucide-react';

interface StudentSessionHistoryModalProps {
  student: TeacherStudentSummary;
  halaqahName: string;
  sessionConfigs: SessionConfig[];
  assessments: SessionAssessment[];
  finalEvaluations: FinalEvaluation[];
  eventDays: EventDay[];
  onClose: () => void;
  onNavigateToAssessment?: (studentId: string, sessionNo?: number) => void;
  onNavigateToEvaluation?: (studentId: string, sessionConfigId?: string) => void;
}

export const StudentSessionHistoryModal: React.FC<StudentSessionHistoryModalProps> = ({
  student,
  halaqahName,
  sessionConfigs,
  assessments,
  finalEvaluations,
  eventDays,
  onClose,
  onNavigateToAssessment,
  onNavigateToEvaluation
}) => {
  // Filter and sort active session configs for the student's session group
  const studentSessionConfigs = useMemo(() => {
    const studentGroupId = student.session_group_id;
    const activeConfigs = (sessionConfigs || []).filter(sc => {
      if (!isSessionActive(sc.active)) return false;
      if (studentGroupId && sc.session_group_id && sc.session_group_id !== studentGroupId) {
        return false;
      }
      return true;
    });

    // Sort strictly by session_no ascending
    return activeConfigs.sort((a, b) => (Number(a.session_no) || 0) - (Number(b.session_no) || 0));
  }, [sessionConfigs, student.session_group_id]);

  // Find final evaluation record for this student
  const finalEval = useMemo(() => {
    return (finalEvaluations || []).find(
      fe => fe.student_id === student.student_id || (student.participant_id && fe.participant_id === student.participant_id)
    );
  }, [finalEvaluations, student.student_id, student.participant_id]);

  // Map each session config to the student's assessment
  const sessionRows = useMemo(() => {
    return studentSessionConfigs.map(sc => {
      const asm = (assessments || []).find(
        a => !a.is_deleted &&
          a.student_id === student.student_id &&
          (a.session_config_id === sc.session_config_id || Number(a.session_no) === Number(sc.session_no))
      );

      const isFinal = isFinalEvaluationSession(sc, studentSessionConfigs);
      const dayLabel = getSessionDayLabel(sc.event_day_id, eventDays);
      const timeRange = formatSessionTimeRange(sc.start_time, sc.end_time);

      return {
        sessionConfig: sc,
        assessment: asm || null,
        isFinal,
        dayLabel,
        timeRange
      };
    });
  }, [studentSessionConfigs, assessments, student.student_id, eventDays]);

  // Summary Metrics calculation (Strict rules: based on assessment_mode, NOT on skill_status)
  const summaryMetrics = useMemo(() => {
    let presentCount = 0;
    let sickCount = 0;
    let permissionCount = 0;
    let absentCount = 0;
    let unassessedCount = 0;
    let totalHafalanLines = 0;
    let totalNuroniyyahLines = 0;

    sessionRows.forEach(({ assessment }) => {
      if (!assessment || !assessment.attendance_status) {
        unassessedCount++;
        return;
      }

      switch (assessment.attendance_status) {
        case 'PRESENT':
          presentCount++;
          const lines = assessment.lines_added != null && !isNaN(Number(assessment.lines_added))
            ? Number(assessment.lines_added)
            : 0;

          const isNuroniyyah = assessment.assessment_mode === 'NURONIYYAH' ||
            Boolean(assessment.nuroniyyah_dars && !assessment.surah_start && !assessment.surah_end);

          if (isNuroniyyah) {
            totalNuroniyyahLines += lines;
          } else {
            // Default is ZIYADAH / Hafalan Al-Qur'an
            totalHafalanLines += lines;
          }
          break;
        case 'SICK':
          sickCount++;
          break;
        case 'PERMISSION':
          permissionCount++;
          break;
        case 'ABSENT':
          absentCount++;
          break;
        default:
          unassessedCount++;
          break;
      }
    });

    return {
      totalSessions: sessionRows.length,
      presentCount,
      sickCount,
      permissionCount,
      absentCount,
      unassessedCount,
      totalHafalanLines,
      totalNuroniyyahLines
    };
  }, [sessionRows]);

  // Format skill status badge (Never default missing to NON-BBL)
  const renderSkillStatus = (skill?: SkillStatus | string) => {
    if (!skill || String(skill).trim() === '') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          Belum diisi
        </span>
      );
    }

    switch (skill) {
      case 'BBL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            BBL (Bisa Baca Al-Qur'an)
          </span>
        );
      case 'NON_BBL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            NON-BBL (Nuroniyyah)
          </span>
        );
      case 'BBLS':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            BBLS (Bersyarat)
          </span>
        );
      case 'TAHSIN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            TAHSIN
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {skill}
          </span>
        );
    }
  };

  // Format attendance badge
  const renderAttendanceBadge = (status?: string | null) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Hadir</span>
          </span>
        );
      case 'SICK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Sakit</span>
          </span>
        );
      case 'PERMISSION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>Izin</span>
          </span>
        );
      case 'ABSENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <X className="w-3.5 h-3.5 text-rose-600" />
            <span>Alpa</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Belum Dinilai</span>
          </span>
        );
    }
  };

  // Format Qur'an / Nuroniyyah assessment progress detail
  const renderProgressDetail = (asm: SessionAssessment) => {
    const isNuroniyyah = asm.assessment_mode === 'NURONIYYAH' ||
      Boolean(asm.nuroniyyah_dars && !asm.surah_start && !asm.surah_end);

    if (isNuroniyyah) {
      const darsText = asm.nuroniyyah_dars ? asm.nuroniyyah_dars.trim() : null;
      const lines = asm.lines_added != null && !isNaN(Number(asm.lines_added)) ? Number(asm.lines_added) : null;

      if (!darsText && lines == null) {
        return (
          <div className="text-xs text-slate-400 italic">
            Belum ada rincian setoran
          </div>
        );
      }

      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold rounded">
              Nuroniyyah
            </span>
            {darsText && (
              <span className="font-bold text-slate-800 text-xs sm:text-sm">
                {darsText}
              </span>
            )}
          </div>
          {lines != null ? (
            <div className="text-xs font-bold text-indigo-600">
              +{lines} Baris
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic">
              Jumlah baris belum diisi
            </div>
          )}
        </div>
      );
    }

    // Mode Hafalan Al-Qur'an (ZIYADAH)
    const surahNo = asm.surah_end || asm.surah_start;
    const hasSurah = surahNo != null && !isNaN(Number(surahNo)) && Number(surahNo) > 0;
    const lines = asm.lines_added != null && !isNaN(Number(asm.lines_added)) ? Number(asm.lines_added) : null;

    if (!hasSurah && lines == null) {
      return (
        <div className="text-xs text-slate-400 italic">
          Belum ada rincian setoran
        </div>
      );
    }

    let surahName = '';
    if (hasSurah) {
      const sObj = getSurahByNo(Number(surahNo));
      surahName = sObj ? `${sObj.surah_no}. ${sObj.surah_name}` : `Surah #${surahNo}`;
    }

    let ayahRange = '';
    if (asm.ayah_start != null && asm.ayah_end != null) {
      ayahRange = asm.ayah_start === asm.ayah_end
        ? `Ayat ${asm.ayah_start}`
        : `Ayat ${asm.ayah_start}–${asm.ayah_end}`;
    } else if (asm.ayah_end != null) {
      ayahRange = `Ayat ${asm.ayah_end}`;
    } else if (asm.ayah_start != null) {
      ayahRange = `Ayat ${asm.ayah_start}`;
    }

    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold rounded">
            Hafalan Al-Qur'an
          </span>
          {surahName && (
            <span className="font-bold text-slate-800 text-xs sm:text-sm">
              {surahName} {ayahRange ? `: ${ayahRange}` : ''}
            </span>
          )}
        </div>
        {lines != null ? (
          <div className="text-xs font-bold text-emerald-600">
            +{lines} Baris
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 italic">
            Jumlah baris belum diisi
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-history-title"
    >
      <div className="max-h-[85vh] sm:max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden transition-all my-auto">
        
        {/* ============================================================ */}
        {/* MODAL HEADER (Sticky Top) */}
        {/* ============================================================ */}
        <div className="sticky top-0 z-20 bg-slate-900 text-white px-4 sm:px-6 py-4 border-b border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-md text-[11px] font-bold uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>Riwayat Sesi Siswa</span>
              </span>
              <span className="text-xs text-slate-400 font-mono">
                NIS: {student.nis || '-'}
              </span>
            </div>

            <h2 id="modal-history-title" className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
              {student.full_name}
            </h2>

            {/* Student Metadata Info Badges */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-300 pt-0.5">
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Kelas:</span>
                <strong className="text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-[11px]">
                  {student.grade_class || student.grade_snapshot || '-'}
                </strong>
              </div>

              <span>&bull;</span>

              <div className="flex items-center gap-1">
                <span className="text-slate-400">Halaqah:</span>
                <strong className="text-white">{halaqahName}</strong>
              </div>

              <span>&bull;</span>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Skill Awal:</span>
                {renderSkillStatus(student.skill_status_start)}
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-800 p-2 rounded-xl transition shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Tutup riwayat sesi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* MODAL BODY (Internally Scrollable) */}
        {/* ============================================================ */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-5 flex-1 min-h-0 bg-slate-50/50">

          {/* 1. TOP SUMMARY METRICS (Section 11) */}
          <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Ringkasan Kehadiran & Capaian</span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                Target: <strong>{student.targetText || '-'}</strong>
              </span>
            </div>

            {/* Metrics Chips Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Sesi</div>
                <div className="text-base font-bold text-slate-800 mt-0.5">{summaryMetrics.totalSessions}</div>
              </div>

              <div className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-100 text-center">
                <div className="text-[10px] uppercase font-bold text-emerald-700">Hadir</div>
                <div className="text-base font-bold text-emerald-700 mt-0.5">{summaryMetrics.presentCount}</div>
              </div>

              <div className="bg-amber-50/70 p-2.5 rounded-lg border border-amber-100 text-center">
                <div className="text-[10px] uppercase font-bold text-amber-700">Sakit</div>
                <div className="text-base font-bold text-amber-700 mt-0.5">{summaryMetrics.sickCount}</div>
              </div>

              <div className="bg-blue-50/70 p-2.5 rounded-lg border border-blue-100 text-center">
                <div className="text-[10px] uppercase font-bold text-blue-700">Izin</div>
                <div className="text-base font-bold text-blue-700 mt-0.5">{summaryMetrics.permissionCount}</div>
              </div>

              <div className="bg-rose-50/70 p-2.5 rounded-lg border border-rose-100 text-center col-span-2 sm:col-span-1">
                <div className="text-[10px] uppercase font-bold text-rose-700">Alpa</div>
                <div className="text-base font-bold text-rose-700 mt-0.5">{summaryMetrics.absentCount}</div>
              </div>
            </div>

            {/* Line Progress Totals (Strictly partitioned by mode) */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between bg-emerald-50/50 px-3 py-2 rounded-lg border border-emerald-100">
                <span className="font-semibold text-emerald-900">Total Baris Hafalan Al-Qur'an:</span>
                <strong className="text-emerald-700 font-bold text-sm">
                  +{summaryMetrics.totalHafalanLines} Baris
                </strong>
              </div>

              <div className="flex items-center justify-between bg-indigo-50/50 px-3 py-2 rounded-lg border border-indigo-100">
                <span className="font-semibold text-indigo-900">Total Baris Nuroniyyah:</span>
                <strong className="text-indigo-700 font-bold text-sm">
                  +{summaryMetrics.totalNuroniyyahLines} Baris
                </strong>
              </div>
            </div>
          </div>

          {/* 2. SESSIONS TIMELINE / CARDS LIST (Sections 3, 4, 5, 6, 7, 8, 9, 10) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Rincian Sesi Pembelajaran ({sessionRows.length} Sesi)</span>
              </h3>
            </div>

            {sessionRows.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-500 space-y-2">
                <Calendar className="w-8 h-8 mx-auto text-slate-400" />
                <p className="text-xs font-bold">Tidak ada sesi aktif yang ditemukan.</p>
                <p className="text-[11px] text-slate-400">
                  Belum ada konfigurasi sesi aktif untuk kelompok jadwal santri ini.
                </p>
              </div>
            ) : (
              sessionRows.map(({ sessionConfig, assessment, isFinal, dayLabel, timeRange }) => {
                const isPresent = assessment?.attendance_status === 'PRESENT';
                const hasAttendance = Boolean(assessment?.attendance_status);

                return (
                  <div
                    key={sessionConfig.session_config_id}
                    className={`bg-white rounded-xl border transition-all p-4 shadow-2xs space-y-3 ${
                      isFinal
                        ? 'border-purple-200 ring-1 ring-purple-100 bg-linear-to-r from-purple-50/20 to-white'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Session Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                          {sessionConfig.session_no}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                              Sesi {sessionConfig.session_no}
                            </h4>
                            {isFinal && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold rounded-md flex items-center gap-1">
                                <Award className="w-3 h-3 text-purple-600" />
                                <span>Evaluasi Akhir</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium mt-0.5">
                            <span>{dayLabel}</span>
                            {timeRange && (
                              <>
                                <span>&bull;</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>{timeRange}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Attendance Badge & Quick Action */}
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        {renderAttendanceBadge(assessment?.attendance_status)}

                        {onNavigateToAssessment && !isFinal && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onNavigateToAssessment(student.student_id, sessionConfig.session_no);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-blue-700 text-[11px] font-semibold rounded border border-slate-200 transition"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Detail Section */}
                    {isPresent ? (
                      <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
                        {renderProgressDetail(assessment!)}
                      </div>
                    ) : hasAttendance ? (
                      <div className="text-xs text-slate-500 bg-slate-50/60 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          Siswa tidak hadir ({renderAttendanceBadge(assessment?.attendance_status)}). Tidak ada penambahan baris setoran.
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic bg-slate-50/40 p-2.5 rounded-lg border border-slate-100">
                        Sesi ini belum dilakukan pencatatan presensi atau penilaian.
                      </div>
                    )}

                    {/* Session Note (if provided) */}
                    {assessment?.session_note && assessment.session_note.trim() !== '' && (
                      <div className="bg-amber-50/60 text-amber-900 border border-amber-200/70 p-2.5 rounded-lg text-xs space-y-1">
                        <div className="font-bold text-[10px] uppercase text-amber-800 flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          <span>Catatan Guru:</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed pl-4">
                          {assessment.session_note}
                        </p>
                      </div>
                    )}

                    {/* Final Evaluation Subsection (Only on the last active session) */}
                    {isFinal && (
                      <div className="mt-3 pt-3 border-t border-purple-200/80 bg-purple-50/40 -mx-4 -mb-4 p-4 rounded-b-xl space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900">
                            <GraduationCap className="w-4 h-4 text-purple-700" />
                            <span>Hasil Evaluasi Akhir</span>
                          </div>
                          {finalEval && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              finalEval.completion_status === 'COMPLETE'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}>
                              {finalEval.completion_status === 'COMPLETE' ? '✓ Target Tuntas' : 'Belum Tuntas'}
                            </span>
                          )}
                        </div>

                        {finalEval ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="bg-white p-2.5 rounded-lg border border-purple-100 space-y-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Capaian Ujian Evaluasi</span>
                              <p className="font-semibold text-slate-800">
                                {(() => {
                                  const sStart = getSurahByNo(finalEval.evaluation_surah_start);
                                  const sEnd = getSurahByNo(finalEval.evaluation_surah_end);
                                  const startTxt = sStart ? `${sStart.surah_name} : ${finalEval.evaluation_ayah_start}` : `Surah #${finalEval.evaluation_surah_start}`;
                                  const endTxt = sEnd ? `${sEnd.surah_name} : ${finalEval.evaluation_ayah_end}` : `Surah #${finalEval.evaluation_surah_end}`;
                                  return `${startTxt} s/d ${endTxt}`;
                                })()}
                              </p>
                            </div>

                            <div className="bg-white p-2.5 rounded-lg border border-purple-100 space-y-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Skor & Predikat Afektif</span>
                              <div className="flex items-center gap-2">
                                {finalEval.final_score != null && (
                                  <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                    Skor: {finalEval.final_score}
                                  </span>
                                )}
                                {finalEval.affective_rating && (
                                  <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                    Predikat: {finalEval.affective_rating}
                                  </span>
                                )}
                              </div>
                            </div>

                            {(finalEval.final_note || finalEval.affective_note) && (
                              <div className="sm:col-span-2 bg-white p-2.5 rounded-lg border border-purple-100 text-xs">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Catatan Evaluator</span>
                                <p className="text-slate-700 italic">
                                  "{finalEval.final_note || finalEval.affective_note}"
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-purple-100 text-xs">
                            <span className="text-slate-500 italic">
                              Form evaluasi akhir belum diisi untuk santri ini.
                            </span>
                            {onNavigateToEvaluation && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onNavigateToEvaluation(student.student_id, sessionConfig.session_config_id);
                                }}
                                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] rounded transition"
                              >
                                Isi Evaluasi
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* MODAL FOOTER */}
        {/* ============================================================ */}
        <div className="px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            Total Sesi: <strong>{sessionRows.length} Sesi</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg transition shadow-xs focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
