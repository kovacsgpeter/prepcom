#!/usr/bin/env sh
# A config-value.sh regressziós tesztje (ORD-380): az értékfelsorolás-sor nem explicit
# érték, a preset-tábla a WORKFLOW_PROFILE szerint harmadik forrás, az explicit érték
# megelőzi a presetet, a régi szerkezetű config is helyes értéket ad.
set -eu

fail() { echo "verify-config-value: $*" >&2; exit 1; }

CV=.claude/skills/dev-workflow/scripts/config-value.sh
TPL=.claude/skills/dev-workflow/config.template.md
[ -f "$CV" ] || fail "hiányzik: $CV"
[ -f "$TPL" ] || fail "hiányzik: $TPL"
cmp -s "$CV" .agents/skills/dev-workflow/scripts/config-value.sh \
  || fail "a .claude és a .agents config-value.sh eltér"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# val <config> <kulcs> <alap> [profil]: a WORKFLOW_PROFILE env csak a 4. paraméterrel él.
val() {
  if [ -n "${4:-}" ]; then
    env -u "$2" WORKFLOW_PROFILE="$4" DEV_WORKFLOW_CONFIG="$1" bash "$CV" "$2" "$3"
  else
    env -u "$2" -u WORKFLOW_PROFILE DEV_WORKFLOW_CONFIG="$1" bash "$CV" "$2" "$3"
  fi
}
expect() {  # $1 leírás, $2 várt, $3 kapott
  [ "$2" = "$3" ] || fail "$1: várt '$2', kapott '$3'"
}

# Régi szerkezetű mini-config: felsorolás-sorok az `Érték` fejlécű táblában, preset-tábla.
mkcfg() {  # $1 fájl, $2 profil, $3 extra explicit sor (lehet üres)
  {
    printf '%s\n' '| Változó | Jelenlegi érték | Leírás |' '|---|---|---|'
    printf '%s\n' "| \`WORKFLOW_PROFILE\` | \`$2\` | profil |"
    [ -z "$3" ] || printf '%s\n' "$3"
    cat <<'EOF'

| Egyedi kapcsoló | `cheap` | `balanced` | `genius` | Ticket |
|---|---|---|---|---|
| `PIPELINE_GATE_ON_RED` | `escalate` | `once-then-escalate` | `retry` | x |
| `PIPELINE_GATE_POSITION` | `before-review` | `before-review` | `after-review` | x |
| `PIPELINE_GATE_ON_TIMEOUT` | `ask` | `ask` | `auto` | x |
| `LOCAL_GATE_MODE` | `fast` | `full` | `full` | x |
| `RUN_METRICS` | `off` | `collect+estimate` | `collect+estimate` | x |
| `LOCAL_MODEL_NUM_CTX` | *(nincs)* | *(nincs)* | *(nincs)* | x |
| `LOCAL_MODEL_NAME` | `a` → `b` | `c` → `d` | lásd lent | x |

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `PIPELINE_GATE_ON_RED` | `retry` | Az implementer javít. |
| | `once-then-escalate` | Egy kísérlet. |
| | `escalate` | Azonnal fix-ticket. |
| `PIPELINE_GATE_POSITION` | `before-review` | Review előtt. |
| | `after-review` | Review után. |
| `PIPELINE_GATE_TIMEOUT_MINUTES` | `15` | Felső korlát. |

| Érték | Jelentés |
|---|---|
| `full` | Teljes kapu. |
| `fast` | Gyors kapu. |
EOF
  } > "$1"
}

for p in cheap balanced genius; do mkcfg "$TMP/$p.md" "$p" ""; done

# AC1 és AC4: a régi szerkezetű config a profil szerinti preset-értéket adja.
expect "cheap ON_RED" escalate "$(val "$TMP/cheap.md" PIPELINE_GATE_ON_RED x)"
expect "balanced ON_RED" once-then-escalate "$(val "$TMP/balanced.md" PIPELINE_GATE_ON_RED x)"
expect "genius ON_RED" retry "$(val "$TMP/genius.md" PIPELINE_GATE_ON_RED x)"
expect "cheap POSITION" before-review "$(val "$TMP/cheap.md" PIPELINE_GATE_POSITION x)"
expect "balanced POSITION" before-review "$(val "$TMP/balanced.md" PIPELINE_GATE_POSITION x)"
expect "genius POSITION" after-review "$(val "$TMP/genius.md" PIPELINE_GATE_POSITION x)"
expect "cheap ON_TIMEOUT" ask "$(val "$TMP/cheap.md" PIPELINE_GATE_ON_TIMEOUT x)"
expect "balanced ON_TIMEOUT" ask "$(val "$TMP/balanced.md" PIPELINE_GATE_ON_TIMEOUT x)"
expect "genius ON_TIMEOUT" auto "$(val "$TMP/genius.md" PIPELINE_GATE_ON_TIMEOUT x)"

