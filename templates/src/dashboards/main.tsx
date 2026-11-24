import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, ChartArea, ChartNoAxesCombined, CircleHelp, Hash, LayoutGrid, PanelTop, Pencil, PieChart, Plus, RefreshCw, Table2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import { myco, type MycoRecord } from "../_lib/myco";
import { language } from "../_lib/i18n";
import { appFragment, readAppRoute, subscribeAppRoute } from "../_lib/page-route";
import { Chart } from "./charts";
import { Dialog, Editor } from "./editor";
import { boardFrom, createID, datasetFrom, kindTitle, tr, type Board, type Dataset, type Kind, validID } from "./model";
import "./style.css";

type View = { boards: MycoRecord<Board>[]; datasets: Map<string, Dataset> };
const icons = { line: ChartNoAxesCombined, area: ChartArea, bar: BarChart3, donut: PieChart, metric: Hash, table: Table2 };

async function fetchView(): Promise<View> {
  const { records } = await myco!.data.list();
  const boards = records.filter(record => record.collection === "dashboards").map(boardFrom);
  const datasets = new Map<string, Dataset>();
  for (const record of records) {
    if (record.collection !== "datasets") continue;
    const data = datasetFrom(record.data);
    if (data) datasets.set(record.id, data);
  }
  boards.sort((a, b) => a.id === "overview" ? -1 : b.id === "overview" ? 1 : a.data.title.localeCompare(b.data.title));
  return { boards, datasets };
}

function selection() {
  try {
    const route = readAppRoute(location.hash);
    const id = route?.params.get("id") || "";
    return route?.name === "dashboard" && validID(id) ? id : "";
  } catch { return ""; }
}

function PanelIcon({ kind }: { kind: Kind }) {
  const Icon = icons[kind];
  return <Icon size={15} aria-hidden="true"/>;
}

