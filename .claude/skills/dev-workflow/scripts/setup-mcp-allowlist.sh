#!/usr/bin/env bash
# Egylépéses MCP allow-list beállítás a dev-workflow subagentek számára — a Figma és Jira
# (Atlassian Rovo) hex-azonosítót **két lehetséges forrásból** gyűjti ki: a globális
# `~/.claude/settings.json`-ból (Windowson `%USERPROFILE%/.claude/settings.json`) ÉS az
# aktuális repó saját, nem verziózott `.claude/settings.local.json`-jából — bármelyikben
# talál korábban jóváhagyott `mcp__<hex-id>__<tool>` bejegyzést, azt elfogadja. Ezekkel
# felírja/kiegészíti a repo-lokális `.claude/settings.local.json`-t — így a 4 dev-workflow
# subagent (implementer, qa-tester, code-reviewer, figma-designer) nem akad el interaktív
# jóváhagyási promptokon MCP-hívásnál. Lásd dev-workflow/config.md "A három csatorna és a
# hozzá tartozó szkript" táblázat kiegészítése ("MCP allow-list" sor).
#
# Miért két forrás: a Claude Code "mindig engedélyezd" (Always allow) jóváhagyása a
# gyakorlatban a **repó-lokális** settings.local.json-ba ír, nem a globálisba — ezt a
# COCALC-222 utáni kézi próba mutatta meg (a globális fájlba csak az kerül be, amit egy
# korábbi session esetleg oda írt, vagy amit valaki kézzel átmásolt). Ha a szkript csak a
# globálisat nézné, egy vadonatúj gépen/repóban a leggyakoribb jóváhagyási út (Always
# allow egy interaktív promptnál) észrevétlen maradna.
#
# Miért kell ez egyáltalán: a `mcp__<hex-id>__<tool>` minta hex-ID része **gépenként/
# fiókonként változó** (a Claude Code a saját MCP-connector-regisztrációjához generálja) —
# emiatt ez sosem committolható portábilisan a `.claude/agents/*.md` vagy
# `.claude/skills/*/SKILL.md` `tools:` mezőibe. Ehelyett minden gépen/repóban egyszer
# (onboarding) le kell futtatni ezt a szkriptet, ami a helyi configokból olvassa ki az
# aktuális hex-ID-ket.
#
# Használat: bash .claude/skills/dev-workflow/scripts/setup-mcp-allowlist.sh
#
# Előfeltétel: a Figma és/vagy Atlassian Rovo MCP-connector legalább egyszer, kézzel meg
# legyen hívva — akár ebben a repóban, akár egy másikban ugyanezen a gépen/fiókon (hogy a
# hex-ID bekerüljön a globális VAGY a repo-lokális settings.local.json-ba) — lásd a
# szkript kimenetében az erre vonatkozó figyelmeztetést, ha ez még nem történt meg.
#
# OpenProject backend (COCALC-898): ha a config.md `TRACKER_BACKEND` értéke `openproject`,
# a tracker-hívások nem MCP-eszközök, hanem a `.claude/tools/openproject/op.js` CLI
# Bash-hívásai — ennek stabil (hex-ID nélküli) engedélye mindig bekerül, a Jira-MCP
# hiánya pedig ilyenkor nem figyelmeztetés.
#
# Kilépési kód: mindig 0, még részleges/hiányzó kapcsolat esetén is (AC3) — ez a szkript
# sosem "hibázik le" onboarding-hiány miatt, csak jelez és kihagyja az érintett szolgáltatást.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
LOCAL_SETTINGS="$REPO_ROOT/.claude/settings.local.json"

GLOBAL_SETTINGS_DIR="${USERPROFILE:-$HOME}"
GLOBAL_SETTINGS="$GLOBAL_SETTINGS_DIR/.claude/settings.json"
CONFIG_MD="$REPO_ROOT/.claude/skills/dev-workflow/config.md"

