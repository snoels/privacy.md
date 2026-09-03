/**
 * The model tier.
 *
 * Tested with a stub rather than a live model: what matters here is not whether
 * a model is any good at spotting health data, it is whether a bad, slow, or
 * hostile answer can hurt the user. Every test below is about that.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDeep } from '../kernel/index.js';
import { judge, validate, signature } from '../kernel/judge.js';
import { buildPreset } from '../kernel/questions.js';

const constitution = buildPreset('balanced', {
  identity: { email: 'you@example.com', phone: '+32 470 11 22 33' },
});

const replying = (payload) => ({ ask: async () => JSON.stringify(payload) });

test('an excerpt the model invented is discarded', () => {
  // Redacting a string that is not in the payload does nothing at best, and at
  // worst mangles a value that is.
  const kept = validate({ findings: [{ type: 'health', excerpt: 'never appeared' }] }, { text: 'hello' });
  assert.equal(kept.length, 0);
});

test('a type the model made up is discarded', () => {
  const kept = validate({ findings: [{ type: 'invented_type', excerpt: 'hello' }] }, { text: 'hello' });
  assert.equal(kept.length, 0);
});

test('a well-formed finding is kept and located in the payload', async () => {
  const payload = { text: 'the specialist wants to see the scans again' };
  const findings = await judge(payload, { name: 'Slack' }, replying({
    findings: [{ type: 'health', excerpt: 'the scans', why: 'implies a condition' }],
  }));

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].path, ['text']);
  assert.equal(findings[0].via, 'model');
});

test('the model tier makes a decision stricter, never looser', async () => {
  const call = { tool: 'send_message', input: { text: 'the specialist wants to see the scans again' } };
  const recipient = { name: 'Slack', sector: 'communication', trust: 'known' };

  const shallow = await checkDeep({ ...call, recipient }, constitution, {});
  assert.equal(shallow.decision, 'allow', 'the patterns should miss this');

  const deep = await checkDeep({ ...call, recipient }, constitution, {
    ...replying({ findings: [{ type: 'health', excerpt: 'the scans' }] }),
  });
  assert.equal(deep.decision, 'redact');
  assert.equal(deep.usedModel, true);
  assert.doesNotMatch(JSON.stringify(deep.input), /the scans/);
});

test('a model that throws leaves the deterministic decision standing', async () => {
  const call = {
    tool: 'create_event',
    input: { title: 'Appointment', notes: 'Physio, lower back injury' },
    recipient: { name: 'Google Calendar', sector: 'productivity', trust: 'known' },
  };

  const result = await checkDeep(call, constitution, {
    ask: async () => {
      throw new Error('model is down');
    },
  });

  // Still redacted by the patterns. A model outage must not become a leak.
  assert.equal(result.decision, 'redact');
  assert.deepEqual(result.input, { title: 'Appointment' });
});

test('a model that hangs is abandoned rather than blocking the agent', async () => {
  const started = Date.now();
  const findings = await judge({ text: 'x' }, { name: 'Slack' }, {
    ask: () => new Promise(() => {}),
    timeoutMs: 100,
  });
  assert.deepEqual(findings, []);
  assert.ok(Date.now() - started < 2000, 'it must not wait on a model forever');
});

test('unparseable output is ignored, not guessed at', async () => {
  const findings = await judge({ text: 'x' }, { name: 'Slack' }, { ask: async () => 'sorry, I cannot help' });
  assert.deepEqual(findings, []);
});

test('the model is never asked twice about the same flow', async () => {
  let calls = 0;
  const cache = new Map();
  const model = {
    ask: async () => {
      calls += 1;
      return JSON.stringify({ findings: [] });
    },
    cache,
  };

  const payload = { text: 'hello' };
  await judge(payload, { name: 'Slack' }, model);
  await judge(payload, { name: 'Slack' }, model);
  assert.equal(calls, 1, 'the second identical flow should cost nothing');
});

test('the same payload to a different recipient is a different question', () => {
  assert.notEqual(signature({ a: 1 }, { name: 'Slack' }), signature({ a: 1 }, { name: 'Doctolib' }));
});

test('a blocked call is never sent to a model', async () => {
  let asked = false;
  const result = await checkDeep(
    { tool: 'push', input: { api_key: 'sk-ant-abc123def456ghi789jkl' }, recipient: { name: 'crm', trust: 'known' } },
    constitution,
    {
      ask: async () => {
        asked = true;
        return '{}';
      },
    },
  );

  assert.equal(result.decision, 'block');
  assert.equal(asked, false, 'nothing more to learn, and the payload holds a secret');
});

test('a local call is never sent to a model', async () => {
  let asked = false;
  await checkDeep({ tool: 'Read', input: { file_path: '/etc/hosts' } }, constitution, {
    ask: async () => {
      asked = true;
      return '{}';
    },
  });
  assert.equal(asked, false);
});
