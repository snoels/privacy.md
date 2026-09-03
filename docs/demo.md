# Demo arc

Three minutes. The times are the discipline, not a suggestion. **One scenario
throughout**, because breadth reads as unfinished.

Each act below is roughly one slide.

## 0:00–0:20 · The shock

A report generated from real agent history. "340 tool calls last month. 61
carried personal data. My address went to four services, my phone number to
six." No setup, no live model call. Have the kernel redact its own report on
screen, so minimization is visible in the first twenty seconds.

> Proves **the problem is real** before anyone asks.

## 0:20–1:00 · The rules

The tool reads that same history and proposes rules in plain language. "You have
shared your address with delivery services twelve times and nothing else. Rule:
address goes to logistics only." Accept two, edit one.

> Answers **who writes the policy** — nobody does, it is inferred.

## 1:00–2:00 · The proof

Inbox triage. The agent reads your inbox to plan the week and finds a
colleague's email containing a third party's phone number, a medical appointment
confirmation, and a newsletter carrying a hidden instruction. It writes to your
shared work calendar and emails the clinic. Same data, different destinations,
treated differently. One decision escalates, you answer once, the answer becomes
a rule. **The booking completes.**

> Proves **contextual integrity** — your data, someone else's data, multiple
> destinations and an injection vector, in one scene.

## 2:00–2:25 · Portability

Same constitution file, dropped into an OpenAI Agents SDK agent. Different
runtime, different code, same enforcement. Ten seconds of screen for the entire
thesis.

> Proves it is **a standard, not a plugin**.

## 2:25–2:55 · The number

24 scripted probes against both agents. Unprotected leaks on 17, with the kernel
2. On the live task, 14 fields were available and 3 were sent.

> Leaves them with **a benchmark, not just a tool**.

## Close

P3P and Do Not Track both asked the other side to behave, and the other side did
not. This checks before the data leaves your machine, so nobody's cooperation is
required.

---

## Two production notes

**Cache everything.** Venue wifi plus live model calls is how hackathon demos
die. Record the model responses, replay them deterministically, and run it as a
live script. Nobody can tell, and nothing breaks.

**What to cut if we run long.** Portability shrinks to holding up the file and
saying the sentence. What cannot be cut is the proof scene and the number.

---

# Measurement

Most teams will ship a tool. Shipping a *number* is what gets written down.

**Minimization ratio.** Fields available versus fields sent, per task. Kernel
off against kernel on, same task, both completing.

**Conformance score.** A battery of scripted probes designed to tempt a leak,
run against any agent, scored against a given constitution. That is a benchmark,
not a tool, and it applies to agents we did not build.

## The chart to lead with

Redactions per day going **up** while interruptions per day go **down**. It
answers the objection every judge is already forming: a privacy tool that
interrupts you forty times a day is dead on arrival.

> It does more and bothers you less. That is the product in one graph.

## Dashboard panels

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
