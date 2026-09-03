/**
 * Turning one decision into a rule.
 *
 * This is where the constitution actually gets written. The questionnaire is
 * guessing; the moment of a real hold is the only time the user has full context
 * on what they want. So each option on the hold menu writes a *different* rule,
 * and the user can see how wide the grant is before they pick it.
 *
 * The options are ordered narrow to broad on purpose. People pick the first
 * thing, and if "allow always" sits one keystroke away the constitution
 * collapses to permit-everything inside a week — which is exactly how P3P and
 * Do Not Track died.
 */

import { OUTCOMES } from './evaluate.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * How to name a data type in a sentence.
 *
 * Two positions are needed and one string cannot serve both. After a determiner
 * the noun has to be bare ("gets no contact details"), and at the head of a
 * sentence it wants an owner ("Your contact details never reach ..."). Storing
 * one possessive string for both is how you get "gets no your contact details".
 *
 * `mine` also keeps other people's data attributed to them, which is the whole
 * point of having a separate type for it.
 */
const DATA_WORDS = {
  contact: { noun: 'contact details', mine: true, plural: true },
  third_party_contact: { noun: "other people's contact details", mine: false, plural: true },
  credentials: { noun: 'keys and secrets', mine: true, plural: true },
  health: { noun: 'health details', mine: true, plural: true },
  location: { noun: 'precise location', mine: true, plural: false },
  financial: { noun: 'financial details', mine: true, plural: true },
  identity: { noun: 'identity documents', mine: true, plural: true },
  salary_history: { noun: 'salary history', mine: true, plural: false },
  special_category: { noun: 'special-category details', mine: true, plural: true },
};

const wordsFor = (type) =>
  DATA_WORDS[type] ?? { noun: type.replace(/_/g, ' '), mine: false, plural: false };

/** For after a determiner: "gets no contact details". */
function bareSubject(types) {
  if (types.length === 0) return 'this data';
  return types.map((type) => wordsFor(type).noun).join(' and ');
}

/** For the head of a sentence: "Your salary history and other people's contact details". */
function ownedSubject(types) {
  if (types.length === 0) return 'this data';
  const mine = types.filter((type) => wordsFor(type).mine).map((type) => wordsFor(type).noun);
  const theirs = types.filter((type) => !wordsFor(type).mine).map((type) => wordsFor(type).noun);
  const parts = mine.length > 0 ? [`your ${mine.join(' and ')}`] : [];
  parts.push(...theirs);
  return parts.join(' and ');
}

/** Two types are always plural, whatever each one is on its own. */
const isPlural = (types) => types.length !== 1 || wordsFor(types[0]).plural;

/** A short label for the kind of task, so "this kind of task" means something. */
export function taskKind(recipient) {
  if (recipient.sector && recipient.sector !== 'unknown') return `${recipient.sector} services`;
  return 'services like this one';
}

/**
 * The menu offered when a call is held.
 *
 * Every option states its consequence. Without that, every prompt is a scare
 * prompt and people click through; with it, redact is visibly the attractive
 * choice, which is where we want them.
 *
 * @param {{results: Array, recipient: object, minimization: object}} held
 * @param {{canRedact: boolean}} [shape]
 */
