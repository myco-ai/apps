# Code Graph

Use the page to explore dependencies in a local project. It can open Graphify's
`graphify-out/graph.json` (objects with `nodes` and `links` or `edges`, keyed by
node ID). Use `source_file`, `source_location` and `confidence` on links to retain
evidence. The graph can be exported as JSON for use in another page or a local
analysis.

The folder view indexes supported code and text paths. It resolves relative
JavaScript/TypeScript imports, Markdown links and Go module packages when the
target is in the selected folder. The Go package relationship points to one
representative file. The folder scan is a lexical index and does not perform
symbol-level parsing or semantic inference. Use a Graphify-produced file for
richer relationships. The scanner skips hidden and generated folders. Files larger
than 256 KiB appear as nodes without reading their contents.

Filter by label, path, kind or group. Choose a node to inspect its neighbors.
Set the start and end from two nodes to find the shortest path in either
direction. The path shows the actual source-to-target direction of each link.

The page works with user-selected files only. It does not send files, graphs or
searches to Myco or Graphify. Export before leaving the page if you need the
current graph again. Do not distribute exported graphs without checking their
paths and metadata for private information.
