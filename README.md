# Privacy Constitution

A pre-tool-call kernel that checks every outbound flow from a personal AI agent
against a portable set of rules the user never had to write, and lets the task
succeed with less data.

Built for the **Agentic AI: Making Privacy Native to Personal Agents** track.

---

## 📄 The document lives here

**https://claude.ai/code/artifact/41df5391-effe-486f-bf3c-42bc2e77ee88**

That link is the whole brief: the thesis, the five outcomes, the constitution
format, the demo arc, the evidence, the build order, and the decisions still
open. One page, no scrolling between files.

**To comment:** select any text on the page and leave a comment. Threads stay on
the page where the rest of the team can see them.

**To edit:** click **Edit** (bottom right), change anything, click **Save**.
Everyone's view updates. No git, no terminal, no install.

Comment when you want it discussed. Edit when it's plainly wrong.

The page source is committed here as [`artifact/brief.html`](artifact/brief.html)
so the document survives independently of the link. Don't edit that file by hand
— edit the page.

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

## This repo is the implementation

The document is the plan. This repo is the build.

| | |
|---|---|
| **The document** | The artifact link above — everyone reads, comments, edits |
| **The build** | [`src/`](src/) — the working PoC |
| **The bridge** | [Issues](../../issues) — the only way a doc change becomes a build change |

### The rule that keeps this from breaking

> A change to the document is not a change to the plan until there's an issue.

Comment and edit the document freely. But if something you changed means the
build has to move, open an issue:
**[New issue → Build something](../../issues/new?template=build-task.yml)**.

Whoever is implementing works from the document as it stands and is **not
expected to watch it for edits.** Build changes arrive as issues, never as a
silent edit to the page.

---

## Status

Brainstorm, converging. Implementation starting on the document as it stands.

The unmade decisions are in the **Open calls** section of the document — demo
data, whether the room expects OpenAI-stack usage, and the name. If you have an
opinion, comment on that section.
