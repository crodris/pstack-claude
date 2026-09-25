#!/usr/bin/env node
// Converts cursor/plugins pstack into a Claude Code plugin at ./plugin.
// Re-run to update: pulls upstream, regenerates ./plugin from scratch, reports leftover Cursor-isms.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const UPSTREAM = join(ROOT, ".upstream");
const SRC = join(UPSTREAM, "pstack");
const OUT = join(ROOT, "plugin");
const REPO = "https://github.com/cursor/plugins";

// Cursor Automations webhooks, no Claude Code equivalent.
const SKIP_SKILLS = ["make-bot-ui"];

// Ordered. Specific before generic.
const REPLACEMENTS = [
	// Paths
	[/~\/\.cursor\/rules\/pstack-models\.mdc/g, "~/.claude/rules/pstack-models.md"],
	[/`pstack-models\.mdc`/g, "`~/.claude/rules/pstack-models.md`"],
	[/~\/\.cursor\/projects\/<slug>\/agent-transcripts\/<uuid>\/<uuid>\.jsonl/g, "~/.claude/projects/<slug>/<uuid>.jsonl"],
	[
		/with the leading slash dropped and each "\/" turned into "-" \(so `\/Users\/you\/proj` becomes `Users-you-proj`\)/g,
		'with every non-alphanumeric character turned into "-" (so `/Users/you/proj` becomes `-Users-you-proj`)',
	],
	[/`agent-transcripts\/` directory/g, "transcript directory (`~/.claude/projects/<slug>/`, where `<slug>` is the absolute project path with every non-alphanumeric character turned into `-`)"],
	[/\(the system prompt names (?:the|this) path/g, "(derive it from the project path"],
	[/The system prompt names the/g, "Locate the"],
	[/sed 's#\^\/##; s#\/#-#g'/g, "sed 's#[^A-Za-z0-9]#-#g'"],
	[/\.cursor\/projects\/\$slug\/agent-transcripts/g, ".claude/projects/$slug"],
	[/\.cursor\/projects\/<slugified-repo-path>\/agent-transcripts/g, ".claude/projects/<slugified-repo-path>"],
	[/\.cursor\/(skills|plugins|projects|worktrees)\//g, ".claude/$1/"],

	// Tools
	[/\bAskQuestion\b/g, "AskUserQuestion"],
	[/generalPurpose/g, "general-purpose"],
	[/`Task`/g, "`Agent`"],
	[/\bTask (tool|`model`)/g, "Agent $1"],
	[/\bTask subagent/g, "subagent"],
	[/^- `readonly`: .*\n/gm, ""],
	[/subagent_type: "poteto-agent"/g, 'subagent_type: "pstack:poteto-agent"'],
	[/subagent_type: "Comment Sicko"/g, 'subagent_type: "pstack:Comment Sicko"'],

	// Models. Claude Code subagents run Claude only, so the cross-vendor panel maps by role:
	// upstream's strongest Claude slot to fable, gpt to opus, grok to sonnet. Matches the overlay's `unlimited` shape.
	[/claude-opus-[\d-]+[a-z]+/g, "fable"],
	[/gpt-5\.\d+-[a-z-]+/g, "opus"],
	[/(?:cursor-)?grok-[\d.]+-[a-z-]+/g, "sonnet"],
	[/Families go by prefix: `claude-\*`, `gpt-\*`, and `grok-\*`\. With no family match, use /g, "Under Claude Code that means "],
];

const ADAPTER_NOTE = `
## Running under Claude Code

This skill is ported from Cursor's pstack. Apply these translations wherever the text above assumes Cursor.

- **Sibling skills.** "The **x** skill", \`/x\`, and \`principle-*\` references mean the file \`../x/SKILL.md\` relative to this skill's base directory. Read it and follow it. Do not call the Skill tool for pstack skills, most are user-invocable only.
- **Subagents.** Spawn with the Agent tool. It has no \`readonly\` or \`environment\` parameter, so ignore both. There is no cloud environment. Workers run locally, and any worker that writes gets \`isolation: "worktree"\`.
- **Models.** Agent \`model\` accepts only \`fable\`, \`opus\`, \`sonnet\`, \`haiku\`. Per-role overrides live in \`~/.claude/rules/pstack-models.md\` (written by \`/pstack:setup-pstack\`). A value of \`inherit-parent\` or \`auto\` means omit \`model\`.
- **Missing Cursor skills.** \`cursor-team-kit\` is not installed. For \`/deslop\` use \`/simplify\`. For \`control-ui\` drive the app with whatever browser automation tools are available. For \`control-cli\` use Bash. For Cursor's built-in \`create-skill\` use any installed skill-authoring skill.
- **Bugbot.** Guidance about Bugbot applies to whatever review bot comments on the PR (CodeRabbit, etc.).
`;

// Port of upstream's Cursor-only `reminder:` frontmatter. Narrowed to coding tasks so questions stay cheap.
const REMINDER =
	"pstack: new coding task (feature, bug fix, refactor, perf work, PR or CI work)? Invoke the pstack:poteto-mode skill before starting, once per task. General question, explanation, chat, or user opts out -> do not.";

const AGENT_NOTE = `
Running under Claude Code: pstack skills live at \`\${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md\`. Read them by path. Do not call the Skill tool for them.
`;

function git(args, cwd) {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function syncUpstream() {
	if (!existsSync(UPSTREAM)) {
		git(["clone", "--depth", "1", "--filter=blob:none", "--sparse", `${REPO}.git`, UPSTREAM]);
		git(["sparse-checkout", "set", "pstack"], UPSTREAM);
	} else {
		git(["fetch", "--depth", "1", "origin", "main"], UPSTREAM);
		git(["reset", "--hard", "FETCH_HEAD"], UPSTREAM);
	}
	return git(["rev-parse", "HEAD"], UPSTREAM);
}

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	);
}

function convertText(text) {
	return REPLACEMENTS.reduce((t, [from, to]) => t.replace(from, to), text);
}

function previousSha() {
	const manifest = join(OUT, ".claude-plugin", "plugin.json");
	return existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")).version.split("+")[1].split(".")[0] : null;
}

const before = previousSha();
const sha = syncUpstream();
const upstreamManifest = JSON.parse(readFileSync(join(SRC, ".cursor-plugin", "plugin.json"), "utf8"));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, ".claude-plugin"), { recursive: true });
for (const entry of ["skills", "agents", "LICENSE"]) cpSync(join(SRC, entry), join(OUT, entry), { recursive: true });
for (const skill of SKIP_SKILLS) rmSync(join(OUT, "skills", skill), { recursive: true, force: true });

