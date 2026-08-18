import { SkillStatus, TargetSource } from '../types';

export interface TargetHolder {
  skill_status_start?: SkillStatus | string | null;
  target_lines?: number | string | null;
  target_nuroniyyah_lines?: number | string | null;
  target_iqra_pages?: number | string | null;
  target_source?: TargetSource | string | null;
  target_note?: string | null;
  [key: string]: any;
}

export interface HalaqahTargetHolder {
  target_ziyadah_lines?: number | string | null;
  target_nuroniyyah_lines?: number | string | null;
  target_iqra_pages?: number | string | null;
  [key: string]: any;
}

export interface EffectiveTargets {
  ziyadahLines: number | null;
  nuroniyyahLines: number | null;
  source: 'MANUAL' | 'HALAQAH';
  isManual: boolean;
  hasZiyadah: boolean;
  hasNuroniyyah: boolean;
  displayText: string;
  ziyadahText: string | null;
  nuroniyyahText: string | null;
}

/**
 * Formats student reading skill status for subtext display:
 * - NON_BBL -> "Non BBL"
 * - BBL -> "BBL"
 * - BBLS -> "BBLS"
 * - blank/null/undefined -> "Skill tidak diisi"
 * Never defaults blank skill to NON_BBL.
 */
export function formatSkillBadgeText(skill?: string | null): string {
  if (!skill) return 'Skill tidak diisi';
  const normalized = String(skill).trim().toUpperCase();
  if (normalized === 'NON_BBL') return 'Non BBL';
  if (normalized === 'BBL') return 'BBL';
  if (normalized === 'BBLS') return 'BBLS';
  return 'Skill tidak diisi';
}

/**
 * Derives the effective targets for a participant given optional Halaqah defaults.
 * 
 * Rules:
 * 1. Priority:
 *    - If participant target_source === 'MANUAL' and explicit target values exist, use them.
 *    - Otherwise, fallback to Halaqah default targets.
 * 2. Ziyadah Target uses participant.target_lines / halaqah.target_ziyadah_lines.
 * 3. Nuroniyyah Target uses participant.target_nuroniyyah_lines / halaqah.target_nuroniyyah_lines.
 *    (target_iqra_pages is legacy only and not used for new Nuroniyyah logic).
 * 4. Display Text follows skill_status_start:
 *    - NON_BBL: Nuroniyyah target only (e.g. "Nur 10 Baris")
 *    - BBL / BBLS: Ziyadah target only (e.g. "Zi 15 Baris")
 *    - blank/unknown: Both available targets (e.g. "Zi 15 Baris • Nur 10 Baris")
 */
