// The left panel's forms: one step's fields, or the script's own settings.
// Edits stay local until Save, so a teammate's change is never overwritten.
import { useEffect, useId, useState, type ReactNode } from "react";
import { t as uiText } from "../_lib/i18n";
import { bytes, locatorKinds, recordLimit, type Issue, type Locator, type OnError, type Param, type ParamType,
  type Script, type ScriptNode, type Target } from "./model";
import { category, issueText, locatorName, paramTypeName, tabName, typeName } from "./labels";
import { Icon, StepIcon } from "./icons";
import { Checkbox, IconButton, Select, Toggle, type Option } from "./ui";
import { typeHint } from "./palette";
import type { Approval } from "./bridge";

export type Tools = {
  locate?: (target: Target) => Promise<number | undefined>;
  pick?: () => Promise<Target | undefined>;
};

function Text({ label, value, onChange, placeholder, hint, long, mono, type, rows = 4 }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; hint?: string; long?: boolean; mono?: boolean; type?: string; rows?: number;
}) {
  const id = useId();
  const className = `wa-input${mono ? " is-mono" : ""}`;
  return <div className="ui-field">
    <label htmlFor={id}>{label}</label>
    {long ? <textarea id={id} className={className} rows={rows} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)}/>
      : <input id={id} className={className} type={type || "text"} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)}/>}
    {hint && <small>{hint}</small>}
  </div>;
}

function Choice<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: Option<T>[]; onChange: (value: T) => void; hint?: string }) {
  return <div className="ui-field"><span className="ui-label">{label}</span><Select label={label} value={value} options={options} onChange={onChange}/>{hint && <small>{hint}</small>}</div>;
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="wa-section"><header><h3>{title}</h3>{aside}</header>{children}</section>;
}

