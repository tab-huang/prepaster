# Design Philosophy

> **ProtectionIV — turn a stressful disaster alert into a manageable plan.**
>
> Warnings tell you *that* something is coming. ProtectionIV tells you *what to do* about it.

Everything in this project is built around a single belief: **in a disaster, the
scarce resource is not information — it's clarity.** People being warned of a flood,
fire, tornado, or earthquake are not short on alerts; they're short on a calm,
specific, trustworthy answer to one question — *what do I do, right now, from where
I'm standing?*

That same scarcity outlasts the danger. The hours and days *after* — is it safe to go
back in, how do I clean up without hurting myself, what does this denial letter mean,
what's the deadline — are their own fog of overload and doubt. So the product runs in
three acts — **Receive, Respond, Recover** — and the Recover phase is held to exactly
the same standard as the rest.

So the whole app is an exercise in **subtraction**. Every design decision — visual,
interactive, and architectural — is judged by one test: *does this reduce the load
on a frightened person, or add to it?* This document explains how that principle
shows up everywhere, and why the way the AI is built is itself a safety feature.

---

## 1. The problem we're designing against

A person reading an emergency alert is operating under acute stress: narrowed
attention, poor working memory, and little tolerance for ambiguity. The failure
modes we design against are specific:

- **Overload** — walls of text, dashboards, and options when someone can only hold
  one or two things in their head.
- **Genericness** — "seek higher ground" means nothing if you don't know which way
  is higher from where you stand.
- **Doubt** — advice that contradicts official guidance, or that *sounds* invented,
  gets ignored at exactly the wrong moment.
- **Delay** — anything that makes you stop and think before acting costs time you
  may not have.

Minimalism here isn't an aesthetic preference. **A simpler interface is a safer
interface.** Reducing disaster response to something manageable *is* the product.

---

## 2. Visual minimalism: calm is the message

The interface looks the way a good emergency briefing should sound — quiet,
deliberate, and uncluttered.

### Paper and ink
A warm bone canvas, charcoal ink, and 1px hairline borders. No gradients competing
for attention, no drop-shadow theatrics, no decorative chrome. The visual weight is
spent where it matters — on the one action and the live map — and withheld
everywhere else.

### One green, and it *means* something
The entire app runs on a single accent green (`#1f7a4d`), with only two functional
shades of that same hue (a dark variant for text, a light tint for fills). That
green is never decoration: it always means **safe / go / high ground** — the
recommended action, the route to safety, the destination on the map, the "you're
okay now" state.

Color is treated as a *language*, not a palette:

| Color | Meaning | Where it appears |
|-------|---------|------------------|
| **Green** | safe · go · higher ground · the resolution | recommended action, route, destination, high-ground markers |
| **Red** | danger · high severity · RUN urgency | the warning polygon, severe alerts — *reserved, never decorative* |
| **Blue** | water | flood context |
| **Amber** | caution · fire push | wind-toward-fire vector, warnings |

