/**
 * Composite fields: values that carry a payload inside them.
 *
 * A shell command holding a JSON body, a message body holding an appointment
 * note — the personal data is nested inside a value the task still needs. The
 * naive move is to drop the whole field, and it is the wrong one: the call then
 * fails, which looks to the user like the privacy tool broke their agent.
 *
 * So we redact *within* the value: into embedded JSON where there is some, and
 * otherwise down to the sentence that carries the detail.
 */

/**
 * Parse a candidate span as JSON, allowing for shell escaping.
 *
 * A JSON body inside a shell command usually arrives with its quotes escaped
 * (`-d "{\"name\":...}"`). Parsing only the literal form would miss the most
 * common shape there is, and missing it means dropping the whole command.
 */
function parseMaybeEscaped(slice) {
  try {
    return { value: JSON.parse(slice), escaped: false };
  } catch {
    // Fall through and try again with one level of escaping removed.
  }
  try {
    return { value: JSON.parse(slice.replace(/\\"/g, '"')), escaped: true };
  } catch {
    return null;
  }
}

/** Find balanced {...} spans in a string that parse as JSON, escaped or not. */
export function embeddedJson(text) {
  const found = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;
    let depth = 0;
    for (let end = start; end < text.length; end += 1) {
      if (text[end] === '{') depth += 1;
      else if (text[end] === '}') {
        depth -= 1;
        if (depth !== 0) continue;
        const slice = text.slice(start, end + 1);
        const parsed = parseMaybeEscaped(slice);
        if (parsed) {
          found.push({ start, end: end + 1, value: parsed.value, raw: slice, escaped: parsed.escaped });
        }
        break;
      }
    }
  }
  // Outermost spans only, so we do not redact the same region twice.
  return found.filter((span, index) => !found.some((other, i) => i !== index && other.start < span.start && other.end >= span.end));
}

/**
 * Remove every key whose value carries the excerpt, at any depth.
 * Returns a new object; `removed` lists the key paths that went.
 */
export function pruneWhereValueContains(value, excerpt, removed = [], path = []) {
  if (Array.isArray(value)) {
    return value.map((item, index) => pruneWhereValueContains(item, excerpt, removed, [...path, index]));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && item.includes(excerpt)) {
        removed.push([...path, key]);
        continue;
      }
      out[key] = pruneWhereValueContains(item, excerpt, removed, [...path, key]);
    }
    return out;
  }
  return value;
}

/**
 * Redact the sentence carrying the detail, keeping the sentences around it.
 *
 * Returns null when nothing would survive: a field reduced to nothing but the
 * placeholder is worse than a field that is simply absent, because the key
 * still announces that something was withheld and some APIs reject the
 * placeholder outright. The caller drops the field instead.
 */
export function redactSentence(text, excerpt, replacement) {
  const parts = text.split(/(?<=[.!?;\n])\s+/);
  if (parts.length < 2) return null;

  const rewritten = parts.map((part) => (part.includes(excerpt) ? replacement : part));
  const survived = rewritten.some((part) => part !== replacement);
  const changed = rewritten.some((part, index) => part !== parts[index]);

  return changed && survived ? rewritten.join(' ') : null;
}

/**
 * Redact a topic-bearing detail out of a composite value.
 *
 * @returns {{text: string, how: string}|null} null when there is nothing nested
 *          to work with and the caller should fall back to dropping the field.
 */
export function redactWithin(text, excerpt, replacement) {
  const spans = embeddedJson(text);

  if (spans.length > 0) {
    let output = '';
    let cursor = 0;
    let touched = false;

    for (const span of spans) {
      const removed = [];
      const pruned = pruneWhereValueContains(span.value, excerpt, removed);
      const rewritten = span.escaped
        ? JSON.stringify(pruned).replace(/"/g, '\\"')
        : JSON.stringify(pruned);
      output += text.slice(cursor, span.start);
      output += removed.length > 0 ? rewritten : span.raw;
      if (removed.length > 0) touched = true;
      cursor = span.end;
    }
    output += text.slice(cursor);
    if (touched) return { text: output, how: 'pruned-embedded-json' };
  }

  // No nested payload: fall back to the sentence carrying the detail.
  const sentence = redactSentence(text, excerpt, replacement);
  if (sentence !== null) return { text: sentence, how: 'redacted-sentence' };

  return null;
}
