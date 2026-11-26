// Extracted data in a run: each output as a card people can read, copy and
// download. Lists of objects become a table; long text folds. What the run
// record kept may be cut to fit; the complete data, when the computer that ran
// it saved it, downloads from the page's files.
import { useState } from "react";
import { t as uiText } from "../_lib/i18n";
import { csv } from "../_lib/export";
import { myco, save } from "../_lib/myco";
import { Icon } from "./icons";
import type { Run } from "./model";

const rowLimit = 200, columnLimit = 12, textFold = 600;
type Table = { columns: string[]; rows: Record<string, unknown>[] };

/** A list whose items are plain objects reads best as a table. */
export function asTable(value: unknown): Table | undefined {
  if (!Array.isArray(value) || !value.length || !value.every(item => item && typeof item === "object" && !Array.isArray(item))) return undefined;
  const columns: string[] = [];
  for (const item of value as Record<string, unknown>[]) for (const key of Object.keys(item)) if (!columns.includes(key) && columns.length < 50) columns.push(key);
  return { columns, rows: value as Record<string, unknown>[] };
}
export const cell = (value: unknown) => value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
/** What one output is, in a few words. */
export function describe(value: unknown) {
  const table = asTable(value);
  if (table) return uiText("{0} 条 · {1} 列", table.rows.length, table.columns.length);
  if (Array.isArray(value)) return uiText("{0} 项", value.length);
  if (value && typeof value === "object") return uiText("{0} 个字段", Object.keys(value).length);
  if (typeof value === "string") return uiText("{0} 个字", value.length);
  return "";
}
const fileName = (base: string, ext: string) => `${base.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "output"}.${ext}`;
const pretty = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value, null, 2);

type Flash = (message: string) => void;
async function copy(flash: Flash, text: string) {
  try { await navigator.clipboard.writeText(text); flash(uiText("已复制")); }
  catch { flash(uiText("剪贴板不可用，请下载后再复制。")); }
}
async function download(flash: Flash, name: string, content: string, type: string) {
  try { await save(name, content, type); flash(uiText("已保存到下载文件夹：{0}", name)); }
  catch { flash(uiText("没能保存文件")); }
}

function Value({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  const table = asTable(value);
  if (table) {
    const columns = table.columns.slice(0, columnLimit), rows = table.rows.slice(0, rowLimit);
    return <div className="wa-table-wrap">
      <table className="wa-table">
        <thead><tr><th>#</th>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}><td className="wa-muted">{index + 1}</td>
          {columns.map(column => { const text = cell(row[column]);
            return <td key={column} title={text.length > 60 ? text : undefined}>{/^https?:\/\//.test(text) ? <span className="wa-link">{text}</span> : text}</td>; })}</tr>)}</tbody>
      </table>
      {(table.rows.length > rows.length || table.columns.length > columns.length) && <p className="wa-muted wa-pad">
        {uiText("这里显示前 {0} 条、{1} 列；下载可以拿到全部。", rows.length, columns.length)}</p>}
    </div>;
  }
  if (Array.isArray(value) && value.every(item => item === null || typeof item !== "object"))
    return <ol className="wa-value-list">{value.slice(0, rowLimit).map((item, index) => <li key={index}>{cell(item)}</li>)}</ol>;
  if (value && typeof value === "object" && !Array.isArray(value))
    return <dl className="wa-kv">{Object.entries(value).slice(0, 100).map(([key, item]) => <div key={key}><dt>{key}</dt><dd>{cell(item)}</dd></div>)}</dl>;
  const text = pretty(value);
  const long = text.length > textFold;
  return <div className="wa-value-text">
    <pre className={long && !open ? "is-folded" : undefined}>{long && !open ? text.slice(0, textFold) + "…" : text}</pre>
    {long && <button type="button" className="wa-link-btn" onClick={() => setOpen(!open)}>{open ? uiText("收起") : uiText("展开全部（{0} 个字）", text.length)}</button>}
  </div>;
}

function OutputCard({ name, value, base, flash }: { name: string; value: unknown; base: string; flash: Flash }) {
  const table = asTable(value);
  return <article className="wa-output-card">
    <header>
      <div><strong>{name}</strong><small>{describe(value)}</small></div>
      <div className="wa-row">
        <button type="button" className="wa-tool" onClick={() => void copy(flash, pretty(value))}><Icon.copy size={13}/>{uiText("复制")}</button>
        <button type="button" className="wa-tool" onClick={() => void download(flash, fileName(`${base}-${name}`, typeof value === "string" ? "txt" : "json"), pretty(value), typeof value === "string" ? "text/plain" : "application/json")}>
          <Icon.download size={13}/>{typeof value === "string" ? uiText("下载") : "JSON"}</button>
        {table && <button type="button" className="wa-tool" onClick={() => void download(flash, fileName(`${base}-${name}`, "csv"),
          csv([table.columns, ...table.rows.map(row => table.columns.map(column => cell(row[column])))]), "text/csv")}><Icon.download size={13}/>CSV</button>}
      </div>
    </header>
    <Value value={value}/>
  </article>;
}

export function RunOutput({ run, flash }: { run: Run; flash: Flash }) {
  const { truncated, ...output } = (run.output || {}) as Record<string, unknown>;
  const entries = Object.entries(output);
  const base = `${run.script_name || "run"}-${(run.started_at || "").slice(0, 10)}`;
  const file = run.output_file;
  if (!entries.length && !file) return null;
  const full = async () => {
    if (!file || !myco?.pageFiles) return;
    try { await myco.pageFiles.download(file); } catch { flash(uiText("没能下载完整数据")); }
  };
  return <section className="wa-output" aria-label={uiText("提取的数据")}>
    <header className="wa-output-head">
      <h3>{uiText("提取的数据")}</h3>
      <div className="wa-row">
        {file && <button type="button" className="wa-tool" onClick={() => void full()}><Icon.download size={13}/>{uiText("下载完整数据")}</button>}
        {entries.length > 1 && <button type="button" className="wa-tool" onClick={() => void download(flash, fileName(base, "json"), JSON.stringify(output, null, 2), "application/json")}>
          <Icon.download size={13}/>{uiText("全部下载")}</button>}
      </div>
    </header>
    {truncated === true && <p className="wa-output-note">{file ? uiText("数据太大，这里只保存了一部分。完整数据可以用「下载完整数据」拿到。")
      : uiText("数据太大，这里只保存了一部分。在运行它的电脑上重新运行，可以保存完整数据。")}</p>}
    {entries.map(([name, value]) => <OutputCard key={name} name={name} value={value} base={base} flash={flash}/>)}
  </section>;
}
