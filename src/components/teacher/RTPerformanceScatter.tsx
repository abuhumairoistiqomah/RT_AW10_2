import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  BarChart3,
  Search,
  X
} from 'lucide-react';

export type RTPerformanceScatterRow = {
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

type Props = {
  rows: RTPerformanceScatterRow[];
  selectedClass: string;
  selectedRangeLabel: string;
  genderLabel: string;
};

type ClassPoint = {
  type: 'CLASS';
  className: string;
  ziyadah: number;
  cognitive: number;
  studentCount: number;
  cognitiveCount: number;
  isSelected: boolean;
};

type StudentPoint = {
  type: 'STUDENT';
  className: string;
  studentName: string;
  ziyadah: number;
  cognitive: number;
};

const naturalCompare = (a: string, b: string) =>
  String(a || '').localeCompare(String(b || ''), 'id-ID', {
    numeric: true,
    sensitivity: 'base'
  });

const median = (values: number[]): number | null => {
  const clean = values
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (clean.length === 0) return null;

  const middle = Math.floor(clean.length / 2);

  if (clean.length % 2 === 1) {
    return clean[middle];
  }

  return (clean[middle - 1] + clean[middle]) / 2;
};

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const ClassPointShape = (props: any) => {
  const { cx, cy, payload } = props;

  if (
    !Number.isFinite(cx) ||
    !Number.isFinite(cy) ||
    !payload
  ) {
    return null;
  }

  const selected = Boolean(payload.isSelected);
  const radius = selected ? 8 : 5;
  const fill = selected ? '#dc2626' : '#2563eb';
  const stroke = selected ? '#991b1b' : '#ffffff';
  const labelFill = selected ? '#b91c1c' : '#64748b';
  const fontSize = selected ? 12 : 9;
  const fontWeight = selected ? 900 : 700;

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={selected ? 2.5 : 1.5}
        opacity={selected ? 1 : 0.82}
      />
      <text
        x={cx + radius + 4}
        y={cy - radius - 2}
        fill={labelFill}
        fontSize={fontSize}
        fontWeight={fontWeight}
      >
        {payload.className}
      </text>
    </g>
  );
};

