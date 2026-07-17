---
name: neurodivergent-ux-review
disable-model-invocation: true
description: "Use when a public-facing surface — docs, components, emails, HTML, design tokens, marketing pages — needs review from a neurodivergent-user perspective. Evaluates cognitive load, sensory triggers (motion, colour, sound), time blindness, executive function, predictability, attention, working memory, reading load, motor planning, and anxiety-inducing patterns. Project-agnostic sub-reviewer lens. Cheap to invoke — frequently returns 'no change' or 'not applicable'."
license: Proprietary
compatibility: Project-agnostic; suitable for doc-reviewer orchestration.
metadata:
  version: "1.0"
  role: review-lens
  opus:
    role: sub-reviewer
    reviewer:
      category: ux
      triggers:
        files:
          - "**/*.md"
          - "**/*.mdx"
          - "**/*.tsx"
          - "**/*.jsx"
          - "**/*.html"
          - "**/*.htm"
          - "**/*.vue"
          - "**/*.svelte"
          - "**/*.css"
          - "**/*.scss"
          - "**/emails/**"
          - "**/design/**"
          - "**/styles/**"
        concerns:
          - "neurodivergent"
          - "cognitive load"
          - "sensory"
          - "executive function"
          - "time"
          - "predictability"
          - "attention"
          - "motion"
          - "colour"
          - "accessibility"
          - "anxiety"
      input_types:
        - "document"
        - "file"
        - "diff"
      primary_for:
      always_with:
---

# Neurodivergent UX Review Skill

## Purpose

Use this skill to review whether a public-facing artefact — documentation, app surface, email, design system, marketing page, motion design — works for users with neurodivergent cognition: autism, ADHD, dyslexia, dyscalculia, sensory processing differences, executive function challenges, anxiety, OCD, Tourette's, photosensitive epilepsy, and related profiles. Also relevant for burnt-out, low-capacity, or temporarily overwhelmed users.

This is distinct from:

- Coordinates with broader humane lenses and general UX/accessibility lenses; the cognitive/sensory layer is the focus.
- **`trust-and-claims-review`** — substantiation of claims. Coordinates on urgency/scarcity language.

It specifically asks:

```text
Could this design cognitively overload, sensory-overload, or quietly
exclude someone whose brain works differently from the assumed default?
```

## When to Invoke

This skill is cheap. Invoke on:

- New public-facing pages, components, or sections (default yes)
- UI redesigns, visual overhauls, motion/animation changes
- New email templates (transactional and marketing)
- New documentation pages or docs-site sections
- Design-system colour, typography, motion, or spacing changes
- Marketing copy with urgency, scarcity, or FOMO language
- Onboarding, activation, or first-run flows
- Pricing, checkout, and conversion flows
- Settings, preferences, and account management
- Notification, alert, and banner systems
- Empty states, error states, loading states

You may explicitly skip with reason if:

- Pure backend or infrastructure code (no user-visible surface)
- Internal tooling for power users with established workflows
- Test fixtures, mocks, or generated code
- Pure data exports, logs, or reports

## Adjacent Agent Delegation

When triggered, also invoke:

This skill is itself an adjacent reviewer and is wired into `opus-doc-reviewer` and `trust-and-claims-review` for automatic invocation on public surfaces.

## What to Check

### Cognitive Load

- Information density per screen (> 7±2 distinct items risks overload)
- Decision fatigue (more than 5 mutually exclusive choices without guidance)
- Reading level (grade 8–10 for general audiences; lower for transactional flows)
- Required recall (asking user to remember info from a previous screen)
- Working-memory burden (long instructions, multi-step without progress, hidden rules)
- Modal stacks and nested dialogs (depth > 1 = escape risk)
- Jargon, acronyms without expansion, insider language

### Sensory

