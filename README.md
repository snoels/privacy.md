# Privacy Constitution

A pre-tool-call kernel that checks every outbound flow from a personal AI agent
against a portable set of rules the user never had to write, and lets the task
succeed with less data.

Built for the **Agentic AI: Making Privacy Native to Personal Agents** track.

---

## The idea in four sentences

When a personal agent acts for you, every tool call is a data transfer, and
nobody checks any of them. The agent has become a data controller that was never
told the rules. So put a check in front of the tool call: the runtime hands each
call to a kernel, the kernel evaluates it against your constitution, and only
then does it go out.

Every previous attempt at this (P3P, Do Not Track) asked the *recipient* to
behave, and the recipient didn't. This enforces at your own boundary, before the
data leaves, so nobody's cooperation is required.

---

## Two workstreams

| Track | Home | Feeds |
|---|---|---|
| **The document** — the summary we're all writing | [`docs/`](docs/) | The slides |
| **The implementation** — the working PoC | [`src/`](src/) | The live demo |

They meet in [`docs/demo.md`](docs/demo.md): what gets built is what the demo
needs, in the order the demo needs it.

### How the document becomes slides

```
docs/*.md   →   artifact/brief.html   →   slides
(everyone edits)   (designed summary)     (built from the summary)
```

`docs/` is the source of truth. The single-page HTML in
[`artifact/`](artifact/brief.html) is the designed version of the same content —
we regenerate it from `docs/` when it's time to pitch, and build the slides from
that. **So write it in `docs/` and it lands in the deck.**

Each `##` heading in [`docs/demo.md`](docs/demo.md) is roughly one slide.

---

## How we work

Two things move in parallel, and **issues are how they meet**.

### If you're writing the document

Edit `docs/` directly. Small fix, better wording, a fact you know is wrong — just
make the edit, no permission needed.

If it's worth discussing first, or it changes what we *build* rather than what we
*say*, open an issue instead:
**[New issue → Change the document](../../issues/new?template=doc-change.yml)**.

### If you're implementing

Work from the docs as they stand today. They are good enough to start.

Doc changes land continuously and that's fine — **you are not expected to track
them.** Anything that should change the implementation arrives as an issue
labelled `implementation`, not as a silent edit. If you spot a doc change that
does affect the build and no issue exists, open one:
**[New issue → Build something](../../issues/new?template=build-task.yml)**.

### The rule that keeps this from breaking

> A change to the document is not a change to the plan until there's an issue.

Edit freely. But if the build has to move, say so out loud in an issue.

---

## How to edit the document

**You do not need to code, install anything, or use a terminal.**

1. Click any `.md` file in [`docs/`](docs/) below.
2. Click the **pencil icon** (top right of the file).
3. Type your changes. It is just text.
4. Scroll down, write one line about what you changed, click **Commit changes**.

That's it. Your edit is live immediately.

If two people edit the *same file* at the same time, the second person gets a
warning rather than losing work. To avoid it, say in the group which file you're
in. That's why the document is five files rather than one.

Formatting: `**bold**`, `## Heading`, `- bullet`, and a blank line between
paragraphs. Nothing else is needed.

### The five files

| File | What's in it |
|---|---|
| [`docs/concept.md`](docs/concept.md) | The thesis, the five outcomes, and the interruption menu that builds the rules |
| [`docs/constitution.md`](docs/constitution.md) | The policy file, how it layers and ships, onboarding, the rule taxonomy |
| [`docs/demo.md`](docs/demo.md) | The three-minute demo arc and what we measure — **this one becomes the deck** |
| [`docs/evidence.md`](docs/evidence.md) | Real incidents to open with, and what a judge will ask |
| [`docs/build.md`](docs/build.md) | Build order, and the calls still open |

---

## Status

Brainstorm, converging.

The unmade decisions are at the bottom of [`docs/build.md`](docs/build.md) —
demo data, whether the room expects OpenAI-stack usage, and the name. If you
have an opinion on one, edit it in rather than keeping it in your head.
