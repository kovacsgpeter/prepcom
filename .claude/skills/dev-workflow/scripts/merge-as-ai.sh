#!/usr/bin/env bash
# AI-identitású MR-merge az epic-mód (E-ág, E6) merge-sorához (4.23.4).
# A glab-hívás a glab-note-as-ai.sh-n át megy (GITLAB_TOKEN_AI, 429 esetén újrapróbálás),
# tehát a merge is a tfss_ai user alatt jelenik meg. Lásd dev-workflow-execute/epic-mode.md
# és dev-workflow/config.md "Epic-mód (repó-lokális, E-ág)".
#
# Csak akkor mergel, ha MINDEN igaz:
#   - az MR nyitott, nem draft, és nincs merge-ütközése;
#   - az MR forrásbranchének HEAD-je pontosan a megadott <várt-SHA>;
#   - az MR head-pipeline-ja erre a SHA-ra futott, és "success".
# A merge-kérés is a <várt-SHA>-hoz kötött (GitLab "sha" paraméter): ha közben új push
# érkezett, a GitLab elutasítja. A projektben nincs "only allow merge if pipeline
# succeeds" beállítás, ezért ez a szkript a kapu.
#
# Használat: bash merge-as-ai.sh <MR-iid> <várt-SHA>
# Kilépőkódok:
#   0 — mergelve (stdout: a merge-commit SHA-ja)
#   2 — előfeltétel nem teljesül (nem zöld / más SHA / draft / ütközés / nem nyitott);
#       nem történt merge
#   1 — egyéb hiba (hitelesítés, API, parse)
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Használat: merge-as-ai.sh <MR-iid> <várt-SHA>" >&2
  exit 1
fi

IID="$1"
EXPECTED_SHA="$2"
case "$IID" in ''|*[!0-9]*) echo "HIBA: az MR-iid nem szám: $IID" >&2; exit 1 ;; esac
case "$EXPECTED_SHA" in
  *[!0-9a-f]*|'') echo "HIBA: a várt SHA nem teljes, kisbetűs hex: $EXPECTED_SHA" >&2; exit 1 ;;
esac
[ "${#EXPECTED_SHA}" -eq 40 ] || { echo "HIBA: a várt SHA nem 40 karakteres: $EXPECTED_SHA" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLAB_AI="$SCRIPT_DIR/glab-note-as-ai.sh"

REMOVE_SOURCE="$(bash "$SCRIPT_DIR/config-value.sh" EPIC_MERGE_REMOVE_SOURCE_BRANCH true)"
case "$REMOVE_SOURCE" in
  true|false) ;;
  *) echo "FIGYELEM: EPIC_MERGE_REMOVE_SOURCE_BRANCH értéke érvénytelen — visszaesés: true." >&2; REMOVE_SOURCE=true ;;
esac

MR_JSON="$(bash "$GLAB_AI" api "projects/:id/merge_requests/$IID")" || {
  echo "HIBA: az MR (!$IID) nem olvasható be." >&2
  exit 1
}

# A gépen nincs jq; a node a repó előfeltétele.
CHECK="$(printf '%s' "$MR_JSON" | EXPECTED_SHA="$EXPECTED_SHA" node -e '
let s = "";
process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  let mr;
  try { mr = JSON.parse(s); } catch { console.log("ERR az MR-válasz nem JSON"); return; }
  const want = process.env.EXPECTED_SHA;
  const hp = mr.head_pipeline || {};
  const fail = (m) => console.log("NO " + m);
  if (mr.state !== "opened") return fail(`az MR állapota "${mr.state}", nem "opened"`);
  if (mr.draft || mr.work_in_progress) return fail("az MR draft");
  if (mr.has_conflicts) return fail("az MR-nek merge-ütközése van");
  if (mr.sha !== want) return fail(`az MR HEAD-je ${mr.sha}, nem a várt ${want}`);
  if (!hp.id) return fail("az MR-nek nincs head-pipeline-ja");
  if (hp.sha !== want) return fail(`a head-pipeline (#${hp.id}) a ${hp.sha} SHA-ra fut, nem a várt ${want}-ra`);
  if (hp.status !== "success") return fail(`a head-pipeline (#${hp.id}) állapota "${hp.status}", nem "success"`);
  console.log("OK " + hp.id);
});
')"

case "$CHECK" in
  OK\ *) ;;
  NO\ *) echo "NEM MERGELEK (!$IID): ${CHECK#NO }" >&2; exit 2 ;;
  *) echo "HIBA (!$IID): ${CHECK#ERR }" >&2; exit 1 ;;
esac

MERGE_JSON="$(bash "$GLAB_AI" api --method PUT "projects/:id/merge_requests/$IID/merge" \
  -f "sha=$EXPECTED_SHA" -f "should_remove_source_branch=$REMOVE_SOURCE")" || {
  echo "HIBA: a merge-kérést a GitLab elutasította (!$IID) — lásd fent (pl. 405/406: nem mergelhető, 409: SHA-eltérés)." >&2
  exit 2
}

printf '%s' "$MERGE_JSON" | node -e '
let s = "";
process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  const mr = JSON.parse(s);
  if (mr.state !== "merged") { console.error(`HIBA: a merge után az MR állapota "${mr.state}"`); process.exit(1); }
  console.log(mr.merge_commit_sha || mr.squash_commit_sha || mr.sha);
});
'
