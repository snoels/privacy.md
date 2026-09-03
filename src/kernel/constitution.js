/**
 * Loading and merging the constitution.
 *
 * The personal constitution never leaves the machine. It is itself sensitive: a
 * rule reading "never disclose my HIV status" leaks the fact by existing. Only
 * templates — which carry no personal facts — are ever shareable, which is what
 * `provenance` on each rule makes possible.
 *
 * Layers, merged most-specific-last:
 *   template  →  organisation  →  personal  →  session
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));

export const PRIVACY_HOME = process.env.PRIVACY_MD_HOME
  ? resolve(process.env.PRIVACY_MD_HOME)
  : join(homedir(), '.privacy');

export const RULES_PATH = join(PRIVACY_HOME, 'rules.yaml');

/** The readable half. What a person opens; the YAML is compiled from it. */
export const POLICY_PATH = join(PRIVACY_HOME, 'privacy.md');

export function presetPath(name) {
  return join(HERE, '..', 'constitutions', `${name}.yaml`);
}

export function loadYaml(path) {
  return YAML.parse(readFileSync(path, 'utf8'));
}

/**
 * Load the user's constitution, falling back to a preset when they have not run
 * `init` yet. A missing constitution must never mean "allow everything".
 */
export function loadConstitution({ path = RULES_PATH, fallbackPreset = 'balanced' } = {}) {
  if (existsSync(path)) return { ...loadYaml(path), source: path };
  const preset = presetPath(fallbackPreset);
  return { ...loadYaml(preset), source: preset, isFallback: true };
}

/** Later layers win on rule id; order within a layer is preserved. */
export function mergeLayers(...layers) {
  const byId = new Map();
  for (const layer of layers) {
    for (const rule of layer?.rules ?? []) byId.set(rule.id, rule);
  }
  const identity = layers.reduce((acc, layer) => ({ ...acc, ...(layer?.identity ?? {}) }), {});
  return { version: 1, identity, rules: [...byId.values()] };
}

/** Runtime bookkeeping that `loadConstitution` adds; never part of the policy. */
const RUNTIME_KEYS = ['source', 'isFallback'];

export function saveConstitution(constitution, path = RULES_PATH) {
  const policy = { ...constitution };
  for (const key of RUNTIME_KEYS) delete policy[key];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(policy), 'utf8');
  return path;
}

/**
 * Things about a constitution that will bite the user later.
 *
 * A missing identity is the one that matters. Without it the kernel cannot tell
 * the user's own contact details from anyone else's, so it treats all of them
 * as someone else's and strips them -- which quietly breaks every booking and
 * signup instead of masking the value and letting the task through.
 */
export function warnings(constitution) {
  const found = [];
  const identity = constitution?.identity ?? {};

  if (!identity.email && !identity.phone) {
    found.push({
      id: 'no-identity',
      says: 'No identity set, so your own contact details read as someone else\'s.',
      because: 'They get stripped rather than masked, and calls that need them will fail.',
      fix: 'npx privacy.md init --force, or add identity.email to the file.',
    });
  }

  if ((constitution?.rules ?? []).length === 0) {
    found.push({
      id: 'no-rules',
      says: 'This constitution has no rules, so nothing is being checked.',
      because: 'Every call will pass through untouched.',
      fix: 'npx privacy.md init',
    });
  }

  return found;
}

/**
 * Strip everything personal, leaving a template safe to publish.
 *
 * This is the whole reason provenance is on every rule. The tool minimizing its
 * own output is the same move it performs on every tool call.
 */
export function asTemplate(constitution, { name = 'untitled' } = {}) {
  const rules = (constitution.rules ?? [])
    .filter((rule) => rule.provenance?.source !== 'personal' && !rule.personal)
    .map(({ provenance, ...rule }) => ({ ...rule, provenance: { source: 'template', from: name } }));
  return { version: 1, template: name, rules };
}
