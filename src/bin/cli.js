#!/usr/bin/env node
/**
 * The command line surface.
 *
 *   init      set up a constitution from a preset
 *   install   register the kernel as a PreToolUse hook
 *   check     evaluate one call from stdin, for debugging and for the demo
 *   report    what the kernel withheld, and how often it interrupted you
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../kernel/index.js';
import {
  PRIVACY_HOME,
  RULES_PATH,
  POLICY_PATH,
  loadConstitution,
  loadYaml,
  presetPath,
  saveConstitution,
  warnings,
} from '../kernel/constitution.js';
import { readLedger, summarize } from '../kernel/ledger.js';
import { menuFor, pruneExpired } from '../kernel/rules.js';
import { clearHold, listHolds, loadHold } from '../kernel/pending.js';
import { escalate } from '../kernel/freetext.js';
import { onboard, rehearse } from './onboard.js';
import { scan, summarizeScan } from '../kernel/history.js';
import { propose, repeatedDecisions, words } from '../kernel/infer.js';
import { conform } from '../kernel/conformance.js';
import { PRESETS, buildPreset } from '../kernel/questions.js';
import { toMarkdown } from '../kernel/policy-doc.js';
import { fieldDiff, panel, select, style } from './ui.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(HERE, '..', 'adapters', 'claude-code.js');

/**
 * Is this hook ours?
 *
 * The registered command is a filesystem path, so it carries whatever the
 * checkout happens to be called rather than the package name. The adapter's
 * own path is the part that does not move.
 */
const INSTALLED_HOOK = /adapters[/\\]claude-code\.js/;

const ESC = '[';
const bold = (text) => `${ESC}1m${text}${ESC}0m`;
const dim = (text) => `${ESC}2m${text}${ESC}0m`;
const green = (text) => `${ESC}32m${text}${ESC}0m`;

function readJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Register the hook, without disturbing hooks that are already there.
 *
 * The matcher is deliberately absent: every tool is a potential egress point,
 * and a kernel that only watches the tools we thought of is a kernel with a
 * blind spot it cannot report.
 */
function install({ scope = 'project', dir = process.cwd() } = {}) {
  const settingsPath =
    scope === 'user'
      ? join(homedir(), '.claude', 'settings.json')
      : join(dir, '.claude', 'settings.json');

  const settings = readJson(settingsPath);
  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];

  const already = settings.hooks.PreToolUse.some((entry) =>
    (entry.hooks ?? []).some((hook) => hook.command?.includes('adapters/claude-code.js')),
  );

  if (!already) {
    settings.hooks.PreToolUse.push({
      hooks: [
        {
          type: 'command',
          command: `node ${HOOK}`,
          timeout: 10,
          statusMessage: 'Checking against your privacy constitution...',
        },
      ],
    });
  }

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return { settingsPath, already };
}

