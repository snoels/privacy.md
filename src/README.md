# Implementation

The kernel, and the runtime adapters that feed it.

```
  runtime adapter  →  kernel.check(call)  →  outcome
  (PreToolUse,         deterministic pass,     allow | redact | substitute
   OpenAI SDK next)    model if unclear        | ask | block
```

The kernel knows nothing about which runtime it is running under. That is what
makes the same constitution file work in both, which is the portability claim we
make on stage.

## Try it

```bash
cd src && npm install
npx . install --dir /path/to/a/scratch/project   # registers the PreToolUse hook
npx . report                                     # what was withheld, and how often you were asked
```

`install` writes to that project's `.claude/settings.json` and leaves any hooks
already there alone. `--user` installs globally instead; be deliberate about that
one.

## Layout

| Path | What it does |
|---|---|
| `kernel/detect.js` | Finds personal data in a payload — field names and value patterns |
| `kernel/recipients.js` | Classifies who is on the other end, on two axes: trust and sector |
| `kernel/evaluate.js` | Matches rules and resolves conflicts — most specific wins, deny beats allow |
| `kernel/apply.js` | Turns a decision into an actual smaller payload |
| `kernel/composite.js` | Redacts *inside* a value that carries a nested payload |
| `kernel/constitution.js` | Loads and layers the policy; `asTemplate` strips it for sharing |
| `kernel/ledger.js` | Records every decision; produces the minimization ratio |
| `adapters/claude-code.js` | The `PreToolUse` hook |
| `constitutions/balanced.yaml` | The starting rule set |

## What is proven so far

A real Claude Code session was asked to POST this to a local server:

```json
{"name":"Sander","contact":"jane.doe@acme.com","note":"Physio appointment, lower back injury"}
```

What actually reached the server:

```json
{"name":"Sander","contact":"[redacted by your privacy constitution]"}
```

The request succeeded, the agent reported success, and neither the health detail
nor the third party's email ever left the machine. That is build items 1-3 —
interception, the outcome model end to end, and the minimization ratio.

Item 4 was proven the same way: a held call reached the user as a seven-option
menu inside the session, `decide` wrote the rule, and the retry was no longer
held.

## The hold loop stays inside the agent

A `PreToolUse` hook has no terminal of its own — stdin carries the tool call and
`/dev/tty` fails with `ENXIO`. So it cannot draw a menu. It does not need to:
the agent is already a conversation with the user.

```
  agent proposes a call
        │
  kernel holds it, and hands the agent the menu
        │
  agent shows the options and asks           ← inline, in the session
        │
  npx privacy-constitution decide <id> <n>   ← writes the rule
        │
  agent retries; the constitution now covers it
```

Every option carries the rule it would write, so the user sees how wide the
grant is before taking it. Nothing here assumes a particular UI, which is why
the same loop works in Codex or anything else that can run a command.

`npx . holds` lists anything waiting, if the agent loses the thread.

## Design notes worth knowing

**Redaction removes the key, it does not blank it.** A key present with a
placeholder still tells the recipient the field existed and that you withheld it,
and some APIs reject the placeholder outright.

**Except inside composite values.** A shell command carrying a JSON body, or a
message with several sentences, gets redacted *within* — otherwise the call fails
and the user reads it as the privacy tool breaking their agent.

**Identifiers and topics are handled differently.** An email address is the datum,
so strip exactly it. A word like "Physio" is only *evidence* the field is about
health — "lower back injury" is health too — so the whole field goes.

**A redaction that empties the call escalates to `ask`.** Minimization that leaves
nothing behind is a broken call dressed up as a policy win.

**Loopback is this machine.** A dev server on `:8787` is not a third party. Demo
harnesses set `testing.treatLoopbackAsEgress` to watch the wire.

**Dates are not phone numbers.** `2026-09-11T14:00` has the shape of one, and
redacting an event's `start` breaks the task while looking like the kernel worked.

## Next

Build order is in [`../BRIEF.md`](../BRIEF.md#build-order). Items 1-4 are done.
Next: onboarding (item 5) — the preset, the review table, and free-text rules.
