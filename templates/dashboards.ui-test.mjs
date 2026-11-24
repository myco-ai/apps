import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { hostPath } from "./test-paths.mjs";

const home = new URL("../dist/official/dashboards/", import.meta.url);
const bridge = readFileSync(hostPath("internal/console/pagebridge.js"), "utf8");
const sample = JSON.parse(readFileSync(new URL("sample.json", home), "utf8"));
const rows = new Map(Object.entries(sample).flatMap(([collection, entries]) => entries.map(({ id, ...data }) => [
  `${collection}/${id}`, { collection, id, data, version: 1 },
])));
const translations = {
  "Service overview": "服务概览", "Quality report": "质量报告",
  "Traffic, reliability and activity from the latest service report.": "浏览最新服务报告的流量、可用性和运行指标。",
  "Daily latency and errors across the last week.": "查看过去一周的响应时间与错误数。",
  "Total requests": "总请求量", "Success rate": "成功率", "Median response": "响应时间中位数",
  "Traffic over time": "每日流量趋势", "Requests by service": "各服务请求量",
  "Traffic sources": "流量来源", "Service health": "服务健康状态", "Response time": "响应时间",
  "Daily errors": "每日错误数", "Most recent checks": "最近检查", "Period": "周期", "Requests": "请求量",
  "Nov 18–24": "11 月 18–24 日", "Day": "日期", "Median (ms)": "中位数（ms）", "P95 (ms)": "P95（ms）",
  "Errors": "错误数", "Service": "服务", "Source": "来源", "Status": "状态", "Console": "控制台",
  "Agent API": "Agent 接口", "Pages": "应用页面", "Webhooks": "通知回调", "Files": "项目文件", "Desktop": "桌面",
  "Mobile": "移动端", "Web": "网页", "Healthy": "正常",
};
function localize(value) {
  if (typeof value === "string") return translations[value] ?? value.replace(/^Nov (\d+)$/, "11/$1");
  if (Array.isArray(value)) return value.map(localize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localize(item)]));
  return value;
}

