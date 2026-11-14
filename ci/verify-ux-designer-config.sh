#!/usr/bin/env sh
# COCALC-899 (dev-workflow 4.21.0): a ux-designer képesség konzisztencia-őre és a
# ui-contract.js offline önteszje. A .gitlab-ci.yml `ux-designer-config-check` jobja
# futtatja (blokkoló), Node-image-en — a szkript Node-ot hív, de függőség és hálózat
# nélkül (a ui-contract.js szándékosan függőség-mentes).
#
# Mit ellenőriz:
#   1. a képesség fájljai megvannak mindkét fában (.claude/ és a Codex-tükör .agents/ + .codex/);
#   2. a két ui-contract.js-példány bájtazonos;
#   3. a UX_* / UI_CHANGE_BUDGET_* kulcsok, a keret-értékek és a 11–13. indító mondat
#      mind a négy config-fájlban szerepel; az offload-mátrixban van ux-designer sor;
#   4. a bekötések megvannak (design-branch B4a, implementer keret-kapu, figma-designer
#      UX-spec, ticket-sablon mező, MCP allow-list, végrehajtó-szint feloldó);
#   5. a ui-contract.js `classify` a ci/fixtures/ui-contract/ változatokat a várt
#      szintre sorolja (a várt szint a fájlnévben: v-t<N>-…), az `extract` a fixture-
#      komponenseket ismeretlen tag nélkül bontja, és a `check-budget` hibás bemenetre
#      2-es kóddal áll le.
#
# Használat (a repo gyökeréből): sh ci/verify-ux-designer-config.sh
# Kilépőkód: 0 = rendben; 1 = eltérés (az üzenet megmondja, mi).
set -eu

fail() {
  echo "verify-ux-designer-config: $1" >&2
  exit 1
}

# --- 1. Fájlok ---
for f in \
  .claude/agents/ux-designer.md \
  .claude/skills/ux-designer/SKILL.md \
  .claude/skills/ux-designer/rubric.md \
  .claude/skills/ux-designer/redesign-method.md \
  .claude/skills/dev-workflow/scripts/ui-contract.js \
  .agents/skills/ux-designer/SKILL.md \
  .agents/skills/ux-designer/ux-designer.md \
  .agents/skills/ux-designer/rubric.md \
  .agents/skills/ux-designer/redesign-method.md \
  .agents/skills/dev-workflow/scripts/ui-contract.js \
  .codex/agents/dev-workflow-ux-designer.toml \
  ci/fixtures/ui-contract/base.component.ts \
  ci/fixtures/ui-contract/presentational.component.ts; do
  test -f "$f" || fail "hiányzó fájl: $f"
done

# --- 2. A szkript két példánya bájtazonos ---
cmp -s .claude/skills/dev-workflow/scripts/ui-contract.js .agents/skills/dev-workflow/scripts/ui-contract.js ||
  fail "a .claude/ és az .agents/ ui-contract.js eltér — másold át a .claude/ változatot"

# --- 3. Config-kulcsok, keret-értékek, indító mondatok ---
KEYS="UX_DESIGN_PRINCIPLES_FILE UX_OUTPUT_DIR UX_FRONTEND_DIR UX_FRONTEND_APP_DIR UX_BACKEND_DIR UX_DESIGN_TOKENS_FILE UX_AUDIT_TARGET UX_AUDIT_VIEWPORTS UX_MAX_FINDINGS UX_CRITIQUE_GATE UI_CHANGE_BUDGET_DEFAULT UI_CHANGE_BUDGET_BASE"
for cfg in \
  .claude/skills/dev-workflow/config.md \
  .claude/skills/dev-workflow/config.template.md \
  .agents/skills/dev-workflow/config.md \
  .agents/skills/dev-workflow/config.template.md; do
  test -f "$cfg" || fail "hiányzó config: $cfg"
  grep -Fq '## UX-designer (UX_*)' "$cfg" || fail "$cfg: hiányzik a \"UX-designer (UX_*)\" szakasz"
  for k in $KEYS; do
    grep -Fq "| \`$k\` |" "$cfg" || fail "$cfg: hiányzó kulcs: $k"
  done
  # ORD-497: a UI_CHANGE_BUDGET értéktábla (magyarázat) a config-reference.md-ben van.
  ref="${cfg%/*}/config-reference.md"
  for b in template-only thin-ts logic free; do
    grep -Fq "| \`$b\` |" "$ref" || fail "$ref: a UI_CHANGE_BUDGET értéktáblából hiányzik: $b"
  done
  for n in 11 12 13; do
    grep -Eq "^\| $n \| \".*\" \| \`ux-designer/SKILL.md\`" "$cfg" || fail "$cfg: hiányzó vagy hibás $n. indító mondat"
  done
done
cfg=.claude/skills/dev-workflow/config-reference.md  # ORD-497: az OFFLOAD_PHASE_MATRIX a referenciában
grep -Fq '| `ux-designer` | ⛔' "$cfg" || fail "$cfg: hiányzik az ux-designer sor az OFFLOAD_PHASE_MATRIX-ból"

# --- 4. Bekötések ---
for f in .claude/skills/dev-workflow-execute/design-branch.md .agents/skills/dev-workflow-execute/design-branch.md; do
  grep -Fq '## B4a — UX-kritika (`UX_CRITIQUE_GATE`)' "$f" || fail "$f: hiányzik a B4a lépés"
  grep -Fq 'B4 → B4a → B5' "$f" || fail "$f: a B8 végrehajtási sorrendjéből hiányzik a B4a"
