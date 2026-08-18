import React, { useState, useEffect } from 'react';
import { Halaqah, Event, EventParticipant, HalaqahTeacher, Gender, SessionGroup, Teacher } from '../../types';
import { ApiService } from '../../services/api';
import {
  Users, MapPin, Plus, Edit2, CheckCircle, XCircle,
  Sparkles, Layers, RefreshCw, X, Shield, Calendar, Clock,
  Loader2, Target, BookOpen, UserCheck
} from 'lucide-react';

export const HalaqahManagement: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('RT2026-02');
  const [halaqahs, setHalaqahs] = useState<Halaqah[]>([]);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [halaqahTeachers, setHalaqahTeachers] = useState<HalaqahTeacher[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Modals
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState<boolean>(false);
  const [isSmartModalOpen, setIsSmartModalOpen] = useState<boolean>(false);
  const [editingHalaqah, setEditingHalaqah] = useState<Halaqah | null>(null);

  // Form
  const [formData, setFormData] = useState<Partial<Halaqah>>({
    halaqah_id: '',
    event_id: 'RT2026-02',
    halaqah_name: '',
    gender: 'IKHWAN',
    grade_group: 'Kelas 7',
    session_group_id: '',
    location: '',
    target_ziyadah_lines: undefined,
    target_iqra_pages: undefined,
    active: true,
    notes: ''
  });

  // Smart Distribution Proposal State
  const [smartConfig, setSmartConfig] = useState({
    maxGroupSize: 8,
    balanceGender: true,
    balanceSkill: true
  });
  const [smartProposal, setSmartProposal] = useState<any>(null);

  // Memoized teacher lookup map for O(1) resolution from 04_MASTER_TEACHERS
  const teacherMap = React.useMemo(() => {
    return Object.fromEntries(
      teachers.map(t => [t.teacher_id, t])
    );
  }, [teachers]);

  useEffect(() => {
    loadEvents();
  }, []);

  // Listen for tab resume event to re-fetch in background safely
  useEffect(() => {
    const handleResume = () => {
      if (selectedEventId) {
        loadHalaqahData(selectedEventId);
      }
    };
    window.addEventListener('rt_app_resumed', handleResume);
    return () => window.removeEventListener('rt_app_resumed', handleResume);
  }, [selectedEventId]);

  useEffect(() => {
    if (selectedEventId) {
      loadHalaqahData(selectedEventId);
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
      console.warn('Gagal memuat events:', err);
    }
  };

  const loadHalaqahData = async (eventId: string) => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [hList, pList, htList, sgList, tList] = await Promise.all([
        ApiService.getHalaqahList(eventId),
        ApiService.getEventParticipants(eventId),
        ApiService.getHalaqahTeachers(eventId),
        ApiService.getSessionGroups(eventId),
        ApiService.getTeachers()
      ]);
      setHalaqahs(hList || []);
      setParticipants(pList || []);
      setHalaqahTeachers(htList || []);
      setSessionGroups(sgList || []);
      setTeachers(tList || []);
      setLoadError(null);
    } catch (err: any) {
      console.error('Error loading halaqah data:', err);
      setLoadError(err.message || 'Gagal memuat data halaqah dari server.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    const nextNum = halaqahs.length + 1;
    const defaultSessionGroupId = sessionGroups.length > 0 ? sessionGroups[0].session_group_id : '';
    setEditingHalaqah(null);
    setFormData({
      halaqah_id: `H${selectedEventId.replace('-', '')}-${String(nextNum).padStart(3, '0')}`,
      event_id: selectedEventId,
      halaqah_name: `Halaqah ${String(nextNum).padStart(2, '0')}`,
      gender: 'IKHWAN',
      grade_group: '',
      session_group_id: defaultSessionGroupId,
      location: '',
      target_ziyadah_lines: undefined,
      target_iqra_pages: undefined,
      active: true,
      notes: ''
    });
    setIsAddEditModalOpen(true);
  };

  const handleOpenEdit = (h: Halaqah) => {
    setEditingHalaqah(h);
    setFormData({ ...h });
    setIsAddEditModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.halaqah_name || isSaving) return;

    setIsSaving(true);
    try {
      const halaqahToSave: Halaqah = {
        halaqah_id: formData.halaqah_id || `HLQ-${Date.now()}`,
        event_id: selectedEventId,
        halaqah_name: formData.halaqah_name,
        gender: (formData.gender as Gender) || 'IKHWAN',
        grade_group: formData.grade_group || 'Reguler',
        session_group_id: formData.session_group_id || (sessionGroups[0]?.session_group_id || ''),
        location: formData.location || 'Masjid',
        target_ziyadah_lines: formData.target_ziyadah_lines != null && formData.target_ziyadah_lines !== '' ? Number(formData.target_ziyadah_lines) : undefined,
        target_iqra_pages: formData.target_iqra_pages != null && formData.target_iqra_pages !== '' ? Number(formData.target_iqra_pages) : undefined,
        active: formData.active !== false,
        notes: formData.notes || '',
        created_at: formData.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await ApiService.saveHalaqah(halaqahToSave);
      setIsAddEditModalOpen(false);
      await loadHalaqahData(selectedEventId);
    } catch (err) {
      console.error('Error saving halaqah:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateSmartProposal = async () => {
    const proposal = await ApiService.generateSmartHalaqahProposal(selectedEventId, smartConfig);
    setSmartProposal(proposal);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800 w-full min-w-0">
        <div className="w-full min-w-0 max-w-full flex-1">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <Layers className="w-4 h-4" />
            <span>Manajemen Grup & Lokasi</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1 line-clamp-2 break-normal">Manajemen Halaqah</h1>
          <p className="text-slate-400 text-xs mt-1 break-normal">
            Pengelolaan kelompok halaqah, pemisahan gender, penugasan kelompok jadwal sesi, lokasi tasmik, dan pembagian smart proposal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:justify-end shrink-0">
          <button
            onClick={() => {
              setIsSmartModalOpen(true);
              handleGenerateSmartProposal();
            }}
            className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950/40 border border-emerald-500/30"
          >
            <Sparkles className="w-4 h-4 text-emerald-200 animate-pulse" />
            <span>Proposal Distribution Smart</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-900/40"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Halaqah</span>
          </button>
        </div>
      </div>

      {/* Error Alert Banner when data exists but revalidation failed */}
      {loadError && halaqahs.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex items-center justify-between text-xs font-medium shadow-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold">⚠ Gagal sinkronisasi data:</span>
            <span>{loadError}. Menampilkan data cache lokal.</span>
          </div>
          <button
            onClick={() => loadHalaqahData(selectedEventId)}
            className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition shrink-0 ml-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      )}

      {/* Event Selector Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Calendar className="w-4 h-4 text-slate-500" />
          <label className="text-xs font-bold text-slate-700">Pilih Event Rumah Tahfidz:</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="py-1.5 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
          >
            {events.map((e) => (
              <option key={e.event_id} value={e.event_id}>
                {e.event_name} ({e.academic_year}) - [{e.status}]
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-3 text-xs text-slate-500">
          <button
            onClick={() => { loadEvents(); loadHalaqahData(selectedEventId); }}
            className="flex items-center space-x-1 text-emerald-600 hover:text-emerald-700 font-bold"
            title="Refresh data halaqah"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <span>•</span>
          <div>
            Total Halaqah: <strong className="text-slate-900 font-bold">{loading && halaqahs.length === 0 ? '...' : halaqahs.length}</strong>
          </div>
        </div>
      </div>

      {/* Halaqah Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && halaqahs.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-600 mb-2" />
            <span>Memuat data halaqah...</span>
          </div>
        ) : loadError && halaqahs.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-rose-50 border border-rose-200 rounded-2xl p-6 space-y-3">
            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-rose-900">Data gagal dimuat</h3>
            <p className="text-xs text-rose-600 max-w-md mx-auto">{loadError}</p>
            <button
              onClick={() => { loadEvents(); loadHalaqahData(selectedEventId); }}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
          </div>
        ) : halaqahs.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
            Belum ada halaqah yang dibuat untuk event ini. Klik tombol `Tambah Halaqah`.
          </div>
        ) : (
          halaqahs.map((h) => {
            const hStudents = participants.filter(p => p.halaqah_id === h.halaqah_id);
            const hTeachers = halaqahTeachers.filter(ht => ht.halaqah_id === h.halaqah_id);
            const sessionGroup = sessionGroups.find(sg => sg.session_group_id === h.session_group_id);

            return (
              <div
                key={h.halaqah_id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition space-y-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold mb-1 ${
                        h.gender === 'IKHWAN'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {h.gender}
                      </span>
                      <h3 className="text-base font-bold text-slate-900">{h.halaqah_name}</h3>
                    </div>

                    <button
                      onClick={() => handleOpenEdit(h)}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition"
                      title="Edit Halaqah"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Lokasi: <strong>{h.location || 'Belum diatur'}</strong></span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Grup Kelas: <strong>{h.grade_group}</strong></span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-blue-700 bg-blue-50/70 px-2 py-1 rounded-lg border border-blue-100">
                      <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Jadwal Sesi: <strong>{sessionGroup?.group_name || h.session_group_id || 'Belum diatur'}</strong></span>
                    </div>
                    {(h.target_ziyadah_lines != null || h.target_iqra_pages != null) && (
                      <div className="flex items-center space-x-1.5 text-emerald-800 bg-emerald-50/70 px-2 py-1 rounded-lg border border-emerald-200 text-[11px]">
                        <Target className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          Target Default: {h.target_ziyadah_lines ? `${h.target_ziyadah_lines} Baris Ziyadah` : ''}
                          {h.target_ziyadah_lines && h.target_iqra_pages ? ' | ' : ''}
                          {h.target_iqra_pages ? `${h.target_iqra_pages} Halaman Iqra` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Metrics */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-center">
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Siswa</span>
                    <span className="text-lg font-black text-slate-800">{hStudents.length}</span>
                  </div>
                  <div className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 block">Guru Tahfidz</span>
                    <span className="text-lg font-black text-emerald-900">{hTeachers.length}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Modal */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>{editingHalaqah ? 'Edit Halaqah' : 'Tambah Halaqah Baru'}</span>
              </h3>
              <button
                disabled={isSaving}
                onClick={() => setIsAddEditModalOpen(false)}
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Halaqah</label>
                <input
                  type="text"
                  required
                  disabled={isSaving}
                  value={formData.halaqah_name || ''}
                  onChange={(e) => setFormData({ ...formData, halaqah_name: e.target.value })}
                  placeholder="mis: Halaqah 05 (Ikhwan Kelas 7)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                  <select
                    disabled={isSaving}
                    value={formData.gender || 'IKHWAN'}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-60"
                  >
                    <option value="IKHWAN">IKHWAN</option>
                    <option value="AKHWAT">AKHWAT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Grup Tingkat Kelas</label>
                  <input
                    type="text"
                    disabled={isSaving}
                    value={formData.grade_group || ''}
                    onChange={(e) => setFormData({ ...formData, grade_group: e.target.value })}
                    placeholder="mis: Kelas 7 & 8"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kelompok Jadwal Sesi (08_SESSION_GROUPS)
                </label>
                <select
                  disabled={isSaving}
                  value={formData.session_group_id || ''}
                  onChange={(e) => setFormData({ ...formData, session_group_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-60"
                >
                  {sessionGroups.length === 0 ? (
                    <option value="">(Belum Ada Kelompok Jadwal - Tambah di Manajemen Event)</option>
                  ) : (
                    sessionGroups.map(sg => (
                      <option key={sg.session_group_id} value={sg.session_group_id}>
                        {sg.group_name} {sg.active === false ? '(Non-aktif)' : ''}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Jadwal sesi dan jam setoran yang akan muncul pada form penilaian guru halaqah ini.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lokasi Tasmik / Halaqah</label>
                <input
                  type="text"
                  disabled={isSaving}
                  value={formData.location || ''}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="mis: Masjid Utama Lantai 1"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-60"
                />
              </div>

              {/* TARGET KEGIATAN SECTION */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center space-x-2 text-emerald-900 font-bold text-xs">
                  <Target className="w-4 h-4 text-emerald-600" />
                  <span>TARGET KEGIATAN</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Target default per halaqah. Otomatis diterapkan untuk siswa baru yang ditugaskan ke halaqah ini sesuai status BBL/Iqra mereka.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Target Ziyadah (Baris)
                    </label>
                    <input
                      type="number"
                      min={0}
                      disabled={isSaving}
                      value={formData.target_ziyadah_lines ?? ''}
                      onChange={(e) => setFormData({ ...formData, target_ziyadah_lines: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="Contoh: 15"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-60"
                    />
                    <span className="text-[10px] text-slate-500 block mt-0.5">Untuk siswa BBL/BBLS</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Target Iqra (Halaman)
                    </label>
                    <input
                      type="number"
                      min={0}
                      disabled={isSaving}
                      value={formData.target_iqra_pages ?? ''}
                      onChange={(e) => setFormData({ ...formData, target_iqra_pages: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="Contoh: 2"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-60"
                    />
                    <span className="text-[10px] text-slate-500 block mt-0.5">Untuk siswa NON_BBL</span>
                  </div>
                </div>
              </div>

              {/* PENGAMPU HALAQAH SECTION */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center space-x-2 text-slate-800 font-bold text-xs">
                  <UserCheck className="w-4 h-4 text-slate-600" />
                  <span>PENGAMPU HALAQAH</span>
                </div>
                {editingHalaqah ? (
                  (() => {
                    const assignedTeachers = halaqahTeachers.filter(
                      ht => ht.halaqah_id === editingHalaqah.halaqah_id &&
                      (ht.active === true || String(ht.active).toUpperCase() === 'TRUE')
                    );

                    if (assignedTeachers.length === 0) {
                      return (
                        <p className="text-xs text-slate-500 italic py-1">
                          Belum ada guru pengampu.
                        </p>
                      );
                    }

                    return (
                      <div className="space-y-1.5 pt-1">
                        {assignedTeachers.map((ht) => {
                          const teacher = teacherMap[ht.teacher_id];
                          const fullName = teacher?.full_name || ht.teacher_id;
                          const role = ht.teacher_role || 'PRIMARY';

                          return (
                            <div
                              key={ht.assignment_id || `${ht.halaqah_id}-${ht.teacher_id}`}
                              className="flex items-center justify-between text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-xs"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-bold text-slate-800 block truncate">
                                  {fullName}
                                </span>
                                {teacher?.full_name && (
                                  <span className="text-[10px] text-slate-400 font-mono block">
                                    {ht.teacher_id}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`shrink-0 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                                  role === 'PRIMARY'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : role === 'ASSISTANT'
                                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                    : role === 'SUBSTITUTE'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-slate-100 text-slate-800 border border-slate-300'
                                }`}
                              >
                                {role}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-xs text-slate-500 italic py-1">
                    Belum ada guru pengampu.
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="hActive"
                  disabled={isSaving}
                  checked={formData.active !== false}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-60"
                />
                <label htmlFor="hActive" className="text-xs font-medium text-slate-700">Halaqah Aktif</label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center space-x-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md disabled:opacity-50 transition"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Halaqah</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart Halaqah Distribution Proposal Preview Modal */}
      {isSmartModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold">Proposal Distribusi Smart Halaqah</h3>
              </div>
              <button onClick={() => setIsSmartModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-emerald-900 text-xs space-y-2">
                <p className="font-bold">Algoritma Distribusi Seimbang Otomatis</p>
                <p className="text-emerald-800 leading-relaxed">
                  Fitur ini menganalisis seluruh peserta aktif pada event ini, memisahkan ikhwan & akhwat, serta menyeimbangkan distribusi tingkat kelancaran bacaan (Skill Status) agar kapasitas tiap halaqah merata.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Maks Siswa / Halaqah</label>
                  <input
                    type="number"
                    min={4}
                    max={15}
                    value={smartConfig.maxGroupSize}
                    onChange={(e) => setSmartConfig({ ...smartConfig, maxGroupSize: Number(e.target.value) })}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold"
                  />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="chkGender"
                    checked={smartConfig.balanceGender}
                    onChange={(e) => setSmartConfig({ ...smartConfig, balanceGender: e.target.checked })}
                    className="rounded text-emerald-600"
                  />
                  <label htmlFor="chkGender" className="text-xs font-bold text-slate-700">Pisah Gender</label>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="chkSkill"
                    checked={smartConfig.balanceSkill}
                    onChange={(e) => setSmartConfig({ ...smartConfig, balanceSkill: e.target.checked })}
                    className="rounded text-emerald-600"
                  />
                  <label htmlFor="chkSkill" className="text-xs font-bold text-slate-700">Ratakan Skill</label>
                </div>
              </div>

              <button
                onClick={handleGenerateSmartProposal}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Kalkulasi Ulang Proposal</span>
              </button>

              {smartProposal && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                    <span className="text-slate-500 font-medium">Total Peserta: <strong>{smartProposal.totalStudents}</strong></span>
                    <span className="text-slate-500 font-medium">Rekomendasi Halaqah: <strong>{smartProposal.totalProposedGroups} Grup</strong></span>
                  </div>

                  <div className="space-y-3">
                    {smartProposal.proposedGroups.map((pg: any) => (
                      <div key={pg.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{pg.name}</span>
                          <span className="px-2 py-0.5 bg-slate-200 rounded font-bold text-[10px]">{pg.studentCount} Siswa</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {pg.students.map((st: any) => (
                            <span key={st.student_id} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-700">
                              {st.name} ({st.skill})
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2 shrink-0">
              <button
                onClick={() => setIsSmartModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
