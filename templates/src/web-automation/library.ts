// The script library lives in its own repository and is read at runtime, so
// scripts can be added or fixed there without releasing the App. Pages never
// contact external hosts directly: requests go through the App's network
// bridge, with bounded sizes. A script is checked against the index's SHA-256
// and the app's own validation before it is copied into this page.
import { networkState, network } from "../_lib/net";
import { t as uiText } from "../_lib/i18n";
import { normalize, validate, type Script } from "./model";

export const LIBRARY_BASE = "https://raw.githubusercontent.com/myco-ai/browser-scripts/main/";
export type LibraryStatus = "verified" | "empty" | "needs_input" | "failing";
export type LibraryEntry = {
  id: string; version: number; name: string; description: string; category: string;
  tags: string[]; requires_login: boolean; status: LibraryStatus; params: string[]; steps: number;
  file: string; sha256: string;
};
export type LibraryRef = { id: string; version: number };

const statuses = new Set<LibraryStatus>(["verified", "empty", "needs_input", "failing"]);
const idOk = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9_]{1,60}$/.test(value);
const fileOk = (value: unknown): value is string => typeof value === "string" && /^scripts\/[a-z0-9_-]{1,40}\/[a-z0-9_]{1,60}\.json$/.test(value);
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";

export const libraryAvailable = () => networkState === "ready";

/** Parse index.json, keeping only well-formed entries. */
export function parseIndex(raw: string): LibraryEntry[] {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error(uiText("脚本库的索引格式不对")); }
  const list = (data as { schema?: unknown; scripts?: unknown })?.scripts;
  if ((data as { schema?: unknown })?.schema !== 1 || !Array.isArray(list)) throw new Error(uiText("脚本库的索引格式不对"));
  const out: LibraryEntry[] = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, 2000) as Record<string, unknown>[]) {
    if (!item || !idOk(item.id) || seen.has(item.id) || !fileOk(item.file) || typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(item.sha256)) continue;
    if (!Number.isInteger(item.version) || (item.version as number) < 1 || !statuses.has(item.status as LibraryStatus)) continue;
    seen.add(item.id);
    out.push({
      id: item.id, version: item.version as number, name: text(item.name, 120) || item.id, description: text(item.description, 400),
      category: text(item.category, 40) || "other", tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12) : [],
      requires_login: item.requires_login === true, status: item.status as LibraryStatus,
      params: Array.isArray(item.params) ? item.params.filter((name): name is string => typeof name === "string").slice(0, 20) : [],
      steps: Number.isInteger(item.steps) ? item.steps as number : 0, file: item.file, sha256: item.sha256,
    });
  }
  return out;
}

async function get(path: string, limit: number) {
  const response = await network().fetch({ url: LIBRARY_BASE + path, response: "text", timeout_ms: 20000, max_bytes: limit });
  if (response.status < 200 || response.status >= 300) throw new Error(uiText("连接脚本库失败（HTTP {0}），请稍后再试", response.status));
  if (response.truncated) throw new Error(uiText("脚本库返回的内容太大"));
  return response.body;
}

export async function loadIndex() { return parseIndex(await get("index.json", 2 * 1024 * 1024)); }

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Fetch one script, check it against the index and this app's rules, and
 *  return it as a new page script that remembers where it came from. */
export async function loadScript(entry: LibraryEntry): Promise<Script> {
  const raw = await get(entry.file, 64 * 1024);
  if (await sha256(raw) !== entry.sha256) throw new Error(uiText("脚本内容和索引对不上，先不添加"));
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw); } catch { throw new Error(uiText("脚本格式不对，先不添加")); }
  const script = { ...normalize(data), source: "library", library: { id: entry.id, version: entry.version } } as Script;
  if (validate(script).length) throw new Error(uiText("这个脚本没通过检查，先不添加"));
  return script;
}

/** Replace a library script's steps with a newer version, keeping the page's own choices. */
export function updated(current: Script, next: Script): Script {
  return { ...next, profile: current.profile || next.profile, name: current.name || next.name };
}

export function statusLabel(status: LibraryStatus) {
  return status === "verified" ? uiText("已验证")
    : status === "empty" ? uiText("可能要登录或换网络")
    : status === "needs_input" ? uiText("要填参数")
    : uiText("待修复");
}

export const categoryLabels: Record<string, string> = {
  tech: "科技", social: "社交", news: "新闻", finance: "财经", shopping: "购物",
  entertainment: "娱乐", reading: "阅读", search: "搜索", jobs: "求职", other: "其他",
};
export const categoryLabel = (category: string) => categoryLabels[category] ? uiText(categoryLabels[category]) : category;