TRACKER_BACKEND="$(sed -n 's/^| `TRACKER_BACKEND` | `\([a-z]*\)`.*/\1/p' "$CONFIG_MD" 2>/dev/null | head -n 1)"
TRACKER_BACKEND="${TRACKER_BACKEND:-jira}"
OPENPROJECT_CLI_PERMISSION="Bash(node .claude/tools/openproject/op.js:*)"

echo "== MCP allow-list setup a dev-workflow subagentekhez =="
echo "Repo:                 $REPO_ROOT"
echo "Forrás 1 (globális):  $GLOBAL_SETTINGS"
echo "Forrás 2 (repo-lok.): $LOCAL_SETTINGS"
echo "Cél fájl:             $LOCAL_SETTINGS"
echo "Tracker-backend:      $TRACKER_BACKEND"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "HIBA: a 'node' parancs nem található — ez a szkript inline node-dal végzi a" >&2
  echo "JSON-merge-öt (jq helyett, mert az nincs telepítve), enélkül nem tud futni." >&2
  exit 1
fi

# --- Ismert eszköznevek szolgáltatásonként (a hex-ID-t ez alapján azonosítjuk) ---
# Figma MCP (hivatalos Figma MCP-szerver eszköztára, lásd MCP server instructions):
FIGMA_TOOL_NAMES="get_design_context get_screenshot get_metadata get_figjam use_figma generate_figma_design create_new_file upload_assets get_code_connect_map add_code_connect_map send_code_connect_mappings generate_diagram"

# Atlassian Rovo (Jira) MCP — a dev-workflow/config.md-ben ténylegesen hivatkozott
# eszköznevek (getJiraIssue, createJiraIssue, transitionJiraIssue, stb.):
JIRA_TOOL_NAMES="getJiraIssue editJiraIssue createJiraIssue getTransitionsForJiraIssue transitionJiraIssue lookupJiraAccountId searchJiraIssuesUsingJql addCommentToJiraIssue getJiraIssueRemoteIssueLinks getVisibleJiraProjects getJiraProjectIssueTypesMetadata getAccessibleAtlassianResources"

# A 4 dev-workflow subagent tényleges igénye (lásd dev-workflow-execute/*.md 'tools:'
# frontmatter sorai) — melyik subagentnek melyik szolgáltatásból mely eszközök kellenek:
IMPLEMENTER_FIGMA_TOOLS="get_design_context get_screenshot get_metadata"
IMPLEMENTER_JIRA_TOOLS="getJiraIssue"
FIGMA_DESIGNER_FIGMA_TOOLS="get_design_context get_metadata use_figma generate_figma_design create_new_file upload_assets get_code_connect_map add_code_connect_map"
FIGMA_DESIGNER_JIRA_TOOLS="getJiraIssue getTransitionsForJiraIssue transitionJiraIssue addCommentToJiraIssue getJiraIssueRemoteIssueLinks"
QA_TESTER_JIRA_TOOLS="getJiraIssue addCommentToJiraIssue"
CODE_REVIEWER_JIRA_TOOLS="getJiraIssue addCommentToJiraIssue"
# COCALC-899 (4.21.0): a ux-designer csak olvas — a critique `figma` célpontjához kell
# (frame keresése, screenshot, méretek/tokenek). Jira-eszköz nem kell neki.
UX_DESIGNER_FIGMA_TOOLS="get_metadata get_screenshot get_design_context"

