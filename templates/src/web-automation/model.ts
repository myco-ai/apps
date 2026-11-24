// Scripts, runs and drafts as shared records, and the checks the page and
// agents rely on. Pure functions only: no bridge, no UI text.

export const nodeTypes = [
  "navigate", "click", "type", "select", "press", "hover", "drag", "scroll", "upload",
  "wait", "assert", "extract", "js", "screenshot", "tab", "dialog",
  "branch", "loop", "subflow", "confirm", "note",
] as const;
export type NodeType = typeof nodeTypes[number];

export const locatorKinds = ["testid", "role", "label", "placeholder", "text", "css", "xpath"] as const;
export type LocatorKind = typeof locatorKinds[number];
export type Locator = { kind: LocatorKind; value?: string; role?: string; name?: string };
/** Where a step acts: locators in order of preference, the iframe chain and
 *  shadow-root path to reach it, and the local snapshot id (never an image). */
export type Target = { locators: Locator[]; frame?: string[]; shadow?: string[]; snapshot?: string };

export type OnError = "stop" | "skip" | `retry:${number}` | `goto:${string}`;
export type ScriptNode = {
  id: string; type: NodeType; pos: [number, number];
  title?: string; target?: Target; to?: Target;
  url?: string; value?: string; key?: string; code?: string; message?: string; note?: string;
  button?: "left" | "right" | "middle"; count?: number; clear?: boolean; sensitive?: boolean;
  /** element: target appears; network: requests settle; time: ms; url: the
   *  address contains value (a navigation the previous step caused);
   *  download: the previous step's download finishes (into: its local name). */
  wait?: "element" | "network" | "time" | "url" | "download"; ms?: number; dy?: number;
  /** tab: an index from 0, "new" (open an empty tab), "popup" (the tab the
   *  previous step opened; never opened again) or "opener" (back). */
  check?: "visible" | "hidden" | "text" | "url" | "expr"; what?: "text" | "attribute" | "html" | "table" | "js";
  attr?: string; into?: string; list?: string; as?: string; tab?: string; full?: boolean;
  /** dialog: how to answer the native alert/confirm/prompt the previous
   *  step opened; value is a prompt's text (may be a secret parameter). */
  dialog?: "accept" | "dismiss";
  script_id?: string; args?: Record<string, string>;
  on_error?: OnError; timeout_ms?: number;
};
/** [from, to] or [from, to, label]: label is "true"/"false" after a branch,
 *  "ok"/"cancel" after a confirm, "each"/"done" after a loop. */
export type Edge = [string, string] | [string, string, string];
export type ParamType = "string" | "text" | "number" | "bool" | "secret";
export type Param = { name: string; type: ParamType; required?: boolean; default?: string; note?: string };
export type Script = {
  name: string; description?: string; start_url: string; profile: string;
  params: Param[]; graph: { nodes: ScriptNode[]; edges: Edge[] }; on_error: OnError;
  /** Who produced it: "record", "agent" (from a draft) or "manual". */
  source?: string;
};

export const runStates = ["queued", "running", "paused", "succeeded", "failed", "cancelled", "offline"] as const;
export type RunState = typeof runStates[number];
export type RunStep = { node: string; state: "running" | "ok" | "skipped" | "failed"; ms?: number; error?: string; shot?: string };
export type Run = {
  script_id: string; script_version: number; script_name: string;
  state: RunState; node: string;
  by: string; by_kind: "person" | "agent"; machine: string; profile: string;
  started_at: string; ended_at: string;
  error_node: string; error: string;
  /** Extracted values (secrets never), cut to fit. */
  output: Record<string, unknown>;
  steps: RunStep[];
  /** What a paused confirm node asks. */
  question?: string;
};
export type Draft = Script & { by: string; created_at: string };

export const recordLimit = 64 * 1024;
export const nodeWidth = 212, nodeHeight = 60, columnGap = 256, rowGap = 96;