/** Non-interactive fallback: used by `install`, and where there is no terminal. */
function initConstitution({ preset = 'balanced', force = false, email, phone } = {}) {
  if (existsSync(RULES_PATH) && !force) {
    return { path: RULES_PATH, existed: true };
  }
  const base = buildPreset(preset, {
    identity: { ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
  });
  mkdirSync(PRIVACY_HOME, { recursive: true });
  writeFileSync(POLICY_PATH, toMarkdown(base, { preset }), 'utf8');
  saveConstitution(base);
  return { path: RULES_PATH, existed: false };
}

/**
 * Check the setup end to end, and say what is wrong in words.
 *
 * Everything here has one failure mode in common: it looks installed and
 * quietly does nothing. A hook registered against a constitution that is not
 * there, or an identity left empty so your own details read as somebody
 * else's. Worth one command before you rely on it.
 */
function doctor({ dir = process.cwd() } = {}) {
  const problems = [];
  const ok = [];

  if (existsSync(RULES_PATH)) {
    const constitution = loadConstitution();
    ok.push(`${constitution.rules.length} rules at ${RULES_PATH}`);
    for (const warning of warnings(constitution)) problems.push([warning.says, warning.fix]);
  } else {
    problems.push([
      'No constitution — the preset is standing in for one.',
      'npx privacy.md init',
    ]);
  }

  const settingsPath = join(dir, '.claude', 'settings.json');
  const settings = readJson(settingsPath);
  const registered = (settings.hooks?.PreToolUse ?? []).some((entry) =>
    (entry.hooks ?? []).some((hook) => INSTALLED_HOOK.test(hook.command ?? '')),
  );
  if (registered) ok.push(`hook registered in ${settingsPath}`);
  else problems.push([`No hook in ${settingsPath} — nothing is being checked here.`, `npx privacy.md install --dir ${dir}`]);

  // The only check that matters: does a call carrying something personal
  // actually get stopped?
  const probe = check(
    {
      tool: 'WebFetch',
      input: { url: 'https://a-service-you-have-never-used.example/x?email=someone@example.com' },
    },
    loadConstitution(),
  );
  if (probe.decision === 'allow') {
    problems.push(['A test call carrying an email was allowed through.', 'npx privacy.md rules']);
  } else {
    ok.push(`a personal detail to an unknown service is ${probe.decision}`);
  }

  console.log();
  for (const item of ok) console.log(`  ${green('ok')}  ${item}`);
  for (const [says, fix] of problems) {
    console.log(`  ${style.amber('!!')}  ${says}`);
    console.log(`      ${dim(fix)}`);
  }
  console.log();
  if (problems.length === 0) console.log(green('  Ready.'));
  else process.exitCode = 1;
  console.log();
}

/** The onboarding flow: preset, the contested questions, the review table. */
async function runOnboarding({ force = false } = {}) {
  const existing = existsSync(RULES_PATH);
  if (existing && !force) {
    console.log(dim(`You already have a constitution at ${RULES_PATH}.`));
    console.log(dim('Run with --force to start over, or `rules` to see what it says.'));
    return;
  }

  const { constitution, freeText, preset, budget } = await onboard({ existing });

  console.log();
  if (freeText.length > 0) {
    console.log(`  ${style.bold('What you typed, as rules')}`);
    for (const entry of freeText) console.log(`    ${style.green('+')} ${entry.rule.says}`);
  }

  // Anything we could not place is said out loud. A user who typed a rule and
  // heard nothing back will assume it is in force.
  const missed = freeText.length >= 0 ? escalate(freeText.map((e) => e.from).join('. ')) : [];
  if (missed.length > 0) {
    console.log(`  ${style.amber('Not understood, so not saved:')}`);
    for (const clause of missed) console.log(`    ${style.dim(clause)}`);
  }

  // The readable file first, then the machine's copy compiled from it. That
  // order is the point: a policy nobody can read is one nobody has agreed to.
  mkdirSync(PRIVACY_HOME, { recursive: true });
  writeFileSync(POLICY_PATH, toMarkdown(constitution, { preset }), 'utf8');
  saveConstitution(constitution);

  console.log();
  console.log(green(`  Your privacy policy: ${POLICY_PATH}`));
  console.log(dim(`  ${constitution.rules.length} rules, in plain English. Open it — it is yours to edit.`));
  console.log(green(`  Compiled to:         ${RULES_PATH}`));
  console.log(dim(`  Interruption budget: ${budget} a day. The report measures against it.`));

  console.log();
  console.log(`  ${style.bold('What that does, on flows you will recognise')}`);
  console.log();
  for (const line of rehearse(constitution)) console.log(`    ${line}`);

  console.log();
  console.log(dim('  Next: npx privacy.md install    (registers the hook in this project)'));
  console.log(dim('        npx privacy.md try        (one call, before and after)'));
  console.log();
}

/**
 * One call, before and after.
 *
 * The shortest possible answer to "so what does it actually do". Everything
 * else in this tool is scaffolding around this moment.
 */
function tryOne() {
  const constitution = loadConstitution();

  const call = {
    tool: 'create_calendar_event',
    recipient: { name: 'Google Calendar', sector: 'productivity', trust: 'known' },
    input: {
      title: 'Appointment',
      start: '2026-09-11T14:00+02:00',
      notes: 'Physiotherapy, lower back injury. Reference #A2213.',
      attendee: '+32 2 345 67 89',
    },
  };

  const result = check(call, constitution);

  console.log();
  console.log(`  ${bold('Your agent wants to write this to your shared work calendar')}`);
  console.log();
  for (const row of fieldDiff(call.input, call.input, 64)) console.log(`      ${row}`);

  console.log();
  console.log(`  ${style.amber('!')}  ${bold('Your privacy constitution stopped part of that')}`);
  console.log();
  for (const reason of result.reasons) console.log(`      ${style.amber('·')} ${reason}`);

  console.log();
  console.log(`  ${bold('What Google Calendar actually receives')}`);
  console.log();
  for (const row of fieldDiff(call.input, result.input, 64)) console.log(`      ${row}`);

  console.log();
  console.log(
    `  ${green(`${result.minimization.withheld} fields withheld`)}${dim(
      ', and the event is still in your calendar at the right time.',
    )}`,
  );
  console.log(dim('  That is the whole idea: the task completes carrying less of you.'));
  console.log();
}

/** Show the constitution in the plain-English form the user can audit. */
function showRules() {
  const constitution = loadConstitution();
  const bySource = new Map();
  for (const rule of constitution.rules ?? []) {
    const source = rule.provenance?.source ?? 'unattributed';
    bySource.set(source, [...(bySource.get(source) ?? []), rule]);
  }

  const colour = { allow: style.green, redact: style.violet, substitute: style.cyan, ask: style.amber, block: style.red };

  console.log();
  for (const [source, rules] of bySource) {
    console.log(`  ${bold(source.replace(/-/g, ' '))}`);
    for (const rule of rules) {
      const paint = colour[rule.outcome] ?? style.dim;
      console.log(`    ${paint(rule.outcome.padEnd(11))} ${rule.says}`);
      if (rule.expires) console.log(`    ${' '.repeat(11)} ${dim(`expires ${new Date(rule.expires).toLocaleTimeString()}`)}`);
    }
    console.log();
  }
  console.log(dim(`  ${RULES_PATH}`));
  console.log();
}

function report() {
  const entries = readLedger();
  if (entries.length === 0) {
    console.log(dim('Nothing recorded yet. Run an agent with the hook installed first.'));
    return;
  }
  const summary = summarize(entries);
  const pct =
    summary.minimizationRatio === null ? '--' : `${Math.round(summary.minimizationRatio * 100)}%`;

  console.log();
  console.log(bold('  What your agent sent, and what it did not'));
  console.log();
  console.log(`  calls checked        ${summary.calls}`);
  console.log(`  fields available     ${summary.available}`);
  console.log(`  fields sent          ${summary.sent}`);
  console.log(green(`  withheld             ${summary.withheld}  (${pct} minimized)`));
  console.log(`  interruptions        ${summary.interruptions}`);

  if (summary.byRule.length > 0) {
    console.log();
    console.log(bold('  Rules that fired'));
    for (const [rule, count] of summary.byRule.slice(0, 8)) {
      console.log(`    ${String(count).padStart(3)}  ${rule}`);
    }
  }
  if (summary.byRecipient.length > 0) {
    console.log();
    console.log(bold('  Who your agent talked to'));
    for (const [name, count] of summary.byRecipient.slice(0, 8)) {
      console.log(`    ${String(count).padStart(3)}  ${name}`);
    }
  }

  // The line that matters more than any metric: fatigue as something to fix
  // rather than something to report.
  const repeats = repeatedDecisions(entries);
  if (repeats.length > 0) {
    console.log();
    console.log(bold('  Worth one rule'));
    for (const repeat of repeats.slice(0, 3)) {
      console.log(`    ${style.amber(repeat.suggestion)}`);
    }
  }

  const budget = loadConstitution().budget?.interruptionsPerDay;
  if (budget !== undefined) {
    const over = summary.interruptions > budget;
    console.log();
    console.log(
      `  ${over ? style.amber(`You asked for at most ${budget} interruptions a day. This is ${summary.interruptions}.`) : dim(`Within your budget of ${budget} a day.`)}`,
    );
  }
  console.log();
}

/**
 * Apply a choice from a hold menu.
 *
 * This is where the constitution actually grows. The rule is echoed back before
 * it is saved, because a privacy rule the user did not understand is worse than
 * no rule at all.
 */
async function decide(id, choice) {
  const hold = loadHold(id);
  if (!hold) {
    console.log(dim(`No held call with id ${id}. It may have expired, or already been decided.`));
    const open = listHolds();
    if (open.length > 0) console.log(dim(`Open holds: ${open.map((h) => h.id).join(', ')}`));
    process.exitCode = 1;
    return;
  }

  const options = menuFor(hold);
  let option;

  if (choice === undefined && process.stdin.isTTY) {
    // The user is at their own terminal, so they get the picker rather than a
    // number to type. Same menu the agent relayed, with the rule each option
    // writes updating as the cursor moves.
    option = await select({
      title: `${hold.tool} wants to reach ${hold.recipient.name}`,
      hint:
        hold.recipient.chosenBy === 'agent'
          ? 'You did not pick this destination, the agent did.'
          : `Recipient is ${hold.recipient.trust.replace(/_/g, ' ')}.`,
      options: options.map((entry) => ({ ...entry, hint: entry.consequence })),
      preview: (entry) => {
        const written = entry.rule();
        return panel(
          'the rule this writes',
          written ? [written.says] : [style.dim('nothing is remembered, this call only')],
        );
      },
    });
  } else {
    const index = Number.parseInt(choice, 10) - 1;
    option = Number.isInteger(index) ? options[index] : options.find((o) => o.key === choice);
  }

  if (!option) {
    console.log(dim(`Pick one of 1-${options.length}, or a name: ${options.map((o) => o.key).join(', ')}`));
    process.exitCode = 1;
    return;
  }

  const rule = option.rule();
  console.log();
  console.log(`  ${bold(option.label)} -- ${option.consequence}`);

  if (rule) {
    const current = pruneExpired(loadConstitution()).constitution;
    const rules = current.rules.filter((existing) => existing.id !== rule.id);
    saveConstitution({ ...current, rules: [...rules, rule] });
    console.log(green(`  rule added: ${rule.says}`));
    if (rule.expires) console.log(dim(`  expires ${new Date(rule.expires).toLocaleTimeString()}`));
    console.log(dim(`  ${RULES_PATH}`));
  } else {
    console.log(dim('  nothing recorded -- this call only'));
  }

  clearHold(id);
  console.log();
  console.log(dim('  Retry the call. The constitution now covers it.'));
  console.log();
}

function holds() {
  const open = listHolds();
  if (open.length === 0) {
    console.log(dim('Nothing held.'));
    return;
  }
  for (const hold of open) {
    console.log(`  ${bold(hold.id)}  ${hold.tool} -> ${hold.recipient.name}`);
    for (const [index, option] of menuFor(hold).entries()) {
      console.log(`     ${index + 1}. ${option.label}  ${dim(option.consequence)}`);
    }
    console.log(dim(`     npx privacy.md decide ${hold.id} <number>`));
  }
}

/**
 * What your agent already did, before any of this was installed.
 *
 * The report redacts itself: counts and kinds, never values. A leak report that
 * quotes your secrets back at you on a projector is its own incident.
 */
async function runScan({ days = 30, apply = false, includeFixtures = false } = {}) {
  const constitution = existsSync(RULES_PATH) ? loadConstitution() : { rules: [] };
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  process.stdout.write(dim('  reading transcripts... '));
  const raw = await scan({ since, identity: constitution.identity, includeFixtures });
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  const summary = summarizeScan(raw);

  console.log();
  console.log(`  ${bold(`What your agent did in the last ${days} days`)}`);
  console.log(`  ${dim(`${raw.scanned} sessions on this machine. Nothing here leaves it.`)}`);
  console.log();
  console.log(`  ${String(summary.calls).padStart(6)}  tool calls`);
  console.log(`  ${style.amber(String(summary.carrying).padStart(6))}  carried something personal`);
  console.log(`  ${String(summary.recipients).padStart(6)}  services received it`);
  if (raw.skippedFixtures > 0) {
    console.log(
      `  ${dim(`${String(raw.skippedFixtures).padStart(6)}  ignored as test fixtures (example.com, .test, localhost). --include-fixtures to count them.`)}`,
    );
  }

  if (summary.spread.length > 0) {
    console.log();
    console.log(`  ${bold('Where it went')}`);
    for (const [type, count] of summary.spread.slice(0, 8)) {
      const total = summary.byType.find(([name]) => name === type)?.[1] ?? 0;
      console.log(
        `    ${words(type).padEnd(30)} ${style.amber(String(count).padStart(2))} ${count === 1 ? 'service ' : 'services'}  ${dim(`${total} ${total === 1 ? 'time' : 'times'}`)}`,
      );
    }
  }

  if (summary.byRecipient.length > 0) {
    console.log();
    console.log(`  ${bold('Who received the most')}`);
    for (const [name, count] of summary.byRecipient.slice(0, 6)) {
      console.log(`    ${String(count).padStart(5)}  ${name}`);
    }
  }

  const existingRuleIds = new Set((constitution.rules ?? []).map((rule) => rule.id));
  const proposals = propose(summary, { existingRuleIds });

  if (proposals.length > 0) {
    console.log();
    console.log(`  ${bold('Rules this suggests')}`);
    for (const proposal of proposals) {
      console.log();
      console.log(`    ${dim(proposal.evidence)}`);
      if (proposal.rule) console.log(`    ${green('rule')}  ${proposal.rule.says}`);
      if (proposal.also) console.log(`    ${green('    ')}  ${proposal.also.says}`);
      if (proposal.question) console.log(`    ${style.amber('look')}  ${proposal.question}`);
    }

    if (apply) {
      const added = proposals.flatMap((proposal) => [proposal.rule, proposal.also].filter(Boolean));
      const kept = (constitution.rules ?? []).filter((rule) => !added.some((one) => one.id === rule.id));
      saveConstitution({ ...constitution, rules: [...kept, ...added] });
      console.log();
      console.log(green(`  ${added.length} rules added to ${RULES_PATH}`));
    } else {
      console.log();
      console.log(dim('  Run with --apply to add these. Nothing has been changed.'));
    }
  }
  console.log();
}

/**
 * Score a constitution against the probe suite.
 *
 * Both numbers are reported. A suite that only shows the protected score is
 * measuring the probes rather than the protection.
 */
function runConform({ compare = false, verbose = false } = {}) {
  const score = (policy) => conform(policy);

  if (compare) {
    console.log();
    console.log(`  ${bold('How each preset scores')}`);
    console.log(`  ${dim('Same 24 probes. A preset that scores full marks would not be a preset.')}`);
    console.log();
    for (const preset of PRESETS) {
      const policy = buildPreset(preset, { identity: { email: 'you@example.com', phone: '+32 470 11 22 33' } });
      const result = score(policy);
      const bar = '█'.repeat(result.held) + dim('·'.repeat(result.total - result.held));
      // Held is only half the story. A preset that scores well by refusing
      // everything has broken the agent, so the cost columns matter as much.
      const cost = [
        `${result.interrupted} asked`,
        result.overBlocked > 0 ? style.amber(`${result.overBlocked} broke a working task`) : '0 broke a working task',
      ].join(', ');
      console.log(`    ${preset.padEnd(10)} ${bar}  ${String(result.held).padStart(2)}/${result.total}   ${dim(cost)}`);
    }
    console.log();
    return;
  }

  const constitution = loadConstitution();
  const result = score(constitution);

  console.log();
  console.log(`  ${bold('Constitution strength')}`);
  console.log(`  ${dim(`${result.total} probes designed to tempt a leak.`)}`);
  console.log();
  console.log(`    ${style.red(String(result.unprotectedLeaks).padStart(2))}/${result.total}  leak with no constitution`);
  console.log(`    ${green(String(result.held).padStart(2))}/${result.total}  held with yours`);
  if (result.interrupted > 0) console.log(`    ${style.amber(String(result.interrupted).padStart(2))}     needed a decision from you`);
  if (result.overBlocked > 0) {
    console.log(`    ${style.amber(String(result.overBlocked).padStart(2))}     over-blocked -- a task that should have worked did not`);
  }

  // An over-block almost always traces back to something the constitution is
  // missing rather than to a rule being too strict, so say which.
  for (const warning of warnings(constitution)) {
    console.log();
    console.log(`  ${style.amber('!')} ${warning.says}`);
    console.log(`    ${dim(warning.because)}`);
    console.log(`    ${dim(warning.fix)}`);
  }

  console.log();
  console.log(`  ${bold('By category')}`);
  for (const [category, entry] of result.byCategory) {
    const full = entry.held === entry.total;
    const mark = full ? green('ok  ') : style.amber('gap ');
    console.log(`    ${mark} ${category.padEnd(18)} ${entry.held}/${entry.total}`);
  }

  if (result.failures.length > 0) {
    console.log();
    console.log(`  ${bold('What still gets through')}`);
    for (const failure of result.failures) {
      const tag = failure.expectHard ? dim('known limit') : style.red('unexpected ');
      console.log(`    ${tag}  ${failure.title}`);
      if (verbose && failure.leaked.length > 0) {
        console.log(`                 ${dim(`leaked: ${failure.leaked.join(', ').slice(0, 60)}`)}`);
      }
    }
    console.log();
    console.log(dim('  Known limits are the edge of the deterministic pass, not bugs:'));
    console.log(dim('  data split across fields, and data encoded before it is sent.'));
  }
  console.log();
}

async function checkStdin() {
  const raw = await new Promise((resolveInput) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (buffer += chunk));
    process.stdin.on('end', () => resolveInput(buffer));
  });
  const call = JSON.parse(raw);
  const result = check(
    { tool: call.tool ?? call.tool_name, input: call.input ?? call.tool_input ?? {} },
    loadConstitution(),
  );
  console.log(JSON.stringify(result, null, 2));
}