# --- 1. hex-ID kigyűjtése MINDKÉT lehetséges forrásból, node-dal ---
# Sorrend: globális settings.json, majd repo-lokális settings.local.json — mindkettőt
# átnézi, amelyik létezik és érvényes JSON, abból gyűjt. Kimenet: soronként
# "<hex>|<toolname>", csak a permissions.allow / autoMode.allow tömbökből,
# mcp__<hex>__<tool> mintára illesztve.
NODE_OUTPUT="$(node -e '
const fs = require("fs");
const paths = process.argv.slice(1);
const seen = new Set();
const out = [];
const re = /^mcp__([0-9a-fA-F-]{8,})__(.+)$/;
function scan(arr) {
  if (!Array.isArray(arr)) return;
  for (const entry of arr) {
    if (typeof entry !== "string") continue;
    const m = entry.match(re);
    if (!m) continue;
    const key = m[1] + "|" + m[2];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
}
let anyFileExisted = false;
const invalidMsgs = [];
for (const p of paths) {
  if (!fs.existsSync(p)) continue;
  anyFileExisted = true;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    invalidMsgs.push(p + ": " + e.message);
    continue;
  }
  scan(data.permissions && data.permissions.allow);
  scan(data.autoMode && data.autoMode.allow);
}
if (!anyFileExisted) {
  console.log("NO_SOURCE");
  process.exit(0);
}
console.log(invalidMsgs.length ? "PARTIAL_INVALID:" + invalidMsgs.join(" | ") : "OK");
console.log(out.join("\n"));
' "$GLOBAL_SETTINGS" "$LOCAL_SETTINGS")"

NODE_STATUS_LINE="$(printf '%s\n' "$NODE_OUTPUT" | head -n 1)"

if [ "$NODE_STATUS_LINE" = "NO_SOURCE" ]; then
  echo "⚠️  Sem a globális settings.json ($GLOBAL_SETTINGS), sem a repo-lokális"
  echo "    settings.local.json ($LOCAL_SETTINGS) nem található."
  echo "    Ez azt jelenti, hogy még sosem lett kézzel meghívva és jóváhagyva egyetlen"
  echo "    Figma- vagy Jira-MCP eszköz sem (sem ebben a repóban, sem — a globális fájl"
  echo "    hiánya miatt — máshol ezen a fiókon)."
  echo "    → Hívj meg kézzel egy Figma MCP-eszközt (pl. get_design_context) ÉS egy"
  echo "      Jira MCP-eszközt (pl. getJiraIssue), és a felugró jóváhagyási promptnál"
  echo "      válaszd az \"Always allow\" opciót, utána futtasd újra ezt a szkriptet."
  # Nem lépünk ki: az OpenProject CLI engedélye hex-ID nélkül is beírható (lent).
fi

if [[ "$NODE_STATUS_LINE" == PARTIAL_INVALID:* ]]; then
  echo "⚠️  Az alábbi config fájl(ok) léteznek, de nem érvényes JSON, ezért kihagyva:"
  echo "    (${NODE_STATUS_LINE#PARTIAL_INVALID:})."
  echo "    → Ellenőrizd kézzel, a másik forrásból talált bejegyzésekkel folytatom."
fi

MCP_ENTRIES="$(printf '%s\n' "$NODE_OUTPUT" | tail -n +2)"

is_in_list() {
  local needle="$1"; shift
  local list="$1"
  for w in $list; do
    [ "$w" = "$needle" ] && return 0
  done
  return 1
}

FIGMA_HEX=""
JIRA_HEX=""

if [ -n "$MCP_ENTRIES" ]; then
  while IFS='|' read -r hex tool; do
    [ -z "$hex" ] && continue
    if is_in_list "$tool" "$FIGMA_TOOL_NAMES"; then
      FIGMA_HEX="$hex"
    elif is_in_list "$tool" "$JIRA_TOOL_NAMES"; then
      JIRA_HEX="$hex"
    fi
  done <<< "$MCP_ENTRIES"
fi

# --- 2. Kereszt-ellenőrzés: a szolgáltatás ténylegesen csatlakoztatva van-e most ---
MCP_LIST_OUTPUT="$(claude mcp list 2>&1 || true)"

figma_connected() {
  echo "$MCP_LIST_OUTPUT" | grep -i "figma" | grep -q "✔"
}
jira_connected() {
  echo "$MCP_LIST_OUTPUT" | grep -i "atlassian" | grep -q "✔"
}

