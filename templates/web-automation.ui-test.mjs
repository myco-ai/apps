// Web automation in a real browser against an in-memory bridge: editing with
// an old App (no browser component), then recording and a paused run with a
// stand-in for the proposed myco.browser contract.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "noop.js"));
const { chromium } = require("playwright");
const root = new URL("../dist/official/web-automation/", import.meta.url);
const sample = readFileSync(new URL("sample.json", root), "utf8");
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://test").pathname;
  try {
    const body = readFileSync(new URL(path === "/" ? "index.html" : path.slice(1), root));
    const type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
    res.writeHead(200, { "Content-Type": type, "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src blob: data:" });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.UI_SMOKE_EXECUTABLE });

function bridge({ sample, withBrowser }) {
  const rows = new Map();
  window.rows = rows;
  const listeners = [];
  for (const [collection, list] of Object.entries(JSON.parse(sample))) for (const { id, ...data } of list) rows.set(collection + "/" + id, { collection, id, data, version: 1 });
  const browserCalls = [];
  window.browserCalls = browserCalls;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let recordQueue = [], recordDone = false, run = null, installed = false;
  const profiles = [{ id: "pf_post", name: "发帖号", running: false, agents: false }];
  window.myco = {
    features: withBrowser ? ["preferences", "browser"] : ["preferences"], preferences: { theme: "light", language: "en" },
    ready: Promise.resolve({ me: { name: "tester" }, page: { id: "pg_auto" } }),
    data: {
      list: async collection => ({ records: [...rows.values()].filter(row => row.collection === collection).map(row => ({ ...row })), seq: 0 }),
      put: async (collection, data, { id, ifVersion } = {}) => {
        const key = collection + "/" + id, version = rows.get(key)?.version || 0;
        if (ifVersion !== undefined && ifVersion !== version) throw { code: "conflict" };
        const result = { id, collection, data: JSON.parse(JSON.stringify(data)), version: version + 1 };
        rows.set(key, result);
        for (const f of listeners) f({ op: "put", record: id, collection, data: result.data, version: result.version });
        return result;
      },
      remove: async (collection, id) => { rows.delete(collection + "/" + id); return true; },
      on: f => { listeners.push(f); return () => {}; },
    },
    browser: withBrowser ? {
      status: async () => ({ protocol: 1, version: installed ? "0.1.0" : "", installed, supported: true, browsers: ["chrome"], machine: "Studio Mac", profiles: installed ? profiles.map(profile => ({ ...profile })) : [] }),
      install: async () => { browserCalls.push(["install"]); installed = true; return window.myco.browser.status(); },
      profiles: {
        create: async name => { const profile = { id: "pf_" + profiles.length, name, running: false, agents: false }; profiles.push(profile); return profile; },
        open: async () => true,
        allowAgents: async (id, agents) => { browserCalls.push(["allow", id, agents]); const profile = profiles.find(item => item.id === id); profile.agents = agents; return { ...profile }; },
      },
      record: {
        start: async options => { browserCalls.push(["record", options]); recordDone = false;
          recordQueue = [{ id: "r1", type: "click", target: { locators: [{ kind: "role", role: "button", name: "Sign in" }] } },
            { id: "r2", type: "type", sensitive: true, value: "${password}", target: { locators: [{ kind: "label", value: "Password" }] } }];
          return { id: "rec1" }; },
        events: async (_id, after) => { await wait(150); if (recordQueue.length) { const steps = recordQueue; recordQueue = []; return { steps, next: after + steps.length, done: false }; } return { steps: [], next: after, done: recordDone }; },
        stop: async () => { recordDone = true; return true; },
      },
      runs: {
        start: async options => { browserCalls.push(["run", JSON.parse(JSON.stringify(options))]); run = { phase: 0, choice: "" }; return { id: "brun1" }; },
        get: async (_id, after) => {
          await wait(120);
          if (run.phase === 0) { run.phase = 1; return { state: "running", node: "n1", steps: [{ node: "n1", state: "ok", ms: 800 }], next: after + 1, output: {}, error: "", error_node: "" }; }
          if (run.phase === 1) { run.phase = 2; return { state: "paused", node: "n6", question: "标题和正文已填好，确认发布吗？", steps: [{ node: "n6", state: "running" }], next: after + 1, output: {}, error: "", error_node: "" }; }
          if (run.phase === 2 && !run.choice) return { state: "paused", node: "n6", question: "标题和正文已填好，确认发布吗？", steps: [], next: after, output: {}, error: "", error_node: "" };
          return { state: "succeeded", node: "n8", steps: [{ node: "n6", state: "ok", ms: 4000 }, { node: "n8", state: "ok", ms: 50 }], next: after + 2,
            output: { post_url: "https://blog.example.com/p/1" }, error: "", error_node: "" };
        },
        control: async (_id, action, choice) => { browserCalls.push(["control", action, choice]); if (action === "resume") run.choice = choice || "ok"; return true; },
      },
      locate: async () => ({ count: 1 }),
      pick: async () => ({ locators: [{ kind: "testid", value: "picked" }] }),
      snapshot: async () => new Blob(),
    } : undefined,
  };
}

