import type { Account, Item } from "./client";
export type Filters = {
  author?: string;
  label?: string;
  updated_after?: string;
  draft?: string;
  sort?: string;
};
export type FilterSupport = {
  version: number;
  providers: Record<string, string[]>;
};
export const noFilters: Filters = {};
export const filterCount = (f: Filters) =>
  Object.values(f).filter(Boolean).length;
export const supportsFilter = (
  support: FilterSupport | null,
  accounts: Account[],
  field: string,
) =>
  !!support &&
  accounts.length > 0 &&
  accounts.every((a) => support.providers[a.provider]?.includes(field));
export function validRepository(provider: string, value: string) {
  const parts = value.split("/");
  return (
    value.length <= 500 &&
    /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+$/.test(value) &&
    (provider === "gitlab" || parts.length === 2) &&
    parts.every((p) => p !== "." && p !== "..")
  );
}
export function orderItems(items: Item[], sort = "updated_desc") {
  const field = sort.startsWith("created_") ? "created" : "updated",
    direction = sort.endsWith("_asc") ? 1 : -1;
  return [...items].sort(
    (a, b) =>
      direction * (a[field] || "").localeCompare(b[field] || "") ||
      a.repo.localeCompare(b.repo) ||
      a.number - b.number,
  );
}
/** Demo-only filtering. Live results always use provider-side filters before pagination. */
export function filterDemo(items: Item[], f: Filters) {
  return orderItems(
    items.filter(
      (i) =>
        (!f.author || i.author.toLowerCase() === f.author.toLowerCase()) &&
        (!f.label ||
          i.labels.some((l) => l.toLowerCase() === f.label!.toLowerCase())) &&
        (!f.updated_after || i.updated >= f.updated_after) &&
        (!f.draft || i.draft === (f.draft === "only")),
    ),
    f.sort,
  );
}