function Issues({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return <div className="wa-issues" role="note" aria-label={uiText("需要修改")}>
    <Icon.warning size={15}/>
    <ul>{issues.map((issue, index) => <li key={index}>{issueText(issue)}</li>)}</ul>
  </div>;
}

const locatorOptions = (): Option<Locator["kind"]>[] => locatorKinds.map(kind => ({ value: kind, label: locatorName(kind) }));

function TargetEditor({ label, target, change, tools, editable }: {
  label: string; target?: Target; change: (target: Target) => void; tools: Tools; editable: boolean;
}) {
  const value = target || { locators: [] };
  const [found, setFound] = useState<number>();
  const set = (locators: Locator[]) => { setFound(undefined); change({ ...value, locators }); };
  const move = (from: number, to: number) => { const list = [...value.locators]; const [item] = list.splice(from, 1); list.splice(to, 0, item); set(list); };
  return <Section title={label} aside={found !== undefined ? <span className={`wa-found${found === 1 ? " is-ok" : ""}`} role="status">
    {found === 1 ? uiText("找到 1 个元素。") : found ? uiText("找到 {0} 个元素，请再收窄。", found) : uiText("页面上没找到。")}</span> : undefined}>
    <p className="wa-muted">{uiText("运行时从上往下找，用第一个能唯一找到元素的定位方式。")}</p>
    <ol className="wa-locators">
      {value.locators.map((locator, index) => <li key={index} className="wa-locator">
        <span className="wa-locator-rank">{index + 1}</span>
        <div className="wa-locator-body">
          <Select label={uiText("定位方式")} value={locator.kind} options={locatorOptions()} disabled={!editable}
            onChange={kind => set(value.locators.map((item, position) => position === index ? { kind, value: item.value, role: item.role, name: item.name } : item))}/>
          {locator.kind === "role" ? <div className="wa-locator-pair">
            <input className="wa-input" aria-label={uiText("角色")} placeholder="button" value={locator.role || ""} disabled={!editable}
              onChange={event => set(value.locators.map((item, position) => position === index ? { ...item, role: event.target.value } : item))}/>
            <input className="wa-input" aria-label={uiText("可访问名称")} placeholder={uiText("可访问名称")} value={locator.name || ""} disabled={!editable}
              onChange={event => set(value.locators.map((item, position) => position === index ? { ...item, name: event.target.value } : item))}/>
          </div> : <input className="wa-input is-mono" aria-label={uiText("定位值")} value={locator.value || ""} disabled={!editable}
            onChange={event => set(value.locators.map((item, position) => position === index ? { ...item, value: event.target.value } : item))}/>}
        </div>
        {editable && <div className="wa-locator-actions">
          <IconButton label={uiText("上移")} disabled={!index} onClick={() => move(index, index - 1)}><Icon.up size={13}/></IconButton>
          <IconButton label={uiText("下移")} disabled={index === value.locators.length - 1} onClick={() => move(index, index + 1)}><Icon.down size={13}/></IconButton>
          <IconButton label={uiText("删除定位方式")} onClick={() => set(value.locators.filter((_, position) => position !== index))}><Icon.close size={13}/></IconButton>
        </div>}
      </li>)}
    </ol>
    {(value.frame?.length || value.shadow?.length) ? <p className="wa-muted">
      {value.frame?.length ? uiText("在 {0} 层 iframe 里", value.frame.length) : ""}{value.frame?.length && value.shadow?.length ? " · " : ""}
      {value.shadow?.length ? uiText("在 {0} 层 Shadow DOM 里", value.shadow.length) : ""}</p> : null}
    <div className="wa-row">
      {editable && <button type="button" className="wa-btn is-ghost" onClick={() => set([...value.locators, { kind: "css", value: "" }])}><Icon.plus size={14}/>{uiText("定位方式")}</button>}
      {editable && tools.pick && <button type="button" className="wa-btn is-ghost" onClick={() => void tools.pick!().then(picked => { if (picked) { setFound(undefined); change(picked); } })}>
        <Icon.crosshair size={14}/>{uiText("在页面上选")}</button>}
      {tools.locate && <button type="button" className="wa-btn is-ghost" disabled={!value.locators.length}
        onClick={() => void tools.locate!(value).then(count => setFound(count))}><Icon.scan size={14}/>{uiText("测试")}</button>}
    </div>
  </Section>;
}

function onErrorOptions(nodes: ScriptNode[], self?: string, inherit = false): Option<string>[] {
  return [
    ...(inherit ? [{ value: "", label: uiText("跟随脚本设置") }] : []),
    { value: "stop", label: uiText("停止运行") }, { value: "skip", label: uiText("跳过这一步") },
    ...[1, 2, 3].map(count => ({ value: `retry:${count}`, label: uiText("重试 {0} 次", count) })),
    ...nodes.filter(node => node.id !== self && node.type !== "note").map(node => ({ value: `goto:${node.id}`, label: uiText("跳到「{0}」", node.title || typeName(node.type)) })),
  ];
}

function Footer({ editable, dirty, saving, save, discard }: { editable: boolean; dirty: boolean; saving: boolean; save: () => void; discard: () => void }) {
  if (!editable) return null;
  return <footer className="wa-panel-foot">
    {dirty ? <span className="wa-muted">{uiText("有未保存的修改")}</span> : <span/>}
    <div className="wa-row">
      {dirty && <button type="button" className="wa-btn" onClick={discard}>{uiText("放弃修改")}</button>}
      <button type="button" className="wa-btn is-primary" disabled={!dirty || saving} onClick={save}>{uiText("保存")}</button>
    </div>
  </footer>;
}

export function NodeInspector({ node, script, scripts, issues, editable, tools, back, save }: {
  node: ScriptNode; script: Script; scripts: { id: string; name: string }[]; issues: Issue[]; editable: boolean; tools: Tools;
  back: () => void; save: (node: ScriptNode) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(node);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!dirty) setDraft(node); }, [node, dirty]);
  const change = (patch: Partial<ScriptNode>) => { setDraft(current => ({ ...current, ...patch })); setDirty(true); };
  const str = (key: keyof ScriptNode) => (draft[key] as string | undefined) || "";
  const text = (key: keyof ScriptNode, label: string, options: { placeholder?: string; hint?: string; long?: boolean; mono?: boolean; rows?: number } = {}) =>
    <Text label={label} value={str(key)} onChange={value => change({ [key]: value })} {...options}/>;
  const number = (key: "ms" | "dy" | "timeout_ms", label: string, hint?: string) =>
    <Text label={label} hint={hint} type="number" value={draft[key] === undefined ? "" : String(draft[key])}
      onChange={value => change({ [key]: value === "" ? undefined : Number(value) })}/>;
  const toggle = (key: "clear" | "sensitive" | "full", label: string, hint?: string) =>
    <Toggle label={label} hint={hint} checked={Boolean(draft[key])} onChange={value => change({ [key]: value })} disabled={!editable}/>;
  const showTarget = ["click", "type", "select", "hover", "drag", "upload", "extract", "press", "scroll"].includes(draft.type)
    || (draft.type === "screenshot" && !draft.clip)
    || (draft.type === "wait" && (draft.wait || "element") === "element")
    || ((draft.type === "assert" || draft.type === "branch") && ["visible", "hidden", "text"].includes(draft.check || "visible"));
  const optionalTarget = draft.type === "press" || draft.type === "scroll" || draft.type === "screenshot";
  const checks: Option<NonNullable<ScriptNode["check"]>>[] = [
    { value: "visible", label: uiText("元素可见") }, { value: "hidden", label: uiText("元素不可见") }, { value: "text", label: uiText("元素文字包含") },
    { value: "url", label: uiText("网址包含") }, { value: "expr", label: uiText("JS 表达式为真") }];

  async function submit() {
    setSaving(true);
    const done = await save(draft);
    setSaving(false);
    if (done) setDirty(false);
  }

  return <div className="wa-panel" aria-label={uiText("步骤详情")} role="region">
    <header className="wa-panel-head">
      <IconButton label={uiText("返回积木")} onClick={back}><Icon.backArrow size={16}/></IconButton>
      <span className="wa-tile" data-cat={category(node.type)}><StepIcon type={node.type} size={16}/></span>
      <span className="wa-panel-title"><strong>{typeName(node.type)}</strong><small>{typeHint(node.type)}</small></span>
    </header>
    <div className="wa-panel-body">
      <Issues issues={issues}/>
      <fieldset disabled={!editable} className="wa-plain">
        {text("title", uiText("步骤名称"), { placeholder: typeName(node.type) })}
        {draft.type === "navigate" && text("url", uiText("网址"), { placeholder: "https://", hint: uiText("可以用 ${参数名}。") })}
        {draft.type === "click" && <div className="wa-two">
          <Choice label={uiText("鼠标键")} value={draft.button || "left"} onChange={button => change({ button })}
            options={[{ value: "left", label: uiText("左键") }, { value: "right", label: uiText("右键") }, { value: "middle", label: uiText("中键") }]}/>
          <Choice label={uiText("次数")} value={String(draft.count || 1) as "1" | "2"} onChange={count => change({ count: Number(count) })}
            options={[{ value: "1", label: uiText("单击") }, { value: "2", label: uiText("双击") }]}/>
        </div>}
        {(draft.type === "type" || draft.type === "select") && <>
          {text("value", draft.type === "type" ? uiText("输入内容") : uiText("选项"), { long: draft.type === "type", rows: 3, hint: uiText("可以用 ${参数名}。") })}
          {draft.type === "type" && toggle("clear", uiText("先清空原有内容"))}
          {draft.type === "type" && toggle("sensitive", uiText("敏感内容"), uiText("只填参数，不写进脚本"))}
        </>}
        {draft.type === "press" && text("key", uiText("按键"), { placeholder: "Enter / Control+A", mono: true })}
        {draft.type === "scroll" && number("dy", uiText("滚动距离（像素，向上为负）"))}
        {draft.type === "upload" && text("value", uiText("文件"), { placeholder: "${file}", hint: uiText("运行这台电脑上的文件路径，通常填参数。") })}
        {draft.type === "wait" && <>
          <Choice label={uiText("等什么")} value={draft.wait || "element"} onChange={wait => change({ wait })}
            options={[{ value: "element", label: uiText("元素出现") }, { value: "network", label: uiText("网络空闲") }, { value: "url", label: uiText("网址变成") },
              { value: "download", label: uiText("下载完成") }, { value: "time", label: uiText("固定时长") }]}/>
          {draft.wait === "time" && number("ms", uiText("毫秒"))}
          {draft.wait === "url" && text("value", uiText("网址里包含"), { placeholder: "/mp_blog/manage", mono: true, hint: uiText("用在点击后会跳转的步骤后面：只等跳转完成，不会再打开一次。") })}
          {draft.wait === "download" && text("into", uiText("文件名保存到变量（可不填）"), { mono: true, hint: uiText("等上一步触发的下载完成；文件留在运行的那台电脑上。") })}
        </>}
        {(draft.type === "assert" || draft.type === "branch") && <>
          <Choice label={draft.type === "branch" ? uiText("条件") : uiText("检查")} value={draft.check || "visible"} onChange={check => change({ check })} options={checks}
            hint={draft.type === "branch" ? uiText("条件成立走「是」，否则走「否」。") : undefined}/>
          {(draft.check === "text" || draft.check === "url") && text("value", uiText("包含的文字"))}
          {draft.check === "expr" && text("code", uiText("表达式"), { mono: true, placeholder: "document.title.includes('OK')" })}
        </>}
        {draft.type === "extract" && <>
          <Choice label={uiText("提取")} value={draft.what || "text"} onChange={what => change({ what })}
            options={[{ value: "text", label: uiText("文本") }, { value: "attribute", label: uiText("属性") }, { value: "html", label: "HTML" }, { value: "table", label: uiText("表格") }, { value: "js", label: "JS" }]}/>
          {draft.what === "attribute" && text("attr", uiText("属性名"), { placeholder: "href", mono: true })}
          {draft.what === "js" && text("code", uiText("JS（参数 el 是找到的元素）"), { long: true, mono: true, hint: uiText("固定代码，不能用 ${…}。") })}
          {text("into", uiText("保存到变量"), { placeholder: "post_url", mono: true, hint: uiText("后面的步骤用 ${变量名} 读取，运行结果里也会带上。") })}
        </>}
        {draft.type === "js" && <>
          {text("code", uiText("JS 代码"), { long: true, mono: true, placeholder: "return document.title", hint: uiText("固定代码，不能用 ${…}。") })}
          {text("into", uiText("返回值保存到变量（可不填）"), { mono: true })}
        </>}
        {draft.type === "screenshot" && (draft.clip ? <div className="ui-field">
          <label>{uiText("截图区域")}</label>
          <div className="wa-row"><code className="wa-code">{`${Math.round(draft.clip.x)}, ${Math.round(draft.clip.y)} · ${Math.round(draft.clip.width)}×${Math.round(draft.clip.height)}`}</code>
            {editable && <button type="button" className="wa-btn is-small is-ghost" onClick={() => change({ clip: undefined })}>{uiText("改成整页或元素截图")}</button>}</div>
          <small>{uiText("在浏览器里框选的区域，按页面可见区域的位置截取，页面布局变了位置不会跟着变。")}</small>
        </div> : toggle("full", uiText("整页截图")))}
        {draft.type === "tab" && <Choice label={uiText("切到哪个标签页")} value={draft.tab || "popup"} onChange={tab => change({ tab })}
          hint={draft.tab === "popup" || !draft.tab ? uiText("上一步点开的新窗口或新标签页；回放时不会重复打开。") : undefined}
          options={["popup", "new", "opener", "close", "0", "1", "2", "3"].map(tab => ({ value: tab, label: tabName(tab) }))}/>}
        {draft.type === "dialog" && <>
          <Choice label={uiText("怎么处理")} value={draft.dialog || "accept"} onChange={dialog => change({ dialog })}
            options={[{ value: "accept", label: uiText("接受") }, { value: "dismiss", label: uiText("取消") }]}
            hint={uiText("处理上一步弹出的原生对话框（alert、confirm、prompt）。")}/>
          {draft.dialog !== "dismiss" && text("value", uiText("输入框里的文字（只用于 prompt）"), { hint: uiText("可以用 ${参数名}，敏感参数也可以。") })}
        </>}
        {draft.type === "loop" && <>
          {text("list", uiText("遍历的列表"), { placeholder: "${rows}", mono: true })}
          {text("as", uiText("每一项叫"), { placeholder: "item", mono: true, hint: uiText("「每一项」那条线走到头后回到循环；全部走完后走「结束后」。") })}
        </>}
        {draft.type === "subflow" && <Choice label={uiText("调用的脚本")} value={draft.script_id || ""} onChange={script_id => change({ script_id })}
          options={[{ value: "", label: uiText("请选择") }, ...scripts.map(item => ({ value: item.id, label: item.name || item.id }))]}/>}
        {draft.type === "confirm" && text("message", uiText("要问的话"), { long: true, rows: 3, placeholder: uiText("填好了，确认提交吗？"),
          hint: uiText("运行到这里会停下，带上截图问触发运行的人或 agent。") })}
        {draft.type === "note" && text("note", uiText("便签内容"), { long: true })}
      </fieldset>
      {showTarget && <TargetEditor label={optionalTarget ? uiText("元素（可不选）") : uiText("元素")} target={draft.target} tools={tools} editable={editable}
        change={value => change({ target: value })}/>}
      {draft.type === "drag" && <TargetEditor label={uiText("拖到")} target={draft.to} tools={tools} editable={editable} change={value => change({ to: value })}/>}
      {draft.type !== "note" && <Section title={uiText("出错和超时")}>
        <fieldset disabled={!editable} className="wa-plain">
          <Choice label={uiText("这一步出错时")} value={draft.on_error || ""} onChange={value => change({ on_error: (value || undefined) as OnError | undefined })}
            options={onErrorOptions(script.graph.nodes, node.id, true)}/>
          {number("timeout_ms", uiText("超时（毫秒）"), uiText("默认等元素出现、可见、可点击，最多 30 秒。"))}
        </fieldset>
      </Section>}
    </div>
    <Footer editable={editable} dirty={dirty} saving={saving} save={() => void submit()} discard={() => { setDraft(node); setDirty(false); }}/>
  </div>;
}

