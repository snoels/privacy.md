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

/** Human wording for a data type, for the plain-English rule line. */
const DATA_WORDS = {
  contact: 'your contact details',
  third_party_contact: "other people's contact details",
  credentials: 'keys and secrets',
  health: 'health details',
  location: 'your location',
  financial: 'financial details',
  identity: 'identity documents',
  salary_history: 'salary history',
  special_category: 'special-category details',
};

const words = (type) => DATA_WORDS[type] ?? type.replace(/_/g, ' ');

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
  const subject = types.map(words).join(' and ') || 'this data';
  const canRedact = shape.canRedact !== false;
  const where = recipient.name;

  const options = [];

  if (canRedact) {
    options.push({
      key: 'redact',
      label: 'Redact and send',
      consequence: `the call still works, ${where} gets no ${subject}`,
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
      consequence: `any future call to ${where} may carry ${subject}`,
      outcome: OUTCOMES.ALLOW,
      scope: 'recipient',
      rule: () => rule({ held, types, outcome: OUTCOMES.ALLOW, scope: 'recipient' }),
    },
    {
      key: 'task',
      label: `Allow for ${taskKind(recipient)}`,
      consequence: `any ${taskKind(recipient)}, not just ${where}`,
      outcome: OUTCOMES.ALLOW,
      scope: 'sector',
      rule: () => rule({ held, types, outcome: OUTCOMES.ALLOW, scope: 'sector' }),
    },
    {
      key: 'never',
      label: 'Never',
      consequence: `${subject} will never reach ${where}; calls that need it will fail`,
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
  const subject = types.map(words).join(' and ');

  const spec =
    scope === 'sector'
      ? { sector: [recipient.sector] }
      : recipient.host
        ? { host: [recipient.host] }
        : { name: [recipient.name] };

  const target = scope === 'sector' ? taskKind(recipient) : recipient.name;

  // Every data word is plural ("health details", "keys and secrets"), so the
  // verbs are too. These lines are what the user audits and what goes on a
  // slide, so they have to read like English rather than like a template.
  const verb = {
    [OUTCOMES.ALLOW]: `may go to ${target}`,
    [OUTCOMES.REDACT]: `are stripped before anything reaches ${target}`,
    [OUTCOMES.SUBSTITUTE]: `reach ${target} only as a mask`,
    [OUTCOMES.BLOCK]: `never reach ${target}`,
  }[outcome];

  return {
    id: `${outcome}-${types.join('-')}-${scope}-${(recipient.host ?? recipient.name).replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase(),
    says: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${verb}.`,
    data: types,
    recipient: spec,
    outcome,
    ...(scope === 'session' ? { expires: new Date(Date.now() + HOUR_MS).toISOString() } : {}),
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
