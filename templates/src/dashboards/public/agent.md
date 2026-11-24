# Dashboards

Write a data snapshot to the page requested by the user. The app renders records from
`datasets`. Each record is a complete snapshot with a stable ID, and several panels
or dashboards can read that dataset. Layouts live in the separate `dashboards`
collection. The page reads the data on open and when the viewer selects **Reload data**.

## Publish a dataset

Use a stable record ID of up to 80 letters, digits, underscores or hyphens. Give each
column a unique name (up to 80 characters). Rows are arrays aligned with the column
order. Use JSON numbers for measurements, strings for labels and null for missing
values. A snapshot can display up to 12 columns and 300 rows and must fit the
Hub's 64 KiB record limit. Summarize larger datasets before uploading. Preserve
column names between updates so existing panels still map to them.

```json
{
  "title": "Weekly usage",
  "captured": "2026-11-24T10:00:00Z",
  "columns": ["Day", "Requests", "Errors"],
  "rows": [["Mon", 128, 2], ["Tue", 164, 1], ["Wed", 152, null]]
}
```

```sh
myco page data list --page "$PAGE" --collection datasets
myco page data put --page "$PAGE" --collection datasets --id weekly_usage --if-version 0 --file snapshot.json
```

For an update, use `myco page data get --page "$PAGE" --collection datasets --id weekly_usage`
and supply the returned version to `--if-version`. Resolve conflicts by reading the latest
record. Use the source's snapshot timestamp in ISO 8601. Keep credentials and unrelated
personal data out of shared records. The page never fetches the data source.

## Set up a layout

The viewer can choose the dataset ID and columns in **Edit layout**. When asked to
create or edit a layout, write a record to the `dashboards` collection. Use the
same version check as for datasets. Keep panel IDs unique within the dashboard. Panel
array order controls placement. Each dashboard supports up to 24 panels.

```json
{
  "title": "Service overview",
  "description": "Weekly request volume",
  "panels": [{
    "id": "requests",
    "title": "Requests by day",
    "kind": "line",
    "dataset": "weekly_usage",
    "label": "Day",
    "values": ["Requests"],
    "width": "half",
    "unit": "requests"
  }]
}
```

- Kinds: `line`, `bar`, `area`, `donut`, `metric`, `table`.
- Line, bar and area take up to six numeric columns. Negative values are valid and null breaks lines.
- Donut uses one numeric column and positive values. Supply one row per category. Categories after the first five are grouped as Other.
- Metric displays the last non-null numeric value in its column. Sort the rows in chronological order when using a dated dataset.
- Table displays all dataset columns. The label column is optional for charts and metrics.
- Widths: `compact` (one third), `half`, `wide` (full). Narrow windows reflow the panels.

A link ending with `#dashboard?id=RECORD_ID` opens that dashboard on clients with page fragment support.
