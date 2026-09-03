/**
 * The whole thing, start to finish.
 *
 * Five acts in about three minutes: what your agent already did, where the
 * rules come from, the same task run twice, the same file in a second runtime,
 * and the number at the end.
 *
 * Everything is local and deterministic. No key, no network, no model call —
 * which is not a shortcut, it is the point. A demo that depends on venue wifi
 * is a demo that fails in front of the people you wanted to impress.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conform } from '../kernel/conformance.js';
import { buildPreset } from '../kernel/questions.js';
import { menuFor } from '../kernel/rules.js';
import { check } from '../kernel/index.js';
import { scan, summarizeScan } from '../kernel/history.js';
import { propose } from '../kernel/infer.js';
import { guard } from '../adapters/openai-agents.js';
import { triage, exposure } from '../demo/scenario.js';
import { INBOX } from '../demo/inbox.js';
import { fieldDiff, panel, style } from './ui.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(HERE, '..', 'adapters', 'claude-code.js');

const IDENTITY = { email: 'alex@example.com', phone: '+32 470 11 22 33' };
const constitution = buildPreset('balanced', { identity: IDENTITY });

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const line = (text = '') => console.log(text);

/**
 * Three ways to run this.
 *
 *   default   one act per screen, advanced by Enter -- the presenter talks
 *             over each act and moves on when the room has read it
 *   --auto    timed playback, nobody at the keyboard
 *   --fast    no pacing, no clearing, no waiting; for rehearsal and for piping
 *
 * The default exists because the whole run is over two hundred lines. On a
 * projector showing thirty, unattended playback means the audience only ever
 * sees the last act scroll past.
 */
const FAST = process.argv.includes('--fast');
const AUTO = process.argv.includes('--auto');
const BEAT = FAST ? 0 : AUTO ? 700 : 220;

const ESC = '\u001b[';

/** Wait for Enter, or for anything else that is not a way to quit. */
function pause() {
  if (FAST || AUTO) return Promise.resolve();
  return new Promise((done) => {
    const input = process.stdin;
    if (!input.isTTY) {
      done();
      return;
    }
    process.stdout.write(`\n  ${style.grey('press enter')}`);
    input.setRawMode(true);
    input.resume();
    input.once('data', (chunk) => {
      input.setRawMode(false);
      input.pause();
      // Ctrl-C and q both stop the demo rather than advancing it.
      if (chunk[0] === 3 || chunk[0] === 113) {
        process.stdout.write('\n');
        process.exit(0);
      }
      done();
    });
  });
}

let first = true;

/** Break inside an act, keeping the heading so the room does not lose its place. */
async function screen(number, title, subtitle) {
  await pause();
  if (!FAST) process.stdout.write(`${ESC}2J${ESC}H`);
  line();
  line(`  ${style.grey(`ACT ${number}`)}  ${style.bold(title)}`);
  if (subtitle) line(`          ${style.dim(subtitle)}`);
  line();
}

async function act(number, title, subtitle) {
  if (!first) await pause();
  first = false;

  // One act per screen, so nothing the room needs has already scrolled away.
  if (!FAST) process.stdout.write(`${ESC}2J${ESC}H`);

  line();
  line(`  ${style.grey(`ACT ${number}`)}  ${style.bold(title)}`);
  if (subtitle) line(`          ${style.dim(subtitle)}`);
  line();
  await wait(BEAT);
}

const paint = {
  allow: style.green,
  redact: style.violet,
  substitute: style.cyan,
  ask: style.amber,
  block: style.red,
};

// ── Setup ────────────────────────────────────────────────────────────────
/**
 * Install and onboarding, replayed.
 *
 * The real thing is interactive, and a stage demo cannot wait for arrow keys.
 * These are the actual screens with the choices already made, and it says so —
 * `npx privacy.md init` runs them live for anyone who wants to try.
 */
