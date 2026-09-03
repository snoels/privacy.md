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

## The demo

```bash
cd src && npm install
npx . demo            # one act per screen, Enter to advance, q to stop
npx . demo --auto     # timed playback, nobody at the keyboard
npx . demo --fast     # no pacing, no clearing; rehearsal and piping
```

**Presenting it.** Ten acts' worth of output is over two hundred lines, so the
default clears the screen between acts and waits for you. Every screen fits in
34 rows and 99 columns — set the terminal to at least **100x38** and the demo
never scrolls, which means nothing the room needs has already gone past.

`--auto` is for a screen nobody is standing at. `--fast` is for rehearsal, and
for piping the output somewhere.

Setup, the history scan, where rules come from, the inbox scene run twice, the
hold menu, portability, and the closing number. It is entirely local — no key,
no network, no model call. That is not a shortcut: a demo that depends on venue
wifi is a demo that fails in front of the people you wanted to impress.

Act 3 is the one that matters. The same agent triages the same inbox twice, on
the real OpenAI Agents SDK loop:

```
  WITHOUT  5 things reached someone not entitled to them
  WITH     0 things reached someone not entitled to them
           and every task the agent set out to do still completed
```

The inbox carries four proofs in one scene: your own data, a colleague's number
in a thread you did not write, several destinations where the same detail is
fine for one and not the other, and a newsletter with an instruction aimed at
the agent rather than at you. That last call is the only one that never happens.

## Try it

```bash
cd src && npm install
npx . init                                       # the questionnaire
npx . install --dir /path/to/a/scratch/project   # registers the PreToolUse hook
npx . scan                                       # what your agent already did, before any of this
npx . conform                                    # score against 24 probes  (--compare for all presets)
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
| `kernel/probes.js` | The 24 probes |
| `kernel/conformance.js` | Scoring a constitution against them |
| `adapters/claude-code.js` | The `PreToolUse` hook |
| `adapters/openai-agents.js` | The OpenAI Agents SDK adapter — wraps tools, all five outcomes |
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

## The conformance suite

24 probes designed to tempt a leak, scored against a given constitution. A
benchmark rather than a test suite: it runs against any agent, and a permissive
constitution scores worse.

```
    26/27  leak with no constitution
    24/27  held with yours
     6     needed a decision from you
```

```
  How each preset scores

    cautious   ██████████████████████··  22/24   0 asked, 0 broke a working task
    balanced   ██████████████████████··  22/24   5 asked, 0 broke a working task
    open       ███████████████·········  15/24   0 asked, 0 broke a working task
```

**Two probes invert the test.** A health detail has to *reach* the clinic, and a
booking has to complete. Over-blocking is counted as failure, so a
block-everything policy cannot win — a kernel that scores full marks by refusing
everything has built a nuisance, not a privacy tool.

**Three probes are expected to fail**, and they are marked as such: a condition
described without naming it, a credential relayed in words, and fields that
identify someone only in combination. Those need judgement, which is what the
model tier is for.

Encoding and field-splitting used to sit in that group and are now caught
deterministically — base64, hex and URL-encoded values are decoded and
re-checked, and neighbouring fields are joined so a number split in two is still
a number. The probes stayed in the suite, because a benchmark that drops what it
has beaten cannot catch a regression, and three harder ones took their place. A
suite you score full marks on is a suite written to flatter you.

**What it cannot measure.** Whether the user would have said yes. `cautious`
ties `balanced` here while asking nothing, because blocking and asking look the
same to a probe — but only one of them leaves the user a choice.

## The model tier

`check()` is synchronous and deterministic. `checkDeep()` puts a model behind
it, for the cases patterns cannot reach.

```js
import { checkDeep } from 'privacy-constitution';

