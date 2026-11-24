# Official app sources

Each `src/<app>` contains a React page and `public/` files: manifest, agent guide, sample records, localized metadata, SVG icon and light/dark screenshots. Shared page APIs and native bridge types are in `src/_lib`.

Run commands from the repository root:

```sh
npm --prefix templates ci
npm --prefix templates run locales   # after editing public/locales.json
make check
npm --prefix templates run build
make pack
```

Build output is `dist/official/<app>`, never committed. `scripts/pack-apps.sh` creates all apps and the subset in `builtin.json` with deterministic timestamps and checksums. Keep the archive layout compatible with Hub v0.20.7 and later.

The page bridge is provided by the host: apps load their own local assets and use `myco.data` for collaborative records, `myco.net` for supported network requests, or optional `myco.os` capabilities. Consult the main repository's [API](https://github.com/myco-ai/myco/blob/main/docs/api.md), [native capabilities](https://github.com/myco-ai/myco/blob/main/docs/app-os.md) and [UI guide](https://github.com/myco-ai/myco/blob/main/docs/design/app-ui.md). Detect features, preserve fallbacks, and never store secrets in page data.

`node templates/shots.mjs [app ...]` captures sample content into source `public/shots/` (maximum width 1280). Build before and after capturing. FFmpeg is needed for video samples; a photo sample can be supplied with `MYCO_SHOTS_PHOTO`.

See the root README for browser dependencies and the locked host checkout. Individual UI suites can be run from the repository root with `node templates/<app>.ui-test.mjs`.

Record queries: see [SDK query options, pagination and compatibility](../docs/page-data-queries.md).
