import { Picker } from "./picker";
import { useEffect, useRef, useState } from "react";
import { GitBranch, Search, X } from "lucide-react";
import { language } from "../_lib/i18n";
import { query, type Account, type Repository, type Page } from "./client";
import { demoData } from "./demo";
import { validRepository } from "./filters";
const tr = (en: string, zh: string) => (language() === "zh" ? zh : en);
export function RepositoryPicker({
  accounts,
  account,
  repo,
  demo,
  onPick,
  onClose,
}: {
  accounts: Account[];
  account: string;
  repo: string;
  demo: boolean;
  onPick: (account: string, repo: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [id, setID] = useState(
    account === "all" ? accounts[0]?.id || "" : account,
  );
  const [needle, setNeedle] = useState(repo),
    [rows, setRows] = useState<Repository[]>([]),
    [page, setPage] = useState(1);
  const [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  const current = accounts.find((a) => a.id === id);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setFailed(false);
    void (async () => {
      try {
        const result = demo
          ? {
              items: demoData(language() === "zh").repositories.filter(
                (r) => new URL(r.url).origin === current?.host,
              ),
              has_more: false,
            }
          : await query<Page<Repository>>({
              account: id,
              action: "repos",
              page,
            });
        if (alive) {
          setRows((prev) =>
            page === 1
              ? result.items
              : [
                  ...prev,
                  ...result.items.filter(
                    (r) => !prev.some((p) => p.name === r.name),
                  ),
                ],
          );
          setMore(result.has_more);
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, page, retry, demo]);
  const found = rows.filter((r) =>
    r.name.toLowerCase().includes(needle.toLowerCase()),
  );
  const valid = !!current && validRepository(current.provider, needle.trim());
  return (
    <dialog
      className="connect-dialog repository-dialog"
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onPick(id, needle.trim());
        }}
      >
        <header>
          <div>
            <h2>{tr("Choose a repository", "选择仓库")}</h2>
            <p>
              {tr(
                "See all its PRs or issues, then narrow by other conditions.",
                "查看仓库中的全部 PR 或 Issue，再叠加其他条件。",
              )}
            </p>
          </div>
          <button
            type="button"
            className="icon"
            title={tr("Close", "关闭")}
            aria-label={tr("Close repository picker", "关闭仓库选择")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <label>
          {tr("Account", "账户")}
          <Picker
            label={tr("Repository account", "仓库账户")}
            value={id}
            onChange={(next) => {
              setID(next);
              setPage(1);
              setRows([]);
              setNeedle("");
              setMore(false);
            }}
            options={accounts.map((a) => ({
              value: a.id,
              label: `${a.name} · ${a.login} · ${new URL(a.host).host}`,
            }))}
          />
        </label>
        <label>
          {tr("Repository path", "仓库路径")}
          <div className="repo-search">
            <Search size={16} />
            <input
              autoFocus
              aria-label={tr("Repository path", "仓库路径")}
              placeholder={tr(
                "Find or enter owner/repository",
                "查找或输入 owner/repository",
              )}
              value={needle}
              maxLength={500}
              onChange={(e) => setNeedle(e.target.value)}
            />
            {needle && (
              <button
                type="button"
                className="icon"
                title={tr("Clear repository search", "清空仓库搜索")}
                onClick={() => setNeedle("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </label>
        <p className="hint">
          {tr(
            "Search the loaded list, or enter an exact path to open a repository not listed here.",
            "可搜索已加载的仓库，或直接输入完整路径打开列表外的仓库。",
          )}
        </p>
        <div className="repository-options" aria-busy={busy}>
          {found.map((r) => (
            <button
              type="button"
              key={r.name}
              onClick={() => onPick(id, r.name)}
            >
              <GitBranch size={15} />
              <span>{r.name}</span>
              {r.private && <small>{tr("Private", "私有")}</small>}
            </button>
          ))}
          {!busy && !failed && !found.length && (
            <p className="hint">
              {tr(
                "No matching repositories in the loaded list.",
                "已加载的仓库中没有匹配项。",
              )}
            </p>
          )}
          {busy && (
            <div
              className="repo-skeleton"
              role="status"
              aria-label={tr("Loading repositories…", "正在加载仓库…")}
            >
              <span className="skeleton-line" />
              <span className="skeleton-line" />
              <span className="skeleton-line" />
            </div>
          )}
          {failed && (
            <p role="alert" className="error">
              {tr(
                "Could not load repositories. Check the connection or account access.",
                "无法加载仓库，请检查网络和账户权限。",
              )}
            </p>
          )}
        </div>
        <div className="repository-actions">
          {failed ? (
            <button type="button" onClick={() => setRetry((v) => v + 1)}>
              {tr("Retry", "重试")}
            </button>
          ) : (
            more && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPage((p) => p + 1)}
              >
                {tr("Load more repositories", "加载更多仓库")}
              </button>
            )
          )}
          <button type="submit" disabled={!valid} className="primary">
            {tr("Open repository", "打开仓库")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
