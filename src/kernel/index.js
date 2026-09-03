/**
 * The kernel: check one outbound flow against the constitution.
 *
 * It knows nothing about which runtime it is running under. That is what lets
 * the same constitution file enforce inside Claude Code and inside an OpenAI
 * Agents SDK agent, which is the portability claim we make on stage.
 */

import { detect } from './detect.js';
import { classifyRecipient } from './recipients.js';
import { evaluate, OUTCOMES } from './evaluate.js';
import { apply } from './apply.js';
import { loadConstitution } from './constitution.js';
import { judge } from './judge.js';

/**
 * @param {{tool: string, input: object}} call
 * @param {object} constitution
 * @returns {{decision: string, input: object, changes: Array, results: Array,
 *            reasons: string[], recipient: object, minimization: object}}
 */
export function check(call, constitution) {
  const context = {
    identity: constitution?.identity,
    // Demo harnesses point at a loopback echo server to show what left the
    // machine. Real installs leave this off, where loopback is not egress.
    treatLoopbackAsEgress: constitution?.testing?.treatLoopbackAsEgress === true,
  };
  const recipient = classifyRecipient(call, context);

  // Nothing leaves the machine, so there is nothing to weigh.
  if (recipient.trust === 'self') {
    return {
      decision: OUTCOMES.ALLOW,
      input: call.input,
      changes: [],
      results: [],
      reasons: [],
      recipient,
      minimization: { available: 0, sent: 0, withheld: 0 },
      local: true,
    };
  }

  const findings = detect(call.input, context);
  const evaluation = evaluate({ findings, recipient }, constitution);
  const { input, changes, minimization } = apply(call.input, evaluation, context);

  // Minimization that leaves nothing behind is not minimization, it is a broken
  // call dressed up as a policy win. When we cannot strip the detail without
  // gutting the payload, the honest move is to put the choice to the user
  // rather than to let the agent fail in a way that reads as our bug.
  const gutted =
    changes.some((change) => change.action === 'removed') &&
    Object.keys(input ?? {}).length === 0 &&
    Object.keys(call.input ?? {}).length > 0;

  return {
    ...evaluation,
    decision: gutted ? OUTCOMES.ASK : evaluation.decision,
    input: gutted ? call.input : input,
    changes,
    minimization,
    ...(gutted ? { escalated: 'redaction-would-empty-the-call' } : {}),
  };
}

/**
 * The same check, with the model tier behind it.
 *
 * Async, and therefore a separate entry point: most callers want the fast
 * synchronous path, and a hook that awaits a model on every tool call is a hook
 * users switch off. The model only ever *adds* findings, so this can be
 * stricter than `check` but never looser.
 *
 * @param {{tool: string, input: object}} call
 * @param {object} constitution
 * @param {{ask: Function, cache?: Map, timeoutMs?: number, onError?: Function}} model
 */
export async function checkDeep(call, constitution, model) {
  const fast = check(call, constitution);
  if (fast.local || !model?.ask) return fast;

  // Nothing left to learn: the strictest outcome is already in force.
  if (fast.decision === OUTCOMES.BLOCK) return fast;

  const context = { identity: constitution?.identity };
  const extra = await judge(call.input, fast.recipient, model);
  if (extra.length === 0) return fast;

  // Re-run the decision over both sets, so one engine reaches one verdict.
  const findings = [...detect(call.input, context), ...extra];
  const evaluation = evaluate({ findings, recipient: fast.recipient }, constitution);
  const { input, changes, minimization } = apply(call.input, evaluation, context);

  return { ...evaluation, input, changes, minimization, usedModel: true };
}

export { detect, classifyRecipient, evaluate, apply, loadConstitution, judge, OUTCOMES };
