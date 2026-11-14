#!/usr/bin/env bash
# Végrehajtó-adapter szkript helyi LLM (Ollama vagy OpenAI-kompatibilis, pl. LM Studio)
# hívásához, séma-validációs horoggal, fallback-szerződéssel és circuit breaker-rel.
# (COCALC-220 / LOCAL-1) — lásd dev-workflow/config.md "WORKFLOW_PROFILE" preset-tábláját
# a hét konfigolható kapcsoló profilonkénti alapértékéhez.
#
# Biztonsági korlátok (COCALC-387, LOCAL-4 — az elso tenyleges fazis-bekotes,
# implementer):
#   - Minden hívás előtt (dry-run alatt is, hogy self-check-kel tesztelhető legyen) a
#     szkript megnézi, hogy a LOCAL_MODEL_ENDPOINT loopback címre mutat-e
#     (localhost/127.*/[::1]/0.0.0.0) — ha nem, EXPLICIT FIGYELMEZTETÉST ír stderr-re,
#     mielőtt a hívás folytatódna. Ez NEM blokkolja a hívást (a felhasználó tudatosan
#     állíthat be távoli végpontot), csak látható jelzést ad.
#   - A --schema fájl "x-file-path-fields" kulcsa alatt hivatkozott útvonalak
#     KÖTELEZŐEN léteznek ÉS a repo munkafáján belülre kell mutassanak — abszolút útvonal
#     vagy normalizálás után a repo-gyökéren kívülre mutató relatív útvonal (pl.
#     "../../etc/passwd") a válasz ELUTASÍTÁSÁT (validációs hiba) okozza, akkor is, ha a
#     célfájl véletlenül létezik a gépen.
#   - Az új "x-file-write-path-fields" kulcs ugyanazt az útvonal-biztonsági ellenőrzést
#     végzi (abszolút/repo-n-kívüli elutasítva), de NEM követeli meg a létezést — ez a
#     válasz által ÍRANDÓ (még nem létező) fájlok útvonalának jelölésére való.
#
# Használat:
#   call-local-model.sh --schema <schema.json> (--prompt "<szöveg>" | --prompt-file <fájl>)
#                       [--phase <fázis-név>] [--dry-run]
#
# --phase (opcionális): a hívó fázis neve (implementer|repo-scanner|qa-tester|...). Csak a
# naplósorba kerül ("phase" mező), hogy a local-executor-log.jsonl-ből látszódjon, melyik
# fázis futott helyben. Viselkedést nem változtat.
#
# A kérés- és válasz-törzs FÁJLON keresztül megy (nem parancssori argumentumon): a prompt és
# a modell válasza így tetszőlegesen nagy lehet (Windowson a parancssor ~32k karakter).
#
# Előfeltétel: `node` elérhető a PATH-on — a séma-validáció és a JSON-építés/kiolvasás ezt
# használja (nem `jq`-t), mert nincs mindenhol garantáltan `jq`.
#
# Kötelező kapcsoló: --schema — a válasz JSON-sémáját leíró fájl (lásd "Séma-formátum" lent).
# --dry-run módban a --prompt/--prompt-file elhagyható, valódi hálózati hívás nem történik,
# a szkript egy fix, sémahelyes (a beépített dry-run sémának megfelelő) választ ad vissza —
# ez a mód szolgál a ci/verify-call-local-model.sh automata self-check alapjául, mivel
# jelenleg nincs éles Ollama/LM Studio végpont elérhető (lásd a ticket "Edge case-ek"
# szekcióját).
#
# Env változók (mind felülírható, alapérték zárójelben):
#   LOCAL_MODEL_ENDPOINT          (http://localhost:11434)   A helyi modell-szerver base URL-je.
#   LOCAL_MODEL_NAME               (llama3)                   A hívandó modell neve.
#   LOCAL_MODEL_TIMEOUT             (30)                       curl --max-time másodpercben.
#   LOCAL_MODEL_DIALECT            (auto)                     auto|ollama|openai — auto esetén
#                                                              a szkript egy /api/tags GET-tel
#                                                              próbálja felismerni az Ollama
#                                                              jelenlétét; ha nem válaszol 200-at,
#                                                              openai-kompatibilis (/v1/chat/completions)
#                                                              dialektust feltételez.
#   LOCAL_MODEL_FALLBACK_POLICY    (validate-and-fallback)    validate-and-fallback|fail-loud|retry-then-fallback
#                                                              — lásd "Fallback-policy-k" lent.
#   LOCAL_MODEL_BREAKER_THRESHOLD  (2)                        Hány egymást követő, a napló
#                                                              végéről visszaolvasott sikertelen
#                                                              (nem "success" kimenetelű) híváskísérlet
#                                                              után nyisson a circuit breaker.
#                                                              A "breaker_open" sorok nem kísérletek,
#                                                              nem számítanak bele.
#   LOCAL_MODEL_BREAKER_COOLDOWN   (900)                      Lehűlési idő másodpercben: ennyivel a
#                                                              legutóbbi sikertelen kísérlet után a
#                                                              nyitott breaker félig nyitottá válik,
#                                                              és egy próbahívást enged (siker zárja,
#                                                              hiba újranyitja). 0 = minden hívás
#                                                              próbahívás (a breaker sosem blokkol).
#   LOCAL_MODEL_MAX_RETRIES       (1)                        retry-then-fallback policy esetén
#                                                              legfeljebb ennyi ÚJRApróbálkozás
#                                                              (az első kísérleten felül) kemény
#                                                              (health check/hálózati) hibánál.
#   LOCAL_MODEL_LOG_FILE           (.agents/skills/dev-workflow/local-executor-log.jsonl)
#                                                              A napló elérési útja, repo-gyökérhez
#                                                              képest vagy abszolút.
#   LOCAL_MODEL_DRY_RUN_HEALTH     (ok)                       CSAK dry-run módban, csak
#                                                              self-check/teszt célra: "fail"
#                                                              értékkel szimulálható a health check
#                                                              bukása (kemény hiba ág tesztelése
#                                                              valódi hálózat nélkül).
#   LOCAL_MODEL_THINK              (auto)                     auto|on|off — Ollama-dialektusnál a
#                                                              kérés "think" mezője: off -> false,
#                                                              on -> true, auto -> nem küld semmit
#                                                              (a modell alapértelmezése érvényes).
#                                                              Gondolkodó modelleknél (pl. qwen3.6) az
#                                                              "off" gyors, de gyengébb ítélőképességű.
#   LOCAL_MODEL_NUM_CTX            (nincs)                    Ha meg van adva (szám), Ollamánál a
#                                                              kérés options.num_ctx értéke; egyébként
#                                                              a modell (Modelfile) értéke marad.
#   LOCAL_MODEL_FORMAT             (nincs)                    "json" -> Ollamánál a kérés "format":"json"
#                                                              mezője (a kimenet szintaktikailag érvényes
#                                                              JSON-ra kényszerítve).
#   LOCAL_MODEL_DRY_RUN_RESPONSE_FILE (nincs)                 CSAK dry-run/self-check célra: ha meg van
#                                                              adva, a fix dry-run válasz helyett ennek a
#                                                              fájlnak a tartalma a "modell válasza".
#
# Kilépési kódok (mindhárom megkülönböztetett, a fallback-policy csak azt befolyásolja,
# mikor melyik jön ki — lásd "Fallback-policy-k"):
#   0 — siker: a validált válasz JSON-je stdout-ra kerül.
#   1 — validációs hiba: a válasz nem illeszkedik a megadott sémára, vagy a válaszban
#       hivatkozott fájlútvonal nem létezik. A hívó félnek fallback (nem-helyi modell)
#       használata ajánlott.
#   2 — kemény hiba: health check/hálózati hiba, timeout, circuit breaker nyitva, vagy
#       hibás/hiányzó parancssori argumentum.
#
# Fallback-policy-k:
#   validate-and-fallback (alap) — egyetlen kísérlet. Kemény hiba -> exit 2. Validációs
#       hiba -> exit 1 (fallback ajánlott).
#   fail-loud — egyetlen kísérlet, nincs retry, ÉS a validációs hibát is kemény hibaként
#       kezeli (exit 2) — ezzel a policyval csak 0/2 kód fordulhat elő, mert a cél, hogy a
#       hívó fél sose kapjon csendes "csak fallbackelj" jelzést, mindent explicit hibaként
#       lásson.
#   retry-then-fallback — kemény (health/hálózati) hibát legfeljebb LOCAL_MODEL_MAX_RETRIES
#       alkalommal újrapróbál, utána exit 2. Validációs hibát NEM retry-el (ugyanarra a
#       promptra determinisztikusan ugyanaz lenne az eredmény) — azonnal exit 1.
#
# Séma-formátum (--schema fájl, JSON):
#   {
#     "required": ["status"],              # kötelező top-level kulcsok a válaszban
#     "properties": {                       # (opcionális) egyszerű típusellenőrzés
#       "status": { "type": "string" }
#     },
#     "x-file-path-fields": ["details.reportPath"], # (opcionális) pontozott útvonalak a
#                                                     # válaszban, amiknek string (vagy
#                                                     # string-tömb) értéke létező fájlra
#                                                     # kell mutasson, KIZÁRÓLAG a repo
#                                                     # munkafáján belül (repo-gyökérhez
#                                                     # képest relatív útvonal — abszolút
#                                                     # útvonal vagy repo-n-kívülre mutató
#                                                     # relatív útvonal MINDIG elutasítva,
#                                                     # a létezéstől függetlenül)
#     "x-file-write-path-fields": ["details.newFiles"] # (opcionális) mint fent, de a
#                                                     # létezés NEM követelmény — íRANDÓ,
#                                                     # meg nem létező fájlok útvonalára
#   }
#   Tömbelem-útvonal: az x-file-path-fields / x-file-write-path-fields pontozott útvonalában
#   a "[]"-re végződő szegmens a tömb MINDEN elemén végigmegy, pl. "findings[].path" a
#   findings tömb minden elemének "path" mezőjét ellenőrzi (repo-scanner válasz).
#   Ez egy leegyszerűsített, saját konvenció — nem a teljes JSON Schema specifikáció, csak
#   a ticket AC-jében kért "séma-illeszkedés + hivatkozott fájlutak biztonságosak/léteznek"
#   ellenőrzést fedi le.
#
# Napló (LOCAL_MODEL_LOG_FILE, JSONL — soronként egy JSON objektum, semmilyen prompt/válasz
# SZÖVEGET nem tartalmaz, csak metaadatot):
#   {"timestamp":"...","dialect":"ollama","endpoint":"...","model":"...",
#    "policy":"validate-and-fallback","attempt":1,"outcome":"success","exit_code":0,
#    "dry_run":true,"phase":"implementer"}
#   Lehetséges "outcome" értékek: success, validation_failed, hard_error, breaker_open.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