Because the shell is otherwise monochrome, the meaningful colors *land*. The danger
red and safety green never compete with decorative color, so a person can read
"danger here, safety there" at a glance — the single most important thing the map
has to communicate. (See `styles.css` `:root` — the palette is defined once, as
named tokens, so a green can't quietly drift into the design again.)

### Typography and restraint
One typeface family, a tight type scale, generous whitespace. Headings are sparse;
body copy is short. If a screen can say something in five words instead of fifteen,
it does.

---

## 3. The landing page: a promise kept before the app even opens

The landing page is deliberately minimalist because **it is the first proof that the
app will not overwhelm you.** A product that claims to make a disaster manageable
cannot greet you with a cluttered marketing page.

- **A one-word hero** — *ProtectionIV* — and a single sentence of intent. No feature
  grid, no carousel of badges.
- **A two-line thesis**: warnings tell you *that* something is coming; ProtectionIV
  tells you *what to do*. The whole value proposition fits in a breath.
- **Quiet, hand-drawn hazard scenes** for the four supported disasters (flood,
  wildfire, tornado, earthquake), each with one plain-language line of what to
  actually do — the same calm, action-first voice as the app itself.
- **Scroll-revealed, not animated-at-you.** Motion is gentle and earns its place;
  it respects `prefers-reduced-motion` and collapses to static on phones.
- **"Why it's strong" comes last, not first** — the honest, sourced explanation of
  the live feeds and official guidance behind the app is available for those who
  want it, but it never gets in the way of the core message.

The landing page *demonstrates* the philosophy rather than describing it: by the time
you click **Launch**, you already trust that the app will be simple.

---

## 4. Interaction minimalism: one decision at a time

The app is a **linear phase machine**, not a sprawling dashboard. There is no
navigation to get lost in — you are always on exactly one screen, with exactly one
thing to consider.

### Time first, because time changes everything
Before anything else, the app works out **how much time you actually have** and
sorts you into one of three tiers:

- **RUN** — under ~10 minutes. Life-safety reflex *now*; the plan for "what next"
  is generated quietly in the background while you move.
- **ACT** — under ~1 hour. Act deliberately.
- **PREPARE** — under ~6 hours. The hazard is *not* happening yet; steps are
  preparatory, never "take cover now."

The tier reshapes the entire plan, so the advice always matches the clock.

### Two patterns, not four playbooks
Every hazard collapses into one of two response shapes: **routing** (flood,
wildfire — *go somewhere*) or **shelter** (tornado, earthquake — *get to the safest
spot here*). This keeps the mental model tiny.

### The plan is a slideshow, not a document
The recommendation is delivered as a small set of **phased steps** — Preparation →
Evacuation/Brace → At Shelter/Arrival → After — shown one at a time. You can expand a
step into a concrete checklist if you want detail, but you're never forced to read
it all. One headline action sits above everything; the map draws the path.

### One live map, drawn immediately
The map renders as soon as local data is available — it doesn't wait for the AI. It
shows only what helps you act: where you are, the danger zone, the safe destination,
the route, and (for floods) which way the ground actually rises.

The "you are here" marker also carries a **live facing cone** driven by the device
compass, so an instruction like "head north-east" maps to a direction the frightened
person can *physically see* in front of them — not a bearing they have to translate.
It appears only when the device actually reports a heading and is invisible otherwise;
like everything else on the map, it's there to remove a step of translation, not add
chrome.

---

## 5. Honesty as a design principle

A tool people trust under stress has to be transparent about what it knows and
doesn't.

- **The activity log** (in the demo and live-data flows) shows the real pipeline at
  work — every feed queried, every government page fetched — so the plan never feels
  like a black box. It's hidden on phones, where screen space is for the plan, not
  the plumbing.
- **Uncertainty is stated, not hidden.** Recommendations carry a confidence level
  and an explicit uncertainty note when the data is thin.
- **Sources are shown.** Plans cite the official guidance (FEMA, NWS, USGS,
  Ready.gov, Red Cross) they were grounded in.
- **The reasoning is available, but never forced.** Each plan can unfold a collapsed
  **"Why this plan?"** section — the model's own short, bulleted account of *how* it got
  there (the facts it weighed, the tier logic, the trade-offs) so the user can follow the
  logic and check it against what they're actually seeing. Deliberately **5–10 skimmable
  bullets, not a stream of raw chain-of-thought**: a frightened person has no time to read
  a wall of model "thinking," so the transparency is shaped to be glanced at, and it's
  collapsed by default so it never competes with the one action.
- **The app never invents a place.** If it sends you somewhere, that somewhere came
  from real map data.

---

## 6. AI safety by design

The AI is powerful but **deliberately boxed in.** It refines and personalizes; it is
never the sole authority, and it can never strand the user. Safety is layered:

1. **A deterministic plan exists first.** Before the model is ever called, a
   rule-based decision engine has already produced a complete, safe recommendation
   from the geospatial data. The AI's job is to *refine* that — and if the model
   call fails, times out, returns malformed JSON, or no key is configured, the app
   **falls back to the deterministic plan**. It never hangs and never returns
   "no answer."

2. **The model chooses from candidates — it cannot invent.** Destinations,
   shelters, and supply stops are picked only from real places the engine found
   nearby. The AI selects; it does not fabricate locations or directions.

3. **Grounded in official guidance (RAG).** Each plan is retrieved against and
   constrained to authoritative public-safety sources, and told to prefer their
   exact wording for critical safety details.

4. **Hard expert constraints are baked into the system prompt.** The model is
   explicitly forbidden from giving known-dangerous advice — e.g. never shelter
   under a highway overpass (tornado), never stand in a doorway (the debunked
   earthquake myth), never send someone to lower ground in a flood or toward the
   fire. Official evacuation orders always lead; the AI's suggestion is secondary.

5. **Tier-aware safety rules.** In a PREPARE-tier plan the model may not say "take
   cover now"; any sheltering action must be a clearly-labeled *conditional*
   ("*if* a warning is issued…"). Life-safety action is never delayed to gather
   supplies when a hazard is imminent.

6. **Realism guards.** The model is instructed to distinguish the acute-danger
   window from an alert's official expiry, so it won't tell someone to sit in a
   school hallway for days just because a warning runs that long — and to gather
   duration-appropriate supplies only when there's genuinely time.

7. **Validated output.** Responses are parsed defensively and checked against a
   required schema; anything missing falls back to the deterministic result.

8. **No stale advice.** Each plan request is bound to the disaster it was made for;
   if the user moves to a different scenario mid-request, the late response is
   discarded rather than applied to the wrong plan.

9. **It explains; it doesn't decide.** The recovery paperwork helper is scoped on
   purpose: it pulls out deadlines, required proof, and who to contact, but every
   response carries an explicit *"this tool explains, it does not decide insurance
   coverage, aid eligibility, legal rights, or building safety"* note and a
   **human-review-required** list naming the adjuster, agency, contractor, inspector,
   or legal aid who actually decides. The AI is never allowed to pose as the
   authority on a life-altering claim.

10. **It strips sensitive data before sending.** Before a single character of pasted
    *or photographed* paperwork reaches the model, a guardrail
    (`recovery.redact_sensitive_data`) scrubs likely SSNs, bank/card/account numbers,
    full policy/claim numbers, exact addresses, and login credentials to `[REDACTED]`
    — then **continues**, and tells the user what it removed. The extraction never
    needs the personal data (the deadlines, required proof, and contacts come out
    just the same), so the user proceeds instantly instead of hand-editing the
    document, and flagged data is never forwarded to the model. Auto-redacting beats
    rejecting on usability without giving up the privacy promise. (Detection is
    pattern-based, so best-effort; a *photographed* letter is read by the vision model
    first, so redaction there protects the extracted text rather than the image.)

11. **Safety-critical numbers are computed, not generated.** A deadline on a recovery
    letter — the date, the days remaining — is arithmetic a person acts on, and LLMs
    miscount calendars. So the model only **extracts** a deadline's structure (the
    trigger date, the "within 60 days" offset); **code does the date math** and
    overrides the model if they disagree (`recovery.reconcile_deadlines`). The model's
    flexibility finds the deadline in messy wording; deterministic arithmetic
    guarantees the number. A hallucinated deadline can never reach the user.

