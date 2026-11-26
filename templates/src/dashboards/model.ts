import { language } from "../_lib/i18n";
import type { MycoRecord } from "../_lib/myco";
import { readPosition, type Position } from "./layout";

export const tr = (en: string, zh: string) => language() === "zh" ? zh : en;
export const kinds = ["line", "bar", "area", "donut", "metric", "table"] as const;
export type Kind = typeof kinds[number];
export const kindTitle = (kind: Kind) => ({
  line: tr("Line", "折线图"), bar: tr("Bar", "柱形图"), area: tr("Area", "面积图"),
  donut: tr("Donut", "环形饼图"), metric: tr("Number", "指标卡"), table: tr("Table", "表格"),
})[kind];

export const labelColors = ["neutral", "blue", "green", "amber", "red", "purple"] as const;
export const labelColorTitle = (color: LabelColor) => ({
  neutral: tr("Gray", "灰色"), blue: tr("Blue", "蓝色"), green: tr("Green", "绿色"),
  amber: tr("Amber", "琥珀色"), red: tr("Red", "红色"), purple: tr("Purple", "紫色"),
})[color];
export type LabelColor = typeof labelColors[number];
export type TableLabel = { column: string; value: string; color: LabelColor };
export const maxTableLabels = 24;

export type Panel = {
  id: string; title: string; kind: Kind; dataset: string; label: string; values: string[];
  width: "compact" | "half" | "wide"; unit: string; position?: Position; tableLabels?: TableLabel[];
};
export type Board = { title: string; description: string; panels: Panel[] };
type Cell = string | number | null;
export type Dataset = { title: string; captured: string; columns: string[]; rows: Cell[][] };
export const validID = (value: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(value);
export const maxPanels = 24;

export function createID() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("");
}
export const newPanel = (): Panel => ({ id: createID(), title: "", kind: "line", dataset: "", label: "", values: [], width: "half", unit: "" });

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const strings = (value: unknown, limit: number) => Array.isArray(value)
  ? [...new Set(value.slice(0, limit).map(item => string(item, 80)).filter(Boolean))] : [];

export function readTableLabels(value: unknown): TableLabel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, maxTableLabels).flatMap((item): TableLabel[] => {
    const rule = object(item);
    const column = string(rule.column, 80), match = string(rule.value, 240);
    const key = JSON.stringify([column, match]);
    if (!column || !match || seen.has(key) || !labelColors.includes(rule.color as LabelColor)) return [];
    seen.add(key);
    return [{ column, value: match, color: rule.color as LabelColor }];
  });
}

export function boardFrom(record: MycoRecord): MycoRecord<Board> {
  const { panels, title, description } = record.data;
  const ids = new Set<string>();
  return { ...record, data: {
    title: string(title, 80), description: string(description, 240),
    panels: (Array.isArray(panels) ? panels : []).slice(0, maxPanels).flatMap((value, index): Panel[] => {
      const p = object(value);
      if (!kinds.includes(p.kind as Kind)) return [];
      let id = string(p.id, 80) || String(index);
      while (ids.has(id)) id += "-";
      ids.add(id);
      return [{
        id, kind: p.kind as Kind, title: string(p.title, 80), dataset: string(p.dataset, 80),
        label: string(p.label, 80), values: strings(p.values, 6), unit: string(p.unit, 24),
        width: p.width === "wide" || p.width === "compact" ? p.width : "half",
        ...(p.kind === "table" && Array.isArray(p.tableLabels) ? { tableLabels: readTableLabels(p.tableLabels) } : {}),
        position: readPosition(p.position, p.kind as Kind),
      }];
    }),
  } };
}

export function datasetFrom(value: unknown): Dataset | undefined {
  const data = object(value);
  if (!Array.isArray(data.columns) || !data.columns.length || data.columns.length > 12 || !Array.isArray(data.rows)) return;
  const columns = strings(data.columns, 12);
  if (columns.length !== data.columns.length) return;
  const rows = data.rows.slice(0, 300).filter(Array.isArray).map(row => columns.map((_, index): Cell => {
    const cell: unknown = row[index];
    if (typeof cell === "number" && Number.isFinite(cell) && Math.abs(cell) <= 1e15) return cell;
    return typeof cell === "string" ? cell.slice(0, 240) : null;
  }));
  const date = string(data.captured, 50);
  return { title: string(data.title, 80), captured: Number.isFinite(Date.parse(date)) ? date : "", columns, rows };
}

export function seriesFor(panel: Panel, dataset: Dataset) {
  const label = dataset.columns.indexOf(panel.label);
  const names = dataset.rows.map((row, index) => String(row[label] ?? (index + 1)));
  const series = panel.values.flatMap(name => {
    const column = dataset.columns.indexOf(name);
    if (column < 0) return [];
    return [{ name, values: dataset.rows.map(row => typeof row[column] === "number" ? row[column] : null) }];
  });
  return { names, series };
}

export const number = (value: number, compact = false) => new Intl.NumberFormat(
  language() === "zh" ? "zh-CN" : "en", compact ? { notation: "compact", maximumFractionDigits: 2 } : { maximumFractionDigits: 6 },
).format(value);
