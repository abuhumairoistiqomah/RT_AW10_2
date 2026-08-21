import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, CompletionStatus, SkillStatus } from '../../types';
import { useTeacherWorkspace } from '../../context/TeacherWorkspaceContext';
import { TeacherSyncBadge } from './TeacherSyncBadge';
import {
  getSurahNameFormatted,
  validateAyah,
  formatCurrentProgress
} from '../../utils/quran';
import { Toast } from '../common/Toast';
import {
  Award,
  CheckCircle2,
  Save,
  AlertCircle,
  UserCheck,
  RefreshCw,
  ArrowRight,
  Loader2,
  Trash2
} from 'lucide-react';
import { SurahAutocomplete } from '../common/SurahAutocomplete';

interface FinalEvaluationProps {
  currentUser: User | null;
  initialStudentId?: string;
}

type AffectiveGrade = 'A' | 'B' | 'C' | 'D';

function normalizeArrayPayload<T>(
  value: unknown,
  possibleKeys: string[] = []
): T[] {
  if (Array.isArray(value)) return value as T[];

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    for (const key of possibleKeys) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }

    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.rows)) return obj.rows as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.result)) return obj.result as T[];
  }

  return [];
}

export const FinalEvaluation: React.FC<FinalEvaluationProps> = ({
  currentUser,
  initialStudentId
}) => {
  const {
    workspace,
    isLoading,
    isRevalidating,
    saveFinalEvaluationOptimistic,
    deleteFinalEvaluationOptimistic,
    activeHalaqahId,
    setActiveHalaqahId,
    selectedTeacherId,
    setSelectedTeacherId,
    availableTeachers
  } = useTeacherWorkspace();

  const isAdminOrCoord =
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'COORDINATOR';

  const canDeleteFinalEvaluation =
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'TEACHER';

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    detail?: string;
    type: 'success' | 'error';
  } | null>(null);

  const formTopRef = useRef<HTMLDivElement>(null);

  // Anti-reset state
  const hydratedStudentIdRef = useRef('');
  const formDirtyRef = useRef(false);
  const [formDirty, setFormDirty] = useState(false);

  const markDirty = () => {
    formDirtyRef.current = true;
    setFormDirty(true);
  };

  const markClean = () => {
    formDirtyRef.current = false;
    setFormDirty(false);
  };

  const [selectedStudentId, setSelectedStudentId] = useState(
    initialStudentId || ''
  );

  const [evalSurahStart, setEvalSurahStart] = useState<number | undefined>();
  const [evalAyahStart, setEvalAyahStart] = useState('');
  const [evalSurahEnd, setEvalSurahEnd] = useState<number | undefined>();
  const [evalAyahEnd, setEvalAyahEnd] = useState('');

  const [finalScore, setFinalScore] = useState('');
  const [completionStatus, setCompletionStatus] =
    useState<CompletionStatus | undefined>();
  const [skillStatusEnd, setSkillStatusEnd] =
    useState<SkillStatus | undefined>();
  const [affectiveGrade, setAffectiveGrade] =
    useState<AffectiveGrade | undefined>();
  const [affectiveNote, setAffectiveNote] = useState('');
  const [finalNote, setFinalNote] = useState('');

  const [existingEvaluationId, setExistingEvaluationId] =
    useState<string | null>(null);

  const halaqah = workspace?.halaqah || null;

  const availableHalaqahs = useMemo(
    () =>
      normalizeArrayPayload<any>(
        workspace?.availableHalaqahs,
        ['availableHalaqahs', 'halaqahs']
      ),
    [workspace?.availableHalaqahs]
  );

  const safeAvailableTeachers = useMemo(
    () =>
      normalizeArrayPayload<any>(
        availableTeachers,
        ['teachers']
      ),
    [availableTeachers]
  );

  const students = useMemo(
    () =>
      normalizeArrayPayload<any>(
        workspace?.students,
        ['students']
      ),
    [workspace?.students]
  );

  const evaluations = useMemo(
    () =>
      normalizeArrayPayload<any>(
        workspace?.finalEvaluations,
        ['finalEvaluations', 'evaluations']
      ),
    [workspace?.finalEvaluations]
  );

  const assessments = useMemo(
    () =>
      normalizeArrayPayload<any>(
        workspace?.assessments,
        ['assessments']
      ),
    [workspace?.assessments]
  );

  const sessionConfigs = useMemo(
    () =>
      normalizeArrayPayload<any>(
        workspace?.sessionConfigs,
        ['sessionConfigs', 'sessions']
      ),
    [workspace?.sessionConfigs]
  );

  useEffect(() => {
    if (
      initialStudentId &&
      students.some(s => s.student_id === initialStudentId) &&
      selectedStudentId !== initialStudentId
    ) {
      hydratedStudentIdRef.current = '';
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId, students, selectedStudentId]);

  useEffect(() => {
    if (students.length === 0) return;

    const currentExists = students.some(
      s => s.student_id === selectedStudentId
    );

    if (selectedStudentId && currentExists) return;

    const preferred =
      initialStudentId &&
      students.some(s => s.student_id === initialStudentId)
        ? initialStudentId
        : students[0].student_id;

    hydratedStudentIdRef.current = '';
    setSelectedStudentId(preferred);
  }, [students, selectedStudentId, initialStudentId]);

  const selectedStudent = useMemo(
    () =>
      students.find(
        s => s.student_id === selectedStudentId
      ) || null,
    [students, selectedStudentId]
  );

  const studentMetrics = useMemo(() => {
    if (!selectedStudentId) {
      return {
        totalLines: 0,
        coverageText: '0 / 0 Sesi',
        latestSetoran: null as any
      };
    }

    const studentAsms = assessments.filter(
      a => !a.is_deleted && a.student_id === selectedStudentId
    );

    const presentAsms = studentAsms.filter(
      a => a.attendance_status === 'PRESENT'
    );

    const totalLines = presentAsms.reduce(
      (sum, a) => sum + (Number(a.lines_added) || 0),
      0
    );

    const latest =
      presentAsms
        .slice()
        .sort(
          (a, b) =>
            Number(b.session_no || 0) -
            Number(a.session_no || 0)
        )
        .find(a => a.surah_end && a.ayah_end) || null;

    const groupId = halaqah?.session_group_id;

    const applicableConfigs = groupId
      ? sessionConfigs.filter(
          sc =>
            !sc.session_group_id ||
            sc.session_group_id === groupId
        )
      : sessionConfigs;

    return {
      totalLines,
      coverageText: `${studentAsms.length} dari ${applicableConfigs.length} Sesi Evaluasi`,
      latestSetoran: latest
    };
  }, [assessments, selectedStudentId, halaqah, sessionConfigs]);

  const findExistingEvaluation = (studentId: string) => {
    const student = students.find(
      s => s.student_id === studentId
    );

    return evaluations.find(
      e =>
        e.student_id === studentId ||
        (student?.participant_id &&
          e.participant_id === student.participant_id)
    );
  };

  const hydrateFromEvaluation = (existing: any) => {
    setExistingEvaluationId(
      existing.final_evaluation_id || null
    );

    setEvalSurahStart(
      existing.evaluation_surah_start ?? undefined
    );
    setEvalAyahStart(
      existing.evaluation_ayah_start != null
        ? String(existing.evaluation_ayah_start)
        : ''
    );
    setEvalSurahEnd(
      existing.evaluation_surah_end ?? undefined
    );
    setEvalAyahEnd(
      existing.evaluation_ayah_end != null
        ? String(existing.evaluation_ayah_end)
        : ''
    );

    setFinalScore(
      existing.final_score != null
        ? String(existing.final_score)
        : ''
    );

    if (
      existing.completion_status === 'COMPLETE' ||
      existing.completion_status === 'INCOMPLETE'
    ) {
      setCompletionStatus(existing.completion_status);
    } else {
      setCompletionStatus(undefined);
    }

    setSkillStatusEnd(
      existing.skill_status_end || undefined
    );

    const rawGrade =
      typeof existing.affective_rating === 'string'
        ? existing.affective_rating.toUpperCase()
        : '';

    setAffectiveGrade(
      ['A', 'B', 'C', 'D'].includes(rawGrade)
        ? (rawGrade as AffectiveGrade)
        : undefined
    );

    setAffectiveNote(existing.affective_note || '');
    setFinalNote(
      existing.final_note ||
        existing.evaluator_notes ||
        ''
    );
  };

  const hydrateDefaultsForStudent = (student: any) => {
    setExistingEvaluationId(null);

    setEvalSurahStart(
      student?.target_surah_start ??
        student?.baseline_surah ??
        undefined
    );

    setEvalAyahStart(
      student?.target_ayah_start != null
        ? String(student.target_ayah_start)
        : student?.baseline_ayah != null
          ? String(student.baseline_ayah)
          : ''
    );

    setEvalSurahEnd(
      student?.target_surah_end ??
        student?.target_surah_start ??
        student?.baseline_surah ??
        undefined
    );

    setEvalAyahEnd(
      student?.target_ayah_end != null
        ? String(student.target_ayah_end)
        : ''
    );

    setFinalScore('');
    setCompletionStatus(undefined);
    setSkillStatusEnd(undefined);
    setAffectiveGrade(undefined);
    setAffectiveNote('');
    setFinalNote('');
  };

  // CRITICAL ANTI-RESET EFFECT
  useEffect(() => {
    if (!selectedStudentId) return;

    const studentChanged =
      hydratedStudentIdRef.current !== selectedStudentId;

    const existing =
      findExistingEvaluation(selectedStudentId);

    if (studentChanged) {
      hydratedStudentIdRef.current = selectedStudentId;
      setSuccessMsg('');
      setErrorMsg('');

      if (existing) {
        hydrateFromEvaluation(existing);
      } else {
        hydrateDefaultsForStudent(selectedStudent);
      }

      markClean();
      return;
    }

    // Background refresh is never allowed to overwrite active edits.
    if (formDirtyRef.current) return;

    // Same student, clean form, evaluation exists:
    // safe to hydrate updated/local-pending evaluation.
    if (existing) {
      hydrateFromEvaluation(existing);
      markClean();
    }

    // Same student, no existing evaluation:
    // intentionally do nothing. Never blank the form because
    // a temporary server response is empty/stale.
  }, [selectedStudentId, evaluations, selectedStudent]);

  const hasCompleteQuranRange = (): boolean => {
    return Boolean(
      evalSurahStart != null &&
      evalAyahStart !== '' &&
      evalSurahEnd != null &&
      evalAyahEnd !== ''
    );
  };

  const validateForm = (): string | null => {
    if (!selectedStudentId) {
      return 'Pilih siswa terlebih dahulu.';
    }

    // Capaian Al-Qur'an sepenuhnya OPSIONAL untuk semua status skill.
    // Jika keempat field lengkap, validasi nilainya. Jika kosong atau hanya
    // sebagian terisi, evaluasi tetap boleh disimpan dan range tidak dikirim.
    if (hasCompleteQuranRange()) {
      const startAyah = Number(evalAyahStart);
      const endAyah = Number(evalAyahEnd);

      if (startAyah < 1 || endAyah < 1) {
        return 'Ayat evaluasi harus berupa angka positif.';
      }

      const startResult = validateAyah(
        Number(evalSurahStart),
        startAyah
      );

      if (!startResult.valid) {
        return `Ayat awal evaluasi tidak valid: ${startResult.message}`;
      }

      const endResult = validateAyah(
        Number(evalSurahEnd),
        endAyah
      );

      if (!endResult.valid) {
        return `Ayat akhir evaluasi tidak valid: ${endResult.message}`;
      }
    }

    if (
      !completionStatus ||
      (completionStatus as string) === 'NOT_EVALUATED'
    ) {
      return 'Status ketuntasan target (Tuntas Target / Belum Tuntas Target) wajib dipilih.';
    }

    if (!skillStatusEnd) {
      return 'Status kemampuan akhir siswa (NON-BBL / BBL / BBLS) wajib dipilih.';
    }

    if (finalScore !== '') {
      const score = Number(finalScore);
      if (
        Number.isNaN(score) ||
        score < 0 ||
        score > 100
      ) {
        return 'Nilai akhir harus berupa angka antara 0 hingga 100.';
      }
    }

    return null;
  };

  const buildPayload = () => {
    const includeQuranRange = hasCompleteQuranRange();

    return {
      student_id: selectedStudentId,
      participant_id: selectedStudent?.participant_id,

      // Partial/default Quran range is intentionally discarded. This prevents
      // NON-BBL / Nuroniyyah / Iqra evaluations from being rejected merely
      // because one auto-filled Quran field happens to exist.
      evaluation_surah_start: includeQuranRange
        ? Number(evalSurahStart)
        : undefined,
      evaluation_ayah_start: includeQuranRange
        ? Number(evalAyahStart)
        : undefined,
      evaluation_surah_end: includeQuranRange
        ? Number(evalSurahEnd)
        : undefined,
      evaluation_ayah_end: includeQuranRange
        ? Number(evalAyahEnd)
        : undefined,

      final_score:
        finalScore !== ''
          ? Number(finalScore)
          : undefined,
      completion_status: completionStatus,
      skill_status_end: skillStatusEnd,
      affective_rating: affectiveGrade || undefined,
      affective_note: affectiveNote,
      evaluator_notes: finalNote,
      evaluator_teacher_id: currentUser?.teacher_id || ''
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const validationError = validateForm();

    if (validationError) {
      setErrorMsg(validationError);
      setToast({
        type: 'error',
        message: 'Validasi formulir tidak lengkap',
        detail: validationError
      });
      return;
    }

    setSubmitting(true);

    try {
      const saveResult =
        await saveFinalEvaluationOptimistic(
          buildPayload()
        );

      if (saveResult?.success === false) {
        throw new Error(
          saveResult.error ||
            'Gagal menyimpan evaluasi akhir.'
        );
      }

      markClean();

      const studentName =
        selectedStudent?.full_name || 'siswa';

      setSuccessMsg(
        `✓ Evaluasi akhir untuk ${studentName} berhasil disimpan!`
      );

      setToast({
        type: 'success',
        message: '✓ Data berhasil disimpan.',
        detail: `Evaluasi akhir untuk ${studentName} aman tersimpan. Sinkronisasi ke Spreadsheet berjalan di latar belakang.`
      });

      setTimeout(() => {
        formTopRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 60);
    } catch (err: any) {
      formDirtyRef.current = true;
      setFormDirty(true);

      setErrorMsg(
        'Gagal menyimpan evaluasi akhir: ' +
          (err?.message || 'Silakan coba lagi.')
      );

      setToast({
        type: 'error',
        message: 'Gagal menyimpan data.',
        detail:
          err?.message ||
          'Terjadi kesalahan saat menyimpan evaluasi akhir.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAndNext = async (
    e?: React.FormEvent
  ) => {
    if (e) e.preventDefault();

    setErrorMsg('');
    setSuccessMsg('');

    const validationError = validateForm();

    if (validationError) {
      setErrorMsg(validationError);
      setToast({
        type: 'error',
        message: 'Validasi formulir tidak lengkap',
        detail: validationError
      });
      return;
    }

    setSubmitting(true);

    try {
      const saveResult =
        await saveFinalEvaluationOptimistic(
          buildPayload()
        );

      if (saveResult?.success === false) {
        throw new Error(
          saveResult.error ||
            'Gagal menyimpan evaluasi akhir.'
        );
      }

      markClean();

      const studentName =
        selectedStudent?.full_name || 'siswa';

      const currentIndex = students.findIndex(
        s => s.student_id === selectedStudentId
      );

      if (
        currentIndex >= 0 &&
        currentIndex < students.length - 1
      ) {
        const nextStudent =
          students[currentIndex + 1];

        hydratedStudentIdRef.current = '';
        setSelectedStudentId(nextStudent.student_id);

        setSuccessMsg(
          `✓ Evaluasi ${studentName} berhasil disimpan. Beralih ke: ${nextStudent.full_name}`
        );

        setToast({
          type: 'success',
          message: '✓ Data berhasil disimpan.',
          detail: `Evaluasi akhir ${studentName} aman tersimpan. Menampilkan formulir: ${nextStudent.full_name}. Sinkronisasi berjalan di latar belakang.`
        });
      } else {
        setSuccessMsg(
          `✓ Evaluasi ${studentName} berhasil disimpan! (Semua siswa dalam halaqah ini telah dievaluasi)`
        );

        setToast({
          type: 'success',
          message: '✓ Data berhasil disimpan.',
          detail: `Evaluasi akhir ${studentName} aman tersimpan. Semua siswa dalam halaqah ini telah selesai. Sinkronisasi berjalan di latar belakang.`
        });
      }

      setTimeout(() => {
        formTopRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 60);
    } catch (err: any) {
      formDirtyRef.current = true;
      setFormDirty(true);

      setErrorMsg(
        'Gagal menyimpan evaluasi akhir: ' +
          (err?.message || 'Silakan coba lagi.')
      );

      setToast({
        type: 'error',
        message: 'Gagal menyimpan data.',
        detail:
          err?.message ||
          'Terjadi kesalahan saat menyimpan evaluasi akhir.'
      });
    } finally {
      setSubmitting(false);
    }
  };


  const handleDeleteFinalEvaluation = async () => {
    if (!selectedStudent || !existingEvaluationId) {
      setShowDeleteConfirm(false);
      return;
    }

    setDeleting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const result = await deleteFinalEvaluationOptimistic({
        finalEvaluationId: existingEvaluationId,
        participantId: selectedStudent.participant_id,
        studentId: selectedStudent.student_id
      });

      if (result?.success === false) {
        throw new Error(
          result.error || 'Gagal menghapus evaluasi akhir.'
        );
      }

      const studentName = selectedStudent.full_name || 'siswa';

      // Context already removed the evaluation locally. Explicitly reset the
      // current form because the anti-reset hydration intentionally refuses to
      // blank a same-student form merely due to background data changes.
      hydrateDefaultsForStudent(selectedStudent);
      hydratedStudentIdRef.current = selectedStudentId;
      markClean();
      setShowDeleteConfirm(false);

      setSuccessMsg(
        `✓ Evaluasi akhir ${studentName} dibatalkan. Status kembali menjadi Belum Dievaluasi.`
      );

      setToast({
        type: 'success',
        message: '✓ Evaluasi akhir dihapus.',
        detail:
          `Evaluasi ${studentName} dibatalkan. Presensi dan penilaian per sesi tetap aman. Sinkronisasi berjalan di latar belakang.`
      });

      setTimeout(() => {
        formTopRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 60);
    } catch (err: any) {
      const message =
        err?.message || 'Terjadi kesalahan saat menghapus evaluasi akhir.';

      setErrorMsg('Gagal menghapus evaluasi akhir: ' + message);
      setToast({
        type: 'error',
        message: 'Gagal menghapus evaluasi akhir.',
        detail: message
      });
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (isAdminOrCoord && !selectedTeacherId) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white rounded border border-slate-200 shadow-sm text-center space-y-6 animate-in fade-in">
        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
          <UserCheck className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">
            Pilih Guru untuk melihat workspace halaqah
          </h2>
          <p className="text-xs text-slate-500">
            Sebagai Administrator / Koordinator, silakan pilih guru untuk mengakses kelompok halaqah dan lembar kerja penilaian.
          </p>
        </div>

        <div className="text-left space-y-2">
          <label className="text-xs font-bold text-slate-700">
            Pilih Guru Pengampu:
          </label>
          <select
            value={selectedTeacherId}
            onChange={e =>
              setSelectedTeacherId(e.target.value)
            }
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">-- Pilih Guru --</option>
            {safeAvailableTeachers.map(t => (
              <option
                key={t.teacher_id}
                value={t.teacher_id}
              >
                {t.full_name}{' '}
                {t.short_name ? `(${t.short_name})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (
    (isLoading || isRevalidating) &&
    !workspace?.halaqah
  ) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">
            Memeriksa penugasan halaqah...
          </p>
        </div>
      </div>
    );
  }

  if (
    !halaqah ||
    availableHalaqahs.length === 0
  ) {
    if (isAdminOrCoord) {
      return (
        <div className="max-w-md mx-auto my-12 p-8 bg-white rounded border border-slate-200 shadow-sm text-center space-y-6 animate-in fade-in">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <UserCheck className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">
              Guru Belum Memiliki Penugasan Halaqah
            </h2>
            <p className="text-xs text-slate-500">
              Guru yang dipilih belum memiliki penugasan kelompok halaqah aktif di kegiatan ini. Anda dapat memilih guru lain di bawah ini.
            </p>
          </div>
          <div className="text-left space-y-2">
            <label className="text-xs font-bold text-slate-700">
              Ganti Pilihan Guru:
            </label>
            <select
              value={selectedTeacherId}
              onChange={e =>
                setSelectedTeacherId(e.target.value)
              }
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">-- Pilih Guru --</option>
              {safeAvailableTeachers.map(t => (
                <option
                  key={t.teacher_id}
                  value={t.teacher_id}
                >
                  {t.full_name}{' '}
                  {t.short_name ? `(${t.short_name})` : ''}
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
        <h2 className="text-lg font-bold text-slate-800">
          Belum Ada Penugasan Halaqah
        </h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Akun Anda saat ini belum ditugaskan pada kelompok halaqah aktif. Silakan hubungi koordinator/administrator untuk alokasi kelompok.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-in fade-in relative">
      {toast && (
        <Toast
          message={toast.message}
          detail={toast.detail}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {isAdminOrCoord &&
            safeAvailableTeachers.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500">
                  Guru:
                </label>
                <select
                  value={selectedTeacherId}
                  onChange={e =>
                    setSelectedTeacherId(e.target.value)
                  }
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500"
                >
                  {safeAvailableTeachers.map(t => (
                    <option
                      key={t.teacher_id}
                      value={t.teacher_id}
                    >
                      {t.full_name}{' '}
                      {t.short_name ? `(${t.short_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

          {availableHalaqahs.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500">
                Pilih Halaqah:
              </label>
              <select
                value={
                  activeHalaqahId ||
                  halaqah.halaqah_id
                }
                onChange={e =>
                  setActiveHalaqahId(e.target.value)
                }
                className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500"
              >
                {availableHalaqahs.map(h => (
                  <option
                    key={h.halaqah_id}
                    value={h.halaqah_id}
                  >
                    {h.halaqah_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {formDirty && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Perubahan belum disimpan
            </span>
          )}
          <TeacherSyncBadge />
        </div>
      </div>

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
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white line-clamp-2 break-normal">
            Evaluasi Perkembangan Siswa
          </h2>
          <p className="text-xs text-slate-400 break-normal">
            Kelompok:{' '}
            <strong className="text-white">
              {halaqah.group_name || halaqah.halaqah_name}
            </strong>{' '}
            &bull; Guru: {halaqah.teacher_name}
          </p>
        </div>
      </div>

      <div
        ref={formTopRef}
        className="scroll-mt-6 space-y-4"
      >
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

        {selectedStudent && (
          <div className="bg-white p-5 rounded border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  Konteks Perkembangan Siswa
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedStudent.full_name}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    (NIS: {selectedStudent.nis || 'Belum tersedia'})
                  </span>
                </h3>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-700 block">
                  Kelas
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {selectedStudent.grade_class || 'Belum tersedia'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1">
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                  Kemampuan Awal
                </span>
                <span className="font-bold text-slate-800">
                  {selectedStudent.skill_status_start === 'NON_BBL'
                    ? 'NON-BBL'
                    : selectedStudent.skill_status_start === 'BBL'
                      ? 'BBL'
                      : selectedStudent.skill_status_start === 'BBLS'
                        ? 'BBLS'
                        : 'Belum tersedia'}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                  Baseline Awal
                </span>
                <span className="font-bold text-slate-800">
                  {selectedStudent.baseline_surah
                    ? `${getSurahNameFormatted(
                        selectedStudent.baseline_surah
                      )} : Ayat ${selectedStudent.baseline_ayah || 1}`
                    : 'Belum tersedia'}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                  Target Kegiatan
                </span>
                <span className="font-bold text-slate-800">
                  {selectedStudent.targetText ||
                    (selectedStudent.target_lines
                      ? `${selectedStudent.target_lines} Baris`
                      : 'Belum tersedia')}
                </span>
              </div>

              <div className="p-2.5 bg-blue-50/60 rounded border border-blue-100">
                <span className="text-[10px] uppercase font-bold text-blue-600 block mb-0.5">
                  Total Baris Ditambah
                </span>
                <span className="font-bold text-blue-900">
                  {studentMetrics.totalLines > 0
                    ? `${studentMetrics.totalLines} Baris`
                    : 'Belum tersedia'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <div>
                <span className="font-semibold text-slate-700">
                  Setoran Terakhir:{' '}
                </span>
                <span>
                  {studentMetrics.latestSetoran
                    ? formatCurrentProgress(studentMetrics.latestSetoran)
                    : 'Belum ada setoran'}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">
                  Cakupan Sesi:{' '}
                </span>
                <span>{studentMetrics.coverageText}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 md:p-8 rounded border border-slate-200 shadow-sm space-y-6"
      >
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
            onChange={e => {
              hydratedStudentIdRef.current = '';
              setSelectedStudentId(e.target.value);
            }}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          >
            {students.length === 0 ? (
              <option value="">
                (Belum Ada Siswa di Halaqah ini)
              </option>
            ) : (
              students.map(st => (
                <option
                  key={st.student_id}
                  value={st.student_id}
                >
                  {st.full_name} ({st.grade_class} - NIS: {st.nis || '-'})
                </option>
              ))
            )}
          </select>
        </div>

        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Capaian Akhir Evaluasi (Surah & Ayat)
            </label>
            <p className="mt-1 text-[11px] text-slate-500">
              Opsional. Boleh dikosongkan apabila siswa belum memiliki capaian/setoran Al-Qur'an pada evaluasi ini.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="space-y-3">
              <SurahAutocomplete
                label="Surah Awal Evaluasi"
                value={evalSurahStart}
                onChange={val => {
                  setEvalSurahStart(val || undefined);
                  markDirty();
                }}
              />
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Ayat Awal Evaluasi
                </label>
                <input
                  type="number"
                  min={1}
                  value={evalAyahStart}
                  onChange={e => {
                    setEvalAyahStart(e.target.value);
                    markDirty();
                  }}
                  placeholder="mis: 1"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-3">
              <SurahAutocomplete
                label="Surah Akhir Evaluasi"
                value={evalSurahEnd}
                onChange={val => {
                  setEvalSurahEnd(val || undefined);
                  markDirty();
                }}
              />
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Ayat Akhir Evaluasi
                </label>
                <input
                  type="number"
                  min={1}
                  value={evalAyahEnd}
                  onChange={e => {
                    setEvalAyahEnd(e.target.value);
                    markDirty();
                  }}
                  placeholder="mis: 30"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Status Ketuntasan Target <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-2">
              {[
                {
                  id: 'COMPLETE',
                  label: 'Tuntas Target',
                  bg: 'bg-emerald-50 text-emerald-800 border-emerald-300'
                },
                {
                  id: 'INCOMPLETE',
                  label: 'Belum Tuntas Target',
                  bg: 'bg-amber-50 text-amber-800 border-amber-300'
                }
              ].map(st => (
                <button
                  type="button"
                  key={st.id}
                  onClick={() => {
                    setCompletionStatus(st.id as CompletionStatus);
                    markDirty();
                  }}
                  className={`w-full py-2.5 px-3 text-xs font-bold rounded transition border text-left flex items-center justify-between ${
                    completionStatus === st.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : `${st.bg} hover:opacity-90`
                  }`}
                >
                  <span>{st.label}</span>
                  {completionStatus === st.id && (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  )}
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
                {
                  id: 'NON_BBL',
                  label: 'NON-BBL',
                  bg: 'bg-slate-50 text-slate-800 border-slate-300'
                },
                {
                  id: 'BBL',
                  label: 'BBL',
                  bg: 'bg-blue-50 text-blue-800 border-blue-300'
                },
                {
                  id: 'BBLS',
                  label: 'BBLS',
                  bg: 'bg-emerald-50 text-emerald-800 border-emerald-300'
                }
              ].map(sk => (
                <button
                  type="button"
                  key={sk.id}
                  onClick={() => {
                    setSkillStatusEnd(sk.id as SkillStatus);
                    markDirty();
                  }}
                  className={`w-full py-2.5 px-3 text-xs font-bold rounded transition border text-left flex items-center justify-between ${
                    skillStatusEnd === sk.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : `${sk.bg} hover:opacity-90`
                  }`}
                >
                  <span>{sk.label}</span>
                  {skillStatusEnd === sk.id && (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

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
              onChange={e => {
                setFinalScore(e.target.value);
                markDirty();
              }}
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
                  onClick={() => {
                    setAffectiveGrade(
                      affectiveGrade === grade ? undefined : grade
                    );
                    markDirty();
                  }}
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
                {affectiveGrade
                  ? `Predikat ${affectiveGrade}`
                  : 'Belum dinilai'}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Catatan Sikap & Adab Siswa (Opsional)
            </label>
            <textarea
              rows={2}
              value={affectiveNote}
              onChange={e => {
                setAffectiveNote(e.target.value);
                markDirty();
              }}
              placeholder="Catatan keaktifan, adab terhadap Al-Qur'an dan pengajar..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Catatan Evaluasi Akhir & Motivasi Pengajar
            </label>
            <textarea
              rows={3}
              value={finalNote}
              onChange={e => {
                setFinalNote(e.target.value);
                markDirty();
              }}
              placeholder="Rekomendasi tindak lanjut dan pesan motivasi untuk siswa..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || deleting}
            className="w-full sm:flex-1 py-3.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-sm rounded-xl shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[44px]"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>
              {submitting
                ? 'Menyimpan...'
                : 'Simpan Evaluasi Akhir'}
            </span>
          </button>

          <button
            type="button"
            disabled={submitting || deleting}
            onClick={handleSaveAndNext}
            className="w-full sm:flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-sm rounded-xl shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[44px]"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4 text-emerald-400" />
            )}
            <span>
              {submitting
                ? 'Menyimpan...'
                : 'Simpan & Siswa Berikutnya'}
            </span>
            {!submitting && (
              <ArrowRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {canDeleteFinalEvaluation && existingEvaluationId && (
            <button
              type="button"
              disabled={submitting || deleting}
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full sm:w-auto px-4 py-3.5 bg-white hover:bg-rose-50 active:bg-rose-100 text-rose-700 font-bold text-sm rounded-xl border border-rose-300 shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[44px]"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span>
                {deleting ? 'Menghapus...' : 'Hapus Evaluasi'}
              </span>
            </button>
          )}
        </div>
      </form>

      {showDeleteConfirm && selectedStudent && existingEvaluationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-[1px]">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                  <Trash2 className="w-5 h-5" />
                </div>

                <div className="space-y-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-900">
                    Hapus Evaluasi Akhir?
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600">
                    Evaluasi akhir untuk{' '}
                    <strong className="text-slate-900">
                      {selectedStudent.full_name}
                    </strong>{' '}
                    akan dibatalkan dan statusnya kembali menjadi{' '}
                    <strong>Belum Dievaluasi</strong>.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] leading-relaxed text-amber-900">
                Presensi dan seluruh penilaian per sesi tidak akan dihapus.
                Riwayat penghapusan tetap tercatat di Audit Log.
                {formDirty && (
                  <span className="block mt-1 font-semibold text-rose-700">
                    Perubahan formulir yang belum disimpan juga akan dibuang.
                  </span>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition disabled:opacity-50"
                >
                  Batal
                </button>

                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteFinalEvaluation}
                  className="px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>{deleting ? 'Menghapus...' : 'Ya, Hapus Evaluasi'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};