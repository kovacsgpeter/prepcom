#!/usr/bin/env sh
# COCALC-392: a CI-ban ténylegesen használt npm FŐVERZIÓJÁNAK feloldása, beégetés
# nélkül -- a `.gitlab-ci.yml` `frontend-test`/`angular-build` job image-éből kiolvasott
# Node főverzióhoz tartozó, ténylegesen bundle-özött npm verzió.
#
# ELSŐDLEGES forrás: https://nodejs.org/dist/index.json -- a Node kiadási index minden
# kiadáshoz feltünteti a hozzá csomagolt npm verziót (`.npm` mező). A megadott Node
# főverzió-vonal (pl. "22") legfrissebb, npm mezővel rendelkező kiadását vesszük, és
# abból a npm főverziót. Ez self-updating: ha a CI image-tag bővül (node:22 -> node:24),
# a szkript módosítás nélkül a helyes új npm főverziót adja.
#
# Ez a hálózati hívás EXPLICIT felülírható egy lokális index-fájllal -- ez KIZÁRÓLAG
# tesztelési/offline célra való (pl. a ci/verify-frontend-lockfile-sync.sh self-check
# fixture-rel teszteli a feloldási logikát, hálózat nélkül), ÉLES futásban (az
# implementer lokál kapujában) soha nem aktiválódik automatikusan -- csendes fallbackként
# NEM viselkedik, csak ha valaki explicit átadja:
#   --index-file <path>          argumentum, VAGY
#   NODE_DIST_INDEX=<path>       env-változó (az argumentum elsőbbséget élvez)
#
# TARTALÉK forrás (csak, ha a fenti -- hálózati vagy felülírt fájl-alapú -- elsődleges
# forrás sikertelen): a CI image tényleges introspekciója Dockerrel -- `docker run --rm
# <image> npm --version` -- ez pontosan azt az npm-et kérdezi meg, ami a valódi
# CI-futtatásban is fut, tehát ugyanúgy nem beégetett mapping-tábla.
#
# Ha SEM az elsődleges forrás, SEM a docker-fallback nem oldható fel: hangos hiba, exit 2.
# NINCS beégetett npm-major konstans -- ez a szkript soha nem "talál ki" egy értéket.
#
# Használat: sh resolve-ci-npm-major.sh [--ci-yml <path>] [--index-file <path>]
#            (repo gyökeréből, alap CI-fájl: .gitlab-ci.yml)
# Kimenet (stdout, siker esetén): egyetlen sor, az npm főverzió száma (pl. "10").
set -eu

CI_YML=".gitlab-ci.yml"
INDEX_FILE="${NODE_DIST_INDEX:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --ci-yml)
      CI_YML="$2"
      shift 2
      ;;
    --index-file)
      INDEX_FILE="$2"
      shift 2
      ;;
    *)
      echo "resolve-ci-npm-major: ismeretlen argumentum: $1" >&2
      exit 2
      ;;
  esac
done

die() {
  echo "resolve-ci-npm-major: HIBA -- $1" >&2
  exit 2
}

test -f "$CI_YML" || die "nem talalhato a CI-fajl: $CI_YML"
command -v node >/dev/null 2>&1 || die "nincs 'node' a PATH-on -- ehhez a szkripthez node szukseges"

if [ -n "$INDEX_FILE" ]; then
  test -f "$INDEX_FILE" || die "a megadott index-file/NODE_DIST_INDEX nem talalhato: $INDEX_FILE"
fi

