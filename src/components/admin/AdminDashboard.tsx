import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/api';
import {
  Users, Calendar, CheckCircle2, AlertTriangle, Layers,
  Activity, ArrowRight, ShieldCheck, Download
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab }) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await ApiService.getAdminOverview();
      setData(res);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load admin overview:', err);
      setError(err.message || 'Gagal memuat ringkasan command center operasional.');
    } finally {
      setLoading(false);
    }
  };

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

  if (loading && !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 font-medium">Memuat Command Center Operasional...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-rose-50 border border-rose-200 rounded-2xl p-6 space-y-3 shadow-sm">
          <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-rose-900">Data gagal dimuat</h3>
          <p className="text-xs text-rose-600">{error}</p>
          <button
            onClick={loadData}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      </div>
    );
  }

  const { metrics, activeEvent, teachersProgress, anomalies } = data;

  return (
    <div className="max-w-7xl mx-auto px-2.5 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-6 sm:space-y-8 animate-in fade-in w-full min-w-0 box-border">
      
      {/* Title Card - Professional Polish Theme */}
      <div className="bg-slate-900 text-white p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl border border-slate-800 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4 sm:gap-6 border-l-4 border-l-blue-500 w-full min-w-0">
        <div className="space-y-1.5 w-full min-w-0 max-w-full flex-1">
          <div className="inline-flex items-center space-x-2 bg-slate-800 px-2.5 py-0.5 sm:py-1 rounded-md text-[11px] sm:text-xs text-blue-400 font-semibold border border-slate-700">
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Command Center Operational Dashboard</span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white line-clamp-2 break-normal">
            {activeEvent?.event_name || 'Event Tahfidz'} ({activeEvent?.academic_year || '2025/2026'})
          </h1>
          <p className="text-xs md:text-sm text-slate-400 break-normal">
            Pemantauan aktivitas real-time, kelengkapan input nilai guru, dan deteksi anomali operasional.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full xl:w-auto xl:justify-end shrink-0">
          <button
            onClick={() => onNavigateTab('student-mgmt')}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg shadow-xs transition"
          >
            Master Siswa
          </button>
          <button
            onClick={() => onNavigateTab('halaqah-mgmt')}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg shadow-xs transition"
          >
            Halaqah
          </button>
          <button
            onClick={() => onNavigateTab('teacher-assignment')}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg shadow-xs transition"
          >
            Penugasan Guru
          </button>
          <button
            onClick={() => onNavigateTab('assignments-mgmt')}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg shadow-xs transition"
          >
            Penempatan Siswa
          </button>
          <button
            onClick={() => onNavigateTab('completeness-checker')}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg shadow-xs transition"
          >
            Completeness
          </button>
          <button
            onClick={() => onNavigateTab('analytics')}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg shadow-xs transition"
          >
            Analytics
          </button>
          <button
            onClick={() => onNavigateTab('event-mgmt')}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition flex items-center space-x-1.5 sm:space-x-2"
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Konfigurasi Event</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Metric Cards - Professional Polish & Responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 w-full">
        
        {/* Total Siswa Terdaftar */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3 sm:space-x-4 min-w-0 w-full">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">Total Siswa</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight truncate">{metrics.totalStudents}</p>
            <p className="text-[10px] sm:text-[11px] text-blue-600 font-semibold mt-0.5 truncate">Peserta Terdaftar</p>
          </div>
        </div>

        {/* Total Kelompok Halaqah */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3 sm:space-x-4 min-w-0 w-full">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">Kelompok Halaqah</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight truncate">{metrics.totalHalaqahs}</p>
            <p className="text-[10px] sm:text-[11px] text-blue-600 font-semibold mt-0.5 truncate">Guru Pengampu</p>
          </div>
        </div>

        {/* Progress Input Nilai */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3 sm:space-x-4 border-l-4 border-l-emerald-500 min-w-0 w-full">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">Laju Input Nilai</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight truncate">{metrics.inputCompletionRate}%</p>
            <p className="text-[10px] sm:text-[11px] text-emerald-600 font-semibold mt-0.5 truncate">Assessment Sesi</p>
          </div>
        </div>

        {/* Anomali / Alert Warning */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3 sm:space-x-4 border-l-4 border-l-amber-400 min-w-0 w-full">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">Anomali Sesi</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight truncate">{anomalies?.length || 0}</p>
            <p className="text-[10px] sm:text-[11px] text-amber-600 font-semibold mt-0.5 truncate">Perlu Review</p>
          </div>
        </div>

      </div>

      {/* Operational Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 w-full min-w-0">
        
        {/* Guru Input Progress List */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-4 sm:p-6 space-y-4 min-w-0 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2 min-w-0">
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm uppercase text-slate-800 truncate">Progres Kelengkapan Input Nilai Per Guru</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">Pantau kelompok yang sudah atau belum menyelesaikan penilaian sesi</p>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded border border-blue-200 shrink-0 self-start sm:self-auto">
              Live Monitor
            </span>
          </div>

          <div className="space-y-3">
            {teachersProgress.map((tp: any, idx: number) => (
              <div key={idx} className="p-3.5 sm:p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-2 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 min-w-0">
                  <div className="min-w-0 truncate">
                    <span className="text-xs font-bold text-slate-900">{tp.teacherName}</span>
                    <span className="text-[10px] text-slate-500 font-mono ml-2">({tp.groupName})</span>
                  </div>
                  <span className="text-xs font-bold text-slate-700 shrink-0">{tp.completedSessions} / {tp.totalSessions} Sesi ({tp.percentage}%)</span>
                </div>

                <div className="w-full bg-slate-200 h-2 rounded overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded transition-all duration-500"
                    style={{ width: `${tp.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Anomalies and Quick Audits */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-4 min-w-0 w-full">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-bold text-xs sm:text-sm uppercase text-slate-800">Deteksi Anomali Data</h3>
            <p className="text-[11px] sm:text-xs text-slate-500">Log ketidaksesuaian input baris atau ketidakhadiran berulang</p>
          </div>

          {anomalies && anomalies.length > 0 ? (
            <div className="space-y-3">
              {anomalies.map((an: any, idx: number) => (
                <div key={idx} className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1 border-l-4 border-l-amber-400 min-w-0">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900 gap-2">
                    <span className="truncate">{an.studentName}</span>
                    <span className="text-[10px] font-mono text-amber-800 shrink-0">Sesi {an.sessionNo}</span>
                  </div>
                  <p className="text-xs text-amber-800 break-normal">{an.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic p-4 text-center bg-slate-50 rounded-lg">Tidak ada anomali input yang terdeteksi.</p>
          )}

          <div className="pt-2">
            <button
              onClick={() => onNavigateTab('event-mgmt')}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-2"
            >
              <span>Kelola Setting System</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
