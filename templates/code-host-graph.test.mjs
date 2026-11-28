import assert from "node:assert/strict";
import { build } from "esbuild";
const bundled = await build({
  entryPoints: [new URL("src/code-host/graph.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { commitGraph, demoHistory } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
const commits = demoHistory(false),
  graph = commitGraph([...commits].reverse());
for (const e of graph.edges) {
  assert.ok(e.to !== null);
  assert.ok(
    e.to > e.from,
    "parents must follow children even with skewed timestamps/provider order",
  );
  assert.ok(
    graph.nodes[e.from].commit.parents.includes(graph.nodes[e.to].commit.sha),
  );
}
assert.ok(graph.lanes >= 2, "a merge must have a branch lane");
const partial = commitGraph(commits.slice(0, 2));
assert.ok(
  partial.edges.some((e) => e.to === null),
  "unloaded parents must stay explicit",
);
assert.equal(
  commitGraph([...commits, commits[0]]).nodes.length,
  commits.length,
  "pagination duplicates must not duplicate nodes",
);
assert.throws(
  () =>
    commitGraph([
      { sha: "a", parents: ["b"] },
      { sha: "b", parents: ["a"] },
    ]),
  /invalid_graph/,
);
console.log(
  "PASS commit graph: topology, merge lanes, unknown parents, duplicate pages and cycle rejection",
);
