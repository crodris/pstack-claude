---
name: setup-pstack
description: Configure which Claude model pstack uses per role. Writes an always-loaded user rule that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.claude/rules/pstack-models.md`, a user rule loaded into every session that sets pstack's model per role.

Valid values are the Agent tool's `model` aliases (`fable`, `opus`, `sonnet`, `haiku`) plus `inherit-parent` and `auto`, which both mean the role runs on the parent chat model (omit Agent `model`).

## Steps

### 1. Load current state

If `~/.claude/rules/pstack-models.md` exists, read it and treat its `# budget` line and role values as the current choices. Otherwise start from the `unlimited` shape in step 4. A line whose role is not in step 4 and does not start with `cursor`, such as `how critics`, is from a retired role. Drop it.
Keep every line whose role starts with `cursor`, such as `cursor default`, unchanged. Those lines set Cursor CLI models for the user's own `cursor` skill, and no budget changes them.

### 2. Budget

The budget only sets the model for subagents pstack spawns. The main chat model is untouched. Capability and quota cost both run `opus` > `sonnet` > `haiku`. No budget uses `fable`. Set it on a role by hand to use it.

Ask with AskUserQuestion, naming the current budget when the rule records one. Describe each option by what the roles end up on, in these words, not as a transformation of another budget.

| budget | judgment roles | code workers | fast roles | panel lists |
|---|---|---|---|---|
| `unlimited` | `opus` | `opus` | `sonnet` | `opus, sonnet` |
| `large` | `opus` | `sonnet` | `sonnet` | `opus, sonnet` |
| `medium` | `sonnet` | `sonnet` | `sonnet` | `sonnet, sonnet` |
| `small` | `sonnet` | `sonnet` | `haiku` | `sonnet` |

- Judgment roles: `judgment and prose`, `hardest tasks`, `how explainer`, `why synthesizer`, both `reflect` lines.
- Code workers: `feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb`.
- Fast roles: `how explorer`, `why investigators`, `swarm workers`.
- Panel lists: `arena runners`, `arena cross-judge pool`, `architect runners`, `interrogate reviewers`.

Recommend `large` on a subscription plan. Workers dominate token burn and are `sonnet` in every budget but `unlimited`, so the judgment roles are the cheap place to keep a strong model. `unlimited` also puts code workers on `opus`, which spends quota fastest.

On a re-run, keep any role the user changed by hand. `inherit-parent` and `auto` never change.

### 3. Show the roles and confirm

Show every role with its model. Also list each line step 1 dropped, and each `cursor` line it kept unchanged. Ask whether to accept as-is or change specific roles. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list and one subagent runs per entry, so the list length sets the fan-out and the cost. `arena cross-judge pool` is also a list, but Arena runs one judge. It tries only models other than the parent's, in list order, so order it by preference. An `inherit-parent` or `auto` value never judges. `swarm workers` is the default for every worker unless a race assigns a model per arm.

### 4. Write the rule

Overwrite the whole file so re-runs stay idempotent. Write the `cursor` lines from step 1 after the pstack roles. Shape:

```
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Agent `model`). Alias entries in a panel list still count toward its fan-out.
# budget: unlimited
feature, refactoring: opus
bug-fix: opus
perf-issue: opus
hillclimb: opus
judgment and prose: opus
hardest tasks: opus
how explorer: sonnet
how explainer: opus
why investigators: sonnet
why synthesizer: opus
reflect tooling: opus
reflect judgment, divergent, synthesizer: opus
arena runners: opus, sonnet
arena cross-judge pool: opus, sonnet
swarm workers: sonnet
architect runners: opus, sonnet
interrogate reviewers: opus, sonnet
```

### 5. Confirm

Tell the user the rule was written and that it applies to new sessions. Re-running this skill updates it.

### 6. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /pstack:create-verification-skill." On yes, read `../create-verification-skill/SKILL.md` relative to this skill's base directory and follow it. On no, move on without pushing.

### 7. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /pstack:create-formal-verification-skill." On yes, read `../create-formal-verification-skill/SKILL.md` relative to this skill's base directory and follow it. On no, move on without pushing.
