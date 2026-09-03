/**
 * OpenAI Agents SDK adapter.
 *
 * The same kernel and the same constitution file as the Claude Code hook. That
 * is the whole portability claim, and it is why this file is short: nothing in
 * `kernel/` knows which runtime it is running under.
 *
 * A note on why this wraps tools rather than using the SDK's own tool
 * guardrails. `defineToolInputGuardrail` can allow, reject, or throw — it
 * cannot rewrite the call. Block and ask would work; redact and substitute
 * would not, and those are the outcomes the whole design rests on. A guardrail
 * that can only refuse turns a privacy tool into a nuisance, so we wrap
 * `invoke` instead and hand the model a smaller payload.
 *
 * `constitutionGuardrail` is still exported for anyone who wants the native
 * integration and is content with block and ask.
 */

import { check } from '../kernel/index.js';
import { loadConstitution } from '../kernel/constitution.js';
import { record } from '../kernel/ledger.js';
import { OUTCOMES } from '../kernel/evaluate.js';
import { menuFor } from '../kernel/rules.js';
import { saveHold } from '../kernel/pending.js';

/**
 * Put back the keys a strict schema insists on, as null.
 *
 * The kernel removes a redacted key outright, which is right: a key present
 * with a placeholder still tells the recipient the field existed and that you
 * withheld it. But this SDK validates arguments against the tool's schema, and
 * a strict schema marks every property required — so a removed key fails
 * validation and the tool never runs at all. That reads to the user as the
 * privacy tool breaking their agent, which is the one outcome worth avoiding.
 *
 * So the kernel stays runtime-agnostic and the adapter reconciles: absent
 * becomes null, which carries no value while satisfying the schema.
 */
function satisfySchema(input, original, parameters) {
  const required = parameters?.required;
  if (!Array.isArray(required) || required.length === 0) return input;

  const reconciled = { ...input };
  for (const key of required) {
    if (!(key in reconciled) && key in original) reconciled[key] = null;
  }
  return reconciled;
}

/** What the model is told when a call is refused or held. */
function explain(result, { held } = {}) {
  const lines = [
    held
      ? `Held by the user's privacy constitution before this reaches ${result.recipient.name}.`
      : `Blocked by the user's privacy constitution — ${result.recipient.name} may not receive this.`,
    ...result.reasons.map((reason) => `  · ${reason}`),
  ];
  if (held) {
    lines.push(
      '',
      'Show the user these options verbatim and ask which they want. Do not choose for them.',
      ...held.options.map((option, index) => {
        const rule = option.rule();
        return [
          `  ${index + 1}. ${option.label}`,
          `     ${option.consequence}`,
          rule ? `     writes the rule: ${rule.says}` : '     nothing is remembered',
        ].join('\n');
      }),
      '',
      `Then run: npx privacy-constitution decide ${held.id} <number>`,
    );
  } else {
    lines.push('', 'Retry without those fields, or ask the user to change the rule.');
  }
  return lines.join('\n');
}

/**
 * Wrap one tool so nothing reaches it that the constitution would not allow.
 *
 * @param {object} tool a FunctionTool from the SDK's `tool()` helper
 * @param {{recipient?: {name: string, sector?: string, trust?: string},
 *          constitution?: object}} [options]
 *   `recipient` declares what the tool actually talks to. The SDK has no notion
 *   of this — a function called `send_email` could reach anything — so
 *   declaring it is how a rule about "healthcare services" finds its target.
 *   `onDecision` receives every verdict, for a UI that wants to show what was
 *   withheld rather than only what got through.
 */
export function guard(tool, options = {}) {
  const original = tool.invoke.bind(tool);

  return {
    ...tool,
    async invoke(runContext, input, details) {
      const constitution = options.constitution ?? loadConstitution();

      let parsed;
      try {
        parsed = input ? JSON.parse(input) : {};
      } catch {
        // Arguments we cannot read are arguments we cannot check. Say so rather
        // than waving them through.
        return `The privacy constitution could not read this tool call's arguments, so it was not sent.`;
      }

      const result = check({ tool: tool.name, input: parsed, recipient: options.recipient }, constitution);
      options.onDecision?.({ tool: tool.name, proposed: parsed, ...result });

      record({
        tool: tool.name,
        runtime: 'openai-agents',
        decision: result.decision,
        recipient: result.recipient,
        changes: result.changes,
        minimization: result.minimization,
        reasons: result.reasons,
      });

      if (result.decision === OUTCOMES.BLOCK) return explain(result);

      if (result.decision === OUTCOMES.ASK) {
        const id = saveHold({ tool: tool.name, input: parsed, recipient: result.recipient, results: result.results });
        const menu = menuFor({ ...result, tool: tool.name });
        return explain(result, { held: { id, options: menu } });
      }

      // Allow, redact and substitute all proceed — carrying less.
      const payload = satisfySchema(result.input, parsed, tool.parameters);
      return original(runContext, JSON.stringify(payload), details);
    },
  };
}

/**
 * Wrap every tool an agent has.
 *
 * `recipients` maps tool name to what it talks to, so rules written about
 * sectors ("health details only go to healthcare services") land correctly.
 */
export function guardAll(tools, { recipients = {}, constitution, onDecision } = {}) {
  return tools.map((tool) => guard(tool, { recipient: recipients[tool.name], constitution, onDecision }));
}

/**
 * The SDK's native tool-input guardrail.
 *
 * Offered for completeness. It can refuse a call but not rewrite one, so
 * anything the constitution would have redacted is refused outright here —
 * correct, but a worse experience than `guard`. Prefer `guardAll`.
 */
export function constitutionGuardrail({ recipients = {}, constitution } = {}) {
  return {
    name: 'privacy-constitution',
    async run({ toolCall }) {
      const policy = constitution ?? loadConstitution();
      let parsed = {};
      try {
        parsed = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
      } catch {
        parsed = {};
      }

      const result = check(
        { tool: toolCall.name, input: parsed, recipient: recipients[toolCall.name] },
        policy,
      );

      if (result.decision === OUTCOMES.ALLOW) {
        return { behavior: { type: 'allow' } };
      }
      return {
        behavior: { type: 'rejectContent', message: explain(result) },
        outputInfo: { decision: result.decision, reasons: result.reasons },
      };
    },
  };
}
