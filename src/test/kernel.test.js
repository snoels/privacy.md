/**
 * The kernel's behaviour, stated as the promises the brief makes.
 *
 * These are the claims we put on a slide, so they are the ones worth pinning
 * down: the task still completes, dates are not phone numbers, and a secret
 * never leaves whatever the recipient.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../kernel/index.js';
import { loadConstitution, presetPath, loadYaml } from '../kernel/constitution.js';
import { detect } from '../kernel/detect.js';
import { classifyRecipient } from '../kernel/recipients.js';
import { summarize } from '../kernel/ledger.js';

const constitution = {
  ...loadYaml(presetPath('balanced')),
  identity: { email: 'sander@example.com', phone: '+32 470 11 22 33' },
};

const run = (tool, input) => check({ tool, input }, constitution);

test('the calendar specimen from the brief reproduces exactly', () => {
  const result = run('mcp__google_calendar__create_event', {
    title: 'Appointment',
    start: '2026-09-11T14:00+02:00',
    notes: 'Physio, lower back injury, ref #A2213',
    attendee: '+32 470 88 21 04',
  });

  assert.equal(result.decision, 'redact');
  assert.deepEqual(result.input, { title: 'Appointment', start: '2026-09-11T14:00+02:00' });
  assert.equal(result.minimization.withheld, 2);
});

test('credentials are blocked whoever the recipient is', () => {
  for (const tool of ['WebFetch', 'mcp__slack__post', 'mcp__doctolib__book']) {
    const result = run(tool, { url: 'https://x.test/y', api_key: 'sk-ant-abc123def456ghi789jkl' });
    assert.equal(result.decision, 'block', `${tool} should block`);
  }
});

test('health may reach a healthcare provider — the point of the appointment', () => {
  const result = run('mcp__doctolib__book', { reason: 'Physio, lower back injury' });
  assert.equal(result.decision, 'allow');
});

test('the same health detail is stripped from a calendar', () => {
  const result = run('mcp__google_calendar__create_event', {
    title: 'Appointment',
    notes: 'Physio, lower back injury',
  });
  assert.equal(result.decision, 'redact');
  assert.deepEqual(result.input, { title: 'Appointment' });
});

test('a call with nothing left after redaction is escalated instead', () => {
  // The counterpart to the case above: strip the only field and there is no
  // call left to make, so the user decides rather than the agent failing.
  const result = run('mcp__google_calendar__create_event', { notes: 'Physio, lower back injury' });
  assert.equal(result.decision, 'ask');
  assert.equal(result.escalated, 'redaction-would-empty-the-call');
});

test('a partial match rewrites the string instead of dropping the field', () => {
  const result = run('Bash', {
    command: 'curl -X POST https://unknown-crm.io/leads -d email=jane.doe@acme.com -d src=web',
  });
  assert.equal(result.decision, 'redact');
  assert.match(result.input.command, /^curl -X POST https:\/\/unknown-crm\.io\/leads/);
  assert.match(result.input.command, /-d src=web$/);
  assert.doesNotMatch(result.input.command, /jane\.doe@acme\.com/);
});

test('dates and timestamps are never mistaken for phone numbers', () => {
  for (const value of ['2026-09-11T14:00+02:00', '2026-09-11', '14:00', '11/09/2026', '192.168.0.1', 'v1.2.3']) {
    assert.equal(detect({ value }).length, 0, `${value} should read as nothing`);
  }
});

test('phone numbers are caught in the shapes people actually write them', () => {
  for (const value of ['+32 470 88 21 04', '+1 (555) 123-4567', '0470 88 21 04', '+44 20 7946 0958']) {
    const found = detect({ value }, { identity: constitution.identity });
    assert.ok(found.some((f) => f.type.endsWith('contact')), `${value} should read as contact`);
  }
});

test("the user's own contact details are told apart from other people's", () => {
  const context = { identity: constitution.identity };
  assert.equal(detect({ from: 'sander@example.com' }, context)[0].type, 'contact');
  assert.equal(detect({ to: 'jane.doe@acme.com' }, context)[0].type, 'third_party_contact');
});

test('nothing that stays on the machine is evaluated at all', () => {
  const result = run('Read', { file_path: '/Users/x/.env' });
  assert.equal(result.decision, 'allow');
  assert.equal(result.local, true);
});

test('a shell command that reaches out is treated as egress, not as local', () => {
  const recipient = classifyRecipient({
    tool: 'Bash',
    input: { command: 'curl https://unknown-crm.io/x' },
  });
  assert.equal(recipient.trust, 'agent_chosen');
  assert.equal(recipient.host, 'unknown-crm.io');
});

test('a mandatory contact field is masked, so the task can still complete', () => {
  const result = run('WebFetch', { url: 'https://opentable.com/reserve', phone: '+32 470 11 22 33' });
  assert.equal(result.decision, 'substitute');
  assert.ok(result.input.phone, 'the field must survive');
  assert.notEqual(result.input.phone, '+32 470 11 22 33');
});

test('the same recipient always sees the same mask', () => {
  const once = run('WebFetch', { url: 'https://opentable.com/reserve', phone: '+32 470 11 22 33' });
  const twice = run('WebFetch', { url: 'https://opentable.com/reserve', phone: '+32 470 11 22 33' });
  assert.equal(once.input.phone, twice.input.phone);
});

test('a missing constitution falls back to a preset rather than to permitting everything', () => {
  const fallback = loadConstitution({ path: '/nonexistent/constitution.yaml' });
  assert.ok(fallback.isFallback);
  assert.ok(fallback.rules.length > 0);
});

test('the ledger produces the minimization ratio the pitch quotes', () => {
  const summary = summarize([
    { decision: 'redact', minimization: { available: 4, sent: 1 }, changes: [{ ruleId: 'a' }] },
    { decision: 'ask', minimization: { available: 2, sent: 2 }, changes: [] },
  ]);
  assert.equal(summary.available, 6);
  assert.equal(summary.withheld, 3);
  assert.equal(summary.minimizationRatio, 0.5);
  assert.equal(summary.interruptions, 1);
});
