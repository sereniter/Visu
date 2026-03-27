/**
 * Deterministic SSML formatter for TTS.
 * Wraps text in <speak>, applies prosody rate, and inserts small pauses after punctuation.
 */

const PUNCTUATION_PAUSE_MS = 200;
const PUNCTUATION_CHARS = [".", "!", "?", ",", ";", ":"];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Insert a small SSML break after each occurrence of punctuation characters.
 * Deterministic: processes the string in order.
 */
function insertPausesAfterPunctuation(text: string): string {
  const escaped = escapeXml(text);
  let result = "";
  for (let i = 0; i < escaped.length; i++) {
    result += escaped[i];
    if (PUNCTUATION_CHARS.includes(escaped[i])) {
      result += `<break time="${PUNCTUATION_PAUSE_MS}ms"/>`;
    }
  }
  return result;
}

/**
 * Format speech rate for SSML prosody.
 * speechRate 1.0 = normal; < 1 = slower, > 1 = faster.
 * SSML rate is often a percentage string (e.g. "95%" for slightly slower).
 */
function rateToProsody(speechRate: number): string {
  const pct = Math.round(speechRate * 100);
  return `${pct}%`;
}

/**
 * Build a deterministic SSML string from plain text and options.
 *
 * @param text - Plain narration text (will be XML-escaped).
 * @param speechRate - Relative speed (e.g. 0.95 = slightly slower). Used for <prosody rate="...">.
 * @returns SSML string wrapped in <speak>, with <prosody rate="..."> and pauses after punctuation.
 */
export function toSsml(text: string, speechRate: number): string {
  const rate = rateToProsody(speechRate);
  const withPauses = insertPausesAfterPunctuation(text);
  return `<speak><prosody rate="${rate}">${withPauses}</prosody></speak>`;
}
