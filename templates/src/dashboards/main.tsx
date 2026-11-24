import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleHelp, Clock3, LayoutGrid, Pencil, Plus, RefreshCw, Settings2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import { myco, type MycoRecord } from "../_lib/myco";
import { language } from "../_lib/i18n";
import { appFragment, readAppRoute, subscribeAppRoute } from "../_lib/page-route";
import { Chart } from "./charts";
import { DetailsEditor, Dialog, PanelEditor } from "./editor";
import { Grid } from "./grid";
import { placePanels, nextPanelPosition, changePosition, type PositionedPanel } from "./layout";
import { boardFrom, createID, datasetFrom, maxPanels, newPanel, tr, validID, type Board, type Dataset, type Panel } from "./model";
import "./style.css";

type View = { boards: MycoRecord<Board>[]; datasets: Map<string, Dataset> };
type LayoutDraft = { id: string; baseVersion: number; title: string; description: string; panels: PositionedPanel[] };

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

function Dashboards({ canEdit, pageID }: { canEdit: boolean; pageID: string }) {
  const [view, setView] = useState<View>({ boards: [], datasets: new Map() });
  const [chosen, setChosen] = useState(selection);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [edit, setEdit] = useState<LayoutDraft | null>(null);
  const [details, setDetails] = useState(false);
  const [pane, setPane] = useState<Panel | null>(null);
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
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
    const unroute = subscribeAppRoute(() => setChosen(selection()));
    const unlisten = myco?.on?.("preferences", () => {
      document.documentElement.lang = language() === "zh" ? "zh-CN" : "en";
      updateLanguage(value => value + 1);
    });
    return () => { unroute(); unlisten?.(); };
  }, []);

  function choose(id: string) {
    setChosen(id);
    history.replaceState(null, "", id ? appFragment("dashboard", { id }) : location.pathname + location.search);
  }
  const board = view.boards.find(item => item.id === chosen) ?? view.boards[0];
  const panels = edit?.panels ?? placePanels(board?.data.panels || []);
  const dates = panels.flatMap(panel => {
    const captured = view.datasets.get(panel.dataset)?.captured;
    return captured ? [Date.parse(captured)] : [];
  });
  const caption = dates.length
    ? new Intl.DateTimeFormat(language() === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(Math.max(...dates))
    : "";
  const leaveEdit = () => { setEdit(null); setSaveError(""); };

  async function save() {
    if (!edit || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const { id, baseVersion, ...data } = edit;
      const record = await myco!.data.put("dashboards", data, { id, ifVersion: baseVersion });
      setView(current => ({ ...current, boards: [...current.boards.filter(item => item.id !== id), boardFrom(record)] }));
      choose(id);
      leaveEdit();
      setNotice(tr("Layout saved", "布局已保存"));
    } catch (error) {
      const conflict = (error as { code?: string })?.code === "conflict";
      if (conflict) void reload();
      setSaveError(conflict ? tr("This dashboard changed elsewhere. Exit editing to load the latest layout.", "此仪表盘已被修改。退出编辑后可查看最新布局。")
        : tr("Could not save the layout. Try again.", "无法保存布局，请重试。"));
    } finally { setSaving(false); }
  }
  async function remove() {
    if (!edit?.baseVersion) return;
    await myco!.data.remove("dashboards", edit.id, { ifVersion: edit.baseVersion });
    setView(current => ({ ...current, boards: current.boards.filter(item => item.id !== edit.id) }));
    setDetails(false);
    choose("");
    leaveEdit();
    setNotice(tr("Dashboard deleted", "已删除仪表盘"));
  }
  function applyPanel(panel: Panel) {
    setEdit(current => {
      if (!current) return current;
      const existing = current.panels.find(item => item.id === panel.id);
      const position = existing?.position ?? nextPanelPosition(current.panels, panel.kind);
      const updated = existing ? current.panels.map(item => item.id === panel.id ? { ...panel, position } : item)
        : [...current.panels, { ...panel, position }];
      return { ...current, panels: changePosition(updated, panel.id, position) };
    });
    setPane(null);
  }

  return <div className="dash-shell">
    <header className="dash-top">
      <div className="dash-start">
        <div className="dash-switcher"><LayoutGrid size={16} aria-hidden="true"/>
          <select aria-label={tr("Switch dashboard", "切换仪表盘")} disabled={!!edit} value={edit?.id || board?.id || ""} onChange={event => choose(event.target.value)}>
            {!board && !edit && <option value="">{tr("Dashboards", "仪表盘")}</option>}
            {edit && !edit.baseVersion && <option value={edit.id}>{edit.title}</option>}
            {view.boards.map(item => <option value={item.id} key={item.id}>{edit?.id === item.id ? edit.title : item.data.title || tr("Untitled dashboard", "未命名仪表盘")}</option>)}
          </select>
          <ChevronDown size={14} aria-hidden="true"/>
        </div>
        {canEdit && !edit && <button className="dash-icon" aria-label={tr("New dashboard", "新建仪表盘")} title={tr("New dashboard", "新建仪表盘")} onClick={() => setDetails(true)}><Plus size={17}/></button>}
        {caption && !edit && <span className="dash-snapshot" title={tr("Latest snapshot", "最新快照") + " · " + caption}><Clock3 size={13}/>{caption}</span>}
      </div>
      <div className="dash-actions">
        {edit ? <>
          <button className="dash-icon" title={tr("Dashboard settings", "仪表盘设置")} aria-label={tr("Dashboard settings", "仪表盘设置")} onClick={() => setDetails(true)} disabled={saving}><Settings2 size={17}/></button>
          <button className="dash-btn" onClick={() => setPane(newPanel())} disabled={saving || panels.length >= maxPanels}><Plus size={15}/>{tr("Add panel", "添加面板")}</button>
          <button className="dash-btn" onClick={leaveEdit} disabled={saving}>{tr("Cancel", "取消")}</button>
          <button className="dash-btn primary" onClick={() => void save()} disabled={saving}>{saving ? tr("Saving…", "正在保存…") : tr("Save layout", "保存布局")}</button>
        </> : <>
          <button className="dash-icon" title={tr("Agent data guide", "Agent 写入指南")} aria-label={tr("Agent data guide", "Agent 写入指南")} onClick={() => setHelp(true)}><CircleHelp size={18}/></button>
          <button className="dash-icon" title={tr("Reload data", "重新加载数据")} aria-label={tr("Reload data", "重新加载数据")} aria-busy={load === "loading"} disabled={load === "loading"} onClick={() => {
            setNotice("");
            void reload().then(ok => { if (ok) setNotice(tr("Snapshot reloaded", "已重新加载快照")); });
          }}><RefreshCw size={16}/></button>
          {canEdit && board && <button className="dash-btn" disabled={load === "loading"} onClick={() => setEdit({ id: board.id, baseVersion: board.version, ...board.data, panels })}>
            <Pencil size={14}/>{tr("Edit layout", "编辑布局")}
          </button>}
        </>}
      </div>
    </header>
    <main className="dash-main" aria-label={edit?.title || board?.data.title || tr("Dashboards", "仪表盘")}>
      {(load === "error" || saveError) && <p role="alert" className="dash-error">{saveError || tr("Could not load dashboard data. Try reloading.", "无法读取仪表盘数据，请重试。")}</p>}
      {notice && <div className="dash-sr" role="status">{notice}</div>}
      {panels.length ? <Grid panels={panels} edit={edit ? {
        panels,
        change: next => setEdit(current => current && ({ ...current, panels: next })),
        settings: id => setPane(panels.find(panel => panel.id === id) ?? null),
      } : undefined} render={panel => <Chart key={language()} panel={panel} dataset={view.datasets.get(panel.dataset)}/>}/>
        : load !== "error" && <div className="dash-empty"><LayoutGrid size={25} aria-hidden="true"/>
          <p>{load === "loading" ? tr("Loading dashboards…", "正在读取仪表盘…")
            : board || edit ? tr("No panels yet", "还没有面板") : tr("No dashboards yet", "还没有仪表盘")}</p>
          {edit && <button className="dash-btn" onClick={() => setPane(newPanel())}><Plus size={15}/>{tr("Add your first panel", "添加第一个面板")}</button>}
          {canEdit && !board && !edit && load === "ready" && <button className="dash-btn" onClick={() => setDetails(true)}>{tr("Create a dashboard", "创建仪表盘")}</button>}
        </div>}
    </main>
    {details && <DetailsEditor board={edit ?? undefined} close={() => setDetails(false)} remove={edit?.baseVersion ? remove : undefined}
      apply={(title, description) => {
        setEdit(current => current ? { ...current, title, description } : { id: createID(), baseVersion: 0, title, description, panels: [] });
        setDetails(false);
      }}/>}
    {pane && <PanelEditor panel={pane} datasets={view.datasets} isNew={!panels.some(panel => panel.id === pane.id)} apply={applyPanel}
      remove={() => { setEdit(current => current && ({ ...current, panels: current.panels.filter(panel => panel.id !== pane.id) })); setPane(null); }}
      close={() => setPane(null)}/>}
    {help && <Dialog title={tr("Agent data guide", "Agent 写入指南")} close={() => setHelp(false)}>
      <div className="dash-help">
        <p>{tr("Ask an agent to write a dataset to this page. Connect a panel to that dataset in Panel settings. Open the page again or select Reload data to see a new snapshot.", "让 Agent 向此页面写入数据，再在面板设置中连接数据集。重新打开页面，或点击重新加载数据，就能看到最新快照。")}</p>
        <p>{tr("Share this page ID with your agent:", "把此页面 ID 发给 Agent：")} <code>{pageID}</code></p>
        <pre>{`myco page data put --page '${pageID}' --collection datasets --id weekly_usage --file snapshot.json`}</pre>
        <pre>{JSON.stringify({ title: "Weekly usage", captured: "2026-11-24T10:00:00Z", columns: ["Day", "Requests"], rows: [["Monday", 128], ["Tuesday", 164]] }, null, 2)}</pre>
      </div>
    </Dialog>}
  </div>;
}

const root = createRoot(document.getElementById("root")!);
async function start() {
  if (!myco) {
    root.render(<p className="dash-outside">{tr("Open this page in the Myco App.", "请在 Myco App 内打开此页面。")}</p>);
    return;
  }
  try {
    const ctx = await myco.ready;
    document.documentElement.lang = language() === "zh" ? "zh-CN" : "en";
    root.render(<Dashboards pageID={ctx.page.id} canEdit={ctx.me?.can_edit !== false && !ctx.render}/>);
  } catch {
    root.render(<p className="dash-outside" role="alert">{tr("Could not connect to the Myco App.", "无法连接 Myco App。")}</p>);
  }
}
void start();
