/**
 * quranLineCalculator.ts
 *
 * Automatic Ziyadah line calculator using quran-qcf4 verse-to-page/line metadata.
 *
 * School traversal rule:
 * - within a surah, ayat progress always moves forward (e.g. 1 -> 6)
 * - across surahs, progress may move FORWARD (2 -> 3 -> 4) or BACKWARD_BY_SURAH
 *   (114 -> 113 -> 112), while ayat inside every surah still move 1 -> end
 * - one unique physical Mushaf line touched = 1 baris
 * - a partially touched line still counts as 1
 * - a line shared by multiple ayat is counted only once for the calculated range
 *
 * Runtime strategy:
 * - memory cache first
 * - localStorage compact cache second
 * - pinned jsDelivr dataset fetch only when the device has never cached it
 * - GitHub Raw fallback if jsDelivr is unavailable
 *
 * This does NOT call Google Apps Script.
 */

export type QuranTraversalDirection =
  | 'SAME_SURAH'
  | 'FORWARD'
  | 'BACKWARD_SURAH';

export type QuranPoint = {
  surah: number;
  ayah: number;
};

export type QuranLineRange = {
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
};

export type QuranLineBreakdown = {
  page: number;
  lines: number[];
};

export type QuranLineResult = {
  totalLines: number;
  verseCount: number;
  breakdown: QuranLineBreakdown[];
  direction: QuranTraversalDirection;
  verseKeys: string[];
};

export type QuranProgressDeltaResult = QuranLineResult & {
  isExtension: boolean;
  previousLimit: QuranPoint;
  newLimit: QuranPoint;
  firstNewVerse?: QuranPoint;
  lastNewVerse?: QuranPoint;
};

type RawVerseEntry = {
  page?: number;
  lines?: Array<{
    line?: number;
    word_start?: number;
    word_end?: number;
  }>;
};

type RawVerseIndex = Record<string, RawVerseEntry>;
// Compact shape stored on the device: verse key -> [page, [line numbers]]
type CompactVerseIndex = Record<string, [number, number[]]>;

const CACHE_KEY = 'rt_quran_qcf4_line_index_v1';
const PRIMARY_URL =
  'https://cdn.jsdelivr.net/npm/quran-qcf4@1.1.0/verses.json';
const FALLBACK_URL =
  'https://raw.githubusercontent.com/MohamadHajjRabee/quran-qcf4/main/verses.json';

let memoryIndex: CompactVerseIndex | null = null;
let loadingPromise: Promise<CompactVerseIndex> | null = null;
let surahVerseCounts: Map<number, number> | null = null;

const keyOf = (surah: number, ayah: number): string =>
  `${Number(surah)}:${Number(ayah)}`;

const parseVerseKey = (key: string): QuranPoint => {
  const [surah, ayah] = key.split(':').map(Number);
  return { surah, ayah };
};

const normalizeRawIndex = (
  raw: RawVerseIndex
): CompactVerseIndex => {
  const compact: CompactVerseIndex = {};

  for (const [verseKey, entry] of Object.entries(raw || {})) {
    const page = Number(entry?.page);
    const lines = Array.isArray(entry?.lines)
      ? Array.from(
          new Set(
            entry.lines
              .map(item => Number(item?.line))
              .filter(
                line =>
                  Number.isFinite(line) &&
                  line >= 1 &&
                  line <= 15
              )
          )
        ).sort((a, b) => a - b)
      : [];

    if (
      Number.isFinite(page) &&
      page >= 1 &&
      page <= 604 &&
      lines.length > 0
    ) {
      compact[verseKey] = [page, lines];
    }
  }

  return compact;
};

const buildSurahCounts = (index: CompactVerseIndex) => {
  const counts = new Map<number, number>();

  Object.keys(index).forEach(key => {
    const { surah, ayah } = parseVerseKey(key);
    const previous = counts.get(surah) || 0;
    if (ayah > previous) counts.set(surah, ayah);
  });

  surahVerseCounts = counts;
};

const readLocalCache = (): CompactVerseIndex | null => {
  try {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CompactVerseIndex;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Object.keys(parsed).length < 6000
    ) {
      window.localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn(
      '[QuranLineCalculator] Cache lokal rusak/tidak dapat dibaca:',
      error
    );
    return null;
  }
};

