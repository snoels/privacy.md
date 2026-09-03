/**
 * The session ledger.
 *
 * Every decision is appended here, which is what the summary and the dashboard
 * read back. Two numbers matter most and both come from this file: the
 * minimization ratio (fields available versus fields sent) and interruptions per
 * day, which is the one that decides whether anyone keeps the tool switched on.
 *
 * The ledger describes the user's own flows, so it lives beside the constitution
 * and never leaves the machine either.
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONSTITUTION_HOME } from './constitution.js';

export const LEDGER_PATH = join(CONSTITUTION_HOME, 'ledger.jsonl');

export function record(entry, path = LEDGER_PATH) {
  try {
    mkdirSync(CONSTITUTION_HOME, { recursive: true });
    appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
  } catch {
    // A ledger write must never take the agent down with it.
  }
}

export function readLedger(path = LEDGER_PATH) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

/** Roll the ledger up into the numbers the summary and the pitch both quote. */
export function summarize(entries) {
  const byRule = new Map();
  const byRecipient = new Map();
  let available = 0;
  let sent = 0;
  let interruptions = 0;

  for (const entry of entries) {
    available += entry.minimization?.available ?? 0;
    sent += entry.minimization?.sent ?? 0;
    if (entry.decision === 'ask') interruptions += 1;

    for (const change of entry.changes ?? []) {
      const key = change.ruleId ?? 'unattributed';
      byRule.set(key, (byRule.get(key) ?? 0) + 1);
    }
    if (entry.recipient?.name) {
      byRecipient.set(entry.recipient.name, (byRecipient.get(entry.recipient.name) ?? 0) + 1);
    }
  }

  const withheld = available - sent;
  return {
    calls: entries.length,
    available,
    sent,
    withheld,
    // Share of detected personal fields that never left the machine.
    minimizationRatio: available === 0 ? null : withheld / available,
    interruptions,
    byRule: [...byRule.entries()].sort((a, b) => b[1] - a[1]),
    byRecipient: [...byRecipient.entries()].sort((a, b) => b[1] - a[1]),
  };
}
