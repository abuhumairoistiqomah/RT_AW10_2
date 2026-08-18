/**
 * Utility functions for student data operations
 */

export interface HasClassName {
  class_name?: string | null;
}

/**
 * Extracts unique non-empty class names from a collection and sorts them naturally
 * (e.g. 1..9 before 10..12, preserving natural numeric ordering).
 */
export function getUniqueClassesSorted(items: HasClassName[]): string[] {
  const classSet = new Set<string>();
  items.forEach(item => {
    if (item.class_name && typeof item.class_name === 'string') {
      const trimmed = item.class_name.trim();
      if (trimmed) {
        classSet.add(trimmed);
      }
    }
  });

  return Array.from(classSet).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}
