/**
 * Turn a decision into an actual payload.
 *
 * This is where minimization stops being a claim and becomes a smaller object on
 * the wire. The task still completes — it just carries less of the user.
 */

import { createHash } from 'node:crypto';
import { OUTCOMES } from './evaluate.js';
import { redactWithin, stripUrlParams } from './composite.js';

const REDACTED = '[redacted by your privacy constitution]';

function getIn(object, path) {
  return path.reduce((node, key) => (node == null ? node : node[key]), object);
}

function setIn(object, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const clone = Array.isArray(object) ? [...object] : { ...object };
  clone[head] = rest.length === 0 ? value : setIn(clone[head] ?? {}, rest, value);
  return clone;
}

function deleteIn(object, path) {
  if (path.length === 0) return object;
  const [head, ...rest] = path;
  if (object == null) return object;
  const clone = Array.isArray(object) ? [...object] : { ...object };
  if (rest.length === 0) {
    if (Array.isArray(clone)) clone.splice(Number(head), 1);
    else delete clone[head];
    return clone;
  }
  clone[head] = deleteIn(clone[head], rest);
  return clone;
}

/**
 * A stable mask for one value at one recipient.
 *
 * Stable matters: a relay address that changes every call is not a relay, it is
 * noise. The same service always sees the same mask, so a booking confirmation
 * still reaches the user.
 */
function maskFor(type, excerpt, recipient, identity) {
  const seed = createHash('sha256')
    .update(`${recipient.host ?? recipient.name}::${excerpt}`)
    .digest('hex')
    .slice(0, 10);

  if (/@/.test(excerpt)) {
    const domain = identity?.relayDomain ?? 'relay.privacy-md.dev';
    return `${seed}@${domain}`;
  }
  if (type === 'contact' || /^\+?[\d\s().-]+$/.test(excerpt)) {
    // A real deployment leases these from a relay provider; the shape is the point.
    const digits = BigInt(`0x${seed}`).toString().padStart(9, '0').slice(-9);
    return `+32 460 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`;
  }
  return `${REDACTED} (${seed})`;
}

/**
 * Types where the matched text *is* the sensitive datum.
 *
 * An email address or an API key is a self-contained identifier: strip exactly
 * it and the rest of the value is clean.
 */
const IDENTIFIER_TYPES = new Set([
  'contact',
  'third_party_contact',
  'credentials',
  'financial',
  'identity',
  'location',
]);

/**
 * Does this finding account for the whole field, or just part of it?
 *
 * Three cases, and getting them apart is what separates useful minimization
 * from a kernel that either breaks tasks or leaks:
 *
 *   named field       `api_key` is entirely secret          → the field goes
 *   topic keyword     "Physio" in a longer note is only     → the field goes
 *                     evidence the note is about health;
 *                     "lower back injury" is health too
 *   identifier match  an email inside a shell command is    → strip that span
 *                     one fragment the task still needs
 */
function coversWholeField(result, value) {
  if (result.via.startsWith('field:')) return true;
  if (!IDENTIFIER_TYPES.has(result.type)) return true;
  return String(value).trim() === String(result.excerpt).trim();
}

function replaceOnce(text, fragment, replacement) {
  const at = String(text).indexOf(fragment);
  if (at === -1) return text;
  return String(text).slice(0, at) + replacement + String(text).slice(at + fragment.length);
}

/**
 * Apply an evaluation to the payload it came from.
 *
 * Whole-field redaction removes the key rather than blanking it: a key present
 * with a placeholder still tells the recipient the field existed and that you
 * withheld it, and some APIs reject the placeholder outright. Partial redaction
 * rewrites the string in place, so the rest of the value survives.
 *
 * @returns {{input: object, changes: Array, minimization: {available: number, sent: number}}}
 */
export function apply(payload, evaluation, context = {}) {
  let input = payload;
  const changes = [];

  // Deepest paths first, so removing one does not shift another's index.
  const ordered = [...evaluation.results].sort((a, b) => b.path.length - a.path.length);

  for (const result of ordered) {
    const current = getIn(input, result.path);
    const whole = coversWholeField(result, getIn(payload, result.path));

    if (result.outcome === OUTCOMES.REDACT) {
      // A URL is handled the same way whatever the data type: drop the query
      // parameter carrying the detail. Doing this before the identifier/topic
      // split matters, or two findings in one URL take two different paths and
      // the field ends up half rewritten and half blanked.
      const urlRewrite =
        typeof current === 'string' ? stripUrlParams(current, result.excerpt) : null;

      // Otherwise, before dropping a whole field, see whether the detail is
      // nested inside a value the task still needs.
      const nested =
        urlRewrite === null && whole && typeof current === 'string'
          ? redactWithin(current, result.excerpt, REDACTED)
          : null;

      if (urlRewrite !== null) {
        input = setIn(input, result.path, urlRewrite);
        changes.push({
          path: result.path,
          action: 'dropped-query-parameter',
          type: result.type,
          ruleId: result.ruleId,
        });
      } else if (nested) {
        input = setIn(input, result.path, nested.text);
        changes.push({ path: result.path, action: nested.how, type: result.type, ruleId: result.ruleId });
      } else if (whole) {
        input = deleteIn(input, result.path);
        changes.push({ path: result.path, action: 'removed', type: result.type, ruleId: result.ruleId });
      } else {
        input = setIn(input, result.path, replaceOnce(current, result.excerpt, REDACTED));
        changes.push({ path: result.path, action: 'stripped', type: result.type, ruleId: result.ruleId, was: result.excerpt });
      }
    } else if (result.outcome === OUTCOMES.SUBSTITUTE) {
      const mask = maskFor(result.type, String(result.excerpt), evaluation.recipient, context.identity);
      input = setIn(input, result.path, whole ? mask : replaceOnce(current, result.excerpt, mask));
      changes.push({ path: result.path, action: 'masked', type: result.type, ruleId: result.ruleId, mask });
    }
  }

  const available = evaluation.results.length;
  const sent = evaluation.results.filter((r) => r.outcome === OUTCOMES.ALLOW).length;

  return { input, changes, minimization: { available, sent, withheld: available - sent } };
}

export { REDACTED };