function Dashboards({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = useState<View>({ boards: [], datasets: new Map() });
  const [chosen, setChosen] = useState(selection);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [editor, setEditor] = useState<"new" | MycoRecord<Board> | null>(null);
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState("");
  const [, updateLanguage] = useState(0);
  const inFlight = useRef(false);

  async function reload() {
    if (inFlight.current) return false;
    inFlight.current = true;
    setLoad("loading");
    try { setView(await fetchView()); setLoad("ready"); return true; }
    catch { setLoad("error"); return false; }
    finally { inFlight.current = false; }
  }
  useEffect(() => {
    void reload();
    function followLink() { setChosen(selection()); }
    const unroute = subscribeAppRoute(followLink);
    const unlisten = myco?.on?.("preferences", () => {
      document.documentElement.lang = language();
      updateLanguage(value => value + 1);
    });
    return () => { unroute(); unlisten?.(); };
  }, []);

  function choose(id: string) {
    setChosen(id);
    history.replaceState(null, "", id ? appFragment("dashboard", { id }) : location.pathname + location.search);
  }
  const board = view.boards.find(item => item.id === chosen) ?? view.boards[0];
  const dates = board?.data.panels.flatMap(panel => {
    const captured = view.datasets.get(panel.dataset)?.captured;
    return captured ? [Date.parse(captured)] : [];
  }) || [];
  const caption = dates.length
    ? new Intl.DateTimeFormat(language() === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(Math.max(...dates))
    : "";

  async function save(draft: Board) {
    const record = typeof editor === "object" ? editor : null;
    const id = record?.id || createID();
    const saved = await myco!.data.put("dashboards", draft, { id, ifVersion: record?.version ?? 0 }).catch(error => {
      if (error?.code === "conflict") void reload();
      throw error;
    });
    const updated = boardFrom(saved);
    setView(current => ({ ...current, boards: [...current.boards.filter(item => item.id !== id), updated] }));
    choose(id);
    setEditor(null);
    setNotice(tr("Layout saved", "布局已保存"));
  }
  async function remove() {
    if (!editor || editor === "new") return;
    await myco!.data.remove("dashboards", editor.id, { ifVersion: editor.version });
    setView(current => ({ ...current, boards: current.boards.filter(item => item.id !== editor.id) }));
    choose("");
    setEditor(null);
    setNotice(tr("Dashboard deleted", "已删除仪表盘"));
  }

  return <div className="dash-shell">
    <header className="dash-top">
      <div className="dash-brand"><span><LayoutGrid size={17}/></span><strong>{tr("Dashboards", "数据仪表盘")}</strong></div>
      <div className="dash-actions">
        <button className="dash-icon" title={tr("Agent data guide", "Agent 写入指南")} aria-label={tr("Agent data guide", "Agent 写入指南")} onClick={() => setHelp(true)}><CircleHelp size={19}/></button>
        {canEdit && <button className="dash-btn primary" onClick={() => setEditor("new")}><Plus size={16}/>{tr("New dashboard", "新建仪表盘")}</button>}
      </div>
    </header>
    <aside className="dash-sidebar"><h2>{tr("Dashboards", "仪表盘")}</h2>
      <nav aria-label={tr("Dashboards", "仪表盘")}>{view.boards.map(item =>
        <button key={item.id} aria-current={board?.id === item.id ? "page" : undefined} onClick={() => choose(item.id)}><PanelTop size={16}/><span>{item.data.title || tr("Untitled dashboard", "未命名仪表盘")}</span></button>,
      )}</nav>
    </aside>
    <main className="dash-main">
      <div className="dash-between dash-page-title">
        <div><h1>{board?.data.title || tr("Dashboards", "数据仪表盘")}</h1>{board?.data.description && <p>{board.data.description}</p>}</div>
        <div className="dash-actions">
          <button className="dash-btn" aria-busy={load === "loading"} disabled={load === "loading"} onClick={() => {
            setNotice("");
            void reload().then(ok => { if (ok) setNotice(tr("Snapshot reloaded", "已重新加载快照")); });
          }}><RefreshCw size={15}/>{tr("Reload data", "重新加载数据")}</button>
          {canEdit && board && <button className="dash-btn" disabled={load === "loading"} onClick={() => setEditor(board)}><Pencil size={15}/>{tr("Edit layout", "编辑布局")}</button>}
        </div>
      </div>
      {load === "error" && <p role="alert" className="dash-error">{tr("Could not load dashboard data. Try reloading.", "无法读取仪表盘数据，请重试。")}</p>}
      {board && <div className="dash-snapshot"><Activity size={14}/>{caption ? tr("Latest snapshot", "最新快照") + " · " + caption : tr("Waiting for a snapshot", "等待数据快照")}</div>}
      {notice && <div className="dash-sr" role="status">{notice}</div>}
      {board?.data.panels.length ? <div className="dash-grid">{board.data.panels.map(panel =>
        <article key={panel.id} className={`dash-card is-${panel.width} is-${panel.kind}`}>
          <header><h2>{panel.title || kindTitle(panel.kind)}</h2><span title={kindTitle(panel.kind)}><PanelIcon kind={panel.kind}/></span></header>
          <Chart panel={panel} dataset={view.datasets.get(panel.dataset)}/>
        </article>,
      )}</div> : load !== "error" && <div className="dash-empty"><LayoutGrid size={27}/><h2>
        {load === "loading" ? tr("Loading dashboards…", "正在读取仪表盘…") : board ? tr("No panels yet", "还没有面板") : tr("No dashboards yet", "还没有仪表盘")}
      </h2>{load === "ready" && <p>{board ? tr("Add a panel and connect it to a dataset.", "添加面板并连接数据集。") : tr("Create a dashboard to display data collected by an agent.", "创建仪表盘，展示 Agent 收集的数据。")}</p>}</div>}
    </main>
    {editor && <Editor board={editor === "new" ? undefined : editor.data} close={() => setEditor(null)} datasets={view.datasets} save={save} remove={editor === "new" ? undefined : remove}/>}
    {help && <Dialog title={tr("Agent data guide", "Agent 写入指南")} close={() => setHelp(false)}>
      <div className="dash-help">
        <p>{tr("Ask an agent to write a dataset to this page. Connect panels to its ID in Edit layout. Open the dashboard again or select Reload data to see a new snapshot.", "让 Agent 向此页面写入数据集，然后在编辑布局中选择数据集 ID。重新打开仪表盘，或点击重新加载数据，就能看到最新快照。")}</p>
        <p>{tr("Share this page ID with your agent:", "把此页面 ID 发给 Agent：")} <code>{pageID}</code></p>
        <pre>{`myco page data put --page '${pageID}' --collection datasets --id weekly_usage --file snapshot.json`}</pre>
        <pre>{JSON.stringify({ title: "Weekly usage", captured: "2026-11-24T10:00:00Z", columns: ["Day", "Requests"], rows: [["Monday", 128], ["Tuesday", 164]] }, null, 2)}</pre>
      </div>
    </Dialog>}
  </div>;
}

const root = createRoot(document.getElementById("root")!);
let pageID = "";
async function start() {
  if (!myco) {
    root.render(<p className="dash-outside">{tr("Open this page in the Myco App.", "请在 Myco App 内打开此页面。")}</p>);
    return;
  }
  try {
    const ctx = await myco.ready;
    pageID = ctx.page.id;
    document.documentElement.lang = language();
    root.render(<Dashboards canEdit={ctx.me?.can_edit !== false && !ctx.render}/>);
  } catch {
    root.render(<p className="dash-outside" role="alert">{tr("Could not connect to the Myco App.", "无法连接 Myco App。")}</p>);
  }
}
void start();