12. **The human stays the authority.** Every plan carries a calm, collapsed
    **"You know your situation best"** card that tells the user, in plain terms, to
    *override the app when reality disagrees with it*: trust your own eyes and adapt a
    step that doesn't match what you see, treat the plan as guidance rather than a
    guarantee, stop when you're unsure whether something is safe, call 911 first in a
    life-threatening emergency, follow official instructions and on-scene responders
    (police, fire, emergency crews) over the app — they can see what the model can't and
    have the final say — and adjust the plan if something's wrong. On the RUN tier it
    shrinks to two lines so it never slows the
    reflex. Most AI products are designed to be believed; this one is designed to be
    *checked* — naming the AI's fallibility out loud is itself a safety feature, because
    the person on the ground always has information the model doesn't.

The throughline: **the AI makes a safe answer better, but a safe answer never
depends on the AI — and the person on the ground always outranks it.**

---

## 7. Inclusion: not excluding people under stress

The clearest exclusion risk in a tool like this is **language**. ProtectionIV's live-alert
coverage is the **US and Canada** — and Canada is officially bilingual. A francophone
user in Québec receiving English-only, life-or-death instructions is being excluded at
exactly the worst moment.

So ProtectionIV has an **EN / FR language toggle**: the AI-generated plan, headline, and
follow-up Q&A are produced in French (the model is instructed to respond in French —
see `ai.synthesize` / `ai.follow_up`), and the key labels on the plan screen are
localized (`i18n.js`). It's scoped honestly — the marketing landing and some minor
chrome remain English for now — but the part that matters under stress, *the actual
instructions*, speaks the user's language.

Crucially, **the offline deterministic fallback is bilingual too** (`modules.py`,
`_plan_fr`). The whole point of that fallback is to work when the AI doesn't — so it
would defeat the purpose if French collapsed back to English exactly when the model
fails. The French fallback is built from the same structured geospatial decision, with
no dependency on the AI, so a francophone user gets French instructions even on a total
AI outage.

This sits alongside other inclusion choices already in the design:

- **No typing required to get a plan.** The resource check is one-tap buttons —
  a panicking person, or someone with limited literacy, shouldn't have to type.
