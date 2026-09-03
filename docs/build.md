# Build order

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

## Why Claude Code first, and why it is not the pitch

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

# Open calls

These are the decisions still unmade. **If you have an opinion, edit it in here
rather than keeping it in your head.**

### Demo data — real history or a synthetic persona?

Real is more credible and it is why the opening works. The cost is exposing
yourself on stage. Middle path: real history with the kernel doing the redaction
live, which turns the problem into the feature.

*Current lean:* real, with live redaction.

### Does the room expect OpenAI-stack usage?

If it does, the OpenAI adapter moves up the build order and becomes the primary
rather than the proof.

*Unresolved.*

### The name

Unclaimed. It appears in the `npx` line, which is on screen for most of the
demo, so it is worth ten minutes.

*Unresolved.* `privacy-constitution` is the working title, not a decision.

### Scope of the third-party subject problem

Your inbox is full of data about people who never agreed to your agent reading
it. We have a rule for it (strip other people's contact details) but not a
story. Worth at least a sentence in the pitch even if we do not solve it.

*Unresolved.*