FIGMA_OK=false
JIRA_OK=false

if [ -n "$FIGMA_HEX" ]; then
  if figma_connected; then
    FIGMA_OK=true
    echo "✅ Figma MCP: hex-ID megtalálva ($FIGMA_HEX), a connector jelenleg csatlakoztatva."
  else
    echo "⚠️  Figma MCP: hex-ID megvan ($FIGMA_HEX), de a 'claude mcp list' szerint most"
    echo "    NINCS csatlakoztatva. Kihagyva — érintett subagentek: implementer,"
    echo "    figma-designer, ux-designer (korlátozott képesség: nem tudnak Figma-tervet olvasni/írni,"
    echo "    amíg a connector újra nem csatlakozik)."
  fi
else
  echo "⚠️  Figma MCP: még sosem lett kézzel jóváhagyva egyetlen Figma-eszköz sem (nincs"
  echo "    hex-ID sem a globális settings.json-ban, sem ennek a repónak a"
  echo "    settings.local.json-jában). → Hívj meg kézzel egy Figma MCP-eszközt (pl."
  echo "    get_design_context), \"Always allow\"-t választva, utána futtasd újra a"
  echo "    szkriptet. Kihagyva — érintett subagentek: implementer, figma-designer, ux-designer."
fi

if [ "$TRACKER_BACKEND" = "openproject" ]; then
  echo "✅ Tracker: OpenProject (TRACKER_BACKEND=openproject) — a Jira MCP nem kell, a"
  echo "    subagentek a $OPENPROJECT_CLI_PERMISSION engedéllyel érik el."
  if ! node -e 'process.exit(typeof fetch === "function" ? 0 : 1)' 2>/dev/null; then
    echo "⚠️  A helyi Node túl régi (globális fetch kell, Node 18+) az op.js-hez."
  fi
elif [ -n "$JIRA_HEX" ]; then
  if jira_connected; then
    JIRA_OK=true
    echo "✅ Jira (Atlassian Rovo) MCP: hex-ID megtalálva ($JIRA_HEX), a connector jelenleg csatlakoztatva."
  else
    echo "⚠️  Jira (Atlassian Rovo) MCP: hex-ID megvan ($JIRA_HEX), de a 'claude mcp list'"
    echo "    szerint most NINCS csatlakoztatva. Kihagyva — érintett subagentek:"
    echo "    implementer, qa-tester, code-reviewer, figma-designer (korlátozott képesség:"
    echo "    nem tudnak Jira ticketet olvasni/írni, amíg a connector újra nem csatlakozik)."
  fi
else
  echo "⚠️  Jira (Atlassian Rovo) MCP: még sosem lett kézzel jóváhagyva egyetlen"
  echo "    Jira-eszköz sem (nincs hex-ID sem a globális settings.json-ban, sem ennek a"
  echo "    repónak a settings.local.json-jában). → Hívj meg kézzel egy Jira MCP-eszközt"
  echo "    (pl. getJiraIssue), \"Always allow\"-t választva, utána futtasd újra a"
  echo "    szkriptet. Kihagyva — érintett subagentek: implementer, qa-tester,"
  echo "    code-reviewer, figma-designer."
fi

# Böngésző MCP (mcp__chrome-devtools) — stabil név, nincs hex-ID, csak státuszjelzés,
# nincs settings.local.json bejegyzés hozzá.
if echo "$MCP_LIST_OUTPUT" | grep -qi "chrome"; then
  echo "ℹ️  Böngésző-MCP (mcp__chrome-devtools): stabil eszköznév, nincs hex-ID, ezért nem"
  echo "    kerül bele az allow-listbe — a qa-tester subagent ezt közvetlenül, saját"
  echo "    'tools:' mezőjéből örökli, itt nincs teendő."
