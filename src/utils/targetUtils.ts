import { SkillStatus, TargetSource } from '../types';

export interface TargetHolder {
  skill_status_start?: SkillStatus | string | null;
  target_lines?: number | string | null;
  target_iqra_pages?: number | string | null;
  target_source?: TargetSource | string | null;
}

/**
 * Returns formatted target text according to skill status and targets:
 * - NON_BBL with target_iqra_pages => "Target: X Halaman Iqra"
 * - BBL / BBLS or with target_lines => "Target: X Baris Ziyadah"
 * - If blank/unset => "Belum ditentukan" (never "Target: 0 Baris" for Iqra)
 */
export function formatParticipantTarget(p: TargetHolder | null | undefined): string {
  if (!p) return 'Belum ditentukan';

  const skill = p.skill_status_start ? String(p.skill_status_start).toUpperCase() : '';
  const iqraPages = p.target_iqra_pages != null && p.target_iqra_pages !== '' ? Number(p.target_iqra_pages) : null;
  const ziyadahLines = p.target_lines != null && p.target_lines !== '' ? Number(p.target_lines) : null;

  if (skill === 'NON_BBL') {
    if (iqraPages !== null && !isNaN(iqraPages) && iqraPages > 0) {
      return `Target: ${iqraPages} Halaman Iqra`;
    }
    if (iqraPages === 0) {
      return `Target: 0 Halaman Iqra`;
    }
    // If no Iqra target is specified
    return 'Belum ditentukan';
  }

  // For BBL / BBLS or general Ziyadah
  if (ziyadahLines !== null && !isNaN(ziyadahLines) && ziyadahLines > 0) {
    return `Target: ${ziyadahLines} Baris Ziyadah`;
  }
  if (ziyadahLines === 0 && (skill === 'BBL' || skill === 'BBLS')) {
    return `Target: 0 Baris Ziyadah`;
  }

  // Fallback if iqraPages exists when skill wasn't explicitly set
  if (iqraPages !== null && !isNaN(iqraPages) && iqraPages > 0) {
    return `Target: ${iqraPages} Halaman Iqra`;
  }

  return 'Belum ditentukan';
}
