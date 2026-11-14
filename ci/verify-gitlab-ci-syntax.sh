#!/usr/bin/env sh
# COCALC-311: offline .gitlab-ci.yml well-formedness + GitLab-CI séma-lint.
#
# Miért van: COCALC-232 során egy hibás sor átcsúszott a review-kön. A
# `dev-workflow-publish` job utolsó script-sora
#     - echo "Feltoltve: ${PACKAGE_REGISTRY_URL}"
# idézőjelezetlen plain scalarként, a `: ` (kettőspont+szóköz) miatt YAML **mappingként**
# parse-olódott: a `script:` tömb egy stringtömb helyett egy egykulcsos mappinget
# tartalmazott (`{'echo "Feltoltve': '${...}"'}`) -> GitLab: "script config should be a
# string or a nested array of strings", és az EGÉSZ pipeline elhasalt. Ez csak a
# hálózatos, tokenes `glab ci lint`-tel derült ki -> kell egy offline, hálózat/token
# nélküli önellenőrzés a dev-workflow self-checkhez.
#
# Kulcsfelismerés: a puszta YAML `safe_load` NEM fogta volna meg ezt (`- kulcs: érték`
# önmagában érvényes YAML mapping). Az ellenőrzés GitLab-CI-TUDATOS: minden top-level
# job-definícióra ÉS a `default:` blokkra a `script` / `before_script` / `after_script`
# értékének stringnek VAGY (legfeljebb egy szint mélyen beágyazott) stringlistának kell
# lennie — a GitLab egy szintet lapít. Egy mapping-elem a COCALC-232 hibaosztály; bármely
# más nem-string levél (szám / None / mélyebb lista) szintén hiba.
#
# Használat (repo gyökeréből):
#     sh ci/verify-gitlab-ci-syntax.sh                 # a repo .gitlab-ci.yml-jét nézi
#     sh ci/verify-gitlab-ci-syntax.sh --file <path>   # más fájlt
#     sh ci/verify-gitlab-ci-syntax.sh --self-test     # beágyazott önteszt (mktemp fixture-ök)
#
# Kilépőkódok: 0 = rendben; 1 = találat (rossz YAML vagy séma-sértés); 2 = használati/
# környezeti hiba (ismeretlen argumentum, hiányzó fájl).
#
# Interpreter-próba sorrend: python3 -> python -> py -> ruby. Mindegyiket TÉNYLEGES
# próba-parse-szal validáljuk (nem csak `command -v`-vel): a Windows-os `python3`/`python`
# a WindowsApps-stub lehet, ami `command -v`-re igaz, de exec-re "permission denied".
# Ha EGYIK interpreter sincs: skip-warn (figyelmeztetés stderr-re, exit 0) + best-effort
# regex-fallback, ami a COCALC-232 mintát (idézőjelezetlen `- ...: ...` a script blokkban)
# szintén elbuktatja.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SELF="$SCRIPT_DIR/$(basename "$0")"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

CHECK_PY="$WORKDIR/check.py"
CHECK_RB="$WORKDIR/check.rb"
FALLBACK_AWK="$WORKDIR/fallback.awk"

usage() {
    cat <<EOF
verify-gitlab-ci-syntax.sh — offline .gitlab-ci.yml well-formedness + GitLab-CI séma-lint

  sh ci/verify-gitlab-ci-syntax.sh [--file <path>]
  sh ci/verify-gitlab-ci-syntax.sh --self-test

  --file <path>   a megadott fájlt ellenőrzi (alap: <repo>/.gitlab-ci.yml)
  --self-test     beágyazott önteszt futtatása mktemp fixture-ökön
  -h, --help      ez a súgó

Kilépőkód: 0 rendben; 1 találat; 2 használati/környezeti hiba.
EOF
}