done
for f in .claude/agents/implementer.md .agents/skills/dev-workflow-execute/implementer.md; do
  grep -Fq 'ui-contract.js check-budget' "$f" || fail "$f: hiányzik a UI-változási keret kapuja"
  grep -Fq '"UI-változás kerete"' "$f" || fail "$f: hiányzik a ticket-mező olvasása"
done
for f in .claude/agents/figma-designer.md .agents/skills/dev-workflow-execute/figma-designer.md; do
  grep -Fq 'UX-spec (ha a hívó átadta' "$f" || fail "$f: hiányzik a UX-spec bemenet"
done
for f in .claude/skills/dev-workflow/jira-ticket-template.md .agents/skills/dev-workflow/jira-ticket-template.md; do
  grep -Fq '| UI-változás kerete | csak UI-érintett' "$f" || fail "$f: hiányzik a \"UI-változás kerete\" infobox-mező"
done
grep -Fq 'UX_DESIGNER_FIGMA_TOOLS=' .claude/skills/dev-workflow/scripts/setup-mcp-allowlist.sh ||
  fail "setup-mcp-allowlist.sh: hiányzik az ux-designer Figma-eszközlistája"
grep -Fq 'add_entries "$FIGMA_HEX" "$UX_DESIGNER_FIGMA_TOOLS"' .claude/skills/dev-workflow/scripts/setup-mcp-allowlist.sh ||
  fail "setup-mcp-allowlist.sh: az ux-designer Figma-eszközei nem kerülnek az allow-listbe"
grep -Fq 'architect|ux-designer) : ;;' .claude/skills/dev-workflow/scripts/resolve-executor-level.sh ||
  fail "resolve-executor-level.sh: ismeretlen --phase ux-designer"

# --- 5. ui-contract.js önteszt ---
command -v node >/dev/null 2>&1 || fail "a ui-contract.js önteszthez node kell (a CI-job node-image-en fut)"
S=.claude/skills/dev-workflow/scripts/ui-contract.js
F=ci/fixtures/ui-contract
P=frontend/src/app/x/item-list.component.ts

tier_of() {
  node "$S" classify "$@" | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d;}).on("end",()=>{process.stdout.write(String(JSON.parse(s).tier));});'
}

count=0
for v in "$F"/v-t*.component.ts; do
  expected=$(basename "$v" | sed -E 's/^v-t([0-9]).*/T\1/')
  got=$(tier_of --path "$P" --old "$F/base.component.ts" --new "$v")
  [ "$got" = "$expected" ] || fail "classify $(basename "$v"): várt $expected, kapott $got"
  count=$((count + 1))
done
[ "$count" -ge 9 ] || fail "túl kevés classify-változat ($count) a $F alatt"

check() {
  expected="$1"
  shift
  got=$(tier_of "$@")
  [ "$got" = "$expected" ] || fail "classify $*: várt $expected, kapott $got"
}
check T0 --path frontend/src/app/x/item-list.component.html --old "$F/base.component.ts" --new "$F/v-t2-logic.component.ts"
check T0 --path frontend/src/app/x/item-list.component.spec.ts --old "$F/base.component.ts" --new "$F/v-t2-logic.component.ts"
check T0 --path frontend/src/app/app.routes.ts --old "$F/base.component.ts" --new "$F/base.component.ts"
check T0 --path frontend/public/minta.csv --new "$F/base.component.ts"
check T1 --path frontend/src/app/app.routes.ts --old "$F/base.component.ts" --new "$F/v-t2-logic.component.ts"
check T1 --path frontend/src/app/x/empty-state.component.ts --new "$F/presentational.component.ts"
check T2 --path "$P" --new "$F/base.component.ts"
check T2 --path frontend/package.json --old "$F/base.component.ts" --new "$F/v-t2-logic.component.ts"
check T3 --path backend/src/main/java/X.java --old "$F/base.component.ts" --new "$F/v-t2-logic.component.ts"
check null --path docs/x.md --new "$F/base.component.ts"

node "$S" extract --app-dir "$F" --format json | node -e '
let s = "";
process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  const c = JSON.parse(s);
  const fail = (m) => { console.error("verify-ux-designer-config: extract: " + m); process.exit(1); };
  if (c.components.length < 2) fail("túl kevés komponens: " + c.components.length);
  const unknown = c.components.flatMap((k) => k.members.filter((m) => m.kind === "unknown").map((m) => k.file + ": " + m.name));
  if (unknown.length) fail("ismeretlen tag(ok): " + unknown.join(", "));
  const base = c.components.find((k) => k.file === "base.component.ts");
  if (!base || base.selector !== "app-item-list") fail("a base.component.ts nincs (jól) felismerve");
  const names = base.members.map((m) => m.kind + ":" + m.name).join(" ");
  for (const want of ["method:firstItem", "getter:isEmpty", "property:title"]) {
    if (!names.includes(want)) fail("a base.component.ts-ből hiányzik: " + want + " (" + names + ")");
  }
});
'

set +e
node "$S" check-budget --budget nincs-ilyen >/dev/null 2>&1
rc=$?
set -e
[ "$rc" -eq 2 ] || fail "check-budget ismeretlen --budget értékre $rc-vel lépett ki, 2 helyett"

echo "verify-ux-designer-config: OK ($count classify-változat + 10 útvonal-eset + extract + check-budget)"
