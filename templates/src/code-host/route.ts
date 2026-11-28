import { appFragment, publicAppLink, readAppRoute } from "../_lib/page-route";
import type { Provider } from "./client";

export type ItemRoute = {
  provider: Provider;
  host: string;
  repo: string;
  kind: "pull" | "issue";
  number: number;
  url: string;
  tab: "overview" | "comments" | "files";
};

/** A route names an item; the local account and native permission grant access. */
export function readItemRoute(fragment: string): ItemRoute | null {
  const route = readAppRoute(fragment);
  if (!route) return null;
  if (route.name !== "item") throw Error("invalid_route");
  const p = route.params;
  if ([...p.keys()].some(k => !["provider", "url", "tab"].includes(k)) ||
      [...p.keys()].some(k => p.getAll(k).length !== 1)) throw Error("invalid_route");
  const provider = p.get("provider") as Provider;
  if (!["github", "gitlab", "gitea"].includes(provider)) throw Error("invalid_route");
  const u = new URL(p.get("url") || "");
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash ||
      /[\\\u0000-\u0020\u007f]/.test(p.get("url") || "")) throw Error("invalid_route");
  const path = u.pathname.split("/").slice(1);
  const rawNumber = path.pop() || "";
  const number = Number(rawNumber);
  const segment = path.pop();
  const kind = segment === "issues" ? "issue" : "pull";
  if (!/^[1-9][0-9]*$/.test(rawNumber) || !Number.isSafeInteger(number) || number < 1 ||
      !["issues", provider === "github" ? "pull" : provider === "gitlab" ? "merge_requests" : "pulls"].includes(segment || "")) throw Error("invalid_route");
  if (provider === "gitlab" && path.pop() !== "-") throw Error("invalid_route");
  const parts = path.map(x => decodeURIComponent(x));
  if (parts.length < 2 || (provider !== "gitlab" && parts.length !== 2) ||
      parts.some(x => !x || x === "." || x === ".." || /[\s/\\?#\u0000-\u001f\u007f]/.test(x))) throw Error("invalid_route");
  const tab = p.get("tab") || "overview";
  if (!["overview", "comments", "files"].includes(tab) || (kind === "issue" && tab === "files")) throw Error("invalid_route");
  return { provider, host: u.origin, repo: parts.join("/"), kind, number, url: u.href, tab: tab as ItemRoute["tab"] };
}

export function itemLink(pageURL: string, provider: Provider, url: string, tab = "overview") {
  const fragment = appFragment("item", { provider, url, tab: tab === "overview" ? undefined : tab });
  readItemRoute(fragment);
  return publicAppLink(pageURL, fragment);
}
