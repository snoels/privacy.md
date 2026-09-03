# Implementation

Nothing here yet. Build order and rationale live in
[`../docs/build.md`](../docs/build.md).

First thing that matters: **an interception hook with a hardcoded constitution.**
Claude Code's `PreToolUse` hook is the fastest real enforcement point — it
inspects a tool call and can deny it before it runs. If that does not work,
nothing downstream matters, so it goes first.

Shape to aim for, so the two adapters stay thin:

```
  runtime adapter  →  kernel.evaluate(call)  →  outcome
  (PreToolUse,         deterministic pass,       allow | redact | substitute
   OpenAI SDK)         then model if unclear     | ask | block
```

The kernel knows nothing about which runtime it is running under. That is what
makes the same constitution file work in both, which is the portability claim we
are making on stage.
