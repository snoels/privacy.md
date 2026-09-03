/**
 * privacy.md — your privacy policy, in a file you can read.
 *
 * The constitution the kernel enforces is YAML: precise, matchable, and not
 * something anyone will audit. So the questionnaire writes this first, in plain
 * English, and the YAML is compiled from it.
 *
 * That ordering matters more than it looks. A privacy rule you cannot read is a
 * privacy rule you cannot disagree with, and a policy nobody disagrees with is
 * one nobody has actually agreed to. This is the file a person reads, edits,
 * and hands to someone else; `constitution.yaml` is the machine's copy of it.
 */

const OUTCOME_WORDS = {
  allow: 'is allowed',
  redact: 'is stripped out',
  substitute: 'is replaced with a mask',
  ask: 'needs your decision',
  block: 'is blocked',
};

/** What each data type is called when it heads a section. */
const TOPICS = [
  ['credentials', 'Keys and secrets'],
  ['health', 'Health'],
  ['special_category', 'Beliefs, politics and orientation'],
  ['identity', 'Identity documents'],
  ['financial', 'Money'],
  ['salary_history', 'What I earn'],
  ['location', 'Where I am'],
  ['third_party_contact', "Other people's details"],
  ['contact', 'My contact details'],
];

const PROVENANCE_NOTE = {
  personal: 'in my own words',
  'granted-mid-task': 'decided while working',
  inferred: 'inferred from what my agent already does',
  'granted-mid-task-expired': 'expired',
};

export function toMarkdown(constitution, { preset } = {}) {
  const rules = constitution.rules ?? [];

  const out = [
    '# My privacy policy',
    '',
    'What my AI agents may share about me, and with whom. Checked before',
    'anything leaves this machine — not reported afterwards.',
    '',
    '> This file stays on this computer. It is never uploaded, because a rule',
    '> about my health would leak the fact by existing.',
    '',
  ];

  if (constitution.identity?.email || constitution.identity?.phone) {
    const mine = [constitution.identity.email, constitution.identity.phone].filter(Boolean);
    out.push(`**Me:** ${mine.join(' · ')}`);
    out.push('');
    out.push('_So it can tell my own details apart from other people’s._');
    out.push('');
  }

  if (constitution.budget?.interruptionsPerDay !== undefined) {
    out.push(
      `**Interrupt me at most ${constitution.budget.interruptionsPerDay} times a day.** Past that it should be learning`,
    );
    out.push('from decisions I already made rather than asking again.');
    out.push('');
  }

  // Grouped by what the rule is about, because that is how someone checks it:
  // they think "what happens to my health data", not "what did the preset say".
  const used = new Set();

  for (const [type, heading] of TOPICS) {
    const mine = rules.filter((rule) => rule.data?.includes(type) && rule.data.length <= 2);
    if (mine.length === 0) continue;

    out.push(`## ${heading}`, '');
    for (const rule of mine) {
      used.add(rule.id);
      out.push(`- ${sentence(rule)}`);
    }
    out.push('');
  }

  // Rules that span many types are about a situation rather than a subject.
  const general = rules.filter((rule) => !used.has(rule.id));
  if (general.length > 0) {
    out.push('## Whatever the data', '');
    for (const rule of general) out.push(`- ${sentence(rule)}`);
    out.push('');
  }

  out.push('---', '');
  out.push(`_${rules.length} rules${preset ? `, from the **${preset}** preset` : ''}._`);
  out.push('_Edit this file, then run `npx privacy-constitution compile` to put it into force._');

  return `${out.join('\n')}\n`;
}

/** One rule as a line, with a note on where it came from if that is worth knowing. */
function sentence(rule) {
  const notes = [];
  const source = PROVENANCE_NOTE[rule.provenance?.source];
  if (source) notes.push(source);
  if (rule.expires) notes.push(`until ${new Date(rule.expires).toLocaleTimeString()}`);
  const suffix = notes.length > 0 ? ` _(${notes.join(', ')})_` : '';
  return `${rule.says}${suffix}`;
}
