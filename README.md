# myco apps

Official apps for [myco](https://github.com/myco-ai/myco): collaborative pages for people and agents, the page SDK, and their browser regression tests.

## Develop

```sh
npm --prefix templates ci
make check
npm --prefix templates run build
make pack
```

Sources stay in `templates/src/<app>`. Each app has `public/myco.json`, an agent guide, sample records, localized metadata, an SVG icon and screenshots. Bundles are generated into `dist/official`; release packages go to `dist/apps`. Generated files are not committed. See [agent instructions](AGENTS.md), [app development](templates/README.md), and the [migration and compatibility notes](docs/migration.md).

The SDK lives in `templates/src/_lib`; see [page-owned files](docs/page-files.md) for original media storage. Apps discover native capabilities with `myco.features`; a source SDK update never implies that an installed desktop or mobile host supports a new feature. See [declared computer capabilities](docs/app-permissions.md) for manifest groups, shared helpers and network destinations.

## Browser and host tests

Check out the exact repository and commit in `host.lock.json` to `.cache/myco`, or set `MYCO_HOST_ROOT` to an independent checkout. Install that checkout's web dependencies with `npm --prefix .cache/myco/web ci` for the media-kit dispatcher test. Then:

```sh
npm install -g playwright@1.57.0
playwright install chromium
scripts/check-host.sh
make browser
```

Browser suites use synthetic content and the real bridge from the locked host. Some suites need FFmpeg and CJK fonts. CI runs the complete browser suite in four shards, distributing the 320 app/language/theme/width cases across the same workers. Native/real-Hub stdin fixtures remain available for the main repository's integration harness.

## Distribution

The [apps release](https://github.com/myco-ai/apps/releases/tag/apps) carries `apps.zip` and `SHA256SUMS`, which Hubs can update independently of the main program. Each successful source commit also gets an immutable `apps-<full SHA>` prerelease containing `builtin.zip`, catalog metadata and checksums for reproducible main-program builds. All app releases are prereleases with `latest=false`.

During the migration, the main repository automatically mirrors these exact assets to its existing `apps` release so old Hubs continue to update. Main-program embedded apps remain unchanged until phase 2; see [migration](docs/migration.md).

## History and license

The first 156 commits were extracted from `myco-ai/myco` with `git filter-repo`, retaining the history of `templates/`, `scripts/pack-apps.sh`, and `.github/workflows/apps.yml`. Authors, timestamps and messages are preserved; filtered commit IDs change. The [commit map](docs/history-map.txt) and [migration snapshot](migration.json) identify the original revisions. See [LICENSE](LICENSE).

## Public examples

Sample records, screenshot fixtures and preview images use fictional people,
machines and workflows. They demonstrate the app schemas and interactions; they
are not operational records or release instructions. Keep private service
addresses, workspace/page identifiers, workstation paths, credentials and team
operations out of public examples. Use reserved domains such as `example.com`
and clearly synthetic identities such as `alex`, `demo-mac` and `pg_test`.
