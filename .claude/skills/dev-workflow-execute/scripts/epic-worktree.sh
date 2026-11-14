#!/usr/bin/env bash
# dev-workflow-execute — E-ág (epic-mód, E4/E6) worktree-kezelése (4.23.4).
# Lásd epic-mode.md és dev-workflow/config.md "Epic-mód (E-ág)".
#
# Használat (a fő munkafából vagy bármelyik worktree-ből):
#   bash epic-worktree.sh add <slot> <branch-név> [alap-branch]   # alap: master
#   bash epic-worktree.sh remove <slot> [--force]
#   bash epic-worktree.sh path <slot>
#
# add:    friss origin/<alap>-ról új branchet és worktree-t hoz létre a
#         <EPIC_WORKTREE_ROOT>/<repó>-wt<slot> mappában, bemásolja a fő munkafa .env-jét,
#         és lefuttatja az EPIC_WORKTREE_SETUP_CMD parancsot (ha be van állítva). Kimenet (stdout): a worktree abszolút útvonala.
#         EPIC_PARALLEL_MODE=isolated esetén a .env portjait slotonként eltolja
#         (EPIC_ISOLATED_PORTS, EPIC_PORT_STEP), és saját COMPOSE_PROJECT_NAME-et ír bele,
#         így a worktree saját DB-/Mailpit-konténereket és API-/Vite-portot kap.
# remove: a worktree-t és a helyi branchet törli. Nem commitolt változásnál --force nélkül
#         megáll. A helyi branchet csak akkor törli, ha az már benne van az origin/<alap>-ban
#         (mergelt). Isolated slotnál a slot saját compose-projektjét is leállítja
#         (docker compose down -v — csak a "<repó>-wt<slot>" nevű projektet).
#
# Kilépőkódok: 0 siker; 1 használati/környezeti hiba; 2 a slot foglalt vagy a worktree
# nem tiszta.
set -euo pipefail

usage() {
  sed -n '5,8p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 1
}

[ "$#" -ge 2 ] || usage
CMD="$1"
SLOT="$2"
case "$SLOT" in ''|*[!0-9]*|0) echo "HIBA: a slot pozitív egész: $SLOT" >&2; exit 1 ;; esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CFG="$SCRIPT_DIR/../../dev-workflow/scripts/config-value.sh"
cfg() { bash "$CFG" "$1" "$2"; }

COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(dirname "$COMMON_DIR")"
REPO_NAME="$(basename "$MAIN_ROOT")"
ROOT_SETTING="$(cfg EPIC_WORKTREE_ROOT ..)"
case "$ROOT_SETTING" in
  /*|[A-Za-z]:*) WT_ROOT="$ROOT_SETTING" ;;
  *) WT_ROOT="$MAIN_ROOT/$ROOT_SETTING" ;;
esac
WT_PATH="$(cd "$WT_ROOT" && pwd)/$REPO_NAME-wt$SLOT"
PROJECT_NAME="$REPO_NAME-wt$SLOT"

MODE="$(cfg EPIC_PARALLEL_MODE parallel)"
case "$MODE" in
  serial|parallel|isolated) ;;
  *) echo "FIGYELEM: EPIC_PARALLEL_MODE='$MODE' ismeretlen — visszaesés: parallel." >&2; MODE=parallel ;;
esac

isolate_env() {  # $1: a worktree .env-je
  local env_file="$1" step ports pair name port new
  step="$(cfg EPIC_PORT_STEP 10)"
  case "$step" in ''|*[!0-9]*) echo "FIGYELEM: EPIC_PORT_STEP érvénytelen — visszaesés: 10." >&2; step=10 ;; esac
  ports="$(cfg EPIC_ISOLATED_PORTS -)"
  if [ -z "$ports" ] || [ "$ports" = "-" ]; then
    echo "HIBA: EPIC_PARALLEL_MODE=isolated, de az EPIC_ISOLATED_PORTS nincs beállítva (config.md \"Epic-mód\")." >&2
    exit 1
  fi
  {
    echo ""
    echo "# --- epic-worktree.sh (isolated, slot $SLOT): a fenti portok +$((SLOT * step)) eltolással ---"
    echo "COMPOSE_PROJECT_NAME=$PROJECT_NAME"
  } >>"$env_file"
  for pair in $ports; do
    name="${pair%%=*}"
    port="${pair#*=}"
    case "$port" in ''|*[!0-9]*) echo "HIBA: EPIC_ISOLATED_PORTS hibás eleme: $pair" >&2; exit 1 ;; esac
    new=$((port + SLOT * step))
    # Csak ':<port>' és '=<port>' alakú, számjeggyel nem folytatódó előfordulást cserél
    # (URL-ek, PORT=..., APP_ORIGIN=...), más számot nem.
    sed -i -E "s/([:=])$port([^0-9]|\$)/\\1$new\\2/g" "$env_file"
    echo "$name=$new" >>"$env_file"
  done
}

case "$CMD" in
  add)
    [ "$#" -ge 3 ] || usage
    BRANCH="$3"
    BASE="${4:-master}"
    if [ -e "$WT_PATH" ]; then
      echo "HIBA: a $SLOT. slot foglalt: $WT_PATH létezik (előbb: epic-worktree.sh remove $SLOT)." >&2
      exit 2
    fi
    git fetch --quiet origin "$BASE"
    git worktree add --quiet --no-track -b "$BRANCH" "$WT_PATH" "origin/$BASE" >&2
    if [ -f "$MAIN_ROOT/.env" ]; then
      cp "$MAIN_ROOT/.env" "$WT_PATH/.env"
    elif [ -f "$WT_PATH/.env.example" ]; then
      cp "$WT_PATH/.env.example" "$WT_PATH/.env"
      echo "FIGYELEM: a fő munkafában nincs .env — a worktree az .env.example-ből kapta." >&2
    fi
    if [ "$MODE" = isolated ] && [ -f "$WT_PATH/.env" ]; then
      isolate_env "$WT_PATH/.env"
    fi
    SETUP_CMD="$(cfg EPIC_WORKTREE_SETUP_CMD '')"
    if [ -n "$SETUP_CMD" ] && [ "$SETUP_CMD" != "-" ] && [ "${EPIC_SKIP_INSTALL:-}" != 1 ]; then
      (cd "$WT_PATH" && sh -c "$SETUP_CMD" >&2)
    fi
    echo "$WT_PATH"
    ;;
  remove)
    FORCE="${3:-}"
    if [ ! -e "$WT_PATH" ]; then
      echo "A $SLOT. slot már üres ($WT_PATH nem létezik)." >&2
      exit 0
    fi
    if [ "$FORCE" != "--force" ] && [ -n "$(git -C "$WT_PATH" status --porcelain --untracked-files=no)" ]; then
      echo "HIBA: a $WT_PATH worktree-ben nem commitolt változás van — nem törlöm (--force felülírja)." >&2
      exit 2
    fi
    BRANCH="$(git -C "$WT_PATH" rev-parse --abbrev-ref HEAD)"
    BASE="$(cfg EPIC_BASE_BRANCH master)"
    if grep -q "^COMPOSE_PROJECT_NAME=$PROJECT_NAME\$" "$WT_PATH/.env" 2>/dev/null && command -v docker >/dev/null 2>&1; then
      (cd "$WT_PATH" && docker compose -p "$PROJECT_NAME" down -v >&2) ||
        echo "FIGYELEM: a $PROJECT_NAME compose-projekt leállítása nem sikerült — kézzel: docker compose -p $PROJECT_NAME down -v" >&2
    fi
    git worktree remove --force "$WT_PATH"
    git fetch --quiet origin "$BASE" || true
    if git merge-base --is-ancestor "$BRANCH" "origin/$BASE" 2>/dev/null; then
      git branch -D "$BRANCH" >&2
    else
      echo "A(z) $BRANCH branch nincs benne az origin/$BASE-ben — a helyi branch megmarad." >&2
    fi
    ;;
  path)
    echo "$WT_PATH"
    ;;
  *)
    usage
    ;;
esac
