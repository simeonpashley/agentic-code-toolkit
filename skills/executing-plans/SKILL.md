---
name: executing-plans
description: "Use when a written implementation plan exists in docs/plans/ and the work has already been decomposed into bite-sized tasks with explicit verification steps. Loads the plan, reviews it critically for gaps or contradictions, executes tasks in order, runs each verification, and hands off to finishing-a-development-branch when all checks pass. Prefers subagent-driven execution when the platform supports it. Stop and ask the human partner on blockers, repeated verification failures, or unclear instructions rather than guessing. Do not use when no plan exists (write one with writing-plans first) or for ad-hoc implementation (use test-driven-development). Each task that runs an irreversible command must clear the Workflow Sanity Gates trigger (~/.pi/agent/docs/sanity-gates.md) before execution; refuse if unsafe, impossible, or underspecified."
---

**Pre-Flight:** Workflow Sanity Gates (`AGENTS.md` → "Workflow Sanity Gates"; detail at `~/.pi/agent/docs/sanity-gates.md`) — any task whose step runs an irreversible shell command (`rm -rf`, `drop`, `force-push`, prod `migrate --apply`, branch deletion, etc.) is a trigger point. The executing session must have risks, missing evidence, edge cases, and test strategy in hand before each such step; refuse the step if unsafe, impossible, or underspecified.

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents. The quality of its work will be significantly higher if run on a platform with subagent support (Claude Code, Codex CLI, Codex App, Copilot CLI, and Gemini CLI all qualify; see the per-platform tool refs in `../using-superpowers/references/`). If subagents are available, use superpowers:subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan

1. Read plan file
2. Review critically - identify any questions or concerns about the plan
3. If concerns: Raise them with your human partner before starting
4. If no concerns: Create todos for the plan items and proceed

### Step 2: Execute Tasks

For each task:

1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified:

- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch
- Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**

- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**

- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember

- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Required workflow skills:**

- **superpowers:using-git-worktrees** - Ensures isolated workspace (creates one or verifies existing)
- **superpowers:writing-plans** - Creates the plan this skill executes
- **superpowers:finishing-a-development-branch** - Complete development after all tasks
