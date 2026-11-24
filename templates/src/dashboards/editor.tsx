import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { kindTitle, kinds, maxPanels, newPanel, tr, validID, type Board, type Dataset, type Kind, type Panel } from "./model";

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
  const bind = (dataset: string) => change({ ...panel, dataset, label: "", values: [] });
  const set = <K extends keyof Panel>(key: K, value: Panel[K]) => change({ ...panel, [key]: value });
  return <div className="dash-fields">
    <label>{tr("Panel title", "面板标题")}<input required maxLength={80} value={panel.title} onChange={event => set("title", event.target.value)}/></label>
    <label>{tr("Visualization", "图表类型")}<select value={panel.kind} onChange={event => {
      const kind = event.target.value as Kind;
      change({ ...panel, kind, values: kind === "metric" || kind === "donut" ? panel.values.slice(0, 1) : panel.values });
    }}>{kinds.map(kind => <option key={kind} value={kind}>{kindTitle(kind)}</option>)}</select></label>
    <label>{tr("Width", "宽度")}<select value={panel.width} onChange={event => set("width", event.target.value as Panel["width"])}>
      <option value="compact">{tr("One third", "三分之一")}</option><option value="half">{tr("Half", "半宽")}</option><option value="wide">{tr("Full", "整行")}</option>
    </select></label>
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
    {panel.kind !== "table" && <>
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

export function Editor({ board, datasets, save, remove, close }: { board?: Board; datasets: Map<string, Dataset>;
  save: (draft: Board) => Promise<void>; remove?: () => Promise<void>; close: () => void }) {
  const [draft, setDraft] = useState<Board>(board ?? { title: "", description: "", panels: [] });
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const visible = draft.panels.find(panel => panel.id === openPanel);
  const changePanels = (panels: Panel[]) => setDraft(current => ({ ...current, panels }));
  const move = (index: number, by: number) => {
    const panels = [...draft.panels];
    [panels[index], panels[index + by]] = [panels[index + by], panels[index]];
    changePanels(panels);
  };
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (error) {
      setError((error as { code?: string })?.code === "conflict"
        ? tr("This dashboard changed elsewhere. Copy any unsaved changes, then reopen the editor.", "此仪表盘已被修改，请先复制未保存的内容，再重新打开编辑器。")
        : tr("Could not save changes. Try again.", "无法保存更改，请重试。"));
    } finally { setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || draft.panels.some(panel => !panel.title.trim() || (panel.dataset && !validID(panel.dataset)))) {
      setError(tr("Enter a dashboard name and a name for every panel. Dataset IDs use letters, numbers, hyphens or underscores.", "请填写仪表盘和各面板的名称。数据集 ID 只允许字母、数字、连字符和下划线。"));
      return;
    }
    void run(() => save({ ...draft, title: draft.title.trim(), panels: draft.panels.map(panel => ({ ...panel, title: panel.title.trim() })) }));
  }
  return <Dialog title={board ? tr("Edit layout", "编辑布局") : tr("New dashboard", "新建仪表盘")} close={() => { if (!busy) close(); }}>
    <form onSubmit={submit} className="dash-editor">
      <fieldset disabled={busy}>
        <label>{tr("Dashboard name", "仪表盘名称")}<input autoFocus required maxLength={80} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label>
        <label>{tr("Description", "描述")}<textarea maxLength={240} rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })}/></label>
        <div className="dash-between"><h3>{tr("Panels", "面板")}</h3><button type="button" className="dash-btn" disabled={draft.panels.length >= maxPanels} onClick={() => {
          const panel = newPanel();
          changePanels([...draft.panels, panel]);
          setOpenPanel(panel.id);
        }}><Plus size={15}/>{tr("Add panel", "添加面板")}</button></div>
        {draft.panels.map((panel, index) => <section className="dash-panel-edit" key={panel.id}>
          <div className="dash-panel-row">
            <button type="button" className="dash-panel-name" aria-expanded={openPanel === panel.id} onClick={() => setOpenPanel(current => current === panel.id ? null : panel.id)}>
              <strong>{panel.title || tr("Untitled panel", "未命名面板")}</strong><small>{kindTitle(panel.kind)}</small>
            </button>
            <button type="button" className="dash-icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label={tr("Move panel up", "上移面板")}><ArrowUp size={15}/></button>
            <button type="button" className="dash-icon" disabled={index === draft.panels.length - 1} onClick={() => move(index, 1)} aria-label={tr("Move panel down", "下移面板")}><ArrowDown size={15}/></button>
            <button type="button" className="dash-icon dash-danger" onClick={() => changePanels(draft.panels.filter(item => item.id !== panel.id))} aria-label={tr("Remove panel", "移除面板")}><Trash2 size={15}/></button>
          </div>
          {visible?.id === panel.id && <PanelFields panel={panel} datasets={datasets} change={value => changePanels(draft.panels.map(item => item.id === panel.id ? value : item))}/>}
        </section>)}
        {error && <p role="alert" className="dash-error">{error}</p>}
        <footer className="dash-editor-foot">
          {remove && <button type="button" className="dash-btn dash-danger" onClick={() => setConfirm(current => !current)}>{tr("Delete dashboard", "删除仪表盘")}</button>}
          <div className="dash-actions"><button type="button" className="dash-btn" onClick={close}>{tr("Cancel", "取消")}</button><button className="dash-btn primary" type="submit">{busy ? tr("Saving…", "正在保存…") : tr("Save layout", "保存布局")}</button></div>
        </footer>
        {confirm && remove && <div className="dash-delete"><p>{tr("Delete this dashboard? Its datasets will be kept.", "删除这个仪表盘？数据集仍会保留。")}</p>
          <button type="button" className="dash-btn dash-danger" onClick={() => void run(remove)}>{tr("Confirm deletion", "确认删除")}</button></div>}
      </fieldset>
    </form>
  </Dialog>;
}
