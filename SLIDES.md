# Slides

Four slides, three minutes. The spoken lines are drafts, not a script to read.

> **This is an editable document.** Pencil icon, top right. Same rules as
> [BRIEF.md](BRIEF.md): edit when it's plainly wrong, open an
> [issue](../../issues) when it's worth arguing.

## Why four and not five

The demo arc in the brief has five acts. Portability and the number share a
slide here, because they answer the same question, which is whether this is more
than one team's demo. Portability says the policy outlives the runtime. The
number says the effect is measurable. Neither fills a slide alone, and the brief
already names portability as the first thing to cut when we run long. On a
shared slide it survives as one sentence instead of getting dropped.

| Slide | Act | Budget | Answers |
|---|---|---|---|
| 1 | Without this | 0:00–0:25 | Is the problem real? |
| 2 | privacy.md | 0:25–1:05 | Who writes the rules, and why is it a file? |
| 3 | Enforcement, and the proof | 1:05–2:05 | Does it work, and does the agent still work? |
| 4 | It travels, and here is the score | 2:05–2:55 | Is this a standard or a plugin? |

One scenario runs through slides 2, 3 and 4. Breadth reads as unfinished.

---

## Slide 1 · Without this

**Headline:** Every tool call is a data transfer. Nobody checks any of them.

### On screen

A report generated from real agent history, mine, from last month.

This is `privacy.md scan --days 30`, which already exists. It reads the agent
transcripts sitting on the laptop, with no setup and no model call, and prints:

```
  What your agent sent, and what it did not

  calls checked        340
  fields available     412
  fields sent          351
  withheld              61   (15% minimized)
  interruptions          0

  Rules that fired
     18  health details only go to a healthcare provider
     11  other people's contact details are stripped
      4  keys and secrets never leave this machine

  Who your agent talked to
     73  Google Calendar
     41  Gmail
     12  bpost
```

The report redacts itself by construction, not as a stage trick. `history.js`
reports counts and kinds and never the values, because a leak report that quotes
your secrets back at you on a projector is its own incident. Say that out loud.
"Who your agent talked to" is the panel that surprises people, so it stays up
longest.

### Said out loud

I went through my own agent history from last month. 340 tool calls. 61 of them
carried personal data off my machine. My address reached four services, my phone
number six. I did not approve any of them, because nothing asked.

Every tool call an agent makes is a data transfer. Your agent has become a data
controller that was never told the rules.

### What it proves

The problem is real, and it is measured on the laptop I am holding rather than
argued from a slide. Redacting our own report in the first twenty seconds also
shows minimization before we have explained it.

### Notes

No live model call here. Generated ahead of time and replayed.

**The one real dependency on this slide.** `report` reads the ledger, and the
ledger only has entries once the hook has been running. So a retrospective over
"last month" cannot come from it. Either the hook runs in observe-only for long
enough to fill the ledger, or something makes one pass over the agent
transcripts already on disk. Neither exists as a command today, and this slide
does not work without one of them.

The honest version of this slide is the strongest one, so the numbers have to be
my real numbers. If a field is too exposing to show, the kernel redacting it on
screen is the point rather than a problem.

---

## Slide 2 · privacy.md

**Headline:** `AGENTS.md` tells an agent how to work. Nothing tells it what it may send.

### On screen

Open on the file every runtime in the room already reads, then the one none of
them do:

```
  AGENTS.md     read by 30+ runtimes . 60,000+ repos . Linux Foundation
                "run the tests with npm test"
                "the API layer lives in src/api"

  privacy.md    read by none of them
                ?
```

Then the file, written the way a person would write it:

```markdown
  # privacy.md

  Health details only go to a healthcare provider.
  My address goes to delivery services and nowhere else.
  Keys and secrets never leave this machine, including into prompts.
  Other people's contact details get stripped before any third-party tool.
  Never tell anyone I am pregnant.
```

Then compile it, on screen, and show what the kernel actually evaluates:

```yaml
  - id: health-only-to-healthcare
    says: "Health details only go to a healthcare provider, never anywhere else."
    data: [health]
    recipient: { trust: [known, task_scoped, agent_chosen, public, model_provider] }
    outcome: redact
    provenance: { source: written, line: 3 }
```

And where it came from, for the rules nobody typed:

```
  You have sent your address to delivery services 12 times
  and to nothing else.

    → address goes to logistics only              [accept] [edit] [skip]
```

Underneath, the four layers:

