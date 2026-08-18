import React, { useState, useEffect } from 'react';
import { Event, Student, Halaqah, SkillTransition, SkillStatus } from '../../types';
import { ApiService } from '../../services/api';
import {
  TrendingUp, BarChart2, PieChart, Info, Calendar, Filter, RefreshCw,
  Award, CheckCircle, AlertTriangle, HelpCircle, Users, ArrowRight
} from 'lucide-react';

export const ExecutiveAnalytics: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [halaqahs, setHalaqahs] = useState<Halaqah[]>([]);

  // Filters
  const [academicYearFilter, setAcademicYearFilter] = useState<string>('ALL');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [analyticsMode, setAnalyticsMode] = useState<'SINGLE' | 'ANNUAL' | 'COHORT' | 'SKILL'>('SINGLE');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [genderFilter, setGenderFilter] = useState<string>('ALL');
  const [halaqahFilter, setHalaqahFilter] = useState<string>('ALL');

  // Analytics Data & Loading
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    initData();
  }, []);

  // Tab Resume listener
  useEffect(() => {
    const handleResume = () => {
      loadAnalytics();
    };
    window.addEventListener('rt_app_resumed', handleResume);
    return () => window.removeEventListener('rt_app_resumed', handleResume);
  }, [academicYearFilter, selectedEventId, analyticsMode, gradeFilter, genderFilter, halaqahFilter]);

  const initData = async () => {
    try {
      const [evts, stds] = await Promise.all([
        ApiService.getEvents(),
        ApiService.getStudents()
      ]);
      setEvents(evts || []);
      setStudents(stds || []);

      const active = evts.find(e => e.status === 'ACTIVE') || evts[0];
      if (active) {
        setSelectedEventId(prev => {
          if (prev && evts.some(e => e.event_id === prev)) return prev;
          return active.event_id;
        });
      }
    } catch (err: any) {
      console.warn('Gagal memuat events & students analytics:', err);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadHalaqahs(selectedEventId);
    }
  }, [selectedEventId]);

  const loadHalaqahs = async (evtId: string) => {
    try {
      const hList = await ApiService.getHalaqahList(evtId);
      setHalaqahs(hList || []);
    } catch {
      // transient
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [academicYearFilter, selectedEventId, analyticsMode, gradeFilter, genderFilter, halaqahFilter]);

  const loadAnalytics = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await ApiService.getExecutiveAnalytics({
        academicYearFilter,
        eventId: selectedEventId,
        analyticsMode,
        gradeFilter,
        genderFilter,
        halaqahFilter
      });
      setData(res);
      setLoadError(null);
    } catch (err: any) {
      console.error('Error loading executive analytics:', err);
      setLoadError(err.message || 'Gagal memuat data analitik eksekutif dari server.');
    } finally {
      setLoading(false);
    }
  };

  // Derive dynamic filter lists
  const availableAcademicYears = Array.from(new Set(events.map(e => e.academic_year).filter(Boolean))).sort();
  const availableGrades = Array.from(new Set(students.map(s => s.grade_level).filter(Boolean))).sort();
  
  const filteredEventsForYear = (academicYearFilter && academicYearFilter !== 'ALL')
    ? events.filter(e => e.academic_year === academicYearFilter)
    : events;

  // Box Plot Helper Function
  const scaleBoxVal = (val: number) => {
    if (!data?.stats) return 50;
    const min = data.stats.min || 0;
    const max = data.stats.max || 0;
    if (max === min) return 50;
    const pct = ((val - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-xl border border-slate-800 w-full min-w-0">
        <div className="w-full min-w-0 max-w-full flex-1">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span className="truncate">Eksekutif & Manajemen Pendidikan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1 line-clamp-2 break-normal">Analytics Capaian Tahfidz</h1>
          <p className="text-slate-400 text-xs mt-1 break-normal">
            Evaluasi dampak program, coverage penilaian, distribusi hafalan, box plot outlier, dan analisis cohort continuous.
          </p>
        </div>

        {/* Analytics Mode Tabs */}
        <div className="flex flex-wrap items-center bg-slate-800 p-1.5 rounded-xl border border-slate-700 text-xs font-bold gap-1 w-full xl:w-auto xl:justify-end shrink-0">
          <button
            onClick={() => setAnalyticsMode('SINGLE')}
            className={`px-3 py-2 rounded-lg transition shrink-0 ${
              analyticsMode === 'SINGLE' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white'
            }`}
          >
            Single Event
          </button>
          <button
            onClick={() => setAnalyticsMode('ANNUAL')}
            className={`px-3 py-2 rounded-lg transition shrink-0 ${
              analyticsMode === 'ANNUAL' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white'
            }`}
          >
            Perbandingan Tahunan
          </button>
          <button
            onClick={() => setAnalyticsMode('COHORT')}
            className={`px-3 py-2 rounded-lg transition shrink-0 ${
              analyticsMode === 'COHORT' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white'
            }`}
          >
            Cohort Continuous
          </button>
          <button
            onClick={() => setAnalyticsMode('SKILL')}
            className={`px-3 py-2 rounded-lg transition shrink-0 ${
              analyticsMode === 'SKILL' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white'
            }`}
          >
            Skill Transition
          </button>
        </div>
      </div>

      {/* Control Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs w-full min-w-0">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
          {/* Academic Year Filter */}
          <div className="flex items-center space-x-1.5 flex-wrap">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <label className="font-bold text-slate-700 shrink-0">Tahun Ajaran:</label>
            <select
              value={academicYearFilter}
              onChange={(e) => setAcademicYearFilter(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none max-w-full text-xs"
            >
              <option value="ALL">Semua T.A.</option>
              {availableAcademicYears.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Event Filter (When relevant) */}
          {analyticsMode !== 'ANNUAL' && (
            <div className="flex items-center space-x-1.5 flex-wrap">
              <label className="font-bold text-slate-700 shrink-0">Event:</label>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none max-w-[200px] truncate text-xs"
              >
                {filteredEventsForYear.map((e) => (
                  <option key={e.event_id} value={e.event_id}>
                    {e.event_name} ({e.academic_year})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Grade Filter (Dynamic) */}
          <div className="flex items-center space-x-1.5 flex-wrap">
            <Filter className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none text-xs"
            >
              <option value="ALL">Semua Tingkat/Grade</option>
              {availableGrades.map(gr => (
                <option key={gr} value={gr}>Kelas {gr}</option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none text-xs"
          >
            <option value="ALL">Semua Gender</option>
            <option value="IKHWAN">Ikhwan</option>
            <option value="AKHWAT">Akhwat</option>
          </select>

          {/* Halaqah Filter */}
          {halaqahs.length > 0 && (
            <select
              value={halaqahFilter}
              onChange={(e) => setHalaqahFilter(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none max-w-[180px] truncate text-xs"
            >
              <option value="ALL">Semua Halaqah</option>
              {halaqahs.map(h => (
                <option key={h.halaqah_id} value={h.halaqah_id}>{h.halaqah_name}</option>
              ))}
            </select>
          )}
        </div>

        <button onClick={loadAnalytics} className="py-1.5 px-3 text-emerald-600 hover:text-emerald-700 font-bold flex items-center justify-center space-x-1 bg-emerald-50 rounded-lg border border-emerald-200 shrink-0 self-start sm:self-auto">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {loading && !data ? (
        <div className="py-16 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-600 mb-2" />
          <span>Kalkulasi statistik eksekutif...</span>
        </div>
      ) : loadError && !data ? (
        <div className="py-16 text-center bg-rose-50 border border-rose-200 rounded-2xl p-6 space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <h3 className="text-sm font-bold text-rose-900">Data gagal dimuat</h3>
          <p className="text-xs text-rose-600 max-w-md mx-auto">{loadError}</p>
          <button
            onClick={() => { initData(); loadAnalytics(); }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      ) : analyticsMode === 'SINGLE' || analyticsMode === 'COHORT' ? (
        /* SINGLE EVENT / COHORT ANALYTICS */
        <div className="space-y-6">
          {/* Cohort Continuous Banner */}
          {analyticsMode === 'COHORT' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-emerald-700" />
                  <span className="font-bold text-sm text-emerald-950">Mode Continuous Cohort Analysis</span>
                </div>
                <p className="text-[11px] text-emerald-800 mt-1">
                  Membandingkan populasi siswa yang secara konsisten terdaftar di seluruh event tahun ajaran yang dipilih untuk menghindari bias pergeseran populasi.
                </p>
              </div>
              <div className="text-right whitespace-nowrap">
                <span className="text-[10px] text-emerald-700 block uppercase font-bold">Ukuran Cohort Kontinu</span>
                <span className="font-mono font-black text-lg text-emerald-950 bg-emerald-200 px-3 py-1 rounded-xl inline-block mt-0.5">
                  {data.cohortSize || data.participantCount} Siswa
                </span>
              </div>
            </div>
          )}

          {/* Section 1: Data Coverage Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Peserta</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{data.participantCount}</p>
                <span className="text-[11px] text-slate-500 font-semibold block mt-0.5">Siswa Terdaftar</span>
              </div>
              <Users className="w-8 h-8 text-slate-300" />
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Data Progress Valid</span>
                <p className="text-2xl font-black text-emerald-700 mt-1">{data.validProgressCount}</p>
                <span className="text-[11px] text-emerald-600 font-semibold block mt-0.5">Memiliki Sesi Dinilai</span>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-200" />
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Belum Dinilai / Belum Lengkap</span>
                <p className="text-2xl font-black text-amber-600 mt-1">{data.missingProgressCount}</p>
                <span className="text-[11px] text-amber-600 font-semibold block mt-0.5">Tanpa Catatan Setoran</span>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-200" />
            </div>
          </div>

          {/* Section 2: Completion & Evaluation Coverage Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Cakupan Evaluasi & Status Ketuntasan Akhir</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Membedakan antara siswa tuntas, belum tuntas, dan siswa yang belum dievaluasi secara resmi.
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Evaluation Coverage</span>
                <span className="font-mono font-bold text-sm text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                  {data.evaluationCoverage}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">Tuntas</span>
                <p className="text-xl font-black text-emerald-700 mt-0.5">{data.completedCount}</p>
                <span className="text-[10px] text-slate-500 block">Siswa</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">Belum Tuntas</span>
                <p className="text-xl font-black text-rose-600 mt-0.5">{data.incompleteCount}</p>
                <span className="text-[10px] text-slate-500 block">Siswa</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">Belum Dievaluasi</span>
                <p className="text-xl font-black text-amber-600 mt-0.5">{data.notEvaluatedCount}</p>
                <span className="text-[10px] text-slate-500 block">Siswa</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 col-span-2">
                <span className="text-[10px] uppercase font-bold text-slate-500">Ketuntasan (Di Antara Siswa Dievaluasi)</span>
                <p className="text-xl font-black text-slate-900 mt-0.5">{data.completionRateAmongEvaluated}%</p>
                <span className="text-[10px] text-emerald-600 font-semibold block">Siswa Tuntas / Siswa Dievaluasi</span>
              </div>
            </div>
          </div>

          {/* Section 3: Outlier-Aware Executive Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Tambahan Baris</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{data.stats.totalLines}</p>
              <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block">Akumulasi Sesi Valid</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Rata-Rata vs Median</span>
                <Info className="w-3.5 h-3.5 text-slate-400" title="Mean dapat terdistorsi outlier. Median mewakili titik tengah sejati." />
              </div>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-black text-slate-900">{data.stats.mean}</span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  Med: {data.stats.median}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 block mt-0.5">Baris / Siswa Dinilai</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Coefficient of Var (CV)</span>
                <Info className="w-3.5 h-3.5 text-slate-400" title="CV = Standard Deviation / Mean." />
              </div>
              <p className="text-2xl font-black text-slate-900 mt-1">{(data.stats.cv * 100).toFixed(1)}%</p>
              <span className={`text-[11px] font-semibold block mt-0.5 ${data.stats.cv > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                StdDev: {data.stats.stdDev} {data.stats.cv > 0.5 ? '(Variasi relatif tinggi)' : '(Variasi terdistribusi baik)'}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Bottom 25% Rata-Rata</span>
              <p className="text-2xl font-black text-rose-700 mt-1">{data.stats.bottom25Avg}</p>
              <span className="text-[11px] text-slate-500 block mt-0.5">Baris / Siswa Kuartil Bawah</span>
            </div>
          </div>

          {/* Section 4: REAL BOX PLOT VISUALIZER */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                  <BarChart2 className="w-4 h-4 text-emerald-600" />
                  <span>Box Plot & Outlier Detector</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visualisasi lima angka ringkasan (Lower Whisker, Q1, Median, Q3, Upper Whisker, dan Outlier).
                </p>
              </div>

              <div className="text-[10px] font-mono text-slate-600 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200 flex items-center space-x-3">
                <span>IQR = {data.stats.iqr}</span>
                <span>Q1 = {data.stats.q1}</span>
                <span>Q3 = {data.stats.q3}</span>
              </div>
            </div>

            {/* Custom SVG Box Plot */}
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
              <div className="relative h-24 w-full flex items-center">
                {/* Horizontal Baseline Axis */}
                <div className="absolute left-6 right-6 h-0.5 bg-slate-300" />

                {/* Lower Whisker Line */}
                <div
                  className="absolute h-0.5 bg-slate-600"
                  style={{
                    left: `${6 + scaleBoxVal(data.stats.lowerWhisker) * 0.88}%`,
                    width: `${(scaleBoxVal(data.stats.q1) - scaleBoxVal(data.stats.lowerWhisker)) * 0.88}%`
                  }}
                />

                {/* Lower Whisker Tick */}
                <div
                  className="absolute h-6 w-1 bg-slate-700 rounded z-10"
                  style={{
                    left: `${6 + scaleBoxVal(data.stats.lowerWhisker) * 0.88}%`
                  }}
                />

                {/* Upper Whisker Line */}
                <div
                  className="absolute h-0.5 bg-slate-600"
                  style={{
                    left: `${6 + scaleBoxVal(data.stats.q3) * 0.88}%`,
                    width: `${(scaleBoxVal(data.stats.upperWhisker) - scaleBoxVal(data.stats.q3)) * 0.88}%`
                  }}
                />

                {/* Upper Whisker Tick */}
                <div
                  className="absolute h-6 w-1 bg-slate-700 rounded z-10"
                  style={{
                    left: `${6 + scaleBoxVal(data.stats.upperWhisker) * 0.88}%`
                  }}
                />

                {/* IQR Box (Q1 to Q3) */}
                <div
                  className="absolute h-12 bg-emerald-100 border-2 border-emerald-600 rounded-lg flex items-center justify-center font-bold text-[11px] text-emerald-950 shadow-sm z-20"
                  style={{
                    left: `${6 + scaleBoxVal(data.stats.q1) * 0.88}%`,
                    width: `${Math.max(2, (scaleBoxVal(data.stats.q3) - scaleBoxVal(data.stats.q1)) * 0.88)}%`
                  }}
                >
                  <span className="truncate px-1">IQR (50% Utama)</span>
                </div>

                {/* Median Line inside box */}
                <div
                  className="absolute h-14 w-1.5 bg-emerald-900 rounded z-30 shadow"
                  style={{
                    left: `${6 + scaleBoxVal(data.stats.median) * 0.88}%`
                  }}
                />

                {/* Outlier Dots */}
                {data.stats.outliers && data.stats.outliers.map((val: number, idx: number) => (
                  <div
                    key={idx}
                    title={`Outlier value: ${val}`}
                    className="absolute h-3 w-3 bg-rose-600 border border-white rounded-full z-40 shadow-sm -ml-1.5"
                    style={{
                      left: `${6 + scaleBoxVal(val) * 0.88}%`
                    }}
                  />
                ))}
              </div>

              {/* Box Plot Labels */}
              <div className="grid grid-cols-5 text-center text-[11px] font-mono text-slate-700 font-semibold border-t border-slate-200 pt-3">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Lower Whisker</span>
                  <span>{data.stats.lowerWhisker}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Q1 (25%)</span>
                  <span>{data.stats.q1}</span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-800 block uppercase font-bold">Median</span>
                  <span className="text-emerald-900 font-black">{data.stats.median}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Q3 (75%)</span>
                  <span>{data.stats.q3}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Upper Whisker</span>
                  <span>{data.stats.upperWhisker}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Distribution Buckets */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-emerald-600" />
              <span>Distribusi Kelompok Capaian Baris (Hanya Data Valid)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {data.distributionBuckets.map((b: any) => (
                <div key={b.range} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-800 block">{b.range}</span>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className="text-xl font-black text-emerald-900">{b.count}</span>
                    <span className="text-xs text-slate-500 font-semibold">Siswa ({b.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : analyticsMode === 'ANNUAL' ? (
        /* ANNUAL COMPARISON MODE */
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>Tren & Perbandingan Event Tahunan</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Membandingkan indikator kinerja utama antar kegiatan dalam rentang tahun ajaran yang dipilih.
                </p>
              </div>
            </div>

            {/* Lightweight Visual Trend Lines Chart */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-800 block">Visual Trend: Rata-Rata (Mean) vs Median Baris per Siswa</span>
              
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                {data.annualData && data.annualData.map((row: any) => {
                  const maxVal = Math.max(...data.annualData.map((r: any) => Math.max(r.meanLines, r.medianLines, 1)));
                  const meanHeightPct = Math.min(100, (row.meanLines / maxVal) * 100);
                  const medianHeightPct = Math.min(100, (row.medianLines / maxVal) * 100);

                  return (
                    <div key={row.eventId} className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between space-y-2">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">#{row.sequenceNo}</span>
                        <span className="text-xs font-bold text-slate-900 truncate block">{row.eventName}</span>
                      </div>

                      {/* Bar Visualization */}
                      <div className="h-20 bg-slate-100 rounded flex items-end justify-center space-x-1.5 p-1 relative">
                        {/* Mean Bar */}
                        <div
                          className="w-3.5 bg-emerald-600 rounded-t transition-all"
                          style={{ height: `${Math.max(5, meanHeightPct)}%` }}
                          title={`Mean: ${row.meanLines}`}
                        />
                        {/* Median Bar */}
                        <div
                          className="w-3.5 bg-teal-800 rounded-t transition-all"
                          style={{ height: `${Math.max(5, medianHeightPct)}%` }}
                          title={`Median: ${row.medianLines}`}
                        />
                      </div>

                      <div className="flex justify-between text-[10px] font-mono border-t pt-1">
                        <span className="text-emerald-700 font-bold">M: {row.meanLines}</span>
                        <span className="text-teal-900 font-bold">Med: {row.medianLines}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center space-x-4 text-[11px] font-semibold text-slate-600 pt-1">
                <div className="flex items-center space-x-1.5">
                  <div className="w-3 h-3 bg-emerald-600 rounded-sm" />
                  <span>Rata-Rata (Mean)</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <div className="w-3 h-3 bg-teal-800 rounded-sm" />
                  <span>Median</span>
                </div>
              </div>
            </div>

            {/* Annual Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] border-b border-slate-200">
                    <th className="p-3">Seq</th>
                    <th className="p-3">Nama Event</th>
                    <th className="p-3">Total Peserta</th>
                    <th className="p-3">Data Valid</th>
                    <th className="p-3">Tanpa Data</th>
                    <th className="p-3">Total Baris</th>
                    <th className="p-3">Mean</th>
                    <th className="p-3">Median</th>
                    <th className="p-3">CV (%)</th>
                    <th className="p-3">Ketuntasan (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.annualData && data.annualData.map((row: any) => (
                    <tr key={row.eventId} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-500">#{row.sequenceNo}</td>
                      <td className="p-3 font-bold text-slate-900">{row.eventName}</td>
                      <td className="p-3 font-semibold text-slate-700">{row.participantCount} Siswa</td>
                      <td className="p-3 font-semibold text-emerald-700">{row.validProgressCount}</td>
                      <td className="p-3 font-semibold text-amber-600">{row.missingProgressCount}</td>
                      <td className="p-3 font-bold text-emerald-900">{row.totalLines}</td>
                      <td className="p-3 font-semibold text-slate-800">{row.meanLines}</td>
                      <td className="p-3 font-semibold text-slate-800">{row.medianLines}</td>
                      <td className="p-3 font-mono font-bold text-slate-700">{(row.cv * 100).toFixed(1)}%</td>
                      <td className="p-3 font-bold text-emerald-700">{row.completionRateAmongEvaluated}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* SKILL TRANSITION MODE (3x3 MATRIX) */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>Matriks Transisi Perkembangan Skill Siswa (Start vs End)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluasi perubahan kategori kelancaran siswa dari awal kegiatan hingga evaluasi akhir.
              </p>
            </div>

            {/* Separately display unevaluated count */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs font-bold text-amber-900 flex items-center space-x-2">
              <HelpCircle className="w-4 h-4 text-amber-600" />
              <span>Belum Dievaluasi: {data.notEvaluatedSkillCount} siswa</span>
            </div>
          </div>

          {/* 3x3 Matrix Layout */}
          <div className="overflow-x-auto">
            <table className="w-full text-center text-xs border-collapse border border-slate-200 rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-slate-900 text-white font-bold">
                  <th className="p-3 text-left border-r border-slate-700">Skill Awal \ Skill Akhir</th>
                  <th className="p-3 border-r border-slate-700 bg-rose-900/50 text-rose-200">NON-BBL</th>
                  <th className="p-3 border-r border-slate-700 bg-emerald-900/50 text-emerald-200">BBL</th>
                  <th className="p-3 bg-teal-900/50 text-teal-200">BBLS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-semibold">
                {(['NON_BBL', 'BBL', 'BBLS'] as SkillStatus[]).map(fromSkill => {
                  return (
                    <tr key={fromSkill} className="hover:bg-slate-50">
                      <td className="p-3 text-left font-bold text-slate-800 bg-slate-100 border-r border-slate-200">
                        {fromSkill}
                      </td>
                      {(['NON_BBL', 'BBL', 'BBLS'] as SkillStatus[]).map(toSkill => {
                        const match = data.skillTransitions?.find((tr: SkillTransition) => tr.from === fromSkill && tr.to === toSkill);
                        const count = match ? match.count : 0;
                        const isPromoted = (fromSkill === 'NON_BBL' && toSkill !== 'NON_BBL') || (fromSkill === 'BBL' && toSkill === 'BBLS');

                        return (
                          <td
                            key={toSkill}
                            className={`p-4 border-r border-slate-200 transition ${
                              count > 0 ? (isPromoted ? 'bg-emerald-50 text-emerald-950 font-black' : 'bg-slate-50 text-slate-900 font-bold') : 'text-slate-300'
                            }`}
                          >
                            <span className="text-lg block">{count}</span>
                            <span className="text-[10px] text-slate-400 font-normal">Siswa</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
