# Privacy Constitution

A pre-tool-call kernel that checks every outbound flow from a personal AI agent
against a portable set of rules the user never had to write, and lets the task
succeed with less data.

Built for the **Agentic AI: Making Privacy Native to Personal Agents** track.

---

## 📄 The document

# → **[BRIEF.md](BRIEF.md)** ←

One file. The thesis, the five outcomes, the constitution format, the demo arc,
the evidence, the build order, and the decisions still open.

### Editing it — no terminal, no install, no git

1. Open **[BRIEF.md](BRIEF.md)**.
2. Click the **pencil icon**, top right of the file.
3. Type. It's just text.
4. Scroll down, write one line about what you changed, click **Commit changes**.

Your edit is live immediately. You need a GitHub account and to be added to this
repo — ask Sander, it takes ten seconds.

Formatting: `**bold**`, `## Heading`, `- bullet`, blank line between paragraphs.
Nothing else is needed.

### Saying something instead of changing it

GitHub can't thread comments on a file directly, so there are two ways:

- **Open an [issue](../../issues/new/choose)** — for anything worth discussing
  before it changes. This is the normal one.
- **Use "Propose changes"** instead of "Commit changes" when you edit. That opens
  a pull request where anyone can comment on individual lines. Use it when you
  want a specific passage argued over rather than just fixed.

> Edit when it's plainly wrong. Open an issue when it's worth a discussion.

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

## How the repo fits together

| | | |
|---|---|---|
| **[BRIEF.md](BRIEF.md)** | The document | Everyone edits this |
| **[SLIDES.md](SLIDES.md)** | The pitch | Four slides, three minutes. Everyone edits this too |
| **[src/](src/)** | The build | The working PoC |
| **[Issues](../../issues)** | The bridge | How a doc change becomes a build change |
| **[artifact/](artifact/brief.html)** | The designed version | A pitch surface, regenerated from `BRIEF.md`. Don't hand-edit it |

### The rule that keeps this from breaking

> A change to the document is not a change to the plan until there's an issue.

Edit `BRIEF.md` freely. But if what you changed means the build has to move,
open an issue:
**[New issue → Build something](../../issues/new?template=build-task.yml)**.

Whoever is implementing works from the document as it stands and is **not
expected to watch it for edits.** Build changes arrive as issues, never as a
silent edit.

---

## Status

Brainstorm, converging. Implementation starting on the document as it stands.

The unmade decisions are in **[Open calls](BRIEF.md#open-calls)** at the bottom
of the document — demo data, whether the room expects OpenAI-stack usage, and
the name. If you have an opinion, edit it in.
