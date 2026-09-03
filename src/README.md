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
npx . init                                       # the questionnaire
npx . install --dir /path/to/a/scratch/project   # registers the PreToolUse hook
npx . scan                                       # what your agent already did, before any of this
npx . rules                                      # what your constitution says, in plain English
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
| `kernel/questions.js` | The presets, the questions, and the rules each answer writes |
| `kernel/freetext.js` | Rules typed in the user's own words |
| `bin/ui.js` | Terminal widgets — select with live preview, the settings matrix |
| `bin/onboard.js` | The onboarding flow, and the closing rehearsal |
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

## Reading history back

`npx . scan` replays the tool calls already sitting in `~/.claude/projects` and
reports what left the machine. No setup, no model call, no hypothetical — every
person running a coding agent has months of this and none of them have looked.

It is also the answer to cold start: `--apply` turns observed habits into rules,
which beats asking someone to fill in a form about what they might do.

```
    6493  tool calls
      80  carried something personal
      27  services received it
```

Three shapes of proposal, in order of how confident we can be:

| Shape | When | What it does |
|---|---|---|
| **concentrated** | one data type only ever went to one sector | proposes the rule *and* its exception, so the habit keeps working |
| **never-shared** | something sensitive never left | locks it in while that is still true |
| **scattered** | it reached four or more unrelated services | flags it, proposes nothing — a habit that broad is for the user to look at, not for us to guess |

The report redacts itself: counts and kinds, never values. A leak report that
quotes your secrets back at you on a projector is its own incident.

## Onboarding

`npx . init` is three screens and six questions.

**Pick a preset** — Cautious, Balanced, Open — with the resulting settings
previewed live as the cursor moves.

**Answer only what the presets disagree on.** Seven questions are defined; six
are asked, because all three presets answer the credentials question the same
way. Presets tune how often you are asked, not whether a secret can leave. Each
answer previews the rule it writes.

**Review the table.** One row per data type, five settings, arrow keys. The
preset filled it in; you change what you care about.

Then free text in your own words, compiled to rules and shown back before
saving — with anything we could not parse reported rather than silently
dropped. Then your own email and phone, which is what lets the kernel tell your
contact details from someone else's.

It closes on a rehearsal: the new constitution run against five flows you will
recognise, so no rule ships unseen.

```
    redact      a health note into your calendar
    allow       the same note to your clinic
    redact      a colleague's number to an outside tool
    block       an API key in a request
    ask         your email to a site you have never used
```

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

Build order is in [`../BRIEF.md`](../BRIEF.md#build-order). Items 1-6 are done.
Next: the OpenAI Agents SDK adapter (item 7), which is the portability proof,
then the 24-probe conformance suite (item 8).
