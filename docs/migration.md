# Migration from the main repository

## Phase 1

The source snapshot and original-to-filtered commit mapping are recorded in `migration.json` and `history-map.txt`. Only app sources, the pack script and apps workflow were selected from history; generated main-repository app output is not imported. Source paths remain `templates/` to preserve familiar navigation.

This repository is the sole source for future app development. The main repository temporarily retains its source and embedded bundle so existing builds and releases work unchanged. Its original build/publish workflow is retired only after the new apps release and the scheduled legacy mirror are verified.

Main's scheduled mirror downloads public assets without a cross-repository credential, verifies SHA256 and uploads the same bytes with its own repository-scoped token. Failed checks leave the previous release untouched. Mirroring must remain enabled for at least 90 days after cutover and two stable main releases; stopping requires a deliberate maintenance decision. Do not delete the old release or reuse the previous repository name in a way that breaks redirects.

All successful builds publish both an immutable `apps-<full SHA>` prerelease and the rolling `apps` catalog. Builds locked by the main program must use the immutable tag and committed expected SHA256, never rolling `apps`. Per-app manifest versions continue independently of bundle tags.

## Host compatibility

`host.lock.json` pins the actual myco host used for bridge, CSP, file dispatcher and manifest/schema tests. Unit tests run without a host checkout. UI tests use the real bridge from that checkout; pass `MYCO_HOST_ROOT` to test a proposed host change before advancing the lock. Host-side integration runners remain in `templates/` and consume isolated real-Hub fixtures on stdin, never real user credentials.

Apps use advertised features and the manifest's minimum Hub version. New bridge capabilities must be implemented and accepted separately on desktop, iOS and Android; absent features retain a fallback or show an update requirement. A host bridge change requires a linked apps SDK/contract change, and vice versa.

App-owned localized sidecars generate `templates/localization/app-locales.json`; this metadata ships with each immutable release for main's older-Hub UI fallback. Updating an app alone does not require rebuilding the main web dashboard.

## Phase 2 (pending coordinator authorization)

After the Go module rename merges, main will add `apps.lock.json` with repository, immutable tag, source commit, builtin list and the expected SHA256 of each consumed artifact. A preparation script downloads/verifies the pinned artifacts and uses a checksum-keyed cache, or explicitly supplied local files for offline builds. Missing or invalid files must fail production builds; never silently select a different release.

Only then remove main's `templates/`, `internal/templates/official` and tracked `builtin.zip`, switch production embed/build jobs to prepared bundles, and replace Go test dependencies on full app output with small deterministic fixtures. Ordinary Go tests remain network-free. Production release jobs must verify the pinned real builtin set, not embed test fixtures. Keep app loading, cached catalog and the minimum Hub/version checks in main.

The release agent follows the `myco-release` skill for the first host release; app agents must not change VERSION. Step 2 does not run automatically after phase 1.
