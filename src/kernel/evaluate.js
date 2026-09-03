/**
 * The decision engine.
 *
 * Takes the data found in a payload plus the classified recipient, and returns
 * one outcome per finding — then the call's overall decision.
 *
 * Two resolution rules, and they are written here rather than left implicit
 * because being able to explain *why* a rule fired is half of what makes the
 * kernel trustworthy:
 *
 *   1. most specific wins  — a rule naming one host beats one naming a sector,
 *                            which beats one naming a trust class, which beats "*"
 *   2. deny beats allow    — at equal specificity, the stricter outcome stands
 */

/** Strictest first. Used to break specificity ties and to reduce to one call decision. */
const SEVERITY = ['allow', 'redact', 'substitute', 'ask', 'block'];

export const OUTCOMES = Object.freeze({
  ALLOW: 'allow',
  REDACT: 'redact',
  SUBSTITUTE: 'substitute',
  ASK: 'ask',
  BLOCK: 'block',
});

const severityOf = (outcome) => SEVERITY.indexOf(outcome);

function matchesList(list, value) {
  if (!list || list.length === 0) return { hit: false, wildcard: false };
  if (list.includes('*')) return { hit: true, wildcard: true };
  return { hit: list.includes(value), wildcard: false };
}

/**
 * Does this rule apply to this finding and this recipient, and how specifically?
 *
 * Returns null when the rule does not apply. Otherwise a specificity score:
 * host 3, sector 2, trust 1, wildcard 0.
 */
function ruleApplies(rule, dataType, recipient) {
  if (!rule.data?.includes(dataType) && !rule.data?.includes('*')) return null;

  const spec = rule.recipient ?? {};
  let specificity = null;

  if (spec.host) {
    const { hit } = matchesList(spec.host, recipient.host);
    if (!hit) return null;
    specificity = 3;
  }

  if (spec.sector) {
    const { hit, wildcard } = matchesList(spec.sector, recipient.sector);
    if (!hit) return null;
    specificity = Math.max(specificity ?? 0, wildcard ? 0 : 2);
  }

  if (spec.trust) {
    const { hit, wildcard } = matchesList(spec.trust, recipient.trust);
    if (!hit) return null;
    specificity = Math.max(specificity ?? 0, wildcard ? 0 : 1);
  }

  // A rule that names no recipient at all applies everywhere, least specifically.
  if (specificity === null) specificity = 0;

  // A data type named outright is more specific than a "*" catch-all.
  if (rule.data?.includes(dataType)) specificity += 0.5;

  return specificity;
}

/** Pick the winning rule for one finding. */
function resolve(rules, dataType, recipient) {
  let winner = null;
  let winnerSpec = -1;

  for (const rule of rules) {
    const specificity = ruleApplies(rule, dataType, recipient);
    if (specificity === null) continue;

    if (specificity > winnerSpec) {
      winner = rule;
      winnerSpec = specificity;
      continue;
    }
    // Equal specificity: the stricter outcome stands.
    if (specificity === winnerSpec && severityOf(rule.outcome) > severityOf(winner.outcome)) {
      winner = rule;
    }
  }

  return winner;
}

/**
 * Evaluate a classified call against a constitution.
 *
 * @param {{findings: Array, recipient: object}} classified
 * @param {{rules: Array}} constitution
 * @returns {{decision: string, results: Array, reasons: string[]}}
 */
export function evaluate({ findings, recipient }, constitution) {
  const rules = constitution?.rules ?? [];
  const results = [];

  for (const finding of findings) {
    const rule = resolve(rules, finding.type, recipient);
    // No rule speaks to this flow, so nothing objects to it.
    const outcome = rule?.outcome ?? OUTCOMES.ALLOW;
    results.push({
      ...finding,
      outcome,
      ruleId: rule?.id ?? null,
      says: rule?.says ?? null,
    });
  }

  // The call's decision is the strictest outcome any single field triggered.
  const decision = results.reduce(
    (worst, r) => (severityOf(r.outcome) > severityOf(worst) ? r.outcome : worst),
    OUTCOMES.ALLOW,
  );

  const reasons = [
    ...new Set(results.filter((r) => r.outcome !== OUTCOMES.ALLOW && r.says).map((r) => r.says)),
  ];

  return { decision, results, reasons, recipient };
}

export { SEVERITY, severityOf };
