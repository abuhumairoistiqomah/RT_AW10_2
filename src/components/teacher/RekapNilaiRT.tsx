import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiService,
  GradeRecapEvent,
  GradeRecapSource,
  GradeRecapSourceRow
} from '../../services/api';
import {
  BookOpenCheck,
  Check,
  ChevronDown,
  Filter,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  Users
} from 'lucide-react';
import { RTPerformanceScatter } from './RTPerformanceScatter';

type PresetMode = 'SEMESTER_1' | 'SEMESTER_2' | 'ALL' | 'CUSTOM';
type GenderFilter = 'ALL' | 'IKHWAN' | 'AKHWAT';

type AggregatedRow = {
  student_id: string;
  full_name: string;
  class_name: string;
  latest_skill_status: string;
  total_ziyadah_lines: number;
  cognitive_average: number | null;
  cognitive_count: number;
  affective_mode: string;
  report_grade: '' | 'A' | 'B';
};

const normalizeSkillLabel = (value: string) => {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'NON_BBL') return 'NON-BBL';
  if (upper === 'BBL') return 'BBL';
  if (upper === 'BBLS') return 'BBLS';
  return '—';
};

const formatScore = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
};

const naturalCompare = (a: string, b: string) =>
  String(a || '').localeCompare(String(b || ''), 'id-ID', {
    numeric: true,
    sensitivity: 'base'
  });

const getClassGender = (
  className: string
): 'IKHWAN' | 'AKHWAT' | 'UNKNOWN' => {
  const tokens = String(className || '')
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);

  const last = tokens[tokens.length - 1] || '';

  if (last === 'A' || last === 'AKHWAT') {
    return 'AKHWAT';
  }

  if (last === 'I' || last === 'IKHWAN') {
    return 'IKHWAN';
  }

  return 'UNKNOWN';
};

const getAffectiveMode = (
  metrics: GradeRecapSourceRow['event_metrics']
): string => {
  const rated = metrics
    .filter(metric => String(metric.affective_rating || '').trim() !== '')
    .sort((a, b) => Number(b.sequence_no || 0) - Number(a.sequence_no || 0));

  if (rated.length === 0) return '';

  const counts = new Map<string, number>();
  rated.forEach(metric => {
    const rating = String(metric.affective_rating || '').trim().toUpperCase();
    counts.set(rating, (counts.get(rating) || 0) + 1);
  });

  const maxCount = Math.max(...Array.from(counts.values()));
  const tied = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count === maxCount)
      .map(([rating]) => rating)
  );

  // Tie-breaker: newest selected RT wins.
  const latestTied = rated.find(metric =>
    tied.has(String(metric.affective_rating || '').trim().toUpperCase())
  );

  return latestTied
    ? String(latestTied.affective_rating || '').trim().toUpperCase()
    : '';
};

