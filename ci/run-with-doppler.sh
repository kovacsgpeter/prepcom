#!/bin/sh
# COCALC-345: általános célú Doppler-run wrapper CI-jobokhoz.
#
# Ha a DOPPLER_TOKEN CI/CD-változó be van állítva, a megadott parancsot a
# `doppler run` alá futtatja, ami a DOPPLER_PROJECT/DOPPLER_CONFIG (Doppler-projekt/
# config) alól env-változóként injektálja a benne tárolt secreteket a parancs
# folyamatába — a parancs maga NEM tud/nem is kell tudnia arról, hogy Doppleren
# keresztül fut, ugyanúgy `os.environ`/`Environment`-ből olvas, mintha a GitLab
# CI/CD Variables listájából jönne az érték.
#
# Ha a DOPPLER_TOKEN NINCS beállítva (a projekt/job még nem állt át Dopplerre, vagy
# ez egy olyan job, ami ma még nem fogyaszt app-szintű secretet — lásd a
# backend-deploy jobban a jövőbeli SPRING_DATASOURCE_*/JWT_SECRET/SPRING_MAIL_*/
# OAUTH2_SUCCESS_REDIRECT_URI/WORDCLOUD_EMAIL_* előkészítést), a parancs
# VÁLTOZATLANUL, közvetlenül fut — nincs kényszerített Doppler-függőség, a mai
# GitLab CI/CD Variable-alapú működés törés nélkül megy tovább.
#
# Használat: sh ci/run-with-doppler.sh <parancs> [argumentum...]
#
# Kapcsolók (env var):
#   DOPPLER_TOKEN   - Doppler Service Token (a GitLab CI/CD Variables alól, Protected+Masked)
#   DOPPLER_PROJECT - Doppler projekt neve (alap: "prepcom" - a felhasználónak a saját
#                     Doppler-projekt-nevével összhangba kell hoznia, ha attól eltér)
#   DOPPLER_CONFIG  - Doppler config neve (alap: "ci")
#
# Részletes migrációs útmutató: how-to-oauth-config.md / how-to-app-email.md
# "Doppler-alapú titok-tárolás" szekciója.
set -eu

if [ "$#" -eq 0 ]; then
  echo "Hasznalat: sh ci/run-with-doppler.sh <parancs> [argumentum...]" >&2
  exit 2
fi

if [ -n "${DOPPLER_TOKEN:-}" ]; then
  DOPPLER_PROJECT="${DOPPLER_PROJECT:-prepcom}"
  DOPPLER_CONFIG="${DOPPLER_CONFIG:-ci}"

  if ! command -v doppler >/dev/null 2>&1; then
    echo "HIBA: a doppler CLI nincs telepitve, de DOPPLER_TOKEN beallitva van. A job before_script-jenek telepitenie kell a doppler CLI-t, mielott ez a wrapper futna." >&2
    exit 1
  fi

  echo "Doppler-run: project=$DOPPLER_PROJECT config=$DOPPLER_CONFIG"
  # A DOPPLER_TOKEN-t szandekosan NEM --token=... argumentumkent adjuk at (az process-
  # listaban/ps-ben lathato lenne masik felhasznalonak/folyamatnak) - a Doppler CLI
  # natívan olvassa a mar exportalt DOPPLER_TOKEN env vart, ezert az elegendo.
  exec doppler run --project="$DOPPLER_PROJECT" --config="$DOPPLER_CONFIG" -- "$@"
fi

echo "DOPPLER_TOKEN nincs beallitva - a parancs Doppler nelkul, kozvetlenul fut."
exec "$@"