LOCAL_MODEL_ENDPOINT="${LOCAL_MODEL_ENDPOINT:-http://localhost:11434}"
LOCAL_MODEL_NAME="${LOCAL_MODEL_NAME:-llama3}"
LOCAL_MODEL_TIMEOUT="${LOCAL_MODEL_TIMEOUT:-30}"
LOCAL_MODEL_DIALECT="${LOCAL_MODEL_DIALECT:-auto}"
LOCAL_MODEL_FALLBACK_POLICY="${LOCAL_MODEL_FALLBACK_POLICY:-validate-and-fallback}"
LOCAL_MODEL_BREAKER_THRESHOLD="${LOCAL_MODEL_BREAKER_THRESHOLD:-2}"
LOCAL_MODEL_BREAKER_COOLDOWN="${LOCAL_MODEL_BREAKER_COOLDOWN:-900}"
LOCAL_MODEL_MAX_RETRIES="${LOCAL_MODEL_MAX_RETRIES:-1}"
LOCAL_MODEL_LOG_FILE="${LOCAL_MODEL_LOG_FILE:-$REPO_ROOT/.agents/skills/dev-workflow/local-executor-log.jsonl}"
LOCAL_MODEL_DRY_RUN_HEALTH="${LOCAL_MODEL_DRY_RUN_HEALTH:-ok}"
LOCAL_MODEL_THINK="${LOCAL_MODEL_THINK:-auto}"
LOCAL_MODEL_NUM_CTX="${LOCAL_MODEL_NUM_CTX:-}"
LOCAL_MODEL_FORMAT="${LOCAL_MODEL_FORMAT:-}"
LOCAL_MODEL_DRY_RUN_RESPONSE_FILE="${LOCAL_MODEL_DRY_RUN_RESPONSE_FILE:-}"

