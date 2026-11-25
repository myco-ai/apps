# Media Kit · 素材库

Shared release entries live in page data. Original images, GIFs and short videos are page-owned attachments. They follow page permissions and never enter project context or project pull. Use the page ID from the request or page metadata. Do not upload application media to project files.

Requires a CLI with `myco page file` and a Hub advertising page attachments. If
that command is missing, ask the owner to update the CLI. Keep old filenames for
read compatibility; never fall back to project-file uploads.

## Find and read

Set `PAGE` to the page ID. List entries and filter locally. Change the tag, status or keyword in this example as needed.

```sh
myco page data list --page "$PAGE" --collection entries |
  jq '.records[] | select((.data.tags // []) | index("App")) |
      select(.data.status == "ready") |
      select([.data.title, .data.pitch_zh, .data.pitch_en, .data.copy_zh, .data.copy_en] |
             map(. // "") | join(" ") | ascii_downcase | contains("token"))'
myco page data get --page "$PAGE" --collection entries --id "$ENTRY"
myco page data list --page "$PAGE" --collection images |
  jq --arg entry "$ENTRY" '[.records[] | select(.data.entry == $entry)] | sort_by(.data.order)'
myco page file get --page "$PAGE" --file "$FILE_ID" --out ./screenshot.png
```

Use each record's `data.attachment.file_id` for `FILE_ID`. Legacy records keep `data.file`; the same page-file get command accepts this old name after Hub migration. Sample images only have previews.

## Create and edit an entry

```sh
myco page data put --page "$PAGE" --collection entries --id "$ENTRY" --if-version 0 --file entry.json
```

Choose a unique entry ID of 1–42 lowercase letters, digits, underscores or hyphens. A new entry JSON object includes `title`, ISO `date`, `pitch_zh`, `pitch_en`, an array `tags`, and `status` (`draft`, `ready` or `published`). Optional fields are `version`, `copy_zh`, `copy_en`, and `channels` (where it was published). To edit, read the existing record, merge the desired changes into its `data`, and use `put` with the returned version as `--if-version`. On conflict read and merge again.

## Add an image or short video

1. Choose a descriptive file name and a stable upload key for retries.
2. Upload the original: `myco page file put --page "$PAGE" --collection images --path ./screenshot.png --key "$UPLOAD_KEY"`. Save the returned attachment metadata, especially `file_id`, `size`, and `sha256`.
3. Create an `images` record with `myco page data put --page "$PAGE" --collection images --id "img_$SUFFIX" --if-version 0 --file image.json`. Set `attachment` to the returned metadata (at least `{ "file_id": "paf_..." }`) and leave legacy `file` empty. Include `kind` (`video`, `gif`, or `screenshot`), `entry`, `name`, `language`, `theme`, `width`, `height`, `bytes`, and `order`. An optional PNG, JPEG or WebP `preview` data URI, up to 18,000 characters, supplies the gallery thumbnail; use a still frame for video.

Associate an upload with a record within 24 hours. If record creation fails, reuse the same upload key to recover its ID, then finish the record. To remove an original, remove its record references first, then run `myco page file remove --page "$PAGE" --file "$FILE_ID"`. Do not remove originals referenced by another record.

Each page defaults to 1000 files / 2 GiB total, with a 20 MiB per-file cap. `myco page file list --page "$PAGE"` returns actual quota usage. The desktop bridge advertises `ready.pageFiles`; `pageFiles.info()` reports the same quota. Older Hubs or desktop versions remain read-only and request an upgrade; never substitute project-file uploads. Existing page manifests need a page upgrade before writing the new `attachment` field. The Hub migrates referenced legacy project files and keeps old-name read aliases without changing record JSON or versions. After a page upgrade, writable pages CAS-add `attachment` while preserving `file`; a conflict re-reads the current record. View-only pages and export renderers do not backfill. The Delete action removes the image record first, then cleans up the original only when no other record uses it.

## Link to a longer video

Set the optional `video_links` field on an `entries` record. It is an array of up to ten objects with a `url` (an absolute HTTP or HTTPS URL, up to 2,048 characters, without credentials) and a short `label` (for example “YouTube” or “飞书”). Use the same version-checked entry update described above. The app opens links in the browser and lets people copy their addresses.

```json
{"video_links":[{"url":"https://example.com/launch-demo","label":"Launch demo"}]}
```

## Find images by language or theme

For every file, fill in `language` (`zh`, `en`, or `none`), `theme` (`light` or `dark`), `platform` (`app`, `mobile`, `cli`, or `web`), `aspect` (`landscape` when width exceeds height, `portrait` when height exceeds width, and `square` when equal), `kind`, `tags` (an array of short asset labels), and `description` (non-empty). The upload form derives `kind` and `aspect` automatically. Use one or two sentences in Chinese that describe what viewers can actually see, naming the screen and its important elements. Example “用量页，30 天柱状图和成员排行，浅色”。

```sh
myco page data list --page "$PAGE" --collection images |
  jq --arg keyword 工作流 '
    [.records[] | select(.data.kind != "video"
      and .data.language == "en" and .data.theme == "dark"
      and .data.aspect == "landscape" and .data.platform == "app"
      and ([.data.description // "", (.data.tags // [])[]] | join(" ") | contains($keyword)))]
      | sort_by(.data.order)'
```

Add `and .data.entry == $entry` and pass `--arg entry "$ENTRY"` to restrict the query to one entry. Download each returned `data.attachment.file_id` (or legacy `data.file`) with `myco page file get --page "$PAGE" --file ... --out ...`.
