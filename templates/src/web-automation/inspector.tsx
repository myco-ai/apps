// The right-hand panel: one step's fields, or the script's own settings.
// Edits stay local until Save, so a teammate's change is never overwritten.
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Crosshair, OctagonPause, Play, Plus, ScanSearch, Trash2, X } from "lucide-react";
import { t as uiText } from "../_lib/i18n";
import { bytes, locatorKinds, recordLimit, type Issue, type Locator, type OnError, type Param, type ParamType,
  type Script, type ScriptNode, type Target } from "./model";
import { issueText, locatorName, paramTypeName, typeName } from "./labels";
import type { BrowserProfile } from "./bridge";

export type Tools = {
  locate?: (target: Target) => Promise<number | undefined>;
  pick?: () => Promise<Target | undefined>;
};

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="wa-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Issues({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return <ul className="wa-issues" aria-label={uiText("需要修改")}>{issues.map((issue, index) => <li key={index}>{issueText(issue)}</li>)}</ul>;
}

function LocatorRow({ locator, change, remove, up, down }: {
  locator: Locator; change: (value: Locator) => void; remove: () => void; up?: () => void; down?: () => void;
}) {
  return <div className="wa-locator">
    <select className="sel" aria-label={uiText("定位方式")} value={locator.kind}
      onChange={event => change({ kind: event.target.value as Locator["kind"], value: locator.value, role: locator.role, name: locator.name })}>
      {locatorKinds.map(kind => <option key={kind} value={kind}>{locatorName(kind)}</option>)}
    </select>
    {locator.kind === "role" ? <>
      <input className="inp" aria-label={uiText("角色")} placeholder="button" value={locator.role || ""} onChange={event => change({ ...locator, role: event.target.value })}/>
      <input className="inp" aria-label={uiText("可访问名称")} placeholder={uiText("可访问名称")} value={locator.name || ""} onChange={event => change({ ...locator, name: event.target.value })}/>
    </> : <input className="inp wa-locator-value" aria-label={uiText("定位值")} value={locator.value || ""} onChange={event => change({ ...locator, value: event.target.value })}/>}
    <span className="wa-row-actions">
      <button type="button" className="icon-btn" disabled={!up} onClick={up} aria-label={uiText("上移")}><ArrowUp size={13}/></button>
      <button type="button" className="icon-btn" disabled={!down} onClick={down} aria-label={uiText("下移")}><ArrowDown size={13}/></button>
      <button type="button" className="icon-btn" onClick={remove} aria-label={uiText("删除定位方式")}><X size={13}/></button>
    </span>
  </div>;
}

function TargetEditor({ label, target, change, tools, editable }: {
  label: string; target?: Target; change: (target: Target) => void; tools: Tools; editable: boolean;
}) {
  const value = target || { locators: [] };
  const [found, setFound] = useState<number>();
  const set = (locators: Locator[]) => { setFound(undefined); change({ ...value, locators }); };
  const move = (from: number, to: number) => { const list = [...value.locators]; const [item] = list.splice(from, 1); list.splice(to, 0, item); set(list); };
  return <fieldset className="wa-target" disabled={!editable}>
    <legend>{label}</legend>
    <p className="wa-hint">{uiText("运行时从上往下找，用第一个能唯一找到元素的定位方式。")}</p>
    {value.locators.map((locator, index) => <LocatorRow key={index} locator={locator}
      change={next => set(value.locators.map((item, position) => position === index ? next : item))}
      remove={() => set(value.locators.filter((_, position) => position !== index))}
      up={index ? () => move(index, index - 1) : undefined}
      down={index < value.locators.length - 1 ? () => move(index, index + 1) : undefined}/>)}
    {(value.frame?.length || value.shadow?.length) ? <p className="wa-hint">
      {value.frame?.length ? uiText("在 {0} 层 iframe 里", value.frame.length) : ""}{value.frame?.length && value.shadow?.length ? " · " : ""}
      {value.shadow?.length ? uiText("在 {0} 层 Shadow DOM 里", value.shadow.length) : ""}</p> : null}
    <div className="wa-actions">
      <button type="button" className="btn" onClick={() => set([...value.locators, { kind: "css", value: "" }])}><Plus size={14}/>{uiText("定位方式")}</button>
      {tools.pick && <button type="button" className="btn" onClick={() => void tools.pick!().then(picked => { if (picked) { setFound(undefined); change(picked); } })}>
        <Crosshair size={14}/>{uiText("在页面上选")}</button>}
      {tools.locate && <button type="button" className="btn" disabled={!value.locators.length}
        onClick={() => void tools.locate!(value).then(count => setFound(count))}><ScanSearch size={14}/>{uiText("测试")}</button>}
    </div>
    {found !== undefined && <p className="wa-hint" role="status">{found === 1 ? uiText("找到 1 个元素。") : found ? uiText("找到 {0} 个元素，请再收窄。", found) : uiText("页面上没找到。")}</p>}
  </fieldset>;
}

