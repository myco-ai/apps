import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CirclePause, CirclePlay, Copy, FilePlus2, LayoutGrid, MonitorSmartphone, Play, Square, StepForward, Users } from "lucide-react";
import type { XYPosition } from "@xyflow/react";
import { Kit, mount, Toast, uid, useKit } from "../_lib/appkit";
import { locale, t as uiText } from "../_lib/i18n";
import { Store, type MycoRecord } from "../_lib/myco";
import { browser, errorCode, type BrowserProfile, type BrowserStatus, type RunUpdate } from "./bridge";
import { Canvas } from "./canvas";
import { NodeInspector, ScriptSettings, type Tools } from "./inspector";
import { bridgeError, stateDot, stateName, typeName } from "./labels";
import { append, bytes, connect, cutOutput, finished, fitRun, layout, newNode, newScript, normalize, recordLimit,
  removeNode, runArguments, validate, type Draft, type NodeType, type Run, type RunStep, type Script } from "./model";
import "../_lib/sheet.css";
import "./automation.css";

const scripts = new Store<Script>("scripts");
const runs = new Store<Run>("runs");
const drafts = new Store<Draft>("drafts");
const kit = new Kit([scripts, runs, drafts], { quiet: true });
type View = "scripts" | "runs" | "drafts";

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

function Banner({ status }: { status?: BrowserStatus | null }) {
  if (status) return null;
  return <div className="wa-banner" role="note">
    <strong>{status === null ? uiText("这台电脑还不能录制和运行") : uiText("正在连接浏览器组件…")}</strong>
    {status === null && <span>{uiText("录制、调试和回放需要支持浏览器组件的新版 myco App。现在仍可编辑脚本、查看运行记录；agent 也能通过页面数据读写脚本。")}</span>}
  </div>;
}

