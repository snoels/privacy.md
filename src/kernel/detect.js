/**
 * The deterministic pass: find personal data in an outbound payload.
 *
 * This resolves the large majority of calls in microseconds, on field names and
 * value patterns alone. Only what this cannot classify is worth escalating to a
 * model — see `escalate.js`. Getting this layer right is what keeps the kernel
 * from adding seconds to every tool call.
 *
 * Every finding carries the JSON path that produced it, because redaction has to
 * strip one field precisely rather than mangle the whole payload.
 */

import { decodings, joinedNeighbours } from './encoded.js';

/** Read the value at a path, for reporting what a split match actually held. */
function getAt(payload, path) {
  return path.reduce((node, key) => (node == null ? node : node[key]), payload);
}

/**
 * Fields that say *where* a call goes, rather than carrying data to it.
 *
 * You cannot leak someone's address to that person. Emailing the clinic needs
 * the clinic's address in `to`, and stripping it does not protect anyone — it
 * just sends an email with no recipient. Addressing is routing, not payload.
 *
 * `cc` and `bcc` are deliberately absent: those genuinely do disclose people to
 * each other, which is a different thing and stays checked.
 */
const ADDRESSING_FIELDS =
  /^(to|url|uri|endpoint|host|hostname|domain|channel|recipient|destination|dest|target|webhook)$/i;

/** Field names that name a data type outright, whatever the value looks like. */
const FIELD_NAMES = {
  credentials: /^(api[_-]?key|apikey|secret|token|password|passwd|pwd|auth|authorization|bearer|private[_-]?key|ssh[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|credentials?)$/i,
  contact: /^(e?mail|email[_-]?address|phone|phone[_-]?number|mobile|tel|telephone|contact)$/i,
  location: /^(address|street|street[_-]?address|postal[_-]?code|zip|zipcode|lat|latitude|lng|lon|longitude|coords?|coordinates|home[_-]?address|geo)$/i,
  health: /^(health|medical|diagnosis|condition|symptom|prescription|medication|treatment|patient|allerg(y|ies)|reason[_-]?for[_-]?visit)$/i,
  financial: /^(iban|bic|account[_-]?number|card[_-]?number|ccnum|credit[_-]?card|cvv|sort[_-]?code|bank)$/i,
  salary_history: /^(salary|salary[_-]?history|current[_-]?salary|previous[_-]?salary|compensation|pay[_-]?history)$/i,
  identity: /^(ssn|social[_-]?security|passport|national[_-]?id|nid|bsn|rijksregisternummer|date[_-]?of[_-]?birth|dob|birthdate)$/i,
};

/** ISO timestamps, dates and clock times — never phone numbers, whatever their shape. */
const LOOKS_TEMPORAL =
  /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}|T\d{2}:|\b(19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/](19|20)\d{2}\b/;

const countDigits = (text) => (text.match(/\d/g) ?? []).length;