```
  template       journalist@1.2.0      published, versioned, no personal facts
  organisation   employer policy       admin, within the org
  personal       your privacy.md       local only, never uploaded
  session        granted mid-task      expires
```

### Said out loud

Every agent runtime in this room already reads a markdown file to learn how to
work in your repo. Thirty of them read `AGENTS.md`. Sixty thousand repositories
have one. The Linux Foundation stewards it now.

Not one of them reads a file to learn what it may send out. That is the file.

You write it in English, one rule per line. It compiles to what the kernel
evaluates, and I am showing you both because the compiled form is the one that
runs, deterministically, in front of every call. Nothing reads prose at
tool-call time.

Nobody sits down and writes a privacy policy for themselves, so most of these
lines you never type. The tool reads what you have already done and proposes
them. Accept, edit, skip. Six questions where the presets disagree, and that is
onboarding.

Your own file is itself sensitive. A line that says "never disclose my HIV
status" leaks the fact by existing, so it stays on your machine, always. No
account, no upload. What travels is a template: generic rules, no facts about
anyone. A privacy NGO publishes a GDPR baseline. Your employer publishes one for
staff.

### What it proves

That this is a convention rather than a product. `AGENTS.md` spread because it
was a filename anyone could implement and nobody owned, and this is the empty
slot beside it.

It also answers where the policy comes from, which is the first thing anyone
asks, and it shows we are not building the centralised store of everyone's
privacy preferences.

### Notes

**Compile it live or lose the thesis.** A name ending in `.md` invites the
assumption that a model reads prose in front of every tool call, which would
undo both claims the whole pitch rests on: deterministic, and before the call.
Ten seconds of showing `privacy.md` become `rules.yaml` kills that assumption
permanently. `kernel/freetext.js` already does the compiling, offline, with no
key and no network.

The free-text line is the one to demo. Type "never tell anyone I am pregnant",
show the compiled rule before it saves, then run it against two past flows and
show what would have happened. A misinterpreted privacy rule on stage is worse
than no rule, so it only earns the time if it is solid.

`asTemplate()` already drops every personal rule and keeps the rest, which is
the tool performing on its own output the same minimization it performs on every
tool call. A free beat if there is room.

---

## Slide 3 · Enforcement, and the proof

**Headline:** The check runs before the call, never after.

### On screen

The path a call takes, with the kernel in front of it:

```
  agent proposes a call
        |
        v
  +-------------------------------------------+
  |  KERNEL   runs BEFORE the call goes out   |
  |  1. deterministic pass   most calls, us   |
  |  2. model, only if unclear    cached      |
  +-------------------------------------------+
        |
        v
  allow . redact . substitute . ask . block
```

Then the scenario. The agent reads the inbox to plan the week and finds three
things: a colleague's mail carrying a third party's phone number, a medical
appointment confirmation, and a newsletter with an instruction hidden in it. It
wants to write to the shared work calendar and mail the clinic.

```
  calendar.events.create
  {
    "title":    "Appointment",
    "start":    "2026-09-11T14:00+02:00",
    "notes":    "Physio, lower back injury, ref #A2213"   removed
    "attendee": "+32 470 88 21 04"                        removed
  }

  REDACT   2 fields removed
           rule: health details only go to a healthcare provider
           the event was still created
```

One call escalates. The hold does not draw a menu, because the hook runs as a
subprocess with no terminal of its own. It hands the menu back to the agent, and
the agent asks you in the conversation you are already in:

```
  Held by your privacy constitution before this reaches clinic.example.
  You did not pick this destination, the agent did.

    · anything personal going to a service you have never used
      needs a decision

  1. Redact and send
     the call still works, clinic.example gets no contact details
     writes the rule: Your contact details are stripped before
                      anything reaches clinic.example.
  2. Send a masked value
     the call still works, clinic.example gets a relay rather than
     the real thing
     writes the rule: Your contact details reach clinic.example
                      only as a mask.
  3. Allow once
     this call only, nothing is remembered
     nothing is remembered
  ...
  7. Never
     your contact details will never reach clinic.example; calls
     that need it will fail
     writes the rule: Your contact details never reach clinic.example.

  Then run: npx privacy.md decide 7f3a91 2
```

You answer in the conversation. The command records it:

```
  $ npx privacy.md decide 7f3a91 2

    Send a masked value -- the call still works, clinic.example gets a
                           relay rather than the real thing
    rule added: Your contact details reach clinic.example only as a mask.
    ~/.privacy/privacy.md

    Retry the call. The constitution now covers it.
```

