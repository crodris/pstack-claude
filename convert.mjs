#!/usr/bin/env node
// Converts cursor/plugins pstack into a Claude Code plugin at ./plugin.
// Re-run to update: pulls upstream, regenerates ./plugin from scratch, reports leftover Cursor-isms.
// `--check` regenerates at the upstream commit plugin/ was built from, into a temp dir, and fails if plugin/ differs.
// PSTACK_UPSTREAM_SHA, a full 40-character commit on cursor/plugins main, pins a regeneration to that commit instead of
// upstream main, so a test that runs convert.mjs gets the same result however upstream moves.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const UPSTREAM = join(ROOT, ".upstream");
const SRC = join(UPSTREAM, "pstack");
const PLUGIN = join(ROOT, "plugin");
const CHECK = process.argv.includes("--check");
const OUT = CHECK ? mkdtempSync(join(tmpdir(), "pstack-check-")) : PLUGIN;
if (CHECK) process.on("exit", () => rmSync(OUT, { recursive: true, force: true }));
const REPO = "https://github.com/cursor/plugins";

// Cursor Automations webhooks, no Claude Code equivalent.
const SKIP_SKILLS = ["make-bot-ui"];

// Upstream marks every skill user-invocable only. The model has to invoke these itself,
// poteto-mode from the reminder hook and unslop from writing skills such as voice.
const MODEL_INVOKED = ["poteto-mode", "unslop"];

