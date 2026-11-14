#!/usr/bin/env sh
# COCALC-260: tracker-absztrakciós őr — biztosítja, hogy a dev-workflow skill-/subagent-
# fájlok NE nevezzenek meg közvetlenül Jira/Atlassian MCP-eszközt, hanem a
# `dev-workflow-execute/tracker-adapter.md` absztrakt művelet-neveit használják
# ("ticket beolvasása", "ticket létrehozása", "státuszváltás", "komment írása",
# "link létrehozása", "keresés", "terv mentése/beolvasása", "komplexitás mentése/
# beolvasása"). Így ha valaha más ticket-tracker váltja fel a Jirát, csak az adapter
# egyetlen fájlja változik, a ~12 hívó skill nem.
#
# Miért allowlist-alapú (és nem sor-szintű "próza vs. hívás" elemzés): a
# `ci/verify-skill-portability.sh` filozófiáját követi — egy konvertált skill-fájl
# EGYÁLTALÁN nem nevezhet meg Jira MCP-eszközt (csak művelet-nevet), így egy
# nem-allowlistolt fájlban minden előfordulás per definitionem regresszió. A
# "magyarázó szövegben is említ eszköznevet" edge case-t (config.md / history.md /
# README.md / jira-automation-setup.md) az ÁLLANDÓ allowlist fedi. Nem-.md skill-asset
# (pl. maga a `setup-mcp-allowlist.sh` allowlist-generátor szkript) **tudatosan** kívül
# esik a szkennelésen — a `verify-skill-portability.sh` ugyanezt a megközelítést követi.
#
# Fokozatos élesíthetőség: a MIGRÁCIÓS allowlist (ci/tracker-mcp-migration-allowlist.txt)
# a még át nem állított skill-fájlokat sorolja fel — részlegesen átállt állapotban a
# szkript zöld marad, és ahogy egy-egy fájl átáll, kikerül a listából. A COCALC-260
# zárásakor ez a lista a `.claude/` fára nézve ÜRES.
#
# Használat (a repo gyökeréből):
#     sh ci/verify-tracker-mcp-abstraction.sh                  # a repo szkennelése
#     sh ci/verify-tracker-mcp-abstraction.sh --self-test      # beágyazott önteszt
#     sh ci/verify-tracker-mcp-abstraction.sh --root <dir> [--migration-allow-file <f>]
#
# Kilépőkódok: 0 = rendben; 1 = találat (közvetlen MCP-eszköznév a tracker-adapteren
# kívül); 2 = használati/környezeti hiba.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SELF="$SCRIPT_DIR/$(basename "$0")"

# Bejárt alkönyvtárak a szkennelt gyökér alatt.
# ⚠️ COCALC-323 (Codex-paritás, blocked by COCALC-260): a `.agents/skills` szkennelését
# az a követő ticket élesíti — addig szándékosan kimarad, mert a `.agents/` fában még
# nincs `tracker-adapter.md`. Bekapcsoláshoz elég ehhez a sorhoz hozzáfűzni:
# `.agents/skills` (a migrációs-allowlist mechanizmus és minden más már készen áll rá).
SCAN_SUBDIRS=".claude/skills .claude/agents"

# Állandó allowlist (fájl-suffix): itt SZÁNDÉKOS az eszköznév-említés — a leképezési
# adapter maga, illetve magyarázó / provenienciás doksik (a `verify-skill-portability.sh`
# EXCEPTION_SUFFIXES mintájára). Ezek sosem kerülnek ki a listáról.
PERMANENT_ALLOW_SUFFIXES="dev-workflow-execute/tracker-adapter.md dev-workflow/config-reference.md dev-workflow/history.md dev-workflow/jira-automation-setup.md dev-workflow/README.md dev-workflow/config.md dev-workflow/config.template.md"

# Jira/Atlassian MCP-eszköznevek: csupasz camelCase tokenek + a gépfüggő
# `mcp__<hex>__…Jira…` / `mcp__atlassian…` alak. A `mcp__ccd_session__mark_chapter`
# (fázisjelölő) és a `mcp__Claude_Browser__*` / Figma-connector NEM illeszkedik.
TOKEN_RE='getJiraIssue|createJiraIssue|editJiraIssue|transitionJiraIssue|addCommentToJiraIssue|searchJiraIssuesUsingJql|getTransitionsForJiraIssue|createJiraIssueLink|getJiraIssueRemoteIssueLinks|getJiraProjectIssueTypesMetadata|getVisibleJiraProjects|getAccessibleAtlassianResources|lookupJiraAccountId|atlassianUserInfo|mcp__[0-9A-Za-z_-]+__[A-Za-z]*[Jj]ira[A-Za-z]*|mcp__atlassian[0-9A-Za-z_]*'

