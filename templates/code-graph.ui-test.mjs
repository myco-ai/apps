import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { hostPath } from "./test-paths.mjs";

const home = new URL("../dist/official/code-graph/", import.meta.url);
const shots = new URL("../artifacts/code-graph/", import.meta.url);
mkdirSync(shots, { recursive: true });
const fixture = mkdtempSync(join(tmpdir(), "code-graph-"));
mkdirSync(join(fixture, "src"));
mkdirSync(join(fixture, "node_modules"));
mkdirSync(join(fixture, "metrics"));
writeFileSync(join(fixture, "README.md"), "[Start](src/start.ts)\n");
writeFileSync(join(fixture, "src/start.ts"), 'import { task } from "./task.js";\nvoid task();\n');
writeFileSync(join(fixture, "src/task.ts"), "export function task() {}\n");
writeFileSync(join(fixture, "node_modules/noise.ts"), "export const noise = 0;");
writeFileSync(join(fixture, ".private.md"), "private");
writeFileSync(join(fixture, "go.mod"), "module example.com/fixture\n");
writeFileSync(join(fixture, "main.go"), 'package main\n\nimport (\n  "fmt"\n  m "example.com/fixture/metrics"\n)\n');
writeFileSync(join(fixture, "metrics/metrics.go"), "package metrics\n");

const bridge = readFileSync(hostPath("internal/console/pagebridge.js"), "utf8");
const requests = [];
const host = `
const prefs = new URLSearchParams(location.search);
const iframe = document.querySelector("iframe");
addEventListener("message", e => {
  const {id,method,myco} = e.data || {};
  if (e.source !== iframe.contentWindow || myco !== "call") return;
  if (method !== "ready") fetch("/unexpected?method="+method);
  e.source.postMessage({myco:"result",id,value:{
    page:{id:"pg_demo"},features:["preferences"],preferences:{language:prefs.get("lang"),theme:prefs.get("theme")}
  }},location.origin);
});
iframe.src="/app/";
`;
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://local").pathname;
  requests.push(path);
  const css = ".css", js = ".js";
  if (path === "/") return res.setHeader("content-type", "text/html").end(
    '<style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block}</style><iframe></iframe><script src="/host.js"></script>');
  if (path === "/host.js") return res.setHeader("content-type", "text/javascript").end(host);
  if (path === "/app/bridge.js") return res.setHeader("content-type", "text/javascript").end(bridge);
  if (path.startsWith("/app/")) {
    const name = path.slice(5) || "index.html";
    let body = readFileSync(new URL(name, home));
    if (name === "index.html") body = body.toString().replace("<head>", '<head><script src="/app/bridge.js"></script>');
    return res.setHeader("content-type", name.endsWith(js) ? "text/javascript" : name.endsWith(css) ? "text/css" : "text/html").end(body);
  }
  res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const origin = `http://127.0.0.1:${server.address().port}`;
const failures = [];
try {
  for (const [lang, theme, width] of [["zh", "light", 1280], ["zh", "dark", 760], ["en", "light", 390], ["en", "light", 1280], ["en", "dark", 1280]]) {
    const zh = lang === "zh";
    const page = await browser.newPage({ viewport: { width, height: 850 }, deviceScaleFactor: 2, colorScheme: "light" });
    page.on("pageerror", e => failures.push(e.message));
    await page.goto(`${origin}/?lang=${lang}&theme=${theme}`);
    const app = page.frameLocator("iframe");
    await app.getByRole("button", { name: zh ? "打开示例" : "Open example" }).click();
    const nodes = app.getByRole("complementary", { name: zh ? "节点" : "Nodes" });
    const details = app.getByRole("complementary", { name: zh ? "详情" : "Details" });
    await nodes.getByRole("button", { name: /^README\.md/ }).click();
    await details.getByText("README.md:L12").waitFor();
    await details.getByRole("button", { name: zh ? "设为起点" : "Set start" }).click();
    await nodes.getByRole("button", { name: /^schema\.sql/ }).click();
    await details.getByRole("button", { name: zh ? "设为终点" : "Set end" }).click();
    await details.getByText("infra/store.ts:L11").waitFor();
    assert.equal(await details.locator("ol li").count(), 4);
    assert.equal(await app.locator("svg .path-link").count(), 4);
    assert.equal(await app.locator("html").getAttribute("data-myco-theme"), theme);
    assert.ok(await app.locator("html").evaluate(html => html.scrollWidth === html.clientWidth));
    await page.screenshot({ path: new URL(`path-${lang}-${theme}.png`, shots).pathname, fullPage: true });
    await details.getByRole("button", { name: zh ? "清除路径" : "Clear path" }).click();
    await app.getByRole("searchbox").fill("core/queue");
    assert.equal(await nodes.getByRole("button").count(), 1);
    if (lang === "en" && theme === "dark") {
      const input = app.locator('input[type=file][accept]');
      await input.setInputFiles({name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"nodes":[{"id":"a"}],"links":[{"source":"a","target":"b"}]}')});
      await app.getByRole("alert").getByText(/Invalid graph JSON/).waitFor();
      await input.setInputFiles({name:"graphify.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({
        nodes: [{ id: 1, label: "Parser", source_file: "parser.py", source_location: "L1" }, { id: "B", label: "Result", community: 3 }],
        links: [{ source: 1, target: "B", confidence:"INFERRED", relation:"returns", source_file:"parser.py", source_location:"L8" }],
      }))});
      await nodes.getByRole("button", { name: /^Parser/ }).click();
      await details.getByText("parser.py:L8").waitFor();
      await details.getByText("Inferred", { exact: true }).waitFor();
      const download = page.waitForEvent("download");
      await app.getByRole("button", { name: "Export JSON" }).click();
      assert.equal((await download).suggestedFilename(), "code-graph.json");
      await app.locator("input[webkitdirectory]").setInputFiles(fixture);
      await nodes.getByRole("button", { name: /^start\.ts/ }).click();
      await details.getByText("src/start.ts:L1").waitFor();
      assert.equal(await nodes.getByRole("button").count(), 5);
      assert.equal(await details.getByText("README.md:L1").count(), 1);
      await nodes.getByRole("button", { name: /^main\.go/ }).click();
      await details.getByText("main.go:L5").waitFor();
      await details.getByRole("button", { name: "metrics.go" }).waitFor();
      await details.getByRole("button", { name: "Set start" }).click();
      await nodes.getByRole("button", { name: /^task\.ts/ }).click();
      await details.getByRole("button", { name: "Set end" }).click();
      await details.getByText("These nodes are not connected.").waitFor();
      if (process.env.GRAPHIFY_SAMPLE) {
        await input.setInputFiles(process.env.GRAPHIFY_SAMPLE);
        await nodes.getByRole("button", { name: /^analyze\.py/ }).first().click();
        assert.ok(await details.getByText("contains", { exact: true }).count());
      }
    }
    await page.close();
  }
  assert.deepEqual(failures, []);
  assert.equal(requests.includes("/unexpected"), false, "the app must make no data or network bridge calls");
  console.log("PASS code graph: Graphify import, source evidence, search and path, local folder scanning, private export, and responsive language/theme combinations");
} finally {
  await browser.close();
  server.close();
  rmSync(fixture, { recursive: true, force: true });
}
