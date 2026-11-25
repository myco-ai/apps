# Page-owned files

Application originals belong to their page. Never use project files for gallery
images, videos, or other application storage: project files supply agent context.

The desktop bridge is optional. Check both `myco.features?.includes("page-files")`
and `(await myco.ready).pageFiles`. The first describes this host; the second also
negotiates support with the current Hub. Mobile hosts may not provide it yet.
Old Hubs must remain read-only; an application must not fall back to project uploads.

```ts
const context = await myco.ready;
if (!context.pageFiles || !myco.pageFiles) {
  // Show previews and an upgrade notice; disable writes.
} else {
  const usage = await myco.pageFiles.info();
  const file = await myco.pageFiles.put("images", "picture.png", blob, {
    key: uploadKey, // keep this key for retries of the same upload
  });
  await myco.data.put("images", { title: "Example", attachment: file }, {
    id: "example", ifVersion: 0,
  });
  const original = await myco.pageFiles.get(file);
  await myco.pageFiles.download(file);
}
```

Declare `"permissions": ["download"]` when using the managed Downloads action.
Declare the record field as `"attachment": "file"` in `myco.json`. Existing pages
must upgrade their app snapshot before writing this new field. The returned value
contains `file_id`, `page`, `collection`, `name`, `size`, `sha256`, `content_type`,
`state`, and timestamps; the record needs at least `file_id`.

`info()` returns `{files_used, files_max, bytes_used, bytes_max, max_file_bytes}`.
The defaults are 1000 files / 2 GiB per page, 20 MiB per file; trust actual usage and
limits from the Hub. Concurrent admission is enforced by the server. `list({limit,
after})` returns metadata, quota usage and an optional `next` cursor.

Unassociated uploads expire after 24 hours. Save the record before that deadline.
On a record conflict, reuse the upload key to retrieve the original upload rather
than creating duplicates. Delete all record references before calling
`pageFiles.remove(file)`; the Hub refuses removal while still referenced.
Page deletion cleans up files; app upgrades and version rollback preserve them.

The Hub migrates same-project originals referenced by old file fields, including
legacy text fields named `file`. It preserves record data and versions.
`pageFiles.resolve(oldName)` finds the new metadata for those old names; it is
read-only and must not trigger shared-record writes from renderers or view-only
pages. Legacy project-file GET aliases remain available subject to page permissions.

Upgraded Media Kit pages add missing `attachment` references with CAS, re-reading
on conflicts and preserving legacy `file` strings. View-only and export renderers
never perform this backfill. The Delete action removes the record before its
original; shared originals are retained, and incomplete cleanup reports an ID
that an authorized agent can retry. The manifest minimum covers safe read-only
rendering on older Hubs; page-file editing still requires capability negotiation.