# --------------------------------------------------------------------------------------
# Beágyazott ellenőrző segéd-szkriptek kiírása (a temp-könyvtárba).
# --------------------------------------------------------------------------------------
write_helpers() {
    cat > "$CHECK_PY" <<'PYEOF'
import sys

try:
    import yaml
except ImportError:
    sys.stderr.write("verify-gitlab-ci-syntax: a kivalasztott interpreterben nincs PyYAML\n")
    sys.exit(2)


class _GitlabRef(object):
    """GitLab `!reference [...]` tag helyorzo -- nem string, nem mapping."""
    pass


def _ref_multi(loader, tag_suffix, node):
    # AC6: a GitLab-specifikus `!` prefixu tag (gyakorlatban `!reference`) ne okozzon
    # hamis hibat; a visszaadott objektum a script-elem ellenorzes szempontjabol
    # elfogadott (nem string, nem mapping).
    return _GitlabRef()


yaml.add_multi_constructor('!', _ref_multi, Loader=yaml.SafeLoader)

path = sys.argv[1]

try:
    with open(path, 'rb') as fh:
        raw = fh.read()
    data = yaml.safe_load(raw)
except yaml.YAMLError as exc:
    sys.stderr.write("verify-gitlab-ci-syntax: YAML syntaxishiba (%s):\n%s\n" % (path, exc))
    sys.exit(1)
except OSError as exc:
    sys.stderr.write("verify-gitlab-ci-syntax: nem olvashato a fajl: %s (%s)\n" % (path, exc))
    sys.exit(2)

if data is None:
    sys.stderr.write("verify-gitlab-ci-syntax: ures vagy tartalom nelkuli YAML: %s\n" % path)
    sys.exit(1)

if not isinstance(data, dict):
    sys.stderr.write(
        "verify-gitlab-ci-syntax: a top-level YAML nem mapping (job-definiciok varva): %s\n"
        % path)
    sys.exit(1)

SCRIPT_KEYS = ("script", "before_script", "after_script")
problems = []


def _leaf_problem(job, key, path, elem):
    # path pl. '[0]' vagy '[0][1]'. Aleset-tudatos uzenet:
    #   dict-level  -> a COCALC-232 hibaosztaly (idezojelezetlen '- kulcs: ertek');
    #   egyeb nem-string level (szam / None / melyebb lista) -> semleges uzenet.
    if isinstance(elem, dict):
        problems.append(
            "%s -> %s -> %s: az elem tipusa 'dict', nem string. Ez a COCALC-232 "
            "hibaosztaly: egy idezojelezetlen '- kulcs: ertek' script-sor a ': ' miatt "
            "YAML-mappingkent parse-olodik. Tedd az egesz parancsot idezojelbe vagy "
            "blokk-skalarba." % (job, key, path))
    else:
        problems.append(
            "%s -> %s -> %s: nem-string elem a script-listaban (tipus: '%s')."
            % (job, key, path, type(elem).__name__))


def _check(job, key, value):
    if isinstance(value, str) or isinstance(value, _GitlabRef):
        return
    if isinstance(value, list):
        for idx, elem in enumerate(value):
            if isinstance(elem, str) or isinstance(elem, _GitlabRef):
                continue
            if isinstance(elem, list):
                # A GitLab egy szintet lapit -- egy beagyazott lista OK, ha MINDEN
                # levele string (vagy !reference). Melyebb / nem-string level -> hiba.
                for jdx, leaf in enumerate(elem):
                    if isinstance(leaf, str) or isinstance(leaf, _GitlabRef):
                        continue
                    _leaf_problem(job, key, "[%d][%d]" % (idx, jdx), leaf)
                continue
            _leaf_problem(job, key, "[%d]" % idx, elem)
        return
    problems.append(
        "%s -> %s: az ertek tipusa '%s', string vagy stringek listaja varva."
        % (job, key, type(value).__name__))


for job, jobdef in data.items():
    # AC3: minden top-level job-definicio ES a `default:` blokk (mindketto dict).
    if not isinstance(jobdef, dict):
        continue
    for key in SCRIPT_KEYS:
        if key in jobdef:
            _check(str(job), key, jobdef[key])

if problems:
    sys.stderr.write("verify-gitlab-ci-syntax: GitLab-CI sema-hiba (%s):\n" % path)
    for item in problems:
        sys.stderr.write("  - %s\n" % item)
    sys.exit(1)

sys.exit(0)
PYEOF

    cat > "$CHECK_RB" <<'RBEOF'
require 'yaml'

path = ARGV[0]
content = File.read(path, mode: 'rb')

begin
  begin
    data = YAML.safe_load(content, aliases: true)
  rescue ArgumentError
    data = YAML.safe_load(content, [], [], true)
  end
rescue => exc
  # A jovahagyott terv szerint: Ruby + `!reference` -> skip-warn (a Psych nem tudja
  # feloldani a GitLab-specifikus taget). Elesben ugyis a python3+PyYAML ag fut.
  if content =~ /!reference/
    STDERR.puts "verify-gitlab-ci-syntax: FIGYELMEZTETES -- a Ruby YAML-parser nem tudja " \
                "feloldani a GitLab !reference taget; ezt a fajlt kihagyom -- a sema-check " \
                "IS kimarad rajta (skip-warn)."
    exit 0
  end
  STDERR.puts "verify-gitlab-ci-syntax: YAML syntaxishiba (#{path}):\n#{exc.message}"
  exit 1
end

if data.nil?
  STDERR.puts "verify-gitlab-ci-syntax: ures vagy tartalom nelkuli YAML: #{path}"
  exit 1
end
unless data.is_a?(Hash)
  STDERR.puts "verify-gitlab-ci-syntax: a top-level YAML nem mapping: #{path}"
  exit 1
end

script_keys = %w[script before_script after_script]
problems = []

leaf_problem = lambda do |job, key, path, elem|
  if elem.is_a?(Hash)
    problems << "#{job} -> #{key} -> #{path}: az elem tipusa 'Hash', nem string " \
                "(COCALC-232 hibaosztaly: idezojelezetlen '- kulcs: ertek')."
  else
    problems << "#{job} -> #{key} -> #{path}: nem-string elem a script-listaban " \
                "(tipus: '#{elem.class}')."
  end
end

checker = lambda do |job, key, value|
  return if value.is_a?(String)
  if value.is_a?(Array)
    value.each_with_index do |elem, idx|
      next if elem.is_a?(String)
      if elem.is_a?(Array)
        # A GitLab egy szintet lapit -- egy beagyazott lista OK, ha minden levele string.
        elem.each_with_index do |leaf, jdx|
          next if leaf.is_a?(String)
          leaf_problem.call(job, key, "[#{idx}][#{jdx}]", leaf)
        end
        next
      end
      leaf_problem.call(job, key, "[#{idx}]", elem)
    end
    return
  end
  problems << "#{job} -> #{key}: az ertek tipusa '#{value.class}', string vagy lista varva."
end

data.each do |job, jobdef|
  next unless jobdef.is_a?(Hash)
  script_keys.each do |key|
    checker.call(job.to_s, key, jobdef[key]) if jobdef.key?(key)
  end
end

unless problems.empty?
  STDERR.puts "verify-gitlab-ci-syntax: GitLab-CI sema-hiba (#{path}):"
  problems.each { |p| STDERR.puts "  - #{p}" }
  exit 1
end
exit 0
RBEOF

    cat > "$FALLBACK_AWK" <<'AWKEOF'
# Best-effort regex-fallback: interpreter nélkül. A script: / before_script: /
# after_script: blokkokban keres olyan `- ...` list-item sort, ami NINCS végig
# idézőjelezve (és nem blokk-skalár), DE tartalmaz `: ` (kettőspont+szóköz) vagy
# sorvégi `:` jelet -- ez billenti a YAML-t mappinggé (a vezető idézőjelezetlen szó
# lesz a kulcs). A COCALC-232 mintát (`- echo "Feltoltve: ${VAR}"`) ez is elbuktatja.
#
# Ismert korlát: az item quote-olt részét NEM strippeljük, így egy nem végig idézőjelezett
# elem, amiben CSAK egy idézőjelen belüli `: ` van (pl. `- echo "a: b"`), szintén lelet.
# Ez tudatos: az ilyen sor a YAML-nak ténylegesen mapping (a vezető `echo "a` a kulcs),
# tehát GitLab-ban is hibás -- nem valódi false-positive. A beágyazott-stringlista
# (AC3) esetet a fallback nem kezeli (heurisztika marad), azt csak az interpreter-ág fedi.
BEGIN { inblock = 0; blockindent = -1; found = 0 }
{
    line = $0
    sub(/\r$/, "", line)

    lead = line
    sub(/[^ \t].*$/, "", lead)
    indent = length(lead)

    t = line
    sub(/^[ \t]+/, "", t)
    sub(/[ \t]+$/, "", t)

    if (t ~ /^(script|before_script|after_script):$/) {
        inblock = 1
        blockindent = indent
        next
    }

    if (inblock && t != "" && indent <= blockindent) {
        inblock = 0
    }

    if (inblock && substr(t, 1, 2) == "- ") {
        item = substr(t, 3)
        sub(/^[ \t]+/, "", item)

        if (item ~ /^"[^"]*"$/)  next
        if (item ~ /^'[^']*'$/)  next
        if (item ~ /^[|>]/)      next

        if (item ~ /: / || item ~ /:$/) {
            printf "  %s:%d: %s\n", FILENAME, FNR, line > "/dev/stderr"
            found = 1
        }
    }
}
END { exit found }
AWKEOF
}