- **Vulnerability shapes the plan, not just an afterthought.** The same one-tap check
  asks what the plan should account for — limited mobility, medical or powered
  equipment, dependents, no vehicle — and the advice changes accordingly: more lead
  time and accessible routes for limited mobility, power-loss planning for medical
  needs, walking/transit options when there's no car, and never leaving dependents
  behind. Designing for the person who has the *hardest* time evacuating is the point,
  not an edge case.
- **Eyes-free and hands-free.** Every plan slide, the RUN life-safety card, and the
  fallback plan can be **read aloud**, and the question / add-a-step / "something
  changed" boxes accept **voice input** — for someone who is moving, can't look at
  the screen, or can't comfortably read or type under stress. (Both degrade silently
  on browsers without speech support.)
- **Works on a phone, and partly offline.** A PWA with an offline app shell and a
  resumable last plan, for people without a reliable connection.
- **Calm, plain language and reduced-motion support**, so the interface doesn't
  overwhelm someone already overwhelmed.

Language coverage is still a known gap (English + French only), and we name it as one
rather than hiding it.

---

## 8. Protecting the system (and the keys)

Operational safety follows the same minimalist, defensive posture:

- **Secrets never leave the server.** API keys live only in server-side
  environment variables and are used only in backend calls; no endpoint ever
  returns them, and the health check exposes only booleans.
- **Rate limiting** protects the AI budget from scripted abuse — per-IP limits plus
  a global ceiling on the expensive AI endpoints, so even forged source IPs can't
  run up usage.
- **Locked-down CORS** restricts browser access to the known frontends.
- **Bounded inputs.** Request payloads are capped (image size, text fields,
  polygon vertices) so endpoints can't be abused as a free proxy or to inflate
  cost.

---

## 9. The third act: clarity after the danger, too

Recovery is where good intentions usually collapse into a folder of confusing letters
and a list of things you're afraid to do wrong. The Recover flow applies the same
subtraction:

- **The danger passing is the doorway.** A live plan watches its own alert and, once
  it clears, offers a one-tap handoff into Recover — so the third act is the earned
  next beat, not a separate thing you have to go find.
- **One cohesive surface, not a dashboard.** You pick what you went through and get a
  **clean-up & re-entry guide** plus an **"Ask anything" recovery assistant**. Insurance
  isn't a co-equal tab competing for attention; it's one thing the assistant helps with —
  and you can attach the letter where it's most useful.
- **The clean-up plan is the same calm slideshow** as a response plan — *before you go
  back in → document everything → clean up → health and next steps* — phased, one step
  at a time, expandable on demand, and **read-aloud** like the rest. Recovery injuries
  (carbon monoxide, electrical, ash, mold) are common and preventable, so the safety
  sequence leads.
- **The paperwork explains itself, with the dates worked out for you.** Paste — or
  **photograph** — an insurance, FEMA, or Canadian provincial-aid letter and it pulls
  out the required proof, the contacts, and the **computed deadlines** (the real date,
  days remaining, and how urgent), classifies the document, and weaves those specifics
  into your clean-up plan instead of generic "start your claim" advice. The dates are
  computed, never guessed (§6, point 11).
- **Grounded, never improvised.** Clean-up steps are retrieved against official
  return-home guidance (Ready.gov, CDC, EPA, Earthquake Country Alliance); the paperwork
  engine extracts what's *in your document*, it doesn't invent obligations.
- **Honest about its limits.** It explains paperwork and builds checklists — it does
  **not** decide coverage, eligibility, legal rights, or building safety, and it says
  so every time and names who does (see §6, points 9–10). And it **strips sensitive
  data** before forwarding anything to a model, then continues — privacy without the
  friction of making you redact by hand.
- **Bilingual where it matters.** Like the response plan, the Recover tools speak
  EN / FR — including the assistant, the computed-deadline output, and the
  "who must confirm" guardrail — and the deterministic clean-up fallback is bilingual
  too, so French survives an AI outage here as well.

Recovery, in other words, isn't a bolt-on. It's the same belief — *reduce the load on
an overwhelmed person, never at the expense of safety* — carried into the part of a
disaster that lasts the longest.

---

## In one line

**ProtectionIV reduces disaster response to one clear next action — and is engineered,
visually and architecturally, so that the simplicity is never at the expense of
safety.** The minimalism *is* the safety: less to read, less to doubt, less to slow
you down, and a system designed so the most trustworthy answer is always the one
you're given.
