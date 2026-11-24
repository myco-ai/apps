# Agent instructions

This repository owns myco's official apps, SDK (`templates/src/_lib`), build scripts and UI tests. The desktop/Hub/CLI live in https://github.com/myco-ai/myco. Make app changes here, on `main`, in small commits. Do not commit generated `dist/` or change the main program's VERSION.

- Install with `npm --prefix templates ci`; run `make check`, `npm --prefix templates run build` and `make pack` before pushing. Run affected browser tests; CI runs all browser suites in four shards.
- Preserve public app IDs, data schemas and upgrade compatibility. Increase the individual app's manifest version for user-facing changes.
- Keep all UI metadata synchronized: app `public/locales.json`, `templates/localization/catalog.json`, and generated `templates/localization/app-locales.json` (`npm --prefix templates run locales`). Run `node templates/localization.test.mjs`.
- Follow the host's language/theme, use black/white/gray chrome and follow the [App UI guide](https://github.com/myco-ai/myco/blob/main/docs/design/app-ui.md). Never put private credentials or local database connections in shared page data.
- Native bridges live in the main repository. Check `myco.features` before using optional methods and preserve old-host fallbacks. `_lib` is app-owned; adding a TypeScript method does not implement it in desktop/iOS/Android. Update `host.lock.json` to an exact reviewed main commit and run bridge/browser contracts when changing bridge types.
- For host tests, check out `host.lock.json`'s commit at `.cache/myco` (or set `MYCO_HOST_ROOT`). Install its web dependencies for media-kit tests. Keep a second independent main checkout for host development.
- The apps workflow builds immutable `apps-<full commit SHA>` prereleases and the rolling `apps` prerelease after all checks pass. The main repository mirrors exact checked bytes to its old `apps` release; do not publish a different bundle there.
- Main builds use immutable release artifacts pinned by `apps.lock.json`; application source and generated ZIPs are not committed there. Do not recreate main-repository app copies. The main release skill documents cache/offline preparation and pin rollback; see [host build instructions](https://github.com/myco-ai/myco/blob/main/docs/building.md).
- Add draft promotional material for visible features to the project's media kit using `templates/src/media-kit/public/agent.md`: fake data, separate English/Chinese images, light/dark, per-image language/theme/platform/tags/description.
- Documents, code comments and commit messages are English. Keep credentials out of logs, source, screenshots and messages.

- This is a public repository. Use fictional people, machines, workspace identifiers and reserved example domains in tests, samples and screenshot fixtures. Keep production operations, private workspace data, workstation paths and credentials in restricted repositories. Review image pixels and metadata as well as text before publishing.