# --------------------------------------------------------------------------------------
# Interpreter-felderítés: kiírja "python:<bin>" vagy "ruby:ruby", return 1 ha nincs.
# --------------------------------------------------------------------------------------
detect_interpreter() {
    for cand in python3 python py; do
        command -v "$cand" >/dev/null 2>&1 || continue
        if printf 'probe: 1\n' | "$cand" -c 'import sys, yaml; yaml.safe_load(sys.stdin.read())' \
                >/dev/null 2>&1; then
            printf '%s\n' "python:$cand"
            return 0
        fi
    done
    if command -v ruby >/dev/null 2>&1; then
        if printf 'probe: 1\n' | ruby -ryaml -e 'YAML.safe_load(STDIN.read)' >/dev/null 2>&1; then
            printf '%s\n' "ruby:ruby"
            return 0
        fi
    fi
    return 1
}

# --------------------------------------------------------------------------------------
# Egy fájl ellenőrzése. 0 = rendben, 1 = találat, 2 = hiányzó fájl.
# --------------------------------------------------------------------------------------
run_lint() {
    target="$1"

    if [ ! -f "$target" ]; then
        echo "verify-gitlab-ci-syntax: nincs ilyen fájl: $target" >&2
        return 2
    fi

    if [ "${VERIFY_GITLAB_CI_FORCE_FALLBACK:-0}" = "1" ]; then
        interp=""
    else
        interp="$(detect_interpreter || true)"
    fi

    if [ -n "$interp" ]; then
        kind="${interp%%:*}"
        bin="${interp#*:}"
        rc=0
        if [ "$kind" = "python" ]; then
            "$bin" "$CHECK_PY" "$target" || rc=$?
        else
            "$bin" "$CHECK_RB" "$target" || rc=$?
        fi
        if [ "$rc" -eq 0 ]; then
            echo "verify-gitlab-ci-syntax: OK — $target ($kind: $bin)"
        fi
        return "$rc"
    fi

    # Nincs használható interpreter -> skip-warn + best-effort regex-fallback.
    echo "verify-gitlab-ci-syntax: FIGYELMEZTETÉS — nincs elérhető YAML-interpreter" >&2
    echo "  (python3 / python / py / ruby egyike sem futtatható PyYAML-lal); best-effort" >&2
    echo "  regex-ellenőrzésre váltok (exit 0, ha nem talál gyanús sort)." >&2
    if awk -f "$FALLBACK_AWK" "$target"; then
        echo "verify-gitlab-ci-syntax: OK — $target (regex-fallback, interpreter nélkül)"
        return 0
    fi
    echo "verify-gitlab-ci-syntax: a regex-fallback idézőjelezetlen '- ...: ...' script-elemet" >&2
    echo "  talált (lásd fent) — ez a COCALC-232 hibaosztály. Idézőjelezd az egész parancsot." >&2
    return 1
}

