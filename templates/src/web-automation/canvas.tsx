// The script graph on a React Flow canvas, left to right. React Flow owns the
// viewport and drag positions; the shared record changes only when a
// gesture ends. Blocks dragged from the library drop where they are let go.
import { memo, useEffect, useMemo, useRef } from "react";
import { Background, BackgroundVariant, Controls, Handle, MarkerType, NodeToolbar, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Edge as FlowEdge, type Node, type NodeProps, type XYPosition } from "@xyflow/react";
import { t as uiText } from "../_lib/i18n";
import { describeTarget, nodeHeight, nodeTypes as allTypes, nodeWidth, portLabels, type NodeType, type RunStep, type Script, type ScriptNode } from "./model";
import { category, portName, tabName, typeName } from "./labels";
import { Icon, StepIcon } from "./icons";
import "@xyflow/react/dist/style.css";

export const dragType = "application/x-myco-step";
type Mark = RunStep["state"] | "current" | "";
type CardData = { node: ScriptNode; issue: boolean; mark: Mark; breakpoint: boolean; editable: boolean; actions?: Actions };
type CardNode = Node<CardData, "step">;
type Actions = { remove: (id: string) => void; toggleBreakpoint: (id: string) => void; runFrom?: (id: string) => void };

export function summary(node: ScriptNode) {
  switch (node.type) {
    case "navigate": return node.url || "";
    case "type": case "select": return [describeTarget(node.target), node.sensitive ? "•••" : node.value].filter(Boolean).join(" ← ");
    case "press": return node.key || "";
    case "wait": return node.wait === "time" ? `${node.ms || 0} ms` : node.wait === "network" ? uiText("网络空闲") : node.wait === "url" ? uiText("网址包含 {0}", node.value || "")
      : node.wait === "download" ? uiText("下载完成") : describeTarget(node.target);
    case "tab": return tabName(node.tab || "");
    case "dialog": return node.dialog === "dismiss" ? uiText("取消") : node.value ? `${uiText("接受")} ← ${node.value}` : uiText("接受");
    case "extract": case "js": return node.into ? `→ \${${node.into}}` : describeTarget(node.target);
    case "loop": return node.list || "";
    case "confirm": return node.message || "";
    case "note": return node.note || "";
    case "subflow": return node.script_id || "";
    case "screenshot": return node.clip ? uiText("区域 {0}×{1}", Math.round(node.clip.width), Math.round(node.clip.height)) : node.full ? uiText("整页") : describeTarget(node.target);
    default: return describeTarget(node.target);
  }
}

const Card = memo(function Card({ id, data: { node, issue, mark, breakpoint, editable, actions }, selected }: NodeProps<CardNode>) {
  const ports = portLabels[node.type];
  const text = summary(node);
  if (node.type === "note") return <div className="wa-note" data-selected={selected}>
    <span className="wa-note-head"><Icon.note size={14}/>{node.title || typeName("note")}</span>
    <p>{text || uiText("点击编辑便签")}</p>
  </div>;
  return <>
    {actions && <NodeToolbar isVisible={selected} position={Position.Top} align="end" offset={6} className="wa-node-toolbar">
      {actions.runFrom && <button type="button" onClick={() => actions.runFrom!(id)} aria-label={uiText("从这里开始运行")} title={uiText("从这里开始运行")}><Icon.play size={13}/></button>}
      <button type="button" aria-pressed={breakpoint} onClick={() => actions.toggleBreakpoint(id)} aria-label={breakpoint ? uiText("取消断点") : uiText("设断点")} title={breakpoint ? uiText("取消断点") : uiText("设断点")}><Icon.breakpoint size={14}/></button>
      {editable && <button type="button" className="is-danger" onClick={() => actions.remove(id)} aria-label={uiText("删除步骤")} title={uiText("删除步骤")}><Icon.trash size={14}/></button>}
    </NodeToolbar>}
    <div className="wa-node" data-cat={category(node.type)} data-fork={Boolean(ports)} data-selected={selected} data-mark={mark}>
      <Handle type="target" position={Position.Left} aria-label={uiText("输入端口")}/>
      <span className="wa-tile"><StepIcon type={node.type} size={16}/></span>
      <span className="wa-node-text">
        <strong>{node.title || typeName(node.type)}</strong>
        <small>{text || (node.title ? typeName(node.type) : uiText("点击编辑步骤"))}</small>
      </span>
      {(issue || breakpoint) && <span className="wa-node-flags">
        {breakpoint && <span className="wa-flag-break" aria-label={uiText("断点")} title={uiText("断点")}/>}
        {issue && <span className="wa-flag-issue" aria-label={uiText("需要修改")} title={uiText("需要修改")}/>}
      </span>}
      {ports ? ports.map((port, index) => <Handle key={port} id={port} type="source" position={Position.Right}
        style={{ top: index ? "72%" : "28%" }} aria-label={portName(port)} className={`is-port-${index}`}>
        <span className="wa-port">{portName(port)}</span></Handle>)
        : <Handle type="source" position={Position.Right} aria-label={uiText("输出端口")}/>}
    </div>
  </>;
});
const nodeTypes = { step: Card };