SCHEMA_FILE=""
PROMPT=""
PROMPT_FILE=""
PHASE=""
DRY_RUN=0

usage() {
  echo "Használat: call-local-model.sh --schema <schema.json> (--prompt \"<szöveg>\" | --prompt-file <fájl>) [--phase <fázis>] [--dry-run]" >&2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --schema)
      SCHEMA_FILE="$2"; shift 2 ;;
    --prompt)
      PROMPT="$2"; shift 2 ;;
    --prompt-file)
      PROMPT_FILE="$2"; shift 2 ;;
    --phase)
      PHASE="$2"; shift 2 ;;
    --dry-run)
      DRY_RUN=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "HIBA: ismeretlen argumentum: $1" >&2
      usage
      exit 2 ;;
  esac
done

if [ -z "$SCHEMA_FILE" ]; then
  echo "HIBA: a --schema argumentum kötelező (a válasz JSON-sémáját leíró fájl útvonala)." >&2
  usage
  exit 2
fi
if [ ! -f "$SCHEMA_FILE" ]; then
  echo "HIBA: a megadott séma-fájl nem található: $SCHEMA_FILE" >&2
  exit 2
fi

# Ideiglenes munkakönyvtár: a kérés- és válasz-törzs fájlon megy (nem parancssori
# argumentumon), így nincs méretkorlát. A `node` natív Windows-processz, ezért ott a
# Git Bash /tmp/... útvonalát `cygpath -m`-mel Windows-formára kell hozni.
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
TMP_NODE="$TMP_DIR"
if command -v cygpath >/dev/null 2>&1; then
  TMP_NODE="$(cygpath -m "$TMP_DIR")"