export const targetTypes = new Set<NodeType>(["click", "type", "select", "hover", "drag", "upload", "extract"]);
export const optionalTargetTypes = new Set<NodeType>(["press", "scroll", "wait", "assert", "branch", "screenshot"]);
export const portLabels: Partial<Record<NodeType, [string, string]>> = {
  branch: ["true", "false"], confirm: ["ok", "cancel"], loop: ["each", "done"],
};

export const finished = (state: RunState) => state === "succeeded" || state === "failed" || state === "cancelled" || state === "offline";
export const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const nameRule = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
export const validName = (name: string) => nameRule.test(name);
export const references = (text = "") => [...text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(match => match[1]);
const onlyReference = (text = "") => /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(text.trim());

export function newScript(name: string): Script {
  return { name, start_url: "", profile: "", params: [], graph: { nodes: [], edges: [] }, on_error: "stop", source: "manual" };
}

export function newNode(type: NodeType, id: string, pos: [number, number]): ScriptNode {
  const node: ScriptNode = { id, type, pos };
  if (targetTypes.has(type)) node.target = { locators: [] };
  if (type === "wait") { node.wait = "element"; node.target = { locators: [] }; }
  if (type === "click") { node.button = "left"; node.count = 1; }
  if (type === "assert" || type === "branch") { node.check = "visible"; node.target = { locators: [] }; }
  if (type === "extract") { node.what = "text"; node.into = ""; }
  if (type === "scroll") node.dy = 600;
  if (type === "loop") node.as = "item";
  if (type === "tab") node.tab = "popup";
  if (type === "dialog") node.dialog = "accept";
  return node;
}

/** Coerces a record from the page or an agent into a usable script: unknown
 *  node types and dangling edges are dropped, positions become numbers. */
export function normalize(raw: unknown): Script {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Script>;
  const ids = new Set<string>();
  const nodes = (Array.isArray(value.graph?.nodes) ? value.graph!.nodes : []).filter(node =>
    node && typeof node.id === "string" && node.id && nodeTypes.includes(node.type) && !ids.has(node.id) && ids.add(node.id),
  ).map(node => ({ ...node, pos: [Number(node.pos?.[0]) || 0, Number(node.pos?.[1]) || 0] as [number, number] }));
  const edges = (Array.isArray(value.graph?.edges) ? value.graph!.edges : []).filter(edge =>
    Array.isArray(edge) && ids.has(edge[0]) && ids.has(edge[1]) && edge[0] !== edge[1],
  ).map(edge => (edge[2] ? [edge[0], edge[1], String(edge[2])] : [edge[0], edge[1]]) as Edge);
  const params = (Array.isArray(value.params) ? value.params : []).filter(param => param && typeof param.name === "string")
    .map(param => ({ ...param, type: (["string", "text", "number", "bool", "secret"] as const).includes(param.type) ? param.type : "string" }));
  return {
    name: typeof value.name === "string" ? value.name : "",
    description: typeof value.description === "string" ? value.description : undefined,
    start_url: typeof value.start_url === "string" ? value.start_url : "",
    profile: typeof value.profile === "string" ? value.profile : "",
    params, graph: { nodes, edges }, on_error: typeof value.on_error === "string" ? value.on_error as OnError : "stop",
    source: typeof value.source === "string" ? value.source : undefined,
  };
}

export type Issue = { node?: string; code: string; detail?: string };

/** What keeps a script from running, in node order. The codes are stable:
 *  the page translates them, agents read them in agent.md. */
export function validate(script: Script, scriptIds: string[] = [], selfId = ""): Issue[] {
  const issues: Issue[] = [];
  const { nodes, edges } = script.graph;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const names = new Set<string>();
  for (const param of script.params) {
    if (!validName(param.name)) issues.push({ code: "param_name", detail: param.name });
    else if (names.has(param.name)) issues.push({ code: "param_duplicate", detail: param.name });
    names.add(param.name);
    if (param.type === "secret" && param.default) issues.push({ code: "secret_default", detail: param.name });
  }
  const secrets = new Set(script.params.filter(param => param.type === "secret").map(param => param.name));
  const variables = new Set(names);
  for (const node of nodes) {
    if (node.into && validName(node.into)) variables.add(node.into);
    if (node.type === "loop" && node.as && validName(node.as)) variables.add(node.as);
  }
  const runnable = nodes.filter(node => node.type !== "note");
  if (!runnable.length) issues.push({ code: "empty" });
  const incoming = new Map<string, number>();
  for (const [, to] of edges) incoming.set(to, (incoming.get(to) || 0) + 1);
  for (const [from, to, label] of edges) {
    const source = byId.get(from), target = byId.get(to);
    if (!source || !target) { issues.push({ code: "edge_missing", node: from }); continue; }
    if (source.type === "note" || target.type === "note") issues.push({ code: "edge_note", node: source.type === "note" ? from : to });
    const ports = portLabels[source.type];
    if (ports && !ports.includes(label || "")) issues.push({ code: "edge_label", node: from, detail: label || "" });
    if (!ports && label) issues.push({ code: "edge_label", node: from, detail: label });
  }
  const outgoing = new Map<string, string[]>();
  for (const [from, , label] of edges) outgoing.set(from, [...(outgoing.get(from) || []), label || ""]);
  for (const [from, labels] of outgoing) {
    if (new Set(labels).size !== labels.length) issues.push({ code: "edge_fanout", node: from });
  }
  const starts = runnable.filter(node => !incoming.get(node.id));
  if (runnable.length && starts.length !== 1) issues.push({ code: starts.length ? "many_starts" : "no_start", detail: String(starts.length) });
  if (cyclic(nodes, edges)) issues.push({ code: "cycle" });
  for (const node of runnable) {
    const issue = (code: string, detail?: string) => issues.push({ node: node.id, code, detail });
    if (targetTypes.has(node.type) && !node.target?.locators?.length) issue("target");
    if (node.type === "drag" && !node.to?.locators?.length) issue("drag_to");
    if ((node.type === "wait" && node.wait === "element") && !node.target?.locators?.length) issue("target");
    if ((node.type === "assert" || node.type === "branch") && (node.check === "visible" || node.check === "hidden" || node.check === "text") && !node.target?.locators?.length) issue("target");
    if (node.type === "navigate" && !node.url?.trim()) issue("url");
    if (node.type === "navigate" && node.url && !onlyReference(node.url) && !/^https?:\/\//i.test(node.url.trim())) issue("url_scheme");
    if ((node.type === "type" || node.type === "select") && node.value === undefined) issue("value");
    if (node.type === "press" && !node.key?.trim()) issue("key");
    if (node.type === "wait" && node.wait === "time" && !(Number(node.ms) > 0 && Number(node.ms) <= 600000)) issue("ms");
    if (node.type === "wait" && node.wait === "url" && !node.value?.trim()) issue("wait_url");
    if (node.type === "wait" && node.wait === "download" && node.into && !validName(node.into)) issue("into", node.into);
    if (node.type === "tab" && !/^(\d{1,2}|new|popup|opener)$/.test((node.tab || "").trim())) issue("tab");
    if (node.type === "dialog" && node.dialog !== "accept" && node.dialog !== "dismiss") issue("dialog");
    if ((node.type === "extract" || node.type === "js") && node.into && !validName(node.into)) issue("into", node.into);
    if (node.type === "extract" && !node.into) issue("into", "");
    if ((node.type === "js" || (node.type === "extract" && node.what === "js")) && !node.code?.trim()) issue("code");
    if (node.type === "loop" && !node.list?.trim()) issue("list");
    if (node.type === "confirm" && !node.message?.trim()) issue("message");
    if (node.type === "subflow") {
      if (!node.script_id) issue("subflow");
      else if (node.script_id === selfId) issue("subflow_self");
      else if (scriptIds.length && !scriptIds.includes(node.script_id)) issue("subflow_missing", node.script_id);
    }
    if (node.on_error?.startsWith("goto:") && !byId.has(node.on_error.slice(5))) issue("goto", node.on_error.slice(5));
    if (node.on_error?.startsWith("retry:") && !(Number(node.on_error.slice(6)) >= 1 && Number(node.on_error.slice(6)) <= 5)) issue("retry");
    // Code is never a template: a parameter or an extracted value from a page
    // spliced into JS would let whoever supplies it run any code.
    if (references(node.code).length) issue("code_var");
    const texts = [node.url, node.value, node.key, node.message, node.list, ...Object.values(node.args || {})];
    for (const name of texts.flatMap(text => references(text))) if (!variables.has(name)) issue("unknown_var", name);
    if (node.sensitive && node.value && !onlyReference(node.value)) issue("sensitive_literal");
    for (const field of [node.url, node.message, node.list, node.key]) {
      for (const name of references(field)) if (secrets.has(name)) issue("secret_use", name);
    }
  }
  if (bytes(script) > recordLimit - 2048) issues.push({ code: "too_large" });
  return issues;
}

function cyclic(nodes: ScriptNode[], edges: Edge[]) {
  const next = new Map<string, string[]>();
  for (const [from, to] of edges) next.set(from, [...(next.get(from) || []), to]);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const to of next.get(id) || []) if (visit(to)) return true;
    state.set(id, 2);
    return false;
  };
  return nodes.some(node => visit(node.id));
}

