#!/usr/bin/env sh
# Automata self-check a call-local-model.sh (COCALC-220 / LOCAL-1) végrehajtó-adapter
# szkripthez. Kizárólag --dry-run módban futtatja végig az összes ágat (nincs éles
# Ollama/LM Studio végpont — lásd a ticket "Edge case-ek" szekcióját), így valódi
# hálózati hívás nélkül ellenőrzi:
#   - sikeres dry-run választ (0. kilépőkód)
#   - validációs hiba ágat validate-and-fallback és fail-loud policy alatt (1 ill. 2)
#   - hivatkozott fájlútvonal hiányát (x-file-path-fields)
#   - kemény hiba ágat (health check bukás) validate-and-fallback és retry-then-fallback
#     alatt, utóbbinál a retry-számot is
#   - a circuit breaker nyitását
#   - a naplósor JSONL formátumát és azt, hogy nem tartalmaz prompt/válasz szöveget
#   - (COCALC-387) a nem-loopback LOCAL_MODEL_ENDPOINT explicit stderr figyelmeztetését,
#     case-insensitiven (code review javítás — a "HTTP://LOCALHOST" se adjon hamis
#     figyelmeztetést)
#   - (COCALC-387) az abszolút és a repo-gyökéren kívülre mutató (path traversal) fájlutak
#     elutasítását, mind az x-file-path-fields (létezést is megköveteli), mind az új
#     x-file-write-path-fields (létezést NEM követeli meg) kulcsnál
#   - (COCALC-387 code review javítás) symlink-escape: egy repón BELÜLI, repón KÍVÜLRE
#     mutató szimbolikus link elutasítását — mind létező fájlra (x-file-path-fields),
#     mind egy még nem létező, de repón-kívüli szülő-könyvtáron átvezető útvonalra
#     (x-file-write-path-fields). Ha a futtató környezet nem tud valódi szimbolikus
#     linket létrehozni (pl. Windows fejlesztői mód nélkül), ez az ág SKIP-warn-nal fut,
#     nem hamis buktatással — a CI Linux-konténeres futása ténylegesen lefedi.
#
# Minden teszteset a LOCAL_MODEL_LOG_FILE (és a többi felülíró env változó) elé explicit
# `env`-et tesz — NEM a "VAR=érték expect_exit ..." shell-prefix formát, mert a POSIX sh
# (dash) ezt shell-FÜGGVÉNY hívás előtt nem korlátozza a hívás idejére, hanem a teszt után
# is a shellben marad (ez okozott egy korábbi, nehezen debuggolható false-positive-ot: a
# 3. teszt fail-loud policy-je átszivárgott a 4. tesztbe). Az `env` külső parancs, ezért ez
# nála nem probléma.
#
# Használat: sh ci/verify-call-local-model.sh   (repo gyökeréből)

set -eu

