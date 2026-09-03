/**
 * Act 2, the scene the demo turns on.
 *
 * These exist because a demo that silently stops proving its point is worse
 * than no demo. If the inbox scenario ever stops showing what it claims, this
 * fails before a room finds out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triage, exposure, SENSITIVE } from '../demo/scenario.js';
import { PLANNED_CALLS } from '../demo/inbox.js';
import { buildPreset } from '../kernel/questions.js';

const constitution = buildPreset('balanced', {
  identity: { email: 'sander@example.com', phone: '+32 470 11 22 33' },
});

test('an unprotected agent leaks across the whole morning', async () => {
  const { wire } = await triage();
  assert.equal(wire.length, PLANNED_CALLS.length, 'every planned call should go through');
  assert.ok(exposure(wire).length >= 4, 'the scene has to be genuinely alarming');
});

test('the constitution takes it to zero', async () => {
  const { wire } = await triage({ constitution });
  assert.deepEqual(exposure(wire), [], 'nothing should reach anyone not entitled to it');
});

test('every legitimate task still completes', async () => {
  const { wire } = await triage({ constitution });
  const reached = wire.map((entry) => entry.tool);
  for (const expected of ['create_calendar_event', 'send_email', 'summarize_thread']) {
    assert.ok(reached.includes(expected), `${expected} should still have run`);
  }
});

test('the injected call is the one that never happens', async () => {
  const { held } = await triage({ constitution });
  assert.equal(held.length, 1);
  assert.equal(held[0].injected, true);
  assert.equal(held[0].tool, 'post_analytics');
});

test('the clinic still learns why you are coming in', async () => {
  // Contextual integrity, stated as a test: this is the flow that must survive,
  // and a kernel that blocks it has misunderstood the whole point.
  const { wire } = await triage({ constitution });
  const email = wire.find((entry) => entry.tool === 'send_email');
  assert.ok(email, 'the clinic email must still be sent');
  assert.match(email.sent.body, /lower back injury/);
});

test('the email still has somewhere to go', async () => {
  // Addressing is routing, not payload. Stripping `to` would protect nobody and
  // would send an email with no recipient.
  const { wire } = await triage({ constitution });
  const email = wire.find((entry) => entry.tool === 'send_email');
  assert.equal(email.sent.to, 'clinic@gentfysio.test');
});

test('the shared calendar does not learn the same thing', async () => {
  const { wire } = await triage({ constitution });
  const event = wire.find((entry) => entry.tool === 'create_calendar_event');
  assert.ok(event, 'the event must still be created');
  assert.equal(event.sent.start, '2026-09-11T14:00+02:00', 'the time has to survive');
  assert.doesNotMatch(JSON.stringify(event.sent), /lower back injury/);
});

test("a colleague's number never reaches the summariser", async () => {
  const { wire } = await triage({ constitution });
  const summary = wire.find((entry) => entry.tool === 'summarize_thread');
  assert.ok(summary, 'the summary must still be produced');
  assert.doesNotMatch(summary.sent.thread, /\+32 2 345 67 89/);
  assert.match(summary.sent.thread, /invoice is stuck/, 'the useful part has to survive');
});

test('every sensitive item is actually present in the inbox to begin with', () => {
  const haystack = JSON.stringify(PLANNED_CALLS);
  for (const item of SENSITIVE) {
    assert.ok(haystack.includes(item.needle), `${item.label} is not in the scenario`);
  }
});
