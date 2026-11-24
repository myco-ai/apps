import { ArrowLeft, Copy, Eye, EyeOff, KeyRound, LockKeyhole, Plus, Search, ShieldCheck, Trash2, WandSparkles } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { t as uiText } from "../_lib/i18n";
import { connect, read, save } from "./storage";
import { derive, generatePassword, newSalt, openVault, parseBackup, seal, type Envelope, type Login } from "./vault";
import "../_lib/sheet.css";
import "./vault.css";

type Session = { key: CryptoKey; records: Login[]; envelope: Envelope };
const idleLimit = 5 * 60 * 1000;
const blank = (): Login => ({ id: crypto.randomUUID(), title: "", site: "", login: "", password: "", notes: "" });

function Brand() {
  return <div className="pv-brand"><div className="pv-logo"><ShieldCheck size={23}/></div><strong>{uiText("密码库")}</strong></div>;
}

function Gate() {
  return <main className="pv-auth"><div className="pv-auth-card"><Brand/>
    <h1>{uiText("在独立浏览器窗口中使用")}</h1>
    <p>{uiText("启动本机密码库后，在浏览器中打开下方地址。")}</p>
    <a className="btn btn-primary" href="http://127.0.0.1:47631/" target="_blank" rel="noopener noreferrer">{uiText("打开本机密码库")}</a>
  </div></main>;
}

function Auth({ existing, enter }: { existing: boolean; enter: (password: string, backup?: Envelope) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [backup, setBackup] = useState<Envelope>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const creating = !existing && !backup;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating && password !== repeat) { setNotice(uiText("两次输入的主密码不一致。")); return; }
    setNotice(""); setBusy(true);
    try { await enter(password, backup); }
    catch (error) {
      const conflict = error instanceof Error && error.message === "vault_conflict";
      setNotice(conflict ? uiText("密码库已在其他窗口更改，请重新打开。") : error instanceof DOMException && error.name === "OperationError"
        ? uiText("主密码不正确，或备份已损坏。") : uiText("无法读取或保存密码库。"));
    } finally { setPassword(""); setRepeat(""); setBusy(false); }
  }
  return <main className="pv-auth"><div className="pv-auth-card"><Brand/>
    <h1>{creating ? uiText("创建密码库") : backup ? uiText("恢复加密备份") : uiText("解锁密码库")}</h1>
    {creating && <p>{uiText("请使用至少 16 个字符的主密码。主密码遗失后，无法找回已保存的内容。")}</p>}
    <form onSubmit={event => void submit(event)}>
      <label>{uiText("主密码")}<input className="inp" autoFocus required type="password" autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 16 : 1} maxLength={256}
        disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/></label>
      {creating && <label>{uiText("确认主密码")}<input className="inp" required type="password" autoComplete="new-password" minLength={16} maxLength={256} disabled={busy}
        value={repeat} onChange={event => setRepeat(event.target.value)}/></label>}
      {notice && <p role="alert">{notice}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}><LockKeyhole size={16}/>{busy ? uiText("处理中…") : creating ? uiText("创建密码库") : backup ? uiText("恢复备份") : uiText("解锁")}</button>
    </form>
    {!existing && (backup ? <button type="button" className="btn" disabled={busy} onClick={() => { setBackup(undefined); setPassword(""); setNotice(""); }}>{uiText("取消")}</button> :
      <label className="pv-import">{uiText("导入加密备份")}<input type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        setBusy(true);
        try {
          if (file.size > 8 * 1024 * 1024) throw new Error("backup_size");
          setBackup(parseBackup(await file.text())); setPassword(""); setRepeat(""); setNotice("");
        } catch { setNotice(uiText("无法读取此加密备份。")); }
        finally { setBusy(false); }
      }}/></label>)}
  </div></main>;
}