/** Layered layout, left to right: each node goes one column after its
 *  deepest parent; the second port of a fork goes one row lower. Notes
 *  keep their places. */
export function layout(script: Script): Script {
  const { nodes, edges } = script.graph;
  if (cyclic(nodes, edges)) return script;
  const parents = new Map<string, string[]>();
  for (const [from, to] of edges) parents.set(to, [...(parents.get(to) || []), from]);
  const depth = new Map<string, number>();
  const measure = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    depth.set(id, 0);
    const value = Math.max(-1, ...(parents.get(id) || []).map(measure)) + 1;
    depth.set(id, value);
    return value;
  };
  const steps = nodes.filter(node => node.type !== "note");
  for (const node of steps) measure(node.id);
  const column = new Map<string, number>();
  const ordered = [...steps].sort((a, b) => depth.get(a.id)! - depth.get(b.id)! || a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
  const taken = new Map<number, Set<number>>();
  for (const node of ordered) {
    const from = parents.get(node.id) || [];
    const edge = edges.find(([source, target]) => target === node.id && from.includes(source));
    const parent = edge?.[0];
    const second = Boolean(edge?.[2]) && portLabels[nodes.find(item => item.id === parent)?.type || "note"]?.[1] === edge![2];
    let wanted = parent !== undefined ? (column.get(parent) ?? 0) + (second ? 1 : 0) : 0;
    const row = depth.get(node.id)!;
    const used = taken.get(row) || new Set<number>();
    while (used.has(wanted)) wanted++;
    used.add(wanted);
    taken.set(row, used);
    column.set(node.id, wanted);
  }
  return {
    ...script,
    graph: {
      edges,
      nodes: nodes.map(node => node.type === "note" ? node : {
        ...node, pos: [depth.get(node.id)! * columnGap, column.get(node.id)! * rowGap] as [number, number],
      }),
    },
  };
}

