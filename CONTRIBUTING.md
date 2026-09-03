# Contributing

Two kinds of change, and they travel differently.

## Editing the docs — no terminal, no install, no git

1. Open the file, usually **[BRIEF.md](BRIEF.md)**.
2. Click the **pencil icon**, top right.
3. Type. It's just text.
4. Scroll down, write one line about what you changed, click **Commit changes**.

Your edit is live immediately. You need a GitHub account and write access to
this repo.

Formatting: `**bold**`, `## Heading`, `- bullet`, blank line between paragraphs.
Nothing else is needed.

### Saying something instead of changing it

GitHub can't thread comments on a file directly, so there are two ways:

- **Open an [issue](../../issues/new/choose)** for anything worth discussing
  before it changes. This is the normal one.
- **Use "Propose changes"** instead of "Commit changes" when you edit. That
  opens a pull request where anyone can comment on individual lines. Use it when
  you want a specific passage argued over rather than just fixed.

> Edit when it's plainly wrong. Open an issue when it's worth a discussion.

## The rule that keeps this from breaking

> A change to the document is not a change to the plan until there's an issue.

Edit [BRIEF.md](BRIEF.md) freely. But if what you changed means the build has to
move, open one:
**[New issue → Build something](../../issues/new?template=build-task.yml)**.

Whoever is implementing works from the document as it stands and is **not
expected to watch it for edits**. Build changes arrive as issues, never as a
silent edit.

## Working on the code

```bash
cd src
npm install
npm test
```

`@openai/agents` is a devDependency so the portability tests can drive the real
SDK. Where it is absent those tests skip rather than fail, because the kernel
does not need it.

Three things to know before changing the kernel:

**The domain of the kernel is one call.** `check(call, constitution)` takes a
proposed tool call and returns an outcome. It knows nothing about which runtime
it is running under, and that is what makes one `privacy.md` enforce in both
adapters. Runtime specifics belong in `adapters/`, never in `kernel/`.

**A missing constitution must never mean allow everything.** `loadConstitution`
falls back to a preset. Fail closed.

**Rule text is user-facing copy.** Every `says:` line and every menu consequence
is read by a person deciding whether to trust the tool, and some of it lands on
a projector. `kernel/rules.js` generates that text, so changes there are copy
changes as much as code changes.

## How the repo fits together

| | |
|---|---|
| [BRIEF.md](BRIEF.md) | The design document. Everyone edits this |
| [SLIDES.md](SLIDES.md) | The pitch |
| [src/](src/) | The kernel, the adapters, the CLI |
| [Issues](../../issues) | How a doc change becomes a build change |
| [artifact/](artifact/brief.html) | The designed version of the brief. Generated, don't hand-edit |