usage() {
    # A fejléc-komment törzse: a 2. sortól (shebang után) az első nem-`#` sorig,
    # azt a sort MÁR nem beleértve. A `# ` prefixet levágja.
    sed -n '2,${/^#/!q; s/^# \{0,1\}//p;}' "$SELF"
}

# ------------------------------------------------------------------------------------
# Fő szkennelés. $1 = szkennelt gyökér, $2 = migrációs-allowlist fájl (lehet üres/hiányzó).
# ------------------------------------------------------------------------------------
run_scan() {
    scan_root="$1"
    migration_allow_file="$2"

    if [ ! -d "$scan_root" ]; then
        echo "verify-tracker-mcp-abstraction: nincs ilyen könyvtár: $scan_root" >&2
        return 2
    fi

    allow_suffixes="$PERMANENT_ALLOW_SUFFIXES"
    migration_suffixes=""
    if [ -n "$migration_allow_file" ] && [ -f "$migration_allow_file" ]; then
        while IFS= read -r raw || [ -n "$raw" ]; do
            entry="${raw%%#*}"
            entry="$(printf '%s' "$entry" | tr -d ' \t\r')"
            [ -n "$entry" ] || continue
            allow_suffixes="$allow_suffixes $entry"
            migration_suffixes="$migration_suffixes $entry"
        done < "$migration_allow_file"
    fi

    fail=0
    all_matches=""

    for sub in $SCAN_SUBDIRS; do
        [ -d "$scan_root/$sub" ] || continue
        m=$(cd "$scan_root" && grep -rnE "$TOKEN_RE" --include='*.md' "$sub" 2>/dev/null || true)
        [ -n "$m" ] || continue
        all_matches="$all_matches
$m"
    done

    filtered=$(printf '%s\n' "$all_matches" | while IFS= read -r line; do
        [ -n "$line" ] || continue
        file=${line%%:*}
        keep=1
        for suffix in $allow_suffixes; do
            case "$file" in
                *"$suffix") keep=0 ;;
            esac
        done
        [ "$keep" -eq 1 ] && printf '%s\n' "$line"
    done || true)

    if [ -n "$filtered" ]; then
        echo "HIBA: közvetlen Jira/Atlassian MCP-eszköznév a tracker-adapteren kívül —" >&2
        echo "      használd a tracker-adapter.md absztrakt művelet-nevét helyette:" >&2
        printf '%s\n' "$filtered" | sed 's/^/  /' >&2
        fail=1
    fi

    # Nem-fatális: elavult migrációs-allowlist bejegyzés (a fájl már nem nevez meg
    # eszközt) — jelezd, hogy kivehető, de ne bukjon el rajta a pipeline. A fájlnév-mező
    # alapján vizsgálódik (cut -d: -f1), nem az egész match-soron, hogy false-negativet ne adjon,
    # ha a suffix-string a match tartalmában fordul elő de nem a fájlnév-mezőben.
    for suffix in $migration_suffixes; do
        hit=$(printf '%s\n' "$all_matches" | cut -d: -f1 | grep -F "$suffix" || true)
        if [ -z "$hit" ]; then
            echo "FIGYELMEZTETÉS: elavult migrációs-allowlist bejegyzés (már nincs benne" >&2
            echo "               közvetlen eszköznév, kivehető a listából): $suffix" >&2
        fi
    done

    if [ "$fail" -ne 0 ]; then
        return 1
    fi
    echo "verify-tracker-mcp-abstraction: OK — nincs közvetlen Jira/Atlassian MCP-eszköznév"
    echo "  a szkennelt fákban ($SCAN_SUBDIRS), a tracker-adapteren és az allowlistokon kívül."
    return 0
}

# ------------------------------------------------------------------------------------
# Beágyazott önteszt: mktemp fixture-fák, valós repo-írás nélkül.
# ------------------------------------------------------------------------------------
selftest_fail() {
    echo "ÖNTESZT HIBA: $1" >&2
    exit 1
}

