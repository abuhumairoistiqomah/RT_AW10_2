import { SkillStatus, TargetSource } from '../types';

export interface TargetHolder {
  skill_status_start?: SkillStatus | string | null;
  target_lines?: number | string | null;
  target_nuroniyyah_lines?: number | string | null;
  target_iqra_pages?: number | string | null;
  target_source?: TargetSource | string | null;
}

/**
 * Returns formatted target text according to skill status and targets:
 * - target_lines => "Target: X Baris"
 * - target_nuroniyyah_lines => "Target: X Baris Nuroniyyah"
 * - If blank/unset => "Belum ditentukan"
 */
export function formatParticipantTarget(p: TargetHolder | null | undefined): string {
  if (!p) return 'Belum ditentukan';

  const nuroniyyahLines = p.target_nuroniyyah_lines != null && p.target_nuroniyyah_lines !== '' ? Number(p.target_nuroniyyah_lines) : null;
  const targetLines = p.target_lines != null && p.target_lines !== '' ? Number(p.target_lines) : null;
  const iqraPages = p.target_iqra_pages != null && p.target_iqra_pages !== '' ? Number(p.target_iqra_pages) : null;

  if (targetLines !== null && !isNaN(targetLines) && targetLines > 0) {
    return `Target: ${targetLines} Baris`;
  }

  if (nuroniyyahLines !== null && !isNaN(nuroniyyahLines) && nuroniyyahLines > 0) {
    return `Target: ${nuroniyyahLines} Baris Nuroniyyah`;
  }

  if (targetLines === 0) {
    return `Target: 0 Baris`;
  }

  if (nuroniyyahLines === 0) {
    return `Target: 0 Baris Nuroniyyah`;
  }

  // Fallback for legacy target_iqra_pages
  if (iqraPages !== null && !isNaN(iqraPages) && iqraPages > 0) {
    return `Target: ${iqraPages} Baris`;
  }

  return 'Belum ditentukan';
}