The menu is a data structure, not a screen, and that is why it has two
surfaces. Relayed through the agent it is a numbered list with every rule shown
at once. Answered at your own terminal, `privacy.md decide 7f3a91` with no number gives you
an arrow-key picker with the rule previewing as the cursor moves. Same
`menuFor()` behind both.

Either way the width of the grant has to be readable before it is taken. "Allow
for clinic.example" and "Allow for healthcare services" look almost identical
until you see that one names a host and the other names a sector.

### Said out loud

If the check runs after the call, the data has already left, and what you have
built is an incident report. So the kernel sits in front. The agent proposes,
the kernel decides, and only then does anything leave the machine.

Same data, different destinations, treated differently. The health detail is
fine with the clinic and stripped from the calendar. The colleague's phone
number belongs to someone who never agreed to my agent reading their mail, so it
does not go anywhere. The hidden instruction in that newsletter is not my
instruction, and the kernel does not care who asked, only where the data is
going.

One decision needed me, and it needed me because the agent picked that
recipient rather than I did. Notice where it asked. Not in a popup and not in a
terminal, but in the conversation I was already having, because the hook has no
screen of its own and does not need one. I picked the mask. That wrote a rule to
my constitution, and the booking completed.

It will not ask me again.

Block is the rare outcome. The default is redact, and the task completes with
less of you in it.

And when redaction would strip the call down to nothing, the kernel does not
send an empty request and call that a privacy win. It escalates to you instead,
because a broken call dressed up as policy is how you lose the user in week
one.

### What it proves

Contextual integrity, in one scene: my data, someone else's data, several
destinations, and an injection vector. And that the agent still finishes the
job, which is the thing that kills every privacy tool that only blocks.

### Notes

This is the act that cannot be cut. Everything else can shrink.

Give the hold real seconds. Seven options with their rules is a lot of text on
screen, and the temptation is to cut it down. Do not. Reading two grants side by
side and seeing that one of them is four times wider is the moment the word
"constitution" earns itself.

The colleague's phone number is the third-party subject beat. It is one
sentence, and few teams will touch it.

---

## Slide 4 · It travels, and here is the score

**Headline:** One `privacy.md`, every runtime.

### On screen

Split screen, one file, two agents:

```
              ~/.privacy/privacy.md
        |                        |
        v                        v
  Claude Code               OpenAI Agents SDK
  PreToolUse hook           tool-call middleware
        |                        |
        v                        v
  REDACT  health            REDACT  health
          healthcare only           healthcare only
```

Then the score:

```
  CONFORMANCE          24 scripted probes, same battery, both agents

    unprotected        leaked on 17
    with the kernel    leaked on  2

  MINIMIZATION         the live task, both runs completed

    fields available   14
    fields sent         3
```

### Said out loud

Same `privacy.md`, dropped into an agent built on a different stack, by
different people, in different code. Same enforcement. The policy is yours, and
it outlives whichever agent you happen to be using.

Two things port, not one. The rules port, and so does the interaction. The hold
never assumed a screen. It hands the agent a numbered list and takes the answer
back as a command, so it works in anything that can run one. We did not build a
privacy UI, which is why there is no privacy UI to port.

Then the number. 24 scripted probes designed to tempt a leak, run against both
agents. Unprotected leaked on 17. With the kernel, 2. On the live task, 14
fields were available to send and 3 went out, and both runs completed.

That battery scores any agent against any constitution, including agents we did
not build.

And the portability claim is not a promise, it is a test. `portability.test.js`
drives both adapters the way their runtimes do and compares them against each
other. If the two ever disagree on the same flow, the build fails and this slide
is wrong.

### Close

P3P asked websites to declare their own data practices, and they declared
whatever got them through. Do Not Track asked them to honour a header, and
almost nobody did. Both made the same bet, which was to express a preference and
trust the other side.

This checks before the data leaves your machine. Nobody's cooperation is
required.

### What it proves

That this is a standard and a benchmark rather than a plugin. The conformance
suite is the part that outlasts the hackathon.

### Notes

If we run long, portability shrinks to holding up the file and saying one
sentence. The number stays.

The two halves of that number are not equally far away. The minimization ratio
is already computed: `report` prints fields available against fields sent, off
the ledger, today. The conformance score has nothing behind it, and it is the
half the slide leans on hardest. If only one gets built, build the probes.

---

## Numbers that are not measured yet

Every figure on these slides is currently a placeholder from the brief. None of
them go on a slide until a run produced them.