function backupFile(envelope: Envelope) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "myco-vault-" + new Date().toISOString().slice(0, 10) + ".json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Vault({ session, update, lock }: { session: Session; update: (records: Login[]) => Promise<void>; lock: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Login>();
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const item = session.records.find(record => record.id === selected);
  const visible = session.records.filter(record => [record.title, record.login, record.site].some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    .slice().sort((a, b) => a.title.localeCompare(b.title));

  useEffect(() => {
    let last = Date.now();
    const activity = () => { if (Date.now() - last >= idleLimit) lock(); else last = Date.now(); };
    const check = () => { if (Date.now() - last >= idleLimit) lock(); };
    const interval = window.setInterval(check, 1000);
    window.addEventListener("keydown", activity);
    window.addEventListener("pointerdown", activity);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("pointerdown", activity);
      document.removeEventListener("visibilitychange", check);
    };
  }, [lock]);

  function select(id: string) { setSelected(id); setRevealed(false); setNotice(""); }
  function edit(value: Login) { setDraft(value); setRevealed(false); setNotice(""); }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice(uiText("已复制")); }
    catch { setNotice(uiText("剪贴板不可用，请手动选择并复制。")); }
  }

  async function persist(records: Login[], id: string) {
    setPending(true); setNotice("");
    try { await update(records); setDraft(undefined); select(id); }
    catch (error) {
      setNotice(error instanceof Error && error.message === "vault_conflict"
        ? uiText("密码库已在其他窗口更改，请重新打开。") : uiText("无法读取或保存密码库。"));
    } finally { setPending(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft?.title.trim() || !draft.password) return;
    const record = { ...draft, title: draft.title.trim(), site: draft.site.trim() };
    const updated = session.records.some(value => value.id === record.id)
      ? session.records.map(value => value.id === record.id ? record : value) : [...session.records, record];
    void persist(updated, record.id);
  }

  return <main className="pv-shell" data-detail={!!(item || draft)}>
    <header className="pv-header"><Brand/><div className="pv-actions">
      <button className="btn" type="button" onClick={() => backupFile(session.envelope)}>{uiText("导出加密备份")}</button>
      <button className="btn" type="button" onClick={lock}><LockKeyhole size={15}/>{uiText("锁定")}</button>
    </div></header>
    <aside className="pv-sidebar">
      <div className="pv-search"><Search size={16}/><input className="inp" aria-label={uiText("搜索登录信息")} placeholder={uiText("搜索登录信息")} value={query} onChange={event => setQuery(event.target.value)}/></div>
      <div className="pv-list-head"><h2>{uiText("登录信息")}</h2><button className="btn btn-primary" type="button" disabled={!!draft || pending || session.records.length >= 1000} onClick={() => edit(blank())}><Plus size={16}/>{uiText("新增")}</button></div>
      <div className="pv-list">
        {visible.map(record => <button className="pv-row" type="button" key={record.id} aria-pressed={selected === record.id && !draft} disabled={!!draft || pending} onClick={() => select(record.id)}>
          <span className="pv-row-icon"><KeyRound size={18}/></span>
          <span><strong>{record.title}</strong><small>{record.login || record.site}</small></span>
        </button>)}
        {!visible.length && <p>{query ? uiText("没有匹配的登录信息。") : uiText("暂无登录信息")}</p>}
      </div>
    </aside>
    <section className="pv-detail">
      <button className="btn pv-back" type="button" disabled={pending} onClick={() => { setDraft(undefined); select(""); }}><ArrowLeft size={16}/>{uiText("返回")}</button>
      {notice && <p className="pv-notice" role="status">{notice}</p>}
      {draft ? <form className="pv-edit" onSubmit={submit}>
        <h1>{item?.id === draft.id ? uiText("编辑登录信息") : uiText("新增登录信息")}</h1>
        <fieldset disabled={pending}>
          <label>{uiText("标题")}<input className="inp" required maxLength={160} autoFocus value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label>
          <label>{uiText("网站")}<input className="inp" maxLength={512} value={draft.site} onChange={event => setDraft({ ...draft, site: event.target.value })}/></label>
          <label>{uiText("用户名")}<input className="inp" maxLength={256} autoComplete="off" value={draft.login} onChange={event => setDraft({ ...draft, login: event.target.value })}/></label>
          <label>{uiText("密码")}<input className="inp" required type={revealed ? "text" : "password"} autoComplete="new-password" maxLength={512} value={draft.password} onChange={event => setDraft({ ...draft, password: event.target.value })}/></label>
          <div className="pv-actions"><button type="button" className="btn" onClick={() => { setDraft({ ...draft, password: generatePassword() }); setRevealed(true); }}><WandSparkles size={15}/>{uiText("生成密码")}</button>
            <button type="button" className="btn" onClick={() => setRevealed(!revealed)}>{revealed ? uiText("隐藏密码") : uiText("显示密码")}</button></div>
          <label>{uiText("备注")}<textarea className="inp" rows={3} maxLength={4000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })}/></label>
          <div className="pv-actions">
            <button className="btn btn-primary" type="submit">{uiText("保存")}</button>
            <button className="btn" type="button" onClick={() => { setDraft(undefined); setRevealed(false); setNotice(""); }}>{uiText("取消")}</button>
          </div>
        </fieldset>
      </form> : item ? <div className="pv-record">
        <div className="pv-record-head"><div><KeyRound size={25}/><h1>{item.title}</h1></div><button className="btn" type="button" disabled={pending} onClick={() => edit(item)}>{uiText("编辑")}</button></div>
        <dl>
          {item.site && <div><dt>{uiText("网站")}</dt><dd>{item.site}</dd></div>}
          {item.login && <div><dt>{uiText("用户名")}</dt><dd>{item.login}<button className="btn" aria-label={uiText("复制用户名")} type="button" onClick={() => void copy(item.login)}><Copy size={15}/></button></dd></div>}
          <div><dt>{uiText("密码")}</dt><dd><span className="pv-secret">{revealed ? item.password : "••••••••••••"}</span>
            <button className="btn" aria-label={revealed ? uiText("隐藏密码") : uiText("显示密码")} type="button" onClick={() => setRevealed(!revealed)}>{revealed ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
            <button className="btn" aria-label={uiText("复制密码")} type="button" onClick={() => void copy(item.password)}><Copy size={15}/></button></dd></div>
          {item.notes && <div><dt>{uiText("备注")}</dt><dd className="pv-notes">{item.notes}</dd></div>}
        </dl>
        <button className="btn pv-delete" type="button" disabled={pending} onClick={() => {
          if (window.confirm(uiText("删除这条登录信息？"))) void persist(session.records.filter(value => value.id !== item.id), "");
        }}><Trash2 size={15}/>{uiText("删除")}</button>
      </div> : <div className="pv-empty"><KeyRound size={32}/><p>{uiText("选择一条登录信息，或新增一条。")}</p></div>}
    </section>
  </main>;
}

