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

const SOURCE_HEADINGS = {
  questionnaire: 'What you told it during setup',
  preset: 'From the preset you chose',
  inferred: 'Inferred from what your agent already does',
  personal: 'In your own words',
  'granted-mid-task': 'Decided while you were working',
  template: 'From a shared template',
};

const ORDER = ['personal', 'granted-mid-task', 'questionnaire', 'inferred', 'preset', 'template'];

/**
 * Render a constitution as a readable policy document.
 *
 * @param {object} constitution
 * @param {{preset?: string}} [options]
 */
export function toMarkdown(constitution, { preset } = {}) {
  const rules = constitution.rules ?? [];
  const grouped = new Map();

  for (const rule of rules) {
    const source = rule.provenance?.source ?? 'preset';
    grouped.set(source, [...(grouped.get(source) ?? []), rule]);
  }

  const out = [
    '# My privacy policy',
    '',
    'This is what my AI agents are allowed to share about me, and with whom.',
    'It is checked before anything leaves this machine — not reported afterwards.',
    '',
    '> This file stays on your computer. It is never uploaded, because a rule',
    '> about your health leaks the fact by existing.',
    '',
  ];

  if (constitution.identity?.email || constitution.identity?.phone) {
    out.push('## Who I am', '');
    out.push('So the kernel can tell my own details apart from other people’s:', '');
    if (constitution.identity.email) out.push(`- ${constitution.identity.email}`);
    if (constitution.identity.phone) out.push(`- ${constitution.identity.phone}`);
    out.push('');
  }

  if (constitution.budget?.interruptionsPerDay !== undefined) {
    out.push('## How often it may interrupt me', '');
    out.push(`At most **${constitution.budget.interruptionsPerDay} times a day**. Beyond that it should be`);
    out.push('learning from the decisions I already made rather than asking again.', '');
  }

  out.push('## The rules', '');

  const sources = [...grouped.keys()].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  for (const source of sources) {
    out.push(`### ${SOURCE_HEADINGS[source] ?? source}`, '');
    for (const rule of grouped.get(source)) {
      const suffix = rule.expires ? ` _(until ${new Date(rule.expires).toLocaleTimeString()})_` : '';
      out.push(`- ${rule.says}${suffix}`);
    }
    out.push('');
  }

  out.push('## What happens when a rule fires', '');
  out.push('| Outcome | What it means |');
  out.push('| --- | --- |');
  for (const [outcome, meaning] of Object.entries(OUTCOME_WORDS)) {
    if (!rules.some((rule) => rule.outcome === outcome)) continue;
    out.push(`| \`${outcome}\` | The data ${meaning}. |`);
  }
  out.push('');
  out.push('Most of these leave the task working. Blocking is the rare one — a');
  out.push('privacy tool that mostly stops things from working gets switched off.', '');

  out.push('---', '');
  out.push(
    `_${rules.length} rules${preset ? `, starting from the **${preset}** preset` : ''}. Edit this file and run_`,
  );
  out.push('_`npx privacy-constitution compile` to put your changes into force._');

  return `${out.join('\n')}\n`;
}
