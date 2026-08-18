import React, { useState, useEffect, useMemo } from 'react';
import { Student, Halaqah, EventParticipant, Event, BulkAssignResult, PlacementStudent } from '../../types';
import { ApiService } from '../../services/api';
import { getUniqueClassesSorted } from '../../utils/studentUtils';
import {
  Users, Search, CheckSquare, Square, ArrowRight, AlertTriangle,
  CheckCircle2, X, Lock, AlertCircle, RefreshCw, UserPlus, UserCheck, UserX
} from 'lucide-react';

export const HalaqahStudentAssignment: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('RT2026-02');
  const [students, setStudents] = useState<PlacementStudent[] | Student[]>([]);
  const [halaqahs, setHalaqahs] = useState<Halaqah[]>([]);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [maxCapacity, setMaxCapacity] = useState<number>(15);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Status Alerts
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Filters
  const [search, setSearch] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [genderFilter, setGenderFilter] = useState<string>('ALL');
  const [skillFilter, setSkillFilter] = useState<string>('ALL');
  const [halaqahFilter, setHalaqahFilter] = useState<string>('ALL');

  // Selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [targetHalaqahId, setTargetHalaqahId] = useState<string>('');

  // Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);

  useEffect(() => {
    loadEvents();
  }, []);

  // Listen for tab resume event
  useEffect(() => {
    const handleResume = () => {
      if (selectedEventId) {
        loadData(selectedEventId);
      }
    };
    window.addEventListener('rt_app_resumed', handleResume);
    return () => window.removeEventListener('rt_app_resumed', handleResume);
  }, [selectedEventId]);

  useEffect(() => {
    if (selectedEventId) {
      // Reset selection on event change
      setSelectedStudentIds([]);
      setTargetHalaqahId('');
      setSuccessMsg('');
      setErrorMsg('');
      loadData(selectedEventId);
    }
  }, [selectedEventId]);

  const loadEvents = async () => {
    try {
      const evts = await ApiService.getEvents();
      if (Array.isArray(evts) && evts.length > 0) {
        setEvents(evts);
        setSelectedEventId(prev => {
          if (prev && evts.some(e => e.event_id === prev)) return prev;
          const active = evts.find(e => e.status === 'ACTIVE') || evts[0];
          return active ? active.event_id : prev;
        });
      }
    } catch (err: any) {
      console.warn('Gagal memuat daftar kegiatan:', err);
    }
  };

  const loadData = async (eventId: string) => {
    if (!eventId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const [bootstrap, capStr] = await Promise.all([
        ApiService.getStudentPlacementBootstrap(eventId),
        ApiService.getConfigValue('default_halaqah_capacity', '15')
      ]);

      setStudents(bootstrap.students || []);
      setHalaqahs(bootstrap.halaqahs || []);
      setParticipants(bootstrap.participants || []);
      setMaxCapacity(parseInt(capStr, 10) || 15);

      if (bootstrap.halaqahs && bootstrap.halaqahs.length > 0) {
        setTargetHalaqahId(prev => {
          if (prev && bootstrap.halaqahs.some((h: any) => h.halaqah_id === prev)) return prev;
          return bootstrap.halaqahs[0].halaqah_id;
        });
      } else {
        setTargetHalaqahId('');
      }
    } catch (err: any) {
      console.error('Error loading placement data:', err);
      setErrorMsg(err.message || 'Gagal memuat data peserta & halaqah dari server.');
    } finally {
      setLoading(false);
    }
  };

  // Selected event metadata
  const selectedEvent = events.find(e => e.event_id === selectedEventId);
  const isEventClosed = selectedEvent?.status === 'CLOSED';

  // Participant Map for quick lookup: student_id -> EventParticipant
  const participantMap = new Map<string, EventParticipant>();
  participants.forEach(p => participantMap.set(p.student_id, p));

  // Halaqah Map for quick lookup: halaqah_id -> Halaqah
  const halaqahMap = new Map<string, Halaqah>();
  halaqahs.forEach(h => halaqahMap.set(h.halaqah_id, h));

  // Active Master Students (Show ALL active students from Master Siswa)
  const activeMasterStudents = students.filter(s =>
    s.active === true || s.active == null || (s.active as any) === '' ||
    String(s.active) === 'true' || String(s.active).toUpperCase() === 'ACTIVE'
  );

  // Dynamic unique class options sorted naturally (numeric grade first, then class name)
  const availableClasses = useMemo(() => {
    return getUniqueClassesSorted(activeMasterStudents);
  }, [activeMasterStudents]);

  // Counters
  const totalMasterCount = activeMasterStudents.length;
  const registeredCount = activeMasterStudents.filter(s => participantMap.has(s.student_id)).length;
  const unregisteredCount = totalMasterCount - registeredCount;

  // Filtered Students List from Master Students
  const filteredStudents = activeMasterStudents.filter(s => {
    const p = participantMap.get(s.student_id);
    const isRegistered = Boolean(p);

    const matchesSearch =
      search.trim() === '' ||
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.nis.toLowerCase().includes(search.toLowerCase());

    const matchesClass = classFilter === 'ALL' || s.class_name === classFilter;
    const matchesGender = genderFilter === 'ALL' || s.gender === genderFilter;
    const matchesSkill = skillFilter === 'ALL' || (p && p.skill_status_start === skillFilter);

    let matchesHalaqah = true;
    if (halaqahFilter === 'NOT_REGISTERED') {
      matchesHalaqah = !isRegistered;
    } else if (halaqahFilter === 'UNASSIGNED') {
      matchesHalaqah = isRegistered && (!p || !p.halaqah_id || p.halaqah_id === '');
    } else if (halaqahFilter === 'ASSIGNED') {
      matchesHalaqah = isRegistered && Boolean(p && p.halaqah_id && p.halaqah_id !== '');
    } else if (halaqahFilter !== 'ALL') {
      matchesHalaqah = isRegistered && p?.halaqah_id === halaqahFilter;
    }

    return matchesSearch && matchesClass && matchesGender && matchesSkill && matchesHalaqah;
  });

  // Filter change handlers with selection safety (clear selection on filter change)
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setSelectedStudentIds([]);
  };

  const handleClassFilterChange = (val: string) => {
    setClassFilter(val);
    setSelectedStudentIds([]);
  };

  const handleGenderFilterChange = (val: string) => {
    setGenderFilter(val);
    setSelectedStudentIds([]);
  };

  const handleSkillFilterChange = (val: string) => {
    setSkillFilter(val);
    setSelectedStudentIds([]);
  };

  const handleHalaqahFilterChange = (val: string) => {
    setHalaqahFilter(val);
    setSelectedStudentIds([]);
  };

  // Checkbox handlers with actual membership checking
  const isAllFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every(s => selectedStudentIds.includes(s.student_id));

  const handleSelectAllFiltered = () => {
    if (isEventClosed) return;
    if (isAllFilteredSelected) {
      const filteredSet = new Set(filteredStudents.map(s => s.student_id));
      setSelectedStudentIds(prev => prev.filter(id => !filteredSet.has(id)));
    } else {
      const filteredIds = filteredStudents.map(s => s.student_id);
      setSelectedStudentIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const toggleSelectStudent = (studentId: string) => {
    if (isEventClosed) return;
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(prev => prev.filter(id => id !== studentId));
    } else {
      setSelectedStudentIds(prev => [...prev, studentId]);
    }
  };

  // Open confirmation modal preview
  const handlePrepareBulkAssign = () => {
    setSuccessMsg('');
    setErrorMsg('');

    if (isEventClosed) {
      setErrorMsg('Kegiatan telah ditutup. Penempatan siswa tidak dapat diubah.');
      return;
    }
    if (selectedStudentIds.length === 0) {
      setErrorMsg('Pilih setidaknya satu siswa terlebih dahulu.');
      return;
    }
    if (!targetHalaqahId) {
      setErrorMsg('Pilih halaqah sasaran terlebih dahulu.');
      return;
    }

    const targetHalaqah = halaqahs.find(h => h.halaqah_id === targetHalaqahId);
    if (!targetHalaqah) {
      setErrorMsg('Halaqah sasaran tidak ditemukan.');
      return;
    }

    // Gender Compatibility Check
    const mismatchedStudents = selectedStudentIds.filter(sid => {
      const st = students.find(s => s.student_id === sid);
      return st && st.gender !== targetHalaqah.gender;
    });

    if (mismatchedStudents.length > 0) {
      setErrorMsg(
        `Terdapat ${mismatchedStudents.length} siswa dengan gender yang tidak sesuai dengan halaqah sasaran (${targetHalaqah.gender}). Penempatan gender yang tidak cocok tidak diperbolehkan.`
      );
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // Commit bulk assignment & registration
  const handleCommitBulkAssign = async () => {
    if (submitting || isEventClosed) return;
    setSubmitting(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const targetHalaqah = halaqahs.find(h => h.halaqah_id === targetHalaqahId);
      const res: BulkAssignResult = await ApiService.bulkRegisterAndAssignStudentsToHalaqah(
        selectedEventId,
        selectedStudentIds,
        targetHalaqahId
      );

      setIsConfirmModalOpen(false);
      setSelectedStudentIds([]);

      const summaryParts: string[] = [];
      if (res.createdCount > 0) {
        summaryParts.push(`${res.createdCount} siswa berhasil didaftarkan dan ditempatkan ke ${targetHalaqah?.halaqah_name || 'halaqah'}.`);
      }
      if (res.updatedCount > 0) {
        summaryParts.push(`${res.updatedCount} siswa diperbarui.`);
      }
      if (res.skippedCount > 0) {
        summaryParts.push(`${res.skippedCount} siswa dilewati karena gender tidak sesuai / tidak aktif.`);
      }

      setSuccessMsg(summaryParts.join(' ') || 'Penempatan siswa berhasil diproses.');
      await loadData(selectedEventId);
    } catch (err: any) {
      setErrorMsg('Gagal memproses penempatan siswa: ' + (err.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  // Single Per-Row Quick Assignment & Registration
  const handleSingleStudentAssign = async (studentId: string, newHalaqahId: string) => {
    if (isEventClosed || submitting) return;
    setSuccessMsg('');
    setErrorMsg('');

    const st = students.find(s => s.student_id === studentId);
    if (!st) return;

    if (!newHalaqahId) {
      // Unassign halaqah
      try {
        setSubmitting(true);
        const res = await ApiService.bulkRegisterAndAssignStudentsToHalaqah(selectedEventId, [studentId], '');
        setSuccessMsg(`Status halaqah untuk ${st.full_name} berhasil dikosongkan.`);
        await loadData(selectedEventId);
      } catch (err: any) {
        setErrorMsg('Gagal memperbarui halaqah siswa: ' + (err.message || ''));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const targetHalaqah = halaqahs.find(h => h.halaqah_id === newHalaqahId);
    if (!targetHalaqah) return;

    // Check gender mismatch
    if (st.gender !== targetHalaqah.gender) {
      setErrorMsg(
        `Gagal menempatkan ${st.full_name} (${st.gender}) ke ${targetHalaqah.halaqah_name} (${targetHalaqah.gender}): Gender tidak sesuai.`
      );
      return;
    }

    try {
      setSubmitting(true);
      const res = await ApiService.bulkRegisterAndAssignStudentsToHalaqah(selectedEventId, [studentId], newHalaqahId);
      const isNewRegistration = res.createdCount > 0;
      setSuccessMsg(
        isNewRegistration
          ? `Berhasil mendaftarkan ${st.full_name} ke kegiatan dan menempatkan ke ${targetHalaqah.halaqah_name}.`
          : `Berhasil menempatkan ${st.full_name} ke ${targetHalaqah.halaqah_name}.`
      );
      await loadData(selectedEventId);
    } catch (err: any) {
      setErrorMsg('Gagal memperbarui halaqah siswa: ' + (err.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  // Preview Population Calculations
  const targetHalaqahObj = halaqahs.find(h => h.halaqah_id === targetHalaqahId);
  const currentTargetStudents = participants.filter(p => p.halaqah_id === targetHalaqahId);
  const currentCount = currentTargetStudents.length;

  // Selected students breakdown
  const newlyAddedCount = selectedStudentIds.filter(sid => {
    const p = participantMap.get(sid);
    return !p || p.halaqah_id !== targetHalaqahId;
  }).length;

  const unregisteredInSelection = selectedStudentIds.filter(sid => !participantMap.has(sid)).length;

  const alreadyAssignedElsewhereCount = selectedStudentIds.filter(sid => {
    const p = participantMap.get(sid);
    return p && p.halaqah_id && p.halaqah_id !== targetHalaqahId;
  }).length;

  const populationAfter = currentCount + newlyAddedCount;
  const isImbalanceWarning = populationAfter > maxCapacity;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800 w-full min-w-0">
        <div className="w-full min-w-0 max-w-full flex-1">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <Users className="w-4 h-4" />
            <span>Alokasi & Penempatan Siswa</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1 line-clamp-2 break-normal">Penempatan Siswa Halaqah</h1>
          <p className="text-slate-400 text-xs mt-1 break-normal">
            Alokasi siswa dari Master Siswa ke kelompok halaqah kegiatan secara masal atau per siswa.
          </p>
        </div>
        {isEventClosed && (
          <div className="bg-amber-900/50 border border-amber-700/80 px-3.5 py-2 rounded-xl flex items-center space-x-2 text-amber-200 text-xs font-semibold w-full xl:w-auto xl:justify-end shrink-0">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Kegiatan Ditutup (Mode Lihat)</span>
          </div>
        )}
      </div>

      {/* Population & Registration Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Master Siswa</div>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{totalMasterCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Siswa aktif terdaftar di sistem</div>
          </div>
          <div className="w-10 h-10 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between bg-gradient-to-br from-white to-emerald-50/40">
          <div>
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Terdaftar di Event</div>
            <div className="text-2xl font-black text-emerald-900 mt-0.5">{registeredCount}</div>
            <div className="text-[10px] text-emerald-600 mt-0.5">Peserta dalam kegiatan terpilih</div>
          </div>
          <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex items-center justify-between bg-gradient-to-br from-white to-amber-50/40">
          <div>
            <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Belum Terdaftar</div>
            <div className="text-2xl font-black text-amber-900 mt-0.5">{unregisteredCount}</div>
            <div className="text-[10px] text-amber-600 mt-0.5">Dapat langsung ditempatkan</div>
          </div>
          <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center">
            <UserPlus className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Success / Error Feedback Alerts */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-semibold text-xs flex items-center justify-between border-l-4 border-l-emerald-500 shadow-sm animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-semibold text-xs flex items-center justify-between border-l-4 border-l-rose-500 shadow-sm animate-in fade-in">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-rose-500 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Control Bar & Target Selector */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <label className="text-xs font-bold text-slate-700 shrink-0">Kegiatan / Event:</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="py-1.5 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            {events.map((e) => (
              <option key={e.event_id} value={e.event_id}>
                {e.event_name} ({e.academic_year}) {e.status === 'CLOSED' ? '[DITUTUP]' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Bulk Action Bar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
          <span className="text-xs font-semibold text-slate-600 pl-1">
            Terpilih: <strong className="text-slate-900 font-bold">{selectedStudentIds.length} siswa</strong>
          </span>

          <ArrowRight className="w-4 h-4 text-slate-400" />

          <select
            disabled={isEventClosed}
            value={targetHalaqahId}
            onChange={(e) => setTargetHalaqahId(e.target.value)}
            className="py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-xs font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
          >
            {halaqahs.length === 0 ? (
              <option value="">(Belum Ada Halaqah)</option>
            ) : (
              halaqahs.map((h) => (
                <option key={h.halaqah_id} value={h.halaqah_id}>
                  Tempatkan ke: {h.halaqah_name} ({h.gender})
                </option>
              ))
            )}
          </select>

          <button
            onClick={handlePrepareBulkAssign}
            disabled={selectedStudentIds.length === 0 || isEventClosed || submitting}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center space-x-1.5"
          >
            <span>{submitting ? 'Memproses...' : 'Daftarkan & Tempatkan'}</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
          <div className="relative col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Cari Siswa atau NIS..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <select
              value={classFilter}
              onChange={(e) => handleClassFilterChange(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="ALL">Semua Kelas</option>
              {availableClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={genderFilter}
              onChange={(e) => handleGenderFilterChange(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="ALL">Semua Gender</option>
              <option value="IKHWAN">Ikhwan</option>
              <option value="AKHWAT">Akhwat</option>
            </select>
          </div>

          <div>
            <select
              value={skillFilter}
              onChange={(e) => handleSkillFilterChange(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="ALL">Semua Skill</option>
              <option value="NON_BBL">NON_BBL</option>
              <option value="BBL">BBL</option>
              <option value="BBLS">BBLS</option>
            </select>
          </div>

          <div>
            <select
              value={halaqahFilter}
              onChange={(e) => handleHalaqahFilterChange(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="ALL">Semua Status</option>
              <option value="NOT_REGISTERED">Belum Terdaftar</option>
              <option value="UNASSIGNED">Belum Ada Halaqah</option>
              <option value="ASSIGNED">Sudah Ditempatkan</option>
              {halaqahs.map(h => (
                <option key={h.halaqah_id} value={h.halaqah_id}>{h.halaqah_name} ({h.gender})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center space-x-2">
            <button
              disabled={isEventClosed || filteredStudents.length === 0}
              onClick={handleSelectAllFiltered}
              className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center space-x-1 disabled:opacity-50"
            >
              {isAllFilteredSelected ? (
                <CheckSquare className="w-3.5 h-3.5" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span>Pilih Semua Hasil Filter ({filteredStudents.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span>Menampilkan: <strong className="text-slate-800 font-bold">{filteredStudents.length}</strong> dari {totalMasterCount} siswa master</span>
          </div>
        </div>
      </div>

      {/* Student List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 uppercase tracking-wider font-bold border-b border-slate-200 text-[10px]">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    disabled={isEventClosed || filteredStudents.length === 0}
                    checked={isAllFilteredSelected}
                    onChange={handleSelectAllFiltered}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                </th>
                <th className="p-3">NIS</th>
                <th className="p-3">Nama Lengkap Siswa</th>
                <th className="p-3">Gender</th>
                <th className="p-3">Kelas</th>
                <th className="p-3">Status Event / Skill</th>
                <th className="p-3">Halaqah Saat Ini</th>
                <th className="p-3 text-right">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && students.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                      <span>Memuat data siswa master & penempatan...</span>
                    </div>
                  </td>
                </tr>
              ) : errorMsg && students.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center bg-rose-50/50">
                    <div className="max-w-md mx-auto space-y-3">
                      <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                      <div className="text-sm font-bold text-rose-900">Data gagal dimuat</div>
                      <p className="text-xs text-rose-600">{errorMsg}</p>
                      <button
                        onClick={() => { loadEvents(); loadData(selectedEventId); }}
                        className="inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Coba Lagi</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    Tidak ada siswa master yang sesuai kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => {
                  const p = participantMap.get(s.student_id);
                  const isRegistered = Boolean(p);
                  const isSelected = selectedStudentIds.includes(s.student_id);
                  const currentHalaqahId = p?.halaqah_id || '';
                  const currentHalaqahObj = currentHalaqahId ? halaqahMap.get(currentHalaqahId) : null;

                  return (
                    <tr
                      key={s.student_id}
                      onClick={() => toggleSelectStudent(s.student_id)}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-emerald-50/80 font-semibold text-slate-900' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          disabled={isEventClosed}
                          checked={isSelected}
                          onChange={() => toggleSelectStudent(s.student_id)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="p-3 font-mono text-[11px] font-bold text-slate-600">
                        {s.nis}
                      </td>
                      <td className="p-3 font-bold text-slate-900">
                        {s.full_name}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          s.gender === 'IKHWAN' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {s.gender}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-700">
                        {p?.grade_snapshot || s.grade_level} ({p?.class_snapshot || s.class_name})
                      </td>
                      <td className="p-3">
                        {isRegistered ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Terdaftar
                            </span>
                            {p?.skill_status_start && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                {p.skill_status_start}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            Belum Terdaftar
                          </span>
                        )}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {/* Per-row single halaqah quick selector */}
                        <select
                          disabled={isEventClosed || submitting}
                          value={currentHalaqahId}
                          onChange={(e) => handleSingleStudentAssign(s.student_id, e.target.value)}
                          className={`py-1 px-2 rounded text-xs font-bold border focus:outline-none transition ${
                            currentHalaqahId
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                              : isRegistered
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-slate-100 text-slate-600 border-slate-300'
                          }`}
                        >
                          <option value="">
                            {!isRegistered ? '(Belum Terdaftar)' : '(Belum Ada Halaqah)'}
                          </option>
                          {halaqahs.map(h => {
                            const isGenderCompatible = s.gender === h.gender;
                            return (
                              <option
                                key={h.halaqah_id}
                                value={h.halaqah_id}
                                disabled={!isGenderCompatible}
                              >
                                {h.halaqah_name} ({h.gender}) {!isGenderCompatible ? '[Gender Beda]' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          disabled={isEventClosed || submitting}
                          onClick={() => toggleSelectStudent(s.student_id)}
                          className="text-[11px] font-bold text-slate-600 hover:text-emerald-700"
                        >
                          {isSelected ? 'Batal Pilih' : 'Pilih Siswa'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Preview Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Konfirmasi Penempatan Siswa</span>
              </h3>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-sm font-bold text-slate-900 bg-slate-100 p-3 rounded-xl border border-slate-200 text-center">
                Apakah Anda yakin mendaftarkan & menempatkan <span className="text-emerald-700 font-extrabold">{selectedStudentIds.length} siswa</span> ke <span className="text-emerald-900 font-extrabold">{targetHalaqahObj?.halaqah_name}</span> ({targetHalaqahObj?.gender})?
              </div>

              {/* Population Metrics Preview */}
              <div className="space-y-2 border-t border-b border-slate-100 py-3 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span>Jumlah siswa di halaqah saat ini:</span>
                  <strong className="font-bold text-slate-900">{currentCount} Siswa</strong>
                </div>
                {unregisteredInSelection > 0 && (
                  <div className="flex justify-between text-amber-800 bg-amber-50/70 p-2 rounded-lg font-medium">
                    <span>Siswa baru yang akan didaftarkan ke event:</span>
                    <strong className="font-bold text-amber-900">{unregisteredInSelection} Siswa</strong>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Siswa baru yang akan dialokasikan:</span>
                  <strong className="font-bold text-emerald-600">+{newlyAddedCount} Siswa</strong>
                </div>
                <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-slate-100">
                  <span>Total populasi setelah penempatan:</span>
                  <strong className="text-emerald-800">{populationAfter} Siswa</strong>
                </div>
                {alreadyAssignedElsewhereCount > 0 && (
                  <div className="flex justify-between text-blue-700 bg-blue-50 p-2 rounded-lg font-medium">
                    <span>Siswa yang berpindah dari halaqah lain:</span>
                    <strong className="font-bold">{alreadyAssignedElsewhereCount} Siswa</strong>
                  </div>
                )}
              </div>

              {/* Potential Imbalance Warning */}
              {isImbalanceWarning && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 flex items-start space-x-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Peringatan Kapasitas Halaqah:</p>
                    <p className="text-[11px] mt-0.5">
                      Jumlah populasi ({populationAfter} siswa) melebihi kapasitas standar ({maxCapacity} siswa per halaqah). Pastikan rasio guru pendamping mencukupi.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  disabled={submitting}
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  disabled={submitting}
                  onClick={handleCommitBulkAssign}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center space-x-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submitting ? 'Memproses...' : 'Konfirmasi & Terapkan Penempatan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