const paramTypes: ParamType[] = ["string", "text", "number", "bool", "secret"];

export type AgentAccess = {
  version: number; approvals: Approval[]; profiles: { id: string; name: string }[];
  approve: (profile: string) => Promise<void>; revoke: (version: number) => Promise<void>;
};

function AgentRuns({ access, canApprove }: { access: AgentAccess; canApprove: boolean }) {
  const [profile, setProfile] = useState(access.profiles[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const current = access.approvals.find(item => item.version === access.version);
  return <Section title={uiText("Agent 运行")}>
    <p className="wa-muted">{uiText("agent 只能运行你在这台电脑上批准过的版本；脚本改动后要重新批准。批准时会列出这个版本要打开的网址和要执行的代码。")}</p>
    {current ? <p className="wa-approved"><Icon.check size={14}/>{uiText("版本 {0} 已允许 agent 用「{1}」运行", current.version, current.profile)}</p>
      : canApprove ? <div className="wa-approve">
        <Select label={uiText("用哪个 profile")} value={profile} onChange={setProfile} placeholder={uiText("还没有 profile")}
          options={access.profiles.map(item => ({ value: item.id, label: item.name, icon: <Icon.profile size={14}/> }))}/>
        <button type="button" className="wa-btn" disabled={!profile || busy} onClick={() => { setBusy(true); void access.approve(profile).finally(() => setBusy(false)); }}>
          {uiText("允许 agent 运行版本 {0}", access.version)}</button>
      </div> : <p className="wa-muted">{uiText("先改好脚本里的问题，才能批准。")}</p>}
    {access.approvals.length > 0 && <ul className="wa-approvals">
      {[...access.approvals].sort((a, b) => b.version - a.version).map(item => <li key={item.version}>
        <span>{uiText("版本 {0}", item.version)} · {item.profile}<small>{item.digest.slice(0, 12)}</small></span>
        <button type="button" className="wa-btn is-ghost is-small" onClick={() => void access.revoke(item.version)}>{uiText("撤销批准")}</button>
      </li>)}
    </ul>}
  </Section>;
}

export function ScriptSettings({ script, issues, editable, profiles, save, remove, duplicate, access }: {
  script: Script; issues: Issue[]; editable: boolean; profiles?: { name: string }[];
  save: (script: Script) => Promise<boolean>; remove: () => void; duplicate: () => void; access?: AgentAccess;
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
  const profileOptions: Option<string>[] = [{ value: "", label: uiText("不指定") },
    ...[...new Set([...(profiles || []).map(profile => profile.name), draft.profile].filter(Boolean))].map(name => ({ value: name, label: name }))];
  return <div className="wa-panel" aria-label={uiText("脚本设置")} role="region">
    <div className="wa-panel-body">
      <div className="wa-meter"><span>{uiText("{0} 个步骤", steps)}</span><span>{Math.ceil(size / 1024)} KB / 64 KB</span>
        <i style={{ width: `${Math.min(100, (size / recordLimit) * 100)}%` }}/></div>
      <Issues issues={issues.filter(issue => !issue.node)}/>
      {issues.some(issue => issue.node) && <p className="wa-muted">{uiText("有 {0} 个步骤需要修改，画布上带圆点的就是。", new Set(issues.filter(issue => issue.node).map(issue => issue.node)).size)}</p>}
      <fieldset disabled={!editable} className="wa-plain">
        <Text label={uiText("脚本名称")} value={draft.name} onChange={name => change({ name })}/>
        <Text label={uiText("说明")} long rows={2} value={draft.description || ""} onChange={description => change({ description })}/>
        <Text label={uiText("起始网址")} value={draft.start_url} placeholder="https://" onChange={start_url => change({ start_url })}/>
        {profiles ? <Choice label={uiText("建议的 profile")} value={draft.profile} options={profileOptions} onChange={profile => change({ profile })}
          hint={uiText("一组浏览器登录状态，留在运行的那台电脑上；运行时可以换。")}/>
          : <Text label={uiText("建议的 profile")} value={draft.profile} onChange={profile => change({ profile })} hint={uiText("一组浏览器登录状态，留在运行的那台电脑上；运行时可以换。")}/>}
        <Choice label={uiText("步骤出错时")} value={draft.on_error} options={onErrorOptions([])} onChange={value => change({ on_error: value as OnError })}/>
      </fieldset>
      <Section title={uiText("运行参数")} aside={editable ? <button type="button" className="wa-btn is-ghost is-small" onClick={() => change({ params: [...draft.params, { name: "", type: "string" }] })}><Icon.plus size={13}/>{uiText("参数")}</button> : undefined}>
        <p className="wa-muted">{uiText("人或 agent 运行时传入，步骤里写 ${参数名}。敏感参数只在运行时传，不保存。")}</p>
        {draft.params.map((param, index) => <div className="wa-param" key={index}>
          <div className="wa-param-top">
            <input className="wa-input is-mono" aria-label={uiText("参数名")} value={param.name} placeholder="title" disabled={!editable} onChange={event => setParam(index, { name: event.target.value })}/>
            <Select label={uiText("参数类型")} value={param.type} disabled={!editable} options={paramTypes.map(type => ({ value: type, label: paramTypeName(type) }))} onChange={type => setParam(index, { type })}/>
            {editable && <IconButton label={uiText("删除参数")} onClick={() => change({ params: draft.params.filter((_, position) => position !== index) })}><Icon.close size={13}/></IconButton>}
          </div>
          <div className="wa-param-bottom">
            <input className="wa-input" aria-label={uiText("默认值")} placeholder={param.type === "secret" ? uiText("运行时填写") : uiText("默认值")} disabled={!editable || param.type === "secret"}
              value={param.type === "secret" ? "" : param.default || ""} onChange={event => setParam(index, { default: event.target.value || undefined })}/>
            <Checkbox label={uiText("必填")} checked={Boolean(param.required)} disabled={!editable} onChange={required => setParam(index, { required })}/>
          </div>
        </div>)}
      </Section>
      {access && <AgentRuns access={access} canApprove={!dirty && issues.length === 0}/>}
      {size > recordLimit && <p className="wa-error">{uiText("脚本太大了（上限 64 KB），请拆成子流程。")}</p>}
      {editable && <div className="wa-danger-row">
        <button type="button" className="wa-btn is-ghost" onClick={duplicate}><Icon.copy size={14}/>{uiText("复制一份")}</button>
        <button type="button" className="wa-btn is-ghost is-danger" onClick={remove}><Icon.trash size={14}/>{uiText("删除脚本")}</button>
      </div>}
    </div>
    <Footer editable={editable} dirty={dirty} saving={saving || size > recordLimit} save={() => void submit()} discard={() => { setDraft(script); setDirty(false); }}/>
  </div>;
}
