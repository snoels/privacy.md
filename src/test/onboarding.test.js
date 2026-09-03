/**
 * Onboarding, and the rules it produces.
 *
 * The screens themselves are checked by eye; what matters here is that the
 * answers compile into a constitution that behaves the way the screens promised.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALWAYS,
  DATA_TYPES,
  QUESTIONS,
  SCALE,
  contestedQuestions,
  mergeRules,
  rulesFromScale,
  scaleForPreset,
} from '../kernel/questions.js';
import { compileFreeText, escalate } from '../kernel/freetext.js';
import { check } from '../kernel/index.js';

const build = (preset) => {
  const scale = scaleForPreset(preset);
  const rows = DATA_TYPES.map((type) => ({ ...type, value: scale[type.key] }));
  return {
    version: 1,
    identity: { email: 'alex@example.com', phone: '+32 470 11 22 33' },
    rules: mergeRules(
      rulesFromScale(rows),
      ...QUESTIONS.map((question) => question.rules(question.presets[preset])),
      ALWAYS,
    ),
  };
};

test('every question is one the presets actually disagree on', () => {
  // Anything all three presets answer the same way is already decided by the
  // choice of preset, and asking it again would be theatre.
  for (const question of contestedQuestions()) {
    assert.ok(new Set(Object.values(question.presets)).size > 1, `${question.id} is not contested`);
  }
  assert.ok(contestedQuestions().length <= 8, 'onboarding must stay short');
});

test('every preset answers every question', () => {
  for (const question of QUESTIONS) {
    for (const preset of ['cautious', 'balanced', 'open']) {
      const answer = question.presets[preset];
      assert.ok(answer, `${question.id} has no answer for ${preset}`);
      assert.ok(
        question.answers.some((option) => option.key === answer) || question.budget,
        `${question.id}: ${preset} answers "${answer}", which is not on the menu`,
      );
    }
  }
});

test('every rule an answer produces carries a plain-English line', () => {
  for (const question of QUESTIONS) {
    for (const option of question.answers) {
      for (const rule of question.rules(option.key)) {
        assert.ok(rule.says, `${question.id}/${option.key} produced a rule with no says line`);
        assert.match(rule.says, /\.$/, `"${rule.says}" should read as a sentence`);
      }
    }
  }
});

test('the review table produces readable sentences for singular and plural alike', () => {
  const rows = DATA_TYPES.map((type) => ({ ...type, value: 2 }));
  for (const rule of rulesFromScale(rows)) {
    assert.doesNotMatch(rule.says, /location only go\b/, 'singular subjects need a singular verb');
    assert.match(rule.says, /\.$/);
  }
});

test('cautious is stricter than open, on the same flow', () => {
  const call = { tool: 'WebFetch', input: { url: 'https://unknown-crm.io/x', email: 'jane@acme.com' } };
  const severity = ['allow', 'redact', 'substitute', 'ask', 'block'];
  const cautious = check(call, build('cautious')).decision;
  const open = check(call, build('open')).decision;
  assert.ok(
    severity.indexOf(cautious) >= severity.indexOf(open),
    `cautious (${cautious}) should not be softer than open (${open})`,
  );
});

test('every preset still blocks credentials', () => {
  // The one invariant across presets. They tune how often you are asked, not
  // whether a secret can leave.
  for (const preset of ['cautious', 'balanced', 'open']) {
    const result = check(
      { tool: 'WebFetch', input: { url: 'https://x.test', api_key: 'sk-ant-abc123def456ghi789' } },
      build(preset),
    );
    assert.equal(result.decision, 'block', `${preset} let a credential through`);
  }
});

test('typed rules compile to something the user can check', () => {
  const compiled = compileFreeText('never tell anyone I am pregnant');
  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].rule.outcome, 'block');
  assert.match(compiled[0].rule.says, /pregnant/);
  assert.equal(compiled[0].rule.provenance.source, 'personal', 'typed rules must never be shareable');
});

test('a typed rule actually fires', () => {
  const base = build('open');
  const typed = compileFreeText('never tell anyone I am pregnant')[0].rule;
  const call = { tool: 'mcp__slack__post', input: { text: 'I am pregnant, due in March' } };

  assert.notEqual(check(call, base).decision, 'block', 'baseline should not already block this');
  assert.equal(check(call, { ...base, rules: [...base.rules, typed] }).decision, 'block');
});

test('what we could not parse is reported, never silently dropped', () => {
  const missed = escalate('I like long walks on the beach');
  assert.ok(missed.length > 0, 'an unparseable sentence must be surfaced');
});

test('a five-point setting exists for every data type in every preset', () => {
  for (const preset of ['cautious', 'balanced', 'open']) {
    const scale = scaleForPreset(preset);
    for (const type of DATA_TYPES) {
      const value = scale[type.key];
      assert.ok(Number.isInteger(value) && value >= 0 && value < SCALE.length, `${preset}/${type.key}`);
    }
  }
});