export function getEffectiveTargets(
  participant?: TargetHolder | null,
  halaqah?: HalaqahTargetHolder | null,
  learningMode?: 'ZIYADAH' | 'NURONIYYAH' | null
): EffectiveTargets {
  const isManual = participant?.target_source === 'MANUAL';

  // 1. Ziyadah target calculation
  let ziyadahLines: number | null = null;
  if (isManual) {
    if (participant?.target_lines !== undefined && participant?.target_lines !== null && participant?.target_lines !== '') {
      const val = Number(participant.target_lines);
      if (!isNaN(val) && val >= 0) {
        ziyadahLines = val;
      }
    }
  } else {
    // Non-manual: prioritize Halaqah default
    if (halaqah?.target_ziyadah_lines !== undefined && halaqah?.target_ziyadah_lines !== null && halaqah?.target_ziyadah_lines !== '') {
      const val = Number(halaqah.target_ziyadah_lines);
      if (!isNaN(val) && val > 0) {
        ziyadahLines = val;
      }
    }
    // If halaqah has no target, fallback to participant target if > 0
    if (ziyadahLines === null && participant?.target_lines !== undefined && participant?.target_lines !== null && participant?.target_lines !== '') {
      const val = Number(participant.target_lines);
      if (!isNaN(val) && val > 0) {
        ziyadahLines = val;
      }
    }
  }

  // 2. Nuroniyyah target calculation (always in BARIS, target_nuroniyyah_lines with legacy target_iqra_pages fallback)
  let nuroniyyahLines: number | null = null;
  const getParticipantNur = (): number | null => {
    if (participant?.target_nuroniyyah_lines !== undefined && participant?.target_nuroniyyah_lines !== null && participant?.target_nuroniyyah_lines !== '') {
      const val = Number(participant.target_nuroniyyah_lines);
      if (!isNaN(val) && val > 0) return val;
    }
    if (participant?.target_iqra_pages !== undefined && participant?.target_iqra_pages !== null && participant?.target_iqra_pages !== '') {
      const val = Number(participant.target_iqra_pages);
      if (!isNaN(val) && val > 0) return val;
    }
    return null;
  };

  const getHalaqahNur = (): number | null => {
    if (halaqah?.target_nuroniyyah_lines !== undefined && halaqah?.target_nuroniyyah_lines !== null && halaqah?.target_nuroniyyah_lines !== '') {
      const val = Number(halaqah.target_nuroniyyah_lines);
      if (!isNaN(val) && val > 0) return val;
    }
    if (halaqah?.target_iqra_pages !== undefined && halaqah?.target_iqra_pages !== null && halaqah?.target_iqra_pages !== '') {
      const val = Number(halaqah.target_iqra_pages);
      if (!isNaN(val) && val > 0) return val;
    }
    return null;
  };

  if (isManual) {
    nuroniyyahLines = getParticipantNur();
  } else {
    // Non-manual: prioritize Halaqah default
    nuroniyyahLines = getHalaqahNur();
    // Fallback to participant if > 0
    if (nuroniyyahLines === null) {
      nuroniyyahLines = getParticipantNur();
    }
  }

  // Filter out non-positive Nuroniyyah
  if (nuroniyyahLines !== null && nuroniyyahLines <= 0) {
    nuroniyyahLines = null;
  }

  const hasZiyadah = ziyadahLines !== null && ziyadahLines > 0;
  const hasNuroniyyah = nuroniyyahLines !== null && nuroniyyahLines > 0;

  const ziyadahText = hasZiyadah ? `Zi ${ziyadahLines} Baris` : null;
  const nuroniyyahText = hasNuroniyyah ? `Nur ${nuroniyyahLines} Baris` : null;

  const skill = participant?.skill_status_start ? String(participant.skill_status_start).trim().toUpperCase() : '';

  let displayText = 'Belum ditentukan';

  if (skill === 'NON_BBL') {
    displayText = nuroniyyahText || 'Belum ditentukan';
  } else {
    // All conditions other than NON_BBL (BBL, BBLS, blank, null, undefined) -> Ziyadah ONLY
    displayText = ziyadahText || 'Belum ditentukan';
  }

  return {
    ziyadahLines,
    nuroniyyahLines,
    source: isManual ? 'MANUAL' : 'HALAQAH',
    isManual,
    hasZiyadah,
    hasNuroniyyah,
    displayText,
    ziyadahText,
    nuroniyyahText
  };
}

/**
 * Returns formatted target text according to effective targets.
 */
export function formatParticipantTarget(
  p?: TargetHolder | null,
  halaqah?: HalaqahTargetHolder | null,
  learningMode?: 'ZIYADAH' | 'NURONIYYAH' | null
): string {
  if (!p && !halaqah) return 'Belum ditentukan';
  const effective = getEffectiveTargets(p, halaqah, learningMode);
  return effective.displayText;
}

/**
 * Formats split progress display for student table:
 * If totalZiyadahLinesAdded > 0 AND totalNuroniyyahLinesAdded > 0:
 *   "Zi +X • Nur +Y Baris"
 * If only Ziyadah > 0:
 *   "Zi +X Baris"
 * If only Nuroniyyah > 0:
 *   "Nur +Y Baris"
 * If both are 0:
 *   "0 Baris"
 */
export function formatSplitProgressDisplay(student: {
  totalZiyadahLinesAdded?: number;
  totalNuroniyyahLinesAdded?: number;
  totalLinesAdded?: number;
  [key: string]: any;
}): string {
  const zi = Number(student.totalZiyadahLinesAdded ?? (student.totalNuroniyyahLinesAdded !== undefined ? 0 : student.totalLinesAdded ?? 0)) || 0;
  const nur = Number(student.totalNuroniyyahLinesAdded) || 0;

  if (zi > 0 && nur > 0) {
    return `Zi +${zi} • Nur +${nur} Baris`;
  }
  if (zi > 0) {
    return `Zi +${zi} Baris`;
  }
  if (nur > 0) {
    return `Nur +${nur} Baris`;
  }
  return '0 Baris';
}
