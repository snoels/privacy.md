/**
 * Reading history back, and what we infer from it.
 *
 * The scan runs over the user's real transcripts, so these use a fixture
 * directory: committed tests must never depend on what happens to be on the
 * machine running them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan, summarizeScan, transcripts } from '../kernel/history.js';
import { propose, repeatedDecisions } from '../kernel/infer.js';

/** Write a transcript in the shape the agent actually records. */
function fixture(calls) {
  const home = mkdtempSync(join(tmpdir(), 'pc-history-'));
  const project = join(home, 'a-project');
  mkdirSync(project);
  const lines = calls.map((call) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-09-01T10:00:00Z',
      message: { content: [{ type: 'tool_use', id: 'x', name: call.tool, input: call.input }] },
    }),
  );
  writeFileSync(join(project, 'session.jsonl'), `${lines.join('\n')}\n`, 'utf8');
  return home;
}

test('tool calls are read back out of a transcript', async () => {
  const home = fixture([
    { tool: 'WebFetch', input: { url: 'https://bpost.be/track', address: 'Kerkstraat 1, Gent' } },
    { tool: 'Read', input: { file_path: '/etc/hosts' } },
  ]);

  const result = await scan({ home, identity: {} });
  assert.equal(result.calls, 2);
  // The local read is not a disclosure, so only one call carries anything.
  assert.equal(result.observed.length, 1);
  assert.equal(result.observed[0].type, 'location');
  rmSync(home, { recursive: true, force: true });
});

test('a habit concentrated in one sector becomes a rule with its exception', () => {
  const summary = summarizeScan({
    calls: 20,
    observed: Array.from({ length: 12 }, () => ({
      type: 'location',
      tool: 'WebFetch',
      recipient: 'bpost',
      sector: 'logistics',
      trust: 'known',
    })),
  });

  const [proposal] = propose(summary);
  assert.equal(proposal.kind, 'concentrated');
  assert.match(proposal.evidence, /12 times/);
  assert.equal(proposal.rule.outcome, 'redact');
  // The paired exception is what keeps the habit we observed working.
  assert.equal(proposal.also.outcome, 'allow');
  assert.deepEqual(proposal.also.recipient.sector, ['logistics']);
});

test('a singular subject gets a singular verb', () => {
  const summary = summarizeScan({
    calls: 12,
    observed: Array.from({ length: 6 }, () => ({
      type: 'location',
      tool: 'WebFetch',
      recipient: 'bpost',
      sector: 'logistics',
      trust: 'known',
    })),
  });
  const [proposal] = propose(summary);
  assert.match(proposal.rule.says, /only goes to/, '"your location" is singular');
});

test('data scattered across many services is flagged, not guessed at', () => {
  const summary = summarizeScan({
    calls: 20,
    observed: ['a', 'b', 'c', 'd', 'e'].map((name) => ({
      type: 'contact',
      tool: 'WebFetch',
      recipient: name,
      sector: 'unknown',
      trust: 'known',
    })),
  });

  const scattered = propose(summary).find((proposal) => proposal.kind === 'scattered');
  assert.ok(scattered, 'a habit that broad should be surfaced');
  assert.equal(scattered.rule, null, 'we should not invent a rule from it');
  assert.match(scattered.question, /5 different places/);
});

test('a coincidence is not a habit', () => {
  const summary = summarizeScan({
    calls: 2,
    observed: [{ type: 'contact', tool: 'WebFetch', recipient: 'x', sector: 'booking', trust: 'known' }],
  });
  const concentrated = propose(summary).filter((proposal) => proposal.kind === 'concentrated');
  assert.equal(concentrated.length, 0, 'one sighting should propose nothing');
});

test('rules already in the constitution are not proposed again', () => {
  const summary = summarizeScan({
    calls: 20,
    observed: Array.from({ length: 12 }, () => ({
      type: 'location',
      tool: 'WebFetch',
      recipient: 'bpost',
      sector: 'logistics',
      trust: 'known',
    })),
  });
  const existing = new Set(['inferred-location-to-logistics']);
  assert.equal(propose(summary, { existingRuleIds: existing }).some((p) => p.kind === 'concentrated'), false);
});

test('repeated interruptions are collapsed into one suggestion', () => {
  const entries = [
    { decision: 'ask', recipient: { name: 'opentable.com' }, results: [{ type: 'contact' }] },
    { decision: 'ask', recipient: { name: 'opentable.com' }, results: [{ type: 'contact' }] },
    { decision: 'ask', recipient: { name: 'opentable.com' }, results: [{ type: 'contact' }] },
    { decision: 'redact', recipient: { name: 'slack' }, results: [{ type: 'health' }] },
  ];

  const [repeat] = repeatedDecisions(entries);
  assert.equal(repeat.count, 3);
  assert.match(repeat.suggestion, /3 interruptions were the same decision/);
  assert.match(repeat.suggestion, /One rule covers all of them/);
});

test('a missing transcript directory is empty, not an error', () => {
  assert.deepEqual(transcripts({ home: '/nonexistent/path/here' }), []);
});
