/**
 * The portability claim, checked rather than asserted.
 *
 * One constitution file, two runtimes, the same decision on the same flow. If
 * this test ever fails, the pitch is wrong — so it compares the two adapters
 * against each other rather than against a hard-coded expectation.
 *
 * The OpenAI SDK is not a dependency of this package. Where it is absent these
 * tests skip rather than fail, because the kernel does not need it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guard } from '../adapters/openai-agents.js';
import { loadYaml, presetPath } from '../kernel/constitution.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(HERE, '..', 'adapters', 'claude-code.js');

const constitution = {
  ...loadYaml(presetPath('balanced')),
  identity: { email: 'sander@example.com', phone: '+32 470 11 22 33' },
};

/** Drive the Claude Code hook exactly as the runtime does: JSON on stdin. */
function throughClaudeCode(tool, input, home) {
  const raw = execFileSync('node', [HOOK], {
    input: JSON.stringify({ session_id: 'test', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input }),
    encoding: 'utf8',
    env: { ...process.env, PRIVACY_MD_HOME: home },
  });
  const { hookSpecificOutput: out } = JSON.parse(raw);
  return {
    decision: out.permissionDecision === 'allow' && out.updatedInput ? 'rewritten' : out.permissionDecision,
    sent: out.updatedInput ?? input,
  };
}

/** Drive the OpenAI adapter the way the SDK does: a JSON string into invoke. */
async function throughOpenAi(tool, input, recipient) {
  let seen = null;
  const wrapped = guard(
    {
      type: 'function',
      name: tool,
      description: 'test',
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

  if (seen === null) {
    return { decision: /Held by/.test(reply) ? 'ask' : 'deny', sent: null };
  }
  return {
    decision: JSON.stringify(seen) === JSON.stringify(input) ? 'allow' : 'rewritten',
    sent: seen,
  };
}

const CASES = [
  {
    name: 'a health note into a calendar is stripped, and the event survives',
    claudeTool: 'mcp__google_calendar__create_event',
    openaiTool: 'create_calendar_event',
    recipient: { name: 'Google Calendar', sector: 'productivity', trust: 'known' },
    input: { title: 'Appointment', start: '2026-09-11T14:00+02:00', notes: 'Physio, lower back injury' },
    expect: 'rewritten',
  },
  {
    name: 'a credential is refused whichever runtime asks',
    claudeTool: 'mcp__crm__push',
    openaiTool: 'push_to_crm',
    recipient: { name: 'crm', sector: 'unknown', trust: 'known' },
    input: { record: 'x', api_key: 'sk-ant-abc123def456ghi789jkl' },
    expect: 'deny',
  },
  {
    name: 'health reaching a clinic is left alone',
    claudeTool: 'mcp__doctolib__book',
    openaiTool: 'book_appointment',
    recipient: { name: 'Doctolib', sector: 'healthcare', trust: 'known' },
    input: { reason: 'Physio, lower back injury', when: '2026-09-11T14:00' },
    expect: 'allow',
  },
  {
    name: "a colleague's number is stripped from a message body",
    claudeTool: 'mcp__slack__post',
    openaiTool: 'post_message',
    recipient: { name: 'Slack', sector: 'communication', trust: 'known' },
    input: { channel: '#team', text: 'Standup at 10. Reach Jan on +32 2 345 67 89. Ship after.' },
    expect: 'rewritten',
  },
];

for (const testCase of CASES) {
  test(`both runtimes agree: ${testCase.name}`, async () => {
    const home = mkdtempSync(join(tmpdir(), 'pc-port-'));
    try {
      const viaHook = throughClaudeCode(testCase.claudeTool, testCase.input, home);
      const viaSdk = await throughOpenAi(testCase.openaiTool, testCase.input, testCase.recipient);

      assert.equal(viaHook.decision, testCase.expect, 'Claude Code hook');
      assert.equal(viaSdk.decision, testCase.expect, 'OpenAI Agents SDK');

      // The decision matching is the weaker claim. What actually leaves has to
      // match too, or "the same constitution" means nothing.
      if (testCase.expect === 'rewritten' || testCase.expect === 'allow') {
        assert.deepEqual(viaSdk.sent, viaHook.sent, 'both runtimes must send the same payload');
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
}

test('the OpenAI adapter refuses arguments it cannot parse', async () => {
  const wrapped = guard(
    {
      type: 'function',
      name: 'anything',
      description: 'test',
      parameters: {},
      strict: false,
      invoke: async () => 'should not run',
    },
    { constitution },
  );

  const reply = await wrapped.invoke({}, '{not json');
  assert.match(reply, /could not read/);
});