for (const file of walk(OUT)) {
	if (!/\.(md|sh)$/.test(file)) continue;
	let text = convertText(readFileSync(file, "utf8"));
	const rel = relative(OUT, file);
	if (basename(file) === "SKILL.md") {
		// Claude Code derives the slash command from the directory, keep `name` in step with it.
		const dir = basename(dirname(file));
		text = text.replace(/^name: .*$/m, `name: ${dir}`);
		if (!dir.startsWith("principle-")) text += ADAPTER_NOTE;
		// The reminder hook can only trigger a skill the model is allowed to invoke.
		if (dir === "poteto-mode") text = text.replace(/^disable-model-invocation: true\n/m, "");
	} else if (rel.startsWith("agents/")) {
		text = text.replace(/^is_background: /m, "background: ") + AGENT_NOTE;
	}
	writeFileSync(file, text);
}

const overlays = join(ROOT, "overlays");
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
const RESIDUAL = /\.cursor\b|\.mdc\b|grok-|gpt-5|claude-(opus|fable|sonnet|haiku)-\d|\bAskQuestion|generalPurpose|\bTask\b.{0,12}(call|tool|subagent|prompt)|`Task`/;
const residuals = walk(OUT)
	.filter((f) => /\.(md|sh)$/.test(f))
	.flatMap((f) =>
		readFileSync(f, "utf8")
			.split("\n")
			.map((line, i) => ({ line, at: `${relative(ROOT, f)}:${i + 1}` }))
			.filter(({ line }) => RESIDUAL.test(line)),
	);

console.log(`pstack ${upstreamManifest.version} @ ${sha.slice(0, 7)} -> ${relative(process.cwd(), OUT) || "."}`);
if (before && !sha.startsWith(before)) console.log(`upstream changes: ${REPO}/compare/${before}...${sha.slice(0, 7)}`);
if (before && sha.startsWith(before)) console.log("upstream unchanged");
console.log(`residual Cursor references: ${residuals.length}`);
for (const { at, line } of residuals) console.log(`  ${at}  ${line.trim().slice(0, 140)}`);

// Claude Code runs a cached copy of the plugin, not ./plugin, so push the regenerated version into it.
try {
	execFileSync("claude", ["plugin", "update", "pstack@pstack-claude"], { stdio: "inherit" });
} catch {
	console.log("plugin update failed, run: claude plugin update pstack@pstack-claude");
}
