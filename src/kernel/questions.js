/**
 * Onboarding, as situations rather than fields.
 *
 * "Your agent found a service you have never used and wants to send it your
 * email address" is answerable. "Do you permit category CONTACT" is not.
 *
 * Each question carries the rules each answer would write, and each preset
 * pre-answers all of them. We only put a question to the user where the presets
 * genuinely disagree — that is what turns thirty questions into six.
 */

export const PRESETS = ['cautious', 'balanced', 'open'];

/** The five-point setting shown per data type on the review screen. */
export const SCALE = [
  { key: 'never', short: 'never', describe: (row) => `${row.label}: never leaves this machine.` },
  { key: 'ask', short: ' ask ', describe: (row) => `${row.label}: you decide, every time.` },
  { key: 'known', short: 'known', describe: (row) => `${row.label}: only to services you already use.` },
  { key: 'needed', short: 'needed', describe: (row) => `${row.label}: sent when the task genuinely needs it.` },
  { key: 'always', short: 'always', describe: (row) => `${row.label}: sent whenever asked for.` },
];

export const DATA_TYPES = [
  { key: 'credentials', label: 'keys and secrets' },
  { key: 'health', label: 'health details' },
  { key: 'financial', label: 'financial details' },
  { key: 'identity', label: 'identity documents' },
  { key: 'location', label: 'your location', singular: true },
  { key: 'contact', label: 'your contact details' },
  { key: 'third_party_contact', label: "other people's details" },
  { key: 'special_category', label: 'beliefs and orientation' },
];

const outcomeFor = {
  never: 'block',
  ask: 'ask',
  known: 'ask',
  needed: 'redact',
  always: 'allow',
};

/**
 * The questions.
 *
 * `answers` are ordered from most protective to least, so a preset's index into
 * them says how cautious it is. `rules` turns the chosen answer into policy.
 */