function RunDialog({ script, id, version, profiles, startAt, breakpoints, close, start }: {
  script: Script; id: string; version: number; profiles: BrowserProfile[]; startAt?: string; breakpoints: string[];
  close: () => void; start: (input: { values: Record<string, string>; secrets: Record<string, string>; profile: string; headless: boolean; startAt?: string }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState(profiles.find(item => item.name === script.profile)?.id || profiles[0]?.id || "");
  const [headless, setHeadless] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const issues = validate(script, scripts.rows.map(row => row.id), id);
  const from = startAt ? script.graph.nodes.find(node => node.id === startAt) : undefined;
  return <dialog ref={dialog} className="wa-dialog" aria-labelledby="wa-run-title" onClose={close}>
    <h2 id="wa-run-title">{uiText("运行「{0}」", script.name || uiText("未命名脚本"))}</h2>
    <p className="wa-hint">{uiText("版本 {0}", version)}{from ? " · " + uiText("从「{0}」开始", from.title || typeName(from.type)) : ""}{breakpoints.length ? " · " + uiText("{0} 个断点", breakpoints.length) : ""}</p>
    {issues.length > 0 && <p className="wa-error">{uiText("脚本还有 {0} 处需要修改，先改好再运行。", issues.length)}</p>}
    <label className="wa-field"><span>{uiText("用哪个 profile")}</span>
      <select className="sel" value={profile} onChange={event => setProfile(event.target.value)}>
        {profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    {!profiles.length && <p className="wa-hint">{uiText("还没有 profile，请先在「Profile」里新建一个。")}</p>}
    {script.params.map(param => <label className="wa-field" key={param.name}>
      <span>{param.name}{param.required ? " *" : ""}{param.type === "secret" ? " · " + uiText("不保存") : ""}</span>
      {param.type === "text" ? <textarea className="inp" rows={3} value={input[param.name] ?? param.default ?? ""} onChange={event => setInput({ ...input, [param.name]: event.target.value })}/>
        : param.type === "bool" ? <select className="sel" value={input[param.name] ?? param.default ?? "false"} onChange={event => setInput({ ...input, [param.name]: event.target.value })}>
          <option value="true">{uiText("是")}</option><option value="false">{uiText("否")}</option></select>
        : <input className="inp" type={param.type === "secret" ? "password" : param.type === "number" ? "number" : "text"} autoComplete="off"
          value={input[param.name] ?? (param.type === "secret" ? "" : param.default ?? "")} onChange={event => setInput({ ...input, [param.name]: event.target.value })}/>}
      {missing.includes(param.name) && <small className="wa-error">{uiText("请填写有效的值。")}</small>}
    </label>)}
    <label className="wa-check"><input type="checkbox" checked={headless} onChange={event => setHeadless(event.target.checked)}/>{uiText("不显示浏览器窗口（无头）")}</label>
    <div className="wa-actions wa-end">
      <button type="button" className="btn" onClick={() => dialog.current?.close()}>{uiText("取消")}</button>
      <button type="button" className="btn btn-primary" disabled={issues.length > 0 || !profile} onClick={() => {
        const result = runArguments(script.params, input);
        setMissing(result.missing);
        if (result.missing.length) return;
        start({ values: result.values, secrets: result.secrets, profile, headless, startAt });
        dialog.current?.close();
      }}><Play size={14}/>{uiText("开始运行")}</button>
    </div>
  </dialog>;
}

function RecordDialog({ script, profiles, close, start }: {
  script: Script; profiles: BrowserProfile[]; close: () => void; start: (profile: string, url: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [profile, setProfile] = useState(profiles.find(item => item.name === script.profile)?.id || profiles[0]?.id || "");
  const [url, setURL] = useState(script.start_url);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const valid = /^https?:\/\//i.test(url.trim());
  return <dialog ref={dialog} className="wa-dialog" aria-labelledby="wa-record-title" onClose={close}>
    <h2 id="wa-record-title">{uiText("录制")}</h2>
    <p className="wa-hint">{uiText("会打开 myco 专用的浏览器窗口，不碰你日常用的 Chrome。你在里面的操作会一步步出现在画布上；密码框里的内容不会记下来。")}</p>
    <label className="wa-field"><span>{uiText("用哪个 profile")}</span>
      <select className="sel" value={profile} onChange={event => setProfile(event.target.value)}>
        {profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    <label className="wa-field"><span>{uiText("打开网址")}</span><input className="inp" value={url} placeholder="https://" onChange={event => setURL(event.target.value)}/></label>
    <div className="wa-actions wa-end">
      <button type="button" className="btn" onClick={() => dialog.current?.close()}>{uiText("取消")}</button>
      <button type="button" className="btn btn-primary" disabled={!profile || !valid} onClick={() => { start(profile, url.trim()); dialog.current?.close(); }}>
        <Circle size={13}/>{uiText("开始录制")}</button>
    </div>
  </dialog>;
}

function ProfilesDialog({ status, refresh, close }: { status: BrowserStatus; refresh: () => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const bridge = browser()!;
  useEffect(() => { dialog.current?.showModal(); }, []);
  const act = (task: Promise<unknown>) => void task.then(refresh, error => kit.flash(bridgeError(errorCode(error))));
  return <dialog ref={dialog} className="wa-dialog" aria-labelledby="wa-profiles-title" onClose={close}>
    <h2 id="wa-profiles-title">{uiText("Profile")}</h2>
    <p className="wa-hint">{uiText("每个 profile 是一组单独的浏览器登录状态，只存在 {0} 上。打开「允许 agent 使用」后，agent 才能申请用它跑脚本。", status.machine)}</p>
    <ul className="wa-profile-list">
      {status.profiles.map(profile => <li key={profile.id}>
        <span><Dot state={profile.running ? "running" : "succeeded"}/>{profile.name}</span>
        <label className="wa-check"><input type="checkbox" checked={profile.agents} onChange={event => act(bridge.profiles.allowAgents(profile.id, event.target.checked))}/>{uiText("允许 agent 使用")}</label>
        <button type="button" className="btn" onClick={() => act(bridge.profiles.open(profile.id))}>{uiText("打开浏览器登录")}</button>
      </li>)}
    </ul>
    <form className="wa-actions" onSubmit={event => { event.preventDefault(); if (name.trim()) { act(bridge.profiles.create(name.trim())); setName(""); } }}>
      <input className="inp" aria-label={uiText("新 profile 的名字")} placeholder={uiText("例如：发帖号")} value={name} maxLength={40} onChange={event => setName(event.target.value)}/>
      <button className="btn" disabled={!name.trim()}>{uiText("新建")}</button>
    </form>
    <div className="wa-actions wa-end"><button type="button" className="btn btn-primary" onClick={() => dialog.current?.close()}>{uiText("完成")}</button></div>
  </dialog>;
}

function RunDetail({ run, script, live, control }: {
  run: MycoRecord<Run>; script?: Script; live: boolean; control: (action: "pause" | "resume" | "step" | "cancel", choice?: string) => void;
}) {
  const names = new Map((script?.graph.nodes || []).map(node => [node.id, node.title || typeName(node.type)]));
  const data = run.data;
  const output = Object.entries(data.output || {});
  return <section className="wa-run" aria-label={uiText("运行详情")}>
    <header className="wa-run-head">
      <div><h2><Dot state={data.state}/>{data.script_name || uiText("未命名脚本")}</h2>
        <p className="wa-hint">{[stateName(data.state), when(data.started_at), duration(data), data.by_kind === "agent" ? uiText("agent {0} 触发", data.by) : uiText("{0} 触发", data.by),
          data.machine, data.profile, uiText("版本 {0}", data.script_version)].filter(Boolean).join(" · ")}</p></div>
      {live && <div className="wa-actions">
        {data.state === "running" && <button type="button" className="btn" onClick={() => control("pause")}><CirclePause size={14}/>{uiText("暂停")}</button>}
        {data.state === "paused" && !data.question && <><button type="button" className="btn" onClick={() => control("resume")}><CirclePlay size={14}/>{uiText("继续")}</button>
          <button type="button" className="btn" onClick={() => control("step")}><StepForward size={14}/>{uiText("单步")}</button></>}
        {!finished(data.state) && <button type="button" className="btn" onClick={() => control("cancel")}><Square size={13}/>{uiText("停止")}</button>}
      </div>}
    </header>
    {data.state === "paused" && data.question && <div className="wa-question" role="alert">
      <p>{data.question}</p>
      {live ? <div className="wa-actions">
        <button type="button" className="btn btn-primary" onClick={() => control("resume", "ok")}>{uiText("同意，继续")}</button>
        <button type="button" className="btn" onClick={() => control("resume", "cancel")}>{uiText("拒绝")}</button>
      </div> : <p className="wa-hint">{uiText("等触发运行的人或 agent 回答。")}</p>}
    </div>}
    {data.error && <p className="wa-error">{names.get(data.error_node) ? `${names.get(data.error_node)} · ` : ""}{data.error}</p>}
    <ol className="wa-steps">
      {data.steps.map((step, index) => <li key={index} data-state={step.state}>
        <span className={`wa-dot ${step.state === "failed" ? "failed" : step.state === "running" ? "working" : "idle"}`} aria-hidden="true"/>
        <span>{names.get(step.node) || step.node}</span>
        <small>{step.state === "skipped" ? uiText("跳过") : step.state === "failed" ? step.error || uiText("失败") : step.ms !== undefined ? (step.ms >= 1000 ? `${(step.ms / 1000).toFixed(1)} s` : `${step.ms} ms`) : ""}</small>
      </li>)}
    </ol>
    {output.length > 0 && <section className="wa-output"><h3>{uiText("提取的数据")}</h3>
      <dl>{output.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl></section>}
    {!data.steps.length && !data.error && <p className="wa-hint">{uiText("还没有步骤记录。")}</p>}
  </section>;
}

function App() {
  useKit(kit);
  const [view, setView] = useState<View>("scripts");
  const [scriptId, setScriptId] = useState(() => scripts.rows[0]?.id || "");
  const [nodeId, setNodeId] = useState("");
  const [runId, setRunId] = useState("");
  const [draftId, setDraftId] = useState("");
  const [status, setStatus] = useState<BrowserStatus | null | undefined>(browser() ? undefined : null);
  const [breakpoints, setBreakpoints] = useState<Record<string, string[]>>({});
  const [dialog, setDialog] = useState<"run" | "record" | "profiles" | "">("");
  const [startAt, setStartAt] = useState<string>();
  const [recording, setRecording] = useState<{ id: string; script: string }>();
  const [live, setLive] = useState<{ bridge: string; record: string }>();
  const stopped = useRef(false);
  const bridge = browser();

  const refresh = useCallback(() => {
    if (!bridge) return;
    void bridge.status().then(setStatus, () => setStatus(null));
  }, [bridge]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { stopped.current = true; }, []);

  const record = scripts.get(scriptId);
  const script = useMemo(() => record ? normalize(record.data) : undefined, [record?.data]);
  const ids = scripts.rows.map(row => row.id);
  const issues = useMemo(() => script ? validate(script, ids, scriptId) : [], [script, ids.join(), scriptId]);
  const issueNodes = useMemo(() => new Set(issues.flatMap(issue => issue.node ? [issue.node] : [])), [issues]);
  const node = script?.graph.nodes.find(item => item.id === nodeId);
  const scriptRuns = newest(runs.rows);
  const lastRun = (id: string) => scriptRuns.find(run => run.data.script_id === id);
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

  useEffect(() => {
    if (scriptId && !scripts.get(scriptId)) setScriptId(scripts.rows[0]?.id || "");
  });

  async function create() {
    const id = uid("scr_");
    const name = uiText("新脚本 {0}", scripts.rows.length + 1);
    const saved = await kit.track(scripts.put(newScript(name), id));
    if (saved) { setView("scripts"); setScriptId(id); setNodeId(""); }
  }

  async function addNode(type: NodeType, point: XYPosition, from?: string, port?: string) {
    if (!script) return;
    const id = uid("n_");
    const done = await update(scriptId, current => {
      const added = { ...current, graph: { ...current.graph, nodes: [...current.graph.nodes, newNode(type, id, [Math.round(point.x), Math.round(point.y)])] } };
      return from ? connect(added, from, id, port) : added;
    });
    if (done) setNodeId(id);
  }

  const tools: Tools = bridge && status ? {
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
        if (events.steps.length) await update(target, current => append(current, events.steps.map(step => ({ ...step, id: step.id || uid("n_") }))));
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
        const update: RunUpdate = await bridge.runs.get(started.id, after);
        after = update.next;
        const merged = [...run.steps];
        for (const step of update.steps) {
          const index = merged.findIndex(item => item.node === step.node && item.state === "running");
          if (index >= 0) merged[index] = step; else merged.push(step);
        }
        const next: Run = { ...run, state: update.state, node: update.node, error: update.error || "", error_node: update.error_node || "",
          question: update.question, steps: merged, output: cutOutput(update.output || {}, secretValues),
          ended_at: finished(update.state) ? new Date().toISOString() : "" };
        const important = next.state !== run.state || finished(next.state) || Date.now() - last > 1500;
        run = next;
        if (important) { last = Date.now(); await write(next); }
        if (finished(update.state)) break;
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
    kit.flash(uiText("已删除「{0}」", copy.name || uiText("未命名脚本")), () => { void kit.track(scripts.put(copy, id)).then(() => setScriptId(id)); });
  }

  async function duplicate() {
    if (!script) return;
    const id = uid("scr_");
    if (await kit.track(scripts.put({ ...script, name: uiText("{0} 副本", script.name) }, id))) setScriptId(id);
  }

  async function adopt(draft: MycoRecord<Draft>) {
    const id = uid("scr_");
    const { by: _by, created_at: _created, ...rest } = draft.data;
    const next = layout({ ...normalize(rest), source: "agent" });
    if (!await kit.track(scripts.put(next, id))) return;
    await kit.track(drafts.remove(draft.id));
    setView("scripts"); setScriptId(id); setDraftId("");
  }

  const canRun = Boolean(bridge && status && !live && !recording);
  const selectedRun = runs.get(runId) || scriptRuns[0];
  const selectedDraft = drafts.get(draftId) || drafts.rows[0];

  return <div className="wa-app">
    <header className="wa-header">
      <div><h1>{uiText("网页自动化")}</h1>
        <small role="status">{recording ? uiText("正在录制…在浏览器里操作，步骤会出现在画布上。") : kit.pending ? uiText("正在保存…") : kit.failed ? uiText("没保存上") : !kit.canEdit ? uiText("只能看") : uiText("已保存")}</small></div>
      <div className="wa-actions">
        {kit.canEdit && <button type="button" className="btn" onClick={() => void create()}><FilePlus2 size={15}/>{uiText("新建脚本")}</button>}
        {view === "scripts" && script && <>
          {recording ? <button type="button" className="btn wa-recording" onClick={() => void bridge?.record.stop(recording.id).catch(() => undefined)}><Square size={13}/>{uiText("停止录制")}</button>
            : <button type="button" className="btn" disabled={!canRun || !kit.canEdit} onClick={() => setDialog("record")}
              title={!bridge ? uiText("需要支持浏览器组件的新版 myco App") : undefined}><Circle size={13}/>{uiText("录制")}</button>}
          <button type="button" className="btn" disabled={!editable || !script.graph.nodes.length} onClick={() => void update(scriptId, layout)}><LayoutGrid size={15}/>{uiText("自动排版")}</button>
          <button type="button" className="btn btn-primary" disabled={!canRun} onClick={() => { setStartAt(undefined); setDialog("run"); }}
            title={!bridge ? uiText("需要支持浏览器组件的新版 myco App") : undefined}><Play size={14}/>{uiText("运行")}</button>
        </>}
        {bridge && status && <button type="button" className="btn" onClick={() => setDialog("profiles")}><Users size={15}/>{uiText("Profile")}</button>}
      </div>
    </header>
    <Banner status={status}/>
    <div className="wa-body">
      <nav className="wa-side" aria-label={uiText("脚本和运行记录")}>
        <div className="wa-tabs" role="tablist">
          {(["scripts", "runs", "drafts"] as View[]).map(item => <button type="button" role="tab" key={item} aria-selected={view === item} onClick={() => setView(item)}>
            {item === "scripts" ? uiText("脚本") : item === "runs" ? uiText("运行记录") : uiText("草稿")}
            {item === "drafts" && drafts.rows.length > 0 && <span className="wa-count">{drafts.rows.length}</span>}
          </button>)}
        </div>
        {view === "scripts" && <ul className="wa-list">
          {scripts.rows.map(row => { const last = lastRun(row.id); return <li key={row.id}>
            <button type="button" aria-current={row.id === scriptId} onClick={() => { setScriptId(row.id); setNodeId(""); }}>
              <strong>{row.data.name || uiText("未命名脚本")}</strong>
              <small>{last ? <><Dot state={last.data.state}/>{stateName(last.data.state)} · {when(last.data.started_at)}{last.data.machine ? ` · ${last.data.machine}` : ""}</> : uiText("还没运行过")}
                {row.data.profile ? ` · ${row.data.profile}` : ""}</small>
            </button></li>; })}
          {!scripts.rows.length && <li className="wa-hint wa-pad">{uiText("还没有脚本。")}</li>}
        </ul>}
        {view === "runs" && <ul className="wa-list">
          {scriptRuns.map(row => <li key={row.id}><button type="button" aria-current={row.id === selectedRun?.id} onClick={() => setRunId(row.id)}>
            <strong><Dot state={row.data.state}/>{row.data.script_name || uiText("未命名脚本")}</strong>
            <small>{stateName(row.data.state)} · {when(row.data.started_at)} · {row.data.by_kind === "agent" ? uiText("agent {0}", row.data.by) : row.data.by}</small>
          </button></li>)}
          {!scriptRuns.length && <li className="wa-hint wa-pad">{uiText("还没有运行记录。")}</li>}
        </ul>}
        {view === "drafts" && <ul className="wa-list">
          {drafts.rows.map(row => <li key={row.id}><button type="button" aria-current={row.id === selectedDraft?.id} onClick={() => setDraftId(row.id)}>
            <strong>{row.data.name || uiText("未命名草稿")}</strong>
            <small>{uiText("{0} 记下的", row.data.by || "agent")} · {when(row.data.created_at)}</small>
          </button></li>)}
          {!drafts.rows.length && <li className="wa-hint wa-pad">{uiText("agent 在浏览器里直接操作时，会把步骤记成草稿放在这里。")}</li>}
        </ul>}
      </nav>
      {view === "scripts" && (script ? <>
        <Canvas script={script} selected={nodeId} issues={issueNodes} marks={marks} breakpoints={points} editable={editable}
          select={setNodeId} add={(type, point, from, port) => void addNode(type, point, from, port)}
          move={(id, point) => void update(scriptId, current => ({ ...current, graph: { ...current.graph,
            nodes: current.graph.nodes.map(item => item.id === id ? { ...item, pos: [Math.round(point.x), Math.round(point.y)] as [number, number] } : item) } }))}
          connect={(from, to, port) => void update(scriptId, current => connect(current, from, to, port))}
          disconnect={(from, to) => void update(scriptId, current => ({ ...current, graph: { ...current.graph, edges: current.graph.edges.filter(edge => !(edge[0] === from && edge[1] === to)) } }))}/>
        {node ? <NodeInspector key={scriptId + node.id} node={node} script={script} issues={issues.filter(issue => issue.node === node.id)} editable={editable} tools={tools}
          scripts={scripts.rows.filter(row => row.id !== scriptId).map(row => ({ id: row.id, name: row.data.name }))}
          breakpoint={points.includes(node.id)} canRun={canRun}
          toggleBreakpoint={() => setBreakpoints({ ...breakpoints, [scriptId]: points.includes(node.id) ? points.filter(item => item !== node.id) : [...points, node.id] })}
          runFrom={() => { setStartAt(node.id); setDialog("run"); }}
          save={next => update(scriptId, current => ({ ...current, graph: { ...current.graph, nodes: current.graph.nodes.map(item => item.id === next.id ? { ...next, pos: item.pos } : item) } }))}
          remove={() => { const id = node.id; setNodeId(""); void update(scriptId, current => removeNode(current, id)); }}/>
          : <ScriptSettings key={scriptId} script={script} issues={issues} editable={editable} profiles={status?.profiles} remove={() => void removeScript()} duplicate={() => void duplicate()}
            save={next => update(scriptId, current => ({ ...current, name: next.name, description: next.description, start_url: next.start_url,
              profile: next.profile, on_error: next.on_error, params: next.params }))}/>}
      </> : <div className="wa-placeholder"><MonitorSmartphone size={28}/><h2>{uiText("录下网页操作，交给人或 agent 重复运行")}</h2>
        <p>{uiText("新建一个脚本，录制一遍或手动加步骤。")}</p>
        {kit.canEdit && <button type="button" className="btn btn-primary" onClick={() => void create()}><FilePlus2 size={15}/>{uiText("新建脚本")}</button>}</div>)}
      {view === "runs" && (selectedRun ? <RunDetail run={selectedRun} script={scripts.get(selectedRun.data.script_id) ? normalize(scripts.get(selectedRun.data.script_id)!.data) : undefined}
        live={live?.record === selectedRun.id} control={control}/>
        : <div className="wa-placeholder"><p>{uiText("还没有运行记录。")}</p></div>)}
      {view === "drafts" && (selectedDraft ? <>
        <Canvas script={normalize(selectedDraft.data)} selected="" issues={new Set()} marks={{}} breakpoints={[]} editable={false}
          select={() => undefined} add={() => undefined} move={() => undefined} connect={() => undefined} disconnect={() => undefined}/>
        <aside className="wa-inspector" aria-label={uiText("草稿")}>
          <div className="wa-inspector-head"><h2>{selectedDraft.data.name || uiText("未命名草稿")}</h2></div>
          <p className="wa-hint">{uiText("{0} 在 {1} 直接操作浏览器时记下的 {2} 个步骤。存成脚本后可以修改和重复运行。", selectedDraft.data.by || "agent",
            when(selectedDraft.data.created_at), normalize(selectedDraft.data).graph.nodes.length)}</p>
          {kit.canEdit && <div className="wa-actions">
            <button type="button" className="btn btn-primary" onClick={() => void adopt(selectedDraft)}><Copy size={14}/>{uiText("存成脚本")}</button>
            <button type="button" className="btn" onClick={() => void kit.track(drafts.remove(selectedDraft.id))}>{uiText("删除草稿")}</button>
          </div>}
        </aside>
      </> : <div className="wa-placeholder"><p>{uiText("没有草稿。")}</p></div>)}
    </div>
    {dialog === "run" && script && record && <RunDialog script={script} id={scriptId} version={record.version} profiles={profiles} startAt={startAt} breakpoints={points}
      close={() => setDialog("")} start={input => void startRun(input)}/>}
    {dialog === "record" && script && <RecordDialog script={script} profiles={profiles} close={() => setDialog("")} start={(profile, url) => void startRecording(profile, url)}/>}
    {dialog === "profiles" && status && <ProfilesDialog status={status} refresh={refresh} close={() => setDialog("")}/>}
    <Toast kit={kit}/>
  </div>;
}

void mount(kit, App);