// Ordered. Specific before generic.
const REPLACEMENTS = [
	// Paths
	[/~\/\.cursor\/rules\/pstack-models\.mdc/g, "~/.claude/rules/pstack-models.md"],
	[/~\/\.cursor\/projects\/<slug>\/agent-transcripts\/<uuid>\/<uuid>\.jsonl/g, "~/.claude/projects/<slug>/<uuid>.jsonl"],
	[
		/with the leading slash dropped and each "\/" turned into "-" \(so `\/Users\/you\/proj` becomes `Users-you-proj`\)/g,
		'with every non-alphanumeric character turned into "-" (so `/Users/you/proj` becomes `-Users-you-proj`)',
	],
	[/`agent-transcripts\/` directory(?: the system prompt names)?/g, "transcript directory (`$HOME/.claude/projects/<slug>/`, where `<slug>` is the absolute project path with every non-alphanumeric character turned into `-`)"],
	[/\(the system prompt names (?:the|this) path/g, "(derive it from the project path"],
	[/The system prompt names the/g, "Locate the"],
	[/sed 's#\^\/##; s#\/#-#g'/g, "sed 's#[^A-Za-z0-9]#-#g'"],
	[/\.cursor\/projects\/\$slug\/agent-transcripts/g, ".claude/projects/$slug"],
	[/\.cursor\/projects\/<slugified-repo-path>\/agent-transcripts/g, ".claude/projects/<slugified-repo-path>"],
	[/\.cursor\/(skills|plugins|projects|worktrees)\//g, ".claude/$1/"],
	[/\.cursor-plugin\/plugin\.json/g, ".claude-plugin/plugin.json"],

	// Tools
	[/\bAskQuestion\b/g, "AskUserQuestion"],
	[/generalPurpose/g, "general-purpose"],
	[/`Task`/g, "`Agent`"],
	[/\bTask (tool|`model`)/g, "Agent $1"],
	[/\bTask subagent/g, "subagent"],
	[/\bTask spawn/g, "subagent spawn"],
	[/subagent_type: "poteto-agent"/g, 'subagent_type: "pstack:poteto-agent"'],
	[/subagent_type: "comment-sicko"/g, 'subagent_type: "pstack:comment-sicko"'],

	// Models. Claude Code subagents run Claude only, so the cross-vendor panel maps by role:
	// Fable to fable, Opus to opus, and the non-Claude seat to sonnet, so panels stay three distinct models.
	// Claude Code aliases carry no speed suffix, so these sentences about slug suffixes go first.
	// Each slug keeps its level as `<alias> <level>`, which ADAPTER_NOTE maps to Agent `effort`,
	// the same mapping upstream's docs/harness/claude-code.md uses. Agent frontmatter takes the alias alone.
	[/ Opus 5\.5 always runs its `-fast` slug\./g, ""],
	[/ A Gemini seat never runs above `gemini-[\d.]+-[a-z]+-(?:low|medium|high|xhigh|max)`\./g, ""],
	[/^model: claude-opus-[\d-]+[a-z]+(?:-fast)?$/gm, "model: opus"],
	[/claude-opus-[\d-]+(low|medium|high|xhigh|max)(?:-fast)?/g, "opus $1"],
	[/claude-fable-[\d-]+(low|medium|high|xhigh|max)(?:-fast)?/g, "fable $1"],
	[/gemini-[\d.]+-[a-z]+-(low|medium|high|xhigh|max)\b/g, "sonnet $1"],
	[/The `\/setup-pstack` budget sets each role's starting level\./g, "Each role starts at its default's level, since `/setup-pstack` sets only the model."],
	[
		/If it rejects the default, use the closest valid slug of the same family from its error message\./g,
		"If it rejects the default, omit `model` and say so.",
	],
	// Every seat is a Claude model, so arena's families and its judge's vendor check compare models.
	[
		/Families go by prefix, and the longest match wins: `claude-fable-\*`, `claude-\*`, and `gemini-\*`, after dropping a leading `cursor-`\. Any other slug's family is its text before the first hyphen\./g,
		"Under Claude Code each model (`fable`, `opus`, `sonnet`, `haiku`) counts as its own family, so a rejected slug has no same-family slug to fall back to.",
	],
	[
		/The judge is never from the parent's vendor, and Fable counts as Claude for that check, so use the first entry from another vendor\./g,
		"Under Claude Code every entry is a Claude model, so the vendor check compares models instead. The judge is never the parent's model, so use the first entry that differs from it.",
	],
	[/another vendor's model/g, "another model"],
	// The setup-pstack overlay writes no `# defaults` line, so this check would ask for a rerun every session.
	[/ If the rule has no `# defaults: 3` line, an older setup wrote it\. Keep honoring its lines, and tell the user once per session to rerun `\/setup-pstack`\./g, ""],
];

const ADAPTER_NOTE = `
## Running under Claude Code

This skill is ported from Cursor's pstack. Apply these translations wherever the text above assumes Cursor.

- **Sibling skills.** "The **x** skill", \`/x\`, and \`principle-*\` references mean the file \`../x/SKILL.md\` relative to this skill's base directory. Read it and follow it. Do not call the Skill tool for pstack skills, most are user-invocable only.
- **Subagents.** Spawn with the Agent tool. It has no \`readonly\` or \`environment\` parameter, so ignore both. There is no cloud environment. Workers run locally, and any worker that writes gets \`isolation: "worktree"\`.
- **Models.** Agent \`model\` accepts only \`fable\`, \`opus\`, \`sonnet\`, \`haiku\`. Per-role overrides live in \`$HOME/.claude/rules/pstack-models.md\` (written by \`/pstack:setup-pstack\`). A value of \`inherit-parent\` or \`auto\` means omit \`model\`.
- **Reasoning levels.** A default such as \`opus xhigh\` names the Agent \`model\` and a level. Pass the level a skill picks (\`low\`, \`medium\`, \`high\`, \`xhigh\`, \`max\`) as the Agent \`effort\` parameter.
- **Missing Cursor skills.** \`cursor-team-kit\` is not installed. For \`/deslop\` use \`/simplify\`. For \`control-ui\` drive the app with whatever browser automation tools are available. For \`control-cli\` use Bash. For Cursor's built-in \`create-skill\` use any installed skill-authoring skill.
- **Bugbot.** Guidance about Bugbot applies to whatever review bot comments on the PR (CodeRabbit, etc.).
`;

// Per-skill additions, appended after ADAPTER_NOTE. poteto-help answers setup and mode questions for a
// Cursor install, tells Claude Code users to install upstream's Cursor plugin, and links docs this plugin does not ship.
// The two formal verification notes replace upstream's TLA+ checker choice with tla-ts, which needs no Java.
const SKILL_NOTES = {
	"poteto-help": `- **Install.** Run \`claude plugin marketplace add <path to a pstack-claude checkout>\`, then \`claude plugin install pstack@pstack-claude\`. Skills run as \`/pstack:<name>\`. This replaces every install step above (\`/add-plugin pstack\`, Customize, and the \`cursor/plugins\` commands). The Claude Code adapter page that the \`cursor/plugins\` paragraph links is not shipped; this note is that adapter.
- **Modes.** Claude Code has no Custom Modes, so ignore every Custom Mode instruction above: Enter, Option+Enter, Use as Mode, mentioning a Custom Mode, and the fix-table advice to start one. A \`UserPromptSubmit\` hook reminds Claude to invoke \`poteto-mode\` once per coding task and to skip general questions and turns where the user opts out, and \`poteto-mode\` and \`unslop\` also load without a slash command. This replaces the claims above that installing changes nothing and that only \`/setup-pstack\` loads from the user's words. When the mode stopped applying, the turn read as a general question, the task already invoked it once, or the user opted out: type \`/pstack:poteto-mode\` to start it again. Plan Mode means Claude Code's plan mode.
- **Guide pages.** The README and \`docs/guide\` pages are not shipped with this plugin. Read them upstream at https://github.com/cursor/plugins/tree/main/pstack. Their install steps are for Cursor, so use the Install note above instead.
- **Not ported.** \`/make-bot-ui\` needs Cursor Automations and is not in this plugin.
`,
	"create-formal-verification-skill": `- **TLA+ checker.** This replaces the tool choice above for TLA+ models. Check them with [tla-ts](https://github.com/aidenybai/tla-ts), a TLA+ model checker for Node that reads TLC's specs and configs. It needs Node 22.8 or later and declares no \`engines\` field, so name that prerequisite in the generated skill. Check the local Node before the first run, since an older Node stops tla-ts at startup, which is not a model failure. Run the check in CI on Node 22.8 or later in its own step or job, and keep the Node versions the repo's other CI jobs test. When the repo cannot run Node 22.8 or later, check every model with TLC. Pin one TLC version, name Java as a prerequisite, skip the tla-ts install, and record that reason in the generated skill. When tla-ts runs and the repo root has a \`package.json\`, add tla-ts to it as a devDependency pinned to an exact version, and run the \`tla-ts\` binary from the repo's install. Otherwise run it through npx pinned to the exact version you checked, such as \`npx --yes tla-ts@0.0.8\`. If tla-ts fails on a model that TLC accepts, by refusing it with \`TlaUnsupportedError\` or stopping with another checker error, tell the user what failed. Then pin a TLC version for that model only, name Java as a prerequisite, and record in the generated skill why that model uses TLC. Download \`tla2tools.jar\` only when a model uses TLC. \`/statechart\` installs its own TLC and Java through mise when it reads results, so the machine that runs it needs the network on first use. Keep that setup out of the repo's check and CI.
`,
	"maintain-formal-verification-skill": `- **TLA+ checker.** This replaces the tool choice above for TLA+ models. Install, run, and fall back from tla-ts as the TLA+ checker note in \`/create-formal-verification-skill\` says, also when a check already on tla-ts starts failing after a model update. When a check still runs TLC (\`tla2tools.jar\`, \`tlc2.TLC\`, or a Java install) and records no reason for it, move it to tla-ts during this upkeep. Move it too when its only recorded reason is a Node older than 22.8 and the repo can now run 22.8 or later. This move may edit the package manifest, the lockfile, and the CI steps that run TLC, outside the edit scope above. Run the same configs on both checkers, with the Node version CI uses for the tla-ts check. Remove TLC only when tla-ts reports the same distinct-state count on every passing config and the same result on every failing one: the same violated invariant, the same violated temporal property, or a deadlock. When every config passes, break the model once on purpose, confirm both checkers report the same violation, then drop the break. Keep TLC and report why when the results differ, cannot be compared, or tla-ts fails on the model. \`/statechart\` keeps its own TLC through mise for reading results, so keep its setup out of the repo's check.
`,
};

// Port of upstream's Cursor-only `reminder:` frontmatter. Narrowed to coding tasks so questions stay cheap.
const REMINDER =
	"pstack: new coding task (feature, bug fix, refactor, perf work, PR or CI work)? Invoke the pstack:poteto-mode skill before starting, once per task. General question, explanation, chat, or user opts out -> do not.";

const AGENT_NOTE = `
Running under Claude Code: pstack skills live at \`\${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md\`. Read them by path. Do not call the Skill tool for them.
`;

function git(args, cwd, env = process.env) {
	return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function syncUpstream(pin) {
	if (!existsSync(UPSTREAM)) {
		git(["clone", "--depth", "1", "--filter=blob:none", "--sparse", `${REPO}.git`, UPSTREAM]);
		git(["sparse-checkout", "set", "pstack"], UPSTREAM);
	} else if (!pin) {
		git(["fetch", "--depth", "1", "origin", "main"], UPSTREAM);
		git(["reset", "--hard", "FETCH_HEAD"], UPSTREAM);
	}
	if (pin) {
		// The manifest's short sha, or PSTACK_UPSTREAM_SHA, resolves only against local history, so main is unshallowed.
		const shallow = git(["rev-parse", "--is-shallow-repository"], UPSTREAM) === "true";
		git(["fetch", "--filter=blob:none", ...(shallow ? ["--unshallow"] : []), "origin", "main"], UPSTREAM);
		// No lazy fetch, so a commit that only a fork has cannot be pulled in by its sha, and the pin must be on main.
		const commit = git(["rev-parse", "--verify", "--end-of-options", `${pin}^{commit}`], UPSTREAM, { ...process.env, GIT_NO_LAZY_FETCH: "1" });
		git(["merge-base", "--is-ancestor", commit, "FETCH_HEAD"], UPSTREAM);
		// --force drops any local edit in .upstream, which would otherwise carry over to the pinned checkout.
		git(["checkout", "--quiet", "--force", "--detach", commit], UPSTREAM);
	}
	return git(["rev-parse", "HEAD"], UPSTREAM);
}

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	);
}

// Indexes of the REPLACEMENTS rows that matched somewhere in this run.
const usedRows = new Set();

function convertText(text) {
	return REPLACEMENTS.reduce((t, [from, to], i) => {
		if (t.search(from) !== -1) usedRows.add(i);
		return t.replace(from, to);
	}, text);
}

function previousSha() {
	const manifest = join(PLUGIN, ".claude-plugin", "plugin.json");
	return existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")).version.split("+")[1].split(".")[0] : null;
}

const before = previousSha();
if (CHECK && !before) throw new Error("--check needs a generated plugin/ to compare against");
const pinnedUpstream = CHECK ? null : process.env.PSTACK_UPSTREAM_SHA || null;
if (pinnedUpstream && !/^[0-9a-f]{40}$/.test(pinnedUpstream)) throw new Error("PSTACK_UPSTREAM_SHA must be a full 40-character cursor/plugins commit");
const sha = syncUpstream(CHECK ? before : pinnedUpstream);
const upstreamManifest = JSON.parse(readFileSync(join(SRC, ".cursor-plugin", "plugin.json"), "utf8"));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, ".claude-plugin"), { recursive: true });
for (const entry of ["skills", "agents", "LICENSE"]) cpSync(join(SRC, entry), join(OUT, entry), { recursive: true });
for (const skill of SKIP_SKILLS) rmSync(join(OUT, "skills", skill), { recursive: true, force: true });

const overlays = join(ROOT, "overlays");

for (const file of walk(OUT)) {
	if (!/\.(md|sh)$/.test(file)) continue;
	const rel = relative(OUT, file);
	// An overlay replaces this file below, and converting it would count rows that change nothing in plugin/.
	if (existsSync(join(overlays, rel))) continue;
	let text = convertText(readFileSync(file, "utf8"));
	if (basename(file) === "SKILL.md") {
		// Claude Code derives the slash command from the directory, keep `name` in step with it.
		const dir = basename(dirname(file));
		text = text.replace(/^name: .*$/m, `name: ${dir}`);
		if (!dir.startsWith("principle-")) text += ADAPTER_NOTE + (SKILL_NOTES[dir] ?? "");
		if (MODEL_INVOKED.includes(dir)) text = text.replace(/^disable-model-invocation: true\n/m, "");
	} else if (rel.startsWith("agents/")) {
		text = text.replace(/^is_background: /m, "background: ") + AGENT_NOTE;
	}
	writeFileSync(file, text);
}

if (existsSync(overlays)) cpSync(overlays, OUT, { recursive: true });

mkdirSync(join(OUT, "hooks"), { recursive: true });
writeFileSync(
	join(OUT, "hooks", "hooks.json"),
	`${JSON.stringify(
		{ hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: `echo '${REMINDER}'`, timeout: 5 }] }] } },
		null,
		"\t",
	)}\n`,
);

// `claude plugin update` skips a same-version plugin, so the version carries a content hash.
// A convert.mjs or overlay change with upstream unchanged still reaches the installed copy.
const hash = createHash("sha256");
for (const f of walk(OUT).sort()) hash.update(relative(OUT, f)).update(readFileSync(f));

writeFileSync(
	join(OUT, ".claude-plugin", "plugin.json"),
	`${JSON.stringify(
		{
			name: "pstack",
			version: `${upstreamManifest.version}+${sha.slice(0, 7)}.${hash.digest("hex").slice(0, 7)}`,
			description: `${upstreamManifest.description} (Claude Code port, generated by convert.mjs)`,
			author: upstreamManifest.author,
			homepage: upstreamManifest.homepage,
			license: upstreamManifest.license,
		},
		null,
		"\t",
	)}\n`,
);

// Leftover Cursor-isms mean upstream added something REPLACEMENTS does not cover yet.
// `cursor-team-kit`, `environment:` and Bugbot are left in on purpose, ADAPTER_NOTE translates them.
const RESIDUAL = /\.cursor\b|\.mdc\b|grok-|gemini-|gpt-5|\b(?:fable|opus|sonnet|haiku|low|medium|high|xhigh|max)-fast\b|claude-(opus|fable|sonnet|haiku)-\d|\bAskQuestion|generalPurpose|\bTask\b.{0,12}(call|tool|subagent|prompt|spawn)|`Task`/;
const residuals = walk(OUT)
	.filter((f) => /\.(md|sh)$/.test(f))
	.flatMap((f) =>
		readFileSync(f, "utf8")
			.split("\n")
			.map((line, i) => ({ line, at: `${join("plugin", relative(OUT, f))}:${i + 1}` }))
			.filter(({ line }) => RESIDUAL.test(line)),
	);

console.log(`pstack ${upstreamManifest.version} @ ${sha.slice(0, 7)} -> ${CHECK ? "temp dir" : relative(process.cwd(), OUT) || "."}`);
if (pinnedUpstream) console.log(`pinned to ${sha.slice(0, 7)} by PSTACK_UPSTREAM_SHA`);
else if (before && !sha.startsWith(before)) console.log(`upstream changes: ${REPO}/compare/${before}...${sha.slice(0, 7)}`);
else if (before && sha.startsWith(before)) console.log("upstream unchanged");
console.log(`residual Cursor references: ${residuals.length}`);
for (const { at, line } of residuals) console.log(`  ${at}  ${line.trim().slice(0, 140)}`);

// A strip that stops matching (upstream reformats the flag) would leave these skills blocked without any error.
const stillBlocked = MODEL_INVOKED.filter((dir) =>
	/^disable-model-invocation:/m.test(readFileSync(join(OUT, "skills", dir, "SKILL.md"), "utf8").split("\n---")[0]),
);
if (stillBlocked.length) console.log(`still user-invocable only: ${stillBlocked.join(", ")}`);
// A SKILL_NOTES key that no longer names a skill (upstream renamed or removed it) would drop its note silently.
const orphanNotes = Object.keys(SKILL_NOTES).filter((dir) => !existsSync(join(OUT, "skills", dir, "SKILL.md")));
if (orphanNotes.length) console.log(`SKILL_NOTES for missing skills: ${orphanNotes.join(", ")}`);
// SkillSpector's RA2 hidden-file regex runs from any "write" or "create" to the last `~/.` path before a `|`, across
// paragraphs. A `~/.` path this port adds where upstream had none turns each upstream "write" above it into a scan failure.
const DOT_PATH = /(?:~\/|\/home\/|\/tmp\/)\./;
const dotPathNotes = Object.entries({ ADAPTER_NOTE, ...SKILL_NOTES }).filter(([, note]) => DOT_PATH.test(note));
if (dotPathNotes.length) console.log(`appended notes name a ~/. path, write $HOME/. instead: ${dotPathNotes.map(([name]) => name).join(", ")}`);
const dotPathRows = REPLACEMENTS.filter(([from, to]) => DOT_PATH.test(to) && !from.source.includes("~"));
if (dotPathRows.length) console.log(`replacements add a ~/. path upstream did not have, write $HOME/. instead: ${dotPathRows.map(([from]) => from).join(", ")}`);
// A row that matches nothing leaves its target text unconverted without any error. Upstream reworded or removed that text,
// an earlier row now rewrites it first, or the row has a typo.
const unusedRows = REPLACEMENTS.filter((_, i) => !usedRows.has(i));
if (unusedRows.length) console.log(`replacements that matched nothing, update or delete them:\n${unusedRows.map(([from]) => `  ${from}`).join("\n")}`);
let failed =
	residuals.length > 0 ||
	stillBlocked.length > 0 ||
	orphanNotes.length > 0 ||
	dotPathNotes.length > 0 ||
	dotPathRows.length > 0 ||
	unusedRows.length > 0;

if (CHECK) {
	// Compare what git would commit, so ignored files such as .DS_Store under plugin/ do not count.
	const committed = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "plugin"], ROOT)
		.split("\0")
		.filter(Boolean)
		.map((f) => relative("plugin", f));
	const generated = walk(OUT).map((f) => relative(OUT, f));
	const differ = [...new Set([...committed, ...generated])].filter((f) => {
		const [a, b] = [join(PLUGIN, f), join(OUT, f)];
		return !existsSync(a) || !existsSync(b) || !readFileSync(a).equals(readFileSync(b));
	});
	if (differ.length) {
		console.log("plugin/ does not match convert.mjs output, run `node convert.mjs` and commit plugin/");
		for (const f of differ.sort()) console.log(`  plugin/${f}`);
		failed = true;
	} else {
		console.log("plugin/ matches convert.mjs output");
	}
} else {
	// Claude Code runs a cached copy of the plugin, not ./plugin, so push the regenerated version into it.
	try {
		execFileSync("claude", ["plugin", "update", "pstack@pstack-claude"], { stdio: "inherit" });
	} catch {
		console.log("plugin update failed, run: claude plugin update pstack@pstack-claude");
	}
}
if (failed) process.exitCode = 1;