const standalone = window.parent === window && window.location.origin === "http://127.0.0.1:47631" && window.isSecureContext && !!crypto.subtle;
function App() {
  const [store, setStore] = useState<{ db: IDBDatabase; envelope?: Envelope }>();
  const [failure, setFailure] = useState(false);
  const [session, setSession] = useState<Session>();
  const generation = useRef(0);
  const lock = useRef(() => { generation.current++; setSession(undefined); }).current;
  useEffect(() => {
    if (!standalone) return;
    window.addEventListener("pagehide", lock);
    let db: IDBDatabase | undefined;
    let active = true;
    void connect().then(async database => {
      db = database;
      const envelope = await read(db);
      if (active) setStore({ db, envelope }); else db.close();
    }).catch(() => { if (active) setFailure(true); });
    return () => { active = false; db?.close(); window.removeEventListener("pagehide", lock); };
  }, [lock]);
  if (!standalone) return <Gate/>;
  if (!store) return <main className="pv-auth"><p role="status">{failure ? uiText("无法读取或保存密码库。") : uiText("处理中…")}</p></main>;
  const { db } = store;

  async function enter(password: string, backup?: Envelope) {
    const current = generation.current;
    const old = await read(db);
    if (backup && old) throw new Error("vault_conflict");
    if (!backup && !old && password.length < 16) throw new Error("password_length");
    const input = old || backup;
    const salt = input?.salt || newSalt();
    const key = await derive(password, salt);
    const records = input ? await openVault(key, input) : [];
    const envelope = old || await seal(key, salt, records);
    if (generation.current !== current) return;
    if (!old) await save(db, undefined, envelope);
    setStore({ db, envelope });
    if (generation.current === current) setSession({ key, records, envelope });
  }

  async function update(records: Login[]) {
    if (!session) return;
    const current = generation.current;
    const envelope = await seal(session.key, session.envelope.salt, records);
    if (generation.current !== current) return;
    await save(db, session.envelope, envelope);
    setStore({ db, envelope });
    if (generation.current === current) setSession({ ...session, records, envelope });
  }

  return session ? <Vault session={session} update={update} lock={lock}/> : <Auth existing={!!store.envelope} enter={enter}/>;
}

if (standalone) {
  const hint = new URLSearchParams(window.location.search).get("myco_lang");
  document.documentElement.lang = (hint === "zh" || hint === "en" ? hint === "zh" : /^zh\b/i.test(navigator.language)) ? "zh-CN" : "en";
}
createRoot(document.getElementById("root")!).render(<App/>);
