# Querying page records

On desktop hosts advertising `myco.features.includes("data-query")`, `data.list`
accepts an optional second argument. Older desktop and mobile hosts can ignore
extra arguments, so always check the feature before relying on filtering or count.
A current desktop transparently filters locally when connected to an older Hub.

```ts
if (myco?.features?.includes("data-query")) {
  const first = await myco.data.list("issues", {
    fields: ["n", "title", "status"],
    where: ["assignee:alex", "status:in:todo,progress"],
    sort: "-n", limit: 100,
  });
  const next = first.next
    ? await myco.data.list("issues", {
        fields: ["n", "title", "status"],
        where: ["assignee:alex", "status:in:todo,progress"],
        sort: "-n", limit: 100, after: first.next,
      }) : null;
  const total = await myco.data.list("issues", { where: "status:progress", count: true });
  console.log(total.count);
}
```

`fields` and `sort` take comma-separated strings or arrays. `where` takes one
expression or an array of ANDed expressions. Flat field names contain ASCII
letters, digits and underscores, start with a letter or underscore, and have at
most 64 characters. These are fields inside `data`, not record metadata.

| Condition | Example |
| --- | --- |
| Equals (or `eq`) | `status:progress` |
| Not equal (`ne`, `!=`) | `status:ne:done` |
| In a list | `status:in:todo,progress` or `n:in:[1,2,3]` |
| Field exists (null counts as present) | `assignee:exists` |
| Field missing | `assignee:exists:false` |
| Numeric comparison | `n:gte:10`, `n:lt:20` |
| Date/time comparison | `created:>=:2026-11-25T00:00:00Z`, `due:<:2026-12-01` |

Range operators are `gt`, `lt`, `gte`, `lte` or `>`, `<`, `>=`, `<=`. Values are
JSON scalars or unquoted strings. Numbers, booleans and null have distinct types;
quote a literal string such as `n:eq:"3"` or `status:eq:"null"`. `in` accepts
1–100 scalars. Missing fields fail comparisons, including `ne`; use `exists:false`
to find them. Date ranges accept ISO dates or RFC3339 instants and compare at
millisecond precision. Numeric ranges exclude strings. Equality compares literal
values; equivalent timestamps with different offsets are equal only in ranges.

Sorting is ascending unless prefixed by `-`. Missing fields always sort last.
Null sorts before numbers/booleans, then text; arrays/objects sort by compact JSON.
Use homogeneous field types and UTC timestamps for predictable lexical date sorting.
Ties retain collection/order/ID order. Up to 8 sort fields, 64 projected fields,
and 32 conditions are allowed.

Unspecified or zero `limit` retains the legacy unlimited behavior. Explicit page
sizes are 1–1000. `next` is an opaque cursor bound to the page, collection, filters,
projection, sort and page data revision; repeat that query with `after`. Page size
may change. Any page record change can return `conflict`: restart without `after`.
Do not derive or edit cursors. `count:true` returns `{count, seq, query_version}`
without record bodies; it ignores fields, sort and limit and cannot use `after`.

Projection keeps record metadata (including ID and version) while trimming `data`.
It is not a complete record for `put`, which replaces all fields: use `get` before
a CAS write. Query reads do not advance the editor's shared watch cursor. Continue
using unfiltered `Store` synchronization and changes/reset events for live editing.

The HTTP contract is in the host's [API documentation](https://github.com/myco-ai/myco/blob/main/docs/api.md#page-records-and-templates).
