#!/usr/bin/env sh
# ORD-391 (dev-workflow 4.28.1): ESM-gyökerű fogyasztó önellenőrzője. Egy fogyasztó repo
# gyökér `package.json`-ja lehet `"type": "module"` (pl. ordoviii); ilyenkor a mappa-szintű
# `package.json` nélküli CommonJS node-fájlok `require is not defined in ES module scope`
# hibával buknak. A dist-repóban nincs gyökér package.json, ezért ott ez nem látszik.
#
# Mit ellenőriz (ideiglenes mappában, `"type": "module"` gyökér package.json mellett):
#   1. a csomag fáinak (.claude/, .agents/, ci/) és a manifestnek a másolása, a config.md
#      előállítása a config.template.md-ből (mint a CI before_script);
#   2. a csomag minden node-tesztje (*.test.js, *.test.cjs) és az estimate/run-all-tests.js;
#   3. a node-ot használó verify-szkriptek.
#
# Használat (a repo gyökeréből): sh ci/verify-esm-consumer.sh
# Kilépőkód: 0 = rendben; 1 = eltérés (az üzenet megmondja, melyik fájl).
set -eu

fail() {
  echo "verify-esm-consumer: $1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "node kell"
command -v git >/dev/null 2>&1 || fail "git kell"

src=$(pwd)
test -d "$src/.claude" && test -d "$src/ci" || fail "a repo gyökeréből futtasd"

# --- 1. Előkészítés ---
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# A tesztlistát a forrás-repóból képezzük (a temp mappa nem git-repo).
list="$tmp.tests"
trap 'rm -rf "$tmp" "$list"' EXIT
git -C "$src" ls-files '.claude/*.test.js' '.claude/*.test.cjs' 'ci/*.test.js' 'ci/*.test.cjs' > "$list"

cp -R "$src/.claude" "$tmp/.claude"
cp -R "$src/ci" "$tmp/ci"
if [ -d "$src/.agents" ]; then cp -R "$src/.agents" "$tmp/.agents"; fi
printf '{"type":"module"}\n' > "$tmp/package.json"
cp "$src/dev-workflow-manifest.json" "$tmp/dev-workflow-manifest.json"

for d in .claude/skills/dev-workflow .agents/skills/dev-workflow; do
  if [ -f "$tmp/$d/config.template.md" ]; then
    cp "$tmp/$d/config.template.md" "$tmp/$d/config.md"
  fi
done

# --- 2. Node-tesztek ---
cd "$tmp"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  node "$f" >/dev/null 2>"$tmp.err" || {
    tail -n 5 "$tmp.err" >&2
    rm -f "$tmp.err"
    fail "node-teszt bukott ESM-gyökérrel: $f"
  }
done < "$list"
rm -f "$tmp.err"

runall=.claude/skills/dev-workflow/scripts/estimate/run-all-tests.js
if [ -f "$runall" ]; then
  node "$runall" >/dev/null 2>&1 || fail "node-teszt bukott ESM-gyökérrel: $runall"
fi

# --- 3. Node-os verify-szkriptek ---
for s in ci/verify-agent-frontmatter.sh ci/verify-dev-workflow-overrides.sh \
  ci/verify-run-metrics-config.sh ci/verify-estimate-config.sh ci/verify-config-split.sh; do
  sh "$s" >/dev/null 2>&1 || fail "verify-szkript bukott ESM-gyökérrel: $s"
done

echo "verify-esm-consumer: OK"