fi

if [ "$DRY_RUN" -eq 0 ]; then
  if [ -n "$PROMPT_FILE" ]; then
    if [ ! -f "$PROMPT_FILE" ]; then
      echo "HIBA: a megadott --prompt-file nem található: $PROMPT_FILE" >&2
      exit 2
    fi
    cp "$PROMPT_FILE" "$TMP_DIR/prompt.txt"
  else
    printf '%s' "$PROMPT" > "$TMP_DIR/prompt.txt"
  fi
  if [ ! -s "$TMP_DIR/prompt.txt" ]; then
    echo "HIBA: --prompt vagy --prompt-file megadása kötelező, ha nem --dry-run módban futsz." >&2
    usage
    exit 2
  fi
fi

case "$LOCAL_MODEL_THINK" in
  auto|on|off) ;;
  *)
    echo "FIGYELEM: ismeretlen LOCAL_MODEL_THINK érték (\"$LOCAL_MODEL_THINK\") -- fallback: auto" >&2
    LOCAL_MODEL_THINK="auto" ;;
esac
case "$LOCAL_MODEL_NUM_CTX" in
  ""|*[!0-9]*)
    if [ -n "$LOCAL_MODEL_NUM_CTX" ]; then
      echo "FIGYELEM: a LOCAL_MODEL_NUM_CTX nem szám (\"$LOCAL_MODEL_NUM_CTX\") -- figyelmen kívül hagyva" >&2
    fi
    LOCAL_MODEL_NUM_CTX="" ;;
esac

case "$LOCAL_MODEL_FALLBACK_POLICY" in
  validate-and-fallback|fail-loud|retry-then-fallback) ;;
  *)
    echo "HIBA: ismeretlen LOCAL_MODEL_FALLBACK_POLICY érték: $LOCAL_MODEL_FALLBACK_POLICY" >&2
    echo "Elfogadott értékek: validate-and-fallback, fail-loud, retry-then-fallback." >&2
    exit 2 ;;
esac

case "$LOCAL_MODEL_BREAKER_COOLDOWN" in
  ""|*[!0-9]*)
    echo "HIBA: a LOCAL_MODEL_BREAKER_COOLDOWN nem nemnegatív egész (másodperc): \"$LOCAL_MODEL_BREAKER_COOLDOWN\"" >&2
    exit 2 ;;
esac

mkdir -p "$(dirname "$LOCAL_MODEL_LOG_FILE")"

log_line() {
  local outcome="$1" exit_code="$2" attempt="$3" dialect="$4"
  local timestamp
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '{"timestamp":"%s","dialect":"%s","endpoint":"%s","model":"%s","policy":"%s","attempt":%s,"outcome":"%s","exit_code":%s,"dry_run":%s,"phase":"%s"}\n' \
    "$timestamp" "$dialect" "$LOCAL_MODEL_ENDPOINT" "$LOCAL_MODEL_NAME" "$LOCAL_MODEL_FALLBACK_POLICY" \
    "$attempt" "$outcome" "$exit_code" \
    "$([ "$DRY_RUN" -eq 1 ] && echo true || echo false)" \
    "$(printf '%s' "$PHASE" | tr -cd 'A-Za-z0-9_.-')" \
    >> "$LOCAL_MODEL_LOG_FILE"
}

