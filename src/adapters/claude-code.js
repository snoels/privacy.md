#!/usr/bin/env node
/**
 * Claude Code adapter: a PreToolUse hook.
 *
 * The runtime hands us a proposed tool call on stdin and honours what we write
 * to stdout — including a rewritten `updatedInput`, which is what makes
 * minimization possible rather than just blocking. The kernel underneath knows
 * nothing about Claude Code; swapping this file for the OpenAI Agents SDK
 * adapter is the whole portability story.
 *
 * Outcome mapping:
 *   allow       → permissionDecision "allow"
 *   redact      → permissionDecision "allow" + updatedInput, fields removed
 *   substitute  → permissionDecision "allow" + updatedInput, fields masked
 *   ask         → permissionDecision "ask"
 *   block       → permissionDecision "deny"
 */

import { check } from '../kernel/index.js';
import { loadConstitution } from '../kernel/constitution.js';
import { record } from '../kernel/ledger.js';
import { OUTCOMES } from '../kernel/evaluate.js';

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (raw += chunk));
    process.stdin.on('end', () => resolve(raw));
  });
}

const emit = (output) => process.stdout.write(JSON.stringify(output));

const decisionOutput = (permissionDecision, extra = {}) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, ...extra },
});

/** One line per withheld field, so the transcript shows the work. */
function describe(result) {
  const lines = result.changes.map((change) => {
    const where = change.path.join('.');
    return change.action === 'masked'
      ? `  masked   ${where} → ${change.mask}`
      : `  removed  ${where}`;
  });
  const reasons = result.reasons.map((r) => `  · ${r}`);
  return [...lines, ...(reasons.length ? ['', 'Rules that fired:', ...reasons] : [])].join('\n');
}

async function main() {
  const raw = await readStdin();

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    // Unparseable input is our bug, not the user's. Stay out of the way.
    process.exit(0);
  }

  const call = { tool: event.tool_name, input: event.tool_input ?? {} };
  const constitution = loadConstitution();
  const result = check(call, constitution);

  record({
    tool: call.tool,
    decision: result.decision,
    recipient: result.recipient,
    changes: result.changes,
    minimization: result.minimization,
    reasons: result.reasons,
    sessionId: event.session_id,
  });

  if (result.decision === OUTCOMES.ALLOW) {
    emit(decisionOutput('allow'));
    return;
  }

  if (result.decision === OUTCOMES.BLOCK) {
    emit(
      decisionOutput('deny', {
        permissionDecisionReason: [
          `Blocked by your privacy constitution — ${result.recipient.name} may not receive this.`,
          '',
          describe(result),
          '',
          'Retry without the blocked fields, or run `npx privacy-constitution rules` to change the rule.',
        ].join('\n'),
      }),
    );
    return;
  }

  if (result.decision === OUTCOMES.ASK) {
    emit(
      decisionOutput('ask', {
        permissionDecisionReason: [
          `Your privacy constitution wants a decision before this reaches ${result.recipient.name}.`,
          `Recipient is ${result.recipient.trust.replace('_', ' ')}${
            result.recipient.chosenBy === 'agent' ? ', and the agent chose it rather than you' : ''
          }.`,
          '',
          result.reasons.map((r) => `  · ${r}`).join('\n'),
        ].join('\n'),
      }),
    );
    return;
  }

  // Redact and substitute: the call proceeds, carrying less.
  const withheld = result.minimization.withheld;
  emit(
    decisionOutput('allow', {
      updatedInput: result.input,
      systemMessage: [
        `Privacy constitution: ${withheld} field${withheld === 1 ? '' : 's'} withheld from ${result.recipient.name}.`,
        describe(result),
      ].join('\n'),
    }),
  );
}

main().catch((error) => {
  // A crash in the kernel must not silently pass data through, and must not
  // brick the agent either. Asking the user is the only honest answer.
  emit(
    decisionOutput('ask', {
      permissionDecisionReason: `The privacy kernel failed to evaluate this call (${error.message}). Deciding manually.`,
    }),
  );
});
