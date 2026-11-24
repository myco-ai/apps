import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { XYPosition } from "@xyflow/react";
import { Kit, mount, uid, useKit } from "../_lib/appkit";
import { locale, t as uiText } from "../_lib/i18n";
import { Store, type MycoRecord } from "../_lib/myco";
import { browser, errorCode, type Approval, type BrowserProfile, type BrowserStatus, type RunUpdate } from "./bridge";
import { Canvas } from "./canvas";
import { NodeInspector, ScriptSettings, type AgentAccess, type Tools } from "./inspector";
import { bridgeError, category, stateDot, stateName, typeName } from "./labels";
import { append, withSecretParams, bytes, columnGap, connect, cutOutput, emptySettings, finished, fitRun, langOk, launchArgOk, layout, newNode, newScript, normalize,
  proxyServer, recordLimit, removeNode, runArguments, splitProxy, userAgentOk, validate, type Draft, type NodeType, type ProfileSettings, type ProfileSettingsInput,
  type ProxyKind, type Run, type RunStep, type Script } from "./model";
import { Palette } from "./palette";
import { Icon, StepIcon } from "./icons";
import { Field, Popover, Segmented, Select, Switch, Toggle } from "./ui";
import "../_lib/sheet.css";
import "./automation.css";

const scripts = new Store<Script>("scripts");
const runs = new Store<Run>("runs");
const drafts = new Store<Draft>("drafts");
const kit = new Kit([scripts, runs, drafts], { quiet: true });
type View = "editor" | "runs" | "drafts";

