# The constitution

## It is two artifacts, not one

Conflating these will bite us, so split them at the file format level from the
start.

**Your personal constitution is itself sensitive.** A rule reading "never
disclose my HIV status" leaks the fact by existing. It stays local, always. No
account, no upload, no hosted copy. A service that centrally stores everyone's
privacy preferences is the exact thing this project argues against, and a judge
will say so out loud.

**A template is the shareable thing.** Generic rules, no personal facts. EU
Cautious. Healthcare worker. Journalist, source protection. Parent. Someone
protecting sources has genuinely different needs from a doctor, and those
profiles carry no facts about anyone, so they ship safely.

```
$ npx privacy-constitution init --profile journalist

  installed  journalist@1.2.0        34 rules
  installed  eu-baseline@2026.1      18 rules, inherited
  local      ~/.constitution/        personal layer, never uploaded
```

A privacy NGO publishes a GDPR-strict baseline. An employer publishes one for
staff. That is a better answer to "how does this scale" than offering to host
it.

## Layering

Four layers, merged with **most specific winning, and deny beating allow at
equal specificity**. Write that resolution order into the file so a fired rule
can always be explained.

| Layer | Source | Mutable by | Shareable |
|---|---|---|---|
| **Template** | `journalist@1.2.0` | Publisher, versioned | Yes |
| **Organisation** | Employer policy | Admin | Within the org |
| **Personal** | Questionnaire, inference, free text | The user | No |
| **Session** | Grants made mid-task | The user, expires | No |

## Two things to build into the format now

**Provenance on every rule.** Template, questionnaire, inferred from history,
typed by the user, granted mid-task. This makes `export --as-template` a
one-liner: drop everything tagged personal, keep the rest. The tool minimizing
its own output is a good beat in the demo.

**A plain English line next to every rule.** The user has to be able to audit it
and a judge has to be able to read it projected.

```yaml
- id: health-not-to-calendars
  says: "Health details never reach a calendar or notes app."
  data: [health]
  recipient: { class: [productivity, storage] }
  outcome: redact
  provenance: { source: questionnaire, q: 3, at: 2026-09-03T09:14Z }

- id: no-credentials-anywhere
  says: "Keys and secrets never leave this machine, including into prompts."
  data: [credentials]
  recipient: { class: ["*"] }
  outcome: block
  provenance: { source: template, from: eu-baseline@2026.1 }
```

Skip signing for the hackathon, but say the word once in the pitch. "Templates
are content-addressed and signable" tells the room we know where this goes
without spending an hour on it.

---

# Onboarding without a thirty-question form

A questionnaire is a form, and forms are where good intentions die. Two rules
keep it alive.

**Ship presets, then only ask where the presets disagree.** Cautious, Balanced,
Open. Most rules are identical across all three. Surfacing only the contested
ones cuts us to six or seven questions instead of thirty.

**Ask about situations, not fields.** "Your agent found a service you have never
used and wants to send it your email address" is answerable. "Do you permit
category CONTACT" is not.

| # | Question | What it sets |
|---|---|---|
| 1 | A tool asks for something the task does not need. Send it anyway? | Minimization default |
| 2 | Your agent found a service you have never used. Allow, ask, or block? | Unknown recipient |
| 3 | Should health details ever land in your calendar or notes? | Health handling |
| 4 | Your agent summarises an email thread with an external tool. Strip other people's names and numbers? | Third-party subjects |
| 5 | Should your location stay shared after the delivery arrives? | Time-bounded consent |
| 6 | Can secrets and keys go into a prompt? | Credentials, and the model provider as a recipient |
| 7 | How often are you willing to be interrupted? | Interruption budget |

Question 7 is not a privacy question, and it earns its place anyway. It sets a
budget the user chose, which the dashboard then measures against instead of
inventing a target.

## Graded options, not checkboxes

Checkboxes force binary allow or deny, which throws away the recipient axis. A
five-point select per data type keeps it, and maps straight onto the outcomes.

```
  health      Never  ·[ Ask every time ]·  Used before  ·  When needed  ·  Always
  location    Never  ·  Ask every time  ·[ Used before ]·  When needed  ·  Always
  phone       Never  ·  Ask every time  ·  Used before  ·[ When needed ]·  Always
  email       Never  ·  Ask every time  ·  Used before  ·[ When needed ]·  Always
  credentials[ Never ]· Ask every time  ·  Used before  ·  When needed  ·  Always
```

Do not run ten sequential prompts for ten data types. The preset fills
everything, then one review screen shows all types with their current setting
and the user changes only what they care about. Three screens total: pick a
preset, review the table, adjust.

## Free text is where the model earns its place

The user types "never tell anyone I am pregnant" or "my work email can go
anywhere, my personal one cannot," and the model compiles it into structured
rules. Two things have to be right.

**Show the compiled rule before saving it.** Silent misinterpretation of a
privacy rule is worse than having no rule at all.

**Test it on the spot.** Run it against two or three sample flows and show what
would happen. "With this rule, that calendar entry would have been redacted."
Ten seconds, and it feeds the measurability story directly.

Per-destination rules use the same mechanism. "For this endpoint, only name and
email, nothing else" is just a rule with the recipient pinned.

---

# Rule taxonomy

Every rule has the same shape: **data type, recipient class, purpose.** Getting
those three axes right is what keeps the questionnaire short, because one good
question sets a whole row.

| Axis | Values |
|---|---|
| **Data type** | Identity · contact · location · health · financial · credentials · other people's data · special categories (religion, politics, sexuality, union membership — all GDPR Article 9) |
| **Recipient class** | This machine · your model provider · a service you have a relationship with · a service for this one task · a service the agent found by itself · public |
| **Purpose** | Complete the task you asked for · storage and memory · improvement and training · marketing · unclear |

The class people forget is the second one. **Your model provider is a
recipient.** Everything in context goes there, so the constitution needs an
opinion on what enters the prompt, not only on what leaves in a tool call. It is
cheap to demo and it reframes the whole problem.

## Rules that demo well

| Rule | Outcome | Why it lands |
|---|---|---|
| Credentials never leave the machine. Keys, tokens, `.env`, SSH. To anyone, including the model provider. | Block | Instant, unarguable, easy to trigger live |
| Precise location only to a service actively delivering to you, only while it is delivering. | Ask | Introduces time-bounded consent, which nobody else will have |
| Health never to a calendar, a notes app, or long-term agent memory. Healthcare recipients only. | Redact | The scenario everyone recognises |
| Salary history never to a recruiter or employer. | Block | Illegal to ask in several US states, so the rule has legal backing |
| Other people's contact details get stripped before any third-party tool. | Redact | The third-party subject problem, which the track cares about and few teams will touch |
| Special categories never to advertising or analytics. | Block | Straight out of GDPR Article 9, no ask, no override |
| Nothing to a recipient the agent chose rather than you. | Ask | General, and specific to agents. "You did not pick this destination" is a strong signal on its own |
| Mandatory contact fields get a mask, not the real value. | Substitute | The task completes and they still do not have you |
