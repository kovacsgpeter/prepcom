#!/usr/bin/env sh
# ORD-497 (4.30.0): a config szétválasztásának ellenőrzése — mindkét porton (.claude, .agents):
#   1. a config.template.md (rövid, csak értékek) mérete legfeljebb 20 000 bájt;
#   2. a config.template.md minden szakaszcíme megvan a config-reference.md-ben (a hivatkozások
#      "azonos című szakasz" szabálya ezen múlik);
#   3. a referencia minden kulcstáblás kulcsa (Változó / Kapcsoló / Egyedi kapcsoló) szerepel a
#      rövid sablonban is (explicit sorként vagy a preset-táblában) — új kulcsnál mindkét fájl kell;
#   4. egyetlen skill / agent sem utasít a teljes config-reference.md beolvasására;
#   5. a slim-config.js migráció egy szintetikus hosszú configon: minden kulcs feloldott értéke
#      (a scripts/config-value.sh szerint, mindhárom profillal) változatlan, a repó-lokális
#      szakasz és kulcs megmarad, a sorvég (CRLF) megmarad, a második futás no-op.
set -eu

fail() { echo "verify-config-split: $*" >&2; exit 1; }

CV=.claude/skills/dev-workflow/scripts/config-value.sh
SLIM=.claude/tools/dev-workflow-install/slim-config.js
[ -f "$SLIM" ] || fail "hiányzik: $SLIM"

keys_of() {  # $1: fájl — a Változó/Kapcsoló/Egyedi kapcsoló táblák kulcsai
  awk '
    /^[ \t]*\|/ && prev !~ /^[ \t]*\|/ { h = $0; sub(/^[ \t]*\|[ \t]*/, "", h); sub(/[ \t]*\|.*/, "", h); kt = (h == "Változó" || h == "Kapcsoló" || h == "Egyedi kapcsoló") }
    kt && /^[ \t]*\|[ \t]*`[A-Z][A-Z0-9_]*`/ { k = $0; sub(/^[ \t]*\|[ \t]*`/, "", k); sub(/`.*/, "", k); print k }
    { prev = $0 }
  ' "$1" | sort -u
}
heads_of() { grep -E '^#{2,3} ' "$1" | sed 's/\r$//' | sort -u; }

for port in .claude .agents; do
  D=$port/skills/dev-workflow
  T=$D/config.template.md
  R=$D/config-reference.md
  [ -f "$T" ] || fail "hiányzik: $T"
  [ -f "$R" ] || fail "hiányzik: $R"
  size=$(wc -c < "$T" | tr -d ' ')
  [ "$size" -le 20000 ] || fail "$T: $size bájt, a keret 20 000 — a magyarázat a config-reference.md-be való"
  missing=$(comm -23 "$(f=$(mktemp); heads_of "$T" > "$f"; echo "$f")" "$(f=$(mktemp); heads_of "$R" > "$f"; echo "$f")")
  [ -z "$missing" ] || fail "$T szakaszcíme(i) hiányoznak a $R-ből: $missing"
  missing=$(comm -23 "$(f=$(mktemp); keys_of "$R" > "$f"; echo "$f")" "$(f=$(mktemp); keys_of "$T" > "$f"; echo "$f")")
  [ -z "$missing" ] || fail "a $R kulcsa(i) nincsenek a $T-ben: $(echo $missing)"
done

# 4. Teljes referencia-beolvasásra utasító sor (szakasz-megkötés nélkül).
bad=$(git ls-files '.claude/skills/*.md' '.claude/agents/*.md' '.agents/skills/*.md' '.codex/agents/*' |
  xargs grep -nE '[Oo]lvasd be[^.]{0,30}\[?`[^`]*config-reference\.md`\]?(\([^)]*\))?-t\.' 2>/dev/null || true)
[ -z "$bad" ] || fail "teljes config-reference.md beolvasásra utasító sor (csak szakaszonként szabad): $bad"

# 5. Migráció szintetikus hosszú configon.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/pkg"
cat > "$TMP/pkg/config.template.md" <<'EOF'
# dev-workflow — konfiguráció (értékek)

Bevezető.

## Munkamódprofil (WORKFLOW_PROFILE)

| Változó | Érték |
|---|---|
| `WORKFLOW_PROFILE` | `balanced` |

### Preset-tábla

| Egyedi kapcsoló | `cheap` | `balanced` | `genius` |
|---|---|---|---|
| `GATE_ON_RED` | `escalate` | `once` | `retry` |
| `SCAN_DEPTH` | `off` | `auto` | `always` |

### Kapuk

| Kapcsoló | Érték |
|---|---|
| `GATE_TIMEOUT` | `15` |
| `NEW_KEY` | `uj` |

## Repók és projektek

| Logikai név | Repo path/URL | Alap branch | Jira project key |
|---|---|---|---|
| `<LOGICAL_REPO_NAME>` | `<REPO_PATH>` | `master` | `<JIRA_PROJECT_KEY>` |
EOF
cat > "$TMP/pkg/config-reference.md" <<'EOF'
# dev-workflow — konfiguráció: referencia

