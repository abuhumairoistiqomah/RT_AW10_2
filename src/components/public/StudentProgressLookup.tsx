import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/api';
import { Search, ShieldAlert, CheckCircle2, XCircle, BookOpen, Clock, RefreshCw, LogOut, UserCheck } from 'lucide-react';

/**
 * PRODUCTION SECURITY NOTE:
 * The current prototype stores the raw student access code in localStorage for client-side persistence (key: 'rt_parent_last_student').
 * In a production environment with a Google Apps Script (GAS) or custom backend,
 * the client should NOT persist raw access credentials or student access codes directly in browser localStorage.
 *
 * Recommended Production Flow:
 * 1. Parent inputs Access Code -> Verification request sent to backend.
 * 2. Backend verifies Access Code & issues an opaque, cryptographically signed "Remember Token".
 * 3. Browser stores token (e.g. HTTP-only cookie or local storage token).
 * 4. Subsequent visits authenticate using token -> backend resolves student progress without exposing raw access code.
 */

const STORAGE_KEY = 'rt_parent_last_student';

export const StudentProgressLookup: React.FC = () => {
  const [accessCode, setAccessCode] = useState<string>('');
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [searched, setSearched] = useState<boolean>(false);

  // Auto-detect remembered student access on mount
  useEffect(() => {
    const savedCode = localStorage.getItem(STORAGE_KEY);
    if (savedCode && savedCode.trim()) {
      const cleanCode = savedCode.trim();
      setAccessCode(cleanCode);
      autoLoadStudent(cleanCode);
    }
  }, []);

  const autoLoadStudent = async (code: string) => {
    setLoading(true);
    try {
      const res = await ApiService.getStudentPublicProgress(code);
      if (res && res.success) {
        setResult(res);
        setSearched(true);
      } else {
        // Clear invalid remembered record safely
        localStorage.removeItem(STORAGE_KEY);
        setResult(null);
        setSearched(false);
        setAccessCode('');
      }
    } catch (err) {
      localStorage.removeItem(STORAGE_KEY);
      setResult({ success: false, message: 'Gagal menghubungkan ke layanan data.' });
      setSearched(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) return;

    const trimmedCode = accessCode.trim();
    setLoading(true);
    setSearched(true);

    try {
      const res = await ApiService.getStudentPublicProgress(trimmedCode);
      setResult(res);
      if (res && res.success) {
        // Remember verified student code
        localStorage.setItem(STORAGE_KEY, trimmedCode);
      } else {
        // Clear invalid record if previous existed
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      setResult({ success: false, message: 'Gagal menghubungkan ke layanan data.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchStudent = () => {
    // Allows parent to enter another access code without deleting saved student until new one verified
    setSearched(false);
    setResult(null);
    setAccessCode('');
  };

  const handleForgetDevice = () => {
    // Remove remembered local browser credential and return to access-code entry
    localStorage.removeItem(STORAGE_KEY);
    setResult(null);
    setSearched(false);
    setAccessCode('');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-in fade-in">
      
      {/* Header card */}
      <div className="bg-white p-6 md:p-8 rounded border border-slate-200 shadow-sm text-center space-y-3">
        <div className="w-12 h-12 rounded bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
          <BookOpen className="w-6 h-6" />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">Cek Perkembangan Hafalan Siswa</h2>
        <p className="text-xs md:text-sm text-slate-500 max-w-xl mx-auto">
          Masukkan <strong>Kode Akses Siswa</strong> resmi yang diberikan oleh sekolah untuk melihat catatan hafalan per sesi.
        </p>

        {/* Lookup form */}
        {(!searched || !result?.success) && (
          <form onSubmit={handleSearch} className="max-w-md mx-auto mt-4 flex items-center space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Masukkan Kode Akses (mis: RT-K7M4Q9)..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs md:text-sm rounded shadow-sm transition disabled:opacity-50 shrink-0"
            >
              {loading ? 'Mencari...' : 'Cari Data'}
            </button>
          </form>
        )}

        {!searched && (
          <div className="text-[11px] text-slate-600 bg-slate-100 inline-block px-3 py-1 rounded border border-slate-200 font-medium mt-2">
            Contoh Kode Akses Percobaan: <span className="font-mono font-bold text-slate-900">RT-K7M4Q9</span> atau <span className="font-mono font-bold text-slate-900">RT-W8P2X5</span>
          </div>
        )}
      </div>

      {/* Results view */}
      {searched && (
        <>
          {result && result.success ? (
            <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden space-y-6 p-6 md:p-8 animate-in slide-in-from-bottom-2">
              
              {/* Remembered Student Banner & Device Controls */}
              <div className="bg-slate-50 border border-slate-200 rounded p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2 text-slate-700 font-medium">
                  <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Siswa ini tersimpan di perangkat ini. Anda tidak perlu memasukkan kode akses kembali saat berkunjung berikutnya.</span>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={handleSwitchStudent}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded text-xs transition flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Ganti Siswa</span>
                  </button>
                  <button
                    onClick={handleForgetDevice}
                    className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold rounded text-xs transition flex items-center space-x-1"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-600" />
                    <span>Lupakan Siswa di Perangkat Ini</span>
                  </button>
                </div>
              </div>

              {/* Student info header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-6 gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xl font-bold text-slate-900">{result.studentName}</h3>
                    <span className="bg-blue-50 text-blue-700 text-[11px] font-bold px-2.5 py-0.5 rounded border border-blue-200">
                      {result.gradeClass}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-mono">NIS: {result.nis} &bull; {result.eventName}</p>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Status Capaian:</span>
                  {result.completionStatus === 'COMPLETE' ? (
                    <span className="inline-flex items-center space-x-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded text-xs font-bold border border-emerald-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Tuntas</span>
                    </span>
                  ) : result.completionStatus === 'NOT_EVALUATED' ? (
                    <span className="inline-flex items-center space-x-1.5 bg-slate-100 text-slate-700 px-3 py-1 rounded text-xs font-bold border border-slate-300">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span>Belum Dievaluasi</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded text-xs font-bold border border-amber-200">
                      <XCircle className="w-4 h-4 text-amber-600" />
                      <span>Belum Tuntas</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Baseline & Target Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Baseline */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Batas Capaian Awal (Baseline)</span>
                  <p className="text-sm font-bold text-slate-900">{result.baselineText}</p>
                  <p className="text-xs text-slate-500">Capaian sebelum pelaksanaan Rumah Tahfidz</p>
                </div>

                {/* Target */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded space-y-1 border-l-4 border-l-blue-500">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Target Hafalan Acara</span>
                  <p className="text-sm font-bold text-slate-900">{result.targetText}</p>
                  <p className="text-xs text-blue-600 font-semibold">Target penambahan: {result.targetLines != null ? `${result.targetLines} baris` : 'Belum tersedia'}</p>
                </div>

              </div>

              {/* Session-by-Session Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="font-bold text-xs uppercase text-slate-700 flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Catatan Capaian Per Sesi Hafalan</span>
                  </h4>
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
                    Total Penambahan: <strong>{result.totalLinesAdded} Baris</strong>
                  </span>
                </div>

                {result.sessions && result.sessions.length > 0 ? (
                  <div className="overflow-x-auto rounded border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-medium text-[10px] uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Sesi Ke</th>
                          <th className="py-3 px-4">Kehadiran</th>
                          <th className="py-3 px-4">Surah & Ayat Setoran</th>
                          <th className="py-3 px-4 text-right">Penambahan Baris</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.sessions.map((s: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900">Sesi {s.sessionNo}</td>
                            <td className="py-3 px-4">
                              {s.attendance === 'PRESENT' ? (
                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200">Hadir</span>
                              ) : (
                                <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-200">{s.attendance}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-800">
                              {s.attendance === 'PRESENT' ? (
                                s.assessment_mode === 'IQRA' || s.iqra_level != null ? (
                                  `Iqra ${s.iqra_level || 1} (Hal. ${s.iqra_page_start || 1}${s.iqra_page_end && s.iqra_page_end !== s.iqra_page_start ? `–${s.iqra_page_end}` : ''})`
                                ) : s.surahName ? (
                                  `${s.surahName} (Ayat ${s.ayahRange})`
                                ) : (
                                  '-'
                                )
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-blue-600">
                              {s.attendance === 'PRESENT' ? (
                                s.assessment_mode === 'IQRA' || s.iqra_level != null ? (
                                  <span className="text-slate-400 font-normal text-xs">Iqra</span>
                                ) : s.linesAdded != null ? (
                                  `+${s.linesAdded} baris`
                                ) : (
                                  '-'
                                )
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic p-4 text-center bg-slate-50 rounded">Belum ada sesi hafalan yang tercatat untuk siswa ini.</p>
                )}
              </div>

              <div className="text-[11px] text-slate-400 text-center border-t border-slate-100 pt-4">
                Halaman ini menampilkan progres belajar hafalan siswa untuk orang tua/wali. Skor evaluasi internal guru dilindungi.
              </div>

            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded p-6 text-center space-y-2 border-l-4 border-l-amber-400">
              <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto" />
              <h4 className="font-bold text-amber-900 text-sm">Data Tidak Ditemukan</h4>
              <p className="text-xs text-amber-800">{result?.message || 'Kode akses tidak cocok.'}</p>
              <div className="pt-2">
                <button
                  onClick={handleSwitchStudent}
                  className="px-4 py-2 bg-amber-800 text-white font-bold text-xs rounded hover:bg-amber-900 transition"
                >
                  Coba Kode Akses Lain
                </button>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
};