const result = await checkDeep(call, constitution, {
  ask: async (prompt) => (await client.messages.create({ ... })).content[0].text,
  cache: new Map(),
});
```

Four properties, and they are all about not becoming the reason someone turns
the kernel off:

- **It runs last**, only on what the deterministic pass could not place, so most
  calls never reach it.
- **It is cached** by the shape of the flow, so an identical second call is free.
- **It only ever adds findings**, so it can make a decision stricter and never
  looser. A model outage cannot become a leak.
- **It never sees the constitution and never picks an outcome.** It answers one
  narrow question — what personal data is in this payload — and the rules decide
  what happens. Keeping policy out of the prompt is what stops a prompt
  injection in the payload from rewriting the user's privacy rules.

Excerpts the model returns are checked against the payload before use. A model
that invents a string would have us redact something that is not there, or
mangle something that is.

The `ask` function is any provider. The kernel deliberately does not know which,
so a constitution enforced with Claude behaves the same as one enforced with
GPT.

## Portability, which is the whole claim

Same constitution file, two runtimes, neither aware of the other:

```bash
node examples/portability.js
```

```
  Put the appointment in my calendar
    agent proposes  {"title":"Appointment","start":"2026-09-11T14:00+02:00","notes":"Physio, lower back injury"}
    Claude Code     minimized  {"title":"Appointment","start":"2026-09-11T14:00+02:00"}
    OpenAI SDK      minimized  {"title":"Appointment","start":"2026-09-11T14:00+02:00"}
    identical
```

The weaker claim is that both refuse the same things — a blocklist could do
that. The claim worth making is that both send *the same smaller payload*, and
`test/portability.test.js` asserts exactly that rather than a hard-coded
expectation, so the pitch cannot quietly stop being true.

```js
import { guardAll } from 'privacy-constitution/adapters/openai-agents.js';

const agent = new Agent({
  tools: guardAll([bookAppointment, createEvent], {
    // The SDK has no notion of what a tool talks to -- a function called
    // `send_email` could reach anything -- so declaring it is how a rule about
    // healthcare services finds its target.
    recipients: {
      book_appointment: { name: 'Doctolib', sector: 'healthcare', trust: 'known' },
      create_calendar_event: { name: 'Google Calendar', sector: 'productivity', trust: 'known' },
    },
  }),
});
```

**Proven through the SDK's own runner, with no API key.** The SDK lets you plug
a `Model`, so `test/openai-agent.test.js` scripts one that returns a fixed tool
call. That exercises the real agent loop — tool dispatch, result handling — with
no network and the same result every time, which matters because a demo that
depends on venue wifi is a demo that fails. Swapping the scripted model for
`'gpt-4o'` is the only change needed to run it against a real model.

Two things that cost an hour and are worth knowing if you extend this:

- `run(agent, input, { model })` is *not* where model resolution reads from. Set
  `model` on the `Agent` or it reaches for a real key regardless.
- Tracing exports to OpenAI by default and wants a key even when the model is
  local. `setTracingDisabled(true)`.

**Redaction versus strict schemas.** The kernel removes a redacted key outright,
which is right — a key present with a placeholder still announces that something
was withheld. But this SDK validates arguments against the tool schema, and a
strict schema marks every property required, so a removed key fails validation
and the tool never runs. That reads as the privacy tool breaking the agent. The
kernel stays runtime-agnostic; the adapter puts required keys back as `null`,
which carries no value while satisfying the schema.

**Why this wraps tools rather than using the SDK's own guardrails.**
`defineToolInputGuardrail` can allow, reject, or throw — it cannot rewrite the
call. Block and ask would work; redact and substitute would not, and those are
the outcomes the design rests on. A guardrail that can only refuse turns a
privacy tool into a nuisance. `constitutionGuardrail` is exported anyway for
anyone who wants the native integration and is content with block and ask.

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

Build order is in [`../BRIEF.md`](../BRIEF.md#build-order). **All eight items are
done.**

What is worth doing next, in rough order of value to the demo:

1. A clean Act 0. `scan` currently reads history contaminated by this project's
   own test fixtures — run it on a longer window, or from a machine that was not
   used to build this.
2. A live run against a real model. Everything is proven with a scripted model;
   swapping in `'gpt-4o'` is one line and about ten minutes with a key.
3. The model tier above the deterministic pass, which is what would close the
   two evasion probes.
