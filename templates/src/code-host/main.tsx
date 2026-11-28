import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  ChevronRight,
  CircleDot,
  Code2,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Github,
  Inbox,
  LockKeyhole,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { language } from "../_lib/i18n";
import { myco } from "../_lib/myco";
import {
  accounts as accountCall,
  providerName,
  query,
  safeLink,
  type Account,
  type Comment,
  type FileDiff,
  type Item,
  type Page,
  type Provider,
  type Repository,
} from "./client";
import { demoData } from "./demo";
import "./style.css";

const tr = (en: string, zh: string) => (language() === "zh" ? zh : en);
const demo = () => demoData(language() === "zh");
const errorText = (error: unknown) => {
  const code = (error as { code?: string })?.code || "failed";
  const text: Record<string, string> = {
    unsupported: tr(
      "This needs a desktop App with code-host support. Update the App and workspace, then reopen this page.",
      "需要支持代码托管的桌面 App。请更新 App 和工作区，再重新打开此页。",
    ),
    permission_denied: tr(
      "Access was refused. Check the page permission, token repository access and organization SSO.",
      "访问被拒绝。请检查页面权限、令牌的仓库权限和组织 SSO 授权。",
    ),
    no_credentials: tr(
      "Sign in to the provider CLI for this server, or connect using an access token. Reconnect expired accounts.",
      "请先在本机登录此服务器的 CLI，或使用访问令牌连接；过期账户需要重新连接。",
    ),
    not_found: tr(
      "This item is missing or the account cannot access it.",
      "此条目不存在，或当前账户无权访问。",
    ),
    rate_limited: tr(
      "The provider rate limit was reached. Wait before refreshing.",
      "已达到平台请求频率限制，请稍后刷新。",
    ),
    network_error: tr(
      "Could not reach the server. Check the HTTPS address and network.",
      "无法连接服务器，请检查 HTTPS 地址和网络。",
    ),
    invalid_argument: tr(
      "Check the server address and required fields. Use an HTTPS origin and a valid access token.",
      "请检查服务器地址和必填项，使用 HTTPS 服务器地址和有效的访问令牌。",
    ),
    invalid_response: tr(
      "The server returned an unexpected response. Check the server and provider type.",
      "服务器返回了异常数据，请检查服务器与平台类型。",
    ),
    scope_unavailable: tr(
      "Clear the repository filter to view review requests for this provider.",
      "请清除仓库筛选，再查看此平台的待评审请求。",
    ),
    cancelled: tr("Connection cancelled.", "已取消连接。"),
    timeout: tr(
      "The request timed out. Try refreshing.",
      "请求超时，请尝试刷新。",
    ),
    too_large: tr(
      "This response is too large. Narrow your repository or search selection.",
      "返回内容过大，请缩小仓库或搜索范围。",
    ),
  };
  return (
    text[code] ||
    tr(
      "The operation failed. Check the connection and try again.",
      "操作失败，请检查连接后重试。",
    )
  );
};
const date = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(language() === "zh" ? "zh-CN" : "en", {
        month: "short",
        day: "numeric",
      });
};
const stateText = (item: Item) =>
  item.draft
    ? tr("Draft", "草稿")
    : item.state === "merged"
      ? tr("Merged", "已合并")
      : item.state === "closed"
        ? tr("Closed", "已关闭")
        : tr("Open", "打开");
const itemKey = (item: Item) =>
  [item.account, item.kind, item.repo, item.number].join(":");
