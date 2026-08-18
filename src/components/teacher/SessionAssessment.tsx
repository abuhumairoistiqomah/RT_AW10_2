import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { User, SessionAssessment as ISessionAssessment, EventDay } from '../../types';
import { ApiService } from '../../services/api';
import { useTeacherWorkspace } from '../../context/TeacherWorkspaceContext';
import { TeacherSyncBadge } from './TeacherSyncBadge';
import { getSurahByNo, getSurahNameFormatted, validateAyah, formatCurrentProgress } from '../../utils/quran';
import { formatSessionOptionLabel, sortSessionConfigs, isFinalEvaluationSession as checkIsFinalEvaluationSession } from '../../utils/sessionFormatter';
import { SessionSummaryCard } from '../common/SessionSummaryCard';
import { Toast } from '../common/Toast';
import {
  BookOpen, CheckCircle2, Save,
  AlertCircle, Trash2, ArrowRight, Layers, UserCheck, RefreshCw, Clock, Award, Loader2
} from 'lucide-react';
import { SurahAutocomplete } from '../common/SurahAutocomplete';

interface SessionAssessmentProps {
  currentUser: User | null;
  initialStudentId?: string;
  initialSessionNo?: number;
  onNavigateToEvaluation?: (studentId?: string, sessionConfigId?: string) => void;
}