type Props = {
  script: Script; selected: string; issues: Set<string>; marks: Record<string, Mark>; breakpoints: string[];
  editable: boolean; select: (id: string) => void; actions?: Actions;
  add?: (type: NodeType, point: XYPosition) => void;
  move?: (id: string, point: XYPosition) => void;
  connect?: (from: string, to: string, port?: string) => void;
  disconnect?: (from: string, to: string) => void;
  empty?: React.ReactNode;
};

function View({ script, selected, issues, marks, breakpoints, editable, select, actions, add, move, connect, disconnect, empty }: Props) {
  const [nodes, setNodes, changeNodes] = useNodesState<CardNode>([]);
  const stage = useRef<HTMLElement>(null);
  const moving = useRef(new Set<string>());
  const flow = useReactFlow<CardNode>();
  const fitted = useRef("");
  const edges = useMemo<FlowEdge[]>(() => script.graph.edges.map(([from, to, label]) => ({
    id: `e:${from}:${to}:${label || ""}`, source: from, target: to, sourceHandle: label || null, type: "smoothstep", pathOptions: { borderRadius: 14, offset: 22 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 }, deletable: editable,
    animated: marks[from] === "ok" && marks[to] === "current",
    className: marks[to] === "current" || marks[to] === "ok" ? "is-done" : "",
  })), [script.graph.edges, editable, marks]);

  useEffect(() => {
    setNodes(previous => {
      const byId = new Map(previous.map(node => [node.id, node]));
      return script.graph.nodes.map(node => {
        const old = byId.get(node.id);
        const position = moving.current.has(node.id) && old ? old.position : { x: node.pos[0], y: node.pos[1] };
        const data: CardData = { node, issue: issues.has(node.id), mark: marks[node.id] || "", breakpoint: breakpoints.includes(node.id), editable, actions };
        const same = old && old.data.node === node && old.data.issue === data.issue && old.data.mark === data.mark &&
          old.data.breakpoint === data.breakpoint && old.data.editable === editable && old.data.actions === actions;
        return { ...old, id: node.id, type: "step", position, selected: node.id === selected, data: same ? old.data : data,
          draggable: editable, connectable: editable, width: nodeWidth, height: node.type === "note" ? 96 : nodeHeight,
          ariaLabel: node.title || typeName(node.type) };
      });
    });
  }, [script.graph.nodes, selected, issues, marks, breakpoints, editable, actions, setNodes]);

  // Each script opens fitted to its steps.
  const key = script.graph.nodes.map(node => node.id).join();
  useEffect(() => {
    if (!nodes.length || fitted.current === key) return;
    fitted.current = key;
    requestAnimationFrame(() => void flow.fitView({ maxZoom: 1, minZoom: 0.5, padding: 0.18 }));
  }, [nodes.length, key, flow]);

  return <section className="wa-stage" ref={stage} aria-label={uiText("脚本画布")}
    onDragOver={event => { if (editable && event.dataTransfer.types.includes(dragType)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
    onDrop={event => {
      const type = event.dataTransfer.getData(dragType) as NodeType;
      if (!editable || !add || !allTypes.includes(type)) return;
      event.preventDefault();
      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      add(type, { x: point.x - nodeWidth / 2, y: point.y - nodeHeight / 2 });
    }}
    onPointerDownCapture={event => {
      if (event.button === 0 && event.target instanceof Element && event.target.matches(".react-flow__pane")) select("");
    }}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changeNodes}
      defaultViewport={{ x: 40, y: 40, zoom: 1 }} minZoom={0.25} maxZoom={2} zoomOnDoubleClick={false}
      onlyRenderVisibleElements deleteKeyCode={editable ? ["Backspace", "Delete"] : null} disableKeyboardA11y={false}
      onBeforeDelete={async ({ nodes: goneNodes, edges: gone }) => {
        for (const edge of gone) if (!goneNodes.some(node => node.id === edge.source || node.id === edge.target)) disconnect?.(edge.source, edge.target);
        for (const node of goneNodes) actions?.remove(node.id);
        return false;
      }}
      onNodeClick={(_, node) => select(node.id)}
      onConnect={connection => connect?.(connection.source, connection.target, connection.sourceHandle || undefined)}
      onNodeDragStart={(_, node) => { moving.current.add(node.id); select(node.id); }}
      onNodeDragStop={(_, node) => { moving.current.delete(node.id); move?.(node.id, node.position); }}
      ariaLabelConfig={{
        "controls.ariaLabel": uiText("画布缩放"), "controls.zoomIn.ariaLabel": uiText("放大"),
        "controls.zoomOut.ariaLabel": uiText("缩小"), "controls.fitView.ariaLabel": uiText("适应画布"),
      }}
      proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.2}/>
      <Controls showInteractive={false} position="bottom-right" aria-label={uiText("画布缩放")}/>
    </ReactFlow>
    {!script.graph.nodes.length && <div className="wa-canvas-empty">{empty}</div>}
  </section>;
}

export function Canvas(props: Props) {
  return <ReactFlowProvider><View {...props}/></ReactFlowProvider>;
}
