// Web automation scripts: normalisation, validation codes, layout, editing
// helpers, run arguments and record budgets; and the sample passes its own checks.
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(new URL("src/web-automation/model.ts", import.meta.url), "utf8");
const m = await import("data:text/javascript;base64," + Buffer.from(ts.transpile(source, { target: 99, module: 99 })).toString("base64"));
const sample = JSON.parse(fs.readFileSync(new URL("src/web-automation/public/sample.json", import.meta.url), "utf8"));
const ids = sample.scripts.map(script => script.id);
for (const raw of sample.scripts) {
  const { id, ...data } = raw;
  assert.deepEqual(m.validate(m.normalize(data), ids, id), [], `sample ${id} is valid`);
}
for (const raw of sample.drafts) assert.deepEqual(m.validate(m.normalize(raw)), [], "sample draft is valid");
const codes = script => m.validate(script).map(issue => issue.code).sort();

// Normalising drops unknown types, duplicate ids, self and dangling edges.
const messy = m.normalize({ name: 1, graph: { nodes: [{ id: "a", type: "click", pos: ["4", null] }, { id: "a", type: "navigate" }, { id: "b", type: "bogus" }, { id: "c", type: "navigate", url: "https://x.test" }],
  edges: [["a", "c"], ["a", "a"], ["a", "b"], ["c", "zz"], "junk"] }, params: [{ name: "p", type: "weird" }, null] });
assert.equal(messy.name, "");
assert.deepEqual(messy.graph.nodes.map(node => node.id), ["a", "c"]);
assert.deepEqual(messy.graph.nodes[0].pos, [4, 0]);
assert.deepEqual(messy.graph.edges, [["a", "c"]]);
assert.deepEqual(messy.params, [{ name: "p", type: "string" }]);
assert.equal(messy.on_error, "stop");

// Validation codes.
const base = m.newScript("t");
assert.deepEqual(codes(base), ["empty"]);
const nav = (id, url = "https://example.com") => ({ ...m.newNode("navigate", id, [0, 0]), url });
const click = id => ({ ...m.newNode("click", id, [0, 0]), target: { locators: [{ kind: "css", value: "#go" }] } });
const withGraph = (nodes, edges, params = []) => ({ ...base, params, graph: { nodes, edges } });
assert.deepEqual(codes(withGraph([nav("a"), click("b")], [["a", "b"]])), []);
assert.deepEqual(codes(withGraph([nav("a"), click("b")], [])), ["many_starts"]);
assert.deepEqual(codes(withGraph([nav("a"), click("b")], [["a", "b"], ["b", "a"]])), ["cycle", "no_start"]);
assert.deepEqual(codes(withGraph([nav("a", "ftp://x"), m.newNode("click", "b", [0, 0])], [["a", "b"]])), ["target", "url_scheme"]);
assert.deepEqual(codes(withGraph([nav("a", "${home}")], [], [{ name: "home", type: "string" }])), [], "a URL may be a whole parameter");
assert.deepEqual(codes(withGraph([nav("a", "https://x/${q}")], [])), ["unknown_var"]);
assert.deepEqual(codes(withGraph([nav("a"), click("b"), click("c")], [["a", "b"], ["a", "c"]])), ["edge_fanout"], "only forks split");
const branch = { ...m.newNode("branch", "f", [0, 0]), target: { locators: [{ kind: "text", value: "Next" }] } };
assert.deepEqual(codes(withGraph([nav("a"), branch, click("b"), click("c")], [["a", "f"], ["f", "b", "true"], ["f", "c", "false"]])), []);
assert.deepEqual(codes(withGraph([nav("a"), branch, click("b")], [["a", "f"], ["f", "b", "maybe"]])), ["edge_label"]);
assert.deepEqual(codes(withGraph([nav("a"), click("b")], [["a", "b", "ok"]])), ["edge_label"]);
const note = { ...m.newNode("note", "n", [0, 0]), note: "hi" };
assert.deepEqual(codes(withGraph([nav("a"), note], [])), [], "notes are not starts");
assert.deepEqual(codes(withGraph([nav("a"), note], [["a", "n"]])), ["edge_note"]);
// Secrets: never a default, only whole references in sensitive inputs, only in type/select.
const typing = (value, sensitive) => ({ ...m.newNode("type", "t", [0, 0]), target: { locators: [{ kind: "label", value: "Password" }] }, value, sensitive });
const secret = [{ name: "pw", type: "secret" }];
assert.deepEqual(codes(withGraph([nav("a"), typing("${pw}", true)], [["a", "t"]], secret)), []);
assert.deepEqual(codes(withGraph([nav("a"), typing("hunter2", true)], [["a", "t"]], secret)), ["sensitive_literal"]);
assert.deepEqual(codes(withGraph([nav("a", "https://x/?p=${pw}")], [], secret)), ["secret_use"]);
assert.deepEqual(codes(withGraph([nav("a")], [], [{ name: "pw", type: "secret", default: "x" }])), ["secret_default"]);
assert.deepEqual(codes(withGraph([nav("a")], [], [{ name: "1x", type: "string" }, { name: "ok", type: "string" }, { name: "ok", type: "number" }])), ["param_duplicate", "param_name"]);
// Variables from extract/loop are known later; missing fields are reported.
const extract = { ...m.newNode("extract", "e", [0, 0]), target: { locators: [{ kind: "css", value: "a" }] }, into: "link" };
assert.deepEqual(codes(withGraph([nav("a"), extract, nav("b", "${link}")], [["a", "e"], ["e", "b"]])), []);
assert.deepEqual(codes(withGraph([{ ...m.newNode("wait", "w", [0, 0]), wait: "time", ms: 0 }, { ...m.newNode("press", "p", [0, 0]) }, { ...m.newNode("loop", "l", [0, 0]) }, { ...m.newNode("confirm", "c", [0, 0]) }],
  [["w", "p"], ["p", "l"], ["l", "c", "each"]])), ["key", "list", "message", "ms"]);