# Az öröklött LOCAL_MODEL_* változók (pl. a .claude/settings.local.json env blokkjából, mint a
# LOCAL_MODEL_THINK=off) ne szivárogjanak a tesztekbe: az esetek csak a saját, explicit
# értékeikkel futnak, különben pl. a 32. ("alapértelmezett beállítások") eset elbukik.
for _v in $(env | sed -n 's/^\(LOCAL_MODEL_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$_v"; done
unset _v

SCRIPT="$(pwd)/.claude/skills/dev-workflow/scripts/call-local-model.sh"
test -f "$SCRIPT"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

VALID_SCHEMA="$WORKDIR/valid-schema.json"
cat > "$VALID_SCHEMA" <<'EOF'
{"required":["status","details"],"properties":{"status":{"type":"string"},"details":{"type":"object"}}}
EOF

INVALID_SCHEMA="$WORKDIR/invalid-schema.json"
cat > "$INVALID_SCHEMA" <<'EOF'
{"required":["nonexistent_field"]}
EOF

FILEPATH_SCHEMA="$WORKDIR/filepath-schema.json"
cat > "$FILEPATH_SCHEMA" <<'EOF'
{"required":["status"],"x-file-path-fields":["details.model"]}
EOF

WRITEPATH_SCHEMA="$WORKDIR/writepath-schema.json"
cat > "$WRITEPATH_SCHEMA" <<'EOF'
{"required":["status"],"x-file-write-path-fields":["details.model"]}
EOF

fail() {
  echo "SELF-CHECK HIBA: $1" >&2
  exit 1
}

expect_exit() {
  expected="$1"
  shift
  actual=0
  "$@" >"$WORKDIR/last-stdout" 2>"$WORKDIR/last-stderr" || actual=$?
  if [ "$actual" != "$expected" ]; then
    echo "  -> parancs: $*" >&2
    echo "  -> stdout:" >&2
    cat "$WORKDIR/last-stdout" >&2
    echo "  -> stderr:" >&2
    cat "$WORKDIR/last-stderr" >&2
    fail "várt kilépőkód $expected, kapott $actual"
  fi
}

echo "1/16 -- sikeres dry-run valasz (exit 0)"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log1.jsonl" \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq '"status":"ok"' "$WORKDIR/last-stdout" || fail "a sikeres valasz nem a vart JSON-t adta"

echo "2/16 -- validacios hiba, validate-and-fallback policy (exit 1)"
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log2.jsonl" \
  "$SCRIPT" --schema "$INVALID_SCHEMA" --dry-run
grep -Fq 'VALIDÁCIÓS HIBA' "$WORKDIR/last-stderr" || fail "hianyzik a validacios hiba uzenet"

echo "3/16 -- validacios hiba, fail-loud policy (exit 2)"
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log3.jsonl" LOCAL_MODEL_FALLBACK_POLICY=fail-loud \
  "$SCRIPT" --schema "$INVALID_SCHEMA" --dry-run

echo "4/16 -- hivatkozott fajlutvonal nem letezik (exit 1)"
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log4.jsonl" \
  "$SCRIPT" --schema "$FILEPATH_SCHEMA" --dry-run
grep -Fq 'hivatkozott fajl nem letezik' "$WORKDIR/last-stderr" || fail "hianyzik a fajlutvonal-hiany hibauzenet"

echo "5/16 -- kemeny hiba (health check bukas), validate-and-fallback policy (exit 2)"
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log5.jsonl" LOCAL_MODEL_DRY_RUN_HEALTH=fail \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq 'KEMÉNY HIBA' "$WORKDIR/last-stderr" || fail "hianyzik a kemeny hiba uzenet"

echo "6/16 -- kemeny hiba, retry-then-fallback policy (exit 2, 3 kiserlet naplozva)"
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log6.jsonl" LOCAL_MODEL_DRY_RUN_HEALTH=fail \
  LOCAL_MODEL_FALLBACK_POLICY=retry-then-fallback LOCAL_MODEL_MAX_RETRIES=2 \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
LINE_COUNT="$(wc -l < "$WORKDIR/log6.jsonl" | tr -d ' ')"
[ "$LINE_COUNT" = "3" ] || fail "retry-then-fallback: 3 naplosort vartunk (1 kezdeti + 2 retry), kaptunk $LINE_COUNT-t"
grep -Fq '"attempt":3' "$WORKDIR/log6.jsonl" || fail "hianyzik a 3. kiserlet naplosora"

# ISO-8601 UTC időbélyeg <mp> másodperccel ezelőttről (a breaker lehűlési idejének tesztjeihez;
# node-dal, mert a `date -d` GNU-, a `date -r` BSD-specifikus, a szkript pedig amúgy is node-ot kér).
ts_ago() {
  node -e 'console.log(new Date(Date.now() - Number(process.argv[1]) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"))' "$1"
}
NOW_TS="$(ts_ago 0)"

echo "7/16 -- circuit breaker nyitva, elozetesen naploban 2 friss sikertelen kiserlettel (exit 2)"
BREAKER_LOG="$WORKDIR/log-breaker.jsonl"
printf '{"timestamp":"%s","outcome":"hard_error"}\n{"timestamp":"%s","outcome":"hard_error"}\n' "$NOW_TS" "$NOW_TS" > "$BREAKER_LOG"
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$BREAKER_LOG" LOCAL_MODEL_BREAKER_THRESHOLD=2 \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq 'breaker_open' "$BREAKER_LOG" || fail "hianyzik a breaker_open naplosor"
grep -Fq 'circuit breaker nyitva' "$WORKDIR/last-stderr" || fail "hianyzik a breaker hibauzenet"

echo "8/16 -- naplosor JSONL formatum, dialektus felulirasa, nincs prompt/valasz szoveg a naploban"
LOG7="$WORKDIR/log7.jsonl"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$LOG7" LOCAL_MODEL_DIALECT=openai \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq '"dialect":"openai"' "$LOG7" || fail "a naplosor nem tartalmazza a felulirt dialektust"
grep -Fq '"outcome":"success"' "$LOG7" || fail "a naplosor nem tartalmazza a sikeres kimenetelt"
grep -Fq '"timestamp"' "$LOG7" || fail "a naplosor nem tartalmaz timestamp mezot"
if grep -Fq 'dry-run valasz' "$LOG7"; then
  fail "a naplo tartalmazza a modell-valasz szoveget — csak metaadat lenne megengedett"
fi

echo "9/16 -- kotelezo argumentumok hianyanak kezelese (exit 2)"
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log9a.jsonl" "$SCRIPT" --dry-run
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log9b.jsonl" "$SCRIPT" --schema "$VALID_SCHEMA"

# --- COCALC-387 (LOCAL-4) biztonsagi ellenorzesek ---

echo "10/16 -- loopback-figyelmezetes: nem-loopback LOCAL_MODEL_ENDPOINT eseten explicit stderr FIGYELEM (exit 0 marad, csak jelez)"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log10.jsonl" LOCAL_MODEL_ENDPOINT="http://example.com:11434" \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq 'FIGYELEM' "$WORKDIR/last-stderr" || fail "hianyzik a nem-loopback vegpont figyelmeztetes"
grep -Fq 'example.com' "$WORKDIR/last-stderr" || fail "a figyelmeztetes nem nevezi meg a vegpontot"

echo "11/16 -- loopback cim eseten NINCS figyelmeztetes (alapertelmezett localhost vegpont)"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log11.jsonl" \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
if grep -Fq 'FIGYELEM' "$WORKDIR/last-stderr"; then
  fail "loopback vegpontnal nem vart figyelmeztetes jelent meg"
fi

echo "12/16 -- x-file-path-fields: abszolut ES repo-n-kivuli relativ utvonal elutasitva letezestol fuggetlenul (exit 1)"
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log12a.jsonl" LOCAL_MODEL_NAME="/etc/passwd" \
  "$SCRIPT" --schema "$FILEPATH_SCHEMA" --dry-run
grep -Fq 'abszolut fajlutvonal nem engedelyezett' "$WORKDIR/last-stderr" || fail "hianyzik az abszolut-utvonal elutasitas uzenete"
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log12b.jsonl" LOCAL_MODEL_NAME="../../../etc/passwd" \
  "$SCRIPT" --schema "$FILEPATH_SCHEMA" --dry-run
grep -Fq 'a repo gyokeren kivulre mutat' "$WORKDIR/last-stderr" || fail "hianyzik a repo-n-kivuli utvonal elutasitas uzenete"

echo "13/16 -- x-file-write-path-fields: biztonsagos, meg nem letezo relativ utvonal ATMEGY (exit 0), abszolut/repo-n-kivuli ELUTASITVA (exit 1)"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log13a.jsonl" LOCAL_MODEL_NAME="src/meg/nem/letezo/fajl.ts" \
  "$SCRIPT" --schema "$WRITEPATH_SCHEMA" --dry-run
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log13b.jsonl" LOCAL_MODEL_NAME="/etc/passwd" \
  "$SCRIPT" --schema "$WRITEPATH_SCHEMA" --dry-run
grep -Fq 'abszolut fajlutvonal nem engedelyezett' "$WORKDIR/last-stderr" || fail "az irando-utvonal mezo nem utasitotta el az abszolut utvonalat"

echo "14/16 -- loopback-figyelmezetes: case-insensitive (code review nitpick) -- 'HTTP://LOCALHOST' NEM ad figyelmeztetest"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log14.jsonl" LOCAL_MODEL_ENDPOINT="HTTP://LOCALHOST:11434" \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
if grep -Fq 'FIGYELEM' "$WORKDIR/last-stderr"; then
  fail "a nagybetus 'HTTP://LOCALHOST' vegpontot tevesen nem-loopbacknak jelezte (case-sensitive hiba)"
fi

# --- COCALC-387 code review (major, biztonsag): symlink-escape teszt ---
# Egy repon BELULI szimbolikus linket hozunk letre, ami repon KIVULRE mutat -- a lexikai
# (path.resolve) ellenorzes ezt at engedne (a linkelem string-utvonala repo-relativ), a
# valodi (fs.realpathSync) ellenorzesnek kell elkapnia. Nem minden futtato kornyezet tud
# valodi szimbolikus linket letrehozni jogosultsag nelkul (pl. Windows fejlesztoi mod
# nelkul) -- ezt a Node fs.lstatSync().isSymbolicLink()-kel detektaljuk, es ha nem
# tamogatott, SKIP-warn-nal folytatjuk (nem hamis buktatas).
SYMLINK_OUTSIDE_DIR="$WORKDIR/symlink-escape-target"
mkdir -p "$SYMLINK_OUTSIDE_DIR"
echo "titkos-tartalom" > "$SYMLINK_OUTSIDE_DIR/secret.txt"
SYMLINK_NAME=".cocalc387-symlink-escape-test-$$"
SYMLINK_PATH="$(pwd)/$SYMLINK_NAME"
rm -rf "$SYMLINK_PATH" 2>/dev/null || true
ln -s "$SYMLINK_OUTSIDE_DIR" "$SYMLINK_PATH" 2>/dev/null || true
# rm -rf, mert nem minden kornyezetben jon letre VALODI szimbolikus link (lasd lent a
# SYMLINK_SUPPORTED detektalast) -- ha a "ln -s" a celkornyezetben tenylegesen konyvtarat
# hozott letre (pl. jogosultsag hianyaban), a sima "rm -f" nem torolne.
cleanup_symlink() { rm -rf "$SYMLINK_PATH" 2>/dev/null || true; }
trap 'cleanup_symlink; rm -rf "$WORKDIR"' EXIT

SYMLINK_SUPPORTED=$(node -e '
  const fs = require("fs");
  try {
    process.stdout.write(fs.lstatSync(process.argv[1]).isSymbolicLink() ? "yes" : "no");
  } catch (e) {
    process.stdout.write("no");
  }
' "$SYMLINK_PATH" 2>/dev/null || echo no)

if [ "$SYMLINK_SUPPORTED" = "yes" ]; then
  echo "15/16 -- symlink-escape: LETEZO fajlra mutato, repon-kivulre vezeto szimbolikus link elutasitva (x-file-path-fields, exit 1)"
  expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log15.jsonl" LOCAL_MODEL_NAME="$SYMLINK_NAME/secret.txt" \
    "$SCRIPT" --schema "$FILEPATH_SCHEMA" --dry-run
  grep -Fq 'szimbolikus link' "$WORKDIR/last-stderr" || fail "hianyzik a symlink-escape elutasitas uzenete (letezo fajl)"

  echo "16/16 -- symlink-escape: MEG NEM LETEZO fajlra mutato, repon-kivuli szulo-konyvtaron atvezeto utvonal elutasitva (x-file-write-path-fields, exit 1)"
  expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log16.jsonl" LOCAL_MODEL_NAME="$SYMLINK_NAME/meg-nem-letezo/uj-fajl.ts" \
    "$SCRIPT" --schema "$WRITEPATH_SCHEMA" --dry-run
  grep -Fq 'szimbolikus link' "$WORKDIR/last-stderr" || fail "hianyzik a symlink-escape elutasitas uzenete (irando fajl)"
else
  echo "15/16, 16/16 SKIP -- ez a futtato kornyezet nem tud valodi szimbolikus linket letrehozni (pl. Windows fejlesztoi mod/jogosultsag nelkul); a symlink-escape ellenorzest a CI Linux-konteneres futasa fedi le"
fi

# --- LOCAL-5 (repo-scanner / qa-tester bekötés): tömbelem-útvonal, --phase napló, fájlon át
# menő kérés-/válasz-törzs (nagy prompt és nagy válasz), think/num_ctx/format mezők. A
# 2x_ tesztek --dry-run + LOCAL_MODEL_DRY_RUN_RESPONSE_FILE módban futnak; a 3x_ tesztek egy
# helyben indított, Ollama-t utánzó node HTTP szerver ellen (valódi curl-hívás). ---

winpath() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

ARRAY_SCHEMA="$WORKDIR/array-schema.json"
cat > "$ARRAY_SCHEMA" <<'EOF'
{"required":["findings"],"properties":{"findings":{"type":"array"}},"x-file-path-fields":["findings[].path"]}
EOF
SCAN_SCHEMA="$(pwd)/.claude/skills/dev-workflow/schemas/repo-scan-response.v1.schema.json"
QA_SCHEMA="$(pwd)/.claude/skills/dev-workflow/schemas/qa-verdict.v1.schema.json"
test -f "$SCAN_SCHEMA"
test -f "$QA_SCHEMA"

echo "22 -- tomb-elem utvonal (findings[].path): minden elem letezo, repon beluli fajl -> exit 0"
printf '%s\n' '{"findings":[{"path":"ci/verify-call-local-model.sh","line":1},{"path":".claude/skills/dev-workflow/config.md","line":2}]}' > "$WORKDIR/resp22.json"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log22.jsonl" LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="$WORKDIR/resp22.json" \
  "$SCRIPT" --schema "$ARRAY_SCHEMA" --dry-run

echo "23 -- tomb-elem utvonal: a masodik elem nem letezo fajl -> exit 1, hibauzenet"
printf '%s\n' '{"findings":[{"path":"ci/verify-call-local-model.sh"},{"path":"nincs/ilyen/fajl.ts"}]}' > "$WORKDIR/resp23.json"
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log23.jsonl" LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="$WORKDIR/resp23.json" \
  "$SCRIPT" --schema "$ARRAY_SCHEMA" --dry-run
grep -Fq 'hivatkozott fajl nem letezik' "$WORKDIR/last-stderr" || fail "a tomb-elem utvonal hianyzo fajlja nem adott hibauzenetet"

echo "24 -- tomb-elem utvonal: abszolut utvonal egy tomb-elemben elutasitva (exit 1)"
printf '%s\n' '{"findings":[{"path":"ci/verify-call-local-model.sh"},{"path":"/etc/passwd"}]}' > "$WORKDIR/resp24.json"
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log24.jsonl" LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="$WORKDIR/resp24.json" \
  "$SCRIPT" --schema "$ARRAY_SCHEMA" --dry-run
grep -Fq 'abszolut fajlutvonal nem engedelyezett' "$WORKDIR/last-stderr" || fail "a tomb-elem abszolut utvonala nem lett elutasitva"

echo "25 -- tomb-elem utvonal: ures findings tomb ervenyes (nincs lelet = ervenyes eredmeny, exit 0)"
printf '%s\n' '{"findings":[]}' > "$WORKDIR/resp25.json"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log25.jsonl" LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="$WORKDIR/resp25.json" \
  "$SCRIPT" --schema "$ARRAY_SCHEMA" --dry-run

echo "26 -- repo-scan-response.v1 es qa-verdict.v1 sema: mintavalasz atmegy, hianyzo kotelezo mezo elbukik"
printf '%s\n' '{"findings":[{"path":"ci/verify-call-local-model.sh","line":1,"quote":"x","why":"y"}],"searched":["a"],"notFound":[]}' > "$WORKDIR/resp26a.json"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log26a.jsonl" LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="$WORKDIR/resp26a.json" \
  "$SCRIPT" --schema "$SCAN_SCHEMA" --dry-run
printf '%s\n' '{"findings":[]}' > "$WORKDIR/resp26b.json"
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log26b.jsonl" LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="$WORKDIR/resp26b.json" \
  "$SCRIPT" --schema "$SCAN_SCHEMA" --dry-run
printf '%s\n' '{"overall":"pass","acResults":[{"ac":"AC1","status":"pass","evidence":"e"}],"bugs":[],"jiraComment":"ok"}' > "$WORKDIR/resp26c.json"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log26c.jsonl" LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="$WORKDIR/resp26c.json" \
  "$SCRIPT" --schema "$QA_SCHEMA" --dry-run
printf '%s\n' '{"overall":"pass"}' > "$WORKDIR/resp26d.json"
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log26d.jsonl" LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="$WORKDIR/resp26d.json" \
  "$SCRIPT" --schema "$QA_SCHEMA" --dry-run

echo "27 -- --phase: a naplosor 'phase' mezoje; phase nelkul ures string"
LOG27="$WORKDIR/log27.jsonl"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$LOG27" "$SCRIPT" --schema "$VALID_SCHEMA" --phase repo-scanner --dry-run
grep -Fq '"phase":"repo-scanner"' "$LOG27" || fail "a naplosor nem tartalmazza a phase mezot"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$LOG27" "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
tail -n 1 "$LOG27" | grep -Fq '"phase":""' || fail "phase nelkul ures phase mezot vartunk"

STATUS_SCHEMA="$WORKDIR/status-schema.json"
printf '%s\n' '{"required":["status"],"properties":{"status":{"type":"string"}}}' > "$STATUS_SCHEMA"

echo "28 -- nagy valasz (300 KB) a fajlon keresztuli uton is atmegy (nincs parancssori meretkorlat)"
node -e 'process.stdout.write(JSON.stringify({ status: "ok", pad: "x".repeat(300000) }))' > "$WORKDIR/resp28.json"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log28.jsonl" LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="$WORKDIR/resp28.json" \
  "$SCRIPT" --schema "$STATUS_SCHEMA" --dry-run
SIZE28="$(wc -c < "$WORKDIR/last-stdout" | tr -d ' ')"
[ "$SIZE28" -gt 300000 ] || fail "a nagy valasz csonkolodott ($SIZE28 bajt)"

# --- Ollama-t utanzo helyi szerver (valodi curl-hivas, nem dry-run) ---
MOCK_JS="$WORKDIR/mock-ollama.js"
cat > "$MOCK_JS" <<'EOF'
const http = require("http");
const fs = require("fs");
const [reqFile, respFile, portFile] = process.argv.slice(2);
const srv = http.createServer((req, res) => {
  if (req.method === "GET") { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{\"models\":[]}"); return; }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    fs.writeFileSync(reqFile, Buffer.concat(chunks));
    const content = fs.readFileSync(respFile, "utf8");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: { role: "assistant", content } }));
  });
});
srv.listen(0, "127.0.0.1", () => fs.writeFileSync(portFile, String(srv.address().port)));
setTimeout(() => process.exit(0), 120000);
EOF
MOCK_REQ="$WORKDIR/mock-request.json"
MOCK_RESP="$WORKDIR/mock-response.json"
MOCK_PORT_FILE="$WORKDIR/mock-port.txt"
printf '%s\n' '{"status":"ok"}' > "$MOCK_RESP"
node "$(winpath "$MOCK_JS")" "$(winpath "$MOCK_REQ")" "$(winpath "$MOCK_RESP")" "$(winpath "$MOCK_PORT_FILE")" &
MOCK_PID=$!
i=0
while [ ! -s "$MOCK_PORT_FILE" ] && [ "$i" -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
[ -s "$MOCK_PORT_FILE" ] || { kill "$MOCK_PID" 2>/dev/null || true; fail "az Ollama-utanzo szerver nem indult el"; }
MOCK_ENDPOINT="http://127.0.0.1:$(cat "$MOCK_PORT_FILE")"

BIG_PROMPT="$WORKDIR/big-prompt.txt"
node -e 'process.stdout.write("Hosszu prompt: " + "abé\n".repeat(60000))' > "$BIG_PROMPT"

STATUS_SCHEMA="$WORKDIR/status-schema.json"
printf '%s\n' '{"required":["status"],"properties":{"status":{"type":"string"}}}' > "$STATUS_SCHEMA"

echo "31 -- valodi curl-hivas: ~240 KB prompt fajlon at, think=off, num_ctx, format=json -> a kerestorzs pontos"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log31.jsonl" LOCAL_MODEL_ENDPOINT="$MOCK_ENDPOINT" \
  LOCAL_MODEL_DIALECT=ollama LOCAL_MODEL_NAME=teszt-modell LOCAL_MODEL_THINK=off LOCAL_MODEL_NUM_CTX=4096 \
  LOCAL_MODEL_FORMAT=json \
  "$SCRIPT" --schema "$STATUS_SCHEMA" --prompt-file "$BIG_PROMPT" --phase qa-tester
grep -Fq '"status":"ok"' "$WORKDIR/last-stdout" || fail "a mock valasz nem jutott el stdout-ra"
grep -Fq '"phase":"qa-tester"' "$WORKDIR/log31.jsonl" || fail "a naplosor nem tartalmazza a qa-tester phase-t"
node -e '
  const fs = require("fs");
  const [reqFile, promptFile] = process.argv.slice(1);
  const body = JSON.parse(fs.readFileSync(reqFile, "utf8"));
  const prompt = fs.readFileSync(promptFile, "utf8");
  const errs = [];
  if (body.model !== "teszt-modell") errs.push("model: " + body.model);
  if (body.stream !== false) errs.push("stream nem false");
  if (body.think !== false) errs.push("think nem false");
  if (!body.options || body.options.num_ctx !== 4096) errs.push("options.num_ctx != 4096");
  if (body.format !== "json") errs.push("format != json");
  if (!body.messages || body.messages.length !== 1 || body.messages[0].role !== "user") errs.push("messages alakja");
  else if (body.messages[0].content !== prompt) errs.push("a prompt nem egyezik bajtra (" + body.messages[0].content.length + " vs " + prompt.length + ")");
  if (errs.length) { console.error(errs.join("; ")); process.exit(1); }
' "$(winpath "$MOCK_REQ")" "$(winpath "$BIG_PROMPT")" || fail "a kerestorzs nem a vart (think/num_ctx/format/prompt)"

echo "32 -- valodi curl-hivas: alapertelmezett beallitasokkal nincs think/options/format mezo a kerestorzsben"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log32.jsonl" LOCAL_MODEL_ENDPOINT="$MOCK_ENDPOINT" \
  LOCAL_MODEL_DIALECT=ollama LOCAL_MODEL_NAME=teszt-modell \
  "$SCRIPT" --schema "$STATUS_SCHEMA" --prompt "rovid prompt"
node -e '
  const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const bad = ["think", "options", "format"].filter((k) => k in body);
  if (bad.length) { console.error("nem vart mezok: " + bad.join(",")); process.exit(1); }
  if (body.messages[0].content !== "rovid prompt") { console.error("prompt"); process.exit(1); }
' "$(winpath "$MOCK_REQ")" || fail "alapertelmezett beallitasoknal nem vart mezok kerultek a kerestorzsbe"

echo "33 -- valodi curl-hivas: ~300 KB MODELL-valasz (nagy fileContents) is hiba nelkul visszajon"
node -e 'process.stdout.write(JSON.stringify({ status: "ok", pad: "y".repeat(300000) }))' > "$MOCK_RESP"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log33.jsonl" LOCAL_MODEL_ENDPOINT="$MOCK_ENDPOINT" \
  LOCAL_MODEL_DIALECT=ollama LOCAL_MODEL_NAME=teszt-modell \
  "$SCRIPT" --schema "$STATUS_SCHEMA" --prompt "rovid prompt"
SIZE33="$(wc -c < "$WORKDIR/last-stdout" | tr -d ' ')"
[ "$SIZE33" -gt 300000 ] || fail "a nagy modell-valasz csonkolodott ($SIZE33 bajt)"

echo "34 -- valodi curl-hivas: nem JSON modell-valasz -> validacios hiba (exit 1), nem kemeny hiba"
printf '%s\n' 'Ez nem JSON, csak szoveg' > "$MOCK_RESP"
expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log34.jsonl" LOCAL_MODEL_ENDPOINT="$MOCK_ENDPOINT" \
  LOCAL_MODEL_DIALECT=ollama LOCAL_MODEL_NAME=teszt-modell \
  "$SCRIPT" --schema "$STATUS_SCHEMA" --prompt "rovid prompt"

kill "$MOCK_PID" 2>/dev/null || true

echo "35 -- naplosor: ticket, duration_ms es prompt_chars mezo; a ticket a --ticket ertéke"
LOG35="$WORKDIR/log35.jsonl"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$LOG35" \
  "$SCRIPT" --schema "$VALID_SCHEMA" --prompt "rovid prompt" --ticket ORD-376 --dry-run
grep -Fq '"ticket":"ORD-376"' "$LOG35" || fail "a naplosor ticket mezoje nem a --ticket ertek"
grep -Fq '"duration_ms":' "$LOG35" || fail "a naplosor nem tartalmaz duration_ms mezot"
grep -Fq '"prompt_chars":' "$LOG35" || fail "a naplosor nem tartalmaz prompt_chars mezot"

echo "36 -- a naploba elore irt fallback sorok (outcome nelkul) a kuszobnal tobben sem nyitjak a breakert"
LOG36="$WORKDIR/log36.jsonl"
for _i in 1 2 3 4; do
  printf '{"timestamp":"2026-01-01T00:00:00Z","event":"fallback","ticket":"X","fallback_reason":"typecheck"}\n' >> "$LOG36"
done
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$LOG36" LOCAL_MODEL_BREAKER_THRESHOLD=2 \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
if grep -Fq 'breaker_open' "$LOG36"; then
  fail "a fallback sorok nem szamithatnak bele a breakerbe, de a breaker_open naplosor megjelent"
fi

echo "37 -- kuszobnyi valodi hibasor (hard_error) mellett a breaker nyit, a koztuk levo fallback sor nem szamit"
LOG37="$WORKDIR/log37.jsonl"
printf '{"timestamp":"%s","outcome":"hard_error"}\n{"timestamp":"2026-01-01T00:00:00Z","event":"fallback","ticket":"X","fallback_reason":"typecheck"}\n{"timestamp":"%s","outcome":"hard_error"}\n' "$NOW_TS" "$NOW_TS" > "$LOG37"
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$LOG37" LOCAL_MODEL_BREAKER_THRESHOLD=2 \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq 'breaker_open' "$LOG37" || fail "hianyzik a breaker_open naplosor kuszobnyi hibasor mellett"

# --- Lehűlési idő és félig nyitott állapot (a 2026-11-09-i ragadós breaker javítása): a
# breaker_open sorok nem tarthatják nyitva önmagukat, a lehűlés után egy próbahívás megy. ---
OLD_TS="$(ts_ago 7200)"

echo "38 -- lejart lehules (2 ora regi hibak, 900 mp) -> felig nyitott, a probahivas sikere zarja a breakert"
LOG38="$WORKDIR/log38.jsonl"
printf '{"timestamp":"%s","outcome":"validation_failed"}\n{"timestamp":"%s","outcome":"validation_failed"}\n' "$OLD_TS" "$OLD_TS" > "$LOG38"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$LOG38" LOCAL_MODEL_BREAKER_THRESHOLD=2 LOCAL_MODEL_BREAKER_COOLDOWN=900 \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq 'félig nyitott' "$WORKDIR/last-stderr" || fail "hianyzik a felig nyitott (probahivas) jelzes"
tail -n 1 "$LOG38" | grep -Fq '"outcome":"success"' || fail "a probahivas sikere nem kerult a naploba"
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$LOG38" LOCAL_MODEL_BREAKER_THRESHOLD=2 LOCAL_MODEL_BREAKER_COOLDOWN=900 \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
if grep -Fq 'félig nyitott' "$WORKDIR/last-stderr"; then
  fail "a sikeres probahivas utan a breakernek zarva kellene lennie, de ujra felig nyitott"
fi

echo "39 -- a breaker_open sorok nem tartjak nyitva a breakert (regi hibak + sok friss breaker_open sor -> probahivas)"
LOG39="$WORKDIR/log39.jsonl"
printf '{"timestamp":"%s","outcome":"validation_failed"}\n{"timestamp":"%s","outcome":"validation_failed"}\n' "$OLD_TS" "$OLD_TS" > "$LOG39"
for _i in 1 2 3 4 5; do
  printf '{"timestamp":"%s","outcome":"breaker_open"}\n' "$NOW_TS" >> "$LOG39"
done
expect_exit 0 env LOCAL_MODEL_LOG_FILE="$LOG39" LOCAL_MODEL_BREAKER_THRESHOLD=2 LOCAL_MODEL_BREAKER_COOLDOWN=900 \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
tail -n 1 "$LOG39" | grep -Fq '"outcome":"success"' || fail "a friss breaker_open sorok nyitva tartottak a breakert"

echo "40 -- a sikertelen probahivas ujranyitja a breakert (a kovetkezo hivas breaker_open)"
LOG40="$WORKDIR/log40.jsonl"
printf '{"timestamp":"%s","outcome":"hard_error"}\n{"timestamp":"%s","outcome":"hard_error"}\n' "$OLD_TS" "$OLD_TS" > "$LOG40"
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$LOG40" LOCAL_MODEL_BREAKER_THRESHOLD=2 LOCAL_MODEL_BREAKER_COOLDOWN=900 \
  LOCAL_MODEL_DRY_RUN_HEALTH=fail "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq 'KEMÉNY HIBA' "$WORKDIR/last-stderr" || fail "a probahivasnak le kellett volna futnia (kemeny hiba), nem kihagyodnia"
if grep -Fq 'circuit breaker nyitva' "$WORKDIR/last-stderr"; then
  fail "a lejart lehules utan a probahivas helyett a breaker blokkolt"
fi
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$LOG40" LOCAL_MODEL_BREAKER_THRESHOLD=2 LOCAL_MODEL_BREAKER_COOLDOWN=900 \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq 'circuit breaker nyitva' "$WORKDIR/last-stderr" || fail "a sikertelen probahivas utan a breakernek ujra nyitnia kellett volna"
tail -n 1 "$LOG40" | grep -Fq '"outcome":"breaker_open"' || fail "hianyzik a breaker_open naplosor a sikertelen probahivas utan"

echo "41 -- meg nem lejart lehules: nyitva, a hibauzenet mondja, mikor jon a probahivas"
LOG41="$WORKDIR/log41.jsonl"
printf '{"timestamp":"%s","outcome":"hard_error"}\n{"timestamp":"%s","outcome":"hard_error"}\n' "$OLD_TS" "$OLD_TS" > "$LOG41"
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$LOG41" LOCAL_MODEL_BREAKER_THRESHOLD=2 LOCAL_MODEL_BREAKER_COOLDOWN=86400 \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq 'próbahívás' "$WORKDIR/last-stderr" || fail "a nyitott breaker uzenetebol hianyzik a probahivas ideje"

echo "42 -- ervenytelen LOCAL_MODEL_BREAKER_COOLDOWN -> exit 2"
expect_exit 2 env LOCAL_MODEL_LOG_FILE="$WORKDIR/log42.jsonl" LOCAL_MODEL_BREAKER_COOLDOWN=tiz \
  "$SCRIPT" --schema "$VALID_SCHEMA" --dry-run
grep -Fq 'LOCAL_MODEL_BREAKER_COOLDOWN' "$WORKDIR/last-stderr" || fail "hianyzik az ervenytelen lehulesi ido hibauzenete"

echo "call-local-model.sh self-check: minden ellenőrzés zöld."

# A .agents/ alatti Codex-port ugyanazt a viselkedést adja a legfontosabb ágakon (sikeres
# dry-run + alapértelmezett LOCAL_MODEL_MAX_RETRIES melletti retry-szám) — teljes 9 lépéses
# duplikálás helyett csak ez a két reprezentatív eset, hogy a két másolat driftjét (pl. a
# jelen ticketben javított alapérték-eltérést) egy portábilis self-check is elkapja.
AGENTS_SCRIPT="$(pwd)/.agents/skills/dev-workflow/scripts/call-local-model.sh"
if [ -f "$AGENTS_SCRIPT" ]; then
  echo "17/16 -- .agents/ port: sikeres dry-run valasz (exit 0)"
  expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/agents-log1.jsonl" \
    "$AGENTS_SCRIPT" --schema "$VALID_SCHEMA" --dry-run
  grep -Fq '"status":"ok"' "$WORKDIR/last-stdout" || fail ".agents port: a sikeres valasz nem a vart JSON-t adta"

  echo "18/16 -- .agents/ port: alapertelmezett LOCAL_MODEL_MAX_RETRIES (1 ujraproba, 2 kiserlet osszesen)"
  expect_exit 2 env LOCAL_MODEL_LOG_FILE="$WORKDIR/agents-log2.jsonl" LOCAL_MODEL_DRY_RUN_HEALTH=fail \
    LOCAL_MODEL_FALLBACK_POLICY=retry-then-fallback \
    "$AGENTS_SCRIPT" --schema "$VALID_SCHEMA" --dry-run
  AGENTS_LINE_COUNT="$(wc -l < "$WORKDIR/agents-log2.jsonl" | tr -d ' ')"
  [ "$AGENTS_LINE_COUNT" = "2" ] || fail ".agents port: alapertelmezett max-retries mellett 2 naplosort vartunk (1 kezdeti + 1 retry), kaptunk $AGENTS_LINE_COUNT-t"

  # --- COCALC-387 code review (major, biztonsag/konzisztencia): a 4 biztonsagi korlat
  # reprezentativ portolas-ellenorzese a .agents/ oldalon is (nem a teljes 16 eset, csak
  # a lenyeg: loopback-figyelmeztetes, abszolut-utvonal elutasitas, symlink-escape). ---
  echo "19/16 -- .agents/ port: loopback-figyelmezetes (nem-loopback vegpont -> FIGYELEM, exit 0 marad)"
  expect_exit 0 env LOCAL_MODEL_LOG_FILE="$WORKDIR/agents-log3.jsonl" LOCAL_MODEL_ENDPOINT="http://example.com:11434" \
    "$AGENTS_SCRIPT" --schema "$VALID_SCHEMA" --dry-run
  grep -Fq 'FIGYELEM' "$WORKDIR/last-stderr" || fail ".agents port: hianyzik a nem-loopback vegpont figyelmeztetes"

  echo "20/16 -- .agents/ port: x-file-path-fields abszolut utvonal elutasitva (exit 1)"
  expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/agents-log4.jsonl" LOCAL_MODEL_NAME="/etc/passwd" \
    "$AGENTS_SCRIPT" --schema "$FILEPATH_SCHEMA" --dry-run
  grep -Fq 'abszolut fajlutvonal nem engedelyezett' "$WORKDIR/last-stderr" || fail ".agents port: hianyzik az abszolut-utvonal elutasitas uzenete"

  if [ "$SYMLINK_SUPPORTED" = "yes" ]; then
    echo "21/16 -- .agents/ port: symlink-escape elutasitva (x-file-path-fields, exit 1)"
    expect_exit 1 env LOCAL_MODEL_LOG_FILE="$WORKDIR/agents-log5.jsonl" LOCAL_MODEL_NAME="$SYMLINK_NAME/secret.txt" \
      "$AGENTS_SCRIPT" --schema "$FILEPATH_SCHEMA" --dry-run
    grep -Fq 'szimbolikus link' "$WORKDIR/last-stderr" || fail ".agents port: hianyzik a symlink-escape elutasitas uzenete"
  else
    echo "21/16 SKIP -- lasd fent a fo szkript symlink-escape SKIP indoklasat"
  fi

  echo "22/16 -- .agents/ port: lejart lehules + friss breaker_open sorok -> probahivas, a breaker nem ragad be"
  AGENTS_LOG6="$WORKDIR/agents-log6.jsonl"
  printf '{"timestamp":"%s","outcome":"hard_error"}\n{"timestamp":"%s","outcome":"hard_error"}\n{"timestamp":"%s","outcome":"breaker_open"}\n{"timestamp":"%s","outcome":"breaker_open"}\n' \
    "$OLD_TS" "$OLD_TS" "$NOW_TS" "$NOW_TS" > "$AGENTS_LOG6"
  expect_exit 0 env LOCAL_MODEL_LOG_FILE="$AGENTS_LOG6" LOCAL_MODEL_BREAKER_THRESHOLD=2 LOCAL_MODEL_BREAKER_COOLDOWN=900 \
    "$AGENTS_SCRIPT" --schema "$VALID_SCHEMA" --dry-run
  tail -n 1 "$AGENTS_LOG6" | grep -Fq '"outcome":"success"' || fail ".agents port: a lejart lehules utan a probahivas nem futott le"

  echo ".agents/ port self-check: minden ellenőrzés zöld."
else
  echo "INFO: .agents/skills/dev-workflow/scripts/call-local-model.sh nem talalhato, .agents port ellenorzese kihagyva."
fi
