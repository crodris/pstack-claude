#!/usr/bin/env bash
# Scan the generated skills under plugin/skills/ with NVIDIA SkillSpector and fail
# on any non-suppressed finding. The skills are upstream pstack text, so the baseline
# holds the findings already reviewed and a new one means upstream added something.
#
# Usage:
#   bin/scan-skills.sh [skill ...]   # default: every plugin/skills/<name>/ with a SKILL.md
#
# Environment:
#   SKILLSPECTOR_LLM=1   also run the LLM semantic stage (requires provider credentials,
#                        e.g. SKILLSPECTOR_PROVIDER=anthropic + ANTHROPIC_API_KEY)
#   REPORT_DIR=<dir>     write per-skill JSON and Markdown reports into <dir>
#
# Known false positives are suppressed via the repo-root .skillspector-baseline.yaml,
# with an auditable reason per suppression. Suppressed findings still appear in the
# JSON reports under "suppressed".
#
# Each skill is scanned exactly once; the Markdown report is rendered from that
# scan's JSON so the report can never disagree with the verdict that gated CI.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

if ! command -v skillspector >/dev/null 2>&1; then
  echo "skillspector not found. Install it with:" >&2
  echo "  uv tool install git+https://github.com/NVIDIA/skillspector.git@34f60308522f45447cd343da0aad77bcea308ad4" >&2
  exit 1
fi

skill_names=("$@")
if [ ${#skill_names[@]} -eq 0 ]; then
  for d in plugin/skills/*/; do
    [ -f "$d/SKILL.md" ] && skill_names+=("$(basename "$d")")
  done
fi
if [ ${#skill_names[@]} -eq 0 ]; then
  echo "No skills with a SKILL.md found under plugin/skills/." >&2
  exit 1
fi

scan_flags=()
if [ "${SKILLSPECTOR_LLM:-0}" != "1" ]; then
  scan_flags+=(--no-llm)
fi

baseline_flags=()
baseline=".skillspector-baseline.yaml"
[ -f "$baseline" ] && baseline_flags=(--baseline "$baseline")

[ -n "${REPORT_DIR:-}" ] && mkdir -p "$REPORT_DIR"

failures=0
crashes=0
scanned=0
for skill in "${skill_names[@]}"; do
  skill_dir="plugin/skills/$skill"
  if [ ! -f "$skill_dir/SKILL.md" ]; then
    # Auto-discovered names always have a SKILL.md, so reaching here means an
    # explicitly requested skill is wrong (likely a typo). Fail rather than
    # risk a false "PASS" after scanning nothing.
    echo "error: $skill_dir has no SKILL.md" >&2
    exit 1
  fi
  scanned=$((scanned + 1))
  json="$(mktemp)"

    # skillspector exits 1 when the risk score is over its threshold, with a full
    # report written, and 2 when the scan itself failed. Only 2 or a missing report
    # is a crash; the active findings in the JSON decide pass or fail.
    scan_status=0
    skillspector scan "$skill_dir" ${scan_flags[@]+"${scan_flags[@]}"} ${baseline_flags[@]+"${baseline_flags[@]}"} \
      --format json --output "$json" >/dev/null || scan_status=$?
    if [ "$scan_status" -gt 1 ] || [ ! -s "$json" ]; then
      echo "ERROR: skillspector crashed while scanning $skill" >&2
      crashes=$((crashes + 1))
      rm -f "$json"
      continue
    fi

    summary="$(python3 - "$json" "$skill" <<'PY'
import json, sys
report = json.load(open(sys.argv[1]))
risk = report["risk_assessment"]
active = report["issues"]
line = (
    f"{sys.argv[2]}: score {risk['score']}/100 ({risk['severity']}, "
    f"{risk['recommendation']}) | active {len(active)} | "
    f"suppressed {report['suppressed_count']}"
)
print(line)
for issue in active:
    loc = issue["location"]
    print(f"  {issue['id']} {issue['pattern']} [{issue['severity']}] "
          f"{loc['file']}:{loc['start_line']}")
sys.exit(1 if active else 0)
PY
)" && skill_ok=0 || skill_ok=1
    echo "$summary"

    if [ -n "${REPORT_DIR:-}" ]; then
      cp "$json" "$REPORT_DIR/$skill.json"
      # Render the Markdown report from the same JSON rather than re-scanning:
      # a second scan doubles cost (twice per skill, including the LLM stage)
      # and, because the scanner is not fully deterministic, could produce a
      # report that contradicts the JSON that decided pass/fail.
      python3 - "$json" "$skill" > "$REPORT_DIR/$skill.md" <<'PY'
import json, sys
report = json.load(open(sys.argv[1]))
risk = report["risk_assessment"]
print(f"# SkillSpector report: {sys.argv[2]}\n")
print(f"- Score: {risk['score']}/100 ({risk['severity']})")
print(f"- Recommendation: {risk['recommendation']}")
print(f"- Active findings: {len(report['issues'])}")
print(f"- Suppressed findings: {report['suppressed_count']}")

def code_fence(text):
    # A snippet containing a backtick run >= the fence length would terminate
    # the fence early and corrupt the rest of the report, so pick a longer one.
    n = 3
    while "`" * n in text:
        n += 1
    return "`" * n

def emit(title, findings, suppressed):
    print(f"\n## {title}\n")
    if not findings:
        print("None.")
        return
    for f in findings:
        loc = f.get("location") or {}
        where = f"{loc.get('file', '?')}:{loc.get('start_line', '?')}"
        print(f"### {f.get('id', '?')} {f.get('pattern', '')} [{f.get('severity', '?')}] {where}\n")
        for key in ("finding", "explanation", "remediation"):
            if f.get(key):
                print(f"- **{key.capitalize()}**: {f[key]}")
        if suppressed and f.get("suppression_reason"):
            print(f"- **Suppression reason**: {f['suppression_reason']}")
        if f.get("code_snippet"):
            fence = code_fence(f["code_snippet"])
            print(f"\n{fence}\n{f['code_snippet']}\n{fence}")
        print()

emit("Active findings", report["issues"], suppressed=False)
emit("Suppressed findings", report.get("suppressed", []), suppressed=True)
PY
    fi
    rm -f "$json"

    [ "$skill_ok" -ne 0 ] && failures=$((failures + 1))
done

if [ "$scanned" -eq 0 ]; then
  # Belt and braces: reaching here with nothing scanned would otherwise print
  # a false "PASS" after scanning nothing.
  echo "error: no skills were scanned" >&2
  exit 1
fi

if [ "$failures" -gt 0 ] || [ "$crashes" -gt 0 ]; then
  echo
  if [ "$failures" -gt 0 ]; then
    echo "FAIL: $failures skill(s) have non-suppressed findings." >&2
    echo "Fix the finding, or if it is a reviewed false positive, add a rule with a" >&2
    echo "reason to .skillspector-baseline.yaml." >&2
  fi
  if [ "$crashes" -gt 0 ]; then
    echo "FAIL: the scanner crashed on $crashes skill(s); those skills were NOT" >&2
    echo "assessed. Check the install and provider credentials, then re-run." >&2
  fi
  exit 1
fi

echo
echo "PASS: all scanned skills are clean (suppressions documented in baselines)."