const StudentPointShape = (props: any) => {
  const { cx, cy, payload } = props;

  if (
    !Number.isFinite(cx) ||
    !Number.isFinite(cy) ||
    !payload
  ) {
    return null;
  }

  const size = 9;
  const points = [
    `${cx},${cy - size}`,
    `${cx + size},${cy}`,
    `${cx},${cy + size}`,
    `${cx - size},${cy}`
  ].join(' ');

  return (
    <g>
      <polygon
        points={points}
        fill="#7c3aed"
        stroke="#ffffff"
        strokeWidth={2.5}
      />
      <text
        x={cx + size + 5}
        y={cy - size - 2}
        fill="#6d28d9"
        fontSize={11}
        fontWeight={900}
      >
        {payload.studentName}
      </text>
    </g>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;

  if (!point) return null;

  if (point.type === 'STUDENT') {
    return (
      <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 shadow-lg text-xs">
        <div className="font-extrabold text-slate-900">
          {point.studentName}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {point.className}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-slate-500">Ziyadah</span>
          <span className="font-bold text-right">
            {formatNumber(point.ziyadah)} baris
          </span>
          <span className="text-slate-500">Kognitif</span>
          <span className="font-bold text-right">
            {formatNumber(point.cognitive)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-extrabold text-slate-900">
        {point.className}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-slate-500">Median Ziyadah</span>
        <span className="font-bold text-right">
          {formatNumber(point.ziyadah)} baris
        </span>
        <span className="text-slate-500">Median Kognitif</span>
        <span className="font-bold text-right">
          {formatNumber(point.cognitive)}
        </span>
        <span className="text-slate-500">Jumlah siswa</span>
        <span className="font-bold text-right">
          {point.studentCount}
        </span>
        <span className="text-slate-500">Data kognitif</span>
        <span className="font-bold text-right">
          {point.cognitiveCount}/{point.studentCount}
        </span>
      </div>
    </div>
  );
};

export const RTPerformanceScatter: React.FC<Props> = ({
  rows,
  selectedClass,
  selectedRangeLabel,
  genderLabel
}) => {
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const classPoints = useMemo<ClassPoint[]>(() => {
    const groups = new Map<string, RTPerformanceScatterRow[]>();

    rows.forEach(row => {
      const className = String(row.class_name || '').trim();

      if (!className) return;

      if (!groups.has(className)) {
        groups.set(className, []);
      }

      groups.get(className)!.push(row);
    });

    return Array.from(groups.entries())
      .map(([className, classRows]) => {
        const ziyadahMedian = median(
          classRows.map(row =>
            Number(row.total_ziyadah_lines || 0)
          )
        );

        const cognitiveValues = classRows
          .map(row => row.cognitive_average)
          .filter(
            (value): value is number =>
              value !== null &&
              value !== undefined &&
              Number.isFinite(Number(value))
          )
          .map(Number);

        const cognitiveMedian = median(cognitiveValues);

        if (
          ziyadahMedian === null ||
          cognitiveMedian === null
        ) {
          return null;
        }

        return {
          type: 'CLASS' as const,
          className,
          ziyadah: ziyadahMedian,
          cognitive: cognitiveMedian,
          studentCount: classRows.length,
          cognitiveCount: cognitiveValues.length,
          isSelected:
            selectedClass !== 'ALL' &&
            selectedClass === className
        };
      })
      .filter((point): point is ClassPoint =>
        Boolean(point)
      )
      .sort((a, b) =>
        naturalCompare(a.className, b.className)
      );
  }, [rows, selectedClass]);

  const studentCandidates = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();

    if (!query) return [];

    return rows
      .filter(row => {
        if (
          selectedClass !== 'ALL' &&
          row.class_name !== selectedClass
        ) {
          return false;
        }

        return row.full_name
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) =>
        naturalCompare(a.full_name, b.full_name)
      )
      .slice(0, 8);
  }, [rows, selectedClass, studentQuery]);

  const selectedStudent = useMemo(
    () =>
      rows.find(
        row => row.student_id === selectedStudentId
      ) || null,
    [rows, selectedStudentId]
  );

  const selectedStudentPoint = useMemo<StudentPoint[]>(
    () => {
      if (
        !selectedStudent ||
        selectedStudent.cognitive_average === null ||
        !Number.isFinite(
          Number(selectedStudent.cognitive_average)
        )
      ) {
        return [];
      }

      return [
        {
          type: 'STUDENT',
          className: selectedStudent.class_name,
          studentName: selectedStudent.full_name,
          ziyadah: Number(
            selectedStudent.total_ziyadah_lines || 0
          ),
          cognitive: Number(
            selectedStudent.cognitive_average
          )
        }
      ];
    },
    [selectedStudent]
  );

  useEffect(() => {
    if (!selectedStudentId) return;

    const stillAvailable = rows.some(row => {
      if (row.student_id !== selectedStudentId) {
        return false;
      }

      if (
        selectedClass !== 'ALL' &&
        row.class_name !== selectedClass
      ) {
        return false;
      }

      return true;
    });

    if (!stillAvailable) {
      setSelectedStudentId('');
      setStudentQuery('');
    }
  }, [rows, selectedClass, selectedStudentId]);

  const xReferenceMedian = useMemo(
    () =>
      median(
        classPoints.map(point => point.ziyadah)
      ),
    [classPoints]
  );

  const yMin = useMemo(() => {
    const values = [
      ...classPoints.map(point => point.cognitive),
      ...selectedStudentPoint.map(
        point => point.cognitive
      )
    ];

    if (values.length === 0) return 0;

    const minimum = Math.min(...values);

    return Math.max(
      0,
      Math.floor((minimum - 5) / 10) * 10
    );
  }, [classPoints, selectedStudentPoint]);

  const handleSelectStudent = (
    row: RTPerformanceScatterRow
  ) => {
    setSelectedStudentId(row.student_id);
    setStudentQuery(row.full_name);
  };

  const clearSelectedStudent = () => {
    setSelectedStudentId('');
    setStudentQuery('');
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-slate-100">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-extrabold text-slate-900">
                Peta Performa Rumah Tahfidz
              </h2>
            </div>
            <p className="mt-1 text-[11px] sm:text-xs text-slate-500 leading-relaxed">
              Titik kelas memakai median agar lebih tahan terhadap outlier.
              X = total baris Ziyadah, Y = nilai kognitif.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                {selectedRangeLabel}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                {genderLabel}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                ● Median kelas
              </span>
              <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">
                ◆ Siswa terpilih
              </span>
            </div>
          </div>

          <div className="relative w-full lg:w-[340px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
            <input
              type="text"
              value={studentQuery}
              onChange={event => {
                setStudentQuery(event.target.value);
                setSelectedStudentId('');
              }}
              placeholder={
                selectedClass === 'ALL'
                  ? 'Cari siswa untuk dimunculkan...'
                  : `Cari siswa ${selectedClass}...`
              }
              className="w-full h-10 pl-9 pr-9 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            />

            {(studentQuery || selectedStudentId) && (
              <button
                type="button"
                onClick={clearSelectedStudent}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                title="Hapus siswa dari grafik"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {!selectedStudentId &&
              studentQuery.trim() &&
              studentCandidates.length > 0 && (
                <div className="absolute left-0 right-0 top-[44px] z-30 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                  {studentCandidates.map(row => (
                    <button
                      key={row.student_id}
                      type="button"
                      onClick={() =>
                        handleSelectStudent(row)
                      }
                      className="w-full px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    >
                      <div className="text-xs font-extrabold text-slate-900">
                        {row.full_name}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {row.class_name}
                      </div>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>

        {selectedStudent &&
          selectedStudent.cognitive_average === null && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] sm:text-[11px] text-amber-800">
              {selectedStudent.full_name} belum memiliki nilai kognitif pada cakupan RT ini,
              sehingga titik siswa belum dapat ditempatkan pada grafik.
            </div>
          )}
      </div>

      {classPoints.length === 0 ? (
        <div className="px-5 py-12 text-center text-xs text-slate-500">
          Belum ada kelas dengan data kognitif yang cukup untuk dipetakan.
        </div>
      ) : (
        <div className="px-1 sm:px-3 pt-3 pb-4">
          <div className="h-[340px] sm:h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{
                  top: 24,
                  right: 54,
                  bottom: 22,
                  left: 2
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                />

                <XAxis
                  type="number"
                  dataKey="ziyadah"
                  name="Ziyadah"
                  domain={[0, 'auto']}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={{ stroke: '#cbd5e1' }}
                  label={{
                    value: 'Total baris Ziyadah',
                    position: 'insideBottom',
                    offset: -12,
                    fontSize: 10,
                    fill: '#64748b'
                  }}
                />

                <YAxis
                  type="number"
                  dataKey="cognitive"
                  name="Kognitif"
                  domain={[yMin, 100]}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={{ stroke: '#cbd5e1' }}
                  width={36}
                  label={{
                    value: 'Nilai kognitif',
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 10,
                    fill: '#64748b'
                  }}
                />

                <Tooltip
                  cursor={{
                    strokeDasharray: '3 3',
                    stroke: '#94a3b8'
                  }}
                  content={<CustomTooltip />}
                />

                <ReferenceLine
                  y={90}
                  stroke="#16a34a"
                  strokeWidth={1.5}
                  label={{
                    value: 'A ≥ 90',
                    fill: '#15803d',
                    fontSize: 9,
                    position: 'insideTopLeft'
                  }}
                />

                {xReferenceMedian !== null && (
                  <ReferenceLine
                    x={xReferenceMedian}
                    stroke="#94a3b8"
                    strokeDasharray="5 5"
                    label={{
                      value: 'Median kelas',
                      fill: '#64748b',
                      fontSize: 9,
                      position: 'insideTopRight'
                    }}
                  />
                )}

                <Scatter
                  name="Kelas"
                  data={classPoints}
                  shape={<ClassPointShape />}
                  isAnimationActive={false}
                />

                {selectedStudentPoint.length > 0 && (
                  <Scatter
                    name="Siswa"
                    data={selectedStudentPoint}
                    shape={<StudentPointShape />}
                    isAnimationActive={false}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="px-3 pt-1 text-[10px] text-slate-400 leading-relaxed">
            Pilih kelas pada filter halaman untuk menyorot titik kelas tanpa
            menghilangkan kelas pembanding. Cari siswa di atas grafik untuk
            menampilkan satu titik individu.
          </div>
        </div>
      )}
    </section>
  );
};
