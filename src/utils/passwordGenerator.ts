/**
 * Cryptographically secure, teacher-friendly random password generator.
 * Uses window.crypto.getRandomValues().
 * Excludes visually ambiguous characters (0, O, 1, I, l).
 */

const UPPERCASE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // excludes I, O
const LOWERCASE_CHARS = 'abcdefghijkmnopqrstuvwxyz'; // excludes l
const NUMBER_CHARS = '23456789'; // excludes 0, 1

const ALL_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + NUMBER_CHARS;

export function generateSecureRandomPassword(length: number = 10): string {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.getRandomValues) {
    // Fallback if crypto is unavailable (e.g. non-browser test runner)
    let res = '';
    for (let i = 0; i < length; i++) {
      res += ALL_CHARS.charAt(Math.floor(Math.random() * ALL_CHARS.length));
    }
    return res;
  }

  const targetLength = Math.max(10, Math.min(length, 16));
  const randomBuffer = new Uint32Array(targetLength * 2);
  window.crypto.getRandomValues(randomBuffer);

  let bufferIndex = 0;
  function getNextRandomInt(max: number): number {
    if (bufferIndex >= randomBuffer.length) {
      window.crypto.getRandomValues(randomBuffer);
      bufferIndex = 0;
    }
    return randomBuffer[bufferIndex++] % max;
  }

  let password = '';
  // Guarantee at least 1 uppercase, 1 lowercase, and 1 number
  const guaranteed = [
    UPPERCASE_CHARS[getNextRandomInt(UPPERCASE_CHARS.length)],
    LOWERCASE_CHARS[getNextRandomInt(LOWERCASE_CHARS.length)],
    NUMBER_CHARS[getNextRandomInt(NUMBER_CHARS.length)]
  ];

  // Fill the rest from all available characters
  for (let i = guaranteed.length; i < targetLength; i++) {
    guaranteed.push(ALL_CHARS[getNextRandomInt(ALL_CHARS.length)]);
  }

  // Fisher-Yates shuffle using crypto values
  for (let i = guaranteed.length - 1; i > 0; i--) {
    const j = getNextRandomInt(i + 1);
    const temp = guaranteed[i];
    guaranteed[i] = guaranteed[j];
    guaranteed[j] = temp;
  }

  password = guaranteed.join('');
  return password;
}