function onErrorOptions(nodes: ScriptNode[], self?: string) {
  return [
    ["stop", uiText("停止运行")], ["skip", uiText("跳过这一步")],
    ...[1, 2, 3].map(count => [`retry:${count}`, uiText("重试 {0} 次", count)]),
    ...nodes.filter(node => node.id !== self && node.type !== "note").map(node => [`goto:${node.id}`, uiText("跳到「{0}」", node.title || typeName(node.type))]),
  ];
}

export function NodeInspector({ node, script, scripts, issues, editable, tools, breakpoint, canRun, save, remove, toggleBreakpoint, runFrom }: {
  node: ScriptNode; script: Script; scripts: { id: string; name: string }[]; issues: Issue[]; editable: boolean; tools: Tools;
  breakpoint: boolean; canRun: boolean;
  save: (node: ScriptNode) => Promise<boolean>; remove: () => void; toggleBreakpoint: () => void; runFrom: () => void;
}) {
  const [draft, setDraft] = useState(node);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!dirty) setDraft(node); }, [node, dirty]);
  const change = (patch: Partial<ScriptNode>) => { setDraft(current => ({ ...current, ...patch })); setDirty(true); };
  const text = (key: keyof ScriptNode, label: string, options: { placeholder?: string; hint?: string; long?: boolean; mono?: boolean } = {}) =>
    <Field label={label} hint={options.hint}>{options.long
      ? <textarea className={`inp${options.mono ? " wa-mono" : ""}`} rows={4} value={(draft[key] as string) || ""} placeholder={options.placeholder} onChange={event => change({ [key]: event.target.value })}/>
      : <input className={`inp${options.mono ? " wa-mono" : ""}`} value={(draft[key] as string) || ""} placeholder={options.placeholder} onChange={event => change({ [key]: event.target.value })}/>}</Field>;
  const choose = <K extends keyof ScriptNode>(key: K, label: string, options: [string, string][]) =>
    <Field label={label}><select className="sel" value={String(draft[key] ?? options[0][0])} onChange={event => change({ [key]: key === "count" ? Number(event.target.value) : event.target.value } as Partial<ScriptNode>)}>
      {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></Field>;
  const number = (key: "ms" | "dy" | "count" | "timeout_ms", label: string, hint?: string) =>
    <Field label={label} hint={hint}><input className="inp" type="number" value={draft[key] ?? ""}
      onChange={event => change({ [key]: event.target.value === "" ? undefined : Number(event.target.value) })}/></Field>;
  const check = (key: "clear" | "sensitive" | "full", label: string) =>
    <label className="wa-check"><input type="checkbox" checked={Boolean(draft[key])} onChange={event => change({ [key]: event.target.checked })}/>{label}</label>;
  const target = (label = uiText("元素")) => <TargetEditor label={label} target={draft.target} tools={tools} editable={editable}
    change={value => change({ target: value })}/>;
  const checks: [string, string][] = [["visible", uiText("元素可见")], ["hidden", uiText("元素不可见")], ["text", uiText("元素文字包含")], ["url", uiText("网址包含")], ["expr", uiText("JS 表达式为真")]];

  async function submit() {
    setSaving(true);
    const done = await save(draft);
    setSaving(false);
    if (done) setDirty(false);
  }

  return <aside className="wa-inspector" aria-label={uiText("步骤详情")}>
    <div className="wa-inspector-head"><h2>{typeName(node.type)}</h2>
      <span className="wa-row-actions">
        {node.type !== "note" && <button type="button" className="icon-btn" aria-pressed={breakpoint} onClick={toggleBreakpoint}
          aria-label={breakpoint ? uiText("取消断点") : uiText("设断点")} title={breakpoint ? uiText("取消断点") : uiText("设断点")}><OctagonPause size={15}/></button>}
        {editable && <button type="button" className="icon-btn" onClick={remove} aria-label={uiText("删除步骤")} title={uiText("删除步骤")}><Trash2 size={15}/></button>}
      </span>
    </div>
    <Issues issues={issues}/>
    <fieldset disabled={!editable} className="wa-plain">
      {text("title", uiText("名称"), { placeholder: typeName(node.type) })}
      {draft.type === "navigate" && text("url", uiText("网址"), { placeholder: "https://", hint: uiText("可以用 ${参数名}。") })}
      {draft.type === "click" && <>
        {choose("button", uiText("鼠标键"), [["left", uiText("左键")], ["right", uiText("右键")], ["middle", uiText("中键")]])}
        {choose("count", uiText("次数"), [["1", uiText("单击")], ["2", uiText("双击")]])}
      </>}
      {(draft.type === "type" || draft.type === "select") && <>
        {text("value", draft.type === "type" ? uiText("输入内容") : uiText("选项"), { long: draft.type === "type", hint: uiText("可以用 ${参数名}。") })}
        {draft.type === "type" && check("clear", uiText("先清空原有内容"))}
        {draft.type === "type" && check("sensitive", uiText("敏感内容（只填参数，不写进脚本）"))}
      </>}
      {draft.type === "press" && text("key", uiText("按键"), { placeholder: "Enter / Control+A", mono: true })}
      {draft.type === "scroll" && number("dy", uiText("滚动距离（像素，向上为负）"))}
      {draft.type === "upload" && text("value", uiText("文件"), { placeholder: "${file}", hint: uiText("运行这台电脑上的文件路径，通常填参数。") })}
      {draft.type === "wait" && <>
        {choose("wait", uiText("等什么"), [["element", uiText("元素出现")], ["network", uiText("网络空闲")], ["time", uiText("固定时长")]])}
        {draft.wait === "time" && number("ms", uiText("毫秒"))}
      </>}
      {(draft.type === "assert" || draft.type === "branch") && <>
        {choose("check", draft.type === "branch" ? uiText("条件") : uiText("检查"), checks)}
        {(draft.check === "text" || draft.check === "url") && text("value", uiText("包含的文字"))}
        {draft.check === "expr" && text("code", uiText("表达式"), { mono: true, placeholder: "document.title.includes('OK')" })}
        {draft.type === "branch" && <p className="wa-hint">{uiText("条件成立走「是」，否则走「否」。")}</p>}
      </>}
      {draft.type === "extract" && <>
        {choose("what", uiText("提取"), [["text", uiText("文本")], ["attribute", uiText("属性")], ["html", "HTML"], ["table", uiText("表格")], ["js", "JS"]])}
        {draft.what === "attribute" && text("attr", uiText("属性名"), { placeholder: "href", mono: true })}
        {draft.what === "js" && text("code", uiText("JS（参数 el 是找到的元素）"), { long: true, mono: true })}
        {text("into", uiText("保存到变量"), { placeholder: "post_url", mono: true, hint: uiText("后面的步骤用 ${变量名} 读取，运行结果里也会带上。") })}
      </>}
      {draft.type === "js" && <>
        {text("code", uiText("JS 代码"), { long: true, mono: true, placeholder: "return document.title" })}
        {text("into", uiText("返回值保存到变量（可不填）"), { mono: true })}
      </>}
      {draft.type === "screenshot" && check("full", uiText("整页截图"))}
      {draft.type === "tab" && text("tab", uiText("切到哪个标签页"), { placeholder: uiText("序号、new 或 opener"), mono: true })}
      {draft.type === "loop" && <>
        {text("list", uiText("遍历的列表"), { placeholder: "${rows}", mono: true })}
        {text("as", uiText("每一项叫"), { placeholder: "item", mono: true })}
        <p className="wa-hint">{uiText("「每一项」那条线走到头后回到循环；全部走完后走「结束后」。")}</p>
      </>}
      {draft.type === "subflow" && <Field label={uiText("调用的脚本")}>
        <select className="sel" value={draft.script_id || ""} onChange={event => change({ script_id: event.target.value })}>
          <option value="">{uiText("请选择")}</option>
          {scripts.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}
        </select></Field>}
      {draft.type === "confirm" && <>
        {text("message", uiText("要问的话"), { long: true, placeholder: uiText("填好了，确认提交吗？") })}
        <p className="wa-hint">{uiText("运行到这里会停下，带上截图问触发运行的人或 agent。")}</p>
      </>}
      {draft.type === "note" && text("note", uiText("便签内容"), { long: true })}
      {(["click", "type", "select", "hover", "drag", "upload", "extract"].includes(draft.type)
        || (draft.type === "press" || draft.type === "scroll" || draft.type === "screenshot")
        || (draft.type === "wait" && draft.wait === "element")
        || ((draft.type === "assert" || draft.type === "branch") && ["visible", "hidden", "text"].includes(draft.check || "visible")))
        && target(draft.type === "press" || draft.type === "scroll" || draft.type === "screenshot" ? uiText("元素（可不选）") : undefined)}
      {draft.type === "drag" && <TargetEditor label={uiText("拖到")} target={draft.to} tools={tools} editable={editable} change={value => change({ to: value })}/>}
      {draft.type !== "note" && <details className="wa-more">
        <summary>{uiText("出错和超时")}</summary>
        <Field label={uiText("这一步出错时")}><select className="sel" value={draft.on_error || ""} onChange={event => change({ on_error: (event.target.value || undefined) as OnError | undefined })}>
          <option value="">{uiText("跟随脚本设置")}</option>
          {onErrorOptions(script.graph.nodes, node.id).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></Field>
        {number("timeout_ms", uiText("超时（毫秒）"), uiText("默认等元素出现、可见、可点击，最多 30 秒。"))}
      </details>}
    </fieldset>
    <div className="wa-actions wa-sticky">
      {editable && <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void submit()}>{uiText("保存")}</button>}
      {dirty && <button type="button" className="btn" onClick={() => { setDraft(node); setDirty(false); }}>{uiText("放弃修改")}</button>}
      {canRun && node.type !== "note" && <button type="button" className="btn" disabled={dirty} onClick={runFrom}><Play size={14}/>{uiText("从这里开始运行")}</button>}
    </div>
  </aside>;
}