/** The steps from the start in the order a linear run meets them (the first
 *  port of forks first): what the run list and "start here" show. */
export function order(script: Script): ScriptNode[] {
  const { nodes, edges } = script.graph;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const incoming = new Set(edges.map(edge => edge[1]));
  const seen = new Set<string>();
  const result: ScriptNode[] = [];
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return;
    result.push(node);
    const ports = portLabels[node.type];
    const out = edges.filter(edge => edge[0] === id)
      .sort((a, b) => (ports?.indexOf(a[2] || "") ?? 0) - (ports?.indexOf(b[2] || "") ?? 0));
    for (const edge of out) walk(edge[1]);
  };
  for (const node of nodes) if (node.type !== "note" && !incoming.has(node.id)) walk(node.id);
  for (const node of nodes) if (node.type !== "note") walk(node.id);
  return result;
}

/** Appends recorded steps after the last step of a linear script. */
export function append(script: Script, steps: ScriptNode[]): Script {
  const ids = new Set(script.graph.nodes.map(node => node.id));
  const fresh = steps.filter(step => nodeTypes.includes(step.type) && step.id && !ids.has(step.id) && ids.add(step.id));
  if (!fresh.length) return script;
  const sequence = order(script);
  const outgoing = new Set(script.graph.edges.map(edge => edge[0]));
  const tail = [...sequence].reverse().find(node => !outgoing.has(node.id) && !portLabels[node.type]);
  const base = tail ? tail.pos : [-columnGap, 0] as [number, number];
  const nodes = fresh.map((step, index) => ({ ...step, pos: [base[0] + columnGap * (index + 1), base[1]] as [number, number] }));
  const edges: Edge[] = [];
  let previous = tail?.id;
  for (const node of nodes) { if (previous) edges.push([previous, node.id]); previous = node.id; }
  return { ...script, graph: { nodes: [...script.graph.nodes, ...nodes], edges: [...script.graph.edges, ...edges] } };
}