const outer = `
const params = new URLSearchParams(location.search);
const frame = document.querySelector("iframe");
addEventListener("message", async event => {
  const { id, method, args, myco } = event.data || {};
  if (event.source !== frame.contentWindow || event.origin !== location.origin || myco !== "call") return;
  const reply = payload => event.source.postMessage({myco: "result", id, ...payload}, event.origin);
  if (method === "ready") return reply({value: {
    page: {id:"pg_example"}, me:{name:"test",can_edit:!params.has("readonly")},
    preferences: {theme:params.has("dark") ? "dark" : "light",language:params.has("zh") ? "zh" : "en"},
  }});
  const response = await fetch("/data", {method:"POST", body:JSON.stringify({method,args,zh:params.has("zh")})});
  reply(await response.json());
});
frame.src = "/app/" + location.hash;`;
const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
const server = createServer(async (req, res) => {
  const route = new URL(req.url, "http://local").pathname;
  if (route === "/") return res.writeHead(200, { "content-type": "text/html" }).end('<style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block}</style><iframe></iframe><script src="/host.js"></script>');
  if (route === "/host.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(outer);
  if (route === "/app/bridge.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(bridge);
  if (route.startsWith("/app/")) {
    const name = route.slice(5) || "index.html";
    let data = readFileSync(new URL(name, home));
    if (name === "index.html") data = data.toString().replace("<head>", '<head><script src="/app/bridge.js"></script>');
    return res.writeHead(200, { "content-type": mime[name.slice(name.lastIndexOf("."))] || "application/octet-stream" }).end(data);
  }
  if (route === "/data") {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const { method, args, zh } = JSON.parse(Buffer.concat(buffers));
    const respond = payload => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(payload));
    if (method === "data.list") return respond({ value: { records: [...rows.values()].map(item => zh ? localize(item) : item), seq: 1 } });
    const { collection, id, ifVersion, data } = args;
    const key = `${collection}/${id}`;
    const old = rows.get(key);
    if (ifVersion !== (old?.version || 0)) return respond({ code: "conflict", error: "Record changed", latest: old });
    if (method === "data.put") {
      const row = { collection, id, data, version: (old?.version || 0) + 1 };
      rows.set(key, row);
      return respond({ value: row });
    }
    assert.equal(method, "data.remove");
    rows.delete(key);
    return respond({ value: true });
  }
  res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const artifacts = new URL("../artifacts/dashboards/", import.meta.url);
mkdirSync(artifacts, { recursive: true });
const errors = [];
async function launch(opts, query = "") {
  const page = await browser.newPage({ ...opts, deviceScaleFactor: 2, colorScheme: "light", locale: "en-US", timezoneId: "UTC" });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url + query);
  return { page, app: page.frameLocator("iframe") };
}
try {
  for (const [locale, theme, width, height] of [["en", "light", 1280, 900], ["zh", "dark", 1280, 900], ["zh", "light", 740, 850], ["en", "dark", 390, 820]]) {
    const zh = locale === "zh";
    const { page, app } = await launch({ viewport: { width, height } }, `/?${zh ? "zh&" : ""}${theme === "dark" ? "dark" : ""}`);
    await app.getByRole("heading", { name: zh ? "服务概览" : "Service overview" }).waitFor();
    assert.equal(await app.locator(".dash-card").count(), 7);
    assert.equal(await app.locator("html").getAttribute("data-myco-theme"), theme);
    assert.ok(await app.locator("html").evaluate((html, size) => html.scrollWidth <= size, width));
    if (width === 1280) await page.screenshot({ path: new URL(`${locale}-${theme}.png`, artifacts).pathname });
    await app.getByRole("button", { name: zh ? "质量报告" : "Quality report" }).click();
    await app.locator(".is-line svg[role=img]").waitFor();
    assert.equal(await app.locator(".dash-legend li").count(), 2);
    if (width === 390 || width === 740) await page.screenshot({ path: new URL(`${locale}-${theme}-narrow.png`, artifacts).pathname });
    await page.close();
  }
  const { page, app } = await launch({ viewport: { width: 1180, height: 850 } });
  const firstMetric = app.getByRole("article").filter({ hasText: "Total requests" });
  await firstMetric.getByText("84,326", { exact: true }).waitFor();
  rows.get("datasets/service_totals").data.rows[0][1] = 95500;
  await firstMetric.getByText("84,326", { exact: true }).waitFor();
  await app.getByRole("button", { name: "Reload data" }).click();
  await firstMetric.getByText("95,500", { exact: true }).waitFor();
  await app.getByRole("button", { name: "New dashboard" }).click();
  await app.getByLabel("Dashboard name").fill("New service report");
  await app.getByRole("button", { name: "Add panel" }).click();
  await app.getByLabel("Panel title").fill("Latency");
  await app.getByLabel("Visualization").selectOption("line");
  await app.getByLabel("Dataset", { exact: true }).selectOption("daily_traffic");
  await app.getByLabel("Label column").fill("Day");
  await app.getByRole("checkbox", { name: "Median (ms)", exact: true }).check();
  await app.getByRole("button", { name: "Add panel" }).click();
  await app.getByLabel("Panel title").fill("Recent checks");
  await app.getByLabel("Visualization").selectOption("table");
  await app.getByLabel("Dataset", { exact: true }).selectOption("service_health");
  await app.getByRole("button", { name: "Move panel up" }).last().click();
  await app.getByRole("button", { name: "Save layout" }).click();
  await app.getByRole("heading", { name: "New service report" }).waitFor();
  assert.equal(await app.locator(".dash-card h2").first().textContent(), "Recent checks");
  await app.locator(".is-line summary").click();
  await app.getByRole("cell", { name: "195", exact: true }).waitFor();

  const created = [...rows.values()].find(record => record.data.title === "New service report");
  assert.ok(created);
  await page.reload();
  await app.getByRole("button", { name: "New service report" }).click();
  await app.getByRole("button", { name: "Edit layout" }).click();
  created.version++;
  await app.getByLabel("Description").fill("Stale change");
  await app.getByRole("button", { name: "Save layout" }).click();
  await app.getByRole("alert").getByText(/changed elsewhere/).waitFor();
  await app.getByRole("button", { name: "Cancel" }).click();
  await app.getByRole("button", { name: "Reload data" }).click();
  await app.getByRole("button", { name: "Edit layout" }).click();
  await app.getByRole("button", { name: "Delete dashboard" }).click();
  await app.getByRole("button", { name: "Confirm deletion" }).click();
  await app.getByRole("heading", { name: "Service overview" }).waitFor();
  assert.equal(rows.has(`dashboards/${created.id}`), false);
  assert.equal(rows.has("datasets/daily_traffic"), true);
  await page.close();

  const readOnly = await launch({ viewport: { width: 1100, height: 800 } }, "/?readonly#dashboard?id=quality");
  await readOnly.app.getByRole("heading", { name: "Quality report" }).waitFor();
  assert.equal(await readOnly.app.getByRole("button", { name: "New dashboard" }).count(), 0);
  assert.equal(await readOnly.app.getByRole("button", { name: "Edit layout" }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS dashboards: six panel types, snapshot reload, versioned edits, reorder, delete, deep links, permissions, responsive bilingual themes");
} finally {
  await browser.close();
  server.close();
}