assert.deepEqual(m.validate(withGraph([{ ...m.newNode("subflow", "s", [0, 0]), script_id: "me" }], []), ["me"], "me").map(issue => issue.code), ["subflow_self"]);
assert.deepEqual(m.validate(withGraph([{ ...m.newNode("subflow", "s", [0, 0]), script_id: "gone" }], []), ["me"], "me").map(issue => issue.code), ["subflow_missing"]);
assert.deepEqual(codes(withGraph([{ ...nav("a"), on_error: "goto:zz" }, { ...click("b"), on_error: "retry:9" }], [["a", "b"]])), ["goto", "retry"]);
const huge = withGraph(Array.from({ length: 400 }, (_, index) => ({ ...click("c" + index), note: "x".repeat(150) })), Array.from({ length: 399 }, (_, index) => ["c" + index, "c" + (index + 1)]));
assert(codes(huge).includes("too_large"));

// Recorded side effects are explicit steps with their own checks.
assert.deepEqual(codes(withGraph([click("a"), { ...m.newNode("wait", "w", [0, 0]), wait: "url", value: "" }], [["a", "w"]])), ["wait_url"]);
assert.deepEqual(codes(withGraph([click("a"), { ...m.newNode("wait", "w", [0, 0]), wait: "url", value: "/done" }, { ...m.newNode("wait", "d", [0, 0]), wait: "download", into: "file" }, nav("b", "https://x/${file}")],
  [["a", "w"], ["w", "d"], ["d", "b"]])), []);
assert.equal(m.newNode("tab", "t", [0, 0]).tab, "popup");
assert.deepEqual(codes(withGraph([click("a"), { ...m.newNode("tab", "t", [0, 0]), tab: "sideways" }], [["a", "t"]])), ["tab"]);
assert.deepEqual(codes(withGraph([click("a"), { ...m.newNode("dialog", "g", [0, 0]), value: "${pw}" }], [["a", "g"]], secret)), [], "a prompt may take a secret");
assert.deepEqual(codes(withGraph([click("a"), { ...m.newNode("dialog", "g", [0, 0]), dialog: "maybe" }], [["a", "g"]])), ["dialog"]);

// Sensitive recorded values become required secret parameters, once.
const recorded = m.withSecretParams(withGraph([{ ...typing("${password}", true), id: "t1" }, { ...m.newNode("dialog", "g", [0, 0]), value: "${dialog_input}", sensitive: true }, { ...typing("${password}", true), id: "t2" }],
  [["t1", "g"], ["g", "t2"]]));
assert.deepEqual(recorded.params, [{ name: "password", type: "secret", required: true }, { name: "dialog_input", type: "secret", required: true }]);
assert.deepEqual(codes(recorded), []);
assert.equal(m.withSecretParams(recorded), recorded, "nothing to add leaves the script as it is");

// Code is never a template: no parameter or extracted value is spliced into JS.
assert.deepEqual(codes(withGraph([{ ...m.newNode("js", "j", [0, 0]), code: "return '${title}'" }], [], [{ name: "title", type: "string" }])), ["code_var"]);
assert.deepEqual(codes(withGraph([extract, { ...m.newNode("assert", "x", [0, 0]), check: "expr", code: "location.href === '${link}'" }], [["e", "x"]])), ["code_var"]);
assert.deepEqual(codes(withGraph([{ ...m.newNode("js", "j", [0, 0]), code: "return document.title" }], [])), []);

