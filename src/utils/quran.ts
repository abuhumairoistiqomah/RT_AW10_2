import { MASTER_SURAHS } from '../data/surahs';
import { Surah } from '../types';

/**
 * Search surahs by query string (number, full name, alias, arabic).
 * Handles cases like "mulk", "67", "67 - Al-Mulk", "An-Naba", " Amma " etc.
 */
export function searchSurahs(query: string): Surah[] {
  if (!query || !query.trim()) {
    return MASTER_SURAHS;
  }

  const cleanQuery = query.toLowerCase().trim();

  // If user typed a pure number
  if (/^\d+$/.test(cleanQuery)) {
    const no = parseInt(cleanQuery, 10);
    return MASTER_SURAHS.filter(s => s.surah_no === no || s.surah_no.toString().includes(cleanQuery));
  }

  return MASTER_SURAHS.filter(s => {
    const noStr = s.surah_no.toString();
    const name = s.surah_name.toLowerCase();
    const alias = s.surah_alias.toLowerCase();
    const arabic = s.surah_name_arabic.toLowerCase();

    return (
      noStr === cleanQuery ||
      name.includes(cleanQuery) ||
      alias.includes(cleanQuery) ||
      arabic.includes(cleanQuery)
    );
  });
}

export function getSurahByNo(surahNo: number): Surah | undefined {
  return MASTER_SURAHS.find(s => s.surah_no === surahNo);
}

export function getSurahNameFormatted(surahNo?: number | null): string {
  if (surahNo == null || isNaN(Number(surahNo)) || Number(surahNo) <= 0) return '';
  const s = getSurahByNo(Number(surahNo));
  if (!s) return `Surah #${surahNo}`;
  return `${s.surah_no}. ${s.surah_name}`;
}

/**
 * Safe progress formatter for student assessment / setoran display.
 * Rules:
 * 1. If no valid saved progress exists, returns "0" (never undefined, null, Surah #undefined, or NaN).
 * 2. For ZIYADAH: returns e.g. "78. An-Naba' : 1–15 (15 Baris)" when valid fields exist.
 * 3. For NURONIYYAH: returns e.g. "Ad-Dars 6 (8 Baris)" or "Nuroniyyah • Ad-Dars 1 (10 Baris)".
 * 4. For IQRA (Legacy): returns e.g. "Iqra 3 • Halaman 12–15".
 * 5. Treats 0 as a valid numeric value with strict nullish checks.
 */
export function formatCurrentProgress(assessment?: any | null): string {
  if (!assessment || typeof assessment !== 'object') {
    return '0';
  }

  // Check NURONIYYAH mode
  const isNuroniyyah = assessment.assessment_mode === 'NURONIYYAH' || (assessment.nuroniyyah_dars != null && !assessment.surah_end && !assessment.surah_start);
  if (isNuroniyyah) {
    const dars = assessment.nuroniyyah_dars ? String(assessment.nuroniyyah_dars).trim() : 'Nuroniyyah';
    const lines = assessment.lines_added != null && !isNaN(Number(assessment.lines_added)) ? Number(assessment.lines_added) : null;
    if (lines != null) {
      return `${dars} (${lines} Baris)`;
    }
    return dars;
  }

  // Check IQRA mode (Legacy)
  const isIqra = assessment.assessment_mode === 'IQRA' || (assessment.iqra_level != null && !assessment.surah_end && !assessment.surah_start);
  if (isIqra) {
    const level = assessment.iqra_level != null && !isNaN(Number(assessment.iqra_level)) ? Number(assessment.iqra_level) : null;
    const pageStart = assessment.iqra_page_start != null && !isNaN(Number(assessment.iqra_page_start)) ? Number(assessment.iqra_page_start) : null;
    const pageEnd = assessment.iqra_page_end != null && !isNaN(Number(assessment.iqra_page_end)) ? Number(assessment.iqra_page_end) : null;

    if (level == null && pageStart == null && pageEnd == null) {
      return '0';
    }

    const levelText = level != null ? `Iqra ${level}` : 'Iqra';
    let pageText = '';
    if (pageStart != null && pageEnd != null && pageStart !== pageEnd) {
      pageText = `Halaman ${pageStart}–${pageEnd}`;
    } else if (pageStart != null) {
      pageText = `Halaman ${pageStart}`;
    } else if (pageEnd != null) {
      pageText = `Halaman ${pageEnd}`;
    }

    return pageText ? `${levelText} • ${pageText}` : levelText;
  }

  // Check ZIYADAH / Surah mode
  const rawSurahNo = assessment.surah_end != null ? assessment.surah_end : assessment.surah_start;
  const hasValidSurah = rawSurahNo != null && !isNaN(Number(rawSurahNo)) && Number(rawSurahNo) > 0;

  if (hasValidSurah) {
    const surahNo = Number(rawSurahNo);
    const surahName = getSurahNameFormatted(surahNo);

    const ayahStart = assessment.ayah_start != null && !isNaN(Number(assessment.ayah_start)) ? Number(assessment.ayah_start) : null;
    const ayahEnd = assessment.ayah_end != null && !isNaN(Number(assessment.ayah_end)) ? Number(assessment.ayah_end) : null;

    let ayahRange = '';
    if (ayahStart != null && ayahEnd != null) {
      ayahRange = ayahStart === ayahEnd ? `${ayahStart}` : `${ayahStart}–${ayahEnd}`;
    } else if (ayahEnd != null) {
      ayahRange = `${ayahEnd}`;
    } else if (ayahStart != null) {
      ayahRange = `${ayahStart}`;
    }

    const rawLines = assessment.lines_added;
    const linesAdded = rawLines != null && !isNaN(Number(rawLines)) ? Number(rawLines) : null;
    const linesSuffix = linesAdded != null ? ` (${linesAdded} Baris)` : '';

    if (ayahRange) {
      return `${surahName} : ${ayahRange}${linesSuffix}`;
    }
    return `${surahName}${linesSuffix}`;
  }

  // Fallback: if total lines added or lines_added is valid number > 0
  if (assessment.lines_added != null && !isNaN(Number(assessment.lines_added)) && Number(assessment.lines_added) > 0) {
    return `${Number(assessment.lines_added)} Baris`;
  }

  return '0';
}

/**
 * Validate whether ayah number is valid for a given surah.
 */
export function validateAyah(surahNo: number, ayahNo: number): { valid: boolean; maxAyah: number; message?: string } {
  const s = getSurahByNo(surahNo);
  if (!s) {
    return { valid: false, maxAyah: 0, message: `Surah #${surahNo} tidak ditemukan.` };
  }
  if (ayahNo < 1) {
    return { valid: false, maxAyah: s.total_ayah, message: 'Ayat harus lebih besar dari 0.' };
  }
  if (ayahNo > s.total_ayah) {
    return { valid: false, maxAyah: s.total_ayah, message: `${s.surah_name} hanya memiliki ${s.total_ayah} ayat.` };
  }
  return { valid: true, maxAyah: s.total_ayah };
}