export const QUESTIONS = [
  {
    id: 'unneeded-fields',
    ask: 'A tool asks for something the task does not actually need.',
    answers: [
      { key: 'strip', label: 'Strip it and send the rest', hint: 'the task still completes' },
      { key: 'ask', label: 'Ask me', hint: 'every time, until I say otherwise' },
      { key: 'send', label: 'Send it anyway', hint: 'fewer interruptions, more shared' },
    ],
    presets: { cautious: 'strip', balanced: 'strip', open: 'send' },
    rules: (answer) =>
      answer === 'send'
        ? []
        : [
            {
              id: 'minimize-unneeded-fields',
              says: 'Anything the task does not need is stripped before the call goes out.',
              data: ['contact', 'location', 'identity', 'financial'],
              recipient: { trust: ['known', 'task_scoped'] },
              outcome: answer === 'ask' ? 'ask' : 'redact',
            },
          ],
  },
  {
    id: 'unknown-recipient',
    ask: 'Your agent found a service you have never used, and wants to send it something personal.',
    answers: [
      { key: 'block', label: 'Block it', hint: 'the call fails' },
      { key: 'ask', label: 'Ask me', hint: 'you did not pick this destination, so you decide' },
      { key: 'allow', label: 'Let it through', hint: 'the agent is trusted to choose' },
    ],
    presets: { cautious: 'block', balanced: 'ask', open: 'allow' },
    rules: (answer) =>
      answer === 'allow'
        ? []
        : [
            {
              id: 'unknown-recipients',
              says:
                answer === 'block'
                  ? 'Nothing personal reaches a service you have never used.'
                  : 'Anything personal going to a service you have never used needs a decision.',
              data: ['contact', 'third_party_contact', 'location', 'identity', 'financial', 'health'],
              recipient: { trust: ['agent_chosen'] },
              outcome: answer,
            },
          ],
  },
  {
    id: 'health-elsewhere',
    ask: 'Should health details ever land in your calendar, your notes, or your agent’s memory?',
    answers: [
      { key: 'healthcare-only', label: 'No — healthcare providers only', hint: 'stripped everywhere else' },
      { key: 'ask', label: 'Ask me each time' },
      { key: 'anywhere', label: 'Yes, treat them like anything else' },
    ],
    presets: { cautious: 'healthcare-only', balanced: 'healthcare-only', open: 'anywhere' },
    rules: (answer) =>
      answer === 'anywhere'
        ? []
        : [
            {
              id: 'health-only-to-healthcare',
              says: 'Health details only go to a healthcare provider, never anywhere else.',
              data: ['health'],
              recipient: { trust: ['known', 'task_scoped', 'agent_chosen', 'public', 'model_provider'] },
              outcome: answer === 'ask' ? 'ask' : 'redact',
            },
            {
              id: 'health-to-healthcare-is-fine',
              says: 'Health details may go to a healthcare provider — that is the point of the appointment.',
              data: ['health'],
              recipient: { sector: ['healthcare'] },
              outcome: 'allow',
            },
          ],
  },
  {
    id: 'third-party-subjects',
    ask: 'Your agent summarises an email thread using an outside tool. It contains other people’s names and numbers.',
    answers: [
      { key: 'strip', label: 'Strip them', hint: 'they never agreed to any of this' },
      { key: 'ask', label: 'Ask me' },
      { key: 'send', label: 'Send the thread as it is' },
    ],
    presets: { cautious: 'strip', balanced: 'strip', open: 'send' },
    rules: (answer) =>
      answer === 'send'
        ? []
        : [
            {
              id: 'strip-other-peoples-contacts',
              says: "Other people's phone numbers and emails are stripped before any third-party tool.",
              data: ['third_party_contact'],
              recipient: { trust: ['known', 'task_scoped', 'agent_chosen', 'public'] },
              outcome: answer === 'ask' ? 'ask' : 'redact',
            },
          ],
  },
  {
    id: 'location-after-delivery',
    ask: 'A courier has your address for a delivery. Should it stay shared after the parcel arrives?',
    answers: [
      { key: 'expire', label: 'No — only while they are delivering', hint: 'consent with a clock on it' },
      { key: 'keep', label: 'Yes, leave it with them' },
    ],
    presets: { cautious: 'expire', balanced: 'expire', open: 'keep' },
    rules: (answer) =>
      answer === 'keep'
        ? []
        : [
            {
              id: 'location-only-while-delivering',
              says: 'Precise location only goes to a service actively delivering to you, and only while it is.',
              data: ['location'],
              recipient: { sector: ['logistics'] },
              outcome: 'ask',
              when: { unless_active_delivery: true },
            },
          ],
  },
  {
    id: 'secrets-in-prompts',
    ask: 'Can keys and secrets go into a prompt? Everything in context reaches your model provider.',
    answers: [
      { key: 'never', label: 'Never', hint: 'the model provider is a recipient like any other' },
      { key: 'ask', label: 'Ask me' },
    ],
    // Every preset answers this the same way, so it never reaches the user.
    // Presets tune how often you are asked, not whether a secret can leave --
    // nobody picks Open because they want to leak an API key.
    presets: { cautious: 'never', balanced: 'never', open: 'never' },
    rules: (answer) => [
      {
        id: 'no-credentials-anywhere',
        says: 'Keys and secrets never leave this machine, including into prompts.',
        data: ['credentials'],
        recipient: { trust: ['*'] },
        outcome: answer === 'never' ? 'block' : 'ask',
      },
    ],
  },
  {
    id: 'interruption-budget',
    ask: 'How often are you willing to be interrupted for a decision?',
    answers: [
      { key: 'often', label: 'Whenever it matters', hint: 'the constitution learns fastest this way' },
      { key: 'few', label: 'A few times a day' },
      { key: 'rarely', label: 'Almost never', hint: 'more is decided for you' },
    ],
    presets: { cautious: 'often', balanced: 'few', open: 'rarely' },
    // Not a privacy rule: a budget the dashboard measures against, so the target
    // is one the user chose rather than one we invented.
    rules: () => [],
    budget: { often: 12, few: 3, rarely: 1 },
  },
];