// Editing: connect replaces a port and refuses cycles; remove keeps a chain joined; append adds below the tail.
let script = withGraph([nav("a"), click("b"), click("c")], [["a", "b"], ["b", "c"]]);
assert.deepEqual(m.connect(script, "c", "a").graph.edges, script.graph.edges, "no cycles");
assert.deepEqual(m.connect(script, "a", "c").graph.edges, [["b", "c"], ["a", "c"]], "a port leads to one step");
script = m.removeNode(script, "b");
assert.deepEqual(script.graph.edges, [["a", "c"]]);
const forked = m.connect(m.connect(withGraph([nav("a"), branch, click("b"), click("c")], [["a", "f"]]), "f", "b"), "f", "c");
assert.deepEqual(forked.graph.edges, [["a", "f"], ["f", "b", "true"], ["f", "c", "false"]], "fork ports fill in order");
const appended = m.append(withGraph([{ ...nav("a"), pos: [40, 10] }], []), [click("x"), click("y"), click("x")]);
assert.deepEqual(appended.graph.edges, [["a", "x"], ["x", "y"]]);
assert.deepEqual(appended.graph.nodes.map(node => node.pos), [[40, 10], [40 + m.columnGap, 10], [40 + 2 * m.columnGap, 10]]);
assert.deepEqual(m.append(m.newScript("e"), [nav("a")]).graph.nodes[0].pos, [0, 0]);
assert.equal(m.append(appended, [click("x")]), appended, "known steps are not added twice");

// Layout: columns by depth, the second port of a fork one row lower; order follows first ports.
const laid = m.layout(forked);
const at = id => laid.graph.nodes.find(node => node.id === id).pos;
assert.deepEqual([at("a"), at("f"), at("b"), at("c")], [[0, 0], [m.columnGap, 0], [2 * m.columnGap, 0], [2 * m.columnGap, m.rowGap]]);
assert.deepEqual(m.order(forked).map(node => node.id), ["a", "f", "b", "c"]);

// Run arguments and stored output.
const params = [{ name: "title", type: "string", required: true }, { name: "count", type: "number", default: "2" }, { name: "pw", type: "secret", required: true }];
assert.deepEqual(m.runArguments(params, { title: "Hi", pw: "s3cret" }), { values: { title: "Hi", count: "2" }, secrets: { pw: "s3cret" }, missing: [] });
assert.deepEqual(m.runArguments(params, { count: "x" }).missing, ["title", "count", "pw"]);
assert.deepEqual(m.cutOutput({ a: "token s3cret here", b: "y".repeat(5000) }, ["s3cret"]), { a: "token ••• here", b: "y".repeat(2000), truncated: true });
// A script's JSON.stringify(list) keeps whole items instead of its first 2,000 characters.
{
  const items = Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, title: "t".repeat(80), url: "https://x.test/" + i }));
  const kept = m.cutOutput({ list: JSON.stringify(items), note: "[not json", n: 3 });
  assert.equal(kept.list.length, 30);
  assert.deepEqual(kept.list[29], items[29]);
  assert.equal(kept.note, "[not json");
  assert.equal(kept.truncated, undefined, "nothing was cut");
  const many = m.cutOutput({ list: JSON.stringify(Array.from({ length: 500 }, (_, i) => i)) });
  assert.equal(many.list.length, 200);
  assert.equal(many.truncated, true, "a cut list is marked");
  assert.deepEqual(m.cutOutput({ s: JSON.stringify({ token: "s3cret" }) }, ["s3cret"]), { s: { token: "•••" } }, "secrets are masked inside parsed JSON");
}
assert.equal(m.cutOutput({ a: "x".repeat(1900), b: "x".repeat(1900) }, [], 2500).truncated, true);
const run = { script_id: "s", script_version: 1, script_name: "s", state: "running", node: "", by: "a", by_kind: "person", machine: "", profile: "", started_at: "", ended_at: "",
  error_node: "", error: "e".repeat(3000), output: {}, steps: Array.from({ length: 2000 }, (_, index) => ({ node: "n" + index, state: "ok", ms: index, error: "x".repeat(40) })) };
