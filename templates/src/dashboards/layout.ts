import type { Panel } from "./model";

export const columns = 12;
export const rowHeight = 44;
export const gap = 12;
const maxY = 288;

export type Position = { x: number; y: number; w: number; h: number };
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, Math.round(n)));
const integer = (value: unknown) => typeof value === "number" && Number.isFinite(value);

export function normalizePosition(value: Position, kind: Panel["kind"]): Position {
  const w = clamp(value.w, kind === "metric" ? 2 : 3, columns);
  return { w, x: clamp(value.x, 0, columns - w), y: clamp(value.y, 0, maxY), h: clamp(value.h, kind === "metric" ? 2 : 3, 12) };
}

export function readPosition(input: unknown, kind: Panel["kind"]) {
  if (!input || typeof input !== "object") return;
  const { x, y, w, h } = input as Position;
  if ([x, y, w, h].every(integer)) return normalizePosition({ x, y, w, h }, kind);
}

const overlap = (a: Position, b: Position) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function belowCollisions(position: Position, occupied: Position[]) {
  let next = { ...position };
  let collisions = occupied.filter(other => overlap(other, next));
  while (collisions.length) {
    next = { ...next, y: Math.max(...collisions.map(other => other.y + other.h)) };
    collisions = occupied.filter(other => overlap(other, next));
  }
  return next;
}

export type PositionedPanel = Panel & { position: Position };

/** Keep explicit panel coordinates and place old preset layouts in reading order. */
export function placePanels(panels: Panel[]): PositionedPanel[] {
  const occupied: Position[] = [];
  let x = 0, y = 0, lineEnd = 0;
  return panels.map(panel => {
    const w = panel.width === "compact" ? 4 : panel.width === "wide" ? 12 : 6;
    const h = panel.kind === "metric" ? 2 : 4;
    if (x + w > columns) { x = 0; y = lineEnd; }
    const position = belowCollisions(panel.position ?? { x, y, w, h }, occupied);
    x = position.x + position.w;
    y = position.y;
    lineEnd = Math.max(lineEnd, position.y + position.h);
    occupied.push(position);
    return { ...panel, position };
  });
}

export function changePosition(panels: PositionedPanel[], id: string, point: Position): PositionedPanel[] {
  const moving = panels.find(panel => panel.id === id);
  if (!moving) return panels;
  const position = normalizePosition(point, moving.kind);
  const occupied = [position];
  const placed = new Map<string, Position>([[id, position]]);
  const remaining = panels.filter(panel => panel.id !== id).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  for (const panel of remaining) {
    const next = belowCollisions(panel.position, occupied);
    occupied.push(next);
    placed.set(panel.id, next);
  }
  return panels.map(panel => {
    const next = placed.get(panel.id)!;
    const before = panel.position;
    if (next.x === before.x && next.y === before.y && next.w === before.w && next.h === before.h) return panel;
    return { ...panel, position: next };
  });
}

export function shiftPosition(panel: PositionedPanel, dx: number, dy: number, resize: boolean) {
  const from = panel.position;
  return resize
    ? { ...from, w: Math.min(columns - from.x, from.w + dx), h: from.h + dy }
    : { ...from, x: from.x + dx, y: from.y + dy };
}

export function nextPanelPosition(panels: PositionedPanel[], kind: Panel["kind"]): Position {
  const y = panels.reduce((bottom, panel) => Math.max(bottom, panel.position.y + panel.position.h), 0);
  return { x: 0, y, w: kind === "metric" ? 4 : 6, h: kind === "metric" ? 2 : 4 };
}
