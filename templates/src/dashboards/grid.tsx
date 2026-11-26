import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowDownRight, GripHorizontal, Maximize2, Minimize2, Settings2 } from "lucide-react";
import { columns, gap, rowHeight, changePosition, shiftPosition, type PositionedPanel } from "./layout";
import { kindTitle, tr } from "./model";

type Edit = { panels: PositionedPanel[]; change: (panels: PositionedPanel[]) => void; settings: (id: string) => void };
type Gesture = {
  pointer: number; target: string; resize: boolean; original: PositionedPanel[]; panel: PositionedPanel;
  fromX: number; fromY: number; lastX: number; lastY: number;
};

export function Grid({ panels, edit, render }: { panels: PositionedPanel[]; edit?: Edit; render: (panel: PositionedPanel) => ReactNode }) {
  const grid = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const focused = panels.find(panel => panel.id === expanded);
  useEffect(() => {
    if (expanded && !focused) setExpanded(null);
  }, [expanded, focused]);

  function restorePanel() {
    setExpanded(null);
    expandButton.current?.focus({ preventScroll: true });
  }

  const active = useRef<Gesture>();
  const pending = useRef<number>();
  const ordered = edit ? panels : [...panels].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

  function start(event: PointerEvent<HTMLButtonElement>, panel: PositionedPanel, resize: boolean) {
    if (!edit || !grid.current || active.current || event.button !== 0) return;
    const rect = grid.current.getBoundingClientRect();
    active.current = {
      pointer: event.pointerId, target: panel.id, resize, original: edit.panels, panel,
      fromX: event.clientX - rect.left, fromY: event.clientY - rect.top, lastX: 0, lastY: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    grid.current.dataset.gesture = resize ? "resize" : "move";
  }
  function update(event: PointerEvent<HTMLButtonElement>) {
    const g = active.current;
    if (!grid.current || !g || g.pointer !== event.pointerId || !edit) return;
    const rect = grid.current.getBoundingClientRect();
    const dx = Math.round((event.clientX - rect.left - g.fromX) / ((rect.width + gap) / columns));
    const dy = Math.round((event.clientY - rect.top - g.fromY) / (rowHeight + gap));
    if (dx === g.lastX && dy === g.lastY) return;
    g.lastX = dx;
    g.lastY = dy;
    if (pending.current !== undefined) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      pending.current = undefined;
      edit.change(changePosition(g.original, g.target, shiftPosition(g.panel, dx, dy, g.resize)));
    });
  }
  function finish(event: PointerEvent<HTMLButtonElement>, cancel: boolean) {
    const g = active.current;
    if (!g || g.pointer !== event.pointerId || !edit) return;
    active.current = undefined;
    if (grid.current) delete grid.current.dataset.gesture;
    if (pending.current !== undefined) { cancelAnimationFrame(pending.current); pending.current = undefined; }
    edit.change(cancel ? g.original : changePosition(g.original, g.target, shiftPosition(g.panel, g.lastX, g.lastY, g.resize)));
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, panel: PositionedPanel, resize: boolean) {
    if (!edit || active.current) return;
    const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = deltas[event.key as keyof typeof deltas];
    if (!delta) return;
    event.preventDefault();
    edit.change(changePosition(panels, panel.id, shiftPosition(panel, delta[0], delta[1], resize)));
  }
  function handle(panel: PositionedPanel, resize: boolean) {
    const label = (resize ? tr("Resize panel", "调整面板大小") : tr("Move panel", "移动面板")) + " · " + panel.title;
    return { "aria-label": label, "aria-keyshortcuts": "ArrowLeft ArrowRight ArrowUp ArrowDown", title: label, type: "button" as const,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, panel, resize),
      onPointerMove: update,
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => { update(event); finish(event, false); },
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keyboard(event, panel, resize) };
  }

  return <div className={edit ? "dash-grid-wrap is-editing" : focused ? "dash-grid-wrap is-expanded" : "dash-grid-wrap"}>
    <div className="dash-grid" ref={grid}>
      {ordered.map(panel => <article key={panel.id} className={`dash-card is-${panel.kind}`} data-panel={panel.id}
        hidden={!!focused && focused.id !== panel.id}
        onKeyDown={event => { if (focused && event.key === "Escape" && !event.defaultPrevented) restorePanel(); }}
        style={focused ? undefined : { gridColumn: `${panel.position.x + 1} / span ${panel.position.w}`, gridRow: `${panel.position.y + 1} / span ${panel.position.h}` }}>
        <header>
          <h2>{edit
            ? <button className="dash-move" {...handle(panel, false)}><GripHorizontal size={17}/><span>{panel.title || kindTitle(panel.kind)}</span></button>
            : panel.title || kindTitle(panel.kind)}</h2>
          {!edit && <button className="dash-icon dash-expand" type="button"
            ref={focused?.id === panel.id ? expandButton : undefined}
            title={focused ? tr("Restore panel", "还原面板") : tr("Expand panel", "放大面板")}
            aria-label={(focused ? tr("Restore panel", "还原面板") : tr("Expand panel", "放大面板")) + " · " + (panel.title || kindTitle(panel.kind))}
            aria-expanded={focused?.id === panel.id}
            onClick={() => focused ? restorePanel() : setExpanded(panel.id)}>
            {focused ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
          </button>}
          {edit && <button className="dash-icon" type="button" title={tr("Panel settings", "面板设置")} aria-label={tr("Panel settings", "面板设置") + " · " + panel.title}
            onClick={() => edit.settings(panel.id)}><Settings2 size={15}/></button>}
        </header>
        <div className="dash-panel-body">{render(panel)}</div>
        {edit && <button className="dash-icon dash-resize" {...handle(panel, true)}><ArrowDownRight size={16}/></button>}
      </article>)}
    </div>
  </div>;
}
