import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDownToLine, ArrowRight, FileCode2, FolderOpen, GitFork, Network, Search, Upload, X } from "lucide-react";
import { language } from "../_lib/i18n";
import { myco } from "../_lib/myco";
import { demo } from "./demo";
import { indexGraph, maxGraphSize, readGraph, shortestPath, type Edge, type Graph, type Node } from "./model";
import { scanFolder } from "./scan";
import "./style.css";

const tr = (en: string, zh: string) => language() === "zh" ? zh : en;
const source = (file: string, line: string) => [file, line].filter(Boolean).join(":");
const palette = ["#3678b7", "#418875", "#a06636", "#8b5a9e", "#a64c66", "#667786"];
const errors = (code: string) => ({
  invalid: tr("Invalid graph JSON. Check that node IDs are unique and every link points to an existing node.", "图谱 JSON 无效。请检查节点 ID 是否唯一、关系两端是否存在。"),
  limit: tr("The graph is too large. Use a file under 16 MiB with at most 20,000 nodes and 100,000 links.", "图谱超出上限。请使用小于 16 MiB、最多 20,000 个节点和 100,000 条关系的文件。"),
  folder_limit: tr("This folder exceeds 5,000 supported files or 128 MiB of text. Choose a smaller folder.", "此文件夹超出 5,000 个受支持文件或 128 MiB 文本的上限，请选择较小的文件夹。"),
  empty: tr("No supported code or documentation files were found.", "未找到受支持的代码或文档文件。"),
}[code] || tr("Unable to read the selected files.", "无法读取选中的文件。"));

function Evidence({ edge }: { edge: Edge }) {
  const confidence = edge.confidence === "EXTRACTED" ? tr("Extracted", "来源明确")
    : edge.confidence === "INFERRED" ? tr("Inferred", "推断") : edge.confidence;
  return <div className="evidence">
    <div className="tags"><span>{edge.relation}</span>{confidence && <span>{confidence}</span>}</div>
    {edge.file && <code>{source(edge.file, edge.location)}</code>}
  </div>;
}

