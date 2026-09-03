# Evidence for the opening

Three categories, each mapping to something the kernel fixes.

> **Check every date and detail before it reaches a slide.** These are recalled
> from memory and need verifying against a primary source.

## The agent was steered by someone else

- **EchoLeak**, mid-2025. A zero-click flaw in Microsoft 365 Copilot where a
  crafted email could make Copilot exfiltrate the user's own data with no click
  required. Found by Aim Security, CVE-2025-32711.
- **AgentFlayer**, Black Hat 2025. Zenity showed a poisoned document in Google
  Drive causing ChatGPT Connectors to leak secrets out of the user's own
  account.

> The agent cannot police itself, because the attacker writes to the same
> channel as the user.

## The user overshared without knowing

- **Meta AI's Discover feed**, 2025. Users' conversations appeared publicly,
  including medical and legal questions, with many apparently unaware.
- **Shared ChatGPT conversations indexed by Google**, 2025. Links people shared
  privately became searchable. OpenAI pulled the feature.
- **Samsung**, 2023. Engineers pasted proprietary source into ChatGPT and
  Samsung banned it internally.

> People do not know what is leaving.

## The assistant collected data about people who never agreed

- **VRT NWS**, July 2019. A contractor leaked over a thousand Dutch-language
  Google Assistant recordings, including some captured without a wake word. A
  Belgian story, which will land locally.
- **Bloomberg**, April 2019. Amazon contractors listening to Alexa clips.

> The third-party subject problem. Your agent holds other people's data.

## The one to actually show live

Grep your own agent transcripts for personal data that went to a model provider.
Everyone in that room has that on their laptop right now, and none of them have
looked.

---

# What a judge will ask

**"Is this not just Do Not Track?"**
No, and the difference is structural. DNT expressed a preference and relied on
the recipient. This enforces at your own boundary, before egress, so cooperation
is not required.

**"Will people not just click allow?"**
Some will, which is why the menu is ordered narrow to broad, defaults to redact,
and why hurried grants get surfaced for review in the summary. Interruptions per
day is on the dashboard for exactly this reason.

**"What about flows you do not see?"**
Out of scope, and reported rather than hidden. Coverage is a dashboard panel.
The tool boundary is a chokepoint by construction in these runtimes, which is
why it is the right place to sit.

**"Does it not slow every call down?"**
Deterministic pass first on patterns, field names and known recipients, which
resolves most calls in microseconds. Only the ambiguous remainder reaches a
model, and those results are cached by flow signature.

**"Where do you store my rules?"**
On your machine. Nowhere else. Only templates, which carry no personal facts,
are ever published.
