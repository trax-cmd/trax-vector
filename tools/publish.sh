#!/usr/bin/env bash
# publish.sh — the house IS its Pages site: what is on main is what is live. Publish = push main.
#   bash tools/publish.sh
set -e
cd "$(dirname "$0")/.."
export PATH="$PATH:/c/Program Files/GitHub CLI"
git push origin main
echo "PUBLISHED $(git log --oneline | head -1 | cut -c1-72) — https://trax-cmd.github.io/trax-vector/  (the site rebuilds in about a minute)"