async function actSetup() {
  await act('0', 'Setting it up', 'Replayed at speed. `npx privacy.md init` runs this for real.');

  line(`    ${style.grey('$')} npx privacy.md init`);
  line();
  await wait(BEAT);

  line(`    ${style.bold('Where do you want to start?')}`);
  line(`      1. Cautious   ${style.dim('nothing personal moves without you')}`);
  line(`    ${style.cyan('❯')} 2. Balanced   ${style.dim('strip what is not needed, ask about new places')}`);
  line(`      3. Open       ${style.dim('secrets and beliefs still protected; most else flows')}`);
  line();
  await wait(BEAT * 2);

  const asked = [
    ['A tool asks for something the task does not need.', 'Strip it and send the rest'],
    ['Your agent found a service you have never used.', 'Ask me'],
    ['Should health details land in your calendar or notes?', 'No — healthcare providers only'],
    ["An outside tool is summarising a thread with other people's numbers in it.", 'Strip them'],
    ['Should a courier keep your address after the parcel arrives?', 'No — only while delivering'],
    ['How often are you willing to be interrupted?', 'A few times a day'],
  ];

  line(`    ${style.dim('Six questions — only where the presets disagree.')}`);
  line();
  for (const [question, answer] of asked) {
    line(`      ${style.dim(question)}`);
    line(`      ${style.cyan('❯')} ${answer}`);
    await wait(BEAT / 2);
  }

  line();
  line(`    ${style.dim('Then your own email, so it can tell your details from other people\'s.')}`);
  line(`      ${style.cyan('❯')} ${IDENTITY.email}`);
  await wait(BEAT);

  line();
  line(`    ${style.green(`${constitution.rules.length} rules written to ~/.privacy/rules.yaml`)}`);
  line(`    ${style.grey('local, never uploaded — a rule about your health leaks it by existing')}`);
  await wait(BEAT);

  line();
  line(`    ${style.grey('$')} npx privacy.md install`);
  line(`    ${style.green('Hook registered — every tool call now goes through the kernel first.')}`);
}

// ── Act 0 ────────────────────────────────────────────────────────────────
async function actShock() {
  await act('1', 'What your agent already did', 'Reading transcripts already on this machine. Nothing leaves it.');

  const raw = await scan({ since: Date.now() - 21 * 24 * 60 * 60 * 1000, identity: IDENTITY });
  const summary = summarizeScan(raw);

  if (summary.calls === 0) {
    line(`    ${style.dim('No agent history on this machine. Skipping to the rules.')}`);
    return null;
  }

  line(`    ${style.bold(String(summary.calls).padStart(6))}  tool calls in the last three weeks`);
  await wait(BEAT);
  line(`    ${style.amber(String(summary.carrying).padStart(6))}  carried something personal`);
  await wait(BEAT);
  line(`    ${style.amber(String(summary.recipients).padStart(6))}  services received it`);
  await wait(BEAT);

  if (summary.spread.length > 0) {
    line();
    for (const [type, count] of summary.spread.slice(0, 4)) {
      line(`      ${type.replace(/_/g, ' ').padEnd(28)} ${style.amber(String(count).padStart(2))} services`);
      await wait(BEAT / 3);
    }
  }
  if (summary.byRecipient.length > 0) {
    line();
    line(`    ${style.dim('who received the most')}`);
    for (const [name, count] of summary.byRecipient.slice(0, 5)) {
      line(`      ${String(count).padStart(4)}  ${name}`);
      await wait(BEAT / 4);
    }
  }
  line();
  line(`    ${style.dim('Nobody has ever looked at this. It has been sitting there the whole time.')}`);
  line(`    ${style.grey('Test fixtures are excluded; --include-fixtures counts them too.')}`);
  return summary;
}

// ── Act 1 ────────────────────────────────────────────────────────────────
async function actRules(summary) {
  await act('2', 'Where the rules come from', 'Nobody writes privacy policy. It is inferred, then confirmed.');

  const proposals = summary ? propose(summary).slice(0, 3) : [];
  if (proposals.length === 0) {
    line(`    ${style.dim('Not enough history to infer from, so the preset stands in.')}`);
  }

  for (const proposal of proposals) {
    line(`    ${style.dim(proposal.evidence)}`);
    if (proposal.rule) line(`    ${style.green('rule')}  ${proposal.rule.says}`);
    if (proposal.question) line(`    ${style.amber('look')}  ${proposal.question}`);
    line();
    await wait(BEAT);
  }

  line(`    ${style.dim(`The constitution for this demo: ${constitution.rules.length} rules, all in plain English.`)}`);
  await wait(BEAT);
  line();
  // Named rather than sliced: the first four by construction order are the
  // generic per-data-type ones, and they read as boilerplate. These are the
  // ones that make the argument.
  const headline = [
    'no-credentials-anywhere',
    'health-only-to-healthcare',
    'strip-other-peoples-contacts',
    'nothing-personal-to-adtech',
  ];
  const shown = headline
    .map((id) => constitution.rules.find((rule) => rule.id === id))
    .filter(Boolean);

  for (const rule of shown) {
    line(`      ${paint[rule.outcome](rule.outcome.padEnd(11))} ${rule.says}`);
    await wait(BEAT / 3);
  }
  line(`      ${style.dim(`… and ${constitution.rules.length - shown.length} more, all in this shape`)}`);
}