# --------------------------------------------------------------------------------------
# Beágyazott önteszt (AC7): mktemp fixture-ök, valós CI-hívás nélkül.
# --------------------------------------------------------------------------------------
fail() {
    echo "ÖNTESZT HIBA: $1" >&2
    exit 1
}

mkfix() {
    # $1 = fixture fájlnév a $WORKDIR alatt; a tartalmat stdin-ről olvassa.
    cat > "$WORKDIR/$1"
}

_run_self() {
    # $1 = "std" vagy "fb" (forced fallback), a többi arg a SELF-nek megy.
    mode="$1"
    shift
    set +e
    if [ "$mode" = "fb" ]; then
        VERIFY_GITLAB_CI_FORCE_FALLBACK=1 sh "$SELF" "$@" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    else
        sh "$SELF" "$@" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    fi
    RC=$?
    set -e
}

expect() {
    # $1 = tag, $2 = "zero"|"nonzero", $3 = fixture név, $4 = "std"|"fb"
    _run_self "$4" --file "$WORKDIR/$3"
    case "$2" in
        zero)
            [ "$RC" -eq 0 ] || fail "[$1] '$3' -> exit 0 várt, kapott $RC. stderr: $(cat "$WORKDIR/.err")"
            ;;
        nonzero)
            [ "$RC" -ne 0 ] || fail "[$1] '$3' -> nem-nulla exit várt, kapott 0. stdout: $(cat "$WORKDIR/.out")"
            ;;
    esac
    echo "  [$1] OK ($3 -> $RC)"
}

