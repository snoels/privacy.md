/**
 * The probe suite, and whether it is worth believing.
 *
 * A benchmark you cannot fail is marketing. These check that the suite
 * discriminates — that a permissive constitution scores worse, that an empty
 * one scores near zero, and that refusing everything is not a winning strategy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conform } from '../kernel/conformance.js';
import { PROBES } from '../kernel/probes.js';
import { buildPreset } from '../kernel/questions.js';

const identity = { email: 'you@example.com', phone: '+32 470 11 22 33' };
const preset = (name) => buildPreset(name, { identity });

test('an unprotected agent leaks nearly everything', () => {
  const result = conform({ rules: [], identity });
  assert.ok(result.unprotectedLeaks >= PROBES.length - 2, 'the probes should be genuinely tempting');
});

test('an empty constitution protects almost nothing', () => {
  // The floor. If this scored well, the probes would be measuring nothing.
  const result = conform({ rules: [], identity });
  assert.ok(result.held <= 3, `an empty constitution held ${result.held}, which is too many`);
});

test('the balanced preset holds all but the known-hard probes', () => {
  const result = conform(preset('balanced'));
  const unexpected = result.failures.filter((failure) => !failure.expectHard);
  assert.deepEqual(
    unexpected.map((failure) => failure.id),
    [],
    'every failure should be one we have already named as a limit',
  );
  assert.equal(result.held, PROBES.length - 2);
});

test('a permissive preset scores worse than a strict one', () => {
  // If this ever stops being true, either the presets or the probes are wrong.
  assert.ok(conform(preset('open')).held < conform(preset('cautious')).held);
});

test('no preset breaks a task that should have worked', () => {
  for (const name of ['cautious', 'balanced', 'open']) {
    assert.equal(conform(preset(name)).overBlocked, 0, `${name} broke a working task`);
  }
});

test('refusing everything is not a winning strategy', () => {
  // Two probes invert the test: a health detail has to reach the clinic, and a
  // booking has to complete. A block-everything policy fails both.
  const blockAll = {
    identity,
    rules: [
      {
        id: 'block-everything',
        says: 'Nothing leaves, ever.',
        data: ['*'],
        recipient: { trust: ['*'] },
        outcome: 'block',
      },
    ],
  };
  const result = conform(blockAll);
  assert.ok(result.overBlocked >= 2, 'over-blocking must be counted as failure');
  assert.ok(result.held < PROBES.length, 'a block-everything policy must not score full marks');
});

test('every probe names what must not get through', () => {
  for (const probe of PROBES) {
    const hasExpectation = probe.mustNotReach?.length || probe.mustReach?.length || probe.mustKeepField;
    assert.ok(hasExpectation, `${probe.id} asserts nothing`);
    assert.ok(probe.title && probe.category, `${probe.id} is missing a title or category`);
  }
});

test('the forbidden strings really are present in the probe to begin with', () => {
  // A probe whose needle is not in its own payload would pass for free.
  for (const probe of PROBES) {
    if (!probe.mustNotReach) continue;
    const haystack = JSON.stringify(probe.call.input);
    for (const needle of probe.mustNotReach) {
      assert.ok(haystack.includes(needle), `${probe.id}: "${needle.slice(0, 20)}" is not in the payload`);
    }
  }
});

test('credentials are held by every preset', () => {
  for (const name of ['cautious', 'balanced', 'open']) {
    const result = conform(preset(name));
    const credentials = result.results.filter((entry) => entry.category === 'credentials');
    assert.ok(credentials.every((entry) => entry.held), `${name} leaked a credential`);
  }
});
