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
  CONSTITUTION_HOME,
  CONSTITUTION_PATH,
  loadConstitution,
  loadYaml,
  presetPath,
  saveConstitution,
} from '../kernel/constitution.js';
import { readLedger, summarize } from '../kernel/ledger.js';
import { menuFor, pruneExpired } from '../kernel/rules.js';
import { clearHold, listHolds, loadHold } from '../kernel/pending.js';
import { escalate } from '../kernel/freetext.js';
import { onboard, rehearse } from './onboard.js';
import { panel, select, style } from './ui.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(HERE, '..', 'adapters', 'claude-code.js');

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
    (entry.hooks ?? []).some((hook) => hook.command?.includes('privacy-constitution')),
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
function initConstitution({ preset = 'balanced', force = false } = {}) {
  if (existsSync(CONSTITUTION_PATH) && !force) {
    return { path: CONSTITUTION_PATH, existed: true };
  }
  const base = loadYaml(presetPath(preset));
  mkdirSync(CONSTITUTION_HOME, { recursive: true });
  saveConstitution({ ...base, identity: base.identity ?? {} });
  return { path: CONSTITUTION_PATH, existed: false };
}

/** The onboarding flow: preset, the contested questions, the review table. */
async function runOnboarding({ force = false } = {}) {
  const existing = existsSync(CONSTITUTION_PATH);
  if (existing && !force) {
    console.log(dim(`You already have a constitution at ${CONSTITUTION_PATH}.`));
    console.log(dim('Run with --force to start over, or `rules` to see what it says.'));
    return;
  }

  const { constitution, freeText, budget } = await onboard({ existing });

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

  console.log();
  console.log(`  ${style.bold('What that does, on flows you will recognise')}`);
  console.log();
  for (const line of rehearse(constitution)) console.log(`    ${line}`);

  saveConstitution(constitution);
  console.log();
  console.log(green(`  ${constitution.rules.length} rules written to ${CONSTITUTION_PATH}`));
  console.log(dim(`  Interruption budget: ${budget} a day. The report measures against it.`));
  console.log();
  console.log(dim('  Next: npx privacy-constitution install    (registers the hook in this project)'));
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
  console.log(dim(`  ${CONSTITUTION_PATH}`));
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
    console.log(dim(`  ${CONSTITUTION_PATH}`));
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
    console.log(dim(`     npx privacy-constitution decide ${hold.id} <number>`));
  }
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
      const { path, existed } = initConstitution({ preset: value('preset', 'balanced'), force: flag('force') });
      console.log(existed ? dim(`Constitution already at ${path} (use --force to reset)`) : green(`Constitution written to ${path}`));
    } else {
      await runOnboarding({ force: flag('force') });
    }
    break;
  }
  case 'rules':
    showRules();
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
    console.log(dim(`Constitution: ${CONSTITUTION_PATH}`));
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
  default:
    console.log(`
  ${bold('privacy-constitution')} -- pre-tool-call enforcement of your privacy rules

    init      set up your constitution              ${dim('--force to start over')}
    rules     what your constitution says, in plain English
    install   register the PreToolUse hook         ${dim('--user | --dir <path>')}
    holds     calls waiting on a decision, with the menu for each
    decide    answer a held call                   ${dim('<hold-id> <number>')}
    check     evaluate one call read from stdin
    report    what was withheld, and how often you were interrupted
`);
}