# Circuit breaker (állapotgép, a napló az állapot — nincs külön állapotfájl; a .claude/ oldali
# call-local-model.sh breaker_state()-jének portja):
#   - Csak a valódi híváskísérletek számítanak: az "outcome" mezős sorok, KIVÉVE a
#     "breaker_open" sorokat (azok kihagyott hívások — ha számítanának, a nyitott breaker a
#     saját soraival tartaná nyitva magát, és sosem zárulna vissza).
#   - closed: az utolsó LOCAL_MODEL_BREAKER_THRESHOLD kísérlet között van "success", vagy nincs
#     ennyi kísérlet a naplóban.
#   - open: az utolsó LOCAL_MODEL_BREAKER_THRESHOLD kísérlet mind sikertelen, és a legutóbbi óta
#     még nem telt el LOCAL_MODEL_BREAKER_COOLDOWN másodperc -> a hívás kimarad.
#   - half_open: a lehűlési idő letelt (vagy nincs olvasható időbélyeg) -> egy próbahívás
#     mehet; siker zárja, hiba újabb LOCAL_MODEL_BREAKER_COOLDOWN-ra nyitja.
# Kimenet: "closed" | "open <hátralévő másodperc>" | "half_open".
breaker_state() {
  if [ ! -f "$LOCAL_MODEL_LOG_FILE" ]; then
    echo "closed"
    return 0
  fi
  node -e '
    const fs = require("fs");
    const [file, thresholdArg, cooldownArg] = process.argv.slice(1);
    const threshold = Number(thresholdArg);
    const cooldownMs = Number(cooldownArg) * 1000;
    if (!Number.isInteger(threshold) || threshold < 1) { console.log("closed"); process.exit(0); }
    const attempts = [];
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const outcome = line.match(/"outcome":"([^"]*)"/);
      if (!outcome || outcome[1] === "breaker_open") continue;
      const ts = line.match(/"timestamp":"([^"]*)"/);
      attempts.push({ outcome: outcome[1], time: ts ? Date.parse(ts[1]) : NaN });
    }
    const last = attempts.slice(-threshold);
    if (last.length < threshold || last.some((a) => a.outcome === "success")) {
      console.log("closed");
      process.exit(0);
    }
    const lastTime = last[last.length - 1].time;
    if (!Number.isFinite(lastTime)) { console.log("half_open"); process.exit(0); }
    const remainingMs = lastTime + cooldownMs - Date.now();
    console.log(remainingMs > 0 ? "open " + Math.ceil(remainingMs / 1000) : "half_open");
  ' "$LOCAL_MODEL_LOG_FILE" "$LOCAL_MODEL_BREAKER_THRESHOLD" "$LOCAL_MODEL_BREAKER_COOLDOWN"
}

# Biztonsagi figyelmezetes (COCALC-387): a LOCAL_MODEL_ENDPOINT csak string-mintaval,
# NEM teljes URL-parszolassal van ellenorizve -- ez eleg egy LATHATO FIGYELMEZTETESHEZ,
# nem hard biztonsagi hatar. A hivast NEM blokkolja, csak jelez -- a felhasznalo tudatosan
# is beallithat tavoli vegpontot. Dry-run alatt is lefut, hogy self-check-kel tesztelheto
# legyen.
warn_if_not_loopback() {
  # COCALC-387 code review (nitpick): a `case` alapertelmezetten case-sensitive -- egy
  # "LOCALHOST"/"HTTP://" irasmodu vegpont hamis (nem-loopback) figyelmeztetest kapna.
  # Kisbetusitjuk az osszehasonlitas elott (POSIX sh, tr -- nem bash-izmus).
  endpoint_lower="$(printf '%s' "$LOCAL_MODEL_ENDPOINT" | tr '[:upper:]' '[:lower:]')"
  case "$endpoint_lower" in
    *://localhost*|*://127.*|*'://[::1]'*|*://0.0.0.0*)
      ;;
    *)
      echo "FIGYELEM: a LOCAL_MODEL_ENDPOINT (\"$LOCAL_MODEL_ENDPOINT\") nem loopback cimre mutat (localhost/127.*/[::1]/0.0.0.0) -- a helyi modell hivasa egy nem-lokalis vegpont fele indul." >&2
      ;;
  esac
}

detect_dialect() {
  if [ "$LOCAL_MODEL_DIALECT" != "auto" ]; then
    echo "$LOCAL_MODEL_DIALECT"
    return 0
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "ollama"
    return 0
  fi
  if curl --silent --show-error --fail --max-time "$LOCAL_MODEL_TIMEOUT" \
      "$LOCAL_MODEL_ENDPOINT/api/tags" >/dev/null 2>&1; then
    echo "ollama"
  else
    echo "openai"
  fi
}

health_check() {
  local dialect="$1"
  if [ "$DRY_RUN" -eq 1 ]; then
    [ "$LOCAL_MODEL_DRY_RUN_HEALTH" = "ok" ]
    return $?
  fi
  local probe_path="/api/tags"
  [ "$dialect" = "openai" ] && probe_path="/v1/models"
  curl --silent --show-error --fail --max-time "$LOCAL_MODEL_TIMEOUT" \
    "$LOCAL_MODEL_ENDPOINT$probe_path" >/dev/null 2>&1
}

