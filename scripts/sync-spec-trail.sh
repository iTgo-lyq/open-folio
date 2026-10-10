#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: sync-spec-trail.sh <source-repository> <distribution-repository>" >&2
  exit 1
fi

source_root=$(realpath -- "$1")
distribution_root=$(realpath -- "$2")
source_commit=$(git -C "$source_root" rev-parse HEAD)

if [[ -n $(git -C "$distribution_root" status --porcelain) ]]; then
  echo "Distribution checkout must be clean before synchronizing." >&2
  exit 1
fi
if [[ $(git -C "$distribution_root" branch --show-current) != main ]]; then
  echo "Distribution checkout must be on main." >&2
  exit 1
fi

skill_export=$(mktemp -d)
trap 'rm -rf -- "$skill_export"' EXIT
# Export the commit, so local edits and untracked files cannot be published.
git -C "$source_root" archive "$source_commit:.agents/skills/spec-trail" |
  tar -x -C "$skill_export"
mkdir -p "$distribution_root/skills/spec-trail"
rsync -a --delete --exclude=/LICENSE \
  "$skill_export/" "$distribution_root/skills/spec-trail/"

if [[ -z $(git -C "$distribution_root" status --porcelain -- skills/spec-trail) ]]; then
  echo "SpecTrail already matches open-folio $source_commit."
  exit 0
fi

(
  cd "$distribution_root"
  node --test skills/spec-trail/setup/tests/setup.test.mjs
)
git -C "$distribution_root" add --all -- skills/spec-trail
git -C "$distribution_root" config user.name 'github-actions[bot]'
git -C "$distribution_root" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git -C "$distribution_root" commit \
  -m "Sync SpecTrail from open-folio ${source_commit:0:12}" \
  -m "Source: https://github.com/iTgo-lyq/open-folio/commit/$source_commit"
git -C "$distribution_root" push origin HEAD:main