export const RekapNilaiRT: React.FC = () => {
  const [source, setSource] = useState<GradeRecapSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [presetMode, setPresetMode] = useState<PresetMode>('SEMESTER_1');
  const [nameQuery, setNameQuery] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('ALL');

  const initializedSelectionRef = useRef(false);

  const loadRecap = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await ApiService.getGradeRecap();
      setSource(data);
    } catch (err: any) {
      setError(
        err?.message ||
          'Gagal memuat Rekap Nilai Rumah Tahfidz.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRecap();
  }, []);

  const events = useMemo(() => {
    return [...(source?.events || [])].sort(
      (a, b) =>
        Number(a.sequence_no || 0) - Number(b.sequence_no || 0)
    );
  }, [source?.events]);

  const eventsBySequence = useMemo(() => {
    const map = new Map<number, GradeRecapEvent>();
    events.forEach(event => {
      const sequence = Number(event.sequence_no || 0);
      if (sequence >= 1 && sequence <= 6 && !map.has(sequence)) {
        map.set(sequence, event);
      }
    });
    return map;
  }, [events]);

  const eventIdsForRange = (min: number, max: number) => {
    const ids: string[] = [];
    for (let sequence = min; sequence <= max; sequence += 1) {
      const event = eventsBySequence.get(sequence);
      if (event) ids.push(event.event_id);
    }
    return ids;
  };

  const applyPreset = (mode: PresetMode) => {
    let ids: string[] = [];

    if (mode === 'SEMESTER_1') {
      ids = eventIdsForRange(1, 3);
    } else if (mode === 'SEMESTER_2') {
      ids = eventIdsForRange(4, 6);
    } else if (mode === 'ALL') {
      ids = events
        .filter(event => {
          const n = Number(event.sequence_no || 0);
          return n >= 1 && n <= 6;
        })
        .map(event => event.event_id);
    }

    setPresetMode(mode);
    setSelectedEventIds(ids);
  };

  useEffect(() => {
    if (events.length === 0 || initializedSelectionRef.current) return;

    initializedSelectionRef.current = true;

    const activeEvent = events.find(
      event => String(event.status || '').toUpperCase() === 'ACTIVE'
    );
    const activeSequence = Number(activeEvent?.sequence_no || 0);

    if (activeSequence >= 4 && activeSequence <= 6) {
      applyPreset('SEMESTER_2');
      return;
    }

    const semester1Ids = eventIdsForRange(1, 3);
    if (semester1Ids.length > 0) {
      applyPreset('SEMESTER_1');
      return;
    }

    applyPreset('ALL');
  }, [events]);

  const toggleEvent = (eventId: string) => {
    setPresetMode('CUSTOM');
    setSelectedEventIds(current => {
      if (current.includes(eventId)) {
        return current.filter(id => id !== eventId);
      }
      return [...current, eventId];
    });
  };

  const selectedEventIdSet = useMemo(
    () => new Set(selectedEventIds),
    [selectedEventIds]
  );

  const selectedEvents = useMemo(
    () =>
      events.filter(event => selectedEventIdSet.has(event.event_id)),
    [events, selectedEventIdSet]
  );

  const aggregatedRows = useMemo<AggregatedRow[]>(() => {
    if (!source || selectedEventIds.length === 0) return [];

    return source.rows
      .map(row => {
        const selectedMetrics = row.event_metrics
          .filter(metric => selectedEventIdSet.has(metric.event_id))
          .sort(
            (a, b) =>
              Number(a.sequence_no || 0) - Number(b.sequence_no || 0)
          );

        // Only students registered as participants in at least one selected RT.
        if (!selectedMetrics.some(metric => metric.participant)) {
          return null;
        }

        const latestSkillMetric = [...selectedMetrics]
          .reverse()
          .find(metric => String(metric.skill_status_end || '').trim() !== '');

        const totalZiyadahLines = selectedMetrics.reduce(
          (sum, metric) => {
            const value = Number(metric.ziyadah_lines || 0);
            return sum + (Number.isFinite(value) ? value : 0);
          },
          0
        );

        const cognitiveValues = selectedMetrics
          .map(metric => metric.final_score)
          .filter(
            (value): value is number =>
              value !== null &&
              value !== undefined &&
              Number.isFinite(Number(value))
          )
          .map(Number);

        const cognitiveAverage =
          cognitiveValues.length > 0
            ? cognitiveValues.reduce((sum, value) => sum + value, 0) /
              cognitiveValues.length
            : null;

        const affectiveMode = getAffectiveMode(selectedMetrics);

        const reportGrade: '' | 'A' | 'B' =
          cognitiveAverage === null
            ? ''
            : cognitiveAverage >= 90
              ? 'A'
              : 'B';

        return {
          student_id: row.student_id,
          full_name: row.full_name,
          class_name: row.class_name,
          latest_skill_status:
            latestSkillMetric?.skill_status_end || '',
          total_ziyadah_lines: totalZiyadahLines,
          cognitive_average: cognitiveAverage,
          cognitive_count: cognitiveValues.length,
          affective_mode: affectiveMode,
          report_grade: reportGrade
        };
      })
      .filter((row): row is AggregatedRow => Boolean(row));
  }, [source, selectedEventIds, selectedEventIdSet]);

  const genderFilteredRows = useMemo(() => {
    if (genderFilter === 'ALL') {
      return aggregatedRows;
    }

    return aggregatedRows.filter(
      row =>
        getClassGender(row.class_name) ===
        genderFilter
    );
  }, [aggregatedRows, genderFilter]);

  const classOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        genderFilteredRows
          .map(row => String(row.class_name || '').trim())
          .filter(Boolean)
      )
    );

    return unique.sort(naturalCompare);
  }, [genderFilteredRows]);

  useEffect(() => {
    if (
      classFilter !== 'ALL' &&
      !classOptions.includes(classFilter)
    ) {
      setClassFilter('ALL');
    }
  }, [classFilter, classOptions]);

  const filteredRows = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();

    return genderFilteredRows
      .filter(row => {
        if (
          classFilter !== 'ALL' &&
          row.class_name !== classFilter
        ) {
          return false;
        }

        if (
          query &&
          !row.full_name.toLowerCase().includes(query)
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const classComparison = naturalCompare(
          a.class_name,
          b.class_name
        );

        if (classComparison !== 0) {
          return classComparison;
        }

        return naturalCompare(
          a.full_name,
          b.full_name
        );
      });
  }, [
    genderFilteredRows,
    classFilter,
    nameQuery
  ]);

  const selectedRangeLabel = useMemo(() => {
    if (selectedEvents.length === 0) return 'Belum ada RT dipilih';
    return selectedEvents
      .map(event => `RT ${event.sequence_no}`)
      .join(', ');
  }, [selectedEvents]);

  const genderLabel =
    genderFilter === 'IKHWAN'
      ? 'Ikhwan'
      : genderFilter === 'AKHWAT'
        ? 'Akhwat'
        : 'Semua';

  const cognitiveCompleteCount = useMemo(
    () =>
      filteredRows.filter(row => row.cognitive_average !== null).length,
    [filteredRows]
  );

  return (
    <div className="max-w-[1500px] mx-auto space-y-5 pb-12">
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-700 mb-1.5">
              <BookOpenCheck className="w-5 h-5" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider">
                Portal Guru • Read Only
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Rekap Nilai Rumah Tahfidz
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Panduan wali kelas untuk penilaian raport ekskul Rumah Tahfidz.
              Predikat raport dihitung dari rata-rata nilai kognitif: 90 ke atas = A, di bawah 90 = B.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadRecap()}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Muat Ulang Data
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-800">
          <Filter className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-extrabold">Cakupan Rumah Tahfidz</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyPreset('SEMESTER_1')}
            className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
              presetMode === 'SEMESTER_1'
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Semester 1 • RT 1–3
          </button>
          <button
            type="button"
            onClick={() => applyPreset('SEMESTER_2')}
            className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
              presetMode === 'SEMESTER_2'
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Semester 2 • RT 4–6
          </button>
          <button
            type="button"
            onClick={() => applyPreset('ALL')}
            className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
              presetMode === 'ALL'
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Semua RT
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }, (_, index) => index + 1).map(sequence => {
            const event = eventsBySequence.get(sequence);
            const checked = event
              ? selectedEventIds.includes(event.event_id)
              : false;

            return (
              <label
                key={sequence}
                title={event?.event_name || `RT ${sequence} belum tersedia`}
                className={`flex items-center gap-2 min-h-[42px] px-3 py-2 rounded-lg border text-xs font-bold transition ${
                  event
                    ? checked
                      ? 'bg-blue-50 border-blue-300 text-blue-800 cursor-pointer'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer'
                    : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    checked
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-300'
                  }`}
                >
                  {checked && <Check className="w-3 h-3" />}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  disabled={!event}
                  checked={checked}
                  onChange={() => event && toggleEvent(event.event_id)}
                />
                <span>RT {sequence}</span>
              </label>
            );
          })}
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600">
          <span className="font-bold text-slate-800">Cakupan aktif:</span>{' '}
          {selectedRangeLabel}
          {presetMode === 'CUSTOM' && (
            <span className="ml-1 text-blue-700 font-bold">• Custom</span>
          )}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px_auto] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={nameQuery}
              onChange={event =>
                setNameQuery(event.target.value)
              }
              placeholder="Cari nama siswa pada daftar..."
              className="w-full h-11 pl-10 pr-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div className="relative">
            <select
              value={classFilter}
              onChange={event =>
                setClassFilter(event.target.value)
              }
              className="appearance-none w-full h-11 pl-3 pr-9 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              <option value="ALL">Semua Kelas</option>
              {classOptions.map(className => (
                <option
                  key={className}
                  value={className}
                >
                  {className}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex h-11 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {[
              ['ALL', 'Semua'],
              ['IKHWAN', 'Ikhwan'],
              ['AKHWAT', 'Akhwat']
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setGenderFilter(
                    value as GenderFilter
                  )
                }
                className={`px-3 rounded-md text-[11px] font-extrabold transition ${
                  genderFilter === value
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-slate-500">
          Pilih kelas untuk memfilter daftar siswa sekaligus menyorot titik kelas pada grafik di bagian bawah.
          Kelas lain tetap tampil sebagai pembanding.
        </p>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wide">
            <Users className="w-4 h-4 text-blue-600" />
            Siswa Tampil
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {filteredRows.length}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wide">
            <GraduationCap className="w-4 h-4 text-emerald-600" />
            Ada Nilai Kognitif
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {cognitiveCompleteCount}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm col-span-2">
          <div className="text-slate-500 text-[11px] font-bold uppercase tracking-wide">
            Aturan Predikat Raport
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              A • Rata-rata ≥ 90
            </span>
            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              B • Rata-rata &lt; 90
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-500 border border-slate-200">
              — • Nilai belum tersedia
            </span>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="min-h-[300px] flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
            <span className="text-xs font-bold">Memuat rekap nilai...</span>
          </div>
        ) : error ? (
          <div className="min-h-[260px] flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="text-sm font-extrabold text-rose-700">
              Rekap belum dapat dimuat
            </div>
            <div className="text-xs text-slate-500 max-w-xl">{error}</div>
            <button
              type="button"
              onClick={() => void loadRecap()}
              className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition"
            >
              Coba Lagi
            </button>
          </div>
        ) : selectedEventIds.length === 0 ? (
          <div className="min-h-[240px] flex items-center justify-center px-6 text-center text-sm font-bold text-slate-500">
            Pilih minimal satu Rumah Tahfidz untuk menampilkan rekap.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="min-h-[240px] flex items-center justify-center px-6 text-center text-sm font-bold text-slate-500">
            Tidak ada siswa yang cocok dengan filter saat ini.
          </div>
        ) : (
          <>
            {/* Mobile: vertical compact cards, no horizontal scrolling */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredRows.map(row => (
                <article
                  key={row.student_id}
                  className="px-3.5 py-3 bg-white"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-[13px] leading-tight text-slate-900 truncate">
                        {row.full_name}
                      </div>
                      <div className="mt-0.5 text-[10px] font-medium text-slate-500 truncate">
                        {row.class_name || 'Kelas tidak tersedia'}
                      </div>
                    </div>

                    <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      row.latest_skill_status === 'BBLS'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : row.latest_skill_status === 'BBL'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : row.latest_skill_status === 'NON_BBL'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}>
                      {normalizeSkillLabel(row.latest_skill_status)}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5 text-center">
                      <div className="text-[8px] uppercase tracking-wide font-extrabold text-slate-400">
                        Ziyadah
                      </div>
                      <div className="mt-0.5 text-[12px] font-black text-slate-900 tabular-nums leading-none">
                        {row.total_ziyadah_lines}
                      </div>
                      <div className="mt-0.5 text-[8px] text-slate-400">
                        baris
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5 text-center">
                      <div className="text-[8px] uppercase tracking-wide font-extrabold text-slate-400">
                        Kognitif
                      </div>
                      <div className="mt-0.5 text-[12px] font-black text-slate-900 tabular-nums leading-none">
                        {formatScore(row.cognitive_average)}
                      </div>
                      <div className="mt-0.5 text-[8px] text-slate-400">
                        {row.cognitive_count}/{selectedEventIds.length} RT
                      </div>
                    </div>

                    <div className="rounded-lg bg-violet-50/60 border border-violet-100 px-2 py-1.5 text-center">
                      <div className="text-[8px] uppercase tracking-wide font-extrabold text-violet-400">
                        Afektif
                      </div>
                      <div className="mt-1 text-[12px] font-black text-violet-700 leading-none">
                        {row.affective_mode || '—'}
                      </div>
                    </div>

                    <div className={`rounded-lg border px-2 py-1.5 text-center ${
                      row.report_grade === 'A'
                        ? 'bg-emerald-50 border-emerald-100'
                        : row.report_grade === 'B'
                          ? 'bg-blue-50 border-blue-100'
                          : 'bg-slate-50 border-slate-100'
                    }`}>
                      <div className={`text-[8px] uppercase tracking-wide font-extrabold ${
                        row.report_grade === 'A'
                          ? 'text-emerald-400'
                          : row.report_grade === 'B'
                            ? 'text-blue-400'
                            : 'text-slate-400'
                      }`}>
                        Predikat
                      </div>
                      <div className={`mt-1 text-[12px] font-black leading-none ${
                        row.report_grade === 'A'
                          ? 'text-emerald-700'
                          : row.report_grade === 'B'
                            ? 'text-blue-700'
                            : 'text-slate-400'
                      }`}>
                        {row.report_grade || '—'}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Tablet/Desktop: keep the full table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                      Nama Siswa
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                      Tingkat Bacaan Terakhir
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                      Total Baris Ziyadah
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                      Nilai Kognitif
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                      Nilai Afektif
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                      Predikat Nilai
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map(row => (
                    <tr key={row.student_id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-sm text-slate-900">
                          {row.full_name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {row.class_name || 'Kelas tidak tersedia'}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                          row.latest_skill_status === 'BBLS'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : row.latest_skill_status === 'BBL'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : row.latest_skill_status === 'NON_BBL'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {normalizeSkillLabel(row.latest_skill_status)}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm font-extrabold text-slate-900 tabular-nums">
                          {row.total_ziyadah_lines}
                        </span>
                        <span className="ml-1 text-[11px] text-slate-500">baris</span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <div className="text-sm font-extrabold text-slate-900 tabular-nums">
                          {formatScore(row.cognitive_average)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {row.cognitive_count}/{selectedEventIds.length} RT
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {row.affective_mode ? (
                          <span className="inline-flex min-w-8 justify-center px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 text-xs font-extrabold">
                            {row.affective_mode}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {row.report_grade ? (
                          <span className={`inline-flex w-9 h-9 items-center justify-center rounded-full text-sm font-black border ${
                            row.report_grade === 'A'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'bg-blue-50 text-blue-700 border-blue-300'
                          }`}>
                            {row.report_grade}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <p className="text-[11px] text-slate-500 leading-relaxed px-1">
        Nilai kognitif adalah rata-rata final score yang tersedia pada RT terpilih; data yang belum diisi tidak dianggap nol.
        Nilai afektif menggunakan modus, dan jika seri maka nilai dari RT terbaru menjadi penentu.
      </p>

      <RTPerformanceScatter
        rows={genderFilteredRows}
        selectedClass={classFilter}
        selectedRangeLabel={selectedRangeLabel}
        genderLabel={genderLabel}
      />
    </div>
  );
};