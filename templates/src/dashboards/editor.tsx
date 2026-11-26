import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { kindTitle, kinds, labelColors, labelColorTitle, maxTableLabels, readTableLabels, tr, validID, type LabelColor, type TableLabel, type Board, type Dataset, type Kind, type Panel } from "./model";

export function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); close(); }}>
    <div className="dash-dialog-head"><h2>{title}</h2><button type="button" className="dash-icon" onClick={close} aria-label={tr("Close", "关闭")}><X size={18}/></button></div>
    {children}
  </dialog>;
}

function PanelFields({ panel, datasets, change }: { panel: Panel; datasets: Map<string, Dataset>; change: (panel: Panel) => void }) {
  const dataset = datasets.get(panel.dataset);
  const single = panel.kind === "metric" || panel.kind === "donut";
  const options = dataset ? dataset.columns : [];
  const [customDataset, setCustomDataset] = useState(!datasets.size || (!!panel.dataset && !dataset));
  const bind = (dataset: string) => change({ ...panel, dataset, label: "", values: [], tableLabels: undefined });
  const set = <K extends keyof Panel>(key: K, value: Panel[K]) => change({ ...panel, [key]: value });
  return <div className="dash-fields">
    <label>{tr("Panel title", "面板标题")}<input required maxLength={80} value={panel.title} onChange={event => set("title", event.target.value)}/></label>
    <label>{tr("Visualization", "图表类型")}<select value={panel.kind} onChange={event => {
      const kind = event.target.value as Kind;
      change({ ...panel, kind, values: kind === "metric" || kind === "donut" ? panel.values.slice(0, 1) : panel.values });
    }}>{kinds.map(kind => <option key={kind} value={kind}>{kindTitle(kind)}</option>)}</select></label>
    <label>{tr("Dataset", "数据集")}<select aria-label={tr("Dataset", "数据集")} value={customDataset ? "*" : panel.dataset} onChange={event => {
      setCustomDataset(event.target.value === "*");
      bind(event.target.value === "*" ? "" : event.target.value);
    }}>
      <option value="">{tr("Choose a dataset", "选择数据集")}</option>
      {Array.from(datasets, ([id, value]) => <option key={id} value={id}>{value.title && value.title !== id ? `${value.title} · ${id}` : id}</option>)}
      <option value="*">{tr("Enter a dataset ID", "输入数据集 ID")}</option>
    </select></label>
    {customDataset && <label>{tr("Dataset ID", "数据集 ID")}<input maxLength={80} pattern="[a-zA-Z0-9_\\-]{1,80}" value={panel.dataset}
      placeholder={tr("e.g. weekly_usage", "例如 weekly_usage")} onChange={event => bind(event.target.value)}/></label>}
    {panel.kind === "table" ? <TableLabelFields panel={panel} dataset={dataset} change={labels => set("tableLabels", labels)}/> : <>
      <label>{tr("Label column", "标签列")}<input maxLength={80} list={`cols-${panel.id}`} value={panel.label} onChange={event => set("label", event.target.value)}/></label>
      {single || !options.length
        ? <label>{single ? tr("Value column", "数值列") : tr("Value columns", "数值列")}
          <input key={`${panel.dataset}-${single}`} maxLength={single ? 80 : 480} list={single ? `cols-${panel.id}` : undefined}
            defaultValue={panel.values.join(", ")} placeholder={single ? undefined : tr("Separate with commas", "用逗号分隔")}
            onChange={event => set("values", (single ? [event.target.value] : event.target.value.split(/[,，]/)).map(value => value.trim()).filter(Boolean).slice(0, 6))}/>
        </label>
        : <fieldset className="dash-checks"><legend>{tr("Value columns", "数值列")}</legend>
          {[...new Set([...options, ...panel.values])].map(option => <label key={option}><input type="checkbox"
            checked={panel.values.includes(option)} disabled={panel.values.length >= 6 && !panel.values.includes(option)}
            onChange={event => set("values", event.target.checked ? [...panel.values, option] : panel.values.filter(value => value !== option))}/>{option}</label>)}
        </fieldset>}
      <datalist id={`cols-${panel.id}`}>{options.map(option => <option key={option} value={option}/>)}</datalist>
      {(panel.kind === "metric" || panel.kind === "line" || panel.kind === "bar" || panel.kind === "area") && <label>
        {tr("Unit", "单位")}<input maxLength={24} value={panel.unit} onChange={event => set("unit", event.target.value)}/>
      </label>}
    </>}
  </div>;
}