# A modell válaszának szövege a $TMP_DIR/response.txt fájlba kerül (nem stdout-ra), a
# kérés-törzs a $TMP_DIR/body.json-ból megy -- lásd a fájl tetején a "fájlon keresztül" megjegyzést.
call_model() {
  local dialect="$1"
  local response_file="$TMP_DIR/response.txt"
  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -n "$LOCAL_MODEL_DRY_RUN_RESPONSE_FILE" ] && [ -f "$LOCAL_MODEL_DRY_RUN_RESPONSE_FILE" ]; then
      cp "$LOCAL_MODEL_DRY_RUN_RESPONSE_FILE" "$response_file"
    else
      printf '{"status":"ok","details":{"message":"dry-run valasz","model":"%s"}}\n' "$LOCAL_MODEL_NAME" > "$response_file"
    fi
    return 0
  fi
  local url content_field
  if [ "$dialect" = "ollama" ]; then
    url="$LOCAL_MODEL_ENDPOINT/api/chat"
    content_field="message.content"
  else
    url="$LOCAL_MODEL_ENDPOINT/v1/chat/completions"
    content_field="choices.0.message.content"
  fi
  node -e '
    const fs = require("fs");
    const [promptFile, bodyFile, model, dialect, think, numCtx, format] = process.argv.slice(1);
    const prompt = fs.readFileSync(promptFile, "utf8");
    const body = { model, messages: [{ role: "user", content: prompt }] };
    if (dialect === "ollama") {
      body.stream = false;
      if (think === "off") body.think = false;
      if (think === "on") body.think = true;
      if (numCtx) body.options = { num_ctx: Number(numCtx) };
      if (format === "json") body.format = "json";
    }
    fs.writeFileSync(bodyFile, JSON.stringify(body));
  ' "$TMP_NODE/prompt.txt" "$TMP_NODE/body.json" "$LOCAL_MODEL_NAME" "$dialect" "$LOCAL_MODEL_THINK" "$LOCAL_MODEL_NUM_CTX" "$LOCAL_MODEL_FORMAT" || return 1
  curl --silent --show-error --fail --max-time "$LOCAL_MODEL_TIMEOUT" \
    -H 'Content-Type: application/json' --data-binary "@$TMP_NODE/body.json" \
    -o "$TMP_NODE/raw.json" "$url" || return 1
  node -e '
    const fs = require("fs");
    const response = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const field = process.argv[1];
    const value = field.split(".").reduce((o, k) => (o == null ? undefined : o[k]), response);
    if (typeof value !== "string") { process.exitCode = 1; process.stderr.write("HIBA: nem talalhato a vart tartalom-mezo a valaszban\n"); process.exit(1); }
    fs.writeFileSync(process.argv[3], value);
  ' "$content_field" "$TMP_NODE/raw.json" "$TMP_NODE/response.txt"
}

