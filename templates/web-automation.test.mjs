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
assert.deepEqual(m.cutOutput({ a: "token s3cret here", b: "y".repeat(5000) }, ["s3cret"]), { a: "token ••• here", b: "y".repeat(2000) });
assert.equal(m.cutOutput({ a: "x".repeat(1900), b: "x".repeat(1900) }, [], 2500).truncated, true);
const run = { script_id: "s", script_version: 1, script_name: "s", state: "running", node: "", by: "a", by_kind: "person", machine: "", profile: "", started_at: "", ended_at: "",
  error_node: "", error: "e".repeat(3000), output: {}, steps: Array.from({ length: 2000 }, (_, index) => ({ node: "n" + index, state: "ok", ms: index, error: "x".repeat(40) })) };
const fitted = m.fitRun(run);
assert(m.bytes(fitted) < m.recordLimit && fitted.error.length === 1000 && fitted.steps.at(-1).node === "n1999", "runs keep their newest steps under 64 KB");
assert(m.finished("offline") && !m.finished("paused"));
// Profile settings: only allowlisted launch arguments, well-formed proxies and languages.
assert(m.launchArgOk("--start-maximized") && m.launchArgOk("--window-size=1440,900") && m.launchArgOk("--disable-features=Translate,AutofillServerCommunication"));
for (const bad of ["--remote-debugging-port=9222", "--user-data-dir=/tmp/x", "--load-extension=/x", "--disable-web-security", "--no-sandbox", "--proxy-server=http://x:1",
  "--headless", "--enable-automation", "--window-size=1,1;rm", "--disable-features=", "--host-resolver-rules=MAP * 1.2.3.4", "--start-maximized=1"]) assert(!m.launchArgOk(bad), bad);
assert.equal(m.proxyServer("socks5", " proxy.example.com:1080 "), "socks5://proxy.example.com:1080");
assert.equal(m.proxyServer("http", "[::1]:8080"), "http://[::1]:8080");
for (const bad of ["proxy.example.com", "user:pw@host:80", "host:0", "host:70000", "http://host:80"]) assert.equal(m.proxyServer("http", bad), "", bad);
assert.deepEqual(m.splitProxy("https://p.example.com:443"), { kind: "https", address: "p.example.com:443" });
assert(m.langOk("") && m.langOk("zh-CN") && m.langOk("en") && !m.langOk("zh_CN") && !m.langOk("--lang"));
assert(m.userAgentOk("Mozilla/5.0") && !m.userAgentOk("a\nb"));
console.log("PASS web automation: normalising, validation codes, secrets, recorded side effects, recorded secrets, code templates, fork ports, editing, layout, run arguments, output masking, record budgets, profile settings and sample");
