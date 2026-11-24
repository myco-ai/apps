// The script graph on a React Flow canvas. React Flow owns the viewport and
// drag positions; the shared record changes only when a gesture ends.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Edge as FlowEdge, type Node, type NodeProps, type XYPosition } from "@xyflow/react";
import { Circle, OctagonPause } from "lucide-react";
import { t as uiText } from "../_lib/i18n";
import { describeTarget, nodeHeight, nodeWidth, portLabels, type NodeType, type RunStep, type Script, type ScriptNode } from "./model";
import { groups, icons, portName, typeName } from "./labels";
import "@xyflow/react/dist/style.css";

type Mark = RunStep["state"] | "current" | "";
type CardData = { node: ScriptNode; issue: boolean; mark: Mark; breakpoint: boolean };
type CardNode = Node<CardData, "step">;

function summary(node: ScriptNode) {
  switch (node.type) {
    case "navigate": return node.url || "";
    case "type": case "select": return [describeTarget(node.target), node.sensitive ? "•••" : node.value].filter(Boolean).join(" ← ");
    case "press": return node.key || "";
    case "wait": return node.wait === "time" ? `${node.ms || 0} ms` : node.wait === "network" ? uiText("网络空闲") : describeTarget(node.target);
    case "extract": case "js": return node.into ? `→ \${${node.into}}` : describeTarget(node.target);
    case "loop": return node.list || "";
    case "confirm": return node.message || "";
    case "note": return node.note || "";
    case "subflow": return node.script_id || "";
    default: return describeTarget(node.target);
  }
}

const Card = memo(function Card({ data: { node, issue, mark, breakpoint }, selected }: NodeProps<CardNode>) {
  const Icon = icons[node.type];
  const ports = portLabels[node.type];
  return <div className="wa-node" data-type={node.type} data-selected={selected} data-issue={issue} data-mark={mark}>
    {node.type !== "note" && <Handle type="target" position={Position.Top} aria-label={uiText("输入端口")}/>}
    <span className="wa-node-kind"><Icon size={14}/>{typeName(node.type)}
      {breakpoint && <OctagonPause size={13} aria-label={uiText("断点")}/>}
      {issue && <Circle size={8} className="wa-node-issue" aria-label={uiText("需要修改")}/>}
    </span>
    <strong>{node.title || typeName(node.type)}</strong>
    <span className="wa-node-preview">{summary(node) || (node.type === "note" ? "" : uiText("点击编辑步骤"))}</span>
    {node.type !== "note" && (ports ? ports.map((port, index) => <Handle key={port} id={port} type="source" position={Position.Bottom}
      style={{ left: index ? "75%" : "25%" }} aria-label={portName(port)}><span className="wa-port">{portName(port)}</span></Handle>)
      : <Handle type="source" position={Position.Bottom} aria-label={uiText("输出端口")}/>)}
  </div>;
});
const nodeTypes = { step: Card };

type Menu = { left: number; top: number; point: XYPosition; from?: string; port?: string };
type Props = {
  script: Script; selected: string; issues: Set<string>; marks: Record<string, Mark>; breakpoints: string[];
  editable: boolean; select: (id: string) => void;
  add: (type: NodeType, point: XYPosition, from?: string, port?: string) => void;
  move: (id: string, point: XYPosition) => void;
  connect: (from: string, to: string, port?: string) => void;
  disconnect: (from: string, to: string) => void;
};