try {
  // 1. An App without the browser component: an editor.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(bridge, { sample, withBrowser: false });
  await page.goto(url);
  await page.getByText("This computer cannot record or run yet").waitFor();
  assert(await page.getByRole("button", { name: "Run", exact: true }).isDisabled(), "no run without the component");
  assert(await page.getByRole("button", { name: "Record", exact: true }).isDisabled());
  const switcher = page.locator(".wa-switcher");
  await switcher.getByText("博客发文章（填好等确认）").waitFor();
  assert.equal(await page.locator("select, input[type=checkbox]").count(), 0, "no native select or checkbox");
  // The script switcher lists scripts with their last run.
  await switcher.click();
  const scriptsMenu = page.getByRole("dialog", { name: "Scripts" });
  await scriptsMenu.getByText("Succeeded").first().waitFor();
  await scriptsMenu.getByLabel("Search scripts").fill("抓取");
  assert.equal(await scriptsMenu.locator(".wa-script-list li").count(), 1);
  await page.keyboard.press("Escape");
  // Script settings: rename and add a parameter with an invalid name.
  await page.getByRole("tab", { name: "Settings" }).click();
  const settings = page.getByRole("region", { name: "Script settings" });
  await settings.getByLabel("Script name").fill("Blog post");
  await settings.getByRole("button", { name: "Parameter", exact: true }).click();
  await settings.getByLabel("Parameter name").last().fill("1bad");
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await settings.getByText("Parameter name “1bad” may only use letters").waitFor();
  let stored = await page.evaluate(() => window.rows.get("scripts/scr_blog_post").data);
  assert.equal(stored.name, "Blog post");
  assert.equal(stored.graph.nodes.length, 9, "settings keep the graph");
  await settings.getByRole("button", { name: "Remove parameter" }).last().click();
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => window.rows.get("scripts/scr_blog_post").data.params.length === 2);
  // A step: edit its title, mouse button (drawn select) and locator order.
  await page.locator(".wa-node").filter({ hasText: "点发布" }).click();
  const step = page.getByRole("region", { name: "Step details" });
  await step.getByLabel("Step name").fill("Publish");
  await step.getByRole("combobox", { name: "Clicks" }).click();
  await page.getByRole("option", { name: "Double-click" }).click();
  await step.getByRole("button", { name: "Move down" }).first().click();
  await step.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".wa-node").filter({ hasText: "Publish" }).waitFor();
  stored = await page.evaluate(() => window.rows.get("scripts/scr_blog_post").data.graph.nodes.find(node => node.id === "n7"));
  assert.equal(stored.title, "Publish");
  assert.equal(stored.count, 2);
  assert.deepEqual(stored.target.locators.map(locator => locator.kind), ["text", "role"], "locators reorder");
  assert.deepEqual(stored.pos, [512, 150], "editing a step keeps its place");
  // Removing every locator is reported on the card and in the panel.
  await step.getByRole("button", { name: "Remove locator" }).first().click();
  await step.getByRole("button", { name: "Remove locator" }).first().click();
  await step.getByRole("button", { name: "Save", exact: true }).click();
  await step.getByText("No element chosen yet.").waitFor();
  await page.locator(".wa-node").filter({ hasText: "Publish" }).locator(".wa-flag-issue").waitFor();
  // Add a block after the selected step from the library, set it, then delete it from the canvas toolbar.
  await step.getByRole("button", { name: "Back to blocks" }).click();
  await page.locator('.wa-node[data-selected="true"]').filter({ hasText: "Publish" }).waitFor();
  await page.getByLabel("Search blocks").fill("wait");
  await page.locator(".wa-block").filter({ hasText: "Wait" }).click();
  await step.getByRole("combobox", { name: "Wait for" }).click();
  await page.getByRole("option", { name: "Fixed time" }).click();
  await step.getByLabel("Milliseconds").fill("500");
  await step.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => { const data = window.rows.get("scripts/scr_blog_post").data;
    const wait = data.graph.nodes.find(node => node.type === "wait" && node.ms === 500); return wait && data.graph.edges.some(edge => edge[0] === "n7" && edge[1] === wait.id); });
  await page.locator(".wa-node-toolbar").getByRole("button", { name: "Delete step" }).click();
  await page.waitForFunction(() => !window.rows.get("scripts/scr_blog_post").data.graph.nodes.some(node => node.type === "wait" && node.ms === 500));
  // Dropping a block on the canvas adds it where it lands.
  await page.locator(".wa-block").filter({ hasText: "Wait" }).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 200, y: 520 } });
  await page.waitForFunction(() => window.rows.get("scripts/scr_blog_post").data.graph.nodes.filter(node => node.type === "wait").length === 2);
  // Branch ports are labelled; runs and drafts are visible; a draft becomes a script.
  await switcher.click();
  await page.getByRole("dialog", { name: "Scripts" }).getByText("抓取商品价格").click();
  await page.locator(".wa-port").getByText("Yes").waitFor();
  await page.getByRole("tab", { name: "Runs" }).click();
  await page.locator(".wa-run").getByText("Started by agent 写作助手", { exact: false }).waitFor();
  await page.locator(".wa-run").getByText("https://blog.example.com/p/20261124-weekly").waitFor();
  await page.locator(".wa-cards").getByText("抓取商品价格").click();
  await page.locator(".wa-run .wa-error-box").getByText("30 秒内没找到元素").waitFor();
  await page.getByRole("tab", { name: /Draft/ }).click();
  await page.getByRole("button", { name: "Save as script" }).click();
  await page.waitForFunction(() => [...window.rows.values()].some(row => row.collection === "scripts" && row.data.name === "查快递（agent 草稿）" && row.data.source === "agent"));
  assert.equal(await page.evaluate(() => window.rows.has("drafts/draft_sample")), false, "the draft is gone once adopted");
  // A new script starts empty, with its settings open.
  await switcher.click();
  await page.getByRole("button", { name: "New script" }).click();
  await page.getByText("No steps yet", { exact: true }).waitFor();
  await page.getByRole("region", { name: "Script settings" }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();

  // 2. With the browser component: record, then run through a confirm.
  const live = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  live.on("pageerror", error => errors.push(error.message));
  await live.addInitScript(bridge, { sample, withBrowser: true });
  await live.goto(url);
  await live.locator(".wa-switcher").getByText("博客发文章（填好等确认）").waitFor();
  // The component is offered, not installed: the page asks the App to install it.
  await live.getByText("Browser component not installed").waitFor();
  assert(await live.getByRole("button", { name: "Run", exact: true }).isDisabled());
  await live.getByRole("button", { name: "Install component" }).click();
  await live.getByRole("button", { name: "Profiles" }).waitFor();
  assert.equal(await live.locator(".wa-banner").count(), 0);
  await live.getByRole("button", { name: "Profiles" }).click();
  const profiles = live.getByRole("dialog", { name: "Profiles" });
  await profiles.getByRole("switch", { name: "Allow agents" }).click();
  await live.waitForFunction(() => document.querySelector('[role=switch]')?.getAttribute("aria-checked") === "true");
  await profiles.getByLabel("New profile name").fill("工作号");
  await profiles.getByRole("button", { name: "New", exact: true }).click();
  await profiles.getByText("工作号").waitFor();
  await profiles.getByRole("button", { name: "Done" }).click();
  // Record into a new script.
  await live.locator(".wa-switcher").click();
  await live.getByRole("button", { name: "New script" }).click();
  await live.getByRole("button", { name: "Record", exact: true }).click();
  const record = live.getByRole("dialog", { name: "Record" });
  await record.getByLabel("Open URL").fill("https://login.example.com/");
  await record.getByRole("button", { name: "Start recording" }).click();
  await live.locator(".wa-node").filter({ hasText: "Sign in" }).waitFor();
  await live.locator(".wa-node").filter({ hasText: "•••" }).waitFor();
  await live.getByRole("button", { name: "Stop recording" }).click();
  await live.getByRole("button", { name: "Record", exact: true }).waitFor();
  const recorded = await live.evaluate(() => [...window.rows.values()].find(row => row.collection === "scripts" && row.data.start_url === "https://login.example.com/").data);
  assert.deepEqual(recorded.graph.edges, [["r1", "r2"]]);
  assert.equal(recorded.profile, "发帖号");
  // Run the sample script; it pauses at the confirm and continues when approved.
  await live.locator(".wa-switcher").click();
  await live.getByRole("dialog", { name: "Scripts" }).getByText("博客发文章（填好等确认）").click();
  await live.getByRole("button", { name: "Run", exact: true }).click();
  const run = live.getByRole("dialog", { name: /Run “/ });
  await run.getByRole("button", { name: "Start run" }).click();
  await run.getByText("Enter a valid value.").waitFor();
  await run.getByLabel("title *").fill("Weekly notes");
  await run.getByRole("button", { name: "Start run" }).click();
  await live.locator(".wa-question").getByText("标题和正文已填好，确认发布吗？").waitFor();
  await live.getByRole("button", { name: "Approve and continue" }).click();
  await live.locator(".wa-run").getByText("https://blog.example.com/p/1").waitFor();
  await live.locator(".wa-run h2").getByText("博客发文章（填好等确认）").waitFor();
  const calls = await live.evaluate(() => window.browserCalls);
  assert.deepEqual(calls.find(call => call[0] === "allow"), ["allow", "pf_post", true]);
  assert.deepEqual(calls[0], ["install"], "install is the first component call");
  const started = calls.find(call => call[0] === "run")[1];
  assert.equal(started.params.title, "Weekly notes");
  assert.equal(started.profile, "pf_post");
  assert.deepEqual(calls.find(call => call[0] === "control"), ["control", "resume", "ok"]);
  const runRow = await live.evaluate(() => [...window.rows.values()].find(row => row.collection === "runs" && row.data.by === "tester").data);
  assert.equal(runRow.state, "succeeded");
  assert.equal(runRow.by_kind, "person");
  assert.equal(runRow.machine, "Studio Mac");
  assert(runRow.ended_at && runRow.steps.some(item => item.node === "n8"));
  assert.equal(runRow.output.post_url, "https://blog.example.com/p/1");
  assert.deepEqual(errors, []);
  // Dark theme and a phone width render without horizontal overflow.
  await live.emulateMedia({ colorScheme: "dark" });
  await live.setViewportSize({ width: 390, height: 780 });
  await live.getByRole("tab", { name: "Editor" }).click();
  const overflow = await live.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 0, "no horizontal scroll on a phone");
  await live.close();
  console.log("PASS web automation UI: old-App editor, no native selects or checkboxes, script switcher, settings and step edits with drawn controls, locator order, issues, library click and drop, toolbar delete, branch ports, runs, draft adoption, component install, profiles, recording, paused run approval and narrow dark layout");
} finally {
  await browser.close();
  server.close();
}