const when = (iso: string) => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toLocaleString(locale(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
};
const duration = (run: Run) => {
  const start = Date.parse(run.started_at), end = Date.parse(run.ended_at) || Date.now();
  if (!Number.isFinite(start)) return "";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return seconds < 60 ? uiText("{0} 秒", seconds) : uiText("{0} 分 {1} 秒", Math.floor(seconds / 60), seconds % 60);
};
const ms = (value?: number) => value === undefined ? "" : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`;
const newest = (rows: MycoRecord<Run>[]) => [...rows].sort((a, b) => Date.parse(b.data.started_at) - Date.parse(a.data.started_at));

/** Writes a script after checking its size; `change` reads the newest copy. */
async function update(id: string, change: (script: Script) => Script) {
  const current = scripts.get(id);
  if (!current) return false;
  const next = change(normalize(current.data));
  if (bytes(next) > recordLimit) { kit.flash(uiText("脚本太大了（上限 64 KB），请拆成子流程。")); return false; }
  return Boolean(await kit.track(scripts.put(next, id)));
}

function Dot({ state }: { state: Run["state"] }) {
  return <span className={`wa-dot ${stateDot(state)}`} aria-hidden="true"/>;
}

function State({ state }: { state: Run["state"] }) {
  return <span className={`wa-state ${stateDot(state)}`}><Dot state={state}/>{stateName(state)}</span>;
}

function Dialog({ title, children, close, footer, wide }: { title: string; children: ReactNode; close: () => void; footer: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={`wa-dialog${wide ? " is-wide" : ""}`} aria-label={title} onClose={close}
    onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
    <header><h2>{title}</h2><button type="button" className="ui-icon-btn" aria-label={uiText("关闭")} onClick={() => dialog.current?.close()}><Icon.close size={15}/></button></header>
    <div className="wa-dialog-body">{children}</div>
    <footer>{footer}</footer>
  </dialog>;
}
const closeDialog = (event: React.MouseEvent) => (event.currentTarget.closest("dialog") as HTMLDialogElement | null)?.close();

function RunDialog({ script, id, version, profiles, startAt, breakpoints, close, start }: {
  script: Script; id: string; version: number; profiles: BrowserProfile[]; startAt?: string; breakpoints: string[];
  close: () => void; start: (input: { values: Record<string, string>; secrets: Record<string, string>; profile: string; headless: boolean; startAt?: string }) => void;
}) {
  const [input, setInput] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState(profiles.find(item => item.name === script.profile)?.id || profiles[0]?.id || "");
  const [headless, setHeadless] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const issues = validate(script, scripts.rows.map(row => row.id), id);
  const from = startAt ? script.graph.nodes.find(node => node.id === startAt) : undefined;
  return <Dialog title={uiText("运行「{0}」", script.name || uiText("未命名脚本"))} close={close} footer={<>
    <button type="button" className="wa-btn" onClick={closeDialog}>{uiText("取消")}</button>
    <button type="button" className="wa-btn is-primary" disabled={issues.length > 0 || !profile} onClick={event => {
      const result = runArguments(script.params, input);
      setMissing(result.missing);
      if (result.missing.length) return;
      start({ values: result.values, secrets: result.secrets, profile, headless, startAt });
      closeDialog(event);
    }}><Icon.play size={13}/>{uiText("开始运行")}</button>
  </>}>
    <div className="wa-chips">
      <span className="wa-chip">{uiText("版本 {0}", version)}</span>
      {from && <span className="wa-chip">{uiText("从「{0}」开始", from.title || typeName(from.type))}</span>}
      {breakpoints.length > 0 && <span className="wa-chip">{uiText("{0} 个断点", breakpoints.length)}</span>}
    </div>
    {issues.length > 0 && <p className="wa-error">{uiText("脚本还有 {0} 处需要修改，先改好再运行。", issues.length)}</p>}
    <div className="ui-field"><span className="ui-label">{uiText("用哪个 profile")}</span>
      <Select label={uiText("用哪个 profile")} value={profile} onChange={setProfile} placeholder={uiText("还没有 profile")}
        options={profiles.map(item => ({ value: item.id, label: item.name, icon: <Icon.profile size={14}/> }))}/>
      {!profiles.length && <small>{uiText("还没有 profile，请先在「Profile」里新建一个。")}</small>}
    </div>
    {script.params.map(param => <div className="ui-field" key={param.name}>
      <label htmlFor={`wa-param-${param.name}`}>{param.name}{param.required ? " *" : ""}{param.type === "secret" ? <span className="wa-chip is-small">{uiText("不保存")}</span> : null}</label>
      {param.type === "text" ? <textarea id={`wa-param-${param.name}`} className="wa-input" rows={3} value={input[param.name] ?? param.default ?? ""} onChange={event => setInput({ ...input, [param.name]: event.target.value })}/>
        : param.type === "bool" ? <Select label={param.name} value={(input[param.name] ?? param.default ?? "false") as "true" | "false"} onChange={value => setInput({ ...input, [param.name]: value })}
          options={[{ value: "true", label: uiText("是") }, { value: "false", label: uiText("否") }]}/>
        : <input id={`wa-param-${param.name}`} className="wa-input" type={param.type === "secret" ? "password" : param.type === "number" ? "number" : "text"} autoComplete="off"
          value={input[param.name] ?? (param.type === "secret" ? "" : param.default ?? "")} onChange={event => setInput({ ...input, [param.name]: event.target.value })}/>}
      {missing.includes(param.name) && <small className="wa-error">{uiText("请填写有效的值。")}</small>}
    </div>)}
    <Toggle label={uiText("不显示浏览器窗口")} hint={uiText("无头运行，适合不需要看着的任务")} checked={headless} onChange={setHeadless}/>
  </Dialog>;
}

function RecordDialog({ script, profiles, close, start }: {
  script: Script; profiles: BrowserProfile[]; close: () => void; start: (profile: string, url: string) => void;
}) {
  const [profile, setProfile] = useState(profiles.find(item => item.name === script.profile)?.id || profiles[0]?.id || "");
  const [url, setURL] = useState(script.start_url);
  const valid = /^https?:\/\//i.test(url.trim());
  return <Dialog title={uiText("录制")} close={close} footer={<>
    <button type="button" className="wa-btn" onClick={closeDialog}>{uiText("取消")}</button>
    <button type="button" className="wa-btn is-primary" disabled={!profile || !valid} onClick={event => { start(profile, url.trim()); closeDialog(event); }}>
      <Icon.record size={13}/>{uiText("开始录制")}</button>
  </>}>
    <p className="wa-muted">{uiText("会打开 myco 专用的浏览器窗口，不碰你日常用的 Chrome。你在里面的操作会一步步出现在画布上；密码框里的内容不会记下来。")}</p>
    <div className="ui-field"><span className="ui-label">{uiText("用哪个 profile")}</span>
      <Select label={uiText("用哪个 profile")} value={profile} onChange={setProfile} placeholder={uiText("还没有 profile")}
        options={profiles.map(item => ({ value: item.id, label: item.name, icon: <Icon.profile size={14}/> }))}/></div>
    <div className="ui-field"><label htmlFor="wa-record-url">{uiText("打开网址")}</label>
      <input id="wa-record-url" className="wa-input" value={url} placeholder="https://" onChange={event => setURL(event.target.value)}/></div>
  </Dialog>;
}

function profileSummary(settings?: ProfileSettings) {
  if (!settings) return "";
  const parts = [settings.proxy ? uiText("代理 {0}", splitProxy(settings.proxy.server).address) : "",
    settings.user_agent ? uiText("自定义 UA") : "", settings.lang ? settings.lang : "",
    settings.args.length ? uiText("{0} 个启动参数", settings.args.length) : ""];
  return parts.filter(Boolean).join(" · ");
}

function ProfilesDialog({ status, refresh, close }: { status: BrowserStatus; refresh: () => void; close: () => void }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState("");
  const bridge = browser()!;
  const act = (task: Promise<unknown>) => void task.then(refresh, error => kit.flash(bridgeError(errorCode(error))));
  const configure = bridge.profiles.configure?.bind(bridge.profiles);
  const current = status.profiles.find(profile => profile.id === editing);
  if (current && configure) return <ProfileSettingsDialog profile={current} close={close} back={() => setEditing("")}
    save={settings => configure(current.id, settings).then(() => { refresh(); setEditing(""); kit.flash(current.running ? uiText("已保存，关掉这个浏览器后再打开生效") : uiText("已保存")); },
      error => { if (errorCode(error) !== "cancelled") kit.flash(bridgeError(errorCode(error))); })}/>;
  return <Dialog title={uiText("Profile")} close={close} wide footer={<button type="button" className="wa-btn is-primary" onClick={closeDialog}>{uiText("完成")}</button>}>
    <p className="wa-muted">{uiText("每个 profile 是一组单独的浏览器登录状态，只存在 {0} 上。打开「允许 agent 使用」后，agent 才能申请用它跑脚本。", status.machine)}</p>
    <ul className="wa-profiles">
      {status.profiles.map(profile => <li key={profile.id}>
        <span className="wa-avatar"><Icon.profile size={16}/></span>
        <span className="wa-profile-name"><strong>{profile.name}</strong><small>{[profile.running ? uiText("浏览器开着") : uiText("未打开"), profileSummary(profile.settings)].filter(Boolean).join(" · ")}</small></span>
        <button type="button" className="wa-btn is-ghost is-small" onClick={() => act(bridge.profiles.open(profile.id))}>{uiText("打开浏览器登录")}</button>
        {configure && <button type="button" className="wa-btn is-ghost is-small" aria-label={uiText("「{0}」的浏览器设置", profile.name)} onClick={() => setEditing(profile.id)}><Icon.settings size={14}/>{uiText("设置")}</button>}
        <span className="wa-profile-agents">{uiText("允许 agent 使用")}<Switch label={uiText("允许 agent 使用")} checked={profile.agents} onChange={value => act(bridge.profiles.allowAgents(profile.id, value))}/></span>
      </li>)}
      {!status.profiles.length && <li className="wa-muted">{uiText("还没有 profile。")}</li>}
    </ul>
    <form className="wa-row" onSubmit={event => { event.preventDefault(); if (name.trim()) { act(bridge.profiles.create(name.trim())); setName(""); } }}>
      <input className="wa-input" aria-label={uiText("新 profile 的名字")} placeholder={uiText("例如：发帖号")} value={name} maxLength={40} onChange={event => setName(event.target.value)}/>
      <button className="wa-btn" disabled={!name.trim()}><Icon.plus size={14}/>{uiText("新建")}</button>
    </form>
  </Dialog>;
}

type ProxyChoice = "none" | ProxyKind;
function ProfileSettingsDialog({ profile, close, back, save }: {
  profile: BrowserProfile; close: () => void; back: () => void; save: (settings: ProfileSettingsInput) => Promise<void>;
}) {
  const saved = profile.settings || emptySettings;
  const split = saved.proxy ? splitProxy(saved.proxy.server) : { kind: "http" as ProxyKind, address: "" };
  const [kind, setKind] = useState<ProxyChoice>(saved.proxy ? split.kind : "none");
  const [address, setAddress] = useState(split.address);
  const [username, setUsername] = useState(saved.proxy?.username || "");
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [bypass, setBypass] = useState((saved.proxy?.bypass || []).join(", "));
  const [ua, setUA] = useState(saved.user_agent);
  const [lang, setLang] = useState(saved.lang);
  const [args, setArgs] = useState(saved.args.join("\n"));
  const [busy, setBusy] = useState(false);
  const argList = args.split("\n").map(line => line.trim()).filter(Boolean);
  const badArgs = argList.filter(arg => !launchArgOk(arg));
  const server = kind === "none" ? "" : proxyServer(kind, address);
  const errors = {
    address: kind !== "none" && address.trim() && !server ? uiText("写成 主机:端口，例如 127.0.0.1:7890") : kind !== "none" && !address.trim() ? uiText("请填写代理地址") : "",
    ua: userAgentOk(ua) ? "" : uiText("UA 不能换行，最长 512 个字符"),
    lang: langOk(lang) ? "" : uiText("写成语言代码，例如 zh-CN、en-US"),
    args: badArgs.length ? uiText("不支持：{0}", badArgs.join("  ")) : "",
  };
  const invalid = Object.values(errors).some(Boolean);
  const hadPassword = Boolean(saved.proxy?.has_password);
  const submit = () => {
    if (invalid) return;
    const proxy = kind === "none" ? null : {
      server, username: username.trim(), bypass: bypass.split(/[,\s]+/).map(item => item.trim()).filter(Boolean),
      ...(password ? { password } : clearPassword || !username.trim() ? { password: "" } : {}),
    };
    setBusy(true);
    void save({ proxy, user_agent: ua.trim(), lang: lang.trim(), args: argList }).finally(() => setBusy(false));
  };
  const proxyOptions: { value: ProxyChoice; label: string }[] = [{ value: "none", label: uiText("不用代理") }, { value: "http", label: "HTTP" }, { value: "https", label: "HTTPS" }, { value: "socks5", label: "SOCKS5" }];
  return <Dialog title={uiText("「{0}」的浏览器设置", profile.name)} close={close} wide footer={<>
    <button type="button" className="wa-btn" onClick={back}>{uiText("返回")}</button>
    <button type="button" className="wa-btn is-primary" disabled={invalid || busy} onClick={submit}>{busy ? uiText("正在保存…") : uiText("保存")}</button>
  </>}>
    <p className="wa-muted">{uiText("这些设置只存在这台电脑上，不会写进页面数据。保存时 App 会让你再确认一次；浏览器开着的话，关掉后再打开生效。")}</p>
    <section className="wa-settings-group" aria-label={uiText("代理")}>
      <h3>{uiText("代理")}</h3>
      <Segmented label={uiText("代理类型")} value={kind} options={proxyOptions} onChange={setKind}/>
      {kind !== "none" && <>
        <Field label={uiText("地址")} htmlFor="wa-proxy-address">
          <input id="wa-proxy-address" className="wa-input is-mono" value={address} placeholder="127.0.0.1:7890" autoComplete="off" spellCheck={false}
            aria-invalid={Boolean(errors.address)} onChange={event => setAddress(event.target.value)}/>
          {errors.address && <p className="wa-error">{errors.address}</p>}
        </Field>
        <div className="wa-settings-pair">
          <Field label={uiText("账号（可选）")} htmlFor="wa-proxy-user">
            <input id="wa-proxy-user" className="wa-input" value={username} autoComplete="off" spellCheck={false} onChange={event => setUsername(event.target.value)}/>
          </Field>
          <Field label={uiText("密码（可选）")} htmlFor="wa-proxy-password" hint={hadPassword && !password && !clearPassword ? uiText("已保存，留空不改") : undefined}>
            <input id="wa-proxy-password" className="wa-input" type="password" value={password} autoComplete="new-password" disabled={!username.trim()}
              placeholder={hadPassword && !clearPassword ? "••••••••" : ""} onChange={event => { setPassword(event.target.value); setClearPassword(false); }}/>
          </Field>
        </div>
        {hadPassword && username.trim() && !password && <button type="button" className="wa-btn is-ghost is-small" aria-pressed={clearPassword}
          onClick={() => setClearPassword(value => !value)}>{clearPassword ? uiText("保留已保存的密码") : uiText("清除已保存的密码")}</button>}
        <Field label={uiText("不走代理的地址")} htmlFor="wa-proxy-bypass" hint={uiText("用逗号分开，例如 localhost, *.example.com")}>
          <input id="wa-proxy-bypass" className="wa-input is-mono" value={bypass} autoComplete="off" spellCheck={false} onChange={event => setBypass(event.target.value)}/>
        </Field>
      </>}
    </section>
    <section className="wa-settings-group" aria-label={uiText("浏览器身份")}>
      <h3>{uiText("浏览器身份")}</h3>
      <Field label="User-Agent" htmlFor="wa-ua" hint={errors.ua ? undefined : uiText("留空就用 Chrome 自带的（推荐）。改了以后和浏览器真实版本对不上，反而更容易被网站识别。")}>
        <input id="wa-ua" className="wa-input is-mono" value={ua} placeholder={uiText("用 Chrome 自带的")} spellCheck={false} aria-invalid={Boolean(errors.ua)} onChange={event => setUA(event.target.value)}/>
        {errors.ua && <p className="wa-error">{errors.ua}</p>}
      </Field>
      <Field label={uiText("语言")} htmlFor="wa-lang" hint={errors.lang ? undefined : uiText("网页看到的首选语言；留空跟随系统")}>
        <input id="wa-lang" className="wa-input is-mono" value={lang} placeholder="zh-CN" spellCheck={false} aria-invalid={Boolean(errors.lang)} onChange={event => setLang(event.target.value)}/>
        {errors.lang && <p className="wa-error">{errors.lang}</p>}
      </Field>
    </section>
    <section className="wa-settings-group" aria-label={uiText("启动参数")}>
      <h3>{uiText("启动参数")}</h3>
      <Field label={uiText("每行一个")} htmlFor="wa-args" hint={errors.args ? undefined : uiText("只支持窗口大小、缩放、GPU、后台节流、功能开关和不加载图片这几类，其余会被拒绝。")}>
        <textarea id="wa-args" className="wa-input is-mono" rows={3} value={args} placeholder={"--start-maximized\n--window-size=1440,900"} spellCheck={false}
          aria-invalid={Boolean(errors.args)} onChange={event => setArgs(event.target.value)}/>
        {errors.args && <p className="wa-error">{errors.args}</p>}
      </Field>
    </section>
  </Dialog>;
}

function RunDetail({ run, script, live, control }: {
  run: MycoRecord<Run>; script?: Script; live: boolean; control: (action: "pause" | "resume" | "step" | "cancel", choice?: string) => void;
}) {
  const nodes = new Map((script?.graph.nodes || []).map(node => [node.id, node]));
  const data = run.data;
  const output = Object.entries(data.output || {});
  return <section className="wa-run" aria-label={uiText("运行详情")}>
    <header className="wa-run-head">
      <div>
        <h2>{data.script_name || uiText("未命名脚本")}</h2>
        <div className="wa-chips">
          <State state={data.state}/>
          <span className="wa-chip">{when(data.started_at)}</span>
          {duration(data) && <span className="wa-chip">{duration(data)}</span>}
          <span className="wa-chip">{data.by_kind === "agent" ? uiText("agent {0} 触发", data.by) : uiText("{0} 触发", data.by)}</span>
          {data.machine && <span className="wa-chip">{data.machine}</span>}
          {data.profile && <span className="wa-chip"><Icon.profile size={12}/>{data.profile}</span>}
          <span className="wa-chip">{uiText("版本 {0}", data.script_version)}</span>
        </div>
      </div>
      {live && <div className="wa-row">
        {data.state === "running" && <button type="button" className="wa-btn" onClick={() => control("pause")}><Icon.pause size={13}/>{uiText("暂停")}</button>}
        {data.state === "paused" && !data.question && <><button type="button" className="wa-btn" onClick={() => control("resume")}><Icon.play size={12}/>{uiText("继续")}</button>
          <button type="button" className="wa-btn" onClick={() => control("step")}><Icon.step size={13}/>{uiText("单步")}</button></>}
        {!finished(data.state) && <button type="button" className="wa-btn is-danger" onClick={() => control("cancel")}><Icon.stop size={12}/>{uiText("停止")}</button>}
      </div>}
    </header>
    {data.state === "paused" && data.question && <div className="wa-question" role="alert">
      <span className="wa-tile" data-cat="flow"><Icon.confirm size={17}/></span>
      <div><strong>{data.question}</strong>
        {live ? <div className="wa-row">
          <button type="button" className="wa-btn is-primary" onClick={() => control("resume", "ok")}>{uiText("同意，继续")}</button>
          <button type="button" className="wa-btn" onClick={() => control("resume", "cancel")}>{uiText("拒绝")}</button>
        </div> : <p className="wa-muted">{uiText("等触发运行的人或 agent 回答。")}</p>}</div>
    </div>}
    {data.error && <div className="wa-error-box"><Icon.warning size={15}/><span>{nodes.get(data.error_node) ? `${nodes.get(data.error_node)!.title || typeName(nodes.get(data.error_node)!.type)} · ` : ""}{data.error}</span></div>}
    <ol className="wa-timeline">
      {data.steps.map((step, index) => { const node = nodes.get(step.node); return <li key={index} data-state={step.state}>
        <span className="wa-tile" data-cat={node ? category(node.type) : "note"}>{node ? <StepIcon type={node.type} size={15}/> : <Icon.file size={15}/>}</span>
        <span className="wa-timeline-text"><strong>{node ? node.title || typeName(node.type) : step.node}</strong>
          {step.state === "failed" ? <small className="wa-error">{step.error || uiText("失败")}</small> : node && <small>{typeName(node.type)}</small>}</span>
        <span className={`wa-step-state is-${step.state}`}>{step.state === "skipped" ? uiText("跳过") : step.state === "running" ? uiText("运行中") : step.state === "failed" ? uiText("失败") : ms(step.ms)}</span>
      </li>; })}
    </ol>
    {output.length > 0 && <section className="wa-output"><h3>{uiText("提取的数据")}</h3>
      <dl>{output.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl></section>}
    {!data.steps.length && !data.error && <p className="wa-muted">{uiText("还没有步骤记录。")}</p>}
  </section>;
}

function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="wa-empty"><span className="wa-empty-icon">{icon}</span><h2>{title}</h2><p>{text}</p>{action}</div>;
}

function App() {
  useKit(kit);
  const [view, setView] = useState<View>("editor");
  const [side, setSide] = useState<"blocks" | "settings">("blocks");
  const [scriptId, setScriptId] = useState(() => scripts.rows[0]?.id || "");
  const [nodeId, setNodeId] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [runId, setRunId] = useState("");
  const [draftId, setDraftId] = useState("");
  const [status, setStatus] = useState<BrowserStatus | null | undefined>(browser() ? undefined : null);
  const [breakpoints, setBreakpoints] = useState<Record<string, string[]>>({});
  const [dialog, setDialog] = useState<"run" | "record" | "profiles" | "">("");
  const [switcher, setSwitcher] = useState(false);
  const [find, setFind] = useState("");
  const [startAt, setStartAt] = useState<string>();
  const [recording, setRecording] = useState<{ id: string; script: string }>();
  const [live, setLive] = useState<{ bridge: string; record: string }>();
  const [installing, setInstalling] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const stopped = useRef(false);
  const switcherButton = useRef<HTMLButtonElement>(null);
  const bridge = browser();

  const refresh = useCallback(() => {
    if (!bridge) return;
    void bridge.status().then(setStatus, () => setStatus(null));
  }, [bridge]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { stopped.current = true; }, []);
  useEffect(() => { if (scriptId && !scripts.get(scriptId)) setScriptId(scripts.rows[0]?.id || ""); });

  const record = scripts.get(scriptId);
  const script = useMemo(() => record ? normalize(record.data) : undefined, [record?.data]);
  const ids = scripts.rows.map(row => row.id);
  const issues = useMemo(() => script ? validate(script, ids, scriptId) : [], [script, ids.join(), scriptId]);
  const issueNodes = useMemo(() => new Set(issues.flatMap(issue => issue.node ? [issue.node] : [])), [issues]);
  const node = script?.graph.nodes.find(item => item.id === nodeId);
  const runRows = newest(runs.rows);
  const lastRun = (id: string) => runRows.find(run => run.data.script_id === id);
  const liveRun = live ? runs.get(live.record) : null;
  const marks = useMemo(() => {
    const result: Record<string, RunStep["state"] | "current" | ""> = {};
    if (!liveRun || liveRun.data.script_id !== scriptId) return result;
    for (const step of liveRun.data.steps) result[step.node] = step.state;
    if (!finished(liveRun.data.state) && liveRun.data.node) result[liveRun.data.node] = "current";
    return result;
  }, [liveRun?.data, scriptId]);
  const editable = kit.canEdit && !recording;
  const profiles = status?.profiles || [];
  const points = breakpoints[scriptId] || [];
  const ready = Boolean(bridge && status?.installed);
  const canRun = Boolean(ready && !live && !recording);
  // Hosts before approvals (the first protocol-1 builds) have no approvals: agents cannot run there yet.
  const loadApprovals = useCallback(() => { if (bridge?.approvals && status?.installed) void bridge.approvals.list().then(setApprovals, () => setApprovals([])); }, [bridge, status?.installed]);
  useEffect(() => { loadApprovals(); }, [loadApprovals]);
  const access: AgentAccess | undefined = ready && bridge?.approvals && record && script ? {
    version: record.version, profiles,
    approvals: approvals.filter(item => item.script_id === scriptId),
    approve: async profile => {
      const subflows = Object.fromEntries(script.graph.nodes.filter(item => item.type === "subflow" && item.script_id && scripts.get(item.script_id))
        .map(item => [item.script_id!, normalize(scripts.get(item.script_id!)!.data)]));
      try { await bridge.approvals.request({ script_id: scriptId, version: record.version, script, scripts: subflows, profile }); loadApprovals(); }
      catch (error) { if (errorCode(error) !== "cancelled") kit.flash(bridgeError(errorCode(error))); }
    },
    revoke: async version => {
      try { await bridge.approvals.revoke(scriptId, version); loadApprovals(); } catch (error) { kit.flash(bridgeError(errorCode(error))); }
    },
  } : undefined;
  const selectedRun = runs.get(runId) || runRows[0];
  const selectedDraft = drafts.get(draftId) || drafts.rows[0];

  function open(id: string) { setScriptId(id); setNodeId(""); setView("editor"); setSwitcher(false); setSide("blocks"); }

  async function create() {
    const id = uid("scr_");
    const name = uiText("新脚本 {0}", scripts.rows.length + 1);
    if (await kit.track(scripts.put(newScript(name), id))) { open(id); setSide("settings"); }
  }

  async function addNode(type: NodeType, point?: XYPosition) {
    if (!script) return;
    const id = uid("n_");
    const anchor = point ? undefined : script.graph.nodes.find(item => item.id === nodeId && item.type !== "note")
      || [...script.graph.nodes].reverse().find(item => item.type !== "note" && !script.graph.edges.some(edge => edge[0] === item.id));
    const pos: [number, number] = point ? [Math.round(point.x), Math.round(point.y)]
      : anchor ? [anchor.pos[0] + columnGap, anchor.pos[1]] : [0, 0];
    const done = await update(scriptId, current => {
      const added = { ...current, graph: { ...current.graph, nodes: [...current.graph.nodes, newNode(type, id, pos)] } };
      return anchor && type !== "note" ? connect(added, anchor.id, id) : added;
    });
    if (done) { setNodeId(id); setBrowsing(false); }
  }

  const actions = useMemo(() => ({
    remove: (id: string) => { setNodeId(current => current === id ? "" : current); void update(scriptId, current => removeNode(current, id)); },
    toggleBreakpoint: (id: string) => setBreakpoints(all => {
      const list = all[scriptId] || [];
      return { ...all, [scriptId]: list.includes(id) ? list.filter(item => item !== id) : [...list, id] };
    }),
    runFrom: canRun ? (id: string) => { setStartAt(id); setDialog("run"); } : undefined,
  }), [scriptId, canRun]);

  const tools: Tools = bridge && ready ? {
    locate: async target => {
      const profile = profiles.find(item => item.name === script?.profile)?.id || profiles[0]?.id;
      if (!profile) { kit.flash(uiText("还没有 profile，请先在「Profile」里新建一个。")); return undefined; }
      try { return (await bridge.locate({ profile, target })).count; } catch (error) { kit.flash(bridgeError(errorCode(error))); return undefined; }
    },
    pick: async () => {
      const profile = profiles.find(item => item.name === script?.profile)?.id || profiles[0]?.id;
      if (!profile) { kit.flash(uiText("还没有 profile，请先在「Profile」里新建一个。")); return undefined; }
      try { return await bridge.pick({ profile }); } catch (error) { kit.flash(bridgeError(errorCode(error))); return undefined; }
    },
  } : {};

  async function startRecording(profile: string, url: string) {
    if (!bridge || !script) return;
    const target = scriptId;
    try {
      const session = await bridge.record.start({ profile, url });
      setRecording({ id: session.id, script: target });
      if (!script.graph.nodes.length) await update(target, current => ({ ...current, start_url: current.start_url || url,
        profile: current.profile || profiles.find(item => item.id === profile)?.name || "", source: "record" }));
      let after = 0;
      while (!stopped.current) {
        const events = await bridge.record.events(session.id, after);
        after = events.next;
        if (events.steps.length) await update(target, current => withSecretParams(append(current, events.steps.map(step => ({ ...step, id: step.id || uid("n_") })))));
        if (events.done) break;
      }
    } catch (error) { kit.flash(bridgeError(errorCode(error))); }
    setRecording(undefined);
  }

  async function startRun(input: { values: Record<string, string>; secrets: Record<string, string>; profile: string; headless: boolean; startAt?: string }) {
    if (!bridge || !script || !record) return;
    const recordId = uid("run_");
    const profileName = profiles.find(item => item.id === input.profile)?.name || input.profile;
    let run: Run = {
      script_id: scriptId, script_version: record.version, script_name: script.name, state: "queued", node: "",
      by: kit.me, by_kind: "person", machine: status?.machine || "", profile: profileName,
      started_at: new Date().toISOString(), ended_at: "", error_node: "", error: "", output: {}, steps: [],
    };
    if (!await kit.track(runs.put(run, recordId))) return;
    setView("runs"); setRunId(recordId);
    const subflows = Object.fromEntries(script.graph.nodes.filter(item => item.type === "subflow" && item.script_id && scripts.get(item.script_id))
      .map(item => [item.script_id!, normalize(scripts.get(item.script_id!)!.data)]));
    const secretValues = Object.values(input.secrets);
    const write = (next: Run) => { run = fitRun(next); return kit.track(runs.put(run, recordId)); };
    try {
      const started = await bridge.runs.start({ script, script_id: scriptId, script_version: record.version, params: input.values, secrets: input.secrets,
        profile: input.profile, headless: input.headless, start_at: input.startAt, breakpoints: points, scripts: subflows });
      setLive({ bridge: started.id, record: recordId });
      let after = 0, last = 0;
      while (!stopped.current) {
        const change: RunUpdate = await bridge.runs.get(started.id, after);
        after = change.next;
        const merged = [...run.steps];
        for (const step of change.steps) {
          const index = merged.findIndex(item => item.node === step.node && item.state === "running");
          if (index >= 0) merged[index] = step; else merged.push(step);
        }
        const next: Run = { ...run, state: change.state, node: change.node, error: change.error || "", error_node: change.error_node || "",
          question: change.question, steps: merged, output: cutOutput(change.output || {}, secretValues),
          ended_at: finished(change.state) ? new Date().toISOString() : "" };
        const important = next.state !== run.state || finished(next.state) || Date.now() - last > 1500;
        run = next;
        if (important) { last = Date.now(); await write(next); }
        if (finished(change.state)) break;
      }
    } catch (error) {
      await write({ ...run, state: "failed", error: bridgeError(errorCode(error)), ended_at: new Date().toISOString() });
    }
    setLive(undefined);
  }

  function control(action: "pause" | "resume" | "step" | "cancel", choice?: string) {
    if (!bridge || !live) return;
    void bridge.runs.control(live.bridge, action, choice).catch(error => kit.flash(bridgeError(errorCode(error))));
  }

  async function removeScript() {
    if (!record) return;
    const copy = { ...record.data }, id = record.id;
    setNodeId("");
    await kit.track(scripts.remove(id));
    kit.flash(uiText("已删除「{0}」", copy.name || uiText("未命名脚本")), () => { void kit.track(scripts.put(copy, id)).then(() => open(id)); });
  }

  async function duplicate() {
    if (!script) return;
    const id = uid("scr_");
    if (await kit.track(scripts.put({ ...script, name: uiText("{0} 副本", script.name) }, id))) open(id);
  }

  async function adopt(draft: MycoRecord<Draft>) {
    const id = uid("scr_");
    const { by: _by, created_at: _created, ...rest } = draft.data;
    const next = layout({ ...normalize(rest), source: "agent" });
    if (!await kit.track(scripts.put(next, id))) return;
    await kit.track(drafts.remove(draft.id));
    setDraftId("");
    open(id);
  }

  const saveState = recording ? uiText("正在录制…") : kit.pending ? uiText("正在保存…") : kit.failed ? uiText("没保存上") : !kit.canEdit ? uiText("只能看") : uiText("已保存");
  const filtered = scripts.rows.filter(row => !find.trim() || (row.data.name || "").toLowerCase().includes(find.trim().toLowerCase()));
  const unavailable = !bridge ? uiText("需要支持浏览器组件的新版 myco App") : status && !status.installed ? uiText("请先安装浏览器组件。") : undefined;

  return <div className="wa-app">
    <header className="wa-top">
      <div className="wa-top-left">
        <button ref={switcherButton} type="button" className="wa-switcher" aria-haspopup="dialog" aria-expanded={switcher} onClick={() => setSwitcher(!switcher)}>
          <span className="wa-switcher-text"><strong>{script ? script.name || uiText("未命名脚本") : uiText("网页自动化")}</strong>
            <small className={recording ? "is-recording" : kit.failed ? "is-error" : ""}>{saveState}</small></span>
          <Icon.chevronDown size={14}/>
        </button>
        <Popover open={switcher} anchor={switcherButton} close={() => setSwitcher(false)} width={320} label={uiText("脚本")}>
          <label className="wa-search"><Icon.search size={15}/><input autoFocus value={find} onChange={event => setFind(event.target.value)} placeholder={uiText("搜索脚本")} aria-label={uiText("搜索脚本")}/></label>
          <ul className="wa-script-list" aria-label={uiText("脚本")}>
            {filtered.map(row => { const last = lastRun(row.id); return <li key={row.id}>
              <button type="button" aria-current={row.id === scriptId} onClick={() => open(row.id)}>
                <Icon.file size={16}/>
                <span className="wa-script-text"><strong>{row.data.name || uiText("未命名脚本")}</strong>
                  <small>{last ? <><Dot state={last.data.state}/>{stateName(last.data.state)} · {when(last.data.started_at)}</> : uiText("还没运行过")}{row.data.profile ? ` · ${row.data.profile}` : ""}</small></span>
                {row.id === scriptId && <Icon.check size={14}/>}
              </button></li>; })}
            {!filtered.length && <li className="wa-muted wa-pad">{scripts.rows.length ? uiText("没有匹配的脚本。") : uiText("还没有脚本。")}</li>}
          </ul>
          {kit.canEdit && <button type="button" className="wa-menu-action" onClick={() => void create()}><Icon.plus size={15}/>{uiText("新建脚本")}</button>}
        </Popover>
      </div>
      <nav className="wa-tabs" role="tablist" aria-label={uiText("视图")}>
        {([["editor", uiText("编辑器")], ["runs", uiText("运行记录")], ["drafts", uiText("草稿")]] as [View, string][]).map(([value, label]) =>
          <button type="button" role="tab" key={value} aria-selected={view === value} onClick={() => setView(value)}>{label}
            {value === "drafts" && drafts.rows.length > 0 && <span className="wa-count">{drafts.rows.length}</span>}</button>)}
      </nav>
      <div className="wa-top-right">
        {view === "editor" && script && <>
          <button type="button" className="wa-tool" disabled={!editable || !script.graph.nodes.length} onClick={() => void update(scriptId, layout)}><Icon.layout/>{uiText("自动排版")}</button>
          {ready && <button type="button" className="wa-tool" onClick={() => setDialog("profiles")}><Icon.profile/>{uiText("Profile")}</button>}
          <span className="wa-divider"/>
          {recording ? <button type="button" className="wa-tool is-recording" onClick={() => void bridge?.record.stop(recording.id).catch(() => undefined)}><Icon.stop size={12}/>{uiText("停止录制")}</button>
            : <button type="button" className="wa-tool" disabled={!canRun || !kit.canEdit} title={unavailable} onClick={() => setDialog("record")}><Icon.record/>{uiText("录制")}</button>}
          <button type="button" className="wa-btn is-primary" disabled={!canRun} title={unavailable} onClick={() => { setStartAt(undefined); setDialog("run"); }}><Icon.play size={13}/>{uiText("运行")}</button>
        </>}
        {view !== "editor" && ready && <button type="button" className="wa-tool" onClick={() => setDialog("profiles")}><Icon.profile/>{uiText("Profile")}</button>}
      </div>
    </header>
    {status === null && <div className="wa-banner" role="note">
      <Icon.warning size={15}/>
      <span><strong>{uiText("这台电脑还不能录制和运行")}</strong>{uiText("录制、调试和回放需要支持浏览器组件的新版 myco App。现在仍可编辑脚本、查看运行记录；agent 也能通过页面数据读写脚本。")}</span>
    </div>}
    {status && !status.installed && <div className="wa-banner is-install" role="note">
      <Icon.download size={15}/>
      <span><strong>{uiText("还没装浏览器组件")}</strong>{status.supported ? uiText("录制和运行要用到一个可选组件，装好后用 myco 专用的浏览器 profile，不碰你日常用的 Chrome。")
        : status.reason || uiText("这台电脑暂时不能运行浏览器组件。")}</span>
      {status.supported && bridge && <button type="button" className="wa-btn is-small" disabled={installing} onClick={() => {
        setInstalling(true);
        void bridge.install().then(setStatus, error => { if (errorCode(error) !== "cancelled") kit.flash(bridgeError(errorCode(error))); }).finally(() => setInstalling(false));
      }}>{installing ? uiText("正在安装…") : uiText("安装组件")}</button>}
    </div>}

    {status?.installed && status.update_available && bridge && <div className="wa-banner is-install" role="note">
      <Icon.download size={15}/>
      <span><strong>{uiText("浏览器组件有新版本")}</strong>{uiText("新版本修复了网站验证和兼容问题，更新后录制和回放更稳定。")}</span>
      <button type="button" className="wa-btn is-small" disabled={installing} onClick={() => {
        setInstalling(true);
        void bridge.install().then(setStatus, error => { if (errorCode(error) !== "cancelled") kit.flash(bridgeError(errorCode(error))); }).finally(() => setInstalling(false));
      }}>{installing ? uiText("正在更新…") : uiText("更新组件")}</button>
    </div>}

    {view === "editor" && (script ? <div className="wa-body">
      <aside className="wa-left">
        {node && !browsing ? <NodeInspector key={scriptId + node.id} node={node} script={script} issues={issues.filter(issue => issue.node === node.id)} editable={editable} tools={tools}
          scripts={scripts.rows.filter(row => row.id !== scriptId).map(row => ({ id: row.id, name: row.data.name }))}
          back={() => { setBrowsing(true); setSide("blocks"); }}
          save={next => update(scriptId, current => ({ ...current, graph: { ...current.graph, nodes: current.graph.nodes.map(item => item.id === next.id ? { ...next, pos: item.pos } : item) } }))}/>
          : <>
            <div className="wa-left-tabs"><Segmented label={uiText("左侧面板")} value={side} onChange={setSide} options={[
              { value: "blocks", label: uiText("积木") }, { value: "settings", label: issues.length ? uiText("设置 · {0}", issues.length) : uiText("设置") }]}/></div>
            {side === "blocks" ? <Palette editable={editable} add={type => void addNode(type)}/>
              : <ScriptSettings key={scriptId} script={script} issues={issues} editable={editable} profiles={status ? status.profiles : undefined} access={access}
                remove={() => void removeScript()} duplicate={() => void duplicate()}
                save={next => update(scriptId, current => ({ ...current, name: next.name, description: next.description, start_url: next.start_url,
                  profile: next.profile, on_error: next.on_error, params: next.params }))}/>}
          </>}
      </aside>
      <Canvas script={script} selected={nodeId} issues={issueNodes} marks={marks} breakpoints={points} editable={editable} actions={actions}
        select={id => { setNodeId(id); setBrowsing(false); }} add={(type, point) => void addNode(type, point)}
        move={(id, point) => void update(scriptId, current => ({ ...current, graph: { ...current.graph,
          nodes: current.graph.nodes.map(item => item.id === id ? { ...item, pos: [Math.round(point.x), Math.round(point.y)] as [number, number] } : item) } }))}
        connect={(from, to, port) => void update(scriptId, current => connect(current, from, to, port))}
        disconnect={(from, to) => void update(scriptId, current => ({ ...current, graph: { ...current.graph, edges: current.graph.edges.filter(edge => !(edge[0] === from && edge[1] === to)) } }))}
        empty={<Empty icon={<Icon.blocks size={22}/>} title={uiText("还没有步骤")}
          text={editable ? uiText("从左边把积木拖到这里，或点「录制」在浏览器里操作一遍。") : uiText("这个脚本还没有步骤。")}/>}/>
      {issues.length > 0 && (!node || browsing) && side === "blocks" && <button type="button" className="wa-issue-pill" onClick={() => setSide("settings")}>
        <Icon.warning size={14}/>{uiText("{0} 处需要修改", issues.length)}</button>}
    </div> : <div className="wa-body is-center"><Empty icon={<Icon.logo size={24}/>} title={uiText("录下网页操作，交给人或 agent 重复运行")}
      text={uiText("新建一个脚本，录制一遍或手动加步骤。")}
      action={kit.canEdit ? <button type="button" className="wa-btn is-primary" onClick={() => void create()}><Icon.plus size={14}/>{uiText("新建脚本")}</button> : undefined}/></div>)}

    {view === "runs" && <div className="wa-body">
      <aside className="wa-left wa-list-panel">
        <h2 className="wa-list-title">{uiText("运行记录")}</h2>
        <ul className="wa-cards" aria-label={uiText("运行记录")}>
          {runRows.map(row => <li key={row.id}><button type="button" aria-current={row.id === selectedRun?.id} onClick={() => setRunId(row.id)}>
            <span className="wa-card-top"><strong>{row.data.script_name || uiText("未命名脚本")}</strong><State state={row.data.state}/></span>
            <small>{when(row.data.started_at)} · {row.data.by_kind === "agent" ? uiText("agent {0}", row.data.by) : row.data.by}{row.data.machine ? ` · ${row.data.machine}` : ""}</small>
          </button></li>)}
        </ul>
        {!runRows.length && <p className="wa-muted wa-pad">{uiText("还没有运行记录。")}</p>}
      </aside>
      {selectedRun ? <RunDetail run={selectedRun} script={scripts.get(selectedRun.data.script_id) ? normalize(scripts.get(selectedRun.data.script_id)!.data) : undefined}
        live={live?.record === selectedRun.id} control={control}/>
        : <div className="wa-body is-center"><Empty icon={<Icon.history size={22}/>} title={uiText("还没有运行记录。")} text={uiText("人或 agent 运行脚本后，每一步都记在这里。")}/></div>}
    </div>}

    {view === "drafts" && <div className="wa-body">
      <aside className="wa-left wa-list-panel">
        <h2 className="wa-list-title">{uiText("草稿")}</h2>
        <ul className="wa-cards" aria-label={uiText("草稿")}>
          {drafts.rows.map(row => <li key={row.id}><button type="button" aria-current={row.id === selectedDraft?.id} onClick={() => setDraftId(row.id)}>
            <span className="wa-card-top"><strong>{row.data.name || uiText("未命名草稿")}</strong></span>
            <small>{uiText("{0} 记下的", row.data.by || "agent")} · {when(row.data.created_at)}</small>
          </button></li>)}
        </ul>
        {!drafts.rows.length && <p className="wa-muted wa-pad">{uiText("agent 在浏览器里直接操作时，会把步骤记成草稿放在这里。")}</p>}
      </aside>
      {selectedDraft ? <div className="wa-draft">
        <div className="wa-draft-bar">
          <span><strong>{selectedDraft.data.name || uiText("未命名草稿")}</strong>
            <small>{uiText("{0} 在 {1} 直接操作浏览器时记下的 {2} 个步骤。存成脚本后可以修改和重复运行。", selectedDraft.data.by || "agent",
              when(selectedDraft.data.created_at), normalize(selectedDraft.data).graph.nodes.length)}</small></span>
          {kit.canEdit && <span className="wa-row">
            <button type="button" className="wa-btn" onClick={() => void kit.track(drafts.remove(selectedDraft.id))}>{uiText("删除草稿")}</button>
            <button type="button" className="wa-btn is-primary" onClick={() => void adopt(selectedDraft)}><Icon.copy size={14}/>{uiText("存成脚本")}</button>
          </span>}
        </div>
        <Canvas script={normalize(selectedDraft.data)} selected="" issues={new Set()} marks={{}} breakpoints={[]} editable={false} select={() => undefined}/>
      </div> : <div className="wa-body is-center"><Empty icon={<Icon.draft size={22}/>} title={uiText("没有草稿。")} text={uiText("agent 在浏览器里直接操作时，会把步骤记成草稿放在这里。")}/></div>}
    </div>}

    {dialog === "run" && script && record && <RunDialog script={script} id={scriptId} version={record.version} profiles={profiles} startAt={startAt} breakpoints={points}
      close={() => setDialog("")} start={input => void startRun(input)}/>}
    {dialog === "record" && script && <RecordDialog script={script} profiles={profiles} close={() => setDialog("")} start={(profile, url) => void startRecording(profile, url)}/>}
    {dialog === "profiles" && ready && status && <ProfilesDialog status={status} refresh={refresh} close={() => setDialog("")}/>}
    {kit.note && <div className="wa-toast" role="status">{kit.note.text}{kit.note.undo && <button type="button" onClick={kit.note.undo}>{uiText("撤销")}</button>}</div>}
  </div>;
}

void mount(kit, App);
