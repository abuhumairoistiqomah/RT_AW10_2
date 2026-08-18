import React, { useState, useEffect } from 'react';
import { Halaqah, Teacher, HalaqahTeacher, TeacherRole, Event } from '../../types';
import { ApiService } from '../../services/api';
import {
  UserCheck, Plus, Trash2, Calendar, CheckCircle2, RefreshCw, AlertCircle, X
} from 'lucide-react';

export const TeacherAssignment: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('RT2026-02');
  const [halaqahs, setHalaqahs] = useState<Halaqah[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<HalaqahTeacher[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Status Alerts
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Assignment Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [targetHalaqahId, setTargetHalaqahId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<TeacherRole>('PRIMARY');

  // Delete Confirmation Modal
  const [assignmentToDelete, setAssignmentToDelete] = useState<HalaqahTeacher | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

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
      console.warn('Gagal memuat daftar event:', err);
    }
  };

  const loadData = async (eventId: string) => {
    if (!eventId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [hList, tList, htList] = await Promise.all([
        ApiService.getHalaqahList(eventId),
        ApiService.getTeachers(),
        ApiService.getHalaqahTeachers(eventId)
      ]);
      setHalaqahs(hList || []);
      setTeachers(tList || []);
      setAssignments(htList || []);
      setLoadError(null);
    } catch (err: any) {
      console.error('Error loading teacher assignments:', err);
      setLoadError(err.message || 'Gagal memuat data penugasan guru dari server.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAssignModal = (halaqahId: string) => {
    setTargetHalaqahId(halaqahId);
    setSelectedTeacherId(teachers[0]?.teacher_id || '');
    setSelectedRole('PRIMARY');
    setIsAssignModalOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetHalaqahId || !selectedTeacherId || submitting) return;
    setSubmitting(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const newHt: HalaqahTeacher = {
        assignment_id: `HT-${Date.now()}`,
        event_id: selectedEventId,
        halaqah_id: targetHalaqahId,
        teacher_id: selectedTeacherId,
        teacher_role: selectedRole,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const saved = await ApiService.saveHalaqahTeacher(newHt);
      setIsAssignModalOpen(false);
      const teacherObj = teachers.find(t => t.teacher_id === selectedTeacherId);
      const halaqahObj = halaqahs.find(h => h.halaqah_id === targetHalaqahId);
      setSuccessMsg(`Berhasil menugaskan ${teacherObj?.full_name || 'Guru'} ke ${halaqahObj?.halaqah_name || 'Halaqah'}.`);
      await loadData(selectedEventId);
    } catch (err: any) {
      setErrorMsg('Gagal menyimpan penugasan guru: ' + (err.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClickDelete = (assignment: HalaqahTeacher) => {
    console.log('DELETE ASSIGNMENT CLICK:', assignment?.assignment_id);
    if (!assignment || !assignment.assignment_id) {
      setErrorMsg('ID penugasan tidak ditemukan. Data tidak dapat dihapus.');
      return;
    }
    setAssignmentToDelete(assignment);
  };

  const handleConfirmDelete = async () => {
    if (!assignmentToDelete || isDeleting) return;

    const assignmentId = assignmentToDelete.assignment_id;
    if (!assignmentId) {
      setErrorMsg('ID penugasan tidak ditemukan. Data tidak dapat dihapus.');
      setAssignmentToDelete(null);
      return;
    }

    setIsDeleting(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await ApiService.deleteHalaqahTeacher(assignmentId);
      if (res && res.deleted) {
        // 1. Close confirmation modal
        setAssignmentToDelete(null);
        // 2. Immediately remove assignment from local UI state using assignment_id
        setAssignments(prev => prev.filter(a => a.assignment_id !== assignmentId));
        // 3. Reload getHalaqahTeachers
        await loadData(selectedEventId);
        // 4. Show toast
        setSuccessMsg('Penugasan guru berhasil dihapus.');
      } else {
        throw new Error('Penghapusan tidak dapat diverifikasi oleh server.');
      }
    } catch (err: any) {
      setErrorMsg('Gagal menghapus penugasan guru: ' + (err.message || ''));
      await loadData(selectedEventId);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800 w-full min-w-0">
        <div className="w-full min-w-0 max-w-full flex-1">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <UserCheck className="w-4 h-4" />
            <span>Manajemen Penugasan Guru</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1 line-clamp-2 break-normal">Penugasan Guru Tahfidz</h1>
          <p className="text-slate-400 text-xs mt-1 break-normal">
            Penetapan peran guru (Primary, Assistant, Substitute) untuk setiap kelompok halaqah per event.
          </p>
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

      {/* Event Selection Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Calendar className="w-4 h-4 text-slate-500" />
          <label className="text-xs font-bold text-slate-700">Pilih Event Rumah Tahfidz:</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="py-1.5 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            {events.map((e) => (
              <option key={e.event_id} value={e.event_id}>
                {e.event_name} ({e.academic_year})
              </option>
            ))}
          </select>
        </div>

        <button onClick={() => loadData(selectedEventId)} className="flex items-center space-x-1 text-xs text-emerald-600 hover:text-emerald-700 font-bold">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error Alert Banner when data exists but revalidation failed */}
      {loadError && halaqahs.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex items-center justify-between text-xs font-medium shadow-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold">⚠ Gagal sinkronisasi data:</span>
            <span>{loadError}. Menampilkan data lokal.</span>
          </div>
          <button
            onClick={() => loadData(selectedEventId)}
            className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition shrink-0 ml-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      )}

      {/* Halaqah List & Assignments */}
      <div className="space-y-4">
        {loading && halaqahs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
              <span>Memuat data penugasan guru...</span>
            </div>
          </div>
        ) : loadError && halaqahs.length === 0 ? (
          <div className="py-12 text-center bg-rose-50 border border-rose-200 rounded-2xl p-6 space-y-3">
            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-rose-900">Data gagal dimuat</h3>
            <p className="text-xs text-rose-600 max-w-md mx-auto">{loadError}</p>
            <button
              onClick={() => { loadEvents(); loadData(selectedEventId); }}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
          </div>
        ) : halaqahs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
            Belum ada halaqah untuk event ini. Buat halaqah di menu `Halaqah` terlebih dahulu.
          </div>
        ) : (
          halaqahs.map((h) => {
            const assignedHt = assignments.filter(ht => ht.halaqah_id === h.halaqah_id);

            return (
              <div key={h.halaqah_id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        h.gender === 'IKHWAN' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {h.gender}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">{h.halaqah_name}</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">Lokasi: {h.location || 'Masjid'} | Grade: {h.grade_group}</p>
                  </div>

                  <button
                    onClick={() => handleOpenAssignModal(h.halaqah_id)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tugaskan Guru</span>
                  </button>
                </div>

                {/* Assigned Teachers List */}
                <div className="space-y-2">
                  {assignedHt.length === 0 ? (
                    <div className="text-[11px] text-slate-400 italic py-2">
                      Belum ada guru yang ditugaskan di halaqah ini.
                    </div>
                  ) : (
                    assignedHt.map((ht) => {
                      const teacher = teachers.find(t => t.teacher_id === ht.teacher_id);
                      return (
                        <div key={ht.assignment_id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                              {teacher?.short_name?.substring(0, 2) || 'Ust'}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900">{teacher?.full_name || 'Guru Tahfidz'}</p>
                              <p className="text-[10px] text-slate-500">{teacher?.email} | {teacher?.phone}</p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              ht.teacher_role === 'PRIMARY'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : ht.teacher_role === 'ASSISTANT'
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}>
                              {ht.teacher_role}
                            </span>

                            <button
                              onClick={() => handleClickDelete(ht)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                              title="Hapus Penugasan"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {assignmentToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Hapus Penugasan Guru?</span>
              </h3>
              <button
                disabled={isDeleting}
                onClick={() => setAssignmentToDelete(null)}
                className="text-slate-400 hover:text-white disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                  Hapus penugasan{' '}
                  <span className="font-bold text-slate-900">
                    {teachers.find(t => t.teacher_id === assignmentToDelete.teacher_id)?.full_name || 'Guru'}
                  </span>{' '}
                  dari{' '}
                  <span className="font-bold text-slate-900">
                    {halaqahs.find(h => h.halaqah_id === assignmentToDelete.halaqah_id)?.halaqah_name || 'Halaqah'}
                  </span>?
                </p>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-normal">
                    Tindakan ini hanya menghapus penugasan guru dari halaqah. Data Master Guru tidak akan dihapus.
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setAssignmentToDelete(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl disabled:opacity-40"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:bg-rose-300 rounded-xl shadow-md flex items-center space-x-1.5"
                >
                  {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isDeleting ? 'Menghapus...' : 'Hapus Penugasan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Teacher Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Tugaskan Guru ke Halaqah</span>
              </h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Guru Tahfidz</label>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {teachers.map((t) => (
                    <option key={t.teacher_id} value={t.teacher_id}>
                      {t.full_name} ({t.gender})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Peran Guru Dalam Halaqah</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as TeacherRole)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="PRIMARY">PRIMARY (Guru Utama Penilai)</option>
                  <option value="ASSISTANT">ASSISTANT (Guru Pendamping)</option>
                  <option value="SUBSTITUTE">SUBSTITUTE (Guru Pengganti/Badal)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 rounded-xl shadow-md flex items-center space-x-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submitting ? 'Menyimpan...' : 'Simpan Penugasan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