const fitted = m.fitRun(run);
assert(m.bytes(fitted) < m.recordLimit && fitted.error.length === 1000 && fitted.steps.at(-1).node === "n1999", "runs keep their newest steps under 64 KB");
assert(m.finished("offline") && !m.finished("paused"));
// Recorded extract outputs never clash with names the script already uses.
{
  const base = m.append(m.newScript("x"), [{ id: "e1", type: "extract", what: "text", into: "data1", target: { locators: [{ kind: "css", value: "#a" }] } }]);
  const more = m.append({ ...base, params: [{ name: "data2", type: "string" }] }, [
    { id: "e2", type: "extract", what: "text", into: "data1", target: { locators: [{ kind: "css", value: "#b" }] } },
    { id: "e3", type: "extract", what: "text", into: "data2", target: { locators: [{ kind: "css", value: "#c" }] } },
    { id: "e4", type: "extract", what: "text", into: "title", target: { locators: [{ kind: "css", value: "#d" }] } }]);
  assert.deepEqual(more.graph.nodes.map(node => node.into), ["data1", "data3", "data4", "title"]);
}
// Region screenshots: only well-formed clips on screenshots survive, and never with target or full.
{
  const shot = (extra) => m.normalize({ graph: { nodes: [{ id: "s", type: "screenshot", ...extra }], edges: [] } }).graph.nodes[0];
  assert.deepEqual(shot({ clip: { x: 10, y: "20", width: 300, height: 200 } }).clip, { x: 10, y: 20, width: 300, height: 200 });
  for (const bad of [{ x: -1, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: Infinity, height: 1 }, "x", null])
    assert(!("clip" in shot({ clip: bad })), JSON.stringify(bad));
  const notShot = m.normalize({ graph: { nodes: [{ id: "c", type: "click", clip: { x: 1, y: 1, width: 5, height: 5 }, target: { locators: [{ kind: "css", value: "a" }] } }], edges: [] } }).graph.nodes[0];
  assert(!("clip" in notShot), "clip only on screenshots");
  const both = m.normalize({ name: "x", graph: { nodes: [{ id: "s", type: "screenshot", full: true, clip: { x: 0, y: 0, width: 5, height: 5 } }], edges: [] } });
  assert(m.validate(both).some(issue => issue.code === "clip"));
  const fine = m.normalize({ name: "x", graph: { nodes: [{ id: "s", type: "screenshot", clip: { x: 0, y: 0, width: 5, height: 5 } }], edges: [] } });
  assert(!m.validate(fine).some(issue => issue.code === "clip"));
}
// Back, forward, reload and closing a tab are steps of their own (agent drafts record them).
{
  const s = m.normalize({ name: "x", graph: { nodes: ["back", "forward", "reload"].map((type, i) => ({ id: "n" + i, type })).concat([{ id: "t", type: "tab", tab: "close" }]), edges: [["n0", "n1"], ["n1", "n2"], ["n2", "t"]] } });
  assert.deepEqual(s.graph.nodes.map(node => node.type), ["back", "forward", "reload", "tab"]);
  assert.deepEqual(m.validate(s), [], "back/forward/reload and tab close are valid");
  assert(m.validate(m.normalize({ name: "x", graph: { nodes: [{ id: "t", type: "tab", tab: "shut" }], edges: [] } })).some(issue => issue.code === "tab"));
}
// Profile settings: only allowlisted launch arguments, well-formed proxies and languages.
assert(m.launchArgOk("--start-maximized") && m.launchArgOk("--window-size=1440,900") && m.launchArgOk("--disable-features=Translate,AutofillServerCommunication"));
for (const bad of ["--remote-debugging-port=9222", "--user-data-dir=/tmp/x", "--load-extension=/x", "--disable-web-security", "--no-sandbox", "--proxy-server=http://x:1",
  "--headless", "--enable-automation", "--window-size=1,1;rm", "--disable-features=", "--host-resolver-rules=MAP * 1.2.3.4", "--start-maximized=1"]) assert(!m.launchArgOk(bad), bad);
assert.equal(m.proxyServer("socks5", " proxy.example.com:1080 "), "socks5://proxy.example.com:1080");
assert.equal(m.proxyServer("http", "[::1]:8080"), "http://[::1]:8080");
for (const bad of ["proxy.example.com", "user:pw@host:80", "host:0", "host:70000", "http://host:80"]) assert.equal(m.proxyServer("http", bad), "", bad);
assert.deepEqual(m.splitProxy("https://p.example.com:443"), { kind: "https", address: "p.example.com:443" });
assert(m.langOk("") && m.langOk("zh-CN") && m.langOk("en") && !m.langOk("zh_CN") && !m.langOk("--lang"));
assert(m.userAgentOk("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36") && m.userAgentOk(""));
for (const bad of ["a\nb", "a\rb", "中文", "x".repeat(513)]) assert(!m.userAgentOk(bad), bad);
// A script copied from the library remembers where it came from; malformed references are dropped.
assert.deepEqual(m.normalize({ name: "x", library: { id: "bw_hn", version: 2 } }).library, { id: "bw_hn", version: 2 });
for (const bad of [{ id: "BW HN", version: 1 }, { id: "bw_hn", version: 0 }, { id: "bw_hn", version: 1.5 }, "bw_hn"]) assert.equal(m.normalize({ name: "x", library: bad }).library, undefined);

