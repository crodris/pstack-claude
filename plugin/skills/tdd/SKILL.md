---
name: tdd
description: "Use only when the user explicitly asks for TDD, a failing test, or a regression test, OR when the bug has an obvious cheap local test target. Skip when the test path is unclear, expensive, integration-heavy, or not requested."
disable-model-invocation: true
---

# TDD Bug Fix

When fixing a bug with a clear, cheap test path, make the broken behavior executable before changing production code. The goal is a focused regression test that fails before the fix and passes after it.

Do not force a test when it would be impractical. If the available test would require broad harness setup, brittle mocks, slow end-to-end infrastructure, production-only state, vague reproduction steps, or large unrelated fixture churn, skip adding a new test and use the closest useful verification instead.

## Workflow

1. **Understand the bug.** Identify the intended behavior, current behavior, affected path, and smallest observable reproduction.
2. **Choose the narrowest executable check.** Prefer the closest unit, component, integration, or regression test already used for that codepath. If no practical test path is obvious, do not create one from scratch just to satisfy the workflow.
3. **Write the failing test first.** Add the smallest focused test that would have caught the bug. The test should encode intended behavior, not mirror the current implementation.
4. **Run the new test before fixing.** Confirm it fails for the intended reason. If it passes or fails for an unrelated reason, correct the test or reproduction before editing the implementation.
5. **Fix the bug.** Make the smallest production change that satisfies the intended behavior while preserving nearby contracts.
6. **Rerun the regression test.** Confirm the test now passes.

## If a Failing Test Is Impractical

Use the closest executable regression check instead: a targeted script, manual reproduction command, browser automation, snapshot comparison, log assertion, or focused integration check.

Prefer no new test over a bad test. A bad test is one that mostly tests mocks, encodes current implementation details, depends on timing or unrelated global state, needs expensive infrastructure for a small fix, or would be deleted immediately after proving the fix.

## Guardrails

- Do not change tests merely to match a wrong implementation.
- Do not weaken existing assertions unless the expected behavior has genuinely changed and the reason is clear.
- Keep the regression test focused on the bug. Avoid broad fixture churn or unrelated coverage expansion.
- If the bug is flaky, make the test deterministic where possible and document the signal being locked down.
- If the bug exposes a broader class of failures, first land the focused regression path, then consider additional sibling coverage.

## Final Response

Report the evidence, not just the outcome:

- Name the failing-before test or executable check and the failure it produced.
- Name the passing-after test run and any nearby validation performed.
- If failing-before evidence could not be demonstrated, state why and describe the closest regression check used instead.

## Running under Claude Code

This skill is ported from Cursor's pstack. Apply these translations wherever the text above assumes Cursor.

- **Sibling skills.** "The **x** skill", `/x`, and `principle-*` references mean the file `../x/SKILL.md` relative to this skill's base directory. Read it and follow it. Do not call the Skill tool for pstack skills, most are user-invocable only.
- **Subagents.** Spawn with the Agent tool. It has no `readonly` or `environment` parameter, so ignore both. There is no cloud environment. Workers run locally, and any worker that writes gets `isolation: "worktree"`.
- **Models.** Agent `model` accepts only `fable`, `opus`, `sonnet`, `haiku`. Per-role overrides live in `~/.claude/rules/pstack-models.md` (written by `/pstack:setup-pstack`). A value of `inherit-parent` or `auto` means omit `model`.
- **Missing Cursor skills.** `cursor-team-kit` is not installed. For `/deslop` use `/simplify`. For `control-ui` drive the app with whatever browser automation tools are available. For `control-cli` use Bash. For Cursor's built-in `create-skill` use any installed skill-authoring skill.
- **Bugbot.** Guidance about Bugbot applies to whatever review bot comments on the PR (CodeRabbit, etc.).
