#!/usr/bin/env bash
# AI-identitású commit — a szerzőt/committer-t a dev-workflow/config.md "AI-identitás"
# szekciójában rögzített értékekre állítja, kizárólag erre az egy git commit hívásra
# (env-override, nem nyúl a repó- vagy globális git confighoz). A staging (git add) a
# hívó fél felelőssége, ez a szkript nem futtat git add-ot.
#
# Használat: bash commit-as-ai.sh -m "<commit üzenet>"   (minden git commit flag átmegy)
#
# Ha a config.md "AI-identitás" táblázatában az AI_GIT_NAME/AI_GIT_EMAIL érték változik,
# itt is frissítsd.
set -euo pipefail

AI_NAME="tfss_ai"
AI_EMAIL="thefirstsmoothstone@gmail.com"

GIT_AUTHOR_NAME="$AI_NAME" GIT_AUTHOR_EMAIL="$AI_EMAIL" \
GIT_COMMITTER_NAME="$AI_NAME" GIT_COMMITTER_EMAIL="$AI_EMAIL" \
git commit "$@"
