---
name: sharpen
description: "Make a task deeper, not bigger, then rewrite the prompt. Use for /sharpen."
disable-model-invocation: true
---

I want a deeper version of this task, not a bigger one. Before rewriting it, do four things:

1. Say what a top professional in this field would do here that I'm not asking for.
2. Name the rawest material they would start from instead of what has already been digested for me.
3. Name the specific methods and tools they would use.
4. Say what, other than you or me, would show the result is right.

Then rewrite my prompt to ask for exactly that.

Have the rewritten prompt ask the agent to prototype any choice an experiment can settle and recommend an option based on what it observed. Leave product or preference choices that no experiment can settle for me to make.

## Running under Claude Code

This skill is ported from Cursor's pstack. Apply these translations wherever the text above assumes Cursor.

- **Sibling skills.** "The **x** skill", `/x`, and `principle-*` references mean the file `../x/SKILL.md` relative to this skill's base directory. Read it and follow it. Do not call the Skill tool for pstack skills, most are user-invocable only.
- **Subagents.** Spawn with the Agent tool. It has no `readonly` or `environment` parameter, so ignore both. There is no cloud environment. Workers run locally, and any worker that writes gets `isolation: "worktree"`.
- **Models.** Agent `model` accepts only `fable`, `opus`, `sonnet`, `haiku`. Per-role overrides live in `$HOME/.claude/rules/pstack-models.md` (written by `/pstack:setup-pstack`). A value of `inherit-parent` or `auto` means omit `model`.
- **Reasoning levels.** The aliases carry no level. Pass the level a skill picks (`low`, `medium`, `high`, `xhigh`, `max`) as the Agent `effort` parameter.
- **Missing Cursor skills.** `cursor-team-kit` is not installed. For `/deslop` use `/simplify`. For `control-ui` drive the app with whatever browser automation tools are available. For `control-cli` use Bash. For Cursor's built-in `create-skill` use any installed skill-authoring skill.
- **Bugbot.** Guidance about Bugbot applies to whatever review bot comments on the PR (CodeRabbit, etc.).
