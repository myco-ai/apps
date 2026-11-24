#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sha=${GITHUB_SHA:-$(git rev-parse HEAD)}
tag="apps-${sha}"
repo=${GITHUB_REPOSITORY:-myco-ai/apps}
files=(dist/apps/apps.zip dist/apps/builtin.zip dist/apps/app-locales.json dist/apps/builtin.json dist/apps/SHA256SUMS)
(cd dist/apps && sha256sum --check SHA256SUMS)
notes="Official myco apps from ${sha}. The apps tag is a rolling catalog; ${tag} is immutable."
# An existing version must contain the same bytes. Never overwrite a pinned asset.
if gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
  temp=$(mktemp -d)
  trap 'rm -rf "$temp"' EXIT
  gh release download "$tag" --repo "$repo" --pattern SHA256SUMS --dir "$temp"
  cmp "$temp/SHA256SUMS" dist/apps/SHA256SUMS
else
  gh release create "$tag" "${files[@]}" --repo "$repo" --target "$sha" --title "$tag" --notes "$notes" --prerelease --latest=false
fi
if gh release view apps --repo "$repo" >/dev/null 2>&1; then
  # Upload the archive before its checksum, as old Hubs already expect.
  gh release upload apps "${files[@]:0:4}" --repo "$repo" --clobber
  gh release upload apps dist/apps/SHA256SUMS --repo "$repo" --clobber
  gh release edit apps --repo "$repo" --notes "$notes" --prerelease --latest=false
else
  gh release create apps "${files[@]}" --repo "$repo" --target "$sha" --title 'Official myco apps' --notes "$notes" --prerelease --latest=false
fi