# --- 1. A frontend node-image kiolvasasa a .gitlab-ci.yml-bol ------------------------
# A job-blokk a job nevevel (oszlop 0-n, ":"-ra vegzodo sor) kezdodik, es a kovetkezo,
# szinten oszlop 0-n allo, nem-komment sorig tart. Elobb a frontend-test, majd -- ha az
# nincs meg -- az angular-build jobot probaljuk (mindketto ugyanazt a node-image-et
# hasznalja ma, de ha ez elterne, a frontend-test az iranyado, mert a lockfile-
# ellenorzeshez ez all legkozelebb).
extract_job_image() {
  job="$1"
  awk -v job="${job}:" '
    $0 == job { grab = 1; next }
    grab && $0 ~ /^[^[:space:]#]/ { exit }
    grab && $0 ~ /image:[[:space:]]*node:/ {
      line = $0
      sub(/^.*image:[[:space:]]*/, "", line)
      gsub(/\r$/, "", line)
      print line
      exit
    }
  ' "$CI_YML"
}

NODE_IMAGE="$(extract_job_image "frontend-test")"
[ -n "$NODE_IMAGE" ] || NODE_IMAGE="$(extract_job_image "angular-build")"
[ -n "$NODE_IMAGE" ] || die "a $CI_YML-ben sem a frontend-test, sem az angular-build job alatt nincs 'image: node:...' sor"

NODE_MAJOR="$(printf '%s' "$NODE_IMAGE" | sed -n 's/^node:\([0-9][0-9]*\).*/\1/p')"
[ -n "$NODE_MAJOR" ] || die "nem sikerult Node fovezio-szamot kiolvasni a(z) '$NODE_IMAGE' image-tagbol"

# --- 2. ELSODLEGES forras: nodejs.org/dist/index.json, VAGY -- explicit felulirassal --
#        egy lokalis index-fajl (csak teszt/offline celra, lasd fent) -----------------
PRIMARY_ERR_FILE="$(mktemp)"
trap 'rm -f "$PRIMARY_ERR_FILE"' EXIT

NPM_MAJOR="$(
  node -e '
    (function () {
      var major = process.argv[1];
      var indexFile = process.argv[2] || "";

      function resolveFromList(list) {
        var entry = Array.isArray(list)
          ? list.find(function (r) {
              return typeof r.version === "string" && r.version.indexOf("v" + major + ".") === 0 && r.npm;
            })
          : undefined;
        if (!entry) {
          console.error("nincs npm mezovel rendelkezo v" + major + ".x kiadas a forrasban");
          process.exitCode = 3;
          return;
        }
        console.log(String(entry.npm).split(".")[0]);
      }

      if (indexFile) {
        var fs = require("fs");
        var list;
        try {
          list = JSON.parse(fs.readFileSync(indexFile, "utf8"));
        } catch (e) {
          console.error("index-file parse hiba (" + indexFile + "): " + e.message);
          process.exitCode = 3;
          return;
        }
        resolveFromList(list);
        return;
      }

      var https = require("https");
      var req = https.get("https://nodejs.org/dist/index.json", { timeout: 10000 }, function (res) {
        if (res.statusCode !== 200) {
          console.error("nodejs.org/dist/index.json HTTP " + res.statusCode);
          process.exitCode = 3;
          res.resume();
          return;
        }
        var data = "";
        res.on("data", function (c) { data += c; });
        res.on("end", function () {
          var list;
          try {
            list = JSON.parse(data);
          } catch (e) {
            console.error("index.json parse hiba: " + e.message);
            process.exitCode = 3;
            return;
          }
          resolveFromList(list);
        });
      });
      req.on("error", function (e) {
        console.error("halozati hiba (nodejs.org/dist/index.json): " + e.message);
        process.exitCode = 3;
      });
      req.on("timeout", function () {
        req.destroy();
        console.error("idotullepes (nodejs.org/dist/index.json)");
        process.exitCode = 3;
      });
    })();
  ' "$NODE_MAJOR" "$INDEX_FILE" 2>"$PRIMARY_ERR_FILE"
)" || true

if [ -n "$NPM_MAJOR" ]; then
  printf '%s\n' "$NPM_MAJOR"
  exit 0
fi

if [ -n "$INDEX_FILE" ]; then
  echo "resolve-ci-npm-major: FIGYELMEZTETES -- az elsodleges forras (index-file: $INDEX_FILE) sikertelen, tartalek (docker) probalkozas:" >&2
else
  echo "resolve-ci-npm-major: FIGYELMEZTETES -- az elsodleges forras (nodejs.org/dist/index.json) sikertelen, tartalek (docker) probalkozas:" >&2
fi
cat "$PRIMARY_ERR_FILE" >&2 2>/dev/null || true

# --- 3. TARTALEK forras: docker image-introspekcio -----------------------------------
if command -v docker >/dev/null 2>&1; then
  DOCKER_ERR_FILE="$(mktemp)"
  trap 'rm -f "$PRIMARY_ERR_FILE" "$DOCKER_ERR_FILE"' EXIT
  DOCKER_NPM_VERSION="$(docker run --rm "$NODE_IMAGE" npm --version 2>"$DOCKER_ERR_FILE")" || true
  if [ -n "$DOCKER_NPM_VERSION" ]; then
    printf '%s\n' "$DOCKER_NPM_VERSION" | sed -n 's/^\([0-9][0-9]*\).*/\1/p'
    exit 0
  fi
  echo "resolve-ci-npm-major: FIGYELMEZTETES -- a docker-fallback (docker run --rm $NODE_IMAGE npm --version) is sikertelen:" >&2
  cat "$DOCKER_ERR_FILE" >&2 2>/dev/null || true
else
  echo "resolve-ci-npm-major: FIGYELMEZTETES -- nincs 'docker' a PATH-on, a tartalek forras sem probalhato." >&2
fi

die "sem az elsodleges forras, sem a docker-fallback nem oldotta fel a(z) '$NODE_IMAGE' image npm fovezioja. Nincs beegetett fallback-ertek -- ellenorizd a halozati elerest vagy a Docker Desktop futasat."