run_self_test() {
    echo "== verify-gitlab-ci-syntax önteszt =="

    mkfix valid.yml <<'YAML'
stages:
  - build
  - test

build-job:
  stage: build
  script:
    - echo "build"
    - make all

test-job:
  stage: test
  before_script:
    - echo "setup"
  script:
    - run-tests
  after_script:
    - echo "cleanup"
YAML

    mkfix broken-yaml.yml <<'YAML'
build-job:
  script:
    - "echo lezaratlan idezojel
YAML

    mkfix script-mapping.yml <<'YAML'
deploy-job:
  stage: deploy
  script:
    - echo "start"
    - deploy: production
YAML

    mkfix before-script-mapping.yml <<'YAML'
lint-job:
  before_script:
    - setup: true
  script:
    - echo "run"
YAML

    mkfix after-script-mapping.yml <<'YAML'
lint-job:
  script:
    - echo "run"
  after_script:
    - teardown: always
YAML

    mkfix reference.yml <<'YAML'
.shared:
  script:
    - echo "shared step"

real-job:
  stage: build
  before_script:
    - !reference [.shared, script]
  script:
    - !reference [.shared, script]
    - echo "own step"
YAML

    mkfix cocalc232-bad.yml <<'YAML'
dev-workflow-publish:
  stage: deploy
  script:
    - do-the-upload
    - echo "Feltoltve: ${PACKAGE_REGISTRY_URL}"
YAML

    mkfix cocalc232-fixed-quoted.yml <<'YAML'
dev-workflow-publish:
  stage: deploy
  script:
    - do-the-upload
    - 'echo "Feltoltve: ${PACKAGE_REGISTRY_URL}"'
YAML

    mkfix cocalc232-fixed-block.yml <<'YAML'
dev-workflow-publish:
  stage: deploy
  script:
    - do-the-upload
    - >-
      echo "Feltoltve: ${PACKAGE_REGISTRY_URL}"
YAML

    # AC3 (javítókör): egy szint mélyen beágyazott stringlista OK (a GitLab lapítja).
    mkfix nested-string-list.yml <<'YAML'
build-job:
  stage: build
  script:
    - ["git", "config", "advice.detachedHead", "false"]
    - make all
YAML

    # AC3 (javítókör): dedikált top-level `default:` blokk, aminek egy before_script-eleme
    # mapping -> a checker `default -> before_script -> [0]`-ra buktasson.
    mkfix default-mapping.yml <<'YAML'
default:
  before_script:
    - setup: true

some-job:
  script:
    - echo ok
YAML

    # Egyszer hívjuk meg, cache-eljük (a nitpick szerint).
    SELF_TEST_INTERP="$(detect_interpreter || true)"
    if [ -n "$SELF_TEST_INTERP" ]; then
        HAVE_INTERP=1
        echo "  interpreter elérhető: igen ($SELF_TEST_INTERP)"
    else
        HAVE_INTERP=0
        echo "  interpreter elérhető: NEM — csak a regex-fallback ág asszertjei futnak"
    fi

    # --- interpreter-ág (AC2 / AC3 / AC6) ---
    if [ "$HAVE_INTERP" -eq 1 ]; then
        expect 1  zero    valid.yml                  std
        expect 2  nonzero broken-yaml.yml            std
        expect 3  nonzero script-mapping.yml         std
        expect 4a nonzero before-script-mapping.yml  std
        expect 4b nonzero after-script-mapping.yml   std
        expect 5  zero    reference.yml              std
        expect 6  nonzero cocalc232-bad.yml          std
        expect 7a zero    cocalc232-fixed-quoted.yml std
        expect 7b zero    cocalc232-fixed-block.yml  std
        expect 8  zero    nested-string-list.yml     std
        expect 9  nonzero default-mapping.yml        std
        grep -q 'default -> before_script -> \[0\]' "$WORKDIR/.err" \
            || fail "[9] a default: fixture hibaüzenete nem a 'default -> before_script -> [0]' útvonalat nevezi meg. stderr: $(cat "$WORKDIR/.err")"
        echo "  [9m] OK (default: útvonal-megnevezés)"
    else
        echo "  [2],[4a],[4b],[5],[8] SKIP — törött-YAML / !reference / beágyazott-lista fixture interpretert igényel"
    fi

    # --- regex-fallback ág (AC5) — mindig fut, kikényszerített interpreter-kihagyással ---
    echo "  --- regex-fallback ág (VERIFY_GITLAB_CI_FORCE_FALLBACK=1) ---"
    expect F1 zero    valid.yml                  fb
    expect F2 nonzero cocalc232-bad.yml          fb
    expect F3a zero   cocalc232-fixed-quoted.yml fb
    expect F3b zero   cocalc232-fixed-block.yml  fb
    expect F4 nonzero script-mapping.yml         fb
    expect F5 nonzero default-mapping.yml        fb

    # --- valós fájl (AC8) ---
    echo "  --- valós .gitlab-ci.yml (AC8) ---"
    _run_self std --file "$REPO_ROOT/.gitlab-ci.yml"
    [ "$RC" -eq 0 ] || fail "[R] a valós .gitlab-ci.yml nem exit 0 ($RC). stderr: $(cat "$WORKDIR/.err")"
    echo "  [R] OK (valós .gitlab-ci.yml -> 0)"

    echo "verify-gitlab-ci-syntax: minden önteszt zöld."
}

# --------------------------------------------------------------------------------------
# Argumentum-feldolgozás.
# --------------------------------------------------------------------------------------
TARGET="$REPO_ROOT/.gitlab-ci.yml"
MODE="lint"

while [ $# -gt 0 ]; do
    case "$1" in
        --file)
            [ $# -ge 2 ] || { echo "verify-gitlab-ci-syntax: a --file után útvonal kell" >&2; exit 2; }
            TARGET="$2"
            shift 2
            ;;
        --file=*)
            TARGET="${1#--file=}"
            shift
            ;;
        --self-test)
            MODE="self-test"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "verify-gitlab-ci-syntax: ismeretlen argumentum: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

write_helpers

if [ "$MODE" = "self-test" ]; then
    run_self_test
    exit 0
fi

if run_lint "$TARGET"; then
    exit 0
else
    exit $?
fi
