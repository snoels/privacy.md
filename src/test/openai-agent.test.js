/**
 * The real SDK agent loop, with a scripted model.
 *
 * Driving `invoke()` directly proves the wrapper works. It does not prove the
 * wrapper survives contact with the SDK's runner — tool dispatch, the agent
 * loop, result handling. This does, by plugging a `Model` that returns a
 * scripted tool call instead of calling OpenAI.
 *
 * No API key, no network, and the same result every time, which matters more
 * than it sounds: a demo that depends on venue wifi is a demo that fails.
 * Swapping the scripted model for `'gpt-4o'` is the only change needed to run
 * this against a real model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent, run, setTracingDisabled, tool } from '@openai/agents';
import { z } from 'zod';
import { guardAll } from '../adapters/openai-agents.js';
import { loadYaml, presetPath } from '../kernel/constitution.js';

// The SDK exports traces to OpenAI by default, which needs a key even when the
// model is local. Nothing here should touch the network.
setTracingDisabled(true);

const constitution = {
  ...loadYaml(presetPath('balanced')),
  identity: { email: 'sander@example.com', phone: '+32 470 11 22 33' },
};

/** A model that plays out a fixed script: one tool call, then a closing line. */
function scriptedModel(call) {
  let turn = 0;
  // The runner's tracing sums the detail arrays, so they have to be present
  // even when empty.
  const usage = {
    requests: 1,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTokensDetails: [],
    outputTokensDetails: [],
  };

  return {
    async getResponse() {
      turn += 1;
      if (turn === 1) {
        return {
          usage,
          output: [
            {
              type: 'function_call',
              id: 'call_1',
              callId: 'call_1',
              name: call.name,
              arguments: JSON.stringify(call.arguments),
              status: 'completed',
            },
          ],
        };
      }
      return {
        usage,
        output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'done' }] }],
      };
    },
    async *getStreamedResponse() {
      throw new Error('not used');
    },
  };
}

/** Build an agent whose one tool records exactly what reached it. */
function agentWithRecorder({ name, recipient, model }) {
  const received = [];

  const raw = tool({
    name,
    description: 'test tool',
    parameters: z.object({
      title: z.string().nullable(),
      start: z.string().nullable(),
      notes: z.string().nullable(),
      api_key: z.string().nullable(),
    }),
    async execute(args) {
      // Drop the nulls the schema requires, so what we assert on is what the
      // tool would actually act upon.
      received.push(Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null)));
      return 'ok';
    },
  });

  const agent = new Agent({
    name: 'assistant',
    instructions: 'test',
    // The model belongs on the agent: `run`'s option is not what model
    // resolution reads, so passing it there still reaches for a real key.
    model,
    tools: guardAll([raw], { recipients: { [name]: recipient }, constitution }),
  });

  return { agent, received };
}

test('the SDK runner delivers a minimized payload to the tool', async () => {
  const { agent, received } = agentWithRecorder({
    name: 'create_calendar_event',
    recipient: { name: 'Google Calendar', sector: 'productivity', trust: 'known' },
    model: scriptedModel({
      name: 'create_calendar_event',
      arguments: {
        title: 'Appointment',
        start: '2026-09-11T14:00+02:00',
        notes: 'Physio, lower back injury, ref #A2213',
        api_key: null,
      },
    }),
  });

  await run(agent, 'book it');

  assert.equal(received.length, 1, 'the tool should still have run');
  assert.deepEqual(received[0], { title: 'Appointment', start: '2026-09-11T14:00+02:00' });
});

test('the SDK runner never reaches the tool when a credential is present', async () => {
  const { agent, received } = agentWithRecorder({
    name: 'create_calendar_event',
    recipient: { name: 'Google Calendar', sector: 'productivity', trust: 'known' },
    model: scriptedModel({
      name: 'create_calendar_event',
      arguments: { title: 'x', start: null, notes: null, api_key: 'sk-ant-abc123def456ghi789jkl' },
    }),
  });

  const result = await run(agent, 'send it');

  assert.equal(received.length, 0, 'the tool must not have run at all');
  // The model is told why, so it can explain rather than silently retry.
  assert.match(JSON.stringify(result.history), /privacy constitution/i);
});

test('health still reaches a healthcare recipient through the runner', async () => {
  const { agent, received } = agentWithRecorder({
    name: 'book_appointment',
    recipient: { name: 'Doctolib', sector: 'healthcare', trust: 'known' },
    model: scriptedModel({
      name: 'book_appointment',
      arguments: { title: null, start: '2026-09-11T14:00', notes: 'Physio, lower back injury', api_key: null },
    }),
  });

  await run(agent, 'book it');

  assert.equal(received.length, 1);
  assert.equal(received[0].notes, 'Physio, lower back injury', 'the clinic is the point of the appointment');
});
