/**
 * Data that has been encoded or broken up on the way out.
 *
 * The deterministic pass matches patterns in plaintext. Two shapes slip past it
 * and both turn up in ordinary code, not just in adversarial tests: a value
 * base64-encoded before it is sent, and a value split across two fields.
 *
 * Neither needs a model to catch. Decoding is cheap and exact, and adjacent
 * string fields can simply be joined and re-checked. Doing it here keeps the
 * model tier for what actually needs judgement.
 *
 * The cost of getting this wrong is a false positive on ordinary base64 — an
 * image, a hash, a signature — so the bar for treating something as decoded
 * text is deliberately high.
 */

const MIN_ENCODED_LENGTH = 16;

/** Long enough to hide something, and shaped like base64. */
const BASE64_LIKE = /^[A-Za-z0-9+/]{16,}={0,2}$/;
const BASE64_IN_TEXT = /[A-Za-z0-9+/]{24,}={0,2}/g;
const HEX_LIKE = /^(?:[0-9a-f]{2}){12,}$/i;

/** Does this decode to something a human would recognise as text? */
function looksLikeText(buffer) {
  if (buffer.length < 8) return false;
  let printable = 0;
  for (const byte of buffer) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127)) printable += 1;
  }
  return printable / buffer.length > 0.9;
}

function decodeBase64(candidate) {
  try {
    const buffer = Buffer.from(candidate, 'base64');
    // Round-trip: base64 is forgiving, and a value that does not survive the
    // trip was never base64 to begin with.
    if (buffer.toString('base64').replace(/=+$/, '') !== candidate.replace(/=+$/, '')) return null;
    if (!looksLikeText(buffer)) return null;
    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

function decodeHex(candidate) {
  try {
    const buffer = Buffer.from(candidate, 'hex');
    if (!looksLikeText(buffer)) return null;
    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

function decodeUri(candidate) {
  if (!/%[0-9a-f]{2}/i.test(candidate)) return null;
  try {
    const decoded = decodeURIComponent(candidate);
    return decoded === candidate ? null : decoded;
  } catch {
    return null;
  }
}

/**
 * Every plaintext reading of a value, including the value itself.
 *
 * @returns {Array<{text: string, via: string}>}
 */
export function decodings(value) {
  const text = String(value ?? '');
  if (text.length < MIN_ENCODED_LENGTH) return [];

  const found = [];
  const add = (decoded, via) => {
    if (decoded && decoded !== text) found.push({ text: decoded, via });
  };

  if (BASE64_LIKE.test(text)) add(decodeBase64(text), 'base64');
  if (HEX_LIKE.test(text)) add(decodeHex(text), 'hex');
  add(decodeUri(text), 'url-encoded');

  // Base64 embedded in a larger string, such as a data URI or a header value.
  for (const match of text.match(BASE64_IN_TEXT) ?? []) {
    if (match === text) continue;
    add(decodeBase64(match), 'base64-in-text');
  }

  return found;
}

/**
 * Values formed by joining neighbouring string fields.
 *
 * A phone number split as `{part_one: "+32 2 345", part_two: "67 89"}` is not
 * two harmless fragments; it is a phone number with a space in the wrong place.
 * Only adjacent pairs within the same object are joined — going further would
 * manufacture matches out of unrelated fields.
 *
 * @returns {Array<{text: string, paths: Array}>}
 */
export function joinedNeighbours(payload, path = []) {
  const joins = [];

  if (Array.isArray(payload)) {
    for (const [index, item] of payload.entries()) joins.push(...joinedNeighbours(item, [...path, index]));
    return joins;
  }
  if (!payload || typeof payload !== 'object') return joins;

  const entries = Object.entries(payload);
  const strings = entries.filter(([, value]) => typeof value === 'string');

  for (let index = 0; index < strings.length - 1; index += 1) {
    const [leftKey, left] = strings[index];
    const [rightKey, right] = strings[index + 1];
    if (left.length > 200 || right.length > 200) continue;
    for (const separator of ['', ' ']) {
      joins.push({
        text: `${left}${separator}${right}`,
        paths: [
          [...path, leftKey],
          [...path, rightKey],
        ],
      });
    }
  }

  for (const [key, value] of entries) {
    if (value && typeof value === 'object') joins.push(...joinedNeighbours(value, [...path, key]));
  }

  return joins;
}
