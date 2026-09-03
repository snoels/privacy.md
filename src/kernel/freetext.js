/**
 * Rules in the user's own words.
 *
 * "Never tell anyone I am pregnant." "My work email can go anywhere, my
 * personal one cannot." People express privacy preferences as sentences, not as
 * a data-type matrix, and refusing to accept that is how you end up with a form
 * nobody fills in.
 *
 * Two things have to be right, and both are about trust rather than coverage:
 * the compiled rule is always shown before it is saved, because a privacy rule
 * the user did not understand is worse than no rule; and anything we cannot
 * compile is reported as not understood rather than quietly dropped.
 *
 * This pass is deterministic on purpose — it runs offline, at onboarding time,
 * with no key and no network. `escalate` marks where a model would take over
 * for the sentences the patterns cannot place.
 */

const SUBJECT_WORDS = [
  [/\b(pregnan|expecting a baby)\w*/i, 'health', 'that you are pregnant'],
  [/\b(hiv|aids)\b/i, 'health', 'your HIV status'],
  [/\b(diagnos|illness|condition|therapy|medication|surgery|injury|disabilit|physio|appointment)\w*/i, 'health', 'your health'],
  [/\b(salary|pay|compensation|what i earn)\w*/i, 'salary_history', 'what you earn'],
  [/\b(address|where i live|home)\b/i, 'location', 'where you live'],
  [/\b(phone|number|mobile)\b/i, 'contact', 'your phone number'],
  [/\b(e?mail)\b/i, 'contact', 'your email address'],
  [/\b(religio|church|mosque|synagogue|faith)\w*/i, 'special_category', 'your religion'],
  [/\b(politic|vote|party)\w*/i, 'special_category', 'your politics'],
  [/\b(gay|lesbian|bisexual|transgender|orientation|sexuality)\b/i, 'special_category', 'your orientation'],
  [/\b(bank|iban|card|account)\b/i, 'financial', 'your financial details'],
  [/\b(passport|national id|ssn|social security)\b/i, 'identity', 'your identity documents'],
  [/\b(key|secret|token|credential|password)\w*/i, 'credentials', 'your keys and secrets'],
];

const NEGATIVE = /\b(never|don'?t|do not|no longer|not to|shouldn'?t|should not|cannot|can'?t|refuse|avoid)\b/i;
const ANYWHERE = /\b(anywhere|any service|anyone|everyone|all services|any tool)\b/i;

/** "... to opentable.com", "... with Slack", "... to my employer" */
const RECIPIENT = /\b(?:to|with|at|for)\s+((?:[a-z0-9-]+\.)+[a-z]{2,}|my [a-z]+(?: [a-z]+)?|[A-Z][A-Za-z]+)/;

const SECTOR_WORDS = [
  [/\b(recruiter|employer|hiring|job|hr)\b/i, 'recruiting'],
  [/\b(advertis|marketing|ad tech|tracker)\w*/i, 'advertising'],
  [/\b(analytic|telemetry)\w*/i, 'analytics'],
  [/\b(doctor|clinic|gp|hospital|physio|healthcare)\b/i, 'healthcare'],
  [/\b(courier|delivery|postal|shipping)\b/i, 'logistics'],
  [/\b(calendar|notes|todo)\b/i, 'productivity'],
  [/\b(drive|dropbox|storage|backup)\b/i, 'storage'],
];

function findSubject(clause) {
  for (const [pattern, type, phrase] of SUBJECT_WORDS) {
    if (pattern.test(clause)) return { type, phrase };
  }
  return null;
}

function findRecipient(clause) {
  for (const [pattern, sector] of SECTOR_WORDS) {
    if (pattern.test(clause)) return { kind: 'sector', value: sector, label: `${sector} services` };
  }
  const match = RECIPIENT.exec(clause);
  if (match) {
    const raw = match[1];
    if (/\./.test(raw)) return { kind: 'host', value: raw.toLowerCase(), label: raw.toLowerCase() };
  }
  if (ANYWHERE.test(clause)) return { kind: 'any', value: '*', label: 'anywhere' };
  return null;
}

/** Split on clause boundaries so one sentence can carry two opposing rules. */
function clauses(sentence) {
  return sentence
    .split(/[,;.]|\bbut\b|\bwhile\b|\band\b(?=[^,]*\b(?:not|never|can'?t|cannot)\b)/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

/**
 * Compile a sentence into rules.
 *
 * @returns {Array<{rule: object, from: string}>} one entry per clause understood
 */
export function compileFreeText(sentence) {
  const compiled = [];

  for (const clause of clauses(sentence)) {
    const subject = findSubject(clause);
    if (!subject) continue;

    const recipient = findRecipient(clause) ?? { kind: 'any', value: '*', label: 'anywhere' };
    const negative = NEGATIVE.test(clause);

    const spec =
      recipient.kind === 'host'
        ? { host: [recipient.value] }
        : recipient.kind === 'sector'
          ? { sector: [recipient.value] }
          : { trust: ['*'] };

    const outcome = negative ? 'block' : 'allow';
    const where = recipient.kind === 'any' ? 'anywhere' : `to ${recipient.label}`;
    const says = negative
      ? `Never disclose ${subject.phrase}${recipient.kind === 'any' ? ' to anyone' : ` to ${recipient.label}`}.`
      : `${subject.phrase.charAt(0).toUpperCase()}${subject.phrase.slice(1)} may go ${where}.`;

    compiled.push({
      from: clause,
      rule: {
        id: `typed-${outcome}-${subject.type}-${String(recipient.value).replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase(),
        says,
        data: [subject.type],
        recipient: spec,
        outcome,
        provenance: { source: 'personal', typed: clause, at: new Date().toISOString() },
      },
    });
  }

  return compiled;
}

/**
 * Clauses we could not place.
 *
 * Reported rather than swallowed: a user who typed a rule and got silence will
 * assume it is in force. This is also the hand-off point for a model pass.
 */
export function escalate(sentence) {
  const understood = new Set(compileFreeText(sentence).map((entry) => entry.from));
  return clauses(sentence).filter((clause) => !understood.has(clause) && clause.split(/\s+/).length > 2);
}