// The script library: index parsing, the SHA-256 check and the app's own validation before adding.
{
  const { build } = await import("esbuild");
  const out = await build({ entryPoints: [new URL("src/web-automation/library.ts", import.meta.url).pathname], bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent" });
  const files = {};
  globalThis.window = globalThis.window || {};
  window.myco = { features: ["net"], net: { fetch: async ({ url, max_bytes }) => {
    const key = url.replace("https://raw.githubusercontent.com/myco-ai/browser-scripts/main/", "");
    if (!(key in files)) return { status: 404, status_text: "Not Found", url, headers: {}, body: "", encoding: "utf8" };
    return { status: 200, status_text: "OK", url, headers: {}, body: files[key], encoding: "utf8", truncated: files[key].length > max_bytes };
  } } };
  const lib = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  const { createHash } = await import("node:crypto");
  const good = JSON.stringify({ id: "bw_hn", version: 2, name: "HN", start_url: "https://news.example/", params: [], on_error: "stop",
    graph: { nodes: [{ id: "n1", type: "navigate", url: "https://news.example/", pos: [0, 0] }, { id: "n2", type: "js", code: "return document.title;", into: "title", pos: [0, 128] }], edges: [["n1", "n2"]] } });
  const bad = JSON.stringify({ id: "bw_bad", version: 1, name: "Bad", params: [], graph: { nodes: [{ id: "n1", type: "js", code: "return '${x}';", pos: [0, 0] }], edges: [] } });
  const sha = value => createHash("sha256").update(value).digest("hex");
  files["scripts/tech/bw_hn.json"] = good;
  files["scripts/tech/bw_bad.json"] = bad;
  files["index.json"] = JSON.stringify({ schema: 1, scripts: [
    { id: "bw_hn", version: 2, name: "HN", category: "tech", status: "verified", steps: 2, file: "scripts/tech/bw_hn.json", sha256: sha(good) },
    { id: "bw_bad", version: 1, name: "Bad", category: "tech", status: "verified", file: "scripts/tech/bw_bad.json", sha256: sha(bad) },
    { id: "bw_tampered", version: 1, name: "T", category: "tech", status: "verified", file: "scripts/tech/bw_hn.json", sha256: "0".repeat(64) },
    { id: "../etc", version: 1, name: "x", category: "tech", status: "verified", file: "../etc/passwd", sha256: "0".repeat(64) },
    { id: "bw_odd", version: 1, name: "x", category: "tech", status: "unknown", file: "scripts/tech/x.json", sha256: "0".repeat(64) },
  ] });
  assert.equal(lib.libraryAvailable(), true);
  const index = await lib.loadIndex();
  assert.deepEqual(index.map(entry => entry.id), ["bw_hn", "bw_bad", "bw_tampered"], "malformed entries and paths outside scripts/ are dropped");
  const script = await lib.loadScript(index[0]);
  assert.equal(script.source, "library");
  assert.deepEqual(script.library, { id: "bw_hn", version: 2 });
  assert.equal(script.graph.nodes.length, 2);
  await assert.rejects(lib.loadScript(index[1]), /没通过检查/, "${} inside code is refused");
  await assert.rejects(lib.loadScript(index[2]), /对不上/, "a hash mismatch is refused");
  assert.throws(() => lib.parseIndex("{\"schema\":2,\"scripts\":[]}"), /格式不对/);
  const mine = { ...script, name: "我的 HN", profile: "工作号" };
  const next = lib.updated(mine, { ...script, library: { id: "bw_hn", version: 3 } });
  assert.deepEqual([next.name, next.profile, next.library.version], ["我的 HN", "工作号", 3], "an update keeps the page's name and profile");
}
console.log("PASS web automation: normalising, validation codes, secrets, recorded side effects, recorded secrets, code templates, fork ports, editing, layout, run arguments, output masking, record budgets, profile settings, region screenshots, navigation steps, script library and sample");