/** Rules every constitution carries, whatever the answers. */
export const ALWAYS = [
  {
    id: 'nothing-personal-to-adtech',
    says: 'Nothing personal reaches advertising or analytics. Ever.',
    data: [
      'contact',
      'third_party_contact',
      'location',
      'health',
      'financial',
      'identity',
      'special_category',
      'salary_history',
    ],
    recipient: { sector: ['advertising', 'analytics'] },
    outcome: 'block',
  },
  {
    id: 'special-categories-never-to-adtech',
    says: 'Religion, politics, sexuality and union membership never reach advertising or analytics.',
    data: ['special_category'],
    recipient: { sector: ['advertising', 'analytics'] },
    outcome: 'block',
  },
  {
    id: 'no-salary-history-to-employers',
    says: 'Salary history never goes to a recruiter or an employer.',
    data: ['salary_history'],
    recipient: { sector: ['recruiting'] },
    outcome: 'block',
  },
  {
    id: 'mask-mandatory-contact-fields',
    says: 'When a service demands a phone number or email, it gets a mask, not the real one.',
    data: ['contact'],
    recipient: { sector: ['booking'] },
    outcome: 'substitute',
  },
];

/** Questions the presets answer differently — the only ones worth asking. */
export function contestedQuestions() {
  return QUESTIONS.filter((question) => new Set(Object.values(question.presets)).size > 1);
}

/** Where a preset sits on the five-point scale, per data type. */
export function scaleForPreset(preset) {
  const table = {
    cautious: { credentials: 0, health: 1, financial: 1, identity: 0, location: 1, contact: 2, third_party_contact: 0, special_category: 0 },
    balanced: { credentials: 0, health: 2, financial: 2, identity: 1, location: 2, contact: 3, third_party_contact: 1, special_category: 0 },
    open: { credentials: 0, health: 4, financial: 3, identity: 3, location: 4, contact: 4, third_party_contact: 3, special_category: 2 },
  };
  return table[preset] ?? table.balanced;
}

/** Turn the review table back into rules. */
export function rulesFromScale(rows) {
  return rows
    .map((row) => {
      const setting = SCALE[row.value];
      if (setting.key === 'always') return null;
      return {
        id: `scale-${row.key}`,
        says: settingSentence(row, setting),
        data: [row.key],
        recipient: setting.key === 'known' ? { trust: ['agent_chosen', 'public'] } : { trust: ['*'] },
        outcome: outcomeFor[setting.key],
      };
    })
    .filter(Boolean);
}

function settingSentence(row, setting) {
  const subject = row.label.charAt(0).toUpperCase() + row.label.slice(1);
  // Most labels are plural ("health details"); "your location" is not, and a
  // rule that reads as broken English is a rule nobody trusts.
  const verb = (plural, singular) => (row.singular ? singular : plural);
  return {
    never: `${subject} ${verb('never leave', 'never leaves')} this machine.`,
    ask: `${subject} ${verb('need', 'needs')} a decision before ${verb('they go', 'it goes')} anywhere.`,
    known: `${subject} ${verb('only go', 'only goes')} to services you already use.`,
    needed: `${subject} ${verb('are', 'is')} stripped unless the task genuinely needs ${verb('them', 'it')}.`,
  }[setting.key];
}

/**
 * Build a whole constitution from a preset name.
 *
 * The presets are defined once, here, as answers and scale positions.
 * `constitutions/balanced.yaml` is a materialised copy of what this produces
 * for `balanced`, shipped so the file format is readable without running
 * anything -- it is documentation, not a second source of truth.
 */
export function buildPreset(preset, { identity = {} } = {}) {
  const scale = scaleForPreset(preset);
  const rows = DATA_TYPES.map((type) => ({ ...type, value: scale[type.key] }));
  const rules = mergeRules(
    rulesFromScale(rows),
    ...QUESTIONS.map((question) => question.rules(question.presets[preset])),
    ALWAYS,
  );
  return {
    version: 1,
    preset,
    identity,
    budget: { interruptionsPerDay: QUESTIONS.find((q) => q.budget)?.budget[QUESTIONS.find((q) => q.budget).presets[preset]] ?? 3 },
    rules: rules.map((rule) => ({
      ...rule,
      provenance: rule.provenance ?? { source: 'preset', from: preset },
    })),
  };
}

/** Merge rule lists, later winning on id, so answers override the scale. */
export function mergeRules(...lists) {
  const byId = new Map();
  for (const list of lists) for (const rule of list) byId.set(rule.id, rule);
  return [...byId.values()];
}