// ── Act 2 ────────────────────────────────────────────────────────────────
async function actProof() {
  await act('3', 'The same morning, twice', 'One inbox. A real agent loop. Nothing scripted about the enforcement.');

  line(`    ${style.dim('In the inbox:')}`);
  for (const message of INBOX) {
    line(`      ${style.dim('·')} ${message.subject}  ${style.grey(`from ${message.from}`)}`);
  }
  line(`      ${style.grey('one of those carries an instruction aimed at the agent, not at you')}`);
  await wait(BEAT * 2);

  await screen('3', 'The same morning, twice', 'No constitution. A well-behaved agent doing its job.');
  const before = await triage();
  line(`    ${style.red('WITHOUT')}  four calls go out, all of them in full`);
  line();
  for (const entry of before.wire) {
    line(`      → ${style.bold(entry.recipient)}`);
    for (const row of fieldDiff(entry.sent, entry.sent, 62)) line(`          ${row}`);
    line();
    await wait(BEAT / 2);
  }

  const leakedBefore = exposure(before.wire);
  line(`      ${style.red(`${leakedBefore.length} things reached someone not entitled to them`)}`);
  for (const item of leakedBefore) {
    line(`        ${style.dim(`${item.label} → ${item.recipient}`)}`);
  }
  await wait(BEAT * 2);

  await screen('3', 'The same morning, twice', 'Now with the constitution in front of every call.');
  const after = await triage({ constitution });
  line(`    ${style.green('WITH')}     the same agent, the same inbox`);
  line();

  const byTool = new Map(after.decisions.map((decision) => [decision.tool, decision]));

  for (const entry of after.wire) {
    const decision = byTool.get(entry.tool);
    line(`      → ${style.bold(entry.recipient)}`);
    for (const row of fieldDiff(decision?.proposed ?? entry.sent, entry.sent, 62)) line(`          ${row}`);
    line();
    await wait(BEAT);
  }

  for (const held of after.held) {
    const decision = byTool.get(held.tool);
    line(`      ${style.red('✕')} ${style.bold(held.recipient)}   ${style.red('blocked, never called')}`);
    for (const row of fieldDiff(decision?.proposed ?? {}, null, 62)) line(`          ${row}`);
    if (held.injected) line(`          ${style.red('this was the newsletter talking, not you')}`);
    line();
    await wait(BEAT);
  }

  const leakedAfter = exposure(after.wire);
  line(`      ${style.green(`${leakedAfter.length} things reached someone not entitled to them`)}`);
  line(
    `      ${style.green(`${after.wire.length} of the ${after.wire.length + after.held.length} calls completed`)}` +
      `${style.dim(' — the one that did not was the injection')}`,
  );
  await wait(BEAT);

  line();
  line(`    ${style.dim('The clinic still knows why you are coming in. The shared calendar does not.')}`);
  line(`    ${style.dim('That is the whole idea: appropriate depends on who is receiving it.')}`);

  return {
    before: leakedBefore.length,
    after: leakedAfter.length,
    completed: after.wire.length,
    planned: after.wire.length + after.held.length,
  };
}

// ── Act 2b ───────────────────────────────────────────────────────────────
async function actDecide() {
  await act('4', 'When it cannot decide for you', 'The constitution is really written here, not in the questionnaire.');

  const call = {
    tool: 'reserve_table',
    input: { url: 'https://opentable.test/reserve', phone: IDENTITY.phone, party: 2 },
    recipient: { name: 'opentable.test', sector: 'booking', trust: 'agent_chosen' },
  };
  const held = check(call, constitution);

  line(`    ${style.amber('HELD')}  ${call.tool} wants your phone number`);
  line(`          ${style.dim('recipient: opentable.test · you have never used this before')}`);
  line();
  await wait(BEAT);

  for (const [index, option] of menuFor({ ...held, tool: call.tool }).entries()) {
    const rule = option.rule();
    const marker = index === 0 ? style.cyan('❯') : ' ';
    line(`    ${marker} ${index + 1}. ${index === 0 ? style.bold(option.label) : option.label}`);
    line(`         ${style.dim(option.consequence)}`);
    if (rule) line(`         ${style.grey(`writes: ${rule.says}`)}`);
    await wait(BEAT / 2);
  }
  line();
  line(`    ${style.dim('Ordered narrow to broad, and the cursor starts on the narrow one.')}`);
  line(`    ${style.dim('People pick the first thing, and that is how these tools decay.')}`);
}