# Valódi beállított érték marad explicit.
expect "TIMEOUT_MINUTES" 15 "$(val "$TMP/balanced.md" PIPELINE_GATE_TIMEOUT_MINUTES 0)"

# AC3: az `Érték | Jelentés` fejlécű tábla nem forrás, a preset nyer.
expect "LOCAL_GATE_MODE cheap" fast "$(val "$TMP/cheap.md" LOCAL_GATE_MODE x)"
expect "LOCAL_GATE_MODE balanced" full "$(val "$TMP/balanced.md" LOCAL_GATE_MODE x)"
expect "RUN_METRICS balanced" collect+estimate "$(val "$TMP/balanced.md" RUN_METRICS off)"

# Nem érték preset-cella: a hívói alapérték.
expect "nincs cella" '<nincs>' "$(val "$TMP/balanced.md" LOCAL_MODEL_NUM_CTX '<nincs>')"
expect "nyilas cella" '<nincs>' "$(val "$TMP/balanced.md" LOCAL_MODEL_NAME '<nincs>')"
expect "lásd cella" '<nincs>' "$(val "$TMP/genius.md" LOCAL_MODEL_NAME '<nincs>')"
expect "ismeretlen kulcs" '<nincs>' "$(val "$TMP/balanced.md" NINCS_ILYEN_KULCS '<nincs>')"

# AC2: az explicit sor megelőzi a presetet.
mkcfg "$TMP/explicit.md" genius '| `PIPELINE_GATE_ON_RED` | `escalate` | explicit |'
expect "explicit a preset előtt" escalate "$(val "$TMP/explicit.md" PIPELINE_GATE_ON_RED x)"

# Env-felülbírálás mindent megelőz.
expect "env" retry "$(env PIPELINE_GATE_ON_RED=retry DEV_WORKFLOW_CONFIG="$TMP/cheap.md" bash "$CV" PIPELINE_GATE_ON_RED x)"

# A WORKFLOW_PROFILE env felülírja a config profilját; érvénytelen profil = balanced.
expect "profil env" retry "$(val "$TMP/cheap.md" PIPELINE_GATE_ON_RED x genius)"
expect "érvénytelen profil" once-then-escalate "$(val "$TMP/cheap.md" PIPELINE_GATE_ON_RED x bogus)"

# Hiányzó config: alapérték.
expect "hiányzó config" x "$(val "$TMP/nincs-ilyen.md" PIPELINE_GATE_ON_RED x)"

# A fixture-t a szkript nem módosítja.
cp "$TMP/balanced.md" "$TMP/balanced.copy"
val "$TMP/balanced.md" PIPELINE_GATE_ON_RED x >/dev/null
cmp -s "$TMP/balanced.md" "$TMP/balanced.copy" || fail "a config-value.sh módosította a configot"

# Az éles sablon: a felsorolás-kulcsok és a preset-only kulcsok a balanced preset szerint.
expect "sablon ON_RED" once-then-escalate "$(val "$TPL" PIPELINE_GATE_ON_RED x)"
expect "sablon POSITION" before-review "$(val "$TPL" PIPELINE_GATE_POSITION x)"
expect "sablon ON_TIMEOUT" ask "$(val "$TPL" PIPELINE_GATE_ON_TIMEOUT x)"
expect "sablon BLOCKING_JOBS" rule "$(val "$TPL" PIPELINE_GATE_BLOCKING_JOBS x)"
expect "sablon TIMEOUT_MINUTES" 15 "$(val "$TPL" PIPELINE_GATE_TIMEOUT_MINUTES 0)"
expect "sablon POLL_SECONDS" 45 "$(val "$TPL" PIPELINE_GATE_POLL_SECONDS 1)"
expect "sablon ON_RED cheap" escalate "$(val "$TPL" PIPELINE_GATE_ON_RED x cheap)"
expect "sablon ON_RED genius" retry "$(val "$TPL" PIPELINE_GATE_ON_RED x genius)"
expect "sablon LOCAL_GATE_MODE" full "$(val "$TPL" LOCAL_GATE_MODE x)"

echo "verify-config-value: OK"