function TableLabelFields({ panel, dataset, change }: { panel: Panel; dataset?: Dataset; change: (labels: TableLabel[]) => void }) {
  const rules = panel.tableLabels ?? [];
  const columns = dataset?.columns || [];
  const update = (index: number, part: Partial<TableLabel>) =>
    change(rules.map((rule, i) => i === index ? { ...rule, ...part } : rule));
  return <fieldset className="dash-label-fields">
    <legend>{tr("Colored labels", "彩色标签")}</legend>
    {rules.map((rule, index) => {
      const columnIndex = columns.indexOf(rule.column);
      const suggestions = columnIndex < 0 ? [] : [...new Set(dataset?.rows.map(row => row[columnIndex])
        .filter(value => value !== null).map(value => String(value).trim()).filter(Boolean))].slice(0, 24);
      const list = `dash-label-${panel.id}-${index}`;
      return <div className="dash-label-rule" key={index}>
        <label>{tr("Column", "列")}
          {columns.length ? <select aria-label={tr("Column", "列")} required value={rule.column} onChange={e => update(index, { column: e.target.value, value: "" })}>
            <option value="">{tr("Choose a column", "选择列")}</option>
            {[...new Set([...columns, rule.column].filter(Boolean))].map(column => <option key={column}>{column}</option>)}
          </select> : <input required maxLength={80} value={rule.column} onChange={e => update(index, { column: e.target.value })}/>}
        </label>
        <label>{tr("Cell value", "单元格值")}<input required maxLength={240} list={list} value={rule.value}
          onChange={e => update(index, { value: e.target.value })}/>
          <datalist id={list}>{suggestions.map(value => <option key={value} value={value}/>)}</datalist>
        </label>
        <label>{tr("Color", "颜色")}<select aria-label={tr("Color", "颜色")} value={rule.color} onChange={e => update(index, { color: e.target.value as LabelColor })}>
          {labelColors.map(color => <option key={color} value={color}>{labelColorTitle(color)}</option>)}
        </select></label>
        <button type="button" className="dash-icon" title={tr("Remove label", "移除标签")} aria-label={tr("Remove label", "移除标签")}
          onClick={() => change(rules.filter((_, i) => index !== i))}><X size={15}/></button>
      </div>;
    })}
    <button type="button" className="dash-btn" disabled={rules.length >= maxTableLabels}
      onClick={() => change([...rules, { column: "", value: "", color: "blue" }])}>{tr("Add label", "添加标签")}</button>
  </fieldset>;
}

export function PanelEditor({ panel, datasets, isNew, apply, remove, close }: {
  panel: Panel; datasets: Map<string, Dataset>; isNew: boolean; apply: (panel: Panel) => void; remove: () => void; close: () => void;
}) {
  const [draft, setDraft] = useState(panel);
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || (draft.dataset && !validID(draft.dataset))) {
      setError(tr("Enter a panel name and a valid dataset ID.", "请填写面板名称和有效的数据集 ID。"));
      return;
    }
    const tableLabels = draft.kind === "table" ? readTableLabels(draft.tableLabels) : undefined;
    if (tableLabels && tableLabels.length !== (draft.tableLabels?.length ?? 0)) {
      setError(tr("Use a unique value for each label in a column.", "同一列的标签值必须填写且不能重复。"));
      return;
    }
    apply({ ...draft, title: draft.title.trim(), tableLabels: tableLabels?.length ? tableLabels : undefined });
  }
  return <Dialog title={isNew ? tr("Add panel", "添加面板") : tr("Panel settings", "面板设置")} close={close}>
    <form onSubmit={submit} className="dash-editor">
      <PanelFields panel={draft} datasets={datasets} change={setDraft}/>
      {error && <p className="dash-error" role="alert">{error}</p>}
      <footer className="dash-editor-foot">
        {!isNew && <button type="button" className="dash-btn dash-danger" onClick={remove}>{tr("Remove panel", "移除面板")}</button>}
        <div className="dash-actions"><button type="button" className="dash-btn" onClick={close}>{tr("Cancel", "取消")}</button><button type="submit" className="dash-btn primary">
          {isNew ? tr("Add to dashboard", "加入仪表盘") : tr("Apply", "应用")}
        </button></div>
      </footer>
    </form>
  </Dialog>;
}

export function DetailsEditor({ board, apply, remove, close }: {
  board?: Board; apply: (title: string, description: string) => void; remove?: () => Promise<void>; close: () => void;
}) {
  const [title, setTitle] = useState(board?.title || "");
  const [description, setDescription] = useState(board?.description || "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function deleteBoard() {
    setError("");
    setBusy(true);
    try { await remove?.(); }
    catch { setError(tr("Could not delete this dashboard. Close the editor and reload data.", "无法删除仪表盘。请关闭编辑器并重新加载数据。")); }
    finally { setBusy(false); }
  }
  return <Dialog title={board ? tr("Dashboard settings", "仪表盘设置") : tr("New dashboard", "新建仪表盘")} close={() => { if (!busy) close(); }}>
    <form className="dash-editor" onSubmit={event => { event.preventDefault();
      if (title.trim()) apply(title.trim(), description.trim());
      else setError(tr("Enter a dashboard name.", "请填写仪表盘名称。")); }}>
      <fieldset disabled={busy}>
        <label>{tr("Dashboard name", "仪表盘名称")}<input autoFocus required maxLength={80} value={title} onChange={event => setTitle(event.target.value)}/></label>
        <label>{tr("Description", "描述")}<textarea maxLength={240} rows={2} value={description} onChange={event => setDescription(event.target.value)}/></label>
        {error && <p className="dash-error" role="alert">{error}</p>}
        <footer className="dash-editor-foot">
          {remove && <button type="button" className="dash-btn dash-danger" onClick={() => setConfirm(current => !current)}>{tr("Delete dashboard", "删除仪表盘")}</button>}
          <div className="dash-actions"><button type="button" className="dash-btn" onClick={close}>{tr("Cancel", "取消")}</button><button type="submit" className="dash-btn primary">
            {board ? tr("Apply", "应用") : tr("Continue", "继续")}
          </button></div>
        </footer>
        {confirm && <div className="dash-delete"><p>{tr("Delete this dashboard? Its datasets will be kept.", "删除这个仪表盘？数据集仍会保留。")}</p>
          <button type="button" className="dash-btn dash-danger" onClick={() => void deleteBoard()}>{tr("Confirm deletion", "确认删除")}</button>
        </div>}
      </fieldset>
    </form>
  </Dialog>;
}
