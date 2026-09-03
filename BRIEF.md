# Privacy Constitution

A pre-tool-call kernel that checks every outbound flow from a personal AI agent
against a portable set of rules the user never had to write, and lets the task
succeed with less data.

Built for the **Agentic AI: Making Privacy Native to Personal Agents** track.

> **This is the working document.** Edit it directly — pencil icon, top right.
> Anything worth arguing first goes in an [issue](../../issues) instead.
> How the pieces fit together is in the [README](README.md).

## The idea in four sentences

When a personal agent acts for you, every tool call is a data transfer, and
nobody checks any of them. The agent has become a data controller that was never
told the rules. So put a check in front of the tool call: the runtime hands each
call to a kernel, the kernel evaluates it against your constitution, and only
then does it go out.

Every previous attempt at this (P3P, Do Not Track) asked the *recipient* to
behave, and the recipient didn't. This enforces at your own boundary, before the
data leaves, so nobody's cooperation is required.

## What's in here

1. [Concept](#concept) — the thesis, the five outcomes, the interruption menu
2. [The constitution](#the-constitution) — the policy file, onboarding, the rule taxonomy
3. [Demo arc](#demo-arc) — the three minutes, and what we measure
4. [Evidence](#evidence-for-the-opening) — real incidents, and what a judge will ask
5. [Build order](#build-order) — what we build first, and the calls still open

---

## Concept

### The thesis

When a personal agent acts for you, every tool call is a data transfer. Today
nobody checks any of them. The agent has become a data controller that was never
told the rules.

The fix is a check placed **in front of** the tool call, not behind it. The
agent's runtime hands each call to a kernel, the kernel evaluates it against the
user's constitution, and only then does the call go out. Post-hoc detection
gives you an incident report, not privacy.

#### Why this isn't Do Not Track again

Three earlier attempts failed the same way, and it is worth knowing the
graveyard because it is our best pitch line.

**P3P** (W3C, ~2002) had sites publish a machine-readable description of their
own data practices, which your browser compared against your preferences.
Internet Explorer shipped it. It failed because sites declared their own
practices and nobody verified. Sites learned to send junk tokens purely to get
past IE's cookie blocking, and Google was fined for exactly that in 2012. W3C
obsoleted it in 2018.

**Do Not Track** (~2009) was radically simpler: one HTTP header meaning "don't
track me." Every major browser shipped it. Almost nobody honored it, because
honoring it was voluntary and expensive. The working group closed in 2019 with
nothing standardized.

**Global Privacy Control** (~2020) is DNT again, but California's AG ruled CCPA
obliges businesses to honor it. It partially works, in California, because law
supplies the teeth.

All three made the same bet: express a preference, then rely on the recipient to
respect it.

**This design does not make that bet.** The check happens at your own boundary,
before the data leaves, so the counterparty's incentive to defect is irrelevant.
That is the sentence the pitch opens with.

#### The honest limit

State this before a judge finds it: coverage extends only to flows that pass
through the interception point. An agent using a channel we didn't wrap is
invisible to us. The tool boundary is a chokepoint by construction in these
runtimes, which is why it is the right place to sit, but the dashboard reports
coverage rather than claiming totality.

---

### Five outcomes, and block is the rare one

A kernel that only blocks is a nuisance, and the demo dies the moment the agent
stops working. The product thesis is minimization: **the task completes, with
less of you in it.**

| Outcome | What happens |
|---|---|
| **Allow** | The flow matches a rule that permits it. No interruption, logged for the summary. |
| **Redact** | Strip the offending fields, send the rest. The default outcome and the one the cursor lands on. |
| **Substitute** | The field is mandatory, so send a masked value. Relay address, alias email, virtual number. |
| **Ask** | Genuinely ambiguous. Hold the call, put the decision to the user, write a rule from the answer. |
| **Block** | A hard rule fired. Credentials, special categories to advertising. Should be uncommon. |

**Substitute is what stops users capitulating.** Some services genuinely require
a phone number, so redaction breaks the task and the only way forward is to
allow. A relay number means the task succeeds and they still do not have you.
Hide My Email and virtual cards already normalized this, so it needs no
explaining on stage.

#### What redaction looks like

```
agent → calendar.events.create
{
  "title":    "Appointment",
  "start":    "2026-09-11T14:00+02:00",
  "notes":    "Physio, lower back injury, ref #A2213"   ← removed
  "attendee": "+32 470 88 21 04"                        ← removed
}

REDACT  2 fields removed
        rule: health never reaches calendars
        task outcome: event still created
```

#### Speed

If every call waits on a model we add seconds to everything and the tool becomes
unusable. Run a fast deterministic pass first, on patterns, known field names
and known recipients, which resolves most calls. Escalate only the ambiguous
remainder to a model, cached by flow signature. This is also the concrete answer
when someone asks how it scales.

---

### The interruption is where the constitution gets built

The questionnaire is guessing. The moment of a real hold is the only time the
user has full context on what they actually want, so this screen deserves the
most design time and the most seconds on stage.

```
HELD  opentable.reserve wants phone_number
      recipient: opentable.com · first contact, you have not used this before
      rule hit:  contact details need approval for services you have not used

  ▸ Redact and send          booking succeeds, they get no number
    Substitute a relay number  booking succeeds, they get a mask
    Allow once                 this call only
    Allow for this recipient   opentable.com, any future call
    Allow for this task type   restaurant booking, any site
    Allow for the next hour    expires 15:42, then reverts
    Never                      writes a deny rule

  writes rule → redact phone_number from opentable.com; retry without it
```

Four things make this work.

**The rule preview updates live as the cursor moves.** "Allow for this task
type" means nothing on its own. The line underneath resolves it to
`allow phone_number to restaurant booking sites`, and one row up to
`allow phone_number to opentable.com only`. The user is picking a rule with a
visible width, not a vibe.

**Every option states its consequence.** "Block: the booking fails." "Redact:
the booking still works." Without that, every prompt is a scare prompt and
people click through. With it, redact is obviously attractive, which is where we
want them.

**Ordered narrow to broad, cursor defaulted to redact** whenever redaction still
lets the task succeed. People pick the first thing. If "allow always" is one
keystroke away the constitution collapses to permit-everything inside a week,
which is exactly how the earlier standards died.

**Temporary grants expire visibly.** "Allow for the next hour" only builds trust
if the session summary later reports `3 temporary grants expired`. Otherwise
people assume it quietly became permanent.

Six options is the ceiling for something read mid-task. Show redact, substitute
and never by default, with the rest behind an expand. Fewer choices means faster
decisions, which is the fatigue number we're measuring.

---

## The constitution

### It is two artifacts, not one

Conflating these will bite us, so split them at the file format level from the
start.

**Your personal constitution is itself sensitive.** A rule reading "never
disclose my HIV status" leaks the fact by existing. It stays local, always. No
account, no upload, no hosted copy. A service that centrally stores everyone's
privacy preferences is the exact thing this project argues against, and a judge
will say so out loud.

**A template is the shareable thing.** Generic rules, no personal facts. EU
Cautious. Healthcare worker. Journalist, source protection. Parent. Someone
protecting sources has genuinely different needs from a doctor, and those
profiles carry no facts about anyone, so they ship safely.

```
$ npx privacy-constitution init --profile journalist

  installed  journalist@1.2.0        34 rules
  installed  eu-baseline@2026.1      18 rules, inherited
  local      ~/.constitution/        personal layer, never uploaded
```

A privacy NGO publishes a GDPR-strict baseline. An employer publishes one for
staff. That is a better answer to "how does this scale" than offering to host
it.

### Layering

Four layers, merged with **most specific winning, and deny beating allow at
equal specificity**. Write that resolution order into the file so a fired rule
can always be explained.

| Layer | Source | Mutable by | Shareable |
|---|---|---|---|
| **Template** | `journalist@1.2.0` | Publisher, versioned | Yes |
| **Organisation** | Employer policy | Admin | Within the org |
| **Personal** | Questionnaire, inference, free text | The user | No |
| **Session** | Grants made mid-task | The user, expires | No |

### Two things to build into the format now

**Provenance on every rule.** Template, questionnaire, inferred from history,
typed by the user, granted mid-task. This makes `export --as-template` a
one-liner: drop everything tagged personal, keep the rest. The tool minimizing
its own output is a good beat in the demo.

**A plain English line next to every rule.** The user has to be able to audit it
and a judge has to be able to read it projected.

```yaml
- id: health-not-to-calendars
  says: "Health details never reach a calendar or notes app."
  data: [health]
  recipient: { class: [productivity, storage] }
  outcome: redact
  provenance: { source: questionnaire, q: 3, at: 2026-09-03T09:14Z }

- id: no-credentials-anywhere
  says: "Keys and secrets never leave this machine, including into prompts."
  data: [credentials]
  recipient: { class: ["*"] }
  outcome: block
  provenance: { source: template, from: eu-baseline@2026.1 }
```

Skip signing for the hackathon, but say the word once in the pitch. "Templates
are content-addressed and signable" tells the room we know where this goes
without spending an hour on it.

---

## Onboarding without a thirty-question form

A questionnaire is a form, and forms are where good intentions die. Two rules
keep it alive.

**Ship presets, then only ask where the presets disagree.** Cautious, Balanced,
Open. Most rules are identical across all three. Surfacing only the contested
ones cuts us to six or seven questions instead of thirty.

**Ask about situations, not fields.** "Your agent found a service you have never
used and wants to send it your email address" is answerable. "Do you permit
category CONTACT" is not.

| # | Question | What it sets |
|---|---|---|
| 1 | A tool asks for something the task does not need. Send it anyway? | Minimization default |
| 2 | Your agent found a service you have never used. Allow, ask, or block? | Unknown recipient |
| 3 | Should health details ever land in your calendar or notes? | Health handling |
| 4 | Your agent summarises an email thread with an external tool. Strip other people's names and numbers? | Third-party subjects |
| 5 | Should your location stay shared after the delivery arrives? | Time-bounded consent |
| 6 | Can secrets and keys go into a prompt? | Credentials, and the model provider as a recipient |
| 7 | How often are you willing to be interrupted? | Interruption budget |

Question 7 is not a privacy question, and it earns its place anyway. It sets a
budget the user chose, which the dashboard then measures against instead of
inventing a target.

### Graded options, not checkboxes

Checkboxes force binary allow or deny, which throws away the recipient axis. A
five-point select per data type keeps it, and maps straight onto the outcomes.

```
  health      Never  ·[ Ask every time ]·  Used before  ·  When needed  ·  Always
  location    Never  ·  Ask every time  ·[ Used before ]·  When needed  ·  Always
  phone       Never  ·  Ask every time  ·  Used before  ·[ When needed ]·  Always
  email       Never  ·  Ask every time  ·  Used before  ·[ When needed ]·  Always
  credentials[ Never ]· Ask every time  ·  Used before  ·  When needed  ·  Always
```

Do not run ten sequential prompts for ten data types. The preset fills
everything, then one review screen shows all types with their current setting
and the user changes only what they care about. Three screens total: pick a
preset, review the table, adjust.

### Free text is where the model earns its place

The user types "never tell anyone I am pregnant" or "my work email can go
anywhere, my personal one cannot," and the model compiles it into structured
rules. Two things have to be right.

**Show the compiled rule before saving it.** Silent misinterpretation of a
privacy rule is worse than having no rule at all.

**Test it on the spot.** Run it against two or three sample flows and show what
would happen. "With this rule, that calendar entry would have been redacted."
Ten seconds, and it feeds the measurability story directly.

Per-destination rules use the same mechanism. "For this endpoint, only name and
email, nothing else" is just a rule with the recipient pinned.

---

## Rule taxonomy

Every rule has the same shape: **data type, recipient class, purpose.** Getting
those three axes right is what keeps the questionnaire short, because one good
question sets a whole row.

| Axis | Values |
|---|---|
| **Data type** | Identity · contact · location · health · financial · credentials · other people's data · special categories (religion, politics, sexuality, union membership — all GDPR Article 9) |
| **Recipient class** | This machine · your model provider · a service you have a relationship with · a service for this one task · a service the agent found by itself · public |
| **Purpose** | Complete the task you asked for · storage and memory · improvement and training · marketing · unclear |

The class people forget is the second one. **Your model provider is a
recipient.** Everything in context goes there, so the constitution needs an
opinion on what enters the prompt, not only on what leaves in a tool call. It is
cheap to demo and it reframes the whole problem.

### Rules that demo well

| Rule | Outcome | Why it lands |
|---|---|---|
| Credentials never leave the machine. Keys, tokens, `.env`, SSH. To anyone, including the model provider. | Block | Instant, unarguable, easy to trigger live |
| Precise location only to a service actively delivering to you, only while it is delivering. | Ask | Introduces time-bounded consent, which nobody else will have |
| Health never to a calendar, a notes app, or long-term agent memory. Healthcare recipients only. | Redact | The scenario everyone recognises |
| Salary history never to a recruiter or employer. | Block | Illegal to ask in several US states, so the rule has legal backing |
| Other people's contact details get stripped before any third-party tool. | Redact | The third-party subject problem, which the track cares about and few teams will touch |
| Special categories never to advertising or analytics. | Block | Straight out of GDPR Article 9, no ask, no override |
| Nothing to a recipient the agent chose rather than you. | Ask | General, and specific to agents. "You did not pick this destination" is a strong signal on its own |
| Mandatory contact fields get a mask, not the real value. | Substitute | The task completes and they still do not have you |

---

## Demo arc

Three minutes. The times are the discipline, not a suggestion. **One scenario
throughout**, because breadth reads as unfinished.

Each act below is roughly one slide.

### 0:00–0:20 · The shock

A report generated from real agent history. "340 tool calls last month. 61
carried personal data. My address went to four services, my phone number to
six." No setup, no live model call. Have the kernel redact its own report on
screen, so minimization is visible in the first twenty seconds.

> Proves **the problem is real** before anyone asks.

### 0:20–1:00 · The rules

The tool reads that same history and proposes rules in plain language. "You have
shared your address with delivery services twelve times and nothing else. Rule:
address goes to logistics only." Accept two, edit one.

> Answers **who writes the policy** — nobody does, it is inferred.

### 1:00–2:00 · The proof

Inbox triage. The agent reads your inbox to plan the week and finds a
colleague's email containing a third party's phone number, a medical appointment
confirmation, and a newsletter carrying a hidden instruction. It writes to your
shared work calendar and emails the clinic. Same data, different destinations,
treated differently. One decision escalates, you answer once, the answer becomes
a rule. **The booking completes.**

> Proves **contextual integrity** — your data, someone else's data, multiple
> destinations and an injection vector, in one scene.

### 2:00–2:25 · Portability

Same constitution file, dropped into an OpenAI Agents SDK agent. Different
runtime, different code, same enforcement. Ten seconds of screen for the entire
thesis.

> Proves it is **a standard, not a plugin**.

### 2:25–2:55 · The number

24 scripted probes against both agents. Unprotected leaks on 17, with the kernel
2. On the live task, 14 fields were available and 3 were sent.

> Leaves them with **a benchmark, not just a tool**.

### Close

P3P and Do Not Track both asked the other side to behave, and the other side did
not. This checks before the data leaves your machine, so nobody's cooperation is
required.

---

### Two production notes

**Cache everything.** Venue wifi plus live model calls is how hackathon demos
die. Record the model responses, replay them deterministically, and run it as a
live script. Nobody can tell, and nothing breaks.

**What to cut if we run long.** Portability shrinks to holding up the file and
saying the sentence. What cannot be cut is the proof scene and the number.

---

## Measurement

Most teams will ship a tool. Shipping a *number* is what gets written down.

**Minimization ratio.** Fields available versus fields sent, per task. Kernel
off against kernel on, same task, both completing.

**Conformance score.** A battery of scripted probes designed to tempt a leak,
run against any agent, scored against a given constitution. That is a benchmark,
not a tool, and it applies to agents we did not build.

### The chart to lead with

Redactions per day going **up** while interruptions per day go **down**. It
answers the objection every judge is already forming: a privacy tool that
interrupts you forty times a day is dead on arrival.

> It does more and bothers you less. That is the product in one graph.

### Dashboard panels

- **Blocked and redacted, grouped by rule rather than by call.** "Rule:
  credentials never leave. Fired 4 times." Reads as a system working, not as a
  log.
- **Near misses.** Flows allowed that came close to a line. Shows the kernel is
  watching, not just gating.
- **Interruptions against the budget the user set.** "You asked for at most 3 a
  day. Today was 7."
- **Rules added this session, by provenance.** Questionnaire, inferred, or
  granted mid-task. Hurried grants get flagged for review, because a rushed
  "allow always" is the main way this decays.
- **Top recipients.** Who actually gets the most of you. Usually surprising.
- **Coverage.** Share of tool calls that passed through the kernel. Being honest
  about our own blind spot reads as maturity.
- **Constitution strength.** The conformance score as one panel: 22 of 24 probes
  held.

The single most valuable line in the whole summary is not a metric. It is
**"three of today's interruptions were the same decision, one rule covers all of
them, want it?"** That turns fatigue from a number we report into a problem we
fix.

---

## Evidence for the opening

Three categories, each mapping to something the kernel fixes.

> **Check every date and detail before it reaches a slide.** These are recalled
> from memory and need verifying against a primary source.

### The agent was steered by someone else

- **EchoLeak**, mid-2025. A zero-click flaw in Microsoft 365 Copilot where a
  crafted email could make Copilot exfiltrate the user's own data with no click
  required. Found by Aim Security, CVE-2025-32711.
- **AgentFlayer**, Black Hat 2025. Zenity showed a poisoned document in Google
  Drive causing ChatGPT Connectors to leak secrets out of the user's own
  account.

> The agent cannot police itself, because the attacker writes to the same
> channel as the user.

### The user overshared without knowing

- **Meta AI's Discover feed**, 2025. Users' conversations appeared publicly,
  including medical and legal questions, with many apparently unaware.
- **Shared ChatGPT conversations indexed by Google**, 2025. Links people shared
  privately became searchable. OpenAI pulled the feature.
- **Samsung**, 2023. Engineers pasted proprietary source into ChatGPT and
  Samsung banned it internally.

> People do not know what is leaving.

### The assistant collected data about people who never agreed

- **VRT NWS**, July 2019. A contractor leaked over a thousand Dutch-language
  Google Assistant recordings, including some captured without a wake word. A
  Belgian story, which will land locally.
- **Bloomberg**, April 2019. Amazon contractors listening to Alexa clips.

> The third-party subject problem. Your agent holds other people's data.

### The one to actually show live

Grep your own agent transcripts for personal data that went to a model provider.
Everyone in that room has that on their laptop right now, and none of them have
looked.

---

## What a judge will ask

**"Is this not just Do Not Track?"**
No, and the difference is structural. DNT expressed a preference and relied on
the recipient. This enforces at your own boundary, before egress, so cooperation
is not required.

**"Will people not just click allow?"**
Some will, which is why the menu is ordered narrow to broad, defaults to redact,
and why hurried grants get surfaced for review in the summary. Interruptions per
day is on the dashboard for exactly this reason.

**"What about flows you do not see?"**
Out of scope, and reported rather than hidden. Coverage is a dashboard panel.
The tool boundary is a chokepoint by construction in these runtimes, which is
why it is the right place to sit.

**"Does it not slow every call down?"**
Deterministic pass first on patterns, field names and known recipients, which
resolves most calls in microseconds. Only the ambiguous remainder reaches a
model, and those results are cached by flow signature.

**"Where do you store my rules?"**
On your machine. Nowhere else. Only templates, which carry no personal facts,
are ever published.

---

## Build order

Reverse of the demo order, sorted by risk. Nothing downstream matters if the
first item does not work.

| # | Item | Why here |
|---|---|---|
| 1 | Interception hook with a hardcoded constitution. Claude Code `PreToolUse` is the fastest real enforcement point. | If this does not work, nothing else matters |
| 2 | The inbox triage scenario running through it, allow and redact only. | Proves the outcome model end to end |
| 3 | Minimization ratio. | Nearly free once the hook exists, and it is a demo number |
| 4 | The hold menu with the live rule preview. | The product's central interaction |
| 5 | Onboarding: preset, review table, free-text rules. | `@clack/prompts` gets us there fast |
| 6 | History inference and the session summary. | The first two acts both depend on it |
| 7 | The OpenAI Agents SDK adapter. | Thin, and it is the portability proof |
| 8 | The 24-probe conformance suite. | The closing number, and the thing nobody else has |

`@clack/prompts` for the questionnaire, Ink for a live dashboard view if we get
that far, and one bordered alert idiom for holds and redactions so the whole
thing reads as one product.

### Why Claude Code first, and why it is not the pitch

Claude Code already has the enforcement point we need: `PreToolUse` hooks
inspect a tool call and can deny it before it runs. So it demos on a judge's own
laptop today.

But we pitch the **portable constitution**, not the package. An npm package for
Claude Code is plumbing, and at an OpenAI hackathon it is plumbing for a
competitor's product. Build a second thin adapter for the OpenAI Agents SDK,
show the same policy file enforced in both, and that side-by-side *is* the
portability proof.

One mismatch to be honest about: Claude Code is a coding agent and the track is
personal agents. The bridge is connectors — Claude Code with Gmail, Drive and
Calendar attached *is* a personal agent. Demo it that way, not with source
files.

---

## Open calls

These are the decisions still unmade. **If you have an opinion, edit it in here
rather than keeping it in your head.**

#### Demo data — real history or a synthetic persona?

Real is more credible and it is why the opening works. The cost is exposing
yourself on stage. Middle path: real history with the kernel doing the redaction
live, which turns the problem into the feature.

*Current lean:* real, with live redaction.

#### Does the room expect OpenAI-stack usage?

If it does, the OpenAI adapter moves up the build order and becomes the primary
rather than the proof.

*Unresolved.*

#### The name

Unclaimed. It appears in the `npx` line, which is on screen for most of the
demo, so it is worth ten minutes.

*Unresolved.* `privacy-constitution` is the working title, not a decision.

#### Scope of the third-party subject problem

Your inbox is full of data about people who never agreed to your agent reading
it. We have a rule for it (strip other people's contact details) but not a
story. Worth at least a sentence in the pitch even if we do not solve it.

*Unresolved.*
