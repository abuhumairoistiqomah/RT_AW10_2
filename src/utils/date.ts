/**
 * Date formatting helpers according to specification:
 * Date display: dd/MM/yyyy (e.g. 05/09/2026)
 * DateTime display: dd/MM/yyyy HH:mm:ss (e.g. 05/09/2026 14:30:00)
 */

export function formatDate(dateStringOrObj?: string | Date | null): string {
  if (!dateStringOrObj) return '-';
  const date = typeof dateStringOrObj === 'string' ? new Date(dateStringOrObj) : dateStringOrObj;
  if (isNaN(date.getTime())) return String(dateStringOrObj);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

export function formatDateTime(dateStringOrObj?: string | Date | null): string {
  if (!dateStringOrObj) return '-';
  const date = typeof dateStringOrObj === 'string' ? new Date(dateStringOrObj) : dateStringOrObj;
  if (isNaN(date.getTime())) return String(dateStringOrObj);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export function getCurrentIso(): string {
  return new Date().toISOString();
}