function MapView({ nodes, links, active, path, onSelect }: {
  nodes: Node[]; links: Edge[]; active: string; path: Set<Edge>; onSelect: (id: string) => void;
}) {
  const columns = Math.min(nodes.length, path.size ? 5 : 4);
  const rows = Math.ceil(nodes.length / columns);
  const width = Math.max(340, columns * 145), height = Math.max(340, rows * 82);
  const positions = new Map(nodes.map((node, index) => [node.id, {
    x: ((path.size && Math.floor(index / columns) % 2 ? columns - 1 - index % columns : index % columns) + .5) * width / columns,
    y: (Math.floor(index / columns) + .5) * height / rows,
  }]));
  const groups = [...new Set(nodes.map(node => node.group))].sort();
  const drawn = links.filter(edge => positions.has(edge.source) && positions.has(edge.target));
  const drawnPath = drawn.filter(edge => path.has(edge));
  const visibleLinks = [...drawn.filter(edge => !path.has(edge)).slice(0, Math.max(0, 240 - drawnPath.length)), ...drawnPath];
  return <div className="map-scroll">
    <div className="map" style={{ minWidth: width, minHeight: height }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {visibleLinks.map((edge, index) => {
          const a = positions.get(edge.source)!, b = positions.get(edge.target)!;
          return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            className={path.has(edge) ? "path-link" : edge.source === active || edge.target === active ? "active-link" : undefined}/>;
        })}
      </svg>
      {nodes.map(node => {
        const point = positions.get(node.id)!;
        return <button key={node.id} className="map-node" aria-pressed={active === node.id}
          title={source(node.file, node.location) || node.label} onClick={() => onSelect(node.id)}
          style={{ left: `${point.x / width * 100}%`, top: `${point.y / height * 100}%`, "--node-accent": palette[groups.indexOf(node.group) % palette.length] } as CSSProperties}>
          <span aria-hidden="true"/><strong>{node.label}</strong>
        </button>;
      })}
    </div>
  </div>;
}

function App() {
  const [workspace, setWorkspace] = useState<{ title: string; graph: Graph } | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [neighborPage, setNeighborPage] = useState(1);
  const [pathPage, setPathPage] = useState(1);
  const [nodePage, setNodePage] = useState(1);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const filePicker = useRef<HTMLInputElement>(null), folderPicker = useRef<HTMLInputElement>(null);
  useEffect(() => { folderPicker.current?.setAttribute("webkitdirectory", ""); }, []);
  const graph = workspace?.graph;
  const index = useMemo(() => graph && indexGraph(graph), [graph]);
  const current = index?.nodes.get(selected);
  const neighbors = index?.neighbors.get(selected) ?? [];
  const path = useMemo(() => index && start && end ? shortestPath(index.neighbors, start, end) : null, [index, start, end]);
  const search = query.trim().toLowerCase();
  const filtered = useMemo(() => graph?.nodes.filter(node =>
    !search || [node.label, node.file, node.kind, node.group, node.id].some(value => value.toLowerCase().includes(search)),
  ) ?? [], [graph, search]);
  const graphNodes = useMemo(() => {
    if (!index) return [];
    if (path?.length) return [...new Set([start, ...path.map(step => step.to)])].slice(0, 36).map(id => index.nodes.get(id)!);
    if (search || !current) return filtered.slice(0, 28);
    const adjacent = index.neighbors.get(current.id) ?? [];
    return [...new Set([current.id, ...adjacent.map(step => step.to)])].slice(0, 28).map(id => index.nodes.get(id)!);
  }, [index, path, start, search, current, filtered]);

  function open(title: string, next: Graph) {
    setWorkspace({ title, graph: next });
    setSelected(""); setQuery(""); setStart(""); setEnd("");
    setNeighborPage(1); setNodePage(1); setError("");
  }
  function select(id: string) {
    setSelected(id); setNeighborPage(1);
  }
  async function importFiles(event: ChangeEvent<HTMLInputElement>, directory: boolean) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    setBusy(true); setError("");
    try {
      const [first] = files;
      if (directory) {
        open(first.webkitRelativePath.split("/")[0], await scanFolder(files));
      } else {
        if (first.size > maxGraphSize) throw new Error("limit");
        let input: unknown;
        try { input = JSON.parse(await first.text()); } catch { throw new Error("invalid"); }
        open(first.name, readGraph(input));
      }
    } catch (failure) {
      setError(errors(failure instanceof Error ? failure.message : ""));
    } finally {
      setBusy(false);
    }
  }
  function exportGraph() {
    if (!graph) return;
    const href = URL.createObjectURL(new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = href; anchor.download = "code-graph.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  const heading = tr("Code Graph", "代码图谱");
  const importButtons = <>
    <button type="button" onClick={() => filePicker.current?.click()} disabled={busy}><Upload size={16}/>{tr("Import graph", "导入图谱")}</button>
    <button type="button" onClick={() => folderPicker.current?.click()} disabled={busy}><FolderOpen size={16}/>{tr("Choose folder", "选择文件夹")}</button>
  </>;

  return <main className="shell">
    <input ref={filePicker} type="file" accept=".json,application/json" aria-label={tr("Graph JSON file", "图谱 JSON 文件")} hidden
      onChange={event => void importFiles(event, false)}/>
    <input ref={folderPicker} type="file" aria-label={tr("Source folder", "源码文件夹")} hidden
      onChange={event => void importFiles(event, true)}/>
    <header className="toolbar">
      <div className="brand"><Network size={20}/><h1>{heading}</h1></div>
      <div className="actions">{importButtons}<button type="button" onClick={exportGraph} disabled={!graph || busy}><ArrowDownToLine size={16}/>{tr("Export JSON", "导出 JSON")}</button></div>
    </header>
    {busy && <p className="notice" role="status">{tr("Reading selected files…", "正在读取选中的文件…")}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {!workspace || !graph || !index ? <section className="empty">
      <Network size={44} strokeWidth={1.25} aria-hidden="true"/>
      <h2>{tr("Explore how a codebase fits together", "查看代码库里的依赖关系")}</h2>
      <p>{tr("Import Graphify’s graph.json or select a local source folder. Files are read on this device.", "导入 Graphify 的 graph.json，或选择本地源码文件夹。文件在此设备上读取。")}</p>
      <button type="button" onClick={() => open(tr("Example project", "示例项目"), demo)} disabled={busy}>{tr("Open example", "打开示例")}</button>
    </section> : <>
      <div className="workspace">
        <div className="workspace-name"><strong title={workspace.title}>{workspace.title}</strong><span>{graph.nodes.length} {tr("nodes", "个节点")} · {graph.links.length} {tr("links", "条关系")}</span></div>
        <label className="search"><Search size={16}/><input type="search" value={query} onChange={event => { setQuery(event.target.value); setNodePage(1); }}
          aria-label={tr("Search nodes", "搜索节点")} placeholder={tr("Search by name or path", "按名称或路径搜索")}/></label>
      </div>
      <div className="layout">
        <aside className="node-list" aria-label={tr("Nodes", "节点")}>
          <h2>{tr("Nodes", "节点")} <span>{filtered.length}</span></h2>
          {filtered.slice(0, nodePage * 50).map(node => <button key={node.id} type="button" aria-pressed={selected === node.id} onClick={() => select(node.id)}>
            <FileCode2 size={16}/><span><strong>{node.label}</strong><small>{node.file || node.kind || node.id}</small></span>
          </button>)}
          {filtered.length > nodePage * 50 && <button type="button" onClick={() => setNodePage(nodePage + 1)}>{tr("Show more", "显示更多")}</button>}
          {!filtered.length && <p>{tr("No matching nodes", "没有匹配的节点")}</p>}
        </aside>
        <section className="graph" aria-label={tr("Relationships graph", "关系图")}>
          <div className="graph-head">
            <h2>{path ? tr("Shortest path", "最短路径") : current && !search ? tr("Neighbors", "直接关联") : tr("Graph overview", "图谱总览")}</h2>
            <div className="actions">{current && <button type="button" onClick={() => { select(""); setStart(""); setEnd(""); }}>{tr("Reset view", "回到总览")}</button>}</div>
          </div>
          {graphNodes.length ? <MapView nodes={graphNodes} active={selected} links={graph.links} path={new Set(path?.map(step => step.edge))}
            onSelect={select}/> : <p>{tr("No nodes to display.", "没有可显示的节点。")}</p>}
          <div className="graph-foot">{graphNodes.length} / {path ? path.length + 1 : current && !search ? new Set([current.id, ...neighbors.map(step => step.to)]).size : filtered.length} {tr("nodes shown", "个节点已显示")}</div>
        </section>
        <aside className="inspector" aria-label={tr("Details", "详情")}>
          <h2>{tr("Details", "详情")}</h2>
          {current ? <>
            <strong className="current">{current.label}</strong>
            {current.file && <code>{source(current.file, current.location)}</code>}
            {(current.kind || current.group) && <div className="tags">{[current.kind, current.group].filter(Boolean).map((label, i) => <span key={i}>{label}</span>)}</div>}
            <div className="actions path-actions">
              <button type="button" onClick={() => { setStart(current.id); setPathPage(1); }}>{tr("Set start", "设为起点")}</button>
              <button type="button" onClick={() => { setEnd(current.id); setPathPage(1); }}>{tr("Set end", "设为终点")}</button>
            </div>
          </> : <p>{tr("Select a node to see its source and connections.", "选择节点，查看它的来源及关联。")}</p>}
          {(start || end) && <section className="inspector-section">
            <div className="section-head"><h3><GitFork size={15}/>{tr("Shortest path", "最短路径")}</h3>
              <button type="button" aria-label={tr("Clear path", "清除路径")} onClick={() => { setStart(""); setEnd(""); }}><X size={15}/></button></div>
            <div className="path-summary"><span>{index.nodes.get(start)?.label || tr("Choose start", "请选择起点")}</span><ArrowRight size={15}/><span>{index.nodes.get(end)?.label || tr("Choose end", "请选择终点")}</span></div>
            {start && end && (path === null ? <p>{tr("These nodes are not connected.", "两个节点之间没有路径。")}</p>
              : !path.length ? <p>{tr("Start and end are the same node.", "起点和终点相同。")}</p> : <><ol className="relationships">
                {path.slice(0, pathPage * 30).map(({ edge }, i) => <li key={i}><div className="path-relation">{index.nodes.get(edge.source)?.label}<ArrowRight size={13}/>{index.nodes.get(edge.target)?.label}</div><Evidence edge={edge}/></li>)}
              </ol>{path.length > pathPage * 30 && <button type="button" onClick={() => setPathPage(pathPage + 1)}>{tr("Show more", "显示更多")}</button>}</>)}
          </section>}
          {current && (!start || !end) && <section className="inspector-section">
            <h3>{tr("Connections", "关联关系")} <span>{neighbors.length}</span></h3>
            {!neighbors.length && <p>{tr("No direct connections.", "没有直接关联。")}</p>}
            <ul className="relationships">{neighbors.slice(0, neighborPage * 30).map(({ to, edge }, i) =>
              <li key={i}><button type="button" onClick={() => select(to)}>
                <ArrowRight size={14} className={edge.source === selected ? undefined : "incoming"}/>{index.nodes.get(to)?.label}</button><Evidence edge={edge}/></li>)}</ul>
            {neighbors.length > neighborPage * 30 && <button type="button" onClick={() => setNeighborPage(neighborPage + 1)}>{tr("Show more", "显示更多")}</button>}
          </section>}
        </aside>
      </div>
    </>}
  </main>;
}

const root = createRoot(document.getElementById("root")!);
async function start() {
  try { await myco?.ready; } catch { /* Local files remain available outside the host. */ }
  const render = () => {
    document.documentElement.lang = language() === "zh" ? "zh-CN" : "en";
    root.render(<App/>);
  };
  render();
  myco?.on?.("preferences", render);
}
void start();
