#!/usr/bin/env sh
# COCALC-275 (SKILL-2) önellenőrzés: a tervezésidejű fenyegetés-modellezés
# (kockázat-katalógus + biztonsági AC-k az intake-ben) konzisztenciája.
#
# Amit ellenőriz:
#  - a kockázat-katalógus pontosan 8 kategóriát tartalmaz, mindegyiknél kiváltó jel +
#    minta-AC alcímmel;
#  - az átvételi fixture "Várt minimum" szakasza kizárólag a katalógusban ténylegesen
#    létező kategórianevekre hivatkozik;
#  - a három THREAT_MODEL_* kapcsoló be van huzalozva a config.md-be: WORKFLOW_PROFILE
#    preset-tábla sor (uniform érték minden profil-oszlopban) + önálló "### ... értékek"
#    szekció az érvényes értékkészlettel és a fallback-mondattal;
#  - a skill-fájlok (dor-checklist.md, story-interview/SKILL.md, intake/SKILL.md,
#    jira-ticket-template.md) dokumentációs bekötése, beleértve a `[biztonsági]`
#    AC-jelölés-konvenciót.
set -eu

CATALOG=.claude/skills/story-interview/threat-catalog.md
FIXTURE=.claude/skills/story-interview/threat-model-fixture.md
DOR=.claude/skills/story-interview/dor-checklist.md
SI_SKILL=.claude/skills/story-interview/SKILL.md
INTAKE=.claude/skills/dev-workflow-intake/SKILL.md
TEMPLATE=.claude/skills/dev-workflow/jira-ticket-template.md
CONFIG=.claude/skills/dev-workflow/config-reference.md  # ORD-497: a magyarázatok a referenciában

fail() { echo "verify-threat-model-config: $1" >&2; exit 1; }

# Kivágja a CONFIG egy "### <heading>" szekciójának törzsét (a következő bármilyen
# szintű markdown-fejlécig). A start-mintát csak sor eleji találatként fogadja el, hogy a
# preset-tábla "lásd lent ..." hivatkozásaira ne ugorjon rá.
config_section() {
  awk -v start="$1" '
    index($0, start) == 1 { grab = 1; next }
    grab && /^#+ / { exit }
    grab { print }
  ' "$CONFIG"
}

# --- 1. Az új fájlok megléte ---
test -f "$CATALOG" || fail "hiányzik a kockázat-katalógus: $CATALOG"
test -f "$FIXTURE" || fail "hiányzik az átvételi fixture: $FIXTURE"

# --- 2. A katalógus pontosan 8 kategóriát tartalmaz, kiváltó jellel + minta-AC-vel ---
cat_count=$(grep -c '^### ' "$CATALOG" || true)
[ "$cat_count" -eq 8 ] || fail "a threat-catalog.md nem pontosan 8 '### ' kategóriát tartalmaz (talált: $cat_count)"

# A kategória-alcímek sor eleji '**Mikor releváns' / '**Minta-AC:**' formában állnak — a
# "Hogyan használd" bekezdés prózai említései bekezdés-jellel kezdődnek, azok nem
# számítanak.
mikor_count=$(grep -c '^\*\*Mikor releváns' "$CATALOG" || true)
[ "$mikor_count" -eq 8 ] || fail "nem mind a 8 kategóriának van 'Mikor releváns' kiváltó-jel alcíme (talált: $mikor_count)"

minta_count=$(grep -c '^\*\*Minta-AC:\*\*' "$CATALOG" || true)
[ "$minta_count" -eq 8 ] || fail "nem mind a 8 kategóriának van 'Minta-AC:' alcíme (talált: $minta_count)"