| Slide | Figure | Where it comes from | Exists? |
|---|---|---|---|
| 1 | Calls checked, fields withheld, rules fired, top recipients | `privacy.md scan --days 30`, over the transcripts already on the laptop | Yes |
| 3 | Nothing numeric | | |
| 4 | Leaks unprotected against leaks with the kernel | The 24-probe conformance suite, run twice | No |
| 4 | Fields available against fields sent | `report`, on the demo task | Yes |

The evidence in [Evidence for the opening](BRIEF.md#evidence-for-the-opening)
has the same problem. Those incidents are recalled from memory and each date and
CVE needs checking against a primary source before it is projected.

## What the slides claim, against what the build does

Checked against `main` at `45fe455`, "Read history back, and infer rules from
it", plus uncommitted work in the tree. 53 tests, 52 passing. Re-check this
section whenever the kernel moves, because it moved four times while these
slides were being written.

### Backed by code

- **Detection and redaction, including inside composite calls.** A health detail
  in a `curl -d '{...}'` payload gets stripped rather than sailing through. Slide
  3 is safe as written, and so is a judge typing a shell command.
- **The whole hold loop.** The adapter emits the menu, `kernel/pending.js` parks
  the call in `~/.privacy/pending/`, and `decide <id> <n>` writes the rule
  through `saveConstitution`. Slide 3's "it will not ask me again" is true.
- **Every line of menu text on slide 3.** Labels, consequences and the rule
  previews are generated by `kernel/rules.js`, not mocked up for the slide.
- **Temporary grants.** Rules carry `expires`, and `decide` runs `pruneExpired`
  before it writes, so an hour-long grant is swept on the next decision.
- **The report.** `privacy.md report` prints calls checked, fields
  available against fields sent, interruptions, rules that fired and top
  recipients. Slides 1 and 4 both read off it.
- **Template export.** `asTemplate()` drops everything personal and keeps the
  rest.
- **`privacy.md` itself.** `~/.privacy/privacy.md` is the file a person writes
  and `~/.privacy/rules.yaml` is what the kernel reads, compiled from it. Slide
  2's central image is real.
- **Reading history back.** `kernel/history.js` plus `scan --days 30` reads the
  agent transcripts already on the machine, and `kernel/infer.js` proposes rules
  from them (`scan --apply`). That is slide 1's whole report and slide 2's
  accept-edit-skip screen, both of which this section said were missing an hour
  ago.
- **Both runtimes.** `adapters/claude-code.js` is a `PreToolUse` hook,
  `adapters/openai-agents.js` exports `guard`, `guardAll` and
  `constitutionGuardrail`. `@openai/agents` is a devDependency now, so
  `portability.test.js` runs against the real SDK rather than a mock, and drives
  each adapter the way its runtime does before comparing them to each other.

### Not yet true

- **The conformance suite.** No probes anywhere in `src/`. Slide 4's closing
  number has nothing behind it.
- **One failing test, and it is on slide 4's critical path.**
  `openai-agent.test.js:107`, "the SDK runner delivers a minimized payload to
  the tool", asserts the tool still runs with reduced arguments and gets zero
  invocations instead of one. Blocking is fine and the credential test beside it
  passes. What is unproven is minimization surviving the round trip through the
  real SDK runner, which is the half of slide 4 that says the task still
  completes. Being written as these slides were written, so re-check.

### Fixed since the first draft of these slides

- **The grammar of the emitted menu.** `DATA_WORDS` held one possessive string
  per data type and used it in two grammatical positions, which printed
  "clinic.example gets no your contact details". It now holds a bare noun plus
  whether the data is the user's own, so a determiner gets "gets no contact
  details" and the head of a sentence gets "Your contact details". Two data
  types are singular ("salary history", "precise location") against a verb table
  that assumed plural, so the verbs agree now too.
- **A session grant read exactly like a permanent one.** "Allow for the next
  hour" and "Allow for clinic.example" both previewed "Your contact details may
  go to clinic.example.", which defeats the point of showing the rule. The
  hour-long one now says "until 06:12 PM".
- **Em-dashes in copy that reaches a screen**, in the adapter, the CLI and the
  preset.

### Still to sweep

Em-dashes remain in emitted strings in `bin/onboard.js` and `kernel/questions.js`.
Those files arrived while these slides were being written and are still being
edited, so they are left alone rather than fought over.

Slide 2 needs re-checking against them. `bin/onboard.js`, `kernel/questions.js`
and `kernel/freetext.js` now exist, which means the accept-edit-skip screen and
the free-text compiler may both be real. This section said they were not, a few
minutes ago.