run_self_test() {
    echo "== verify-tracker-mcp-abstraction önteszt =="
    WORKDIR="$(mktemp -d)"
    trap 'rm -rf "$WORKDIR"' EXIT

    # --- Fixture-fa: alap (tiszta) ---
    A="$WORKDIR/a"
    mkdir -p "$A/.claude/skills/dev-workflow-execute" "$A/.claude/skills/dev-workflow" "$A/.claude/agents" "$A/.agents/skills/dev-workflow-execute"
    cat > "$A/.claude/skills/dev-workflow-execute/tracker-adapter.md" <<'EOF'
# tracker-adapter
Művelet: "ticket beolvasása" — Jelenlegi Jira-leképezés: `getJiraIssue`.
Művelet: "komment írása" — `addCommentToJiraIssue`.
EOF
    cat > "$A/.claude/skills/dev-workflow/history.md" <<'EOF'
> Régen a skillek közvetlenül hívtak `transitionJiraIssue`-t; ma a "státuszváltás"
> absztrakt művelet megy helyette. Ez próza, az őr nem bukhat rá.
EOF
    cat > "$A/.claude/skills/dev-workflow-execute/SKILL.md" <<'EOF'
- Hívd meg a tracker-adapter "ticket beolvasása" műveletét.
- Fázisjelölő: `mcp__ccd_session__mark_chapter` — ez NEM Jira-eszköz.
EOF

    # --- 1. tiszta fa -> exit 0 ---
    set +e
    sh "$SELF" --root "$A" --migration-allow-file "$WORKDIR/none.txt" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    rc=$?
    set -e
    [ "$rc" -eq 0 ] || selftest_fail "[1] tiszta fa -> 0 várt, kapott $rc. stderr: $(cat "$WORKDIR/.err")"
    echo "  [1] OK — tiszta fa (adapter + próza-history + mark_chapter) -> 0"

    # --- 2. nem-allowlistolt fájl közvetlen hívással -> exit 1 ---
    cat > "$A/.claude/skills/dev-workflow-execute/design-branch.md" <<'EOF'
- Állítsd a ticketet review-ra: hívj `transitionJiraIssue`-t.
EOF
    set +e
    sh "$SELF" --root "$A" --migration-allow-file "$WORKDIR/none.txt" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    rc=$?
    set -e
    [ "$rc" -eq 1 ] || selftest_fail "[2] közvetlen hívás -> 1 várt, kapott $rc. stdout: $(cat "$WORKDIR/.out")"
    grep -q 'design-branch.md' "$WORKDIR/.err" || selftest_fail "[2] a hibaüzenet nem nevezi meg a design-branch.md-t"
    echo "  [2] OK — nem-allowlistolt \`transitionJiraIssue\` -> 1"

    # --- 3. ugyanaz a fájl a migrációs allowlisten -> exit 0 ---
    printf '%s\n' "# átállítás folyamatban" "dev-workflow-execute/design-branch.md" > "$WORKDIR/migration.txt"
    set +e
    sh "$SELF" --root "$A" --migration-allow-file "$WORKDIR/migration.txt" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    rc=$?
    set -e
    [ "$rc" -eq 0 ] || selftest_fail "[3] migrációs-allowlistolt fájl -> 0 várt, kapott $rc. stderr: $(cat "$WORKDIR/.err")"
    echo "  [3] OK — migrációs-allowlist elnyeli ugyanazt a fájlt -> 0"

    # --- 4. állandó-allowlistolt doksi blokkidézetben eszköznévvel -> exit 0 ---
    rm -f "$A/.claude/skills/dev-workflow-execute/design-branch.md"
    cat > "$A/.claude/skills/dev-workflow/README.md" <<'EOF'
A `jira-automation-setup.md` leírja, mikor váltható ki több `transitionJiraIssue`
MCP-hívás — ez magyarázó szöveg, nem hívási utasítás.
EOF
    set +e
    sh "$SELF" --root "$A" --migration-allow-file "$WORKDIR/none.txt" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    rc=$?
    set -e
    [ "$rc" -eq 0 ] || selftest_fail "[4] állandó-allowlistolt README -> 0 várt, kapott $rc. stderr: $(cat "$WORKDIR/.err")"
    echo "  [4] OK — állandó-allowlistolt doksi próza-említéssel -> 0"

    # --- 5. gépfüggő hex-prefixes alak nem-allowlistolt fájlban -> exit 1 ---
    cat > "$A/.claude/agents/code-reviewer.md" <<'EOF'
<!-- pl. mcp__deadbeef1234__getJiraIssue — ezt a hex-prefixes alakot is fogja az őr -->
EOF
    set +e
    sh "$SELF" --root "$A" --migration-allow-file "$WORKDIR/none.txt" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    rc=$?
    set -e
    [ "$rc" -eq 1 ] || selftest_fail "[5] hex-prefixes alak -> 1 várt, kapott $rc. stdout: $(cat "$WORKDIR/.out")"
    echo "  [5] OK — \`mcp__<hex>__getJiraIssue\` alak -> 1"
    rm -f "$A/.claude/agents/code-reviewer.md"

    # --- 6. .agents/skills token JELENLEG nem szkennelt (COCALC-323 élesíti) -> exit 0 ---
    cat > "$A/.agents/skills/dev-workflow-execute/design-branch.md" <<'EOF'
- Hívj `transitionJiraIssue`-t (a Codex-port még nincs átállítva — COCALC-323).
EOF
    set +e
    sh "$SELF" --root "$A" --migration-allow-file "$WORKDIR/none.txt" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    rc=$?
    set -e
    [ "$rc" -eq 0 ] || selftest_fail "[6] .agents/skills nem szkennelt -> 0 várt, kapott $rc. stderr: $(cat "$WORKDIR/.err")"
    echo "  [6] OK — .agents/skills fa jelenleg kimarad a szkennelésből -> 0"

    # --- 7. valós repo: a szállított állapot zöld ---
    set +e
    sh "$SELF" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    rc=$?
    set -e
    [ "$rc" -eq 0 ] || selftest_fail "[7] a valós repo szkennelése nem 0 ($rc). stderr: $(cat "$WORKDIR/.err")"
    echo "  [7] OK — a valós repo ($SCAN_SUBDIRS) -> 0"

    # --- 8. elavult-bejegyzés suffix csak a tartalmában (nem fájlnév-mezőben) -> figyelmeztetés, exit 0 ---
    # Az "other.md" fájlt (az [3]-as test-ből) szöveg-csak verzióra módosítjuk (nincs MCP-hivatkozás).
    # A migrációs-lista "dev-workflow-execute/weird-suffix.md" suffixet tartalmaz, amely egyáltalán
    # nem fordul elő a fixture-ban (sem fájlnév-mezőben, sem tartalom-mezőben).
    # Az all_matches üres az adott suffix-hez, így az elavult-check helyesen jelzi az elavultságot,
    # és exit-kód 0 marad (advisory Warning, nem fatal Error).
    rm -f "$A/.claude/skills/dev-workflow-execute/other.md"
    cat > "$A/.claude/skills/dev-workflow-execute/other.md" <<'EOF'
- Ez a fájl csak szöveget tartalmaz, nincs MCP-hivatkozás.
EOF
    printf '%s\n' "# átállítás folyamatban" "dev-workflow-execute/weird-suffix.md" > "$WORKDIR/migration_v8.txt"
    set +e
    sh "$SELF" --root "$A" --migration-allow-file "$WORKDIR/migration_v8.txt" >"$WORKDIR/.out" 2>"$WORKDIR/.err"
    rc=$?
    set -e
    [ "$rc" -eq 0 ] || selftest_fail "[8] suffix csak tartalmában -> 0 várt, kapott $rc. stderr: $(cat "$WORKDIR/.err")"
    grep -q "weird-suffix.md" "$WORKDIR/.err" || selftest_fail "[8] a figyelmeztetés nem tartalmazta a 'weird-suffix.md' stringet. stderr: $(cat "$WORKDIR/.err")"
    echo "  [8] OK — suffix csak tartalmában -> figyelmeztetés, exit 0"

    echo "verify-tracker-mcp-abstraction: minden önteszt zöld."
}

MODE="scan"
SCAN_ROOT="$DEFAULT_ROOT"
MIGRATION_ALLOW_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --self-test) MODE="self-test"; shift ;;
        --root) [ $# -ge 2 ] || { echo "a --root után könyvtár kell" >&2; exit 2; }; SCAN_ROOT="$2"; shift 2 ;;
        --root=*) SCAN_ROOT="${1#--root=}"; shift ;;
        --migration-allow-file) [ $# -ge 2 ] || { echo "a --migration-allow-file után útvonal kell" >&2; exit 2; }; MIGRATION_ALLOW_FILE="$2"; shift 2 ;;
        --migration-allow-file=*) MIGRATION_ALLOW_FILE="${1#--migration-allow-file=}"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "verify-tracker-mcp-abstraction: ismeretlen argumentum: $1" >&2; exit 2 ;;
    esac
done

if [ "$MODE" = "self-test" ]; then
    run_self_test
    exit 0
fi

[ -n "$MIGRATION_ALLOW_FILE" ] || MIGRATION_ALLOW_FILE="$SCAN_ROOT/ci/tracker-mcp-migration-allowlist.txt"

run_scan "$SCAN_ROOT" "$MIGRATION_ALLOW_FILE"
