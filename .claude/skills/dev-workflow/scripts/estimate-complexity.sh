#!/usr/bin/env sh
# COCALC-273 (MEAS-2) -- "formula" komplexitas-becsles: kizarolag szamolhato jelekbol
# (AC-tetelszam, erintett retegek szama, van-e design/oldalnev), nulla extra LLM-tokennel.
# A dev-workflow-intake/SKILL.md "3. Ticket osszeallitasa" lepese hivja, COMPLEXITY_ESTIMATION
# = formula VAGY hybrid eseten (hybrid: ez adja a "gepi alapot", amit az interjut vezeto
# modell utana felulbiralhat -- lasd config.md "COMPLEXITY_ESTIMATION" szekcio).
#
# A kanonikus dokumentacio a config.md "Komplexitas -> vegrehajto-szint routing" szekcioja
# -- ha ott modosul a formula sulyozasa/kuszobei, EZT A SZKRIPTET IS at kell vezetni (a
# szkript nem tud markdown tablazatot beolvasni futasidoben, ugyanaz az ok, mint az
# AI-identitas szkripteknel, lasd config.md "A harom csatorna..." szakasz zaro bekezdese).
#
# Hasznalat:
#   estimate-complexity.sh --ac-count N --layers N [--design 0|1]
#
# Kimenet (stdout, sikeres futasnal): "<SZINT> (<N> AC, <M> reteg[, design] -- gepi)"
# Szintek: S / M / L.
#
# Szabaly: score = ac_count + layers*2 + design*2; score<=5 -> S, score<=10 -> M, kulonben L.
# Kereszthivatkozas (COCALC-273 AC14 / story-interview/dor-checklist.md:39-47 meret-
# figyelmeztetes): 8-nal tobb AC eseten a szint sosem lehet S -- a fenti sulyozas mellett
# ez a formulabol mar strukturalisan is kovetkezik (az ac_count onmagaban >8 > S kuszob),
# de explicit guard is van lent, vedelmi halokent, ha a sulyozas kesobb valtozna.
#
# Ervenytelen/hianyzo bemenet: hibauzenet stderr-re, kilepokod 2 -- a hivo felnek ilyenkor
# hybrid/llm modra kell esnie, vagy meg kell kerdeznie a felhasznalot.
set -eu

ac_count=""
layers=""
design=0

while [ $# -gt 0 ]; do
  case "$1" in
    --ac-count) ac_count="${2:-}"; shift 2 ;;
    --layers) layers="${2:-}"; shift 2 ;;
    --design) design="${2:-}"; shift 2 ;;
    *) echo "estimate-complexity: ismeretlen argumentum: $1" >&2; exit 2 ;;
  esac
done

case "$ac_count" in
  ''|*[!0-9]*) echo "estimate-complexity: --ac-count hianyzik vagy nem nemnegativ egesz szam" >&2; exit 2 ;;
esac
case "$layers" in
  ''|*[!0-9]*) echo "estimate-complexity: --layers hianyzik vagy nem nemnegativ egesz szam" >&2; exit 2 ;;
esac
case "$design" in
  0|1) : ;;
  *) echo "estimate-complexity: --design csak 0 vagy 1 lehet" >&2; exit 2 ;;
esac

score=$((ac_count + layers * 2 + design * 2))

if [ "$score" -le 5 ]; then
  level="S"
elif [ "$score" -le 10 ]; then
  level="M"
else
  level="L"
fi

# Vedelmi halo -- lasd fenti kereszthivatkozas.
if [ "$ac_count" -gt 8 ] && [ "$level" = "S" ]; then
  level="M"
fi

design_note=""
if [ "$design" = "1" ]; then
  design_note=", design"
fi

echo "${level} (${ac_count} AC, ${layers} réteg${design_note} — gépi)"