/** Value patterns that give away a data type wherever they appear, including free text. */
const VALUE_PATTERNS = [
  // Credentials first: these are the ones that must never slip through.
  { type: 'credentials', re: /\b(sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b/ },
  { type: 'credentials', re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/ },
  { type: 'credentials', re: /\b[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, label: 'jwt' },

  { type: 'contact', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, label: 'email' },
  // Deliberately conservative: international or grouped forms, not any run of digits.
  // Dates and timestamps have the same shape as a phone number and are the
  // single worst false positive here — redacting an event's `start` breaks the
  // task while looking like the kernel worked.
  {
    type: 'contact',
    // Two accepted shapes: a +country or (area) prefix followed by one or more
    // groups, or a bare number split into three or more groups.
    re: /(?:(?:\+\d{1,3}|\(\d{2,4}\))[\s.-]?){1,2}\d{1,4}(?:[\s.-]\d{2,4})+|\d{2,4}(?:[\s.-]\d{2,4}){2,}/,
    label: 'phone',
    reject: (match, whole) => LOOKS_TEMPORAL.test(whole) || countDigits(match) < 7,
  },

  { type: 'financial', re: /\b[A-Z]{2}\d{2}[\s]?(?:[A-Z0-9]{4}[\s]?){2,7}[A-Z0-9]{1,4}\b/, label: 'iban' },
  { type: 'financial', re: /\b(?:\d{4}[\s-]?){3}\d{4}\b/, label: 'card' },

  { type: 'location', re: /\b-?\d{1,3}\.\d{4,},\s?-?\d{1,3}\.\d{4,}\b/, label: 'coordinates' },

  // Health and special categories only ever match on wording, never on shape.
  { type: 'health', re: /\b(physio(therapy)?|diagnos(is|ed)|prescription|prescribed|symptoms?|chemo|oncolog|psychiatr|therapy session|blood test|MRI|x-?ray|surgery|injury|HIV|diabet|depress(ion|ive)|anxiety|pregnan(t|cy))\b/i },
  { type: 'special_category', re: /\b(catholic|muslim|jewish|hindu|buddhist|atheist|synagogue|mosque|church attendance|trade union|union member|gay|lesbian|bisexual|transgender|voted? (for|against)|political party)\b/i },
];

/** Walk any JSON-ish value, yielding [path, string] for every string it contains. */
function* strings(value, path = []) {
  if (typeof value === 'string') {
    yield [path, value];
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* strings(item, [...path, index]);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) yield* strings(item, [...path, key]);
  }
}

/**
 * Classify a contact detail as the user's own or someone else's.
 *
 * The third-party subject problem is one of the hard ones in this space: your
 * inbox is full of data about people who never agreed to your agent reading it.
 * We can only act on it if we can tell whose data it is, which is why the
 * constitution carries the user's own identifiers.
 */
function ownsContact(text, identity) {
  const mine = [identity?.email, identity?.phone, ...(identity?.aliases ?? [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/[\s.()-]/g, ''));
  const normalized = text.toLowerCase().replace(/[\s.()-]/g, '');
  return mine.some((value) => normalized.includes(value));
}

/** Run every value pattern over one string. */
function patternsIn(text) {
  const hits = [];
  for (const { type, re, label, reject } of VALUE_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    if (reject?.(match[0], text)) continue;
    hits.push({ type, label: label ?? type, excerpt: match[0] });
  }
  return hits;
}

/**
 * Find every piece of personal data in a payload.
 *
 * @param {unknown} payload - the tool call's arguments
 * @param {{identity?: {email?: string, phone?: string, aliases?: string[]},
 *          deep?: boolean}} [context]
 *   `deep` also looks through encodings and across neighbouring fields. It is
 *   on by default; turn it off where throughput matters more than coverage.
 * @returns {Array<{path: (string|number)[], type: string, via: string, excerpt: string}>}
 */
export function detect(payload, context = {}) {
  const findings = [];
  const seen = new Set();

  const add = (path, type, via, excerpt) => {
    const key = `${path.join('.')}::${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ path, type, via, excerpt });
  };

  for (const [path, text] of strings(payload)) {
    const fieldName = String(path[path.length - 1] ?? '');

    // Where the call is going is not a contact detail being disclosed to it.
    // Only contact detection is exempted: a secret in a URL query string is
    // still a secret leaving the machine, and skipping the whole field would
    // wave it through.
    const isAddressing = ADDRESSING_FIELDS.test(fieldName);

    const skip = (type) => isAddressing && (type === 'contact' || type === 'location');

    for (const [type, re] of Object.entries(FIELD_NAMES)) {
      if (re.test(fieldName) && !skip(type)) add(path, type, `field:${fieldName}`, text);
    }

    for (const hit of patternsIn(text)) {
      if (skip(hit.type)) continue;
      add(path, hit.type, `pattern:${hit.label}`, hit.excerpt);
    }

    // Encoding is not concealment we should reward. A key base64'd on the way
    // out is still a key leaving the machine.
    if (context.deep !== false) {
      for (const { text: decoded, via } of decodings(text)) {
        for (const hit of patternsIn(decoded)) {
          if (skip(hit.type)) continue;
          // The excerpt stays the *encoded* value, because that is the string
          // that has to be removed from the payload.
          add(path, hit.type, `${via}:${hit.label}`, text);
        }
      }
    }
  }

  // A value split across two fields is not two harmless fragments. But only a
  // match that *spans the boundary* counts: a hit already present in one field
  // alone is that field's, and attributing it to its neighbour would redact
  // whatever happened to sit next to it.
  if (context.deep !== false) {
    for (const join of joinedNeighbours(payload)) {
      const parts = join.paths.map((target) => String(getAt(payload, target) ?? ''));
      for (const hit of patternsIn(join.text)) {
        // Compared by type, not by excerpt: a pattern reports only its first
        // match, and joining two fields can shift which one that is. If the
        // type is already present in either field alone, the split found
        // nothing new.
        const alreadyInOnePart = parts.some((part) =>
          patternsIn(part).some((own) => own.type === hit.type),
        );
        if (alreadyInOnePart) continue;
        for (const [index, target] of join.paths.entries()) {
          add(target, hit.type, `split:${hit.label}`, parts[index]);
        }
      }
    }
  }

  // Re-label contact details that belong to someone else. Done as a second pass
  // so it applies however the detail was found — field name or pattern alike.
  for (const finding of findings) {
    if (finding.type !== 'contact') continue;
    if (!ownsContact(finding.excerpt, context.identity)) finding.type = 'third_party_contact';
  }

  return findings;
}

export const DATA_TYPES = [
  ...new Set([...Object.keys(FIELD_NAMES), ...VALUE_PATTERNS.map((p) => p.type), 'third_party_contact']),
];
