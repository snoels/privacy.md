# Concept

## The thesis

When a personal agent acts for you, every tool call is a data transfer. Today
nobody checks any of them. The agent has become a data controller that was never
told the rules.

The fix is a check placed **in front of** the tool call, not behind it. The
agent's runtime hands each call to a kernel, the kernel evaluates it against the
user's constitution, and only then does the call go out. Post-hoc detection
gives you an incident report, not privacy.

### Why this isn't Do Not Track again

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

### The honest limit

State this before a judge finds it: coverage extends only to flows that pass
through the interception point. An agent using a channel we didn't wrap is
invisible to us. The tool boundary is a chokepoint by construction in these
runtimes, which is why it is the right place to sit, but the dashboard reports
coverage rather than claiming totality.

---

## Five outcomes, and block is the rare one

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

### What redaction looks like

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

### Speed

If every call waits on a model we add seconds to everything and the tool becomes
unusable. Run a fast deterministic pass first, on patterns, known field names
and known recipients, which resolves most calls. Escalate only the ambiguous
remainder to a model, cached by flow signature. This is also the concrete answer
when someone asks how it scales.

---

## The interruption is where the constitution gets built

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