const writeLocalCache = (index: CompactVerseIndex) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(index));
  } catch (error) {
    console.warn(
      '[QuranLineCalculator] Gagal menyimpan cache lokal:',
      error
    );
  }
};

const fetchJson = async (url: string): Promise<RawVerseIndex> => {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'force-cache'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as RawVerseIndex;
};

const fetchDataset = async (): Promise<CompactVerseIndex> => {
  let lastError: unknown = null;

  for (const url of [PRIMARY_URL, FALLBACK_URL]) {
    try {
      const raw = await fetchJson(url);
      const compact = normalizeRawIndex(raw);

      if (Object.keys(compact).length < 6000) {
        throw new Error('Dataset baris Al-Qur’an tidak lengkap.');
      }

      writeLocalCache(compact);
      return compact;
    } catch (error) {
      lastError = error;
      console.warn(
        `[QuranLineCalculator] Gagal memuat ${url}:`,
        error
      );
    }
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : 'Dataset baris Al-Qur’an belum dapat dimuat.'
  );
};

export const loadQuranLineIndex =
  async (): Promise<CompactVerseIndex> => {
    if (memoryIndex) {
      if (!surahVerseCounts) buildSurahCounts(memoryIndex);
      return memoryIndex;
    }

    const cached = readLocalCache();

    if (cached) {
      memoryIndex = cached;
      buildSurahCounts(cached);
      return cached;
    }

    if (!loadingPromise) {
      loadingPromise = fetchDataset().finally(() => {
        loadingPromise = null;
      });
    }

    memoryIndex = await loadingPromise;
    buildSurahCounts(memoryIndex);
    return memoryIndex;
  };

const assertPoint = (
  index: CompactVerseIndex,
  point: QuranPoint,
  label: string
) => {
  if (!index[keyOf(point.surah, point.ayah)]) {
    throw new Error(
      `${label} ${point.surah}:${point.ayah} tidak ditemukan pada Mushaf acuan.`
    );
  }
};

const getVerseCount = (
  surah: number
): number => {
  const count = surahVerseCounts?.get(Number(surah));
  if (!count) {
    throw new Error(`Jumlah ayat Surah ${surah} tidak tersedia.`);
  }
  return count;
};

const getDirection = (
  start: QuranPoint,
  end: QuranPoint
): QuranTraversalDirection => {
  if (start.surah === end.surah) return 'SAME_SURAH';
  return start.surah < end.surah
    ? 'FORWARD'
    : 'BACKWARD_SURAH';
};

/**
 * Build the actual school-study path.
 *
 * Example BACKWARD_SURAH:
 * 114:1 -> 112:3 becomes
 * 114:1..6, 113:1..5, 112:1..3
 *
 * Notice that ayat inside each surah still move forward.
 */
const buildStudyPath = (
  index: CompactVerseIndex,
  start: QuranPoint,
  end: QuranPoint
): {
  direction: QuranTraversalDirection;
  verseKeys: string[];
} => {
  assertPoint(index, start, 'Ayat awal');
  assertPoint(index, end, 'Ayat akhir');

  const direction = getDirection(start, end);
  const verseKeys: string[] = [];

  if (direction === 'SAME_SURAH') {
    if (end.ayah < start.ayah) {
      throw new Error(
        'Dalam surah yang sama, ayat akhir harus sama atau lebih besar dari ayat awal.'
      );
    }

    for (let ayah = start.ayah; ayah <= end.ayah; ayah += 1) {
      verseKeys.push(keyOf(start.surah, ayah));
    }

    return { direction, verseKeys };
  }

  const step = direction === 'FORWARD' ? 1 : -1;

  for (
    let surah = start.surah;
    direction === 'FORWARD'
      ? surah <= end.surah
      : surah >= end.surah;
    surah += step
  ) {
    const maxAyah = getVerseCount(surah);

    const firstAyah =
      surah === start.surah ? start.ayah : 1;
    const lastAyah =
      surah === end.surah ? end.ayah : maxAyah;

    if (lastAyah < firstAyah) {
      throw new Error(
        `Rentang ayat Surah ${surah} tidak valid.`
      );
    }

    for (let ayah = firstAyah; ayah <= lastAyah; ayah += 1) {
      const key = keyOf(surah, ayah);
      if (!index[key]) {
        throw new Error(
          `Ayat ${key} tidak ditemukan pada Mushaf acuan.`
        );
      }
      verseKeys.push(key);
    }
  }

  return { direction, verseKeys };
};