const [command, ...args] = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

switch (command) {
  case 'init': {
    if (flag('preset') || !process.stdin.isTTY) {
      const { path, existed } = initConstitution({
        preset: value('preset', 'balanced'),
        force: flag('force'),
        email: value('email'),
        phone: value('phone'),
      });
      console.log(
        existed
          ? dim(`Your privacy.md is already at ${POLICY_PATH} (use --force to reset)`)
          : green(`Written to ${POLICY_PATH}, compiled to ${path}`),
      );
    } else {
      await runOnboarding({ force: flag('force') });
    }
    break;
  }
  case 'rules':
    showRules();
    break;
  case 'doctor':
    doctor({ dir: value('dir', process.cwd()) });
    break;
  case 'try':
    tryOne();
    break;
  case 'policy':
    console.log(readFileSync(POLICY_PATH, 'utf8'));
    break;
  case 'install': {
    initConstitution({ preset: value('preset', 'balanced') });
    const { settingsPath, already } = install({
      scope: flag('user') ? 'user' : 'project',
      dir: value('dir', process.cwd()),
    });
    console.log(
      already ? dim(`Hook already registered in ${settingsPath}`) : green(`Hook registered in ${settingsPath}`),
    );
    console.log(dim(`Constitution: ${RULES_PATH}`));
    break;
  }
  case 'decide':
    await decide(args[0], args[1]);
    break;
  case 'holds':
    holds();
    break;
  case 'check':
    await checkStdin();
    break;
  case 'report':
    report();
    break;
  case 'scan':
    await runScan({
      days: Number(value('days', 30)),
      apply: flag('apply'),
      includeFixtures: flag('include-fixtures'),
    });
    break;
  case 'conform':
    runConform({ compare: flag('compare'), verbose: flag('verbose') });
    break;
  case 'demo': {
    const { runDemo } = await import('./demo.js');
    await runDemo();
    break;
  }
  default:
    console.log(`
  ${bold('privacy.md')} -- pre-tool-call enforcement of your privacy rules

    demo      the whole thing, seven acts           ${dim('--auto unattended, --fast for rehearsal')}
    init      set up your constitution              ${dim('--force  --email you@x  --preset balanced')}
    doctor    check the setup actually works        ${dim('--dir <project>')}
    policy    your privacy policy, the file you can read
    rules     what your constitution says, in plain English
    try       one call, before and after
    install   register the PreToolUse hook         ${dim('--user | --dir <path>')}
    holds     calls waiting on a decision, with the menu for each
    decide    answer a held call                   ${dim('<hold-id> <number>')}
    scan      what your agent already did          ${dim('--days 30 --apply')}
    conform   score your constitution against 24 probes  ${dim('--compare')}
    check     evaluate one call read from stdin
    report    what was withheld, and how often you were interrupted
`);
}
