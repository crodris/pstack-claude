---
name: architect
description: "Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock in the wrong shape."
disable-model-invocation: true
---

# Architect

Before writing code, trace every system the change touches, then sketch two different shapes for it (types, signatures, module boundaries) and pick the one where each piece of state has one owner, each task has one way to do it, and callers need to know least. Redesign instead of patching if workarounds repeat.

For a large or contested design, run the **arena** skill instead of sketching alone.

## Running under Claude Code

This skill is ported from Cursor's pstack. Apply these translations wherever the text above assumes Cursor.

- **Sibling skills.** "The **x** skill", `/x`, and `principle-*` references mean the file `../x/SKILL.md` relative to this skill's base directory. Read it and follow it. Do not call the Skill tool for pstack skills, most are user-invocable only.
- **Subagents.** Spawn with the Agent tool. It has no `readonly` or `environment` parameter, so ignore both. There is no cloud environment. Workers run locally, and any worker that writes gets `isolation: "worktree"`.
- **Models.** Agent `model` accepts only `fable`, `opus`, `sonnet`, `haiku`. Per-role overrides live in `$HOME/.claude/rules/pstack-models.md` (written by `/pstack:setup-pstack`). A value of `inherit-parent` or `auto` means omit `model`.
- **Reasoning levels.** The aliases carry no level. Pass the level a skill picks (`low`, `medium`, `high`, `xhigh`, `max`) as the Agent `effort` parameter.
- **Missing Cursor skills.** `cursor-team-kit` is not installed. For `/deslop` use `/simplify`. For `control-ui` drive the app with whatever browser automation tools are available. For `control-cli` use Bash. For Cursor's built-in `create-skill` use any installed skill-authoring skill.
- **Bugbot.** Guidance about Bugbot applies to whatever review bot comments on the PR (CodeRabbit, etc.).
