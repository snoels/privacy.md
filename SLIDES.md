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
| 2 | The constitution | 0:25–1:05 | Who writes the rules? |
| 3 | Enforcement, and the proof | 1:05–2:05 | Does it work, and does the agent still work? |
| 4 | It travels, and here is the score | 2:05–2:55 | Is this a standard or a plugin? |

One scenario runs through slides 2, 3 and 4. Breadth reads as unfinished.

---

## Slide 1 · Without this

**Headline:** Every tool call is a data transfer. Nobody checks any of them.

### On screen

A report generated from real agent history, mine, from last month.

This is `privacy-constitution report`, which already exists and prints this
shape from the ledger:

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

Then the kernel redacts its own report, live, while it is on screen. "Who your
agent talked to" is the panel that surprises people, so it stays on screen
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

## Slide 2 · The constitution

**Headline:** Nobody writes a privacy policy for themselves. So we don't ask them to.

### On screen

Left, the tool reading the same history and proposing rules in plain language:

```
  You have sent your address to delivery services 12 times
  and to nothing else.

    → address goes to logistics only              [accept] [edit] [skip]

  You have sent health details to a healthcare provider,
  and never anywhere else.

    → health goes to healthcare only              [accept] [edit] [skip]
```

Right, what one accepted rule becomes on disk:

```yaml
- id: health-only-to-healthcare
  says: "Health details only go to a healthcare provider, never anywhere else."
  data: [health]
  recipient: { trust: [known, task_scoped, agent_chosen, public, model_provider] }
  outcome: redact
  provenance: { source: inferred, from: history, at: 2026-09-03T09:14Z }
```

A broad deny, with a narrow allow for healthcare recipients underneath it. Not a
list of banned apps, because a list is a hole waiting for the next messaging
service nobody thought to name.

Underneath, the four layers, and where each one lives:

```
  template       journalist@1.2.0      published, versioned, no personal facts
  organisation   employer policy       admin, within the org
  personal       yours                 local only, never uploaded
  session        granted mid-task      expires
```

### Said out loud

Nobody sits down and writes a privacy policy for themselves. So the tool reads
what you have already done and proposes the rules in plain language. Accept,
edit, skip. Seven questions where the presets disagree, and that is onboarding.

Every rule carries a plain English line, so you can audit it and I can project
it. Every rule carries its provenance, so you know whether you chose it or we
guessed it.

Your own constitution is itself sensitive. A rule that says "never disclose my
HIV status" leaks the fact by existing, so it stays on your machine, always. No
account, no upload. What travels is a template, which is generic rules and no
facts about anyone. A privacy NGO can publish a GDPR baseline. Your employer can
publish one for staff.

### What it proves

Where the policy comes from, which is the first thing anyone asks. And that we
are not building the centralised store of everyone's privacy preferences, which
is the thing this project argues against.

### Notes

`asTemplate()` in `kernel/constitution.js` already does the export: it drops
every rule whose provenance is personal and keeps the rest. That is a free beat
if we want it, and it is the tool performing on its own output the same
minimization it performs on every tool call.

The strongest beat available here is the free-text one. Type "never tell anyone
I am pregnant", show the compiled rule before it saves, then run it against two
past flows and show what would have happened. It only earns the time if it is
solid, because a misinterpreted privacy rule on stage is worse than no rule.

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

  Then run: npx privacy-constitution decide 7f3a91 2
```

You answer in the conversation. The command records it:

```
  $ npx privacy-constitution decide 7f3a91 2

    Send a masked value -- the call still works, clinic.example gets a
                           relay rather than the real thing
    rule added: Your contact details reach clinic.example only as a mask.
    ~/.constitution/constitution.yaml

    Retry the call. The constitution now covers it.
```

Every option carries the rule it would write, all of them at once. There is no
cursor to hover, so the width of a grant has to be visible on the line itself.
"Allow for healthcare services" and "Allow for clinic.example" look almost
identical until you can read the two rules side by side.

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

**Headline:** Same file, different runtime, same enforcement.

### On screen

Split screen, one constitution, two agents:

```
  ~/.constitution/constitution.yaml
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

Same constitution file, dropped into an agent built on a different stack, by
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
| 1 | Calls checked, fields withheld, rules fired, top recipients | `privacy-constitution report`, over a ledger with real history in it | Command yes, the history no |
| 3 | Nothing numeric | | |
| 4 | Leaks unprotected against leaks with the kernel | The 24-probe conformance suite, run twice | No |
| 4 | Fields available against fields sent | `report`, on the demo task | Yes |

The evidence in [Evidence for the opening](BRIEF.md#evidence-for-the-opening)
has the same problem. Those incidents are recalled from memory and each date and
CVE needs checking against a primary source before it is projected.

## What the slides claim, against what the build does

Checked against `main` at `0767e96` plus the uncommitted work in the tree
(`kernel/pending.js`, and changes to the adapter, the CLI and
`kernel/constitution.js`). All 24 tests pass.

### Backed by code

- **Detection and redaction, including inside composite calls.** A health detail
  in a `curl -d '{...}'` payload gets stripped rather than sailing through. Slide
  3 is safe as written, and so is a judge typing a shell command.
- **The whole hold loop.** The adapter emits the menu, `kernel/pending.js` parks
  the call in `~/.constitution/pending/`, and `decide <id> <n>` writes the rule
  through `saveConstitution`. Slide 3's "it will not ask me again" is true.
- **Every line of menu text on slide 3.** Labels, consequences and the rule
  previews are generated by `kernel/rules.js`, not mocked up for the slide.
- **Temporary grants.** Rules carry `expires`, and `decide` runs `pruneExpired`
  before it writes, so an hour-long grant is swept on the next decision.
- **The report.** `privacy-constitution report` prints calls checked, fields
  available against fields sent, interruptions, rules that fired and top
  recipients. Slides 1 and 4 both read off it.
- **Template export.** `asTemplate()` drops everything personal and keeps the
  rest.

### Not yet true

- **The OpenAI adapter.** `src/adapters/` holds `claude-code.js` and nothing
  else. Slide 4's right-hand column is item 7 in the build order, and it is now
  the single largest gap on any slide.
- **The conformance suite.** No probes anywhere in `src/`. Slide 4's closing
  number has nothing behind it.
- **Slide 1's history.** `report` reads the ledger, and the ledger only fills
  once the hook has been running. A retrospective over last month cannot come
  from it. Either the hook runs in observe-only for long enough, or something
  makes one pass over the transcripts already on disk.
- **Slide 2's accept-edit-skip screen.** There is no `init` flow that proposes
  inferred rules. `init` writes a preset and stops.

### Two things to fix before either reaches a projector

- **A grammar bug in the emitted menu.** `DATA_WORDS` in `kernel/rules.js` holds
  possessives (`contact: 'your contact details'`), and the redact consequence
  reads `` `${where} gets no ${subject}` ``. Together they print "clinic.example
  gets no your contact details". Slide 3 shows the corrected wording. The fix is
  either non-possessive data words plus a possessive added where it reads well,
  or a separate short form for mid-sentence use.
- **An em-dash in product copy.** The adapter emits "You did not pick this
  destination — the agent did." That goes on screen, and it is against house
  style. Slide 3 shows it with a comma.
