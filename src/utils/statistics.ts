import { SummaryStats, DistributionBucket, SessionAssessment, EventParticipant, SkillStatus, SkillTransition } from '../types';

/**
 * Calculates key statistical measures for a numeric array.
 * Robust against empty arrays or single item arrays.
 */
export function calculateStats(values: number[]): SummaryStats {
  const sanitized = (values || []).filter(
    v => typeof v === 'number' && Number.isFinite(v) && !isNaN(v) && v >= 0
  );

  if (sanitized.length === 0) {
    return {
      count: 0,
      totalLines: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      cv: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      lowerWhisker: 0,
      upperWhisker: 0,
      bottom25Avg: 0,
      completionRate: 0,
      outliers: []
    };
  }

  const sorted = [...sanitized].sort((a, b) => a - b);
  const count = sorted.length;
  const totalLines = sorted.reduce((acc, v) => acc + v, 0);
  const mean = totalLines / count;

  // Median calculation
  let median = 0;
  const mid = Math.floor(count / 2);
  if (count % 2 === 0) {
    median = (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    median = sorted[mid];
  }

  // Population Standard Deviation (denominator = count)
  let stdDev = 0;
  if (count > 0) {
    const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
    stdDev = Math.sqrt(variance);
  }

  // Coefficient of Variation (CV as ratio)
  const cv = mean > 0 ? stdDev / mean : 0;

  // Min and Max
  const min = sorted[0];
  const max = sorted[count - 1];

  // Quartiles (Q1 & Q3) using standard percentile approximation
  const q1 = getPercentile(sorted, 25);
  const q3 = getPercentile(sorted, 75);
  const iqr = q3 - q1;

  // Outliers & Tukey Whiskers
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const outliers = sorted.filter(v => v < lowerBound || v > upperBound);

  const inBoundValues = sorted.filter(v => v >= lowerBound && v <= upperBound);
  const lowerWhisker = inBoundValues.length > 0 ? inBoundValues[0] : min;
  const upperWhisker = inBoundValues.length > 0 ? inBoundValues[inBoundValues.length - 1] : max;

  // Bottom 25% performance
  const bottom25Count = Math.max(1, Math.ceil(count * 0.25));
  const bottom25Values = sorted.slice(0, bottom25Count);
  const bottom25Avg = bottom25Values.reduce((acc, v) => acc + v, 0) / bottom25Values.length;

  return {
    count,
    totalLines,
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    cv: Number(cv.toFixed(3)),
    min,
    max,
    q1: Number(q1.toFixed(2)),
    q3: Number(q3.toFixed(2)),
    iqr: Number(iqr.toFixed(2)),
    lowerWhisker,
    upperWhisker,
    bottom25Avg: Number(bottom25Avg.toFixed(2)),
    completionRate: 0, // Calculated at caller level with completion status
    outliers
  };
}

function getPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sorted.length) return sorted[sorted.length - 1];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Categorize lines added into distribution buckets.
 */
export function getDistributionBuckets(values: number[]): DistributionBucket[] {
  const sanitized = (values || []).filter(
    v => typeof v === 'number' && Number.isFinite(v) && !isNaN(v) && v >= 0
  );
  const total = sanitized.length || 1;
  let range0_10 = 0;
  let range11_20 = 0;
  let range21_30 = 0;
  let rangeOver30 = 0;

  sanitized.forEach(v => {
    if (v <= 10) range0_10++;
    else if (v <= 20) range11_20++;
    else if (v <= 30) range21_30++;
    else rangeOver30++;
  });

  return [
    { range: '0–10 Baris', count: range0_10, percentage: Number(((range0_10 / total) * 100).toFixed(1)) },
    { range: '11–20 Baris', count: range11_20, percentage: Number(((range11_20 / total) * 100).toFixed(1)) },
    { range: '21–30 Baris', count: range21_30, percentage: Number(((range21_30 / total) * 100).toFixed(1)) },
    { range: '> 30 Baris', count: rangeOver30, percentage: Number(((rangeOver30 / total) * 100).toFixed(1)) },
  ];
}

/**
 * Calculates sum of lines added per student for active non-deleted assessments.
 */
export function getStudentLinesMap(
  assessments: SessionAssessment[]
): Record<string, number> {
  const map: Record<string, number> = {};

  assessments
    .filter(a => !a.is_deleted && a.attendance_status === 'PRESENT')
    .forEach(a => {
      map[a.student_id] = (map[a.student_id] || 0) + (a.lines_added || 0);
    });

  return map;
}

/**
 * Compute skill transitions (start vs end skill)
 * calculateSkillTransitions must NOT treat missing final evaluation as unchanged skill.
 * Only calculate transitions when a real final skill exists.
 * Returns 3x3 matrix transitions array and notEvaluatedSkillCount.
 */
export function calculateSkillTransitions(
  participants: EventParticipant[],
  evaluationsMap: Record<string, SkillStatus> // student_id or participant_id -> skill_status_end
): { transitions: SkillTransition[]; notEvaluatedSkillCount: number; missingSkillStartCount: number } {
  const map: Record<string, number> = {};
  let notEvaluatedSkillCount = 0;
  let missingSkillStartCount = 0;

  participants.forEach(p => {
    const endSkill = evaluationsMap[p.student_id] || evaluationsMap[p.participant_id];
    if (!endSkill) {
      notEvaluatedSkillCount++;
      return; // Skip if no real final evaluation skill exists
    }

    const from = p.skill_status_start;
    if (!from) {
      missingSkillStartCount++;
      return; // Skip if no start skill status exists
    }

    const to = endSkill;
    const key = `${from}->${to}`;
    map[key] = (map[key] || 0) + 1;
  });

  const transitions: SkillTransition[] = [];
  const statuses: SkillStatus[] = ['NON_BBL', 'BBL', 'BBLS'];

  statuses.forEach(from => {
    statuses.forEach(to => {
      const key = `${from}->${to}`;
      transitions.push({ from, to, count: map[key] || 0 });
    });
  });

  return { transitions, notEvaluatedSkillCount, missingSkillStartCount };
}