/** Declares a required secret parameter for every sensitive recorded value
 *  (${password}, ${dialog_input}…) the script does not declare yet, so a
 *  recording never stores what was typed and still validates. */
export function withSecretParams(script: Script): Script {
  const declared = new Set(script.params.map(param => param.name));
  const added: Param[] = [];
  for (const node of script.graph.nodes) {
    if (!node.sensitive || !node.value || !onlyReference(node.value)) continue;
    const name = references(node.value)[0];
    if (!declared.has(name)) { declared.add(name); added.push({ name, type: "secret", required: true }); }
  }
  return added.length ? { ...script, params: [...script.params, ...added] } : script;
}

/** Removes a node and joins its single parent to its single child, so a
 *  linear recording stays connected. */
export function removeNode(script: Script, id: string): Script {
  const { nodes, edges } = script.graph;
  const into = edges.filter(edge => edge[1] === id), out = edges.filter(edge => edge[0] === id);
  const rest = edges.filter(edge => edge[0] !== id && edge[1] !== id);
  if (into.length === 1 && out.length === 1 && !rest.some(edge => edge[0] === into[0][0] && (edge[2] || "") === (into[0][2] || ""))) {
    rest.push(into[0][2] ? [into[0][0], out[0][1], into[0][2]] : [into[0][0], out[0][1]]);
  }
  return { ...script, graph: { nodes: nodes.filter(node => node.id !== id), edges: rest } };
}

/** Connects two nodes, replacing whatever the same port led to before. The
 *  port is the first free label of a fork when none is given. */
export function connect(script: Script, from: string, to: string, label?: string): Script {
  const source = script.graph.nodes.find(node => node.id === from);
  if (!source || from === to || source.type === "note" || script.graph.nodes.find(node => node.id === to)?.type === "note") return script;
  const ports = portLabels[source.type];
  const used = script.graph.edges.filter(edge => edge[0] === from).map(edge => edge[2] || "");
  const port = ports ? (label && ports.includes(label) ? label : ports.find(item => !used.includes(item)) || ports[0]) : "";
  const edges = script.graph.edges.filter(edge => !(edge[0] === from && (edge[2] || "") === port));
  const next: Script = { ...script, graph: { ...script.graph, edges: [...edges, port ? [from, to, port] : [from, to]] } };
  return cyclic(next.graph.nodes, next.graph.edges) ? script : next;
}

/** Values for a run: required ones present, numbers numeric. Secrets are
 *  returned separately and never written to a record. */
export function runArguments(params: Param[], input: Record<string, string>) {
  const values: Record<string, string> = {}, secrets: Record<string, string> = {}, missing: string[] = [];
  for (const param of params) {
    const value = input[param.name] ?? param.default ?? "";
    if (param.required && value === "") missing.push(param.name);
    if (param.type === "number" && value !== "" && !Number.isFinite(Number(value))) missing.push(param.name);
    if (param.type === "secret") { if (value) secrets[param.name] = value; }
    else if (value !== "") values[param.name] = value;
  }
  return { values, secrets, missing };
}

/** Fits extracted output into a run record: long strings cut, the whole
 *  object kept under budget, secrets' values masked wherever they appear. */
