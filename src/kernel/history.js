/**
 * What your agent already did.
 *
 * Everyone running a coding agent has months of tool calls sitting on their
 * laptop, and nobody has looked. Reading them back is the cheapest honest way
 * to show the problem is real — no setup, no model call, no hypothetical.
 *
 * It is also the answer to cold start. Inferring rules from what someone has
 * actually shared beats asking them to fill in a form about what they might.
 *
 * Nothing here leaves the machine, and the report redacts itself: counts and
 * kinds, never the values. A leak report that quotes your secrets back at you
 * on a projector is its own incident.
 */

import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { detect } from './detect.js';
import { classifyRecipient } from './recipients.js';

export const TRANSCRIPT_HOME = join(homedir(), '.claude', 'projects');

/** Every transcript on the machine, newest first. */
export function transcripts({ home = TRANSCRIPT_HOME, since } = {}) {
  if (!existsSync(home)) return [];
  const files = [];
  for (const project of readdirSync(home)) {
    const dir = join(home, project);
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(dir, name);
      try {
        const stat = statSync(path);
        if (since && stat.mtimeMs < since) continue;
        files.push({ path, project, at: stat.mtimeMs });
      } catch {
        // A transcript that vanished mid-scan is not worth failing over.
      }
    }
  }
  return files.sort((a, b) => b.at - a.at);
}

/** Pull the tool calls out of one transcript. */
async function toolCalls(path) {
  const calls = [];
  const stream = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });

  for await (const line of stream) {
    if (!line.includes('tool_use')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'tool_use' && block.name) {
        calls.push({ tool: block.name, input: block.input ?? {}, at: entry.timestamp });
      }
    }
  }

  return calls;
}

/**
 * Replay history through the detector, without enforcing anything.
 *
 * This is deliberately not `check`: we want what *was* shared, not what the
 * current constitution would have done about it. The gap between the two is the
 * whole point of the report.
 */
export async function scan({ home = TRANSCRIPT_HOME, since, identity, limit = 400, onProgress } = {}) {
  const files = transcripts({ home, since }).slice(0, limit);

  const observed = [];
  let callCount = 0;
  let scanned = 0;

  for (const file of files) {
    let calls;
    try {
      calls = await toolCalls(file.path);
    } catch {
      continue;
    }
    scanned += 1;
    onProgress?.(scanned, files.length);

    for (const call of calls) {
      callCount += 1;
      const recipient = classifyRecipient(call, { identity });
      // Only egress counts. Reading a local file is not a disclosure.
      if (recipient.trust === 'self') continue;

      const findings = detect(call.input, { identity });
      if (findings.length === 0) continue;

      for (const finding of findings) {
        observed.push({
          type: finding.type,
          tool: call.tool,
          recipient: recipient.name,
          sector: recipient.sector,
          trust: recipient.trust,
          at: call.at,
        });
      }
    }
  }

  return { files: files.length, scanned, calls: callCount, observed };
}

/** Roll a scan up into the numbers the opening quotes. */
export function summarizeScan(scan) {
  const byType = new Map();
  const byRecipient = new Map();
  const pairs = new Map();

  for (const item of scan.observed) {
    byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
    byRecipient.set(item.recipient, (byRecipient.get(item.recipient) ?? 0) + 1);

    const key = `${item.type}::${item.recipient}`;
    const pair = pairs.get(key) ?? { type: item.type, recipient: item.recipient, sector: item.sector, trust: item.trust, count: 0 };
    pair.count += 1;
    pairs.set(key, pair);
  }

  /** How many distinct recipients saw each data type — the alarming number. */
  const spread = new Map();
  for (const pair of pairs.values()) {
    spread.set(pair.type, (spread.get(pair.type) ?? 0) + 1);
  }

  return {
    calls: scan.calls,
    carrying: new Set(scan.observed.map((item) => `${item.tool}::${item.at}`)).size,
    recipients: byRecipient.size,
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    byRecipient: [...byRecipient.entries()].sort((a, b) => b[1] - a[1]),
    spread: [...spread.entries()].sort((a, b) => b[1] - a[1]),
    pairs: [...pairs.values()].sort((a, b) => b.count - a.count),
  };
}
