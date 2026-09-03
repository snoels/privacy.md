/**
 * Composite fields: a payload nested inside a value the task still needs.
 *
 * These are the cases that decide whether minimization is useful or merely
 * destructive. Dropping a whole shell command because one field inside it was
 * personal is the failure this project exists to avoid.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embeddedJson, redactWithin, redactSentence } from '../kernel/composite.js';
import { check } from '../kernel/index.js';
import { presetPath, loadYaml } from '../kernel/constitution.js';

const constitution = {
  ...loadYaml(presetPath('balanced')),
  identity: { email: 'alex@example.com', phone: '+32 470 11 22 33' },
  testing: { treatLoopbackAsEgress: true },
};

// A plain JSON body, as a tool would pass it.
const PLAIN = 'curl -X POST https://crm.test/i -d \'{"name":"Alex","note":"Physio appointment"}\'';

// The same body as it arrives after shell escaping — the common real shape.
const ESCAPED = 'curl -X POST https://crm.test/i -d "{\\"name\\":\\"Alex\\",\\"note\\":\\"Physio appointment\\"}"';

// Same body, but to a service the user already uses -- so the unknown-recipient
// rule stays out of it and we are testing redaction rather than escalation.
const ESCAPED_KNOWN = ESCAPED.replace('https://crm.test/i', 'https://slack.com/api/chat.postMessage');

test('a plain JSON body inside a command is found', () => {
  const spans = embeddedJson(PLAIN);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].value.name, 'Alex');
  assert.equal(spans[0].escaped, false);
});

test('a shell-escaped JSON body is found too', () => {
  const spans = embeddedJson(ESCAPED);
  assert.equal(spans.length, 1, 'escaped body should still parse');
  assert.equal(spans[0].value.note, 'Physio appointment');
  assert.equal(spans[0].escaped, true);
});

test('redacting inside a plain body keeps the command intact', () => {
  const result = redactWithin(PLAIN, 'Physio', '[redacted]');
  assert.ok(result, 'should rewrite rather than give up');
  assert.match(result.text, /^curl -X POST https:\/\/crm\.test\/i -d /);
  assert.match(result.text, /"name":"Alex"/);
  assert.doesNotMatch(result.text, /Physio/);
});

test('redacting inside an escaped body preserves the escaping', () => {
  const result = redactWithin(ESCAPED, 'Physio', '[redacted]');
  assert.ok(result, 'should rewrite rather than give up');
  assert.doesNotMatch(result.text, /Physio/);
  assert.match(result.text, /\\"name\\":\\"Alex\\"/, 'escaping must survive the round trip');
});

test('a sentence redaction keeps the sentences around it', () => {
  const text = 'Standup at 10. I have a physio appointment. Ship the deck after.';
  const result = redactSentence(text, 'physio', '[redacted]');
  assert.match(result, /^Standup at 10\./);
  assert.match(result, /Ship the deck after\.$/);
  assert.doesNotMatch(result, /physio/);
});

test('a value that would be reduced to nothing is not rewritten', () => {
  // Better to drop the key than to send a field whose only content is a
  // placeholder announcing that something was withheld.
  assert.equal(redactSentence('Physio', 'Physio', '[redacted]'), null);
  assert.equal(redactWithin('Physio', 'Physio', '[redacted]'), null);
});

test('end to end: the curl survives, the health detail does not', () => {
  const result = check({ tool: 'Bash', input: { command: ESCAPED_KNOWN } }, constitution);
  assert.equal(result.decision, 'redact');
  assert.ok(result.input.command, 'the command must still be there');
  assert.match(result.input.command, /^curl -X POST/);
  assert.doesNotMatch(result.input.command, /Physio/);
});

test('a recipient the agent picked itself is escalated, not quietly redacted', () => {
  const result = check({ tool: 'Bash', input: { command: ESCAPED } }, constitution);
  assert.equal(result.decision, 'ask');
});

test('a call that cannot be minimized without breaking it is escalated, not broken', () => {
  // A single field that is entirely the detail: there is nothing to strip it
  // down to, so gutting the call would be the only way to comply.
  const result = check(
    { tool: 'mcp__slack__post', input: { text: 'Physio' } },
    constitution,
  );
  assert.equal(result.decision, 'ask');
  assert.equal(result.escalated, 'redaction-would-empty-the-call');
  assert.equal(result.input.text, 'Physio', 'the field must not be silently dropped');
});
