#!/usr/bin/env node
/**
 * One constitution, two runtimes.
 *
 * Runs the same flows through the Claude Code hook and through the OpenAI
 * Agents SDK adapter, and prints what each one actually sent. The point is not
 * that both refuse the same things — a blocklist could do that. It is that both
 * *send the same smaller payload*, from one file neither runtime knows about.
 *
 *   node examples/portability.js
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guard } from '../adapters/openai-agents.js';
import { loadConstitution, loadYaml, presetPath } from '../kernel/constitution.js';
import { style } from '../bin/ui.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(HERE, '..', 'adapters', 'claude-code.js');

const constitution = (() => {
  const loaded = loadConstitution();
  if (!loaded.isFallback) return loaded;
  return { ...loadYaml(presetPath('balanced')), identity: { email: 'you@example.com', phone: '+32 470 11 22 33' } };
})();

function viaClaudeCode(tool, input, home) {
  const raw = execFileSync('node', [HOOK], {
    input: JSON.stringify({ session_id: 'demo', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input }),
    encoding: 'utf8',
    env: { ...process.env, PRIVACY_MD_HOME: home },
  });
  const out = JSON.parse(raw).hookSpecificOutput;
  if (out.permissionDecision === 'deny') return { decision: 'block', sent: null };
  if (out.permissionDecision === 'ask') return { decision: 'ask', sent: null };
  return { decision: out.updatedInput ? 'minimized' : 'allow', sent: out.updatedInput ?? input };
}

async function viaOpenAi(tool, input, recipient) {
  let seen = null;
  const wrapped = guard(
    {
      type: 'function',
      name: tool,
      description: 'demo',
      parameters: {},
      strict: false,
      invoke: async (_context, args) => {
        seen = JSON.parse(args);
        return 'ok';
      },
    },
    { recipient, constitution },
  );
  const reply = await wrapped.invoke({}, JSON.stringify(input));
  if (seen === null) return { decision: /Held by/.test(reply) ? 'ask' : 'block', sent: null };
  return { decision: JSON.stringify(seen) === JSON.stringify(input) ? 'allow' : 'minimized', sent: seen };
}

const FLOWS = [
  {
    label: 'Put the appointment in my calendar',
    claude: 'mcp__google_calendar__create_event',
    openai: 'create_calendar_event',
    recipient: { name: 'Google Calendar', sector: 'productivity', trust: 'known' },
    input: { title: 'Appointment', start: '2026-09-11T14:00+02:00', notes: 'Physio, lower back injury, ref #A2213' },
  },
  {
    label: 'Book it with the clinic',
    claude: 'mcp__doctolib__book',
    openai: 'book_appointment',
    recipient: { name: 'Doctolib', sector: 'healthcare', trust: 'known' },
    input: { reason: 'Physio, lower back injury', when: '2026-09-11T14:00' },
  },
  {
    label: 'Push the lead to the CRM',
    claude: 'mcp__crm__push',
    openai: 'push_to_crm',
    recipient: { name: 'crm', sector: 'unknown', trust: 'known' },
    input: { name: 'Alex', api_key: 'sk-ant-abc123def456ghi789jkl' },
  },
];

const paint = { allow: style.green, minimized: style.violet, ask: style.amber, block: style.red };

const show = (result) => {
  const colour = paint[result.decision] ?? style.dim;
  const body = result.sent === null ? style.dim('nothing sent') : JSON.stringify(result.sent);
  return `${colour(result.decision.padEnd(10))} ${body}`;
};

const home = mkdtempSync(join(tmpdir(), 'pc-demo-'));
try {
  console.log();
  console.log(`  ${style.bold('One constitution. Two runtimes.')}`);
  console.log(`  ${style.dim(`${constitution.rules.length} rules, neither runtime knows about the other.`)}`);

  for (const flow of FLOWS) {
    const claude = viaClaudeCode(flow.claude, flow.input, home);
    const openai = await viaOpenAi(flow.openai, flow.input, flow.recipient);
    const agreed = claude.decision === openai.decision && JSON.stringify(claude.sent) === JSON.stringify(openai.sent);

    console.log();
    console.log(`  ${style.bold(flow.label)}`);
    console.log(`    ${style.dim('agent proposes')}  ${JSON.stringify(flow.input)}`);
    console.log(`    ${'Claude Code'.padEnd(14)}  ${show(claude)}`);
    console.log(`    ${'OpenAI SDK'.padEnd(14)}  ${show(openai)}`);
    console.log(`    ${agreed ? style.green('identical') : style.red('DIVERGED')}`);
  }
  console.log();
} finally {
  rmSync(home, { recursive: true, force: true });
}