export function menuFor(held, shape = {}) {
  const recipient = held.recipient;
  const types = [...new Set(held.results.filter((r) => r.outcome !== OUTCOMES.ALLOW).map((r) => r.type))];
  const bare = bareSubject(types);
  const owned = ownedSubject(types);
  const canRedact = shape.canRedact !== false;
  const where = recipient.name;

  const options = [];

  if (canRedact) {
    options.push({
      key: 'redact',
      label: 'Redact and send',
      consequence: `the call still works, ${where} gets no ${bare}`,
      outcome: OUTCOMES.REDACT,
      scope: 'recipient',
      rule: () => rule({ held, types, outcome: OUTCOMES.REDACT, scope: 'recipient' }),
    });
    options.push({
      key: 'substitute',
      label: 'Send a masked value',
      consequence: `the call still works, ${where} gets a relay rather than the real thing`,
      outcome: OUTCOMES.SUBSTITUTE,
      scope: 'recipient',
      rule: () => rule({ held, types, outcome: OUTCOMES.SUBSTITUTE, scope: 'recipient' }),
    });
  }

  options.push(
    {
      key: 'once',
      label: 'Allow once',
      consequence: 'this call only, nothing is remembered',
      outcome: OUTCOMES.ALLOW,
      scope: 'once',
      rule: () => null,
    },
    {
      key: 'hour',
      label: 'Allow for the next hour',
      consequence: `expires ${new Date(Date.now() + HOUR_MS).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, then reverts`,
      outcome: OUTCOMES.ALLOW,
      scope: 'session',
      rule: () => rule({ held, types, outcome: OUTCOMES.ALLOW, scope: 'session' }),
    },
    {
      key: 'recipient',
      label: `Allow for ${where}`,
      consequence: `any future call to ${where} may carry ${bare}`,
      outcome: OUTCOMES.ALLOW,
      scope: 'recipient',
      rule: () => rule({ held, types, outcome: OUTCOMES.ALLOW, scope: 'recipient' }),
    },
    {
      key: 'task',
      label: `Allow for ${taskKind(recipient)}`,
      consequence: `${taskKind(recipient)}, not just ${where}`,
      outcome: OUTCOMES.ALLOW,
      scope: 'sector',
      rule: () => rule({ held, types, outcome: OUTCOMES.ALLOW, scope: 'sector' }),
    },
    {
      key: 'never',
      label: 'Never',
      consequence: `${owned} will never reach ${where}; calls that need it will fail`,
      outcome: OUTCOMES.BLOCK,
      scope: 'recipient',
      rule: () => rule({ held, types, outcome: OUTCOMES.BLOCK, scope: 'recipient' }),
    },
  );

  return options;
}

/** Build the rule an option would write, so it can be previewed before it is saved. */
export function rule({ held, types, outcome, scope }) {
  const recipient = held.recipient;
  const subject = ownedSubject(types);

  const spec =
    scope === 'sector'
      ? { sector: [recipient.sector] }
      : recipient.host
        ? { host: [recipient.host] }
        : { name: [recipient.name] };

  const target = scope === 'sector' ? taskKind(recipient) : recipient.name;

  // An hour-long grant and a forever grant produced the same sentence, which
  // makes the two options indistinguishable at the moment of choosing. The
  // expiry has to be in the English, not only in the `expires` field.
  const expiresAt = scope === 'session' ? new Date(Date.now() + HOUR_MS) : null;
  const until = expiresAt
    ? ` until ${expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';

  // Most data words are plural ("health details", "keys and secrets") but not
  // all of them ("salary history", "precise location"), so the verb has to
  // agree. These lines are what the user audits and what goes on a slide, so
  // they have to read like English rather than like a template.
  const plural = isPlural(types);
  const verb = {
    [OUTCOMES.ALLOW]: `may go to ${target}`,
    [OUTCOMES.REDACT]: `${plural ? 'are' : 'is'} stripped before anything reaches ${target}`,
    [OUTCOMES.SUBSTITUTE]: `${plural ? 'reach' : 'reaches'} ${target} only as a mask`,
    [OUTCOMES.BLOCK]: `never ${plural ? 'reach' : 'reaches'} ${target}`,
  }[outcome];

  return {
    id: `${outcome}-${types.join('-')}-${scope}-${(recipient.host ?? recipient.name).replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase(),
    says: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${verb}${until}.`,
    data: types,
    recipient: spec,
    outcome,
    ...(expiresAt ? { expires: expiresAt.toISOString() } : {}),
    provenance: {
      source: 'granted-mid-task',
      at: new Date().toISOString(),
      tool: held.tool ?? null,
    },
  };
}

/** Drop rules whose hour is up, so a temporary grant is genuinely temporary. */
export function pruneExpired(constitution, now = Date.now()) {
  const kept = [];
  const expired = [];
  for (const item of constitution.rules ?? []) {
    if (item.expires && Date.parse(item.expires) < now) expired.push(item);
    else kept.push(item);
  }
  return { constitution: { ...constitution, rules: kept }, expired };
}

export { HOUR_MS };