// ── Act 3 ────────────────────────────────────────────────────────────────
async function actPortability() {
  await act('5', 'One file, two runtimes', 'Neither runtime knows the other exists.');

  const home = mkdtempSync(join(tmpdir(), 'pc-demo-'));
  const input = {
    title: 'Appointment',
    start: '2026-09-11T14:00+02:00',
    notes: 'Physiotherapy, lower back injury',
  };

  try {
    const raw = execFileSync('node', [HOOK], {
      input: JSON.stringify({
        session_id: 'demo',
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__google_calendar__create_event',
        tool_input: input,
      }),
      encoding: 'utf8',
      env: { ...process.env, PRIVACY_MD_HOME: home },
    });
    const viaHook = JSON.parse(raw).hookSpecificOutput.updatedInput ?? input;

    let viaSdk = null;
    const wrapped = guard(
      {
        type: 'function',
        name: 'create_calendar_event',
        description: 'demo',
        parameters: {},
        strict: false,
        invoke: async (_context, args) => {
          viaSdk = JSON.parse(args);
          return 'ok';
        },
      },
      { recipient: { name: 'Google Calendar', sector: 'productivity', trust: 'known' }, constitution },
    );
    await wrapped.invoke({}, JSON.stringify(input));

    line(`    ${style.dim('the agent proposes')}`);
    line(`      ${style.dim(JSON.stringify(input).slice(0, 88))}`);
    line();
    await wait(BEAT);
    line(`    ${'Claude Code'.padEnd(14)} ${style.violet(JSON.stringify(viaHook))}`);
    await wait(BEAT);
    line(`    ${'OpenAI SDK'.padEnd(14)} ${style.violet(JSON.stringify(viaSdk))}`);
    await wait(BEAT);
    line();
    const same = JSON.stringify(viaHook) === JSON.stringify(viaSdk);
    line(`    ${same ? style.green('identical') : style.red('DIVERGED')}  ${style.dim('same constitution file, different code paths')}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// ── Act 4 ────────────────────────────────────────────────────────────────
async function actNumber(scenario) {
  await act('6', 'The number', 'A benchmark that runs against any agent, not just ours.');

  const score = conform(constitution);

  line(`    ${style.red(String(score.unprotectedLeaks).padStart(3))}/${score.total}   leak with no constitution`);
  await wait(BEAT);
  line(`    ${style.green(String(score.held).padStart(3))}/${score.total}   held with this one`);
  await wait(BEAT);
  if (scenario) {
    line();
    line(`    ${style.green(`${scenario.before} → ${scenario.after}`.padStart(7))}   things leaked on the live task`);
    line(`    ${style.green(String(`${scenario.completed}/${scenario.planned}`).padStart(7))}   calls still completed, and the one that did not was the injection`);
  }
  await wait(BEAT);

  line();
  // Two columns, so the breakdown does not push the closing line off screen.
  const rows = score.byCategory;
  const half = Math.ceil(rows.length / 2);
  for (let index = 0; index < half; index += 1) {
    const cell = ([category, entry]) =>
      entry === undefined
        ? ' '.repeat(30)
        : `${entry.held === entry.total ? style.green('ok  ') : style.amber('gap ')} ${category.padEnd(18)} ${entry.held}/${entry.total}`.padEnd(
            30 + 9,
          );
    line(`      ${cell(rows[index] ?? [])}  ${cell(rows[index + half] ?? [])}`);
    await wait(BEAT / 4);
  }

  line();
  line(`    ${style.dim('The gap is honest: three probes need judgement, not pattern-matching.')}`);
  line(`    ${style.dim('A suite you score full marks on is one written to flatter you.')}`);
}

async function closing() {
  await pause();
  if (!FAST) process.stdout.write(`${ESC}2J${ESC}H`);
  line();
  line();
  for (const text of panel('the argument', [
    'P3P and Do Not Track both asked the other side to behave.',
    'The other side did not.',
    '',
    style.bold('This checks before the data leaves your machine,'),
    style.bold('so nobody has to cooperate.'),
  ])) {
    line(`  ${text}`);
  }
  line();
}

export async function runDemo() {
  if (!FAST) process.stdout.write(`${ESC}2J${ESC}H`);
  line();
  line();
  line(`  ${style.bold('Privacy Constitution')}`);
  line(`  ${style.dim('Pre-tool-call enforcement of rules you never had to write.')}`);
  line();
  line(`  ${style.grey('Everything runs locally. No key, no network, no model call.')}`);
  line(`  ${style.grey('Seven acts, about three minutes. Enter to advance, q to stop.')}`);

  await actSetup();
  const summary = await actShock();
  await actRules(summary);
  const scenario = await actProof();
  await actDecide();
  await actPortability();
  await actNumber(scenario);
  await closing();
}
