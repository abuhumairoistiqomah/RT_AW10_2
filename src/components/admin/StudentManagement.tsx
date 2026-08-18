import React, { useState, useEffect, useMemo } from 'react';
import { Student, Gender, EventParticipant, Event } from '../../types';
import { ApiService } from '../../services/api';
import { generateRandomAccessCode, maskAccessCode } from '../../utils/accessCode';
import { getUniqueClassesSorted } from '../../utils/studentUtils';
import {
  Users, Search, Plus, Filter, Edit2, CheckCircle, XCircle,
  Upload, FileText, Calendar, Shield, UserCheck, RefreshCw, X,
  Eye, EyeOff, Copy, Check, AlertCircle
} from 'lucide-react';

export const StudentManagement: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [genderFilter, setGenderFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<Student | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Student>>({
    student_id: '',
    nis: '',
    full_name: '',
    gender: 'IKHWAN',
    grade_level: '7',
    class_name: '7A',
    access_code: '',
    active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  // Tab Resume listener
  useEffect(() => {
    const handleResume = () => {
      loadData();
    };
    window.addEventListener('rt_app_resumed', handleResume);
    return () => window.removeEventListener('rt_app_resumed', handleResume);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stData, prtData, evtData] = await Promise.all([
        ApiService.getStudents(),
        ApiService.getEventParticipants(),
        ApiService.getEvents()
      ]);
      setStudents(stData || []);
      setParticipants(prtData || []);
      setEvents(evtData || []);
      setLoadError(null);
    } catch (err: any) {
      console.error('Error loading students:', err);
      setLoadError(err.message || 'Gagal memuat data siswa dari server.');
    } finally {
      setLoading(false);
    }
  };

  // Dynamic unique class options sorted naturally (numeric grade first, then class name)
  const availableClasses = useMemo(() => {
    return getUniqueClassesSorted(students);
  }, [students]);

  // Filter logic
  const filteredStudents = students.filter(s => {
    const matchesSearch =
      search.trim() === '' ||
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.nis.toLowerCase().includes(search.toLowerCase()) ||
      s.access_code.toLowerCase().includes(search.toLowerCase()) ||
      s.student_id.toLowerCase().includes(search.toLowerCase());

    const matchesClass = classFilter === 'ALL' || s.class_name === classFilter;
    const matchesGender = genderFilter === 'ALL' || s.gender === genderFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && s.active) ||
      (statusFilter === 'INACTIVE' && !s.active);

    return matchesSearch && matchesClass && matchesGender && matchesStatus;
  });

  // Access Code UI state
  const [visibleCodes, setVisibleCodes] = useState<Record<string, boolean>>({});
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
  const [studentToRegenerate, setStudentToRegenerate] = useState<Student | null>(null);

  const toggleCodeVisibility = (studentId: string) => {
    setVisibleCodes(prev => ({ ...prev, [studentId]: !prev[studentId] }));
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedStudentId(id);
    setTimeout(() => setCopiedStudentId(null), 2000);
  };

  const handleConfirmRegenerate = async () => {
    if (!studentToRegenerate) return;
    await ApiService.regenerateAccessCode(studentToRegenerate.student_id);
    setStudentToRegenerate(null);
    loadData();
  };

  const handleOpenAdd = () => {
    const nextNum = students.length + 1;
    const existingCodes = students.map(s => s.access_code);
    setFormData({
      student_id: `STD${String(nextNum).padStart(6, '0')}`,
      nis: `2025${String(nextNum).padStart(3, '0')}`,
      full_name: '',
      gender: 'IKHWAN',
      grade_level: '7',
      class_name: '7A',
      access_code: generateRandomAccessCode(existingCodes),
      active: true
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setFormData({ ...student });
    setIsEditModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.nis) return;

    const existingCodes = students.map(s => s.access_code);
    const studentToSave: Student = {
      student_id: formData.student_id || `STD${Date.now()}`,
      nis: formData.nis,
      full_name: formData.full_name,
      gender: (formData.gender as Gender) || 'IKHWAN',
      grade_level: formData.grade_level || '7',
      class_name: formData.class_name || '7A',
      access_code: formData.access_code || generateRandomAccessCode(existingCodes),
      active: formData.active !== false,
      created_at: formData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await ApiService.saveStudent(studentToSave);
    setIsAddModalOpen(false);
    setIsEditModalOpen(false);
    loadData();
  };

  const toggleStatus = async (student: Student) => {
    const updated = { ...student, active: !student.active, updated_at: new Date().toISOString() };
    await ApiService.saveStudent(updated);
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800 w-full min-w-0">
        <div className="w-full min-w-0 max-w-full flex-1">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <Users className="w-4 h-4" />
            <span>Master Data Siswa</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1 line-clamp-2 break-normal">Manajemen Siswa</h1>
          <p className="text-slate-400 text-xs mt-1 break-normal">
            Pengelolaan identitas permanen siswa, tingkat kelas, kode akses publik, dan status keaktifan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:justify-end shrink-0">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition border border-slate-700"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Import Bulk CSV</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-900/40"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Siswa Baru</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari Nama, NIS, Kode Akses, atau ID Siswa..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition"
            />
          </div>

          {/* Class Filter */}
          <div>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
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

          {/* Gender Filter */}
          <div>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="ALL">Semua Gender</option>
              <option value="IKHWAN">Ikhwan (Laki-laki)</option>
              <option value="AKHWAT">Akhwat (Perempuan)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Non-Aktif</option>
            </select>
          </div>
        </div>

        {/* Results Counter */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <span>Menampilkan <strong className="text-slate-800">{filteredStudents.length}</strong> dari <strong className="text-slate-800">{students.length}</strong> siswa terdaftar</span>
          <button onClick={loadData} className="flex items-center space-x-1 text-emerald-600 hover:text-emerald-700 font-semibold">
            <RefreshCw className="w-3 h-3" />
            <span>Muat Ulang Data</span>
          </button>
        </div>
      </div>

      {/* Student Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 uppercase tracking-wider font-bold border-b border-slate-200 text-[10px]">
                <th className="p-3">ID Siswa (Permanent)</th>
                <th className="p-3">NIS</th>
                <th className="p-3">Nama Lengkap Siswa</th>
                <th className="p-3">Gender</th>
                <th className="p-3">Kelas</th>
                <th className="p-3">Kode Akses Publik</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && students.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                      <span>Memuat data siswa...</span>
                    </div>
                  </td>
                </tr>
              ) : loadError && students.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center bg-rose-50/50">
                    <div className="max-w-md mx-auto space-y-3">
                      <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                      <div className="text-sm font-bold text-rose-900">Data gagal dimuat</div>
                      <p className="text-xs text-rose-600">{loadError}</p>
                      <button
                        onClick={loadData}
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
                    Tidak ditemukan siswa dengan kriteria filter tersebut.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => {
                  const studentEvents = participants.filter(p => p.student_id === s.student_id);
                  return (
                    <tr key={s.student_id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-[11px] font-bold text-slate-600">
                        {s.student_id}
                      </td>
                      <td className="p-3 font-medium text-slate-800">
                        {s.nis}
                      </td>
                      <td className="p-3 font-bold text-slate-900">
                        <div className="flex items-center space-x-2">
                          <span>{s.full_name}</span>
                          {studentEvents.length > 0 && (
                            <button
                              onClick={() => setSelectedStudentForHistory(s)}
                              className="text-[9px] bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-800 font-semibold px-1.5 py-0.5 rounded border border-slate-200"
                            >
                              {studentEvents.length} Event RT
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          s.gender === 'IKHWAN'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {s.gender}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-700">
                        {s.grade_level} ({s.class_name})
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {visibleCodes[s.student_id] ? s.access_code : maskAccessCode(s.access_code)}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleCodeVisibility(s.student_id)}
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                            title={visibleCodes[s.student_id] ? 'Sembunyikan Kode' : 'Lihat Kode Akses'}
                          >
                            {visibleCodes[s.student_id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(s.access_code, s.student_id)}
                            className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition"
                            title="Salin Kode Akses"
                          >
                            {copiedStudentId === s.student_id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStudentToRegenerate(s)}
                            className="p-1 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded transition"
                            title="Regenerate Kode Akses (Buat Ulang)"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleStatus(s)}
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold transition ${
                            s.active
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {s.active ? <CheckCircle className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-slate-400" />}
                          <span>{s.active ? 'Aktif' : 'Non-Aktif'}</span>
                        </button>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="p-1 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition"
                          title="Edit Siswa"
                        >
                          <Edit2 className="w-4 h-4" />
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

      {/* Add / Edit Student Modal */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>{isAddModalOpen ? 'Tambah Siswa Baru' : 'Edit Identitas Siswa'}</span>
              </h3>
              <button
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ID Siswa (Permanent)</label>
                  <input
                    type="text"
                    disabled
                    value={formData.student_id || ''}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">NIS (Nomor Induk Siswa)</label>
                  <input
                    type="text"
                    required
                    value={formData.nis || ''}
                    onChange={(e) => setFormData({ ...formData, nis: e.target.value })}
                    placeholder="mis: 2025019"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap Siswa</label>
                <input
                  type="text"
                  required
                  value={formData.full_name || ''}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Nama sesuai akta lahir..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                  <select
                    value={formData.gender || 'IKHWAN'}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="IKHWAN">IKHWAN</option>
                    <option value="AKHWAT">AKHWAT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tingkat Kelas</label>
                  <select
                    value={formData.grade_level || '7'}
                    onChange={(e) => setFormData({ ...formData, grade_level: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rombel Kelas</label>
                  <input
                    type="text"
                    value={formData.class_name || ''}
                    onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                    placeholder="mis: 7A"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kode Akses Publik Wali/Siswa</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={formData.access_code || ''}
                    onChange={(e) => setFormData({ ...formData, access_code: e.target.value })}
                    placeholder="mis: RT-K7M4Q9"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, access_code: generateRandomAccessCode(students.map(s => s.access_code)) })}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center space-x-1 shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Acak Kode</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Digunakan wali siswa untuk mengecek capaian di halaman publik secara aman.</p>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={formData.active !== false}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="activeCheck" className="text-xs font-medium text-slate-700">Status Siswa Aktif</label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-lg shadow-emerald-900/30"
                >
                  Simpan Siswa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Placeholder Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Bulk Import Data Siswa (CSV / Excel)</span>
              </h3>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center bg-slate-50 hover:bg-slate-100/80 transition cursor-pointer">
                <FileText className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-800">Tarik dan lepas file CSV / Excel di sini</p>
                <p className="text-[11px] text-slate-500 mt-1">Format kolom: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">nis, full_name, gender, grade_level, class_name</code></p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800">
                <p className="font-bold">Informasi Penomoran ID Permanent:</p>
                <p className="text-[11px] mt-0.5">Sistem akan secara otomatis menetapkan <code className="font-bold">student_id</code> unik permanen untuk setiap baris siswa baru.</p>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Tutup
                </button>
                <button
                  onClick={() => {
                    alert('Placeholder Import CSV: Siap menerima skema data siswa.');
                    setIsImportModalOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md"
                >
                  Proses Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Participation Modal */}
      {selectedStudentForHistory && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>Riwayat Keikutsertaan Event - {selectedStudentForHistory.full_name}</span>
              </h3>
              <button onClick={() => setSelectedStudentForHistory(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {participants
                .filter(p => p.student_id === selectedStudentForHistory.student_id)
                .map((p) => {
                  const evt = events.find(e => e.event_id === p.event_id);
                  return (
                    <div key={p.participant_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">{evt?.event_name || p.event_id}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          {p.participant_status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Kelas Snapshot: <strong>{p.grade_snapshot} ({p.class_snapshot})</strong> | Skill Awal: <strong>{p.skill_status_start}</strong>
                      </p>
                      <p className="text-[11px] text-emerald-800 font-medium">
                        Target: {p.target_lines} Baris ({p.target_note})
                      </p>
                    </div>
                  );
                })}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSelectedStudentForHistory(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Regenerate Access Code Confirmation Modal */}
      {studentToRegenerate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center space-x-3 text-amber-600">
              <RefreshCw className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-slate-900 text-sm">Buat Ulang (Regenerate) Kode Akses?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin membuat ulang Kode Akses Publik untuk <strong>{studentToRegenerate.full_name}</strong>?
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
              Kode lama (<code className="font-mono font-bold">{studentToRegenerate.access_code}</code>) tidak akan dapat digunakan lagi oleh orang tua/wali siswa.
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setStudentToRegenerate(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmRegenerate}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl shadow-md transition"
              >
                Ya, Buat Kode Baru
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