export function cutOutput(output: Record<string, unknown>, secrets: string[] = [], budget = 16 * 1024): Record<string, unknown> {
  const mask = (text: string) => secrets.filter(Boolean).reduce((value, secret) => value.split(secret).join("•••"), text);
  const clean = (value: unknown, depth = 0): unknown => {
    if (typeof value === "string") return mask(value).slice(0, 2000);
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
    if (depth > 4) return null;
    if (Array.isArray(value)) return value.slice(0, 200).map(item => clean(item, depth + 1));
    if (typeof value === "object") return Object.fromEntries(Object.entries(value as object).slice(0, 100).map(([key, item]) => [key, clean(item, depth + 1)]));
    return null;
  };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    const cleaned = clean(value);
    if (bytes({ ...result, [key]: cleaned }) > budget) { result.truncated = true; break; }
    result[key] = cleaned;
  }
  return result;
}

/** A run record to keep: the newest steps, at most 64 KB. */
export function fitRun(run: Run): Run {
  let result = { ...run, steps: run.steps.slice(-300), error: run.error.slice(0, 1000) };
  while (bytes(result) > recordLimit - 1024 && result.steps.length > 10) result = { ...result, steps: result.steps.slice(Math.ceil(result.steps.length / 4)) };
  if (bytes(result) > recordLimit - 1024) result = { ...result, output: { truncated: true } };
  return result;
}

export function locatorText(locator: Locator) {
  if (locator.kind === "role") return `${locator.role || ""}${locator.name ? ` "${locator.name}"` : ""}`;
  return locator.value || "";
}

export function describeTarget(target?: Target) {
  const first = target?.locators?.[0];
  return first ? locatorText(first) : "";
}

// Per-profile browser settings (proxy, user agent, language, launch
// arguments). They live only in the local component; passwords are
// write-only and never come back.
export type ProxyKind = "http" | "https" | "socks5";
export type ProfileSettings = {
  proxy: { server: string; bypass: string[]; username: string; has_password: boolean } | null;
  user_agent: string; lang: string; args: string[];
};
export type ProfileSettingsInput = Omit<ProfileSettings, "proxy"> & {
  /** password: omitted keeps the saved one, "" clears it. */
  proxy: { server: string; bypass: string[]; username: string; password?: string } | null;
};
export const emptySettings: ProfileSettings = { proxy: null, user_agent: "", lang: "", args: [] };

// The component rejects everything else; checking here gives instant feedback.
const flagArgs = ["--start-maximized", "--disable-gpu", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"];
const valueArgs: Record<string, RegExp> = {
  "--window-size": /^\d{2,5},\d{2,5}$/,
  "--force-device-scale-factor": /^(?:[0-3](?:\.\d{1,2})?|4)$/,
  "--disable-features": /^[A-Za-z0-9_]+(?:,[A-Za-z0-9_]+)*$/,
  "--enable-features": /^[A-Za-z0-9_]+(?:,[A-Za-z0-9_]+)*$/,
  "--blink-settings": /^imagesEnabled=(?:true|false)$/,
};
export function launchArgOk(arg: string) {
  if (flagArgs.includes(arg)) return true;
  const at = arg.indexOf("=");
  const pattern = at > 0 ? valueArgs[arg.slice(0, at)] : undefined;
  return Boolean(pattern?.test(arg.slice(at + 1)));
}
/** "host:port" (an IPv6 host in brackets) and a scheme → a proxy server URL, or "". */
export function proxyServer(kind: ProxyKind, address: string) {
  const match = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]{1,253}):(\d{1,5})$/.exec(address.trim());
  const port = Number(match?.[2]);
  return match && port > 0 && port < 65536 ? `${kind}://${match[1]}:${port}` : "";
}
export function splitProxy(server: string): { kind: ProxyKind; address: string } {
  const match = /^(https?|socks5):\/\/(.+)$/.exec(server);
  return match ? { kind: match[1] as ProxyKind, address: match[2] } : { kind: "http", address: "" };
}
export const langOk = (lang: string) => !lang || /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(lang);
export const userAgentOk = (ua: string) => ua.length <= 512 && !/[\u0000-\u001f\u007f]/.test(ua);
