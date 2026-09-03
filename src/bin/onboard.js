/**
 * Onboarding.
 *
 * Three screens: pick a preset, answer only what the presets disagree on,
 * review the table. Free text and identity are offered after, because they are
 * the parts people either care about a lot or want to skip entirely.
 *
 * The point is not to capture the user's rules — a questionnaire is guessing.
 * The point is that day one is not forty interruptions. The constitution really
 * gets written at the hold menu, from decisions the user actually had to make.
 */

import {
  ALWAYS,
  DATA_TYPES,
  QUESTIONS,
  SCALE,
  contestedQuestions,
  mergeRules,
  rulesFromScale,
  scaleForPreset,
} from '../kernel/questions.js';
import { compileFreeText } from '../kernel/freetext.js';
import { check } from '../kernel/index.js';
import { matrix, panel, select, style, text } from './ui.js';

const PRESET_OPTIONS = [
  {
    key: 'cautious',
    label: 'Cautious',
    hint: 'nothing personal moves without you; expect to be asked more at first',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    hint: 'strip what is not needed, ask about places you have never sent to',
  },
  {
    key: 'open',
    label: 'Open',
    hint: 'secrets and beliefs still protected; most else flows',
  },
];

const line = (text) => console.log(text);

export async function onboard({ existing } = {}) {
  line('');
  line(`  ${style.bold('Your privacy constitution')}`);
  line(`  ${style.dim('Rules your agent has to follow before anything about you leaves this machine.')}`);
  if (existing) line(`  ${style.amber('This replaces the constitution you already have.')}`);

  const preset = await select({
    title: 'Where do you want to start?',
    hint: 'You can change any of this in a moment.',
    options: PRESET_OPTIONS,
    initial: 1,
    preview: (option) => {
      const scale = scaleForPreset(option.key);
      return panel('what that means', [
        ...DATA_TYPES.slice(0, 5).map(
          (type) => `${type.label.padEnd(24)} ${style.cyan(SCALE[scale[type.key]].short.trim())}`,
        ),
        style.dim(`${'…and 3 more'.padEnd(24)}`),
      ]);
    },
  });

  // Only the questions the presets genuinely disagree on. The rest are already
  // answered by the choice above, and asking them again would be theatre.
  const contested = contestedQuestions();
  const answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.presets[preset.key]]));

  line('');
  line(`  ${style.dim(`${contested.length} questions — only where the presets disagree.`)}`);

  for (const [index, question] of contested.entries()) {
    const options = question.answers.map((answer) => ({ ...answer, key: answer.key }));
    const initial = Math.max(0, options.findIndex((option) => option.key === question.presets[preset.key]));
    const chosen = await select({
      title: `${index + 1}/${contested.length}  ${question.ask}`,
      options,
      initial,
      preview: (option) => {
        const rules = question.rules(option.key);
        if (question.budget) {
          return panel('budget', [`at most ${style.cyan(String(question.budget[option.key]))} interruptions a day`]);
        }
        if (rules.length === 0) return panel('rule', [style.dim('no rule — nothing stands in the way')]);
        return panel('rule', rules.map((rule) => rule.says));
      },
    });
    answers[question.id] = chosen.key;
  }

  // The review table. A preset filled every row; the user changes what they
  // care about and leaves the rest.
  const scale = scaleForPreset(preset.key);
  const rows = DATA_TYPES.map((type) => ({ ...type, value: scale[type.key] }));

  await matrix({
    title: 'Your data, and how far it travels',
    hint: 'Change what you care about. The rest is already set.',
    rows,
    scale: SCALE,
    footer: 'Anything you leave alone keeps the preset’s setting.',
  });

  // Free text last, because it is the part that most needs the user to already
  // understand what a rule is.
  const typed = await text({
    title: 'Anything else, in your own words?',
    hint: 'For example: "never mention that I am pregnant" or "my work email can go anywhere, my personal one cannot".',
    placeholder: 'press enter to skip',
  });

  const freeText = typed ? compileFreeText(typed) : [];

  const identityEmail = await text({
    title: 'Your own email address',
    hint: 'So the kernel can tell your details apart from other people’s. It never leaves this machine.',
    placeholder: 'press enter to skip',
  });

  const identityPhone = identityEmail
    ? await text({
        title: 'Your own phone number',
        hint: 'Same reason. Skipping means every number reads as somebody else’s.',
        placeholder: 'press enter to skip',
      })
    : '';

  const rules = mergeRules(
    rulesFromScale(rows),
    ...QUESTIONS.map((question) => question.rules(answers[question.id])),
    ALWAYS,
    freeText.map((entry) => entry.rule),
  );

  const budget = QUESTIONS.find((question) => question.budget)?.budget[answers['interruption-budget']] ?? 3;

  const constitution = {
    version: 1,
    preset: preset.key,
    identity: {
      ...(identityEmail ? { email: identityEmail } : {}),
      ...(identityPhone ? { phone: identityPhone } : {}),
    },
    budget: { interruptionsPerDay: budget },
    rules: rules.map((rule) => ({
      ...rule,
      provenance: rule.provenance ?? { source: 'questionnaire', preset: preset.key, at: new Date().toISOString() },
    })),
  };

  return { constitution, freeText, preset: preset.key, budget };
}

/**
 * Show what the new constitution would do, against flows the user recognises.
 *
 * A rule nobody has seen fire is a rule nobody trusts. This is also the cheapest
 * possible check that we compiled their words into something they meant.
 */
export function rehearse(constitution) {
  const samples = [
    { label: 'a health note into your calendar', tool: 'mcp__google_calendar__create_event', input: { title: 'Appointment', notes: 'Physio, lower back injury' } },
    { label: 'the same note to your clinic', tool: 'mcp__doctolib__book', input: { reason: 'Physio, lower back injury' } },
    { label: "a colleague's number to an outside tool", tool: 'mcp__slack__post', input: { text: 'Reach Jan on +32 2 345 67 89' } },
    { label: 'an API key in a request', tool: 'WebFetch', input: { url: 'https://api.example.com', api_key: 'sk-ant-abc123def456ghi789' } },
    { label: 'your email to a site you have never used', tool: 'WebFetch', input: { url: 'https://unknown-crm.io/signup', email: 'you@example.com' } },
  ];

  const colour = { allow: style.green, redact: style.violet, substitute: style.cyan, ask: style.amber, block: style.red };

  return samples.map((sample) => {
    const result = check({ tool: sample.tool, input: sample.input }, constitution);
    const paint = colour[result.decision] ?? style.dim;
    return `${paint(result.decision.padEnd(11))} ${sample.label}`;
  });
}
