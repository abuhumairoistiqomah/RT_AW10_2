/**
 * Generates a random, human-readable access code with prefix 'RT-' and 6 random uppercase alphanumeric characters.
 * Excludes ambiguous characters (0, O, 1, I, L) to avoid user confusion.
 * E.g., RT-K7M4Q9
 */
export function generateRandomAccessCode(existingCodes: string[] = []): string {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let code = '';
  do {
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `RT-${rand}`;
  } while (existingCodes.includes(code));
  return code;
}

/**
 * Visually masks an access code (e.g. RT-K7M4Q9 -> RT-••••Q9).
 */
export function maskAccessCode(code: string): string {
  if (!code) return '';
  if (!code.startsWith('RT-') || code.length < 5) {
    return '••••••';
  }
  const last2 = code.slice(-2);
  return `RT-••••${last2}`;
}
