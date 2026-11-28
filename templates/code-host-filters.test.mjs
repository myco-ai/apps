import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: [new URL("src/code-host/filters.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { validRepository, orderItems, filterDemo, supportsFilter } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
assert.ok(validRepository("gitlab", "acme/team/widget"));
assert.ok(!validRepository("github", "acme/team/widget"));
for (const repo of [
  "../widget",
  "acme/..",
  "acme/a?token=x",
  "https://example.com/a/b",
  "acme/space name",
  "acme/a%2fb",
])
  assert.equal(validRepository("gitlab", repo), false, repo);
const rows = [
  {
    repo: "a/b",
    number: 1,
    author: "alex",
    labels: ["needs review"],
    updated: "2026-11-02",
    created: "2026-11-01",
    draft: false,
  },
  {
    repo: "a/b",
    number: 2,
    author: "sam",
    labels: ["bug"],
    updated: "2026-11-03",
    created: "2026-10-01",
    draft: true,
  },
];
assert.deepEqual(
  orderItems(rows, "created_asc").map((i) => i.number),
  [2, 1],
);
assert.deepEqual(
  orderItems(rows, "updated_asc").map((i) => i.number),
  [1, 2],
);
assert.deepEqual(
  filterDemo(rows, {
    author: "Alex",
    label: "needs review",
    updated_after: "2026-11-02",
    draft: "exclude",
  }).map((i) => i.number),
  [1],
);
assert.equal(
  filterDemo(rows, { label: "needs" }).length,
  0,
  "labels are exact, not substring",
);
assert.equal(
  supportsFilter(
    { providers: { github: ["label"], gitea: [] } },
    [{ provider: "github" }, { provider: "gitea" }],
    "label",
  ),
  false,
);
console.log(
  "PASS code-host filters: repository paths, complete sort dates, exact demo conditions and provider capability intersections",
);