else
  echo "ℹ️  Böngérző-MCP (mcp__chrome-devtools): nem szerepel a 'claude mcp list'"
  echo "    kimenetében ezen a gépen — a qa-tester böngésző-alapú AC-ellenőrzése emiatt"
  echo "    korlátozott lehet, de ez a szkript ezt nem tudja kezelni (nincs hex-ID,"
  echo "    ez a connector telepítésének/beállításának kérdése)."
fi

echo

# --- 3. A 4 subagent tényleges igénye szerinti mcp__<hex>__<tool> lista összeállítása ---
NEW_ENTRIES=()

add_entries() {
  local hex="$1"; shift
  local tools="$1"
  for t in $tools; do
    NEW_ENTRIES+=("mcp__${hex}__${t}")
  done
}

if [ "$FIGMA_OK" = true ]; then
  add_entries "$FIGMA_HEX" "$IMPLEMENTER_FIGMA_TOOLS"
  add_entries "$FIGMA_HEX" "$FIGMA_DESIGNER_FIGMA_TOOLS"
  add_entries "$FIGMA_HEX" "$UX_DESIGNER_FIGMA_TOOLS"
fi

# Az OpenProject CLI engedélye stabil, gépfüggetlen — mindig bekerül (Jira-backenden sem árt).
NEW_ENTRIES+=("$OPENPROJECT_CLI_PERMISSION")

if [ "$JIRA_OK" = true ] && [ "$TRACKER_BACKEND" != "openproject" ]; then
  add_entries "$JIRA_HEX" "$IMPLEMENTER_JIRA_TOOLS"
  add_entries "$JIRA_HEX" "$FIGMA_DESIGNER_JIRA_TOOLS"
  add_entries "$JIRA_HEX" "$QA_TESTER_JIRA_TOOLS"
  add_entries "$JIRA_HEX" "$CODE_REVIEWER_JIRA_TOOLS"
fi

if [ "${#NEW_ENTRIES[@]}" -eq 0 ]; then
  echo "Egyetlen csatlakoztatott, korábban jóváhagyott MCP-szolgáltatás sincs — a"
  echo "settings.local.json változatlan marad (vagy nem jön létre)."
  exit 0
fi

# Dedupe az összeállított listában (több subagent is kérhet ugyanolyan eszközt).
DEDUPED_JSON="$(printf '%s\n' "${NEW_ENTRIES[@]}" | node -e '
const lines = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
console.log(JSON.stringify([...new Set(lines)]));
')"

echo "Beírandó/kiegészítendő bejegyzések (${#NEW_ENTRIES[@]}, dedupe után kevesebb lehet):"
printf '%s\n' "${NEW_ENTRIES[@]}" | sort -u

# --- 4. Merge a settings.local.json-ba (unió, idempotens, egyéb kulcsok érintetlenek) ---
mkdir -p "$(dirname "$LOCAL_SETTINGS")"

node -e '
const fs = require("fs");
const localPath = process.argv[1];
const newEntries = JSON.parse(process.argv[2]);

let data = {};
if (fs.existsSync(localPath)) {
  const raw = fs.readFileSync(localPath, "utf8").trim();
  if (raw) data = JSON.parse(raw);
}

if (!data.permissions) data.permissions = {};
if (!Array.isArray(data.permissions.allow)) data.permissions.allow = [];
if (!data.autoMode) data.autoMode = {};
if (!Array.isArray(data.autoMode.allow)) data.autoMode.allow = ["$defaults"];

function union(arr, additions) {
  const set = new Set(arr);
  for (const a of additions) set.add(a);
  return [...set];
}

data.permissions.allow = union(data.permissions.allow, newEntries);
data.autoMode.allow = union(data.autoMode.allow, newEntries);

fs.writeFileSync(localPath, JSON.stringify(data, null, 2) + "\n");
' "$LOCAL_SETTINGS" "$DEDUPED_JSON"

echo
echo "✅ Kész — frissítve: $LOCAL_SETTINGS"