# --- 3. A fixture "Várt minimum" szakasza létező katalógus-kategóriákra hivatkozik ---
grep -Fq '## Várt minimum' "$FIXTURE" || fail "a fixture-ből hiányzik a '## Várt minimum' szakasz"
expected=$(awk '
  /^## Várt minimum/ { f = 1; next }
  /^## / { f = 0 }
  f && /^- / { sub(/^- /, ""); print }
' "$FIXTURE")
[ -n "$expected" ] || fail "a fixture 'Várt minimum' szakaszában nincs egyetlen '- ' kategória-hivatkozás sem"
n_expected=$(printf '%s\n' "$expected" | grep -c . || true)
[ "$n_expected" -ge 3 ] || fail "a fixture 'Várt minimum' szakasza kevesebb mint 3 kategóriát sorol fel (talált: $n_expected)"
printf '%s\n' "$expected" | while IFS= read -r cat; do
  [ -z "$cat" ] && continue
  grep -Fq "### $cat" "$CATALOG" || fail "a fixture várt-minimum kategóriája nincs a katalógusban: '$cat'"
done

# --- 4. config.md: WORKFLOW_PROFILE preset-tábla — 3 uniform sor ---
grep -Fq '| `THREAT_MODEL_INTAKE` | `auto` | `auto` | `auto` |' "$CONFIG" \
  || fail "hiányzik/nem uniform a THREAT_MODEL_INTAKE preset-tábla sor"
grep -Fq '| `THREAT_MODEL_STRATEGY` | `hybrid` | `hybrid` | `hybrid` |' "$CONFIG" \
  || fail "hiányzik/nem uniform a THREAT_MODEL_STRATEGY preset-tábla sor"
grep -Fq '| `THREAT_MODEL_AUTONOMY` | `ask` | `ask` | `ask` |' "$CONFIG" \
  || fail "hiányzik/nem uniform a THREAT_MODEL_AUTONOMY preset-tábla sor"

# --- 5. config.md: 3 önálló szekció, érvényes értékkészlettel + fallback-mondattal ---
intake_sec=$(config_section '### THREAT_MODEL_INTAKE értékek')
strategy_sec=$(config_section '### THREAT_MODEL_STRATEGY értékek')
autonomy_sec=$(config_section '### THREAT_MODEL_AUTONOMY értékek')

[ -n "$intake_sec" ] || fail "hiányzik a '### THREAT_MODEL_INTAKE értékek' szekció"
[ -n "$strategy_sec" ] || fail "hiányzik a '### THREAT_MODEL_STRATEGY értékek' szekció"
[ -n "$autonomy_sec" ] || fail "hiányzik a '### THREAT_MODEL_AUTONOMY értékek' szekció"

for tok in '`off`' '`auto`' '`always`'; do
  printf '%s' "$intake_sec" | grep -Fq "$tok" || fail "a THREAT_MODEL_INTAKE szekcióból hiányzik a(z) $tok érték"
done
for tok in '`checklist`' '`hybrid`' '`llm`'; do
  printf '%s' "$strategy_sec" | grep -Fq "$tok" || fail "a THREAT_MODEL_STRATEGY szekcióból hiányzik a(z) $tok érték"
done
for tok in '`ask`' '`notify`' '`auto`'; do
  printf '%s' "$autonomy_sec" | grep -Fq "$tok" || fail "a THREAT_MODEL_AUTONOMY szekcióból hiányzik a(z) $tok érték"
done

printf '%s' "$intake_sec" | grep -Eq 'alapérték|[Ff]allback' || fail "a THREAT_MODEL_INTAKE szekcióból hiányzik a fallback-mondat"
printf '%s' "$strategy_sec" | grep -Eq 'alapérték|[Ff]allback' || fail "a THREAT_MODEL_STRATEGY szekcióból hiányzik a fallback-mondat"
printf '%s' "$autonomy_sec" | grep -Eq 'alapérték|[Ff]allback' || fail "a THREAT_MODEL_AUTONOMY szekcióból hiányzik a fallback-mondat"

# --- 6. dor-checklist.md: katalógus-hivatkozás + 'funkcionális AC' pontosítás + jelölés-doksi ---
grep -Fq 'threat-catalog.md' "$DOR" || fail "a dor-checklist.md nem hivatkozik a threat-catalog.md-re"
grep -Fq 'Biztonsági kockázatok' "$DOR" || fail "a dor-checklist.md-ből hiányzik a 'Biztonsági kockázatok' DoR-pont"
grep -Fq 'funkcionális AC' "$DOR" || fail "a dor-checklist.md méret-figyelmeztetése nincs 'funkcionális AC'-re pontosítva"
grep -Fq '[biztonsági]' "$DOR" || fail "a dor-checklist.md nem dokumentálja a [biztonsági] AC-jelölést"

# --- 7. story-interview/SKILL.md: DoR Spec blokk új mező ---
grep -Fq '**Biztonsági kockázatok:**' "$SI_SKILL" || fail "a story-interview DoR Spec blokkból hiányzik a '**Biztonsági kockázatok:**' mező"

# --- 8. intake/SKILL.md: 2.c lépés + 3 kulcsnév + katalógus-hivatkozás + jelölés-doksi ---
grep -Fq '2.c' "$INTAKE" || fail "az intake/SKILL.md-ből hiányzik a '2.c' fenyegetés-modellezés lépés"
for key in THREAT_MODEL_INTAKE THREAT_MODEL_STRATEGY THREAT_MODEL_AUTONOMY; do
  grep -Fq "$key" "$INTAKE" || fail "az intake/SKILL.md nem hivatkozik a(z) $key kapcsolóra"
done
grep -Fq 'threat-catalog.md' "$INTAKE" || fail "az intake/SKILL.md nem hivatkozik a threat-catalog.md-re"
grep -Fq '[biztonsági]' "$INTAKE" || fail "az intake/SKILL.md nem dokumentálja a [biztonsági] AC-jelölést"

# --- 9. jira-ticket-template.md: Biztonsági megfontolások szekció + 'kimarad, ha nem futott' ---
grep -Fq '## Biztonsági megfontolások' "$TEMPLATE" || fail "a jira-ticket-template.md-ből hiányzik a '## Biztonsági megfontolások' szekció"
grep -Fq 'kimarad' "$TEMPLATE" || fail "a jira-ticket-template.md nem mondja ki, hogy a szekció kimarad, ha a fenyegetés-modell nem futott"

echo "verify-threat-model-config: OK"
