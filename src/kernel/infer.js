/**
 * Rules proposed from what actually happened.
 *
 * "You have shared your address with delivery services twelve times and nothing
 * else. Rule: address goes to logistics only."
 *
 * The claim this makes good on is that nobody writes privacy policy. A rule
 * inferred from a habit the user already has is one they can judge in a second,
 * which is the only kind they will ever accept.
 *
 * Each proposal carries the evidence that produced it, because a rule the user
 * cannot see the reason for is a rule they will not trust.
 */

const DATA_WORDS = {
  contact: 'your contact details',
  third_party_contact: "other people's contact details",
  credentials: 'keys and secrets',
  health: 'health details',
  location: 'your location',
  financial: 'financial details',
  identity: 'identity documents',
  salary_history: 'salary history',
  special_category: 'special-category details',
};

const words = (type) => DATA_WORDS[type] ?? type.replace(/_/g, ' ');

/** Data words that take a singular verb. Everything else is plural. */
const SINGULAR = new Set(['salary_history', 'location']);
const verb = (type, plural, singular) => (SINGULAR.has(type) ? singular : plural);

/** Below this, a habit is a coincidence rather than a pattern. */
const MIN_EVIDENCE = 3;

/**
 * Propose rules from a scan.
 *
 * Three shapes, in order of how confident we can be:
 *
 *   concentrated  one data type has only ever gone to one sector
 *   never-shared  a data type appears in payloads but never left
 *   scattered     a data type reached many unrelated recipients; we do not
 *                 propose a rule, we flag it, because a habit that broad is
 *                 exactly the thing the user should look at rather than
 *                 have us guess about
 */
export function propose(summary, { existingRuleIds = new Set() } = {}) {
  const proposals = [];
  const bySector = new Map();

  for (const pair of summary.pairs) {
    const key = pair.type;
    const entry = bySector.get(key) ?? { type: key, sectors: new Map(), recipients: new Set(), total: 0 };
    entry.sectors.set(pair.sector, (entry.sectors.get(pair.sector) ?? 0) + pair.count);
    entry.recipients.add(pair.recipient);
    entry.total += pair.count;
    bySector.set(key, entry);
  }

  for (const entry of bySector.values()) {
    if (entry.total < MIN_EVIDENCE) continue;

    const sectors = [...entry.sectors.entries()].sort((a, b) => b[1] - a[1]);
    const named = sectors.filter(([sector]) => sector && sector !== 'unknown');

    // Concentrated: one sector accounts for effectively all of it.
    if (named.length === 1 && named[0][1] >= entry.total * 0.8) {
      const [sector, count] = named[0];
      const id = `inferred-${entry.type}-to-${sector}`;
      if (existingRuleIds.has(id)) continue;
      proposals.push({
        kind: 'concentrated',
        evidence: `${words(entry.type)} went to ${sector} services ${count} times, and nowhere else`,
        rule: {
          id,
          says: `${cap(words(entry.type))} ${verb(entry.type, 'only go', 'only goes')} to ${sector} services.`,
          data: [entry.type],
          recipient: { trust: ['known', 'task_scoped', 'agent_chosen', 'public'] },
          outcome: 'redact',
          exceptSector: sector,
          provenance: { source: 'inferred', evidence: count, at: new Date().toISOString() },
        },
        // The paired exception, so the habit we observed keeps working.
        also: {
          id: `${id}-exception`,
          says: `${cap(words(entry.type))} may go to ${sector} services.`,
          data: [entry.type],
          recipient: { sector: [sector] },
          outcome: 'allow',
          provenance: { source: 'inferred', evidence: count, at: new Date().toISOString() },
        },
      });
      continue;
    }

    // Scattered: too many unrelated destinations to infer intent from.
    if (entry.recipients.size >= 4) {
      proposals.push({
        kind: 'scattered',
        evidence: `${words(entry.type)} reached ${entry.recipients.size} different services ${entry.total} times`,
        rule: null,
        question: `Should ${words(entry.type)} really be going to ${entry.recipients.size} different places?`,
      });
    }
  }

  // Anything sensitive that never left is worth locking in while it is true.
  for (const type of ['credentials', 'special_category', 'salary_history']) {
    const seen = summary.byType.find(([name]) => name === type);
    if (seen) continue;
    const id = `inferred-${type}-never`;
    if (existingRuleIds.has(id)) continue;
    proposals.push({
      kind: 'never-shared',
      evidence: `${words(type)} never left this machine in the history we read`,
      rule: {
        id,
        says: `${cap(words(type))} ${verb(type, 'never leave', 'never leaves')} this machine.`,
        data: [type],
        recipient: { trust: ['*'] },
        outcome: 'block',
        provenance: { source: 'inferred', evidence: 0, at: new Date().toISOString() },
      },
    });
  }

  return proposals;
}

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Interruptions that were really the same decision.
 *
 * The most valuable line in any summary is not a metric: "three of today's
 * interruptions were the same decision, one rule covers all of them, want it?"
 * That turns fatigue from a number we report into a problem we fix.
 */
export function repeatedDecisions(ledgerEntries) {
  const groups = new Map();

  for (const entry of ledgerEntries) {
    if (entry.decision !== 'ask') continue;
    const types = [...new Set((entry.results ?? []).map((result) => result.type))].sort();
    const key = `${types.join('+')}::${entry.recipient?.name ?? 'unknown'}`;
    const group = groups.get(key) ?? { types, recipient: entry.recipient, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.count >= 2)
    .sort((a, b) => b.count - a.count)
    .map((group) => ({
      ...group,
      suggestion: `${group.count} interruptions were the same decision: ${group.types
        .map(words)
        .join(' and ')} going to ${group.recipient?.name ?? 'the same place'}. One rule covers all of them.`,
    }));
}

export { words, MIN_EVIDENCE };