function View({ script, selected, issues, marks, breakpoints, editable, select, add, move, connect, disconnect }: Props) {
  const [nodes, setNodes, changeNodes] = useNodesState<CardNode>([]);
  const [menu, setMenu] = useState<Menu>();
  const stage = useRef<HTMLElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);
  const moving = useRef(new Set<string>());
  const flow = useReactFlow<CardNode>();
  const edges = useMemo<FlowEdge[]>(() => script.graph.edges.map(([from, to, label]) => ({
    id: `e:${from}:${to}:${label || ""}`, source: from, target: to, sourceHandle: label || null,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    deletable: editable, className: marks[to] === "current" || marks[to] === "ok" ? "is-done" : "",
  })), [script.graph.edges, editable, marks]);

  useEffect(() => {
    setNodes(previous => {
      const byId = new Map(previous.map(node => [node.id, node]));
      return script.graph.nodes.map(node => {
        const old = byId.get(node.id);
        const position = moving.current.has(node.id) && old ? old.position : { x: node.pos[0], y: node.pos[1] };
        const data: CardData = { node, issue: issues.has(node.id), mark: marks[node.id] || "", breakpoint: breakpoints.includes(node.id) };
        const same = old && old.data.node === node && old.data.issue === data.issue && old.data.mark === data.mark && old.data.breakpoint === data.breakpoint;
        return { ...old, id: node.id, type: "step", position, selected: node.id === selected, data: same ? old.data : data,
          draggable: editable, connectable: editable, width: nodeWidth, height: nodeHeight, ariaLabel: node.title || typeName(node.type) };
      });
    });
  }, [script.graph.nodes, selected, issues, marks, breakpoints, editable, setNodes]);

  useEffect(() => { if (menu) firstItem.current?.focus(); }, [menu]);

  function showMenu(client: XYPosition, from?: string, port?: string) {
    if (!editable) return;
    const rect = stage.current!.getBoundingClientRect();
    setMenu({
      point: flow.screenToFlowPosition(client), from, port,
      left: Math.max(6, Math.min(client.x - rect.left, rect.width - 236)),
      top: Math.max(6, Math.min(client.y - rect.top, rect.height - 330)),
    });
  }

  return <section className="wa-stage" ref={stage} aria-label={uiText("脚本画布")}
    onKeyDown={event => { if (event.key === "Escape") setMenu(undefined); }}
    onDoubleClickCapture={event => {
      if (event.target instanceof Element && event.target.matches(".react-flow__pane")) showMenu({ x: event.clientX, y: event.clientY });
    }}
    onPointerDownCapture={event => {
      if (event.button === 0 && event.target instanceof Element && event.target.matches(".react-flow__pane")) { setMenu(undefined); select(""); }
    }}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changeNodes}
      defaultViewport={{ x: 40, y: 28, zoom: 0.9 }} minZoom={0.25} maxZoom={2} zoomOnDoubleClick={false}
      onlyRenderVisibleElements deleteKeyCode={editable ? ["Backspace", "Delete"] : null} disableKeyboardA11y={false}
      onNodesDelete={() => undefined}
      onBeforeDelete={async ({ edges: gone }) => { for (const edge of gone) disconnect(edge.source, edge.target); return false; }}
      onNodeClick={(_, node) => { setMenu(undefined); select(node.id); }}
      onPaneContextMenu={event => { event.preventDefault(); showMenu({ x: event.clientX, y: event.clientY }); }}
      onConnect={connection => connect(connection.source, connection.target, connection.sourceHandle || undefined)}
      onConnectEnd={(event, state) => {
        if (state.isValid || state.toHandle || !state.fromHandle || !state.fromNode || state.fromHandle.type !== "source") return;
        const pointer = "changedTouches" in event ? event.changedTouches[0] : event;
        if (!pointer) return;
        const hit = document.elementFromPoint(pointer.clientX, pointer.clientY);
        if (!hit || !stage.current?.contains(hit)) return;
        const target = hit.closest<HTMLElement>(".react-flow__node")?.dataset.id;
        if (target && target !== state.fromNode.id) { connect(state.fromNode.id, target, state.fromHandle.id || undefined); return; }
        if (hit.matches(".react-flow__pane")) showMenu({ x: pointer.clientX, y: pointer.clientY }, state.fromNode.id, state.fromHandle.id || undefined);
      }}
      onNodeDragStart={(_, node) => { setMenu(undefined); moving.current.add(node.id); select(node.id); }}
      onNodeDragStop={(_, node) => { moving.current.delete(node.id); move(node.id, node.position); }}
      ariaLabelConfig={{
        "controls.ariaLabel": uiText("画布缩放"), "controls.zoomIn.ariaLabel": uiText("放大"),
        "controls.zoomOut.ariaLabel": uiText("缩小"), "controls.fitView.ariaLabel": uiText("适应画布"),
      }}
      fitView={script.graph.nodes.length > 0} fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
      proOptions={{ hideAttribution: true }}>
      <Background gap={20} size={1.25}/>
      <Controls showInteractive={false} aria-label={uiText("画布缩放")}/>
    </ReactFlow>
    {!script.graph.nodes.length && <div className="wa-empty"><h2>{uiText("还没有步骤")}</h2>
      <p>{editable ? uiText("点「录制」在浏览器里操作一遍，或右键、双击画布添加步骤。") : uiText("这个脚本还没有步骤。")}</p></div>}
    {menu && <div className="wa-menu" style={{ left: menu.left, top: menu.top }} role="menu" aria-label={uiText("添加步骤")}>
      {groups.map((group, groupIndex) => <div key={groupIndex} className="wa-menu-group">
        <strong>{group.name()}</strong>
        {group.types.filter(type => !menu.from || type !== "note").map((type, index) => {
          const Icon = icons[type];
          return <button type="button" role="menuitem" key={type} ref={groupIndex === 0 && index === 0 ? firstItem : undefined}
            onClick={() => { add(type, menu.point, menu.from, menu.port); setMenu(undefined); }}><Icon size={14}/>{typeName(type)}</button>;
        })}
      </div>)}
    </div>}
  </section>;
}

export function Canvas(props: Props) {
  return <ReactFlowProvider><View {...props}/></ReactFlowProvider>;
}