validate_response() {
  local schema_file="$1" response_file="$2"
  node -e '
    const fs = require("fs");
    const path = require("path");
    // Pontozott útvonal -> az összes érték listája. A "[]"-re végződő szegmens a tömb minden
    // elemén végigmegy ("findings[].path"); a nem-tömb szegmens a szokásos mezőhozzáférés.
    function getAll(obj, dotted) {
      let cur = [obj];
      for (const seg of dotted.split(".")) {
        const isArr = seg.endsWith("[]");
        const key = isArr ? seg.slice(0, -2) : seg;
        const next = [];
        for (const o of cur) {
          const v = o == null ? undefined : o[key];
          if (isArr) { if (Array.isArray(v)) next.push(...v); }
          else if (v !== undefined) next.push(v);
        }
        cur = next;
      }
      return cur;
    }
    const schemaPath = process.argv[1];
    const repoRoot = process.argv[2];
    const responseText = fs.readFileSync(process.argv[3], "utf8");
    const errors = [];
    let response;
    try {
      response = JSON.parse(responseText);
    } catch (e) {
      console.log(JSON.stringify({ valid: false, errors: ["a valasz nem ervenyes JSON: " + e.message] }));
      process.exit(0);
    }
    let schema;
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    } catch (e) {
      console.log(JSON.stringify({ valid: false, errors: ["a sema-fajl nem ervenyes JSON: " + e.message] }));
      process.exit(0);
    }
    for (const key of (schema.required || [])) {
      if (!(key in response)) errors.push("hianyzo kotelezo mezo: " + key);
    }
    for (const [key, def] of Object.entries(schema.properties || {})) {
      if (!(key in response)) continue;
      const val = response[key];
      const actual = Array.isArray(val) ? "array" : typeof val;
      if (def.type && actual !== def.type) {
        errors.push("tipushiba a(z) \x27" + key + "\x27 mezonel: vart " + def.type + ", kapott " + actual);
      }
    }
    // COCALC-387: kotelezo utvonal-biztonsagi ellenorzes -- abszolut utvonal, vagy
    // normalizalas utan a repo gyokeren kivulre mutato relativ utvonal (path traversal,
    // pl. "../../etc/passwd") MINDIG elutasitva, a celfajl letezesetol fuggetlenul.
    // Visszaadja a hiba-uzenetet, vagy null-t, ha az utvonal lexikailag biztonsagos.
    const repoRootResolved = path.resolve(repoRoot);
    function lexicalPathSafetyError(v, fieldPath) {
      if (path.isAbsolute(v)) {
        return "abszolut fajlutvonal nem engedelyezett: " + fieldPath + " -> " + v;
      }
      const resolved = path.resolve(repoRootResolved, v);
      if (resolved !== repoRootResolved && !(resolved + path.sep).startsWith(repoRootResolved + path.sep)) {
        return "a hivatkozott fajlutvonal a repo gyokeren kivulre mutat: " + fieldPath + " -> " + v;
      }
      return null;
    }
    // COCALC-387 code review (major, biztonsag): a fenti CSAK lexikai (path.resolve)
    // ellenorzes egy repon beluli, repon KIVULRE mutato szimbolikus linkkel
    // megkerulheto lenne (a lexikai utvonal a repon belul marad, de a valodi, a
    // fajlrendszer altal feloldott celpont mar nem). Ezert a repo-gyoker VALODI
    // (szimbolikus linkektol mentes) utvonalahoz hasonlitunk `fs.realpathSync`-kal.
    let repoRootReal;
    try {
      repoRootReal = fs.realpathSync(repoRootResolved);
    } catch (e) {
      repoRootReal = repoRootResolved;
    }
    function isWithinRepoReal(candidateReal) {
      return candidateReal === repoRootReal || (candidateReal + path.sep).startsWith(repoRootReal + path.sep);
    }
    // Letezo fajlra: a TELJES utvonal valodi (symlink-feloldott) celpontjat nezzuk.
    function existingPathSafetyError(v, fieldPath, resolved) {
      let real;
      try {
        real = fs.realpathSync(resolved);
      } catch (e) {
        return "nem sikerult feloldani a fajl valodi (symlink-mentes) utvonalat: " + fieldPath + " -> " + v;
      }
      if (!isWithinRepoReal(real)) {
        return "szimbolikus link miatt a hivatkozott fajlutvonal a repo gyokeren kivulre mutat: " + fieldPath + " -> " + v;
      }
      return null;
    }
    // Meg nem letezo (irando) fajlra: a legmelyebb LETEZO szulo-konyvtarig
    // kanonikalizalunk -- ha az egy repon-kivulre mutato symlink, az alatta irt fajl is
    // ott landolna a fajlrendszeren, meg ha a lexikai utvonal repon-beluli is.
    function writePathSafetyError(v, fieldPath, resolved) {
      let ancestor = resolved;
      while (!fs.existsSync(ancestor)) {
        const parent = path.dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
      }
      let realAncestor;
      try {
        realAncestor = fs.realpathSync(ancestor);
      } catch (e) {
        return "nem sikerult feloldani az irando fajlutvonal legkozelebbi letezo szulojenek valodi utvonalat: " + fieldPath + " -> " + v;
      }
      const relFromAncestor = path.relative(ancestor, resolved);
      const finalReal = relFromAncestor ? path.join(realAncestor, relFromAncestor) : realAncestor;
      if (!isWithinRepoReal(finalReal)) {
        return "szimbolikus link miatt az irando fajlutvonal a repo gyokeren kivulre mutatna: " + fieldPath + " -> " + v;
      }
      return null;
    }
    for (const fieldPath of (schema["x-file-path-fields"] || [])) {
      const values = getAll(response, fieldPath).flatMap((v) => (Array.isArray(v) ? v : [v]));
      for (const v of values) {
        if (typeof v !== "string") { errors.push("fajlutvonal mezo nem string: " + fieldPath); continue; }
        const lexError = lexicalPathSafetyError(v, fieldPath);
        if (lexError) { errors.push(lexError); continue; }
        const resolved = path.resolve(repoRootResolved, v);
        if (!fs.existsSync(resolved)) { errors.push("hivatkozott fajl nem letezik: " + fieldPath + " -> " + v); continue; }
        const realError = existingPathSafetyError(v, fieldPath, resolved);
        if (realError) errors.push(realError);
      }
    }
    // COCALC-387: ugyanaz az utvonal-biztonsagi ellenorzes, de LETEZES NELKUL -- irando,
    // meg nem letezo fajlok utvonalanak jelolesere.
    for (const fieldPath of (schema["x-file-write-path-fields"] || [])) {
      const values = getAll(response, fieldPath).flatMap((v) => (Array.isArray(v) ? v : [v]));
      for (const v of values) {
        if (typeof v !== "string") { errors.push("irando fajlutvonal mezo nem string: " + fieldPath); continue; }
        const lexError = lexicalPathSafetyError(v, fieldPath);
        if (lexError) { errors.push(lexError); continue; }
        const resolved = path.resolve(repoRootResolved, v);
        const realError = writePathSafetyError(v, fieldPath, resolved);
        if (realError) errors.push(realError);
      }
    }
    console.log(JSON.stringify({ valid: errors.length === 0, errors }));
  ' "$schema_file" "$REPO_ROOT" "$response_file"
}