export const SessionAssessment: React.FC<SessionAssessmentProps> = ({
  currentUser,
  initialStudentId,
  initialSessionNo,
  onNavigateToEvaluation
}) => {
  const {
    workspace,
    isLoading,
    isRevalidating,
    saveAssessmentOptimistic,
    deleteAssessmentOptimistic,
    activeHalaqahId,
    setActiveHalaqahId,
    selectedTeacherId,
    setSelectedTeacherId,
    availableTeachers
  } = useTeacherWorkspace();

  const isAdminOrCoord = currentUser?.role === 'ADMIN' || currentUser?.role === 'COORDINATOR';

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Success / Error messages & Floating Toast
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; detail?: string; type: 'success' | 'error' } | null>(null);

  // Ref to form top for smooth scrolling after save
  const formTopRef = useRef<HTMLDivElement>(null);

  // Selected State
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');
  const [selectedSessionConfigId, setSelectedSessionConfigId] = useState<string>('');

  // Refs to track last consumed initial navigation props (prevents dropdown lock)
  const lastInitialStudentRef = useRef<string | undefined>(undefined);
  const lastInitialSessionRef = useRef<number | undefined>(undefined);

  // Form Fields
  const [attendance, setAttendance] = useState<'UNASSESSED' | 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT'>('UNASSESSED');
  const [assessmentMode, setAssessmentMode] = useState<'ZIYADAH' | 'NURONIYYAH' | 'IQRA'>('ZIYADAH');
  const [startSurah, setStartSurah] = useState<number | undefined>(undefined);
  const [startAyah, setStartAyah] = useState<string>('');
  const [endSurah, setEndSurah] = useState<number | undefined>(undefined);
  const [endAyah, setEndAyah] = useState<string>('');
  const [linesAdded, setLinesAdded] = useState<string>('');
  const [nuroniyyahDars, setNuroniyyahDars] = useState<string>('');
  const [iqraLevel, setIqraLevel] = useState<number | undefined>(undefined);
  const [iqraPageStart, setIqraPageStart] = useState<string>('');
  const [iqraPageEnd, setIqraPageEnd] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Edit Mode Tracker
  const [existingAssessmentId, setExistingAssessmentId] = useState<string | null>(null);

  // Event Days for clean Day No formatting
  const [eventDays, setEventDays] = useState<EventDay[]>([]);

  // Data from Workspace
  const halaqah = workspace?.halaqah || null;
  const availableHalaqahs = workspace?.availableHalaqahs || [];
  const students = useMemo(() => workspace?.students || [], [workspace?.students]);
  const sessionConfigs = useMemo(() => workspace?.sessionConfigs || [], [workspace?.sessionConfigs]);
  const assessments = useMemo(() => workspace?.assessments || [], [workspace?.assessments]);
  const finalEvaluations = useMemo(() => workspace?.finalEvaluations || [], [workspace?.finalEvaluations]);

  // Load event days when event changes
  useEffect(() => {
    const eventId = workspace?.event?.event_id;
    if (eventId) {
      ApiService.getEventDays(eventId).then(days => {
        setEventDays(days);
      }).catch(err => {
        console.warn('Failed to load event days in assessment:', err);
      });
    }
  }, [workspace?.event?.event_id]);

  // Selected student detail
  const selectedStudent = useMemo(() => {
    return students.find(s => s.student_id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Final evaluation for selected student (if any) in 14_FINAL_EVALUATIONS
  const studentFinalEval = useMemo(() => {
    if (!selectedStudentId) return null;
    const currentEventId = workspace?.event?.event_id;
    return finalEvaluations.find(fe =>
      (!currentEventId || fe.event_id === currentEventId) &&
      (fe.student_id === selectedStudentId || (selectedStudent?.participant_id && fe.participant_id === selectedStudent.participant_id))
    ) || null;
  }, [finalEvaluations, selectedStudentId, selectedStudent, workspace?.event?.event_id]);

  // Session configs for halaqah (filtered by session_group_id & active)
  const availableSessionConfigs = useMemo(() => {
    const groupId = halaqah?.session_group_id;
    let list = sessionConfigs.filter(sc => sc.active !== false && String(sc.active) !== 'false');
    if (groupId && groupId.trim() !== '') {
      const filteredByGroup = list.filter(sc => sc.session_group_id === groupId);
      if (filteredByGroup.length > 0) {
        list = filteredByGroup;
      }
    }
    return sortSessionConfigs(list, eventDays);
  }, [sessionConfigs, halaqah, eventDays]);

  // Initialize/Sync selected student without unwanted resets
  useEffect(() => {
    if (students.length === 0) return;

    if (initialStudentId !== undefined && lastInitialStudentRef.current !== initialStudentId) {
      lastInitialStudentRef.current = initialStudentId;
      if (students.some(s => s.student_id === initialStudentId)) {
        setSelectedStudentId(initialStudentId);
        return;
      }
    }

    setSelectedStudentId(prev => {
      if (prev && students.some(s => s.student_id === prev)) {
        return prev;
      }
      return students[0]?.student_id || '';
    });
  }, [students, initialStudentId]);

  // Initialize/Sync selected session without locking dropdown
  useEffect(() => {
    if (availableSessionConfigs.length === 0) return;

    if (initialSessionNo !== undefined && lastInitialSessionRef.current !== initialSessionNo) {
      lastInitialSessionRef.current = initialSessionNo;
      const found = availableSessionConfigs.find(sc => sc.session_no === Number(initialSessionNo));
      if (found) {
        setSelectedSessionConfigId(found.session_config_id);
        return;
      }
    }

    setSelectedSessionConfigId(prev => {
      if (prev && availableSessionConfigs.some(sc => sc.session_config_id === prev)) {
        return prev;
      }
      return availableSessionConfigs[0]?.session_config_id || '';
    });
  }, [availableSessionConfigs, initialSessionNo]);

  const selectedSessionConfig = useMemo(() => {
    return availableSessionConfigs.find(sc => sc.session_config_id === selectedSessionConfigId) || availableSessionConfigs[0] || null;
  }, [availableSessionConfigs, selectedSessionConfigId]);

  const isFinalEvaluationSession = useMemo(() => {
    return checkIsFinalEvaluationSession(selectedSessionConfig, availableSessionConfigs);
  }, [selectedSessionConfig, availableSessionConfigs]);

  const [savingPresensi, setSavingPresensi] = useState<boolean>(false);

  // Draft Key Generator
  const getDraftKey = useCallback(() => {
    const userId = currentUser?.user_id || 'user';
    const eventId = workspace?.event?.event_id || 'evt';
    const studentId = selectedStudentId || 'student';
    const sessionCfgId = selectedSessionConfigId || 'sess';
    return `draft/${userId}/${eventId}/${studentId}/${sessionCfgId}`;
  }, [currentUser, workspace?.event?.event_id, selectedStudentId, selectedSessionConfigId]);

  // Mode change handler: clears fields of other mode
  const handleModeChange = (newMode: 'ZIYADAH' | 'NURONIYYAH') => {
    if (newMode === assessmentMode) return;
    setAssessmentMode(newMode);
    if (newMode === 'NURONIYYAH') {
      setStartSurah(undefined);
      setStartAyah('');
      setEndSurah(undefined);
      setEndAyah('');
    } else {
      setNuroniyyahDars('');
      setIqraLevel(undefined);
      setIqraPageStart('');
      setIqraPageEnd('');
    }
  };

  // Populate Form when Student or Session Changes (Navigation)
  useEffect(() => {
    if (!selectedStudentId || !selectedSessionConfig) return;

    const renderStart = performance.now();
    setSuccessMsg('');
    setErrorMsg('');

    // Check if real assessment exists in DB/storage for this student & session
    const existing = assessments.find(a =>
      !a.is_deleted &&
      a.student_id === selectedStudentId &&
      (a.session_config_id === selectedSessionConfig.session_config_id || a.session_no === selectedSessionConfig.session_no)
    );

    if (existing) {
      setExistingAssessmentId(existing.assessment_id);
      setAttendance(existing.attendance_status || 'PRESENT');

      // Map legacy IQRA to NURONIYYAH in UI
      const existingMode = (existing.assessment_mode === 'NURONIYYAH' || existing.nuroniyyah_dars)
        ? 'NURONIYYAH'
        : (existing.assessment_mode === 'IQRA' || existing.iqra_level != null || existing.iqra_page_start != null)
          ? 'NURONIYYAH'
          : 'ZIYADAH';
      setAssessmentMode(existingMode);

      if (existingMode === 'NURONIYYAH') {
        const dars = existing.nuroniyyah_dars || (existing.iqra_level ? `Ad-Dars ${existing.iqra_level}` : '');
        setNuroniyyahDars(dars);
        setLinesAdded(existing.lines_added != null ? String(existing.lines_added) : '');
        setStartSurah(undefined);
        setStartAyah('');
        setEndSurah(undefined);
        setEndAyah('');
        setIqraLevel(existing.iqra_level != null ? Number(existing.iqra_level) : undefined);
        setIqraPageStart(existing.iqra_page_start != null ? String(existing.iqra_page_start) : '');
        setIqraPageEnd(existing.iqra_page_end != null ? String(existing.iqra_page_end) : '');
      } else {
        setStartSurah(existing.surah_start);
        setStartAyah(existing.ayah_start ? String(existing.ayah_start) : '');
        setEndSurah(existing.surah_end);
        setEndAyah(existing.ayah_end ? String(existing.ayah_end) : '');
        setLinesAdded(existing.lines_added != null ? String(existing.lines_added) : '');
        setNuroniyyahDars('');
        setIqraLevel(undefined);
        setIqraPageStart('');
        setIqraPageEnd('');
      }
      setNotes(existing.session_note || '');
      console.log(`[PERF] Loaded assessment form in ${(performance.now() - renderStart).toFixed(2)}ms`);
      return;
    }

    // No existing assessment -> clean state
    setExistingAssessmentId(null);

    // Check if local draft exists
    const draftKey = getDraftKey();
    ApiService.getDraftLocal(draftKey).then(draft => {
      if (draft) {
        setAttendance(draft.attendance || 'UNASSESSED');
        const draftMode = (draft.assessmentMode === 'NURONIYYAH' || draft.assessmentMode === 'IQRA')
          ? 'NURONIYYAH'
          : (draft.assessmentMode || (selectedStudent?.skill_status_start === 'NON_BBL' ? 'NURONIYYAH' : 'ZIYADAH'));
        setAssessmentMode(draftMode);
        if (draftMode === 'NURONIYYAH') {
          setNuroniyyahDars(draft.nuroniyyahDars || (draft.iqraLevel ? `Ad-Dars ${draft.iqraLevel}` : ''));
          setLinesAdded(draft.linesAdded || '');
          setStartSurah(undefined);
          setStartAyah('');
          setEndSurah(undefined);
          setEndAyah('');
        } else {
          setStartSurah(draft.startSurah);
          setStartAyah(draft.startAyah || '');
          setEndSurah(draft.endSurah);
          setEndAyah(draft.endAyah || '');
          setLinesAdded(draft.linesAdded || '');
          setNuroniyyahDars('');
        }
        setNotes(draft.notes || '');
        return;
      }

      // No draft & no existing assessment: Reset form with smart start suggestion
      setAttendance('UNASSESSED');
      setNotes('');

      // New assessment default: NON_BBL -> 'NURONIYYAH', else 'ZIYADAH'
      const defaultMode = selectedStudent?.skill_status_start === 'NON_BBL' ? 'NURONIYYAH' : 'ZIYADAH';
      setAssessmentMode(defaultMode);

      // Smart start suggestion from previous session assessment or baseline
      const prevSessionNo = selectedSessionConfig.session_no - 1;
      const prevAssessment = assessments.find(a =>
        !a.is_deleted &&
        a.student_id === selectedStudentId &&
        a.session_no === prevSessionNo &&
        a.attendance_status === 'PRESENT'
      );

      if (defaultMode === 'NURONIYYAH') {
        setStartSurah(undefined);
        setStartAyah('');
        setEndSurah(undefined);
        setEndAyah('');
        setLinesAdded('');

        if (prevAssessment && (prevAssessment.assessment_mode === 'NURONIYYAH' || prevAssessment.nuroniyyah_dars)) {
          setNuroniyyahDars(prevAssessment.nuroniyyah_dars || '');
        } else if (prevAssessment && (prevAssessment.assessment_mode === 'IQRA' || prevAssessment.iqra_level != null)) {
          setNuroniyyahDars(`Ad-Dars ${prevAssessment.iqra_level || 1}`);
        } else {
          setNuroniyyahDars('Ad-Dars 1');
        }
      } else {
        setNuroniyyahDars('');
        setIqraLevel(undefined);
        setIqraPageStart('');
        setIqraPageEnd('');

        if (prevAssessment && prevAssessment.surah_end && prevAssessment.ayah_end) {
          const lastSurahObj = getSurahByNo(prevAssessment.surah_end);
          if (lastSurahObj) {
            if (prevAssessment.ayah_end < lastSurahObj.total_ayah) {
              setStartSurah(prevAssessment.surah_end);
              setStartAyah(String(prevAssessment.ayah_end + 1));
              setEndSurah(prevAssessment.surah_end);
              setEndAyah('');
            } else if (prevAssessment.surah_end < 114) {
              setStartSurah(prevAssessment.surah_end + 1);
              setStartAyah('1');
              setEndSurah(prevAssessment.surah_end + 1);
              setEndAyah('');
            } else {
              setStartSurah(undefined);
              setStartAyah('');
              setEndSurah(undefined);
              setEndAyah('');
            }
          }
        } else if (selectedStudent?.baseline_surah) {
          setStartSurah(selectedStudent.baseline_surah);
          setStartAyah(selectedStudent.baseline_ayah ? String(selectedStudent.baseline_ayah) : '1');
          setEndSurah(selectedStudent.baseline_surah);
          setEndAyah('');
        } else {
          setStartSurah(undefined);
          setStartAyah('');
          setEndSurah(undefined);
          setEndAyah('');
        }
        setLinesAdded('');
      }
      console.log(`[PERF] Prepared new assessment form in ${(performance.now() - renderStart).toFixed(2)}ms`);
    });
  }, [selectedStudentId, selectedSessionConfig, assessments, selectedStudent, getDraftKey]);

  // Auto-save local draft when fields change (if not in existing assessment edit mode)
  useEffect(() => {
    if (!selectedStudentId || !selectedSessionConfig || existingAssessmentId) return;

    const draftKey = getDraftKey();
    const draftData = {
      attendance,
      assessmentMode,
      nuroniyyahDars: (assessmentMode === 'NURONIYYAH' || assessmentMode === 'IQRA') ? nuroniyyahDars : '',
      startSurah: assessmentMode === 'ZIYADAH' ? startSurah : undefined,
      startAyah: assessmentMode === 'ZIYADAH' ? startAyah : '',
      endSurah: assessmentMode === 'ZIYADAH' ? endSurah : undefined,
      endAyah: assessmentMode === 'ZIYADAH' ? endAyah : '',
      linesAdded,
      notes
    };
    ApiService.saveDraftLocal(draftKey, draftData);
  }, [attendance, assessmentMode, startSurah, startAyah, endSurah, endAyah, linesAdded, nuroniyyahDars, notes, selectedStudentId, selectedSessionConfig, existingAssessmentId, getDraftKey]);

  // Student progress statistics calculation
  const studentStats = useMemo(() => {
    if (!selectedStudentId) return { totalLines: 0, sessionCount: 0, latestSetoran: null };

    const studentAssessments = assessments.filter(a =>
      !a.is_deleted &&
      a.student_id === selectedStudentId &&
      a.attendance_status === 'PRESENT'
    );

    const totalLines = studentAssessments
      .reduce((sum, a) => sum + (a.lines_added || 0), 0);

    const sorted = studentAssessments.slice().sort((a, b) => b.session_no - a.session_no);
    const latest = sorted[0] || null;

    return {
      totalLines,
      sessionCount: studentAssessments.length,
      latestSetoran: latest
    };
  }, [assessments, selectedStudentId]);

  // Validate form submission
  const validateForm = (): string | null => {
    if (!selectedStudentId) {
      return 'Pilih siswa terlebih dahulu.';
    }
    if (!selectedSessionConfig) {
      return 'Sesi belum dipilih atau belum terkonfigurasi.';
    }
    if (attendance === 'UNASSESSED') {
      return 'Pilih status kehadiran siswa terlebih dahulu.';
    }

    // If final evaluation session, Ziyadah / Nuroniyyah fields are not required
    if (isFinalEvaluationSession) {
      return null;
    }

    if (attendance === 'PRESENT') {
      if (assessmentMode === 'ZIYADAH') {
        if (!startSurah) {
          return 'Surah awal setoran wajib dipilih.';
        }
        if (!startAyah || Number(startAyah) < 1) {
          return 'Ayat awal setoran harus angka positif.';
        }
        const vStart = validateAyah(startSurah, Number(startAyah));
        if (!vStart.valid) {
          return `Ayat awal tidak valid: ${vStart.message}`;
        }

        if (!endSurah) {
          return 'Surah akhir setoran wajib dipilih.';
        }
        if (!endAyah || Number(endAyah) < 1) {
          return 'Ayat akhir setoran harus angka positif.';
        }
        const vEnd = validateAyah(endSurah, Number(endAyah));
        if (!vEnd.valid) {
          return `Ayat akhir tidak valid: ${vEnd.message}`;
        }
        if (linesAdded === '' || Number(linesAdded) < 0) {
          return 'Jumlah penambahan baris setoran baru wajib diisi (minimal 0).';
        }
      } else if (assessmentMode === 'NURONIYYAH' || assessmentMode === 'IQRA') {
        if (!nuroniyyahDars || !nuroniyyahDars.trim()) {
          return 'Ad-Dars Nuroniyyah (1–17) wajib dipilih atau diisi.';
        }
        if (linesAdded === '' || Number(linesAdded) < 0) {
          return 'Jumlah penambahan baris Nuroniyyah wajib diisi (minimal 0).';
        }
      }
    }

    return null;
  };

  // Perform save with Optimistic UI & Background Sync
  const handleSaveAssessment = async (nextAction?: 'NEXT_STUDENT' | 'NEXT_SESSION') => {
    setErrorMsg('');
    setSuccessMsg('');

    const valErr = validateForm();
    if (valErr) {
      setErrorMsg(valErr);
      setToast({
        type: 'error',
        message: 'Validasi form tidak lengkap',
        detail: valErr
      });
      return;
    }

    setSubmitting(true);
    try {
      const teacherIdToUse = currentUser?.teacher_id || currentUser?.user_id || '';

      const isPresent = attendance === 'PRESENT';
      const isZiyadah = !isFinalEvaluationSession && isPresent && assessmentMode === 'ZIYADAH';
      const isNuroniyyah = !isFinalEvaluationSession && isPresent && (assessmentMode === 'NURONIYYAH' || assessmentMode === 'IQRA');

      const payload = {
        student_id: selectedStudentId,
        participant_id: selectedStudent?.participant_id,
        session_config_id: selectedSessionConfig?.session_config_id,
        session_no: selectedSessionConfig?.session_no,
        attendance: attendance,
        assessment_mode: isFinalEvaluationSession ? undefined : (isPresent ? (assessmentMode === 'IQRA' ? 'NURONIYYAH' : assessmentMode) : undefined),
        start_surah: isZiyadah ? Number(startSurah) : undefined,
        start_ayah: isZiyadah ? Number(startAyah) : undefined,
        end_surah: isZiyadah ? Number(endSurah) : undefined,
        end_ayah: isZiyadah ? Number(endAyah) : undefined,
        lines_added: (isZiyadah || isNuroniyyah) && linesAdded !== '' ? Number(linesAdded) : 0,
        nuroniyyah_dars: isNuroniyyah ? nuroniyyahDars : undefined,
        notes: notes,
        teacher_id: teacherIdToUse
      };

      // Optimistic update in memory and background sync queue
      const saveResult = await saveAssessmentOptimistic(payload);
      if (saveResult && saveResult.success === false) {
        throw new Error(saveResult.error || 'Gagal menyimpan penilaian sesi.');
      }

      // Clear draft after success
      const draftKey = getDraftKey();
      await ApiService.clearDraftLocal(draftKey);

      const studentName = selectedStudent?.full_name || 'siswa';
      const sessionNo = selectedSessionConfig?.session_no;

      // Handle nextAction & set messages
      if (nextAction === 'NEXT_STUDENT') {
        const currentIdx = students.findIndex(s => s.student_id === selectedStudentId);
        if (currentIdx >= 0 && currentIdx < students.length - 1) {
          const nextStudent = students[currentIdx + 1];
          setSelectedStudentId(nextStudent.student_id);
          setSuccessMsg(`✓ Data penilaian ${studentName} berhasil disimpan. Beralih ke: ${nextStudent.full_name}`);
          setToast({
            type: 'success',
            message: '✓ Data berhasil disimpan.',
            detail: `Penilaian sesi #${sessionNo} untuk ${studentName} tersimpan. Menampilkan formulir: ${nextStudent.full_name}`
          });
        } else {
          setSuccessMsg(`✓ Data penilaian sesi #${sessionNo} untuk ${studentName} berhasil disimpan! (Siswa terakhir dalam halaqah ini)`);
          setToast({
            type: 'success',
            message: '✓ Data berhasil disimpan.',
            detail: `Penilaian sesi #${sessionNo} untuk ${studentName} tersimpan (Semua siswa dalam halaqah telah diinput).`
          });
        }
      } else if (nextAction === 'NEXT_SESSION') {
        const currentConfigIdx = availableSessionConfigs.findIndex(sc => sc.session_config_id === selectedSessionConfigId);
        if (currentConfigIdx >= 0 && currentConfigIdx < availableSessionConfigs.length - 1) {
          const nextConfig = availableSessionConfigs[currentConfigIdx + 1];
          setSelectedSessionConfigId(nextConfig.session_config_id);
          setSuccessMsg(`✓ Data penilaian ${studentName} berhasil disimpan. Beralih ke: Sesi #${nextConfig.session_no}`);
          setToast({
            type: 'success',
            message: '✓ Data berhasil disimpan.',
            detail: `Penilaian sesi #${sessionNo} untuk ${studentName} tersimpan. Menampilkan formulir Sesi #${nextConfig.session_no}.`
          });
        } else {
          setSuccessMsg(`✓ Data penilaian sesi #${sessionNo} untuk ${studentName} berhasil disimpan! (Sesi terakhir dalam kegiatan)`);
          setToast({
            type: 'success',
            message: '✓ Data berhasil disimpan.',
            detail: `Penilaian sesi #${sessionNo} untuk ${studentName} berhasil disimpan.`
          });
        }
      } else {
        setSuccessMsg(`✓ Penilaian sesi #${sessionNo} untuk ${studentName} berhasil disimpan!`);
        setToast({
          type: 'success',
          message: '✓ Data berhasil disimpan.',
          detail: `Penilaian sesi #${sessionNo} untuk ${studentName} berhasil disimpan dan disinkronkan.`
        });
      }

      // Smooth scroll to top of assessment form
      setTimeout(() => {
        formTopRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 60);

    } catch (err: any) {
      setErrorMsg('Gagal menyimpan penilaian: ' + (err.message || 'Silakan coba lagi.'));
      setToast({
        type: 'error',
        message: 'Gagal menyimpan data.',
        detail: err.message || 'Terjadi kesalahan saat menyimpan data penilaian.'
      });
      // Do NOT scroll away on error - preserve form values and teacher position
    } finally {
      setSubmitting(false);
    }
  };

  // Delete assessment optimistically
  const handleDeleteAssessment = async () => {
    if (!existingAssessmentId) return;
    if (!window.confirm('Apakah Anda yakin ingin menghapus data penilaian sesi ini?')) return;

    setDeleting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      deleteAssessmentOptimistic(existingAssessmentId);

      // Clear draft
      const draftKey = getDraftKey();
      await ApiService.clearDraftLocal(draftKey);

      setSuccessMsg('Data penilaian sesi berhasil dihapus.');

      // Reset form
      setExistingAssessmentId(null);
      setAttendance('UNASSESSED');
      const defaultMode = selectedStudent?.skill_status_start === 'NON_BBL' ? 'NURONIYYAH' : 'ZIYADAH';
      setAssessmentMode(defaultMode);
      setStartSurah(undefined);
      setStartAyah('');
      setEndSurah(undefined);
      setEndAyah('');
      setLinesAdded('');
      setNuroniyyahDars('');
      setIqraLevel(undefined);
      setIqraPageStart('');
      setIqraPageEnd('');
      setNotes('');
    } catch (err: any) {
      setErrorMsg('Gagal menghapus penilaian: ' + (err.message || ''));
    } finally {
      setDeleting(false);
    }
  };

  // Open Final Evaluation shortcut handler (saves attendance first if needed)
  const handleOpenFinalEvaluation = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!selectedStudentId || !selectedSessionConfig) return;

    // Coordinators are read-only
    if (currentUser?.role === 'COORDINATOR') {
      if (onNavigateToEvaluation) {
        onNavigateToEvaluation(selectedStudentId, selectedSessionConfig.session_config_id);
      }
      return;
    }

    setSavingPresensi(true);
    try {
      const teacherIdToUse = currentUser?.teacher_id || currentUser?.user_id || '';
      const payload = {
        student_id: selectedStudentId,
        participant_id: selectedStudent?.participant_id,
        session_config_id: selectedSessionConfig.session_config_id,
        session_no: selectedSessionConfig.session_no,
        attendance: attendance,
        assessment_mode: undefined,
        start_surah: undefined,
        start_ayah: undefined,
        end_surah: undefined,
        end_ayah: undefined,
        lines_added: 0,
        iqra_level: undefined,
        iqra_page_start: undefined,
        iqra_page_end: undefined,
        notes: notes,
        teacher_id: teacherIdToUse
      };

      // Optimistic update
      saveAssessmentOptimistic(payload);

      // Clear local draft for this session
      const draftKey = getDraftKey();
      await ApiService.clearDraftLocal(draftKey);

      // Navigate to Final Evaluation preserving student selection
      if (onNavigateToEvaluation) {
        onNavigateToEvaluation(selectedStudentId, selectedSessionConfig.session_config_id);
      }
    } catch (err: any) {
      setErrorMsg('Gagal menyimpan presensi sesi: ' + (err.message || 'Terjadi kesalahan saat menyimpan presensi'));
    } finally {
      setSavingPresensi(false);
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

  // Teacher has no assigned halaqah
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
          Akun Anda saat ini belum ditugaskan pada kelompok halaqah aktif di kegiatan ini. Silakan hubungi koordinator/administrator untuk alokasi kelompok.
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
            <BookOpen className="w-4 h-4" />
            <span>Formulir Assessment Sesi Setoran Hafalan</span>
            {isAdminOrCoord && (
              <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold">
                Mode Administrasi
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white line-clamp-2 break-normal">Input Penilaian Setoran Sesi</h2>
          <p className="text-xs text-slate-400 break-normal">
            Kelompok: <strong className="text-white">{halaqah.group_name || halaqah.halaqah_name}</strong> &bull; Guru: {halaqah.teacher_name}
          </p>
        </div>
      </div>

      {/* Form Top Anchor for Smooth Scrolling & Student Context */}
      <div ref={formTopRef} className="scroll-mt-6 space-y-4">
        {/* Visual Success & Error Alerts */}
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
                  Informasi Siswa
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
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Status Kemampuan Awal</span>
                <span className="font-bold text-slate-800">
                  {selectedStudent?.skill_status_start === 'NON_BBL' ? 'NON-BBL' : selectedStudent?.skill_status_start === 'BBL' ? 'BBL' : selectedStudent?.skill_status_start === 'BBLS' ? 'BBLS' : 'Belum diisi'}
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
                <span className="text-[10px] uppercase font-bold text-blue-600 block mb-0.5">Progres Saat Ini</span>
                <span className="font-bold text-blue-900">
                  {formatCurrentProgress(studentStats.latestSetoran)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Form */}
      <div className="bg-white p-6 md:p-8 rounded border border-slate-200 shadow-sm space-y-6">
        
        {/* Student & Session Selection Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 border-b border-slate-100">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Pilih Siswa
            </label>
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

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Pilih Sesi
              </label>
              {existingAssessmentId ? (
                <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  <RefreshCw className="w-3 h-3 text-amber-600" />
                  <span>Mode Edit Assessment</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Mode Input Baru</span>
                </span>
              )}
            </div>
            <select
              value={selectedSessionConfigId}
              onChange={(e) => setSelectedSessionConfigId(e.target.value)}
              disabled={isLoading || availableSessionConfigs.length === 0}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-50"
            >
              {availableSessionConfigs.length === 0 ? (
                <option value="">(Belum Ada Konfigurasi Sesi)</option>
              ) : (
                availableSessionConfigs.map(sc => (
                  <option key={sc.session_config_id} value={sc.session_config_id}>
                    {formatSessionOptionLabel(sc, eventDays, false, availableSessionConfigs)}
                  </option>
                ))
              )}
            </select>

            {/* Compact Session Summary Context */}
            {selectedSessionConfig && (
              <div className="mt-2.5">
                <SessionSummaryCard
                  sessionConfig={selectedSessionConfig}
                  eventDays={eventDays}
                  allSessionConfigs={availableSessionConfigs}
                />
              </div>
            )}
          </div>
        </div>

        {/* Attendance Status Selection */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
            Status Kehadiran Siswa
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { id: 'UNASSESSED', label: 'Belum Dinilai', bg: 'bg-slate-100 text-slate-700 border-slate-300' },
              { id: 'PRESENT', label: 'Hadir', bg: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
              { id: 'SICK', label: 'Sakit', bg: 'bg-amber-50 text-amber-800 border-amber-300' },
              { id: 'PERMISSION', label: 'Izin', bg: 'bg-blue-50 text-blue-800 border-blue-300' },
              { id: 'ABSENT', label: 'Alpa', bg: 'bg-rose-50 text-rose-800 border-rose-300' }
            ].map(st => (
              <button
                type="button"
                key={st.id}
                onClick={() => setAttendance(st.id as any)}
                className={`py-2.5 px-2 text-xs font-bold rounded transition border text-center ${
                  attendance === st.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : `${st.bg} hover:opacity-90`
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* SPECIAL VIEW: FINAL EVALUATION SESSION */}
        {isFinalEvaluationSession && (
          <div className="space-y-3 animate-in fade-in">
            {/* If UNASSESSED */}
            {attendance === 'UNASSESSED' && (
              <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center space-x-2 text-amber-800 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Pilih status kehadiran siswa di atas terlebih dahulu untuk melanjutkan sesi evaluasi akhir.</span>
              </div>
            )}

            {/* If PRESENT */}
            {attendance === 'PRESENT' && (
              <div id="final-evaluation-shortcut-panel" className="p-4 bg-purple-50/90 border border-purple-200 rounded-xl space-y-3.5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-purple-200/70 pb-3">
                  <div className="flex items-start sm:items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                      <Award className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-purple-900">
                        SESI EVALUASI AKHIR
                      </h4>
                      <p className="text-[11px] text-purple-700 font-medium">
                        ✓ Siswa hadir. Silakan lanjutkan ke pengisian evaluasi akhir.
                      </p>
                    </div>
                  </div>
                  <div>
                    {studentFinalEval ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>✓ Evaluasi Akhir Sudah Diisi</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 font-bold text-xs border border-amber-300">
                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                        <span>Belum Dievaluasi</span>
                      </span>
                    )}
                  </div>
                </div>

                {studentFinalEval && (
                  <div className="p-3 bg-white border border-purple-100 rounded-lg text-xs space-y-1.5 shadow-2xs">
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span>Predikat / Nilai Akhir:</span>
                      <span className="text-purple-700 font-bold">
                        {studentFinalEval.overall_grade || '-'} {studentFinalEval.predikat ? `(${studentFinalEval.predikat})` : ''}
                      </span>
                    </div>
                    {studentFinalEval.exam_notes && (
                      <p className="text-slate-600 italic text-[11px]">&ldquo;{studentFinalEval.exam_notes}&rdquo;</p>
                    )}
                  </div>
                )}

                {onNavigateToEvaluation && (
                  <div className="pt-0.5 flex flex-wrap items-center gap-2">
                    {currentUser?.role === 'COORDINATOR' ? (
                      studentFinalEval ? (
                        <button
                          type="button"
                          onClick={handleOpenFinalEvaluation}
                          className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-lg transition inline-flex items-center space-x-2 shadow-sm"
                        >
                          <BookOpen className="w-4 h-4" />
                          <span>Lihat Evaluasi Akhir</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500 italic">
                          Koordinator: Belum ada evaluasi akhir untuk siswa ini (Mode Lihat Saja).
                        </span>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={handleOpenFinalEvaluation}
                        disabled={savingPresensi || isLoading}
                        className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white font-bold text-xs rounded-lg transition inline-flex items-center space-x-2 shadow-sm disabled:opacity-50 min-h-[40px]"
                      >
                        <Award className="w-4 h-4 text-purple-200" />
                        <span>
                          {savingPresensi
                            ? 'Menyimpan presensi...'
                            : studentFinalEval
                            ? 'Lihat / Edit Evaluasi'
                            : 'Isi Evaluasi Akhir'}
                        </span>
                        <ArrowRight className="w-4 h-4 text-purple-200" />
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-purple-900 mb-1">
                    Catatan Presensi / Keterangan Sesi (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Catatan kehadiran santri pada sesi evaluasi akhir..."
                    className="w-full px-3 py-2 bg-white border border-purple-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  ></textarea>
                </div>
              </div>
            )}

            {/* If NON-PRESENT (SICK, PERMISSION, ABSENT) */}
            {(attendance === 'SICK' || attendance === 'PERMISSION' || attendance === 'ABSENT') && (
              <div id="final-evaluation-non-present-panel" className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in">
                <div className="flex items-start space-x-2.5 text-slate-700">
                  <AlertCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">
                      Siswa tidak mengikuti sesi evaluasi akhir ({attendance === 'SICK' ? 'Sakit' : attendance === 'PERMISSION' ? 'Izin' : 'Alpa'}).
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Data evaluasi akhir tidak dibuat secara otomatis. Simpan presensi untuk mencatat ketidakhadiran santri pada sesi ini.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Keterangan Ketidakhadiran (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Keterangan sakit/izin/alpa pada sesi evaluasi..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  ></textarea>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode Pembelajaran (ONLY when attendance_status = PRESENT and NOT Final Evaluation) */}
        {!isFinalEvaluationSession && attendance === 'PRESENT' && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Mode Pembelajaran
            </label>
            <div className="grid grid-cols-2 gap-2 max-w-xs">
              <button
                type="button"
                onClick={() => handleModeChange('ZIYADAH')}
                className={`py-2.5 px-4 text-xs font-bold rounded transition border text-center ${
                  assessmentMode === 'ZIYADAH'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
              >
                Hafalan Al-Qur&apos;an
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('NURONIYYAH')}
                className={`py-2.5 px-4 text-xs font-bold rounded transition border text-center ${
                  assessmentMode === 'NURONIYYAH' || assessmentMode === 'IQRA'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
              >
                Nuroniyyah
              </button>
            </div>
          </div>
        )}

        {/* Setoran Hafalan / Pembelajaran Nuroniyyah Fields (ONLY for HADIR and NOT Final Evaluation) */}
        {!isFinalEvaluationSession && attendance === 'PRESENT' && (
          <div className="space-y-5 pt-2 border-t border-slate-100 animate-in fade-in">
            <h4 className="font-bold text-xs uppercase text-slate-700 tracking-wider flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>{assessmentMode === 'ZIYADAH' ? 'Detail Setoran Hafalan Al-Qur\'an' : 'Detail Pembelajaran Nuroniyyah'}</span>
            </h4>
            
            {/* ZIYADAH MODE */}
            {assessmentMode === 'ZIYADAH' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  
                  {/* Start Surah & Ayah */}
                  <div className="space-y-3">
                    <SurahAutocomplete
                      label="Surah Awal Setoran"
                      value={startSurah}
                      onChange={(val) => setStartSurah(val || undefined)}
                    />
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Ayat Awal
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={startAyah}
                        onChange={(e) => setStartAyah(e.target.value)}
                        placeholder="mis: 1"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* End Surah & Ayah */}
                  <div className="space-y-3">
                    <SurahAutocomplete
                      label="Surah Akhir Setoran"
                      value={endSurah}
                      onChange={(val) => setEndSurah(val || undefined)}
                    />
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Ayat Akhir
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={endAyah}
                        onChange={(e) => setEndAyah(e.target.value)}
                        placeholder="mis: 15"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                </div>

                {/* Total Lines Added */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-blue-50/60 border border-blue-200 rounded-lg gap-3">
                  <div>
                    <span className="text-xs font-bold text-blue-900 block">Penambahan Baris Setoran Baru</span>
                    <p className="text-[11px] text-blue-700">Jumlah baris Al-Qur&apos;an tuntas disetorkan pada sesi ini</p>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <input
                      type="number"
                      min={0}
                      value={linesAdded}
                      onChange={(e) => setLinesAdded(e.target.value)}
                      placeholder="0"
                      className="w-24 px-3 py-1.5 bg-white border border-blue-300 font-bold text-sm text-blue-900 text-center rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-blue-900">Baris</span>
                  </div>
                </div>
              </>
            )}

            {/* NURONIYYAH MODE */}
            {(assessmentMode === 'NURONIYYAH' || assessmentMode === 'IQRA') && (
              <div className="space-y-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                {/* 17 Ad-Dars Selector */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                    Ad-Dars Nuroniyyah (1–17)
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 gap-1.5">
                    {Array.from({ length: 17 }, (_, i) => `Ad-Dars ${i + 1}`).map((dars) => (
                      <button
                        type="button"
                        key={dars}
                        onClick={() => setNuroniyyahDars(dars)}
                        className={`py-2 px-1 text-[11px] font-bold rounded transition border text-center truncate ${
                          nuroniyyahDars === dars
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {dars}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2">
                    <input
                      type="text"
                      value={nuroniyyahDars}
                      onChange={(e) => setNuroniyyahDars(e.target.value)}
                      placeholder="Pilih nomor Ad-Dars di atas atau ketik di sini (mis: Ad-Dars 1)"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Total Lines Added for Nuroniyyah */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-blue-50/60 border border-blue-200 rounded-lg gap-3">
                  <div>
                    <span className="text-xs font-bold text-blue-900 block">Penambahan Baris Belajar Baru</span>
                    <p className="text-[11px] text-blue-700">Jumlah baris Nuroniyyah tuntas dipelajari pada sesi ini</p>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <input
                      type="number"
                      min={0}
                      value={linesAdded}
                      onChange={(e) => setLinesAdded(e.target.value)}
                      placeholder="0"
                      className="w-24 px-3 py-1.5 bg-white border border-blue-300 font-bold text-sm text-blue-900 text-center rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-blue-900">Baris</span>
                  </div>
                </div>
              </div>
            )}

            {/* Catatan Evaluasi Guru */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Catatan Evaluasi Guru (Sesi Ini)
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tuliskan catatan kelancaran, makhraj, tajwid, atau motivasi untuk siswa..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              ></textarea>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <div className={`grid grid-cols-1 ${isFinalEvaluationSession ? 'sm:grid-cols-2' : 'md:grid-cols-3'} gap-3`}>
            <button
              type="button"
              onClick={() => handleSaveAssessment()}
              disabled={submitting || deleting}
              className="py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[42px]"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{submitting ? 'Menyimpan...' : isFinalEvaluationSession ? 'Simpan Presensi' : 'Simpan'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveAssessment('NEXT_STUDENT')}
              disabled={submitting || deleting}
              className="py-3 px-4 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[42px]"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-emerald-400" />}
              <span>{submitting ? 'Menyimpan...' : isFinalEvaluationSession ? 'Presensi & Siswa Berikutnya' : 'Simpan & Siswa Berikutnya'}</span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>

            {!isFinalEvaluationSession && (
              <button
                type="button"
                onClick={() => handleSaveAssessment('NEXT_SESSION')}
                disabled={submitting || deleting}
                className="py-3 px-4 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[42px]"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{submitting ? 'Menyimpan...' : 'Simpan & Sesi Berikutnya'}</span>
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Soft Delete button when in edit mode */}
          {existingAssessmentId && (
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={handleDeleteAssessment}
                disabled={deleting || submitting}
                className="px-3.5 py-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs font-bold rounded transition border border-rose-200 inline-flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deleting ? 'Menghapus...' : 'Hapus Assessment Sesi Ini'}</span>
              </button>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
