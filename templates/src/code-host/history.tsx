import { Picker } from "./picker";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, GitBranch, X } from "lucide-react";
import { language } from "../_lib/i18n";
import {
  query,
  safeLink,
  type Account,
  type Branch,
  type Commit,
  type Page,
} from "./client";
import { commitGraph, demoHistory } from "./graph";
const tr = (en: string, zh: string) => (language() === "zh" ? zh : en);
export function History({
  account,
  repo,
  supported,
  demo,
  onClose,
}: {
  account: Account;
  repo: string;
  supported: boolean;
  demo: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [ref, setRef] = useState(""),
    [rows, setRows] = useState<Commit[]>([]),
    [branches, setBranches] = useState<Branch[]>([]),
    [branchPage, setBranchPage] = useState(1),
    [branchMore, setBranchMore] = useState(false),
    [branchBusy, setBranchBusy] = useState(false);
  const [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [branchError, setBranchError] = useState(false),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState<Commit | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!supported && !demo) return;
    let alive = true;
    setBranchError(false);
    setBranchBusy(true);
    void (async () => {
      try {
        const result = demo
          ? {
              items: [
                { name: "main", sha: demoHistory(false)[0].sha },
                { name: "feat/filters", sha: demoHistory(false)[1].sha },
              ],
              has_more: false,
            }
          : await query<Page<Branch>>({
              account: account.id,
              repo,
              action: "branches",
              page: branchPage,
            });
        if (alive) {
          setBranches((prev) =>
            branchPage === 1
              ? result.items
              : [
                  ...prev,
                  ...result.items.filter(
                    (b) => !prev.some((p) => p.name === b.name),
                  ),
                ],
          );
          setBranchMore(result.has_more);
        }
      } catch {
        if (alive) setBranchError(true);
      } finally {
        if (alive) setBranchBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [account.id, repo, branchPage, supported, demo, retry]);
  useEffect(() => {
    if (!supported && !demo) return;
    let alive = true;
    setBusy(true);
    setError(false);
    void (async () => {
      try {
        const data = demo
          ? {
              items:
                ref === "feat/filters"
                  ? demoHistory(language() === "zh").filter(
                      (_, i) => i !== 0 && i !== 2 && i !== 3,
                    )
                  : demoHistory(language() === "zh"),
              has_more: false,
            }
          : await query<Page<Commit>>({
              account: account.id,
              repo,
              action: "commits",
              ref,
              page,
            });
        if (alive) {
          setRows((prev) =>
            page === 1
              ? data.items
              : [
                  ...prev,
                  ...data.items.filter(
                    (c) => !prev.some((p) => p.sha === c.sha),
                  ),
                ],
          );
          setMore(data.has_more);
        }
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [account.id, repo, ref, page, retry, supported, demo]);
  let graph: ReturnType<typeof commitGraph> | null = null;
  try {
    graph = commitGraph(rows);
  } catch {
    /* Never invent links for an invalid provider graph. */
  }
  const graphWidth = graph ? Math.max(54, graph.lanes * 18 + 24) : 54;
  const address = selected && safeLink(selected.url, account.host);
  return (
    <dialog
      className="history-dialog"
      ref={dialog}
      onClose={onClose}
      onCancel={onClose}
    >
      <header>
        <div>
          <h2>
            {demo
              ? tr("Commit graph · Example", "提交图 · 示例")
              : tr("Commit graph", "提交图")}
          </h2>
          <p>
            {repo} · {account.login}
          </p>
        </div>
        <button
          className="icon"
          title={tr("Close commit graph", "关闭提交图")}
          aria-label={tr("Close commit graph", "关闭提交图")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {!supported && !demo ? (
        <p className="notice">
          {tr(
            "Commit history needs a desktop App with repository history support. Update the desktop App to use it.",
            "提交历史需要支持仓库历史的桌面 App，请更新后使用。",
          )}
        </p>
      ) : (
        <>
          <div className="history-controls">
            <GitBranch size={16} />
            <Picker
              label={tr("Branch", "分支")}
              value={ref}
              searchable
              onChange={(next) => {
                setRef(next);
                setPage(1);
                setRows([]);
                setSelected(null);
              }}
              options={[
                { value: "", label: tr("Default branch", "默认分支") },
                ...branches.map((b) => ({ value: b.name, label: b.name })),
              ]}
            />

            {branchMore && (
              <button
                disabled={branchBusy || branches.length >= 500}
                onClick={() => setBranchPage((p) => p + 1)}
              >
                {tr("More branches", "更多分支")}
              </button>
            )}
            {branchError && (
              <span className="hint">
                {tr(
                  "Branch list unavailable; default history still works.",
                  "分支列表暂不可用，仍可查看默认分支。",
                )}
              </span>
            )}
          </div>
          <p className="history-note hint">
            {tr(
              "History reachable from the selected branch. Dashed tails mean a parent is not loaded yet.",
              "展示所选分支可达的提交历史，虚线表示父提交尚未加载。",
            )}
          </p>
          <div className="history-scroll" aria-busy={busy}>
            {(!graph || error) && (
              <p role="alert" className="error">
                {tr(
                  "Could not load a complete history response. Check repository read access (including Contents on GitHub tokens), or retry.",
                  "无法加载提交历史，请检查仓库读取权限（GitHub 令牌还需 Contents 读取权限）后重试。",
                )}
                <button disabled={busy} onClick={() => setRetry((v) => v + 1)}>
                  {tr("Retry", "重试")}
                </button>
              </p>
            )}
            {busy && !rows.length ? (
              <div
                className="repo-skeleton"
                role="status"
                aria-label={tr("Loading history…", "正在加载历史…")}
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className="skeleton-line" />
                ))}
              </div>
            ) : (
              graph && (
                <div
                  className="commit-graph"
                  style={{ minWidth: graphWidth + 240 }}
                >
                  <svg
                    className="commit-lines"
                    width={graphWidth}
                    height={graph.nodes.length * 58}
                    aria-hidden="true"
                  >
                    {graph.edges.map((e, i) => {
                      const x = e.fromLane * 18 + 16,
                        y = e.from * 58 + 22,
                        px = e.toLane * 18 + 16,
                        py = e.to === null ? y + 25 : e.to * 58 + 22;
                      return (
                        <path
                          key={i}
                          className={e.to === null ? "unloaded" : ""}
                          d={`M${x},${y} C${x},${y + 24} ${px},${py - 24} ${px},${py}`}
                        />
                      );
                    })}
                    {graph.nodes.map((n) => (
                      <circle
                        key={n.commit.sha}
                        cx={n.lane * 18 + 16}
                        cy={graph.nodes.indexOf(n) * 58 + 22}
                        r={n.commit.parents.length > 1 ? 5 : 4}
                        className={
                          n.commit.parents.length > 1 ? "merge-node" : ""
                        }
                      />
                    ))}
                  </svg>
                  <div style={{ marginLeft: graphWidth }}>
                    {graph.nodes.map(({ commit: c }) => (
                      <button
                        className="commit-row"
                        aria-pressed={selected?.sha === c.sha}
                        key={c.sha}
                        onClick={() => setSelected(c)}
                      >
                        <span className="commit-subject">
                          {c.subject || c.sha.slice(0, 8)}
                          {branches
                            .filter((b) => b.sha === c.sha)
                            .map((b) => (
                              <em key={b.name}>{b.name}</em>
                            ))}
                        </span>
                        <span className="commit-meta">
                          <code>{c.sha.slice(0, 8)}</code>
                          <span>{c.author}</span>
                          <time>
                            {c.date
                              ? new Date(c.date).toLocaleDateString()
                              : ""}
                          </time>
                          {c.parents.length > 1 && (
                            <span>{tr("Merge", "合并")}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
            {!busy && !error && rows.length === 0 && (
              <p className="hint">
                {tr("No commits in this repository.", "此仓库暂无提交。")}
              </p>
            )}
            {more && rows.length < 500 && (
              <button
                disabled={busy}
                className="more-commits"
                onClick={() => setPage((p) => p + 1)}
              >
                {tr("Load more commits", "加载更多提交")}
              </button>
            )}
            {more && rows.length >= 500 && (
              <p className="hint">
                {tr(
                  "500 commits loaded. Select a branch to narrow the history.",
                  "已加载 500 个提交，可切换分支缩小范围。",
                )}
              </p>
            )}
          </div>
          {selected && (
            <section className="commit-detail">
              <header>
                <code>{selected.sha}</code>
                {address && (
                  <a href={address} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    {tr("Open original", "打开原文")}
                  </a>
                )}
                <button
                  className="icon"
                  title={tr("Close commit details", "关闭提交详情")}
                  onClick={() => setSelected(null)}
                >
                  <X size={14} />
                </button>
              </header>
              <pre>{selected.message}</pre>
              <p className="hint">
                {tr("Parents", "父提交")}:{" "}
                {selected.parents.length
                  ? selected.parents.map((p) => p.slice(0, 8)).join(" · ")
                  : tr("Root commit", "根提交")}
              </p>
            </section>
          )}
        </>
      )}
    </dialog>
  );
}
