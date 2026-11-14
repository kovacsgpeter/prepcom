#!/usr/bin/env bash
# AI-identitású commit. Csak erre az egy git commit hívásra állítja be a szerzőt és
# committert; nem módosítja a repó- vagy globális git konfigurációt.
# A repo .gitattributes szabálya ezt a szkriptet Windows checkoutnál is LF-en tartja.
set -euo pipefail

AI_NAME="tfss_ai"
AI_EMAIL="thefirstsmoothstone@gmail.com"

GIT_AUTHOR_NAME="$AI_NAME" GIT_AUTHOR_EMAIL="$AI_EMAIL" \
GIT_COMMITTER_NAME="$AI_NAME" GIT_COMMITTER_EMAIL="$AI_EMAIL" \
git commit "$@"