function ProviderIcon({ provider }: { provider: Provider }) {
  return provider === "github" ? <Github size={17} /> : <GitBranch size={17} />;
}
function ItemIcon({ item }: { item: Item }) {
  return item.kind === "issue" ? (
    <CircleDot size={17} />
  ) : item.state === "merged" ? (
    <GitMerge size={17} />
  ) : (
    <GitPullRequest size={17} />
  );
}
function Markdown({ text }: { text: string }) {
  // Render text as React nodes, never provider HTML, images or executable links.
  return (
    <div className="markdown">
      {text
        .split(/\n{2,}/)
        .map((block, i) =>
          /^#{1,3} /.test(block) ? (
            <h3 key={i}>{block.replace(/^#{1,3} /, "")}</h3>
          ) : (
            <p key={i}>{block}</p>
          ),
        )}
    </div>
  );
}
function ConnectDialog({
  supported,
  connected,
  close,
}: {
  supported: boolean;
  connected: (account: Account) => void;
  close: () => void;
}) {
  const [provider, setProvider] = useState<Provider>("github"),
    [host, setHost] = useState("https://github.com");
  const [source, setSource] = useState("cli"),
    [name, setName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tools, setTools] = useState<{ cli: string; installed: boolean }[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    void accountCall("discover")
      .then((v) => setTools(v as typeof tools))
      .catch(() => {});
    return () => d.close();
  }, []);
  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !supported) return;
    setBusy(true);
    setError("");
    try {
      const account = (await accountCall("connect", {
        provider,
        host,
        name,
        source,
      })) as Account;
      connected(account);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!supported)
    return (
      <dialog ref={dialog} className="connect-dialog" onCancel={close}>
        <form method="dialog">
          <header>
            <h2>{tr("Connect an account", "连接账户")}</h2>
            <button
              type="button"
              onClick={close}
              aria-label={tr("Close", "关闭")}
            >
              <X size={18} />
            </button>
          </header>
          <p className="error">{errorText({ code: "unsupported" })}</p>
        </form>
      </dialog>
    );
  const cli = provider === "github" ? "gh" : "glab";
  return (
    <dialog
      ref={dialog}
      className="connect-dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <form onSubmit={connect}>
        <header>
          <div>
            <h2>{tr("Connect an account", "连接账户")}</h2>
            <p>
              {tr(
                "Your repositories, in one place.",
                "把你的代码协作汇集到一处。",
              )}
            </p>
          </div>
          <button
            type="button"
            className="icon"
            aria-label={tr("Close", "关闭")}
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        <div className="provider-options">
          {(["github", "gitlab", "gitea"] as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              className={provider === p ? "chosen" : ""}
              aria-pressed={provider === p}
              onClick={() => {
                setProvider(p);
                setHost(
                  p === "github"
                    ? "https://github.com"
                    : p === "gitlab"
                      ? "https://gitlab.com"
                      : "",
                );
                if (p === "gitea") setSource("token");
                setError("");
              }}
            >
              <ProviderIcon provider={p} />
              {providerName(p)}
            </button>
          ))}
        </div>
        <label>
          {tr("Server", "服务器")}
          <input
            type="url"
            value={host}
            required
            placeholder="https://git.example.com"
            onChange={(e) => setHost(e.target.value)}
            autoComplete="off"
          />
        </label>
        <p className="hint">
          {tr(
            "Use the server origin, without an API path. Self-hosted servers need a trusted HTTPS certificate.",
            "填写服务器地址，不带 API 路径；自建服务器需要受信任的 HTTPS 证书。",
          )}
        </p>
        <div className="seg" aria-label={tr("Connection method", "连接方式")}>
          <button
            type="button"
            aria-pressed={source === "cli"}
            disabled={provider === "gitea"}
            onClick={() => {
              setSource("cli");
            }}
          >
            {tr("Existing CLI login", "已有 CLI 登录")}
          </button>
          <button
            type="button"
            aria-pressed={source === "token"}
            onClick={() => setSource("token")}
          >
            {tr("Access token", "访问令牌")}
          </button>
        </div>
        {source === "token" ? (
          <>
            <div className="cli-hint">
              <LockKeyhole size={16} />
              <p>
                {tr(
                  "The myco App will ask for your token in its own secure dialog. This page never receives it.",
                  "myco App 将在自己的安全弹窗中请你输入令牌，此页面不会收到令牌。",
                )}
              </p>
            </div>
            <p className="hint">
              {provider === "gitlab"
                ? tr(
                    "Grant read_api. Repository and SSO permissions still apply.",
                    "授予 read_api；仓库权限和 SSO 授权仍需有效。",
                  )
                : provider === "github"
                  ? tr(
                      "Select your repositories and grant read access to issues, pull requests and metadata.",
                      "选择所需仓库，并授予 Issue、Pull request 和元数据的只读权限。",
                    )
                  : tr(
                      "Use a token with read access to repositories, issues and user identity.",
                      "使用可读取仓库、Issue 和用户身份的令牌。",
                    )}
            </p>
          </>
        ) : (
          <div className="cli-hint">
            <code>
              {cli} auth login
              {host !== `https://${provider}.com`
                ? ` --hostname ${(() => {
                    try {
                      return new URL(host).host;
                    } catch {
                      return "…";
                    }
                  })()}`
                : ""}
            </code>
            <p>
              {tools.find((t) => t.cli === cli)?.installed
                ? tr(
                    "CLI found on this computer. Connect uses its current login for this server.",
                    "已找到本机 CLI，连接时将使用它在此服务器的当前登录。",
                  )
                : tr(
                    "Sign in on the computer running myco, then connect. You can also use a token without installing the CLI.",
                    "请先在运行 myco 的电脑上登录，再连接；也可直接使用令牌，无需安装 CLI。",
                  )}
            </p>
          </div>
        )}
        <label>
          {tr("Account label (optional)", "账户名称（可选）")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("Work, open source…", "工作、开源项目…")}
            maxLength={100}
          />
        </label>
        <div className="privacy">
          <ShieldCheck size={17} />
          <span>
            {tr(
              "Credentials stay in this computer’s credential store. Private repository data is not shared to this workspace.",
              "凭证保存在本机凭证库，私有仓库内容不会共享到工作区。",
            )}
          </span>
        </div>
        {!supported && (
          <p className="error" role="alert">
            {errorText({ code: "unsupported" })}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={close}>
            {tr("Cancel", "取消")}
          </button>
          <button className="primary" disabled={busy || !supported}>
            {busy
              ? tr("Connecting…", "连接中…")
              : tr("Connect account", "连接账户")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
function Detail({
  item,
  account,
  isDemo,
  close,
}: {
  item: Item;
  account: Account;
  isDemo: boolean;
  close: () => void;
}) {
  const [current, setCurrent] = useState(item),
    [tab, setTab] = useState("overview"),
    [comments, setComments] = useState<Comment[]>([]),
    [files, setFiles] = useState<FileDiff[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    setCurrent(item);
    setTab("overview");
    setPage(1);
    setComments([]);
    setFiles([]);
    setError("");
  }, [itemKey(item)]);
  useEffect(() => {
    const id = ++generation.current;
    let alive = true;
    setBusy(true);
    setError("");
    const run = async () => {
      try {
        if (isDemo) {
          if (tab === "comments") setComments(demo().comments);
          if (tab === "files") setFiles(demo().files);
          setMore(false);
          return;
        }
        const action =
          tab === "overview"
            ? "detail"
            : tab === "comments"
              ? "comments"
              : "files";
        const result = await query<Item | Page<Comment> | Page<FileDiff>>({
          account: item.account,
          action,
          kind: item.kind,
          repo: item.repo,
          number: item.number,
          page,
        });
        if (!alive || id !== generation.current) return;
        if (tab === "overview")
          setCurrent({ ...(result as Item), account: item.account });
        else {
          const data = result as Page<Comment> | Page<FileDiff>;
          setMore(data.has_more);
          if (tab === "comments") setComments(data.items as Comment[]);
          else setFiles(data.items as FileDiff[]);
        }
      } catch (e) {
        if (alive && id === generation.current) setError(errorText(e));
      } finally {
        if (alive && id === generation.current) setBusy(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [itemKey(item), tab, page, isDemo]);
  const address = safeLink(current.url, account.host);
  return (
    <aside className="detail" aria-label={tr("Item details", "条目详情")}>
      <header>
        <span className={`status ${current.state}`}>
          <ItemIcon item={current} />
          {stateText(current)}
        </span>
        <div className="head-actions">
          {address && (
            <a
              href={address}
              target="_blank"
              rel="noreferrer"
              title={tr("Open original", "打开原文")}
            >
              <ExternalLink size={16} />
            </a>
          )}
          <button
            className="icon"
            aria-label={tr("Close details", "关闭详情")}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="detail-title">
        <p>
          {current.repo} <span>#{current.number}</span>
        </p>
        <h2>{current.title}</h2>
        <p>
          {current.author} · {date(current.updated)}
        </p>
        {current.branch && (
          <div className="branch">
            <GitBranch size={13} />
            <code>{current.branch}</code>
            <span>→</span>
            <code>{current.base}</code>
          </div>
        )}
        <div className="labels">
          {current.labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
      <nav className="detail-tabs">
        {[
          ["overview", tr("Overview", "概览")],
          ["comments", tr("Discussion", "讨论")],
          ...(item.kind === "pull" ? [["files", tr("Files", "文件")]] : []),
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="detail-content" aria-busy={busy}>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : busy ? (
          <p className="muted">{tr("Loading…", "加载中…")}</p>
        ) : tab === "overview" ? (
          <Markdown
            text={current.body || tr("No description.", "暂无描述。")}
          />
        ) : tab === "comments" ? (
          <>
            {comments.length === 0 && (
              <p className="muted">
                {tr("No conversation comments.", "暂无讨论评论。")}
              </p>
            )}
            {comments.map((comment, i) => (
              <article className="comment" key={i}>
                <header>
                  <strong>{comment.author}</strong>
                  <time>{date(comment.at)}</time>
                </header>
                <Markdown text={comment.body} />
              </article>
            ))}
            <p className="hint">
              {tr(
                "Issue conversation only. Inline reviews and check runs are available on the original site.",
                "此处展示条目讨论；行内评审和检查结果请到原站查看。",
              )}
            </p>
          </>
        ) : (
          <>
            {files.length === 0 && (
              <p className="muted">
                {tr("No changed files.", "暂无变更文件。")}
              </p>
            )}
            {files.map((file, i) => (
              <article className="diff-file" key={i}>
                <header>
                  <Code2 size={14} />
                  <strong>{file.name}</strong>
                  <span>{file.status}</span>
                </header>
                {file.patch ? (
                  <pre>
                    {file.patch.split("\n").map((line, j) => (
                      <span
                        className={
                          line.startsWith("+")
                            ? "added"
                            : line.startsWith("-")
                              ? "removed"
                              : ""
                        }
                        key={j}
                      >
                        {line}
                        {"\n"}
                      </span>
                    ))}
                  </pre>
                ) : (
                  <p className="hint">
                    {tr(
                      "No text patch supplied (binary, unchanged or provider limit). Open the original to inspect it.",
                      "平台未提供文本差异（可能是二进制文件或平台限制），请打开原文查看。",
                    )}
                  </p>
                )}
              </article>
            ))}
          </>
        )}
        {tab !== "overview" && (
          <div className="pagination">
            <button
              disabled={page === 1 || busy}
              onClick={() => setPage((p) => p - 1)}
            >
              {tr("Previous", "上一页")}
            </button>
            <span>{page}</span>
            <button
              disabled={!more || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              {tr("Next", "下一页")}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
function App() {
  const [ready, setReady] = useState(false),
    [supported, setSupported] = useState(false),
    [accounts, setAccounts] = useState<Account[]>([]),
    [isDemo, setIsDemo] = useState(false);
  const [account, setAccount] = useState("all"),
    [kind, setKind] = useState<"pull" | "issue">("pull"),
    [scope, setScope] = useState("created"),
    [state, setState] = useState("open");
  const [search, setSearch] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [repo, setRepo] = useState(""),
    [repositories, setRepositories] = useState<Repository[]>([]),
    [repoPage, setRepoPage] = useState(1),
    [repoMore, setRepoMore] = useState(false);
  const [items, setItems] = useState<Item[]>([]),
    [selected, setSelected] = useState<Item | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [refresh, setRefresh] = useState(0),
    [updated, setUpdated] = useState("");
  const [connect, setConnect] = useState(false),
    [manage, setManage] = useState(false),
    [remove, setRemove] = useState<Account | null>(null);
  const active = accounts.filter((a) => account === "all" || a.id === account),
    accountIDs = active.map((a) => a.id).join(",");
  const exampleMode = useRef(false);
  async function loadAccounts() {
    const rows = (await accountCall("list")) as Account[];
    if (!exampleMode.current) setAccounts(rows);
    return rows;
  }
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const ctx = await myco?.ready;
        const ok = !!(
          ctx?.isolation &&
          myco?.os &&
          (await myco.os.has("forge.accounts"))
        );
        if (!alive) return;
        setSupported(ok);
        if (ok) await loadAccounts();
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    setSelected(null);
    setPage(1);
  }, [account, kind, scope, state, repo, submitted]);
  useEffect(() => {
    let alive = true;
    if (!accountIDs) {
      setItems([]);
      return;
    }
    setBusy(true);
    setError("");
    setItems([]);
    const run = async () => {
      if (isDemo) {
        let rows = demo().items.filter(
          (i) =>
            active.some((a) => a.id === i.account) &&
            i.kind === kind &&
            (state === "all" ||
              i.state === state ||
              (state === "closed" && i.state === "merged")) &&
            (!repo || i.repo === repo) &&
            (!submitted ||
              i.title.toLowerCase().includes(submitted.toLowerCase())),
        );
        if (scope === "assigned") rows = rows.slice(1);
        setItems(rows);
        setMore(false);
        setBusy(false);
        setUpdated(new Date().toLocaleTimeString());
        return;
      }
      const results = await Promise.all(
        active.map(async (a) => {
          try {
            return {
              account: a.id,
              result: await query<Page<Item>>({
                account: a.id,
                action: "list",
                kind,
                scope,
                state,
                repo,
                search: submitted,
                page,
              }),
            };
          } catch (e) {
            return { account: a.id, error: e };
          }
        }),
      );
      if (!alive) return;
      setItems(
        results
          .flatMap(
            (r) =>
              r.result?.items.map((i) => ({ ...i, account: r.account })) || [],
          )
          .sort((a, b) => b.updated.localeCompare(a.updated)),
      );
      setMore(results.some((r) => r.result?.has_more));
      setBusy(false);
      setUpdated(new Date().toLocaleTimeString());
      const errors = results
        .filter((r) => r.error)
        .map(
          (r) =>
            `${accounts.find((a) => a.id === r.account)?.name}: ${errorText(r.error)}`,
        );
      if (results.some((r) => r.result?.incomplete))
        errors.push(
          tr(
            "GitHub returned incomplete search results. Narrow your selection.",
            "GitHub 返回了不完整搜索结果，请缩小范围。",
          ),
        );
      setError(errors.join("\n"));
    };
    void run();
    return () => {
      alive = false;
    };
  }, [accountIDs, kind, scope, state, repo, submitted, page, refresh, isDemo]);
  useEffect(() => {
    let alive = true;
    setRepositories([]);
    setRepoMore(false);
    if (account === "all") return;
    if (isDemo) {
      setRepositories(demo().repositories);
      return;
    }
    void query<Page<Repository>>({ account, action: "repos", page: repoPage })
      .then((result) => {
        if (alive) {
          setRepositories(result.items);
          setRepoMore(result.has_more);
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [account, repoPage, isDemo, refresh]);
  function changeAccount(id: string) {
    setAccount(id);
    setRepo("");
    setRepoPage(1);
    setScope("created");
  }
  function example() {
    exampleMode.current = true;
    setIsDemo(true);
    setAccounts(demo().accounts);
    setAccount("all");
    setSelected(null);
    setRefresh((v) => v + 1);
    setError("");
  }
  async function leaveExample() {
    exampleMode.current = false;
    setIsDemo(false);
    setAccounts([]);
    setItems([]);
    setSelected(null);
    setRepo("");
    setAccount("all");
    if (supported)
      try {
        await loadAccounts();
      } catch (e) {
        setError(errorText(e));
      }
  }
  async function disconnect() {
    if (!remove) return;
    try {
      await accountCall("remove", { id: remove.id });
      changeAccount("all");
      setRemove(null);
      await loadAccounts();
    } catch (e) {
      setError(errorText(e));
    }
  }
  const currentAccount = selected
    ? accounts.find((a) => a.id === selected.account)
    : null;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <GitBranch size={21} />
          <strong>{tr("Code hosts", "代码托管")}</strong>
          <span className="read-only">{tr("Read only", "只读")}</span>
        </div>
        <nav className="sections">
          <button
            className={kind === "pull" ? "active" : ""}
            onClick={() => setKind("pull")}
          >
            <GitPullRequest size={17} />
            {tr("Pull requests", "Pull requests")}
          </button>
          <button
            className={kind === "issue" ? "active" : ""}
            onClick={() => {
              setKind("issue");
              if (scope === "review") setScope("created");
            }}
          >
            <CircleDot size={17} />
            {tr("Issues", "Issues")}
          </button>
        </nav>
        <div className="section-heading">
          <span>{tr("ACCOUNTS", "账户")}</span>
          <button
            className="icon"
            title={tr("Manage accounts", "管理账户")}
            aria-label={tr("Manage accounts", "管理账户")}
            onClick={() => setManage(!manage)}
          >
            <Settings2 size={14} />
          </button>
        </div>
        <nav className="account-list">
          <button
            className={account === "all" ? "active" : ""}
            onClick={() => changeAccount("all")}
          >
            <Inbox size={17} />
            <span>{tr("All accounts", "全部账户")}</span>
            {accounts.length > 0 && <small>{accounts.length}</small>}
          </button>
          {accounts.map((a) => (
            <div className="account-row" key={a.id}>
              <button
                className={account === a.id ? "active" : ""}
                onClick={() => changeAccount(a.id)}
              >
                <ProviderIcon provider={a.provider} />
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {a.login} · {new URL(a.host).host}
                  </small>
                </span>
              </button>
              {manage && !isDemo && (
                <button
                  className="icon remove"
                  title={tr("Disconnect account", "断开账户")}
                  aria-label={`${tr("Disconnect", "断开")} ${a.name}`}
                  onClick={() => setRemove(a)}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </nav>
        <button
          className="connect-link"
          onClick={() => setConnect(true)}
          disabled={!ready || isDemo}
        >
          <Plus size={15} />
          {tr("Connect account", "连接账户")}
        </button>
        <div className="sidebar-bottom">
          <LockKeyhole size={15} />
          <p>
            {tr(
              "Your credentials stay on this computer.",
              "你的凭证只留在这台电脑。",
            )}
          </p>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {tr("YOUR DEVELOPMENT INBOX", "你的代码协作收件箱")}
            </p>
            <h1>
              {kind === "pull"
                ? tr("Pull requests", "Pull requests")
                : tr("Issues", "Issues")}
            </h1>
          </div>
          <div className="head-actions">
            {isDemo ? (
              <button onClick={leaveExample}>
                {tr("Exit example", "退出示例")}
              </button>
            ) : accounts.length > 0 ? (
              <button onClick={() => setConnect(true)}>
                <Plus size={14} />
                {tr("Account", "账户")}
              </button>
            ) : null}
            <button
              className="icon"
              aria-label={tr("Refresh", "刷新")}
              title={tr("Refresh", "刷新")}
              disabled={busy || !accounts.length}
              onClick={() => setRefresh((v) => v + 1)}
            >
              <RefreshCw size={16} className={busy ? "spin" : ""} />
            </button>
          </div>
        </header>
        {isDemo && (
          <div className="demo-banner">
            <span>{tr("EXAMPLE", "示例")}</span>
            {tr(
              "Fictional data. No account or network access.",
              "模拟数据，不读取账户或访问网络。",
            )}
          </div>
        )}
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        {!accounts.length ? (
          <section className="empty">
            <div className="empty-mark">
              <GitPullRequest size={30} />
              <CircleDot size={23} />
            </div>
            <h2>
              {tr(
                "Keep your code conversations together",
                "把代码协作汇集到一处",
              )}
            </h2>
            <p>
              {tr(
                "Connect GitHub, GitLab or Gitea to see pull requests and issues across your accounts. Find what needs your attention without switching tabs.",
                "连接 GitHub、GitLab 或 Gitea，集中查看多个账户的 PR 和 Issue，快速找到需要你关注的事项。",
              )}
            </p>
            <button
              className="primary"
              disabled={!ready}
              onClick={() => setConnect(true)}
            >
              <Plus size={16} />
              {tr("Connect your first account", "连接第一个账户")}
            </button>
            <button className="plain" onClick={example}>
              {tr("Explore an example", "查看示例")}
              <ChevronRight size={14} />
            </button>
            {ready && !supported && (
              <p className="upgrade">{errorText({ code: "unsupported" })}</p>
            )}
            <div className="privacy-inline">
              <ShieldCheck size={14} />
              {tr(
                "Read only · Private data stays local",
                "只读访问 · 私有内容留在本机",
              )}
            </div>
          </section>
        ) : (
          <>
            <div className="filters">
              <div className="scope-tabs">
                {[
                  ["created", tr("Created by me", "我创建的")],
                  ["assigned", tr("Assigned to me", "分配给我")],
                  ...(kind === "pull"
                    ? [["review", tr("Review requested", "待我评审")]]
                    : []),
                  ...(account !== "all"
                    ? [["repo", tr("Repository", "仓库")]]
                    : []),
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={scope === value}
                    onClick={() => {
                      setScope(value);
                      if (
                        value === "review" &&
                        active.some((a) => a.provider === "gitea")
                      )
                        setRepo("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="filter-controls">
                <form
                  className="search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubmitted(search);
                    setPage(1);
                  }}
                >
                  <Search size={15} />
                  <input
                    aria-label={tr("Search titles", "搜索标题")}
                    placeholder={tr("Search…", "搜索…")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      className="icon"
                      type="button"
                      aria-label={tr("Clear search", "清空搜索")}
                      onClick={() => {
                        setSearch("");
                        setSubmitted("");
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </form>
                <select
                  aria-label={tr("Status", "状态")}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                >
                  <option value="open">{tr("Open", "打开")}</option>
                  <option value="closed">
                    {tr("Closed / merged", "已关闭 / 已合并")}
                  </option>
                  <option value="all">{tr("All statuses", "全部状态")}</option>
                </select>
              </div>
            </div>
            {account !== "all" && (
              <div className="repo-filter">
                <GitBranch size={14} />
                <select
                  disabled={
                    scope === "review" &&
                    active.some((a) => a.provider === "gitea")
                  }
                  aria-label={tr("Repository", "仓库")}
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                >
                  <option value="">
                    {scope === "repo"
                      ? tr("Select a repository", "请选择仓库")
                      : tr("All repositories", "全部仓库")}
                  </option>
                  {repositories.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                      {r.private ? ` · ${tr("Private", "私有")}` : ""}
                    </option>
                  ))}
                </select>
                {repoPage > 1 && (
                  <button onClick={() => setRepoPage((p) => p - 1)}>
                    {tr("Previous repositories", "上一页仓库")}
                  </button>
                )}
                {repoMore && (
                  <button onClick={() => setRepoPage((p) => p + 1)}>
                    {tr("More repositories", "更多仓库")}
                  </button>
                )}
              </div>
            )}
            <div className="results" aria-busy={busy}>
              {busy ? (
                <div className="list-empty">
                  <RefreshCw className="spin" size={20} />
                  {tr("Loading your inbox…", "正在加载收件箱…")}
                </div>
              ) : items.length === 0 ? (
                <div className="list-empty">
                  <Check size={27} />
                  <h2>{tr("Nothing here right now", "当前没有条目")}</h2>
                  <p>
                    {tr(
                      "Try another scope, account or status.",
                      "可以切换范围、账户或状态。",
                    )}
                  </p>
                </div>
              ) : (
                items.map((item) => {
                  const a = accounts.find((a) => a.id === item.account)!;
                  return (
                    <button
                      key={itemKey(item)}
                      className={`item-row ${selected && itemKey(selected) === itemKey(item) ? "selected" : ""}`}
                      onClick={() => setSelected(item)}
                    >
                      <span
                        className={`item-icon ${item.state} ${item.draft ? "draft" : ""}`}
                      >
                        <ItemIcon item={item} />
                      </span>
                      <div className="item-main">
                        <strong>{item.title}</strong>
                        <p>
                          <span>{item.repo}</span>
                          <span>#{item.number}</span>
                          <span>·</span>
                          <span>{item.author}</span>
                          {item.draft && <span>{tr("Draft", "草稿")}</span>}
                        </p>
                      </div>
                      <div className="item-labels">
                        {item.labels.slice(0, 2).map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                      <div className="item-meta">
                        <span>
                          <ProviderIcon provider={a.provider} />
                          <span>{a.login}</span>
                        </span>
                        <time>{date(item.updated)}</time>
                      </div>
                      {item.comments > 0 && (
                        <span className="comment-count">
                          <MessageSquare size={13} />
                          {item.comments}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <footer className="result-footer">
              <span>
                {items.length} {tr("loaded", "条已加载")}
                {updated && ` · ${tr("Updated", "更新于")} ${updated}`}
              </span>
              <div className="pagination">
                <button
                  disabled={page === 1 || busy}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {tr("Previous", "上一页")}
                </button>
                <span>{page}</span>
                <button
                  disabled={!more || busy}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {tr("Next", "下一页")}
                </button>
              </div>
            </footer>
          </>
        )}
      </main>
      {selected && currentAccount && (
        <Detail
          key={itemKey(selected)}
          item={selected}
          account={currentAccount}
          isDemo={isDemo}
          close={() => setSelected(null)}
        />
      )}
      {connect && (
        <ConnectDialog
          supported={supported}
          close={() => setConnect(false)}
          connected={(a) => {
            setAccounts((rows) => [
              ...rows.filter(
                (r) =>
                  !(
                    r.provider === a.provider &&
                    r.host === a.host &&
                    r.login === a.login
                  ),
              ),
              a,
            ]);
            changeAccount(a.id);
            setConnect(false);
            setRefresh((v) => v + 1);
          }}
        />
      )}
      {remove && (
        <div
          className="confirmation"
          role="alertdialog"
          aria-modal="true"
          aria-label={tr("Disconnect account", "断开账户")}
        >
          <div>
            <h2>
              {tr("Disconnect", "断开")} {remove.name}?
            </h2>
            <p>
              {tr(
                "This removes the saved credential from this page. It does not revoke the provider token or sign out your CLI.",
                "将移除此页面保存的本机凭证，不会撤销平台令牌，也不会退出 CLI 登录。",
              )}
            </p>
            <p>
              <a
                href={
                  remove.host +
                  (remove.provider === "github"
                    ? "/settings/tokens"
                    : remove.provider === "gitlab"
                      ? "/-/user_settings/personal_access_tokens"
                      : "/user/settings/applications")
                }
                target="_blank"
                rel="noreferrer"
              >
                {tr("Manage provider tokens", "管理平台令牌")}{" "}
                <ExternalLink size={12} />
              </a>
            </p>
            <footer>
              <button onClick={() => setRemove(null)}>
                {tr("Cancel", "取消")}
              </button>
              <button className="danger" onClick={disconnect}>
                {tr("Disconnect", "断开")}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
