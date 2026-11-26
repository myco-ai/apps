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
  "Mobile": "移动端", "Web": "网页", "Healthy": "正常", "Watching": "观察中", "Action needed": "需处理",
  "Worker queue": "任务队列", "Search index": "搜索索引", "Exports": "导出", "API gateway": "API 网关",
  "File preview": "文件预览", "Automation": "自动化", "Notifications": "通知", "Activity log": "活动日志",
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
  if (route === "/") {
    const fullscreen = new URL(req.url, "http://local").searchParams.has("native") ? " allowfullscreen" : "";
    return res.writeHead(200, { "content-type": "text/html" }).end(`<style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block}</style><iframe${fullscreen}></iframe><script src="/host.js"></script>`);
  }
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
    await app.getByRole("main", { name: zh ? "服务概览" : "Service overview" }).waitFor();
    assert.equal(await app.locator(".dash-card").count(), 7);
    assert.equal(await app.locator("h1, aside").count(), 0);
    const top = await app.locator(".dash-card").first().boundingBox();
    assert.ok(top.y < (width < 500 ? 105 : 85), `first panel starts at ${top.y}px`);
    assert.equal(await app.locator("html").getAttribute("data-myco-theme"), theme);
    assert.ok(await app.locator("html").evaluate((html, size) => html.scrollWidth <= size, width));
    if (width === 1280) await page.screenshot({ path: new URL(`${locale}-${theme}.png`, artifacts).pathname });
    const full = app.getByRole("button", { name: zh ? "全屏 · 服务健康状态" : "Fullscreen · Service health" });
    const originalTable = app.locator("article[data-panel=health] .dash-table-wrap");
    await originalTable.getByText(zh ? "观察中" : "Watching").first().waitFor();
    assert.equal(await originalTable.locator(".dash-table-label.is-amber").count(), 2);
    const tableArea = await originalTable.evaluate(table => ({
      height: table.clientHeight, body: table.parentElement.clientHeight,
    }));
    assert.ok(Math.abs(tableArea.height - tableArea.body) <= 5);
    if (width >= 1180) assert.ok(tableArea.height > 230, "tall tables exceed the former fixed cap");
    await full.click();
    const dialog = app.getByRole("dialog", { name: zh ? "服务健康状态" : "Service health" });
    await dialog.waitFor();
    const box = await dialog.boundingBox();
    assert.deepEqual([box.x, box.y, box.width, box.height].map(Math.round), [0, 0, width, height]);
    await dialog.locator(".dash-table-label.is-red").waitFor();
    await page.screenshot({ path: new URL(`fullscreen-${locale}-${theme}.png`, artifacts).pathname });
    if (zh) await dialog.getByRole("button", { name: "退出全屏" }).click();
    else await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await full.evaluate(el => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await full.evaluate(el => el === el.ownerDocument.activeElement), true, "fullscreen returns focus");
    await app.getByRole("combobox", { name: zh ? "切换仪表盘" : "Switch dashboard" }).selectOption("quality");
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
  await app.getByRole("button", { name: "Continue" }).click();
  await app.getByRole("button", { name: "Add panel", exact: true }).click();
  await app.getByLabel("Panel title").fill("Latency");
  await app.getByLabel("Visualization").selectOption("line");
  await app.getByLabel("Dataset", { exact: true }).selectOption("daily_traffic");
  await app.getByLabel("Label column").fill("Day");
  await app.getByRole("checkbox", { name: "Median (ms)", exact: true }).check();
  await app.getByRole("button", { name: "Add to dashboard" }).click();
  await app.getByRole("button", { name: "Add panel", exact: true }).click();
  await app.getByLabel("Panel title").fill("Recent checks");
  await app.getByLabel("Visualization").selectOption("table");
  await app.getByLabel("Dataset", { exact: true }).selectOption("service_health");
  await app.getByRole("button", { name: "Add label" }).click();
  await app.getByLabel("Column", { exact: true }).selectOption("Status");
  await app.getByLabel("Cell value").fill("Healthy");
  await app.getByLabel("Color", { exact: true }).selectOption("purple");
  await app.getByRole("button", { name: "Add to dashboard" }).click();

  const grid = await app.locator(".dash-grid").boundingBox();
  const column = (grid.width + 12) / 12;
  const row = 56;
  const latency = app.locator("article").filter({ hasText: "Latency" });
  const checks = app.locator("article").filter({ hasText: "Recent checks" });
  async function drag(handle, dx, dy) {
    const target = await handle.boundingBox();
    const x = target.x + target.width / 2, y = target.y + target.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 10 });
    await page.mouse.up();
  }
  const beforeMove = await checks.boundingBox();
  await drag(app.getByRole("button", { name: "Move panel · Recent checks" }), 6 * column, -4 * row);
  const afterMove = await checks.boundingBox();
  assert.ok(afterMove.x > beforeMove.x + 500 && afterMove.y < beforeMove.y - 210, "move changed both row and column");
  const beforeResize = await latency.boundingBox();
  await drag(app.getByRole("button", { name: "Resize panel · Latency" }), column, row);
  const afterResize = await latency.boundingBox();
  assert.ok(afterResize.width > beforeResize.width + 85 && afterResize.height >= beforeResize.height + 55, "resize changed both dimensions");
  assert.ok((await checks.boundingBox()).y >= afterResize.y + afterResize.height, "collision moved the other panel clear");
  await app.getByRole("button", { name: "Move panel · Recent checks" }).press("ArrowLeft");
  assert.ok((await checks.boundingBox()).x < afterMove.x - 80, "keyboard movement");
  assert.equal([...rows.values()].some(record => record.data.title === "New service report"), false, "canvas edits are drafts");
  await page.screenshot({ path: new URL("editing.png", artifacts).pathname });
  await app.getByRole("button", { name: "Save layout" }).click();
  await app.getByRole("main", { name: "New service report" }).waitFor();
  await app.locator(".is-line summary").click();
  await app.getByRole("cell", { name: "195", exact: true }).waitFor();

  const created = [...rows.values()].find(record => record.data.title === "New service report");
  assert.ok(created);
  assert.deepEqual(created.data.panels[1].tableLabels, [{ column: "Status", value: "Healthy", color: "purple" }]);
  assert.deepEqual(created.data.panels.map(panel => panel.position), [{ x: 0, y: 0, w: 7, h: 5 }, { x: 5, y: 5, w: 6, h: 4 }]);
  await page.reload();
  await app.getByRole("combobox", { name: "Switch dashboard" }).selectOption(created.id);
  await latency.waitFor();
  assert.ok(await checks.locator(".dash-table-label.is-purple").count());
  assert.equal(Math.round((await latency.boundingBox()).height), Math.round(afterResize.height));
  await app.getByRole("button", { name: "Edit layout" }).click();
  await app.getByRole("button", { name: "Resize panel · Latency" }).press("ArrowDown");
  await app.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(created.data.panels[0].position.h, 5);
  await app.getByRole("button", { name: "Edit layout" }).click();
  created.version++;
  await app.getByRole("button", { name: "Save layout" }).click();
  await app.getByRole("alert").getByText(/changed elsewhere/).waitFor();
  await app.getByRole("button", { name: "Cancel", exact: true }).click();
  await app.getByRole("button", { name: "Edit layout" }).click();
  await app.getByRole("button", { name: "Dashboard settings", exact: true }).click();
  await app.getByRole("button", { name: "Delete dashboard" }).click();
  await app.getByRole("button", { name: "Confirm deletion" }).click();
  await app.getByRole("main", { name: "Service overview" }).waitFor();
  assert.equal(rows.has(`dashboards/${created.id}`), false);
  assert.equal(rows.has("datasets/daily_traffic"), true);
  await page.close();

  const native = await launch({ viewport: { width: 1100, height: 800 } }, "/?native");
  await native.app.getByRole("button", { name: "Fullscreen · Traffic over time" }).click();
  await native.page.waitForFunction(() => !!document.querySelector("iframe").contentDocument.fullscreenElement);
  const nativeDialog = native.app.getByRole("dialog", { name: "Traffic over time" });
  await nativeDialog.locator("svg[role=img]").waitFor();
  await nativeDialog.getByRole("button", { name: "Exit fullscreen" }).click();
  await native.page.waitForFunction(() => !document.fullscreenElement);
  await nativeDialog.waitFor({ state: "hidden" });
  await native.page.close();

  const readOnly = await launch({ viewport: { width: 1100, height: 800 } }, "/?readonly#dashboard?id=quality");
  await readOnly.app.getByRole("main", { name: "Quality report" }).waitFor();
  assert.equal(await readOnly.app.getByRole("button", { name: "New dashboard" }).count(), 0);
  assert.equal(await readOnly.app.getByRole("button", { name: "Edit layout" }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS dashboards: six panel types, full-height tables, colored labels, fullscreen, snapshot reload, drag, resize, collision, keyboard, save, cancel, delete, deep links, permissions, responsive bilingual themes");
} finally {
  await browser.close();
  server.close();
}
