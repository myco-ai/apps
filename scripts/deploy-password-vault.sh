#!/usr/bin/env bash
# Publish only browser assets to the already configured vault.myco.ing origin.
set -euo pipefail
cd "$(dirname "$0")/.."
host=${VAULT_DEPLOY_SSH:-root@193.46.198.17}
root=/srv/myco-password-vault
from=dist/official/password-vault
test -f "$from/index.html"
release="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)-$(openssl rand -hex 3)"
ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10)
stage="$root/releases/$release"
ssh "${ssh_options[@]}" "$host" "install -d -m 755 '$root/releases' && mkdir -m 755 '$stage'"
rsync -rlt --chmod=D755,F644 -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10' \
  "$from/index.html" "$from/assets" "$host:$stage/"
ssh "${ssh_options[@]}" "$host" bash -s -- "$root" "$release" <<'REMOTE'
set -euo pipefail
root=$1
release=$2
exec 9>"$root/.publish.lock"
flock 9
test -s "$root/releases/$release/index.html"
if [[ -L "$root/current" ]]; then
  ln -s "$(readlink "$root/current")" "$root/previous.$release"
  mv -Tf "$root/previous.$release" "$root/previous"
fi
ln -s "releases/$release" "$root/current.$release"
mv -Tf "$root/current.$release" "$root/current"
REMOTE
echo "Published $release"
