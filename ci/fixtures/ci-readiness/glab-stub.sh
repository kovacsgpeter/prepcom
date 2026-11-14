#!/usr/bin/env bash
set -euo pipefail

# ORD-382, 4.28.0
# Hamis glab a fixture-alapú tesztekhez.
# Használat: glab-stub.sh api [-X <METHOD>] <végpont> [...]

if [ "${1:-}" != "api" ]; then
  echo "Hiba: az első argumentumnak 'api'-nak kell lennie" >&2
  exit 1
fi

# Argumentumok feldolgozása
shift # eltávolítjuk az 'api' argumentumot

method="GET"
endpoint=""

while [ $# -gt 0 ]; do
  case "$1" in
    -X)
      shift
      method="$1"
      ;;
    *)
      if [ -z "$endpoint" ]; then
        endpoint="$1"
      fi
      ;;
  esac
  shift
done

# Író hívások tiltása
if [[ "$method" == "POST" || "$method" == "PUT" || "$method" == "PATCH" || "$method" == "DELETE" ]]; then
  echo "glab-stub: író hívás tiltva" >&2
  exit 99
fi

# Lekérdezés levágása a végpontról
endpoint="${endpoint%%\?*}"

# Fixture fájl meghatározása
fixture_file=""

if [[ "$endpoint" == projects/*/protected_branches* ]]; then
  fixture_file="protected_branches.json"
elif [[ "$endpoint" == projects/*/runners* ]]; then
  fixture_file="runners.json"
elif [[ "$endpoint" == projects/*/repository/files/* ]]; then
  fixture_file="gitlab-ci.yml"
elif [[ "$endpoint" == projects/* ]]; then
  fixture_file="project.json"
elif [[ "$endpoint" == runners/* ]]; then
  runner_id="${endpoint#runners/}"
  fixture_file="runner-${runner_id}.json"
elif [[ "$endpoint" == namespaces/* ]]; then
  fixture_file="namespace.json"
elif [[ "$endpoint" == groups/* ]]; then
  fixture_file="group.json"
else
  echo "glab: 404 Not Found" >&2
  exit 1
fi

# Fixture fájl ellenőrzése és kiírása
if [ ! -f "${CI_READINESS_FIXTURES}/${fixture_file}" ]; then
  echo "glab: 404 Not Found (hiányzó fixture: ${fixture_file})" >&2
  exit 1
fi

cat "${CI_READINESS_FIXTURES}/${fixture_file}"
exit 0
