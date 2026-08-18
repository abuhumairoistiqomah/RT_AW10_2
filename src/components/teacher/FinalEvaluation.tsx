import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, CompletionStatus, SkillStatus } from '../../types';
import { useTeacherWorkspace } from '../../context/TeacherWorkspaceContext';
import { TeacherSyncBadge } from './TeacherSyncBadge';
import { getSurahNameFormatted, validateAyah, formatCurrentProgress } from '../../utils/quran';
import { Toast } from '../common/Toast';
import {
  Award, CheckCircle2, Save,
  AlertCircle, UserCheck, RefreshCw, ArrowRight, Loader2
} from 'lucide-react';
import { SurahAutocomplete } from '../common/SurahAutocomplete';

interface FinalEvaluationProps {
  currentUser: User | null;
  initialStudentId?: string;
}

export const FinalEvaluation: React.FC<FinalEvaluationProps> = ({ currentUser, initialStudentId }) => {
  const {
    workspace,
    isLoading,
    isRevalidating,
    saveFinalEvaluationOptimistic,
    activeHalaqahId,
    setActiveHalaqahId,
    selectedTeacherId,
    setSelectedTeacherId,
    availableTeachers
  } = useTeacherWorkspace();

  const isAdminOrCoord = currentUser?.role === 'ADMIN' || currentUser?.role === 'COORDINATOR';

  const [submitting, setSubmitting] = useState<boolean>(false);

  // Success / Error messages & Floating Toast
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; detail?: string; type: 'success' | 'error' } | null>(null);

  // Ref to form top for smooth scrolling after save
  const formTopRef = useRef<HTMLDivElement>(null);

  // Selected State
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');

  // Form Fields
  const [evalSurahStart, setEvalSurahStart] = useState<number | undefined>(undefined);
  const [evalAyahStart, setEvalAyahStart] = useState<string>('');
  const [evalSurahEnd, setEvalSurahEnd] = useState<number | undefined>(undefined);
  const [evalAyahEnd, setEvalAyahEnd] = useState<string>('');

  const [finalScore, setFinalScore] = useState<string>('');
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus | undefined>(undefined);
  const [skillStatusEnd, setSkillStatusEnd] = useState<SkillStatus | undefined>(undefined);
  const [affectiveGrade, setAffectiveGrade] = useState<'A' | 'B' | 'C' | 'D' | undefined>(undefined);
  const [affectiveNote, setAffectiveNote] = useState<string>('');
  const [finalNote, setFinalNote] = useState<string>('');

  // Mode Edit Tracker
  const [existingEvaluationId, setExistingEvaluationId] = useState<string | null>(null);

  // Workspace references
  const halaqah = workspace?.halaqah || null;
  const availableHalaqahs = workspace?.availableHalaqahs || [];
  const students = useMemo(() => workspace?.students || [], [workspace?.students]);
  const evaluations = useMemo(() => workspace?.finalEvaluations || [], [workspace?.finalEvaluations]);
  const assessments = useMemo(() => workspace?.assessments || [], [workspace?.assessments]);
  const sessionConfigs = useMemo(() => workspace?.sessionConfigs || [], [workspace?.sessionConfigs]);

  // Sync initialStudentId if passed from parent
  useEffect(() => {
    if (initialStudentId && students.some(s => s.student_id === initialStudentId)) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId, students]);

  // Set default selected student
  useEffect(() => {
    if (students.length > 0) {
      if (!selectedStudentId || !students.some(s => s.student_id === selectedStudentId)) {
        setSelectedStudentId(initialStudentId && students.some(s => s.student_id === initialStudentId) ? initialStudentId : students[0].student_id);
      }
    }
  }, [students, selectedStudentId, initialStudentId]);

  // Selected Student Detail
  const selectedStudent = useMemo(() => {
    return students.find(s => s.student_id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Student assessments & line additions
  const studentMetrics = useMemo(() => {
    if (!selectedStudentId) return { totalLines: 0, coverageText: '0 / 0 Sesi', latestSetoran: null };

    const studentAsms = assessments.filter(a =>
      !a.is_deleted &&
      a.student_id === selectedStudentId
    );

    const presentAsms = studentAsms.filter(a => a.attendance_status === 'PRESENT');
    const totalLines = presentAsms.reduce((sum, a) => sum + (a.lines_added || 0), 0);

    const sorted = presentAsms.slice().sort((a, b) => b.session_no - a.session_no);
    const latest = sorted.find(a => a.surah_end && a.ayah_end) || null;

    // Session coverage
    const groupId = halaqah?.session_group_id;
    const applicableConfigs = groupId
      ? sessionConfigs.filter(sc => !sc.session_group_id || sc.session_group_id === groupId)
      : sessionConfigs;

    const totalConfigured = applicableConfigs.length;
    const evaluatedCount = studentAsms.length;

    return {
      totalLines,
      coverageText: `${evaluatedCount} dari ${totalConfigured} Sesi Evaluasi`,
      latestSetoran: latest
    };
  }, [assessments, selectedStudentId, halaqah, sessionConfigs]);

  // Populate form when selected student changes
  useEffect(() => {
    if (!selectedStudentId) return;

    setSuccessMsg('');
    setErrorMsg('');

    // Find existing evaluation
    const existing = evaluations.find(e => e.student_id === selectedStudentId || (selectedStudent && e.participant_id === selectedStudent.participant_id));

    if (existing) {
      setExistingEvaluationId(existing.final_evaluation_id);
      setEvalSurahStart(existing.evaluation_surah_start);
      setEvalAyahStart(existing.evaluation_ayah_start ? String(existing.evaluation_ayah_start) : '');
      setEvalSurahEnd(existing.evaluation_surah_end);
      setEvalAyahEnd(existing.evaluation_ayah_end ? String(existing.evaluation_ayah_end) : '');

      setFinalScore(existing.final_score != null ? String(existing.final_score) : '');
      if (existing.completion_status === 'COMPLETE' || existing.completion_status === 'INCOMPLETE') {
        setCompletionStatus(existing.completion_status);
      } else {
        setCompletionStatus(undefined);
      }
      setSkillStatusEnd(existing.skill_status_end || undefined);

      const effGrade = typeof existing.affective_rating === 'string' ? existing.affective_rating : undefined;
      if (effGrade && ['A', 'B', 'C', 'D'].includes(effGrade.toUpperCase())) {
        setAffectiveGrade(effGrade.toUpperCase() as 'A' | 'B' | 'C' | 'D');
      } else {
        setAffectiveGrade(undefined);
      }
      setAffectiveNote(existing.affective_note || '');
      setFinalNote(existing.final_note || '');
    } else {
      setExistingEvaluationId(null);
      // Smart default range from participant target or baseline
      setEvalSurahStart(selectedStudent?.target_surah_start || selectedStudent?.baseline_surah || undefined);
      setEvalAyahStart(selectedStudent?.target_ayah_start ? String(selectedStudent.target_ayah_start) : selectedStudent?.baseline_ayah ? String(selectedStudent.baseline_ayah) : '');
      setEvalSurahEnd(selectedStudent?.target_surah_end || selectedStudent?.target_surah_start || selectedStudent?.baseline_surah || undefined);
      setEvalAyahEnd(selectedStudent?.target_ayah_end ? String(selectedStudent.target_ayah_end) : '');

      setFinalScore('');
      setCompletionStatus(undefined);
      setSkillStatusEnd(undefined);
      setAffectiveGrade(undefined);
      setAffectiveNote('');
      setFinalNote('');
    }
  }, [selectedStudentId, evaluations, selectedStudent]);

  // Form Validation
  const validateForm = (): string | null => {
    if (!selectedStudentId) {
      return 'Pilih siswa terlebih dahulu.';
    }

    if (evalSurahStart) {
      if (!evalAyahStart || Number(evalAyahStart) < 1) {
        return 'Ayat awal evaluasi harus angka positif.';
      }
      const vStart = validateAyah(evalSurahStart, Number(evalAyahStart));
      if (!vStart.valid) {
        return `Ayat awal evaluasi tidak valid: ${vStart.message}`;
      }
    }

    if (evalSurahEnd) {
      if (!evalAyahEnd || Number(evalAyahEnd) < 1) {
        return 'Ayat akhir evaluasi harus angka positif.';
      }
      const vEnd = validateAyah(evalSurahEnd, Number(evalAyahEnd));
      if (!vEnd.valid) {
        return `Ayat akhir evaluasi tidak valid: ${vEnd.message}`;
      }
    }

    if (!completionStatus || (completionStatus as string) === 'NOT_EVALUATED') {
      return 'Status ketuntasan target (Tuntas Target / Belum Tuntas Target) wajib dipilih.';
    }

    if (!skillStatusEnd) {
      return 'Status kemampuan akhir siswa (NON-BBL / BBL / BBLS) wajib dipilih.';
    }

    if (finalScore !== '') {
      const scoreNum = Number(finalScore);
      if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
        return 'Nilai akhir harus berupa angka antara 0 hingga 100.';
      }
    }

    return null;
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const valErr = validateForm();
    if (valErr) {
      setErrorMsg(valErr);
      setToast({
        type: 'error',
        message: 'Validasi formulir tidak lengkap',
        detail: valErr
      });
      return;
    }

    setSubmitting(true);
    try {
      const evaluatorTeacherId = currentUser?.teacher_id || '';

      const payload = {
        student_id: selectedStudentId,
        participant_id: selectedStudent?.participant_id,
        evaluation_surah_start: evalSurahStart ? Number(evalSurahStart) : undefined,
        evaluation_ayah_start: evalAyahStart !== '' ? Number(evalAyahStart) : undefined,
        evaluation_surah_end: evalSurahEnd ? Number(evalSurahEnd) : undefined,
        evaluation_ayah_end: evalAyahEnd !== '' ? Number(evalAyahEnd) : undefined,
        final_score: finalScore !== '' ? Number(finalScore) : undefined,
        completion_status: completionStatus,
        skill_status_end: skillStatusEnd,
        affective_rating: affectiveGrade || undefined,
        affective_note: affectiveNote,
        evaluator_notes: finalNote,
        evaluator_teacher_id: evaluatorTeacherId
      };

      const saveResult = await saveFinalEvaluationOptimistic(payload);
      if (saveResult && saveResult.success === false) {
        throw new Error(saveResult.error || 'Gagal menyimpan evaluasi akhir.');
      }

      const studentName = selectedStudent?.full_name || 'siswa';
      setSuccessMsg(`✓ Evaluasi akhir untuk ${studentName} berhasil disimpan!`);
      setToast({
        type: 'success',
        message: '✓ Data berhasil disimpan.',
        detail: `Evaluasi akhir untuk ${studentName} berhasil disimpan dan disinkronkan.`
      });

      // Smooth scroll to top of evaluation form
      setTimeout(() => {
        formTopRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 60);

    } catch (err: any) {
      setErrorMsg('Gagal menyimpan evaluasi akhir: ' + (err.message || 'Silakan coba lagi.'));
      setToast({
        type: 'error',
        message: 'Gagal menyimpan data.',
        detail: err.message || 'Terjadi kesalahan saat menyimpan evaluasi akhir.'
      });
      // Do NOT scroll away on error - preserve form values and teacher position
    } finally {
      setSubmitting(false);
    }
  };

  // Submit and Next Student Handler
  const handleSaveAndNext = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const valErr = validateForm();
    if (valErr) {
      setErrorMsg(valErr);
      setToast({
        type: 'error',
        message: 'Validasi formulir tidak lengkap',
        detail: valErr
      });
      return;
    }

    setSubmitting(true);
    try {
      const evaluatorTeacherId = currentUser?.teacher_id || '';

      const payload = {
        student_id: selectedStudentId,
        participant_id: selectedStudent?.participant_id,
        evaluation_surah_start: evalSurahStart ? Number(evalSurahStart) : undefined,
        evaluation_ayah_start: evalAyahStart !== '' ? Number(evalAyahStart) : undefined,
        evaluation_surah_end: evalSurahEnd ? Number(evalSurahEnd) : undefined,
        evaluation_ayah_end: evalAyahEnd !== '' ? Number(evalAyahEnd) : undefined,
        final_score: finalScore !== '' ? Number(finalScore) : undefined,
        completion_status: completionStatus,
        skill_status_end: skillStatusEnd,
        affective_rating: affectiveGrade || undefined,
        affective_note: affectiveNote,
        evaluator_notes: finalNote,
        evaluator_teacher_id: evaluatorTeacherId
      };

      const saveResult = await saveFinalEvaluationOptimistic(payload);
      if (saveResult && saveResult.success === false) {
        throw new Error(saveResult.error || 'Gagal menyimpan evaluasi akhir.');
      }

      const studentName = selectedStudent?.full_name || 'siswa';
      const currentIndex = students.findIndex(s => s.student_id === selectedStudentId);

      if (currentIndex >= 0 && currentIndex < students.length - 1) {
        const nextStudent = students[currentIndex + 1];
        setSelectedStudentId(nextStudent.student_id);
        setSuccessMsg(`✓ Evaluasi ${studentName} berhasil disimpan. Beralih ke: ${nextStudent.full_name}`);
        setToast({
          type: 'success',
          message: '✓ Data berhasil disimpan.',
          detail: `Evaluasi akhir ${studentName} tersimpan. Menampilkan formulir: ${nextStudent.full_name}`
        });
      } else {
        setSuccessMsg(`✓ Evaluasi ${studentName} berhasil disimpan! (Semua siswa dalam halaqah ini telah dievaluasi)`);
        setToast({
          type: 'success',
          message: '✓ Data berhasil disimpan.',
          detail: `Evaluasi akhir ${studentName} tersimpan. Semua siswa dalam halaqah ini telah selesai.`
        });
      }

      // Smooth scroll to top of evaluation form
      setTimeout(() => {
        formTopRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 60);

    } catch (err: any) {
      setErrorMsg('Gagal menyimpan evaluasi akhir: ' + (err.message || 'Silakan coba lagi.'));
      setToast({
        type: 'error',
        message: 'Gagal menyimpan data.',
        detail: err.message || 'Terjadi kesalahan saat menyimpan evaluasi akhir.'
      });
      // Do NOT scroll away on error - preserve form values and teacher position
    } finally {
      setSubmitting(false);
    }
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

  if (!halaqah || availableHalaqahs.length === 0) {
    if (isAdminOrCoord) {
      return (
        <div className="max-w-md mx-auto my-12 p-8 bg-white rounded border border-slate-200 shadow-sm text-center space-y-6 animate-in fade-in">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <UserCheck className="w-7 h-7" />
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
          <UserCheck className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Belum Ada Penugasan Halaqah</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Akun Anda saat ini belum ditugaskan pada kelompok halaqah aktif. Silakan hubungi koordinator/administrator untuk alokasi kelompok.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-in fade-in relative">
      {/* Floating Save Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          detail={toast.detail}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      
      {/* Top Sync & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
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
              <label className="text-xs font-bold text-slate-500">Pilih Halaqah:</label>
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
        <TeacherSyncBadge />
      </div>

      {/* Title Header */}
      <div className="bg-slate-900 text-white p-6 rounded border border-slate-800 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-l-4 border-l-blue-500 w-full min-w-0">
        <div className="space-y-1 w-full min-w-0 max-w-full flex-1">
          <div className="inline-flex items-center space-x-2 text-xs text-blue-400 font-semibold">
            <Award className="w-4 h-4" />
            <span>Formulir Evaluasi Perkembangan Siswa</span>
            {isAdminOrCoord && (
              <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold">
                Mode Administrasi
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white line-clamp-2 break-normal">Evaluasi Perkembangan Siswa</h2>
          <p className="text-xs text-slate-400 break-normal">
            Kelompok: <strong className="text-white">{halaqah.group_name || halaqah.halaqah_name}</strong> &bull; Guru: {halaqah.teacher_name}
          </p>
        </div>
      </div>

      {/* Form Top Anchor for Smooth Scrolling & Student Context */}
      <div ref={formTopRef} className="scroll-mt-6 space-y-4">
        {/* Success & Error Alerts */}
        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded font-semibold text-xs flex items-center space-x-2 border-l-4 border-l-emerald-500">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded font-semibold text-xs flex items-center space-x-2 border-l-4 border-l-rose-500">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Student Context Card */}
        {selectedStudent && (
          <div className="bg-white p-5 rounded border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  Konteks Perkembangan Siswa
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedStudent.full_name} <span className="text-xs font-normal text-slate-500">(NIS: {selectedStudent.nis || 'Belum tersedia'})</span>
                </h3>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-700 block">Kelas</span>
                <span className="text-xs font-semibold text-slate-500">{selectedStudent.grade_class || 'Belum tersedia'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1">
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Kemampuan Awal</span>
                <span className="font-bold text-slate-800">
                  {selectedStudent?.skill_status_start === 'NON_BBL' ? 'NON-BBL' : selectedStudent?.skill_status_start === 'BBL' ? 'BBL' : selectedStudent?.skill_status_start === 'BBLS' ? 'BBLS' : 'Belum tersedia'}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Baseline Awal</span>
                <span className="font-bold text-slate-800">
                  {selectedStudent?.baseline_surah ? `${getSurahNameFormatted(selectedStudent.baseline_surah)} : Ayat ${selectedStudent.baseline_ayah || 1}` : 'Belum tersedia'}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Target Kegiatan</span>
                <span className="font-bold text-slate-800">
                  {selectedStudent?.targetText || (selectedStudent?.target_lines ? `${selectedStudent.target_lines} Baris` : 'Belum tersedia')}
                </span>
              </div>

              <div className="p-2.5 bg-blue-50/60 rounded border border-blue-100">
                <span className="text-[10px] uppercase font-bold text-blue-600 block mb-0.5">Total Baris Ditambah</span>
                <span className="font-bold text-blue-900">
                  {studentMetrics.totalLines > 0 ? `${studentMetrics.totalLines} Baris` : 'Belum tersedia'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <div>
                <span className="font-semibold text-slate-700">Setoran Terakhir: </span>
                <span>
                  {studentMetrics.latestSetoran
                    ? formatCurrentProgress(studentMetrics.latestSetoran)
                    : 'Belum ada setoran'}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Cakupan Sesi: </span>
                <span>{studentMetrics.coverageText}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded border border-slate-200 shadow-sm space-y-6">
        
        {/* Student Selection */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Pilih Siswa
            </label>
            {existingEvaluationId && (
              <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                <RefreshCw className="w-3 h-3 text-blue-600" />
                <span>Mode Edit Evaluasi</span>
              </span>
            )}
          </div>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          >
            {students.length === 0 ? (
              <option value="">(Belum Ada Siswa di Halaqah ini)</option>
            ) : (
              students.map(st => (
                <option key={st.student_id} value={st.student_id}>
                  {st.full_name} ({st.grade_class} - NIS: {st.nis || '-'})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Evaluation Surah & Ayah Range */}
        <div className="space-y-3 pt-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            Capaian Akhir Evaluasi (Surah & Ayat)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            
            {/* Start */}
            <div className="space-y-3">
              <SurahAutocomplete
                label="Surah Awal Evaluasi"
                value={evalSurahStart}
                onChange={(val) => setEvalSurahStart(val || undefined)}
              />
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Ayat Awal Evaluasi
                </label>
                <input
                  type="number"
                  min={1}
                  value={evalAyahStart}
                  onChange={(e) => setEvalAyahStart(e.target.value)}
                  placeholder="mis: 1"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* End */}
            <div className="space-y-3">
              <SurahAutocomplete
                label="Surah Akhir Evaluasi"
                value={evalSurahEnd}
                onChange={(val) => setEvalSurahEnd(val || undefined)}
              />
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Ayat Akhir Evaluasi
                </label>
                <input
                  type="number"
                  min={1}
                  value={evalAyahEnd}
                  onChange={(e) => setEvalAyahEnd(e.target.value)}
                  placeholder="mis: 30"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Completion Status & Skill Status End */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Status Ketuntasan Target <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-2">
              {[
                { id: 'COMPLETE', label: 'Tuntas Target', bg: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
                { id: 'INCOMPLETE', label: 'Belum Tuntas Target', bg: 'bg-amber-50 text-amber-800 border-amber-300' }
              ].map(st => (
                <button
                  type="button"
                  key={st.id}
                  onClick={() => setCompletionStatus(st.id as CompletionStatus)}
                  className={`w-full py-2.5 px-3 text-xs font-bold rounded transition border text-left flex items-center justify-between ${
                    completionStatus === st.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : `${st.bg} hover:opacity-90`
                  }`}
                >
                  <span>{st.label}</span>
                  {completionStatus === st.id && <CheckCircle2 className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Status Kemampuan Akhir Siswa <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-2">
              {[
                { id: 'NON_BBL', label: 'NON-BBL', bg: 'bg-slate-50 text-slate-800 border-slate-300' },
                { id: 'BBL', label: 'BBL', bg: 'bg-blue-50 text-blue-800 border-blue-300' },
                { id: 'BBLS', label: 'BBLS', bg: 'bg-emerald-50 text-emerald-800 border-emerald-300' }
              ].map(sk => (
                <button
                  type="button"
                  key={sk.id}
                  onClick={() => setSkillStatusEnd(sk.id as SkillStatus)}
                  className={`w-full py-2.5 px-3 text-xs font-bold rounded transition border text-left flex items-center justify-between ${
                    skillStatusEnd === sk.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : `${sk.bg} hover:opacity-90`
                  }`}
                >
                  <span>{sk.label}</span>
                  {skillStatusEnd === sk.id && <CheckCircle2 className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Final Score & Affective Grade */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Nilai Akhir Evaluasi (0 - 100)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={finalScore}
              onChange={(e) => setFinalScore(e.target.value)}
              placeholder="mis: 85 (opsional)"
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Penilaian Sikap / Adab (A / B / C / D)
            </label>
            <div className="flex items-center space-x-2 pt-1">
              {(['A', 'B', 'C', 'D'] as const).map(grade => (
                <button
                  type="button"
                  key={grade}
                  onClick={() => setAffectiveGrade(affectiveGrade === grade ? undefined : grade)}
                  className={`w-10 h-10 rounded-lg font-bold text-sm border transition flex items-center justify-center ${
                    affectiveGrade === grade
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {grade}
                </button>
              ))}
              <span className="text-xs font-bold text-slate-600 ml-2">
                {affectiveGrade ? `Predikat ${affectiveGrade}` : 'Belum dinilai'}
              </span>
            </div>
          </div>
        </div>

        {/* Affective Note & Final Note */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Catatan Sikap & Adab Siswa (Opsional)
            </label>
            <textarea
              rows={2}
              value={affectiveNote}
              onChange={(e) => setAffectiveNote(e.target.value)}
              placeholder="Catatan keaktifan, adab terhadap Al-Qur'an dan pengajar..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            ></textarea>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Catatan Evaluasi Akhir & Motivasi Pengajar
            </label>
            <textarea
              rows={3}
              value={finalNote}
              onChange={(e) => setFinalNote(e.target.value)}
              placeholder="Rekomendasi tindak lanjut dan pesan motivasi untuk siswa..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            ></textarea>
          </div>
        </div>

        {/* Submit Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:flex-1 py-3.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-sm rounded-xl shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[44px]"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{submitting ? 'Menyimpan...' : 'Simpan Evaluasi Akhir'}</span>
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={handleSaveAndNext}
            className="w-full sm:flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-sm rounded-xl shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[44px]"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-emerald-400" />}
            <span>{submitting ? 'Menyimpan...' : 'Simpan & Siswa Berikutnya'}</span>
            {!submitting && <ArrowRight className="w-4 h-4 text-slate-400" />}
          </button>
        </div>

      </form>

    </div>
  );
};
