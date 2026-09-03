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

```
  340   tool calls
   61   carried personal data off this machine

        home address    → 4 services
        phone number    → 6 services
        health detail   → 2 services
        credentials     → 1 service

  0     of these were shown to me before they went
```

Then the kernel redacts its own report, live, while it is on screen.

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

No live model call here. This is generated ahead of time and replayed.

The honest version of this slide is the strongest one, so the numbers have to be
my real numbers. If a field is too exposing to show, the kernel redacting it on
screen is the point, not a problem.

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

One call escalates, and the hold is where the constitution actually gets built:

```
  HELD   clinic.book wants phone
         recipient: clinic.example . you have never used this
                    the agent found this, you did not pick it
         rule hit:  anything personal going to a service you have
                    never used needs a decision

    > Substitute a relay number  booking succeeds, they get a mask
      Redact and send            booking may fail without a callback number
      Allow for this recipient   clinic.example, any future call
      Never                      writes a deny rule

    writes rule -> substitute phone for healthcare recipients
```

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
recipient rather than I did. I answered once, and the answer became a rule. The
booking completed.

Block is the rare outcome. The default is redact, and the task completes with
less of you in it.

### What it proves

Contextual integrity, in one scene: my data, someone else's data, several
destinations, and an injection vector. And that the agent still finishes the
job, which is the thing that kills every privacy tool that only blocks.

### Notes

This is the act that cannot be cut. Everything else can shrink.

Give the hold menu real seconds. The rule preview updating as the cursor moves
is the whole product, and it is invisible if we rush past it.

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

---

## Numbers that are not measured yet

Every figure on these slides is currently a placeholder from the brief. None of
them go on a slide until a run produced them.

| Slide | Figure | Where it has to come from |
|---|---|---|
| 1 | 340 calls, 61 carrying personal data, the per-field fan-out | A real pass over my own agent transcripts |
| 3 | Nothing numeric | |
| 4 | 17 leaks unprotected, 2 with the kernel | The 24-probe conformance suite, run twice |
| 4 | 14 fields available, 3 sent | The ledger's minimization ratio on the demo task |

The evidence in [Evidence for the opening](BRIEF.md#evidence-for-the-opening)
has the same problem. Those incidents are recalled from memory and each date and
CVE needs checking against a primary source before it is projected.

## What the slides currently claim that the build does not do yet

Worth tracking, because a slide that outruns the kernel is how a demo dies.

- **Redaction inside composite calls.** A health detail inside a
  `curl -d '{...}'` payload survives the kernel today. Two tests in
  `src/test/composite.test.js` fail on exactly this. Slide 3 shows a structured
  tool call, which works, so the slide is safe as written. A judge typing a
  shell command is not.
- **The hold menu.** Slide 3 shows the graded menu and a rule being written
  back. That is item 4 in the build order and does not exist yet.
- **The OpenAI adapter.** Slide 4's right-hand column is item 7.
- **The conformance suite.** Slide 4's closing number is item 8.
