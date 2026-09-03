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

function initConstitution({ preset = 'balanced', force = false } = {}) {
  if (existsSync(CONSTITUTION_PATH) && !force) {
    return { path: CONSTITUTION_PATH, existed: true };
  }
  const base = loadYaml(presetPath(preset));
  mkdirSync(CONSTITUTION_HOME, { recursive: true });
  saveConstitution({ ...base, identity: base.identity ?? {} });
  return { path: CONSTITUTION_PATH, existed: false };
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
    const { path, existed } = initConstitution({
      preset: value('preset', 'balanced'),
      force: flag('force'),
    });
    console.log(
      existed
        ? dim(`Constitution already at ${path} (use --force to reset)`)
        : green(`Constitution written to ${path}`),
    );
    break;
  }
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
  case 'check':
    await checkStdin();
    break;
  case 'report':
    report();
    break;
  default:
    console.log(`
  ${bold('privacy-constitution')} -- pre-tool-call enforcement of your privacy rules

    init      write a constitution from a preset   ${dim('--preset balanced --force')}
    install   register the PreToolUse hook         ${dim('--user | --dir <path>')}
    check     evaluate one call read from stdin
    report    what was withheld, and how often you were interrupted
`);
}
