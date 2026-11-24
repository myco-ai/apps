# Migration from the main repository

## Phase 1

The source snapshot and original-to-filtered commit mapping are recorded in `migration.json` and `history-map.txt`. Only app sources, the pack script and apps workflow were selected from history; generated main-repository app output is not imported. Source paths remain `templates/` to preserve familiar navigation.

This repository is the sole source for future app development. During phase 1 the main repository retained its source and embedded bundle so existing builds worked unchanged. Its original publisher was retired only after this repository published and the scheduled legacy mirror served the same verified bytes. Phase 2 replaces those retained copies with locked artifact preparation.

Main's scheduled mirror downloads public assets without a cross-repository credential, verifies SHA256 and uploads the same bytes with its own repository-scoped token. Failed checks leave the previous release untouched. Mirroring must remain enabled for at least 90 days after cutover and two stable main releases; stopping requires a deliberate maintenance decision. Do not delete the old release or reuse the previous repository name in a way that breaks redirects.

All successful builds publish both an immutable `apps-<full SHA>` prerelease and the rolling `apps` catalog. Builds locked by the main program must use the immutable tag and committed expected SHA256, never rolling `apps`. Per-app manifest versions continue independently of bundle tags.

## Host compatibility

`host.lock.json` pins the actual myco host used for bridge, CSP, file dispatcher and manifest/schema tests. Unit tests run without a host checkout. UI tests use the real bridge from that checkout; pass `MYCO_HOST_ROOT` to test a proposed host change before advancing the lock. Host-side integration runners remain in `templates/` and consume isolated real-Hub fixtures on stdin, never real user credentials.

Apps use advertised features and the manifest's minimum Hub version. New bridge capabilities must be implemented and accepted separately on desktop, iOS and Android; absent features retain a fallback or show an update requirement. A host bridge change requires a linked apps SDK/contract change, and vice versa.

App-owned localized sidecars generate `templates/localization/app-locales.json`; this metadata ships with each immutable release for main's older-Hub UI fallback. Updating an app alone does not require rebuilding the main web dashboard.

## Phase 2: locked host builds

The host keeps `apps.lock.json`: repository, immutable `apps-<full SHA>` tag,
source commit, builtin membership and expected SHA256 for `builtin.zip`,
`builtin.json`, `app-locales.json` and `apps.zip`. Its `make build`, `make cross`
and `make app` run Python 3 preparation, verify exact bytes and generate ignored
embed files. The checksum-keyed cache supports offline builds; empty or invalid
caches fail. A pin update is reviewed separately from a host version release.

Main no longer tracks `templates/`, `internal/templates/official` or its production
ZIP. Ordinary Go tests load tiny explicit fixtures without Node or network.
The host's `app-contract` CI checks out this repository at the locked commit,
unpacks the exact released apps and tests real Hub/native adapters with
`APPS_TEST_ROOT`. SDK/browser tests here still use `host.lock.json` or an explicit
`MYCO_HOST_ROOT`; keep capability detection and per-platform acceptance.

Read the [host build instructions](https://github.com/myco-ai/myco/blob/main/docs/building.md)
for pin changes, local artifacts, offline preparation and embedded-pack rollback.
The host release agent follows `myco-release`; app agents never bump its VERSION.
Runtime daily catalog refreshes still use rolling `apps`, independently of the
build lock, and the main compatibility mirror remains active for older Hubs.
