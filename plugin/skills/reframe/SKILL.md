---
name: reframe
description: "Teach the expert words for what the operator is building, borrow words from neighboring fields that solved the same problem, then rewrite their description with them. Use for /reframe."
disable-model-invocation: true
---

Teach the operator the expert words for what they are building. Start from their own files, code and description, not a summary.

If their description could name more than one problem, first list the two or three problems it could be, each with the one term that names it and the sign that would tell it apart from the others. Then teach the words for the most likely one and say why you picked it.

1. Give 8 to 12 terms, ranked by how much each would change what gets built. For each, give the word and its meaning in one plain sentence, the part of their description it names, one real project, paper or system that uses it that way, with a link, and what it lets them ask an agent for.
2. Pick 2 or 3 neighboring fields that solved the same shape of problem under other names. For each, say what carries over, where the analogy breaks, and which terms come back.
3. Name what they didn't mention but should care about.
4. Rewrite their description with the new words.

Open every link and confirm it uses the term that way. Cut any citation you can't confirm. No padding.

## Running under Claude Code

This skill is ported from Cursor's pstack. Apply these translations wherever the text above assumes Cursor.

- **Sibling skills.** "The **x** skill", `/x`, and `principle-*` references mean the file `../x/SKILL.md` relative to this skill's base directory. Read it and follow it. Do not call the Skill tool for pstack skills, most are user-invocable only.
- **Subagents.** Spawn with the Agent tool. It has no `readonly` or `environment` parameter, so ignore both. There is no cloud environment. Workers run locally, and any worker that writes gets `isolation: "worktree"`.
- **Models.** Agent `model` accepts only `fable`, `opus`, `sonnet`, `haiku`. Per-role overrides live in `$HOME/.claude/rules/pstack-models.md` (written by `/pstack:setup-pstack`). A value of `inherit-parent` or `auto` means omit `model`.
- **Reasoning levels.** A default such as `opus xhigh` names the Agent `model` and a level. Pass the level a skill picks (`low`, `medium`, `high`, `xhigh`, `max`) as the Agent `effort` parameter.
- **Missing Cursor skills.** `cursor-team-kit` is not installed. For `/deslop` use `/simplify`. For `control-ui` drive the app with whatever browser automation tools are available. For `control-cli` use Bash. For Cursor's built-in `create-skill` use any installed skill-authoring skill.
- **Bugbot.** Guidance about Bugbot applies to whatever review bot comments on the PR (CodeRabbit, etc.).
