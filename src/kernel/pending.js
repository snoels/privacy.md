/**
 * A held call, waiting on a decision.
 *
 * The hook runs as a subprocess with no terminal of its own — stdin carries the
 * tool call and /dev/tty is not reachable — so it cannot draw a menu. It does
 * not need to. The agent is already a conversation with the user, so the menu
 * travels back through the agent and the answer comes in as a command.
 *
 * That keeps the whole interaction inside the workflow the user is already in,
 * and it is the reason the same design works in Codex or anything else that can
 * run a command: nothing here assumes a particular UI.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { PRIVACY_HOME } from './constitution.js';

export const PENDING_DIR = join(PRIVACY_HOME, 'pending');

/** Holds older than this are stale — the agent moved on without deciding. */
const STALE_MS = 30 * 60 * 1000;

export function newHoldId() {
  return randomBytes(3).toString('hex');
}

export function saveHold(hold) {
  mkdirSync(PENDING_DIR, { recursive: true });
  const id = hold.id ?? newHoldId();
  writeFileSync(join(PENDING_DIR, `${id}.json`), JSON.stringify({ ...hold, id, at: Date.now() }, null, 2), 'utf8');
  return id;
}

export function loadHold(id) {
  const path = join(PENDING_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function clearHold(id) {
  const path = join(PENDING_DIR, `${id}.json`);
  if (existsSync(path)) unlinkSync(path);
}

/** Most recent first, stale ones dropped. */
export function listHolds() {
  if (!existsSync(PENDING_DIR)) return [];
  const now = Date.now();
  return readdirSync(PENDING_DIR)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        const hold = JSON.parse(readFileSync(join(PENDING_DIR, name), 'utf8'));
        if (now - hold.at > STALE_MS) {
          unlinkSync(join(PENDING_DIR, name));
          return [];
        }
        return [hold];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.at - a.at);
}
