import { myco } from "../_lib/myco";
export type Provider = "github" | "gitlab" | "gitea";
export type Account = {
  id: string;
  provider: Provider;
  host: string;
  login: string;
  name: string;
  source: "cli" | "token";
};
export type Repository = {
  id: string;
  name: string;
  url: string;
  private: boolean;
};
export type Item = {
  account: string;
  number: number;
  repo: string;
  project: string;
  kind: "pull" | "issue";
  title: string;
  body: string;
  url: string;
  state: string;
  author: string;
  updated: string;
  created?: string;
  labels: string[];
  comments: number;
  draft: boolean;
  branch?: string;
  base?: string;
};
export type Comment = { author: string; body: string; at: string; url: string };
export type FileDiff = { name: string; status: string; patch: string };
export type Page<T> = {
  items: T[];
  has_more: boolean;
  page: number;
  incomplete?: boolean;
};
export type Query = {
  account: string;
  action:
    | "repos"
    | "list"
    | "detail"
    | "comments"
    | "files"
    | "branches"
    | "commits";
  kind?: "pull" | "issue";
  repo?: string;
  scope?: string;
  state?: string;
  search?: string;
  page?: number;
  number?: number;
  ref?: string;
  filters?: import("./filters").Filters;
};
export const providerName = (p: Provider) =>
  ({ github: "GitHub", gitlab: "GitLab", gitea: "Gitea / Forgejo" })[p];
export async function accounts(
  action: string,
  input: Record<string, unknown> = {},
) {
  if (!myco?.os) throw { code: "unsupported" };
  return myco.os.call<
    Account[] | Account | boolean | { cli: string; installed: boolean }[]
  >("forge.accounts", { action, ...input });
}
export async function query<T>(input: Query): Promise<T> {
  if (!myco?.os) throw { code: "unsupported" };
  return myco.os.call<T>("forge.query", input, { timeout: 30000 });
}
/** Never turn provider-controlled text into a link carrying credentials or script. */
export function safeLink(value: string, host: string): string | undefined {
  try {
    const u = new URL(value),
      origin = new URL(host);
    return u.protocol === "https:" &&
      u.origin === origin.origin &&
      !u.username &&
      !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}

export type Commit = {
  sha: string;
  parents: string[];
  subject: string;
  message: string;
  author: string;
  date: string;
  url: string;
};
export type Branch = { name: string; sha: string };