## Munkamódprofil (WORKFLOW_PROFILE)

### Preset-tábla

### Kapuk

### GATE_ON_RED értékek

## Repók és projektek
EOF
cat > "$TMP/old.md" <<'EOF'
# dev-workflow — központi konfiguráció

Hosszú bevezető.

## Munkamódprofil (WORKFLOW_PROFILE)

| Változó | Jelenlegi érték | Leírás |
|---|---|---|
| `WORKFLOW_PROFILE` | `genius` | Hosszú leírás. |

### Preset-tábla

| Egyedi kapcsoló | `cheap` | `balanced` | `genius` | Bevezető ticket |
|---|---|---|---|---|
| `GATE_ON_RED` | `escalate` | `once` | `retry` | X-1 |
| `SCAN_DEPTH` | `off` | `auto` | `always` | X-2 |

### Kapuk

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `GATE_TIMEOUT` | `30` | Lokálisan átírva. |

### GATE_ON_RED értékek

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `GATE_ON_RED` | `retry` | Felsorolás, nem érték. |
| | `escalate` | Másik érték. |
| `SCAN_DEPTH` | `off` | Lokális explicit felülbírálás. |

## Repók és projektek

| Logikai név | Repo path/URL | Alap branch | Jira project key |
|---|---|---|---|
| `myrepo` | `git@example:my/repo.git` | `main` | `ABC` |

## Saját szakasz (repó-lokális)

Lokális megjegyzés.

| Változó | Jelenlegi érték | Leírás |
|---|---|---|
| `LOCAL_ONLY_KEY` | `42` | Csak itt. |
EOF
# CRLF-es élő fájl
sed 's/$/\r/' "$TMP/old.md" > "$TMP/config.md"
cp "$TMP/config.md" "$TMP/orig.md"

node "$SLIM" "$TMP/config.md" "$TMP/pkg/config.template.md" > "$TMP/out.txt" 2>&1 || fail "a slim-config.js hibával állt le: $(cat "$TMP/out.txt")"
[ "$(tr -cd '\r' < "$TMP/config.md" | wc -c)" -gt 10 ] || fail "a CRLF sorvég nem maradt meg"
grep -Fq '# dev-workflow — konfiguráció (értékek)' "$TMP/config.md" || fail "nem a rövid sablonból épült"
grep -Fq 'Lokális megjegyzés.' "$TMP/config.md" || fail "a repó-lokális szakasz elveszett"
grep -Fq '| `myrepo` |' "$TMP/config.md" || fail "a repó-tábla nem az élő értékkel került át"
grep -Fq 'Hosszú leírás' "$TMP/config.md" && fail "a magyarázó szöveg bent maradt"
[ -f "$TMP/config.md.pre-4.30.bak" ] || fail "nincs .pre-4.30.bak mentés"
cmp -s "$TMP/config.md.pre-4.30.bak" "$TMP/orig.md" || fail "a mentés nem az eredeti fájl"

for k in WORKFLOW_PROFILE GATE_ON_RED SCAN_DEPTH GATE_TIMEOUT NEW_KEY LOCAL_ONLY_KEY; do
  for p in '' cheap balanced genius; do
    if [ -n "$p" ]; then
      a=$(env -u "$k" WORKFLOW_PROFILE="$p" DEV_WORKFLOW_CONFIG="$TMP/orig.md" bash "$CV" "$k" '<nincs>')
      b=$(env -u "$k" WORKFLOW_PROFILE="$p" DEV_WORKFLOW_CONFIG="$TMP/config.md" bash "$CV" "$k" '<nincs>')
    else
      a=$(env -u "$k" -u WORKFLOW_PROFILE DEV_WORKFLOW_CONFIG="$TMP/orig.md" bash "$CV" "$k" '<nincs>')
      b=$(env -u "$k" -u WORKFLOW_PROFILE DEV_WORKFLOW_CONFIG="$TMP/config.md" bash "$CV" "$k" '<nincs>')
    fi
    [ "$k" = NEW_KEY ] && { [ "$b" = uj ] || fail "NEW_KEY: az új kulcs nem a sablon-alapértékkel került be ($b)"; continue; }
    [ "$a" = "$b" ] || fail "$k [${p:-config}]: '$a' -> '$b' a migráció után"
  done
done

cp "$TMP/config.md" "$TMP/after1.md"
rc=0
node "$SLIM" "$TMP/config.md" "$TMP/pkg/config.template.md" > "$TMP/out2.txt" 2>&1 || rc=$?
[ "$rc" = 10 ] || fail "a második futás nem no-op (kilépőkód: $rc)"
cmp -s "$TMP/config.md" "$TMP/after1.md" || fail "a második futás módosította a fájlt"

echo "verify-config-split: OK"