const collectTouchedLines = (
  index: CompactVerseIndex,
  verseKeys: string[]
): {
  lineKeys: Set<string>;
  breakdown: QuranLineBreakdown[];
} => {
  const lineKeys = new Set<string>();
  const pageMap = new Map<number, Set<number>>();

  for (const verseKey of verseKeys) {
    const entry = index[verseKey];
    if (!entry) continue;

    const [page, lines] = entry;

    for (const line of lines) {
      lineKeys.add(`${page}:${line}`);

      if (!pageMap.has(page)) {
        pageMap.set(page, new Set<number>());
      }

      pageMap.get(page)!.add(line);
    }
  }

  return {
    lineKeys,
    breakdown: [...pageMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([page, lines]) => ({
        page,
        lines: [...lines].sort((a, b) => a - b)
      }))
  };
};

export const calculateQuranPhysicalLines = async (
  range: QuranLineRange
): Promise<QuranLineResult> => {
  const index = await loadQuranLineIndex();

  const start: QuranPoint = {
    surah: Number(range.startSurah),
    ayah: Number(range.startAyah)
  };
  const end: QuranPoint = {
    surah: Number(range.endSurah),
    ayah: Number(range.endAyah)
  };

  const { direction, verseKeys } = buildStudyPath(
    index,
    start,
    end
  );

  const touched = collectTouchedLines(index, verseKeys);

  return {
    totalLines: touched.lineKeys.size,
    verseCount: verseKeys.length,
    breakdown: touched.breakdown,
    direction,
    verseKeys
  };
};

/**
 * Calculate ONLY the physical lines newly added after a previous memorization
 * limit, relative to the first real Ziyadah point of this RT event.
 *
 * Why use the origin?
 * It lets us subtract cumulative touched-line sets, so a physical line shared
 * by the previous boundary ayat and the newly memorized ayat is not counted
 * twice.
 */
export const calculateQuranProgressDelta = async (params: {
  origin: QuranPoint;
  previousLimit: QuranPoint;
  newLimit: QuranPoint;
}): Promise<QuranProgressDeltaResult> => {
  const index = await loadQuranLineIndex();

  const full = buildStudyPath(
    index,
    params.origin,
    params.newLimit
  );

  const previousKey = keyOf(
    params.previousLimit.surah,
    params.previousLimit.ayah
  );

  const previousPosition = full.verseKeys.indexOf(previousKey);

  if (previousPosition < 0) {
    return {
      totalLines: 0,
      verseCount: 0,
      breakdown: [],
      direction: full.direction,
      verseKeys: [],
      isExtension: false,
      previousLimit: params.previousLimit,
      newLimit: params.newLimit
    };
  }

  const previousVerseKeys = full.verseKeys.slice(
    0,
    previousPosition + 1
  );
  const newVerseKeys = full.verseKeys.slice(
    previousPosition + 1
  );

  const before = collectTouchedLines(index, previousVerseKeys);
  const after = collectTouchedLines(index, full.verseKeys);

  const deltaLineKeys = new Set<string>();
  after.lineKeys.forEach(key => {
    if (!before.lineKeys.has(key)) deltaLineKeys.add(key);
  });

  const pageMap = new Map<number, Set<number>>();
  deltaLineKeys.forEach(key => {
    const [pageText, lineText] = key.split(':');
    const page = Number(pageText);
    const line = Number(lineText);

    if (!pageMap.has(page)) pageMap.set(page, new Set<number>());
    pageMap.get(page)!.add(line);
  });

  return {
    totalLines: deltaLineKeys.size,
    verseCount: newVerseKeys.length,
    breakdown: [...pageMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([page, lines]) => ({
        page,
        lines: [...lines].sort((a, b) => a - b)
      })),
    direction: full.direction,
    verseKeys: newVerseKeys,
    isExtension: true,
    previousLimit: params.previousLimit,
    newLimit: params.newLimit,
    firstNewVerse:
      newVerseKeys.length > 0
        ? parseVerseKey(newVerseKeys[0])
        : undefined,
    lastNewVerse:
      newVerseKeys.length > 0
        ? parseVerseKey(newVerseKeys[newVerseKeys.length - 1])
        : undefined
  };
};

export const warmQuranLineCalculator = async (): Promise<void> => {
  try {
    await loadQuranLineIndex();
  } catch {
    // Silent by design. Manual input remains available.
  }
};