- Flashing or strobing content (> 3 flashes/sec = seizure risk; WCAG 2.3.1)
- Bright pure-white backgrounds (alternatives: off-white #FAFAFA, dark mode)
- High-saturation colour combinations that vibrate or strain
- Autoplaying video, audio, animations
- Hover-triggered sounds or motion without opt-out
- Haptic feedback on critical paths without user control
- Parallax, infinite scroll with no end, auto-advancing carousels
- Sudden layout shifts after load (CLS > 0.1)

### Time

- Visible countdowns that create urgency (only where time is genuinely critical)
- Loading indicators without progress (spinners > 5s need percentage or skeleton)
- Session timeouts without warning (> 2 min idle before warning)
- "X minutes remaining" without context (what happens at 0?)
- No time-estimate for long operations
- Date/time displays without timezone or relative format

### Executive Function

- Empty states that don't guide ("Nothing here yet" with no next step)
- Multi-step flows without save / resume
- No clear "what's next" after completion
- Forced sequencing when parallel work is possible
- Hidden state (active filter, search, sort that doesn't show it's active)
- Required re-entry of data after interruption
- Task initiation friction (cold-start with no scaffolding)
- Completion ambiguity (no clear end-state or success signal)

### Predictability

- Layout shifts after load (CLS > 0.1 = jarring)
- Hidden affordances (buttons that look like text, or vice versa)
- Inconsistent interaction patterns across pages
- Auto-redirects without warning
- Destructive actions (delete, archive, send) without confirmation or undo
- Auto-save that doesn't tell you it saved (or fails silently)
- UI changes that don't persist (back button loses state)
- Surprise navigation (deep-link changes URL without warning)

### Attention

- Infinite scroll with no end (no "you're up to date" indicator)
- Multiple notifications competing for attention
- Inconsistent refresh patterns (pull vs tap vs auto)
- Banner blindness from overuse (every page has a banner)
- Distracting animation on critical-path screens (checkout, forms, settings)
- Auto-playing carousels that move while user is reading

### Working Memory

- Multi-step forms without progress indicator
- "Smart" forms that guess and overwrite user input
- Required-field indicators only after submit error
- Error messages that lose the user's input
- Search that loses the query on result click
- Required context that must be held across screens

### Reading-Friendly

- Line length (45–75 chars optimal; > 90 chars = re-read burden)
- Line height (1.4–1.6 for body text)
- Justified text (creates "rivers" of whitespace that disrupt flow)
- All-caps for body text (slower to read, reads as shouting)
- Font size < 16px for body (zoom required = friction)
- Long paragraphs without subheads (> 5 sentences)
- Italics for emphasis (harder to read than bold)
- Light grey text on light background (low contrast)

### Motor Planning

- Click targets < 44×44 px (touch) or < 32×32 px (pointer)
- Hover-only reveals (no keyboard or touch equivalent)
- Drag-only interactions without keyboard alternative
- Tightly packed controls without spacing buffer
- Double-click required for irreversible actions
- No forgiveness for misclick (no undo, no "are you sure")
- Time-limited interactions (< 200ms to react)

### Anxiety Reduction

- Urgency language ("Hurry!", "Last chance!", "Only 2 left!")
- Fake scarcity ("Only 3 items left!" when stock is plentiful)
- Fake countdowns (timers that reset on refresh)
- Dark patterns that exploit loss aversion ("Don't miss out!")
- Forced engagement (modal you can't dismiss, infinite loops)
- Notification opt-outs buried in settings
- Confirmshaming ("No thanks, I hate saving money")
- Progress loss threats ("You'll lose your progress!")
- Social pressure ("47 people are viewing this right now")

### Routine Disruption

- Silent UI changes (redesign pushed without notice)
- Reset of user preferences on update
- Loss of unsaved work on navigation
- Surprise logout / session expiry
- Permission changes that revoke prior grants without notice
- Email frequency changes without opt-in
- New mandatory onboarding steps added to existing flow

## Severity Guidance

- **Blocker** — sensory trigger with safety impact (flashing > 3 Hz, autoplay audio, photosensitive seizure risk); mandatory destructive action with no undo and no warning; cognitive load that makes the surface unusable for the target population.
- **Major** — sustained cognitive overload (> 7 items per screen with no grouping); missing progress indicator on 3+ step flow; autoplay without user control; urgency language in non-emergency context; click targets < 32×32 px; pure white background with no dark mode option; reading level above target audience.
- **Minor** — borderline information density; subtle inconsistent patterns; mild urgency language; small click targets (32–44 px); light-grey text on light background; missing progress on 2-step flow.

Many reviews will return **"no change"** — surfaces that already respect these principles pass cleanly. State this explicitly in the output, do not invent issues to fill space.

## Output Format

```
## Neurodivergent UX Review

### Summary
- <one-line: clear / minor concerns / blockers found / not applicable>

### Cognitive Load
- <findings or "no concerns">

### Sensory
- <findings or "no concerns">

### Time
- <findings or "no concerns">

### Executive Function
- <findings or "no concerns">

### Predictability
- <findings or "no concerns">

### Attention
- <findings or "no concerns">

### Working Memory
- <findings or "no concerns">

### Reading-Friendly
- <findings or "no concerns">

### Motor Planning
- <findings or "no concerns">

### Anxiety Reduction
- <findings or "no concerns">

### Routine Disruption
- <findings or "no concerns">

### Verdict
- Blocker: <count>
- Major: <count>
- Minor: <count>
- No change: <count of areas reviewed and passed>
- Not applicable: <count of areas not relevant to this surface>

### Recommended Actions
- <prioritised fix list, lowest friction first>
- <or "No actions — surface is neurodivergent-friendly as designed">

### Coordination Notes
- <issues that overlap with general UX, humane, microcopy, and accessibility lenses so the orchestrator can deduplicate>
```

## Boundaries

- Read-only on code and design assets
- Does not edit files
- Coordinates with general UX, accessibility, humane, and microcopy-specificity lenses
- Focuses on the cognitive/sensory layer that other reviews typically miss
