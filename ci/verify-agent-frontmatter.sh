#!/usr/bin/env sh
# ORD-379 (dev-workflow 4.28.0): az agent frontmatter konzisztencia-őre és a
# check-frontmatter.cjs offline önteszje. A .gitlab-ci.yml `agent-frontmatter-check` jobja
# futtatja (blokkoló), Node-image-en — a szkript Node-ot hív, de függőség és hálózat
# nélkül.
#
# Mit ellenőriz:
#   1. a két node-fájl megvan: ci/check-frontmatter.cjs és ci/check-frontmatter.test.cjs;
#   2. az önteszt sikeres;
#   3. a valódi fában a frontmatter ellenőrzés sikeres;
#   4. regresszió: egy régi, hibás frontmatter-formátumú fájlra hibát jelez.
#
# Használat (a repo gyökeréből): sh ci/verify-agent-frontmatter.sh
# Kilépőkód: 0 = rendben; 1 = eltérés (az üzenet megmondja, mi).
set -eu

fail() {
  echo "verify-agent-frontmatter: $1" >&2
  exit 1
}

# --- 1. Fájlok ---
for f in ci/check-frontmatter.cjs ci/check-frontmatter.test.cjs; do
  test -f "$f" || fail "hiányzó fájl: $f"
done

# --- 2. Önteszt ---
command -v node >/dev/null 2>&1 || fail "a check-frontmatter.cjs önteszthez node kell"
node ci/check-frontmatter.test.cjs || fail "önteszt sikertelen"

# --- 3. Valódi fa ---
node ci/check-frontmatter.cjs || fail "frontmatter ellenőrzés sikertelen a valódi fában"

# --- 4. Regresszió ---
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/.claude/agents"
cat > "$tmp/.claude/agents/qa-tester.md" <<'EOF'
---
name: qa-tester
description: Böngészős ellenőrzés, szöveg: másik rész
---
Test body
EOF

out=$(node ci/check-frontmatter.cjs --root "$tmp" 2>&1) && rc=0 || rc=$?
[ "$rc" -eq 1 ] || fail "regresszió: várt 1-es kilépőkód, kapott: $rc"
printf '%s' "$out" | grep -q FM_PLAIN_COLON_SPACE || fail "regresszió: hiányzik a FM_PLAIN_COLON_SPACE hibaüzenet"

echo "verify-agent-frontmatter: OK"