attempt_once() {
  local dialect="$1"
  if ! health_check "$dialect"; then
    return 2
  fi
  if ! call_model "$dialect"; then
    return 2
  fi
  local validation validation_valid
  validation="$(validate_response "$SCHEMA_FILE" "$TMP_NODE/response.txt")"
  validation_valid="$(node -e 'const v = JSON.parse(process.argv[1]); process.stdout.write(v.valid ? "true" : "false")' "$validation")"
  if [ "$validation_valid" = "true" ]; then
    return 0
  fi
  LAST_VALIDATION_ERRORS="$validation"
  return 1
}

warn_if_not_loopback

DIALECT="$(detect_dialect)"

BREAKER_STATE="$(breaker_state)"
case "$BREAKER_STATE" in
  open\ *)
    echo "HIBA: circuit breaker nyitva ($LOCAL_MODEL_BREAKER_THRESHOLD egymást követő sikertelen kísérlet a naplóban; próbahívás ${BREAKER_STATE#open } mp múlva, LOCAL_MODEL_BREAKER_COOLDOWN=$LOCAL_MODEL_BREAKER_COOLDOWN) — a helyi modell hívása kihagyva." >&2
    log_line "breaker_open" 2 0 "$DIALECT"
    exit 2
    ;;
  half_open)
    echo "INFO: circuit breaker félig nyitott (letelt a LOCAL_MODEL_BREAKER_COOLDOWN=$LOCAL_MODEL_BREAKER_COOLDOWN mp) — próbahívás a helyi modellel; siker zárja, hiba újranyitja." >&2
    ;;
esac

LAST_RESPONSE=""
LAST_VALIDATION_ERRORS=""
ATTEMPT=1
MAX_ATTEMPTS=1
[ "$LOCAL_MODEL_FALLBACK_POLICY" = "retry-then-fallback" ] && MAX_ATTEMPTS=$((1 + LOCAL_MODEL_MAX_RETRIES))

RESULT=""
while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
  set +e
  attempt_once "$DIALECT"
  RC=$?
  set -e
  if [ "$RC" -eq 0 ]; then
    RESULT="success"
    log_line "success" 0 "$ATTEMPT" "$DIALECT"
    break
  elif [ "$RC" -eq 1 ]; then
    RESULT="validation_failed"
    log_line "validation_failed" 1 "$ATTEMPT" "$DIALECT"
    break
  else
    RESULT="hard_error"
    log_line "hard_error" 2 "$ATTEMPT" "$DIALECT"
    if [ "$LOCAL_MODEL_FALLBACK_POLICY" != "retry-then-fallback" ]; then
      break
    fi
  fi
  ATTEMPT=$((ATTEMPT + 1))
done

case "$RESULT" in
  success)
    cat "$TMP_DIR/response.txt"
    printf '\n'
    exit 0
    ;;
  validation_failed)
    echo "VALIDÁCIÓS HIBA: a helyi modell válasza nem illeszkedik a megadott sémára." >&2
    echo "$LAST_VALIDATION_ERRORS" >&2
    if [ "$LOCAL_MODEL_FALLBACK_POLICY" = "fail-loud" ]; then
      exit 2
    fi
    exit 1
    ;;
  hard_error)
    echo "KEMÉNY HIBA: health check vagy hálózati hiba a helyi modell hívása közben (endpoint: $LOCAL_MODEL_ENDPOINT)." >&2
    exit 2
    ;;
esac