const paramTypes: ParamType[] = ["string", "text", "number", "bool", "secret"];

export function ScriptSettings({ script, issues, editable, profiles, save, remove, duplicate }: {
  script: Script; issues: Issue[]; editable: boolean; profiles?: BrowserProfile[];
  save: (script: Script) => Promise<boolean>; remove: () => void; duplicate: () => void;
}) {
  const [draft, setDraft] = useState(script);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!dirty) setDraft(script); }, [script, dirty]);
  const change = (patch: Partial<Script>) => { setDraft(current => ({ ...current, ...patch })); setDirty(true); };
  const setParam = (index: number, patch: Partial<Param>) => change({ params: draft.params.map((param, position) => position === index ? { ...param, ...patch } : param) });
  const size = bytes(draft);
  const steps = draft.graph.nodes.filter(node => node.type !== "note").length;
  async function submit() {
    setSaving(true);
    const done = await save({ ...draft, params: draft.params.map(param => param.type === "secret" ? { ...param, default: undefined } : param) });
    setSaving(false);
    if (done) setDirty(false);
  }
  return <aside className="wa-inspector" aria-label={uiText("脚本设置")}>
    <div className="wa-inspector-head"><h2>{uiText("脚本设置")}</h2>
      <span className="wa-row-actions">{editable && <button type="button" className="icon-btn" onClick={remove} aria-label={uiText("删除脚本")} title={uiText("删除脚本")}><Trash2 size={15}/></button>}</span>
    </div>
    <p className="wa-hint">{uiText("{0} 个步骤 · {1} KB / 64 KB", steps, Math.ceil(size / 1024))}</p>
    <Issues issues={issues.filter(issue => !issue.node)}/>
    {issues.some(issue => issue.node) && <p className="wa-hint">{uiText("有 {0} 个步骤需要修改，画布上带圆点的就是。", new Set(issues.filter(issue => issue.node).map(issue => issue.node)).size)}</p>}
    <fieldset disabled={!editable} className="wa-plain">
      <Field label={uiText("名称")}><input className="inp" value={draft.name} maxLength={120} onChange={event => change({ name: event.target.value })}/></Field>
      <Field label={uiText("说明")}><textarea className="inp" rows={2} value={draft.description || ""} maxLength={1000} onChange={event => change({ description: event.target.value })}/></Field>
      <Field label={uiText("起始网址")}><input className="inp" value={draft.start_url} placeholder="https://" onChange={event => change({ start_url: event.target.value })}/></Field>
      <Field label={uiText("建议的 profile")} hint={uiText("一组浏览器登录状态，留在运行的那台电脑上；运行时可以换。")}>
        <input className="inp" list="wa-profiles" value={draft.profile} onChange={event => change({ profile: event.target.value })}/>
        <datalist id="wa-profiles">{profiles?.map(profile => <option key={profile.id} value={profile.name}/>)}</datalist>
      </Field>
      <Field label={uiText("步骤出错时")}><select className="sel" value={draft.on_error} onChange={event => change({ on_error: event.target.value as OnError })}>
        {onErrorOptions([]).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select></Field>
      <fieldset className="wa-params">
        <legend>{uiText("运行参数")}</legend>
        <p className="wa-hint">{uiText("人或 agent 运行时传入，步骤里写 ${参数名}。敏感参数只在运行时传，不保存。")}</p>
        {draft.params.map((param, index) => <div className="wa-param" key={index}>
          <input className="inp wa-mono" aria-label={uiText("参数名")} value={param.name} placeholder="title" onChange={event => setParam(index, { name: event.target.value })}/>
          <select className="sel" aria-label={uiText("参数类型")} value={param.type} onChange={event => setParam(index, { type: event.target.value as ParamType })}>
            {paramTypes.map(type => <option key={type} value={type}>{paramTypeName(type)}</option>)}
          </select>
          <input className="inp" aria-label={uiText("默认值")} placeholder={uiText("默认值")} disabled={param.type === "secret"} value={param.type === "secret" ? "" : param.default || ""} onChange={event => setParam(index, { default: event.target.value || undefined })}/>
          <label className="wa-check"><input type="checkbox" checked={Boolean(param.required)} onChange={event => setParam(index, { required: event.target.checked })}/>{uiText("必填")}</label>
          <button type="button" className="icon-btn" aria-label={uiText("删除参数")} onClick={() => change({ params: draft.params.filter((_, position) => position !== index) })}><X size={13}/></button>
        </div>)}
        <button type="button" className="btn" onClick={() => change({ params: [...draft.params, { name: "", type: "string" }] })}><Plus size={14}/>{uiText("参数")}</button>
      </fieldset>
    </fieldset>
    {size > recordLimit && <p className="wa-error">{uiText("脚本太大了（上限 64 KB），请拆成子流程。")}</p>}
    <div className="wa-actions wa-sticky">
      {editable && <button type="button" className="btn btn-primary" disabled={!dirty || saving || size > recordLimit} onClick={() => void submit()}>{uiText("保存")}</button>}
      {dirty && <button type="button" className="btn" onClick={() => { setDraft(script); setDirty(false); }}>{uiText("放弃修改")}</button>}
      {editable && !dirty && <button type="button" className="btn" onClick={duplicate}>{uiText("复制一份")}</button>}
    </div>
  </aside>;
}
