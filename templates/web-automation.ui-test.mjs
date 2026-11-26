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

function bridge({ sample, withBrowser, outdated = false }) {
  const rows = new Map();
  window.rows = rows;
  const assertIdle = p => { if (p.running) throw Object.assign(new Error("In use"),{code:"busy"}); };
  const listeners = [];
  for (const [collection, list] of Object.entries(JSON.parse(sample))) for (const { id, ...data } of list) rows.set(collection + "/" + id, { collection, id, data, version: 1 });
  const browserCalls = [];
  window.browserCalls = browserCalls;
  window.cancelProfileDeletion = true;
  window.profileFeatures = ["profile_delete"];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let recordQueue = [], recordDone = false, run = null, installed = outdated, approvals = [];
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
      status: async () => ({ protocol: 1, features: window.profileFeatures, version: installed ? (outdated ? "0.1.0" : "0.1.1") : "", installed, update_available: installed && outdated, supported: true, browsers: ["chrome"], machine: "Studio Mac", profiles: installed ? profiles.map(profile => ({ ...profile })) : [] }),
      // Like the App, install() answers without profiles; the page must re-read status.
      install: async () => { browserCalls.push(["install"]); installed = true; outdated = false; return { ...(await window.myco.browser.status()), profiles: [] }; },
      profiles: {
        create: async name => { const profile = { id: "pf_" + profiles.length, name, running: false, agents: false }; profiles.push(profile); return profile; },
        open: async () => true,
        remove: async id => {
          browserCalls.push(["remove",id]);
          if (window.cancelProfileDeletion) throw Object.assign(new Error("Declined"),{code:"cancelled"});
          const i=profiles.findIndex(p=>p.id===id);
          assertIdle(profiles[i]); profiles.splice(i,1); return true;
        },
        configure: async (id, settings) => {
          browserCalls.push(["configure", id, JSON.parse(JSON.stringify(settings))]);
          const profile = profiles.find(item => item.id === id);
          const { password, ...proxy } = settings.proxy || {};
          // Like the component: an omitted password is kept only for the same server and username.
          const before = profile.settings?.proxy;
          const keep = password === undefined && before && before.server === proxy.server && before.username === proxy.username && before.has_password;
          profile.settings = { ...settings, proxy: settings.proxy ? { ...proxy, has_password: Boolean(password) || Boolean(keep) } : null };
          return { ...profile };
        },
        allowAgents: async (id, agents) => { browserCalls.push(["allow", id, agents]); const profile = profiles.find(item => item.id === id); profile.agents = agents; return { ...profile }; },
      },
      record: {
        start: async options => { browserCalls.push(["record", options]); recordDone = false;
          recordQueue = [{ id: "r1", type: "click", target: { locators: [{ kind: "role", role: "button", name: "Sign in" }] } },
            { id: "r2", type: "type", sensitive: true, value: "${password}", target: { locators: [{ kind: "label", value: "Password" }] } }];
          return { id: "rec1" }; },
        events: async (id, after) => { await wait(150);
          if (id === "rec_panel") { const p = window.panel; const steps = p.steps.splice(0), removed = p.removed.splice(0);
            if (p.done && !steps.length && !removed.length) p.active = [];
            return { steps, removed, next: after + steps.length, done: p.done && !steps.length && !removed.length }; } if (recordQueue.length) { const steps = recordQueue; recordQueue = []; return { steps, next: after + steps.length, done: false }; } return { steps: [], next: after, done: recordDone }; },
        stop: async () => { recordDone = true; return true; },
        // Recordings started from the browser's own panel (window.panel drives them).
        active: async () => (window.panel?.active || []).map(item => ({ ...item })),
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
      approvals: {
        list: async () => approvals.map(item => ({ ...item })),
        request: async options => { browserCalls.push(["approve", options.script_id, options.version, options.profile, options.script.name]);
          const item = { script_id: options.script_id, version: options.version, profile: "发帖号", digest: "a1b2c3d4e5f6a7b8", approved_at: "2026-11-24T10:00:00Z", name: options.script.name };
          approvals.push(item); return item; },
        revoke: async (id, version) => { browserCalls.push(["revoke", id, version]); approvals = approvals.filter(item => !(item.script_id === id && item.version === version)); return true; },
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
  // Per-profile browser settings: proxy, UA, language and allowlisted launch arguments.
  await profiles.getByRole("button", { name: "Browser settings for “发帖号”" }).click();
  const profileSettings = live.getByRole("dialog", { name: "Browser settings for “发帖号”" });
  await profileSettings.getByRole("tab", { name: "SOCKS5" }).click();
  await profileSettings.getByLabel("Address").fill("proxy.example.com");
  await profileSettings.getByText("Use host:port, for example 127.0.0.1:7890").waitFor();
  assert(await profileSettings.getByRole("button", { name: "Save", exact: true }).isDisabled());
  await profileSettings.getByLabel("Address").fill("proxy.example.com:1080");
  await profileSettings.getByLabel("Username (optional)").fill("alice");
  await profileSettings.getByLabel("Password (optional)").fill("s3cret");
  await profileSettings.getByLabel("Bypass the proxy for").fill("localhost, *.internal.test");
  await profileSettings.getByLabel("One per line").fill("--start-maximized\n--remote-debugging-port=9222");
  await profileSettings.getByText("Not supported: --remote-debugging-port=9222").waitFor();
  await profileSettings.getByLabel("One per line").fill("--start-maximized\n--window-size=1440,900");
  await profileSettings.getByLabel("Language").fill("zh-CN");
  await profileSettings.getByRole("button", { name: "Save", exact: true }).click();
  await profiles.getByText("Proxy proxy.example.com:1080").waitFor();
  const configured = await live.evaluate(() => window.browserCalls.find(call => call[0] === "configure"));
  assert.deepEqual(configured, ["configure", "pf_post", { proxy: { server: "socks5://proxy.example.com:1080", username: "alice", bypass: ["localhost", "*.internal.test"], password: "s3cret" },
    user_agent: "", lang: "zh-CN", args: ["--start-maximized", "--window-size=1440,900"] }]);
  assert(!(await live.evaluate(() => JSON.stringify([...window.rows.values()]))).includes("s3cret"), "the proxy password never reaches page data");
  // Reopening keeps the saved password unless it is replaced or cleared.
  await profiles.getByRole("button", { name: "Browser settings for “发帖号”" }).click();
  await profileSettings.getByText("Saved; leave empty to keep it").waitFor();
  assert.equal(await profileSettings.getByLabel("Password (optional)").inputValue(), "");
  await profileSettings.getByLabel("Language").fill("en-US");
  await profileSettings.getByRole("button", { name: "Save", exact: true }).click();
  await profiles.getByText("en-US").waitFor();
  const kept = await live.evaluate(() => window.browserCalls.filter(call => call[0] === "configure")[1][2].proxy);
  assert(!("password" in kept), "an untouched saved password is kept");
  // A different server never inherits the saved password.
  await profiles.getByRole("button", { name: "Browser settings for “发帖号”" }).click();
  await profileSettings.getByLabel("Address").fill("other.example.com:1080");
  await profileSettings.getByText("The proxy address or username changed, so the saved password is not carried over. Enter the password again.").waitFor();
  await profileSettings.getByRole("button", { name: "Save", exact: true }).click();
  await profiles.getByText("Proxy other.example.com:1080").waitFor();
  const moved = await live.evaluate(() => window.browserCalls.filter(call => call[0] === "configure")[2][2].proxy);
  assert.equal(moved.password, "", "a new server clears the saved password");
  await profiles.getByLabel("New profile name").fill("工作号");
  await profiles.getByRole("button", { name: "New", exact: true }).click();
  await profiles.getByText("工作号").waitFor();
  const remove = profiles.getByRole("button",{name:"Delete “工作号”",exact:true});
  await remove.click();
  await live.waitForFunction(()=>window.browserCalls.some(call=>call[0]==="remove"));
  await profiles.getByText("工作号").waitFor(); // Declined owner confirmation keeps it.
  await live.evaluate(()=>{window.cancelProfileDeletion=false;});
  await remove.click();
  await profiles.getByText("工作号",{exact:true}).waitFor({state:"hidden"});
  await live.evaluate(()=>{window.profileFeatures=[];});
  // A successful bridge operation refreshes the component status.
  await profiles.getByLabel("New profile name").fill("Legacy fixture");
  await profiles.getByRole("button",{name:"New",exact:true}).click();
  await profiles.getByText("Legacy fixture",{exact:true}).waitFor();
  await profiles.getByRole("button",{name:"Delete “发帖号”",exact:true}).waitFor({state:"hidden"});
  assert.equal(await profiles.getByRole("button",{name:/^Delete “/}).count(),0,"old components have no deletion control");

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
  assert.deepEqual(recorded.params, [{ name: "password", type: "secret", required: true }], "a recorded password becomes a secret parameter");
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
  // The owner approves the current version for agent runs, then withdraws it.
  await live.getByRole("tab", { name: "Editor" }).click();
  await live.getByRole("tab", { name: "Settings" }).click();
  const agentRuns = live.getByRole("region", { name: "Script settings" });
  await agentRuns.getByRole("button", { name: "Allow agents to run version 1" }).click();
  await agentRuns.getByText("Version 1 is approved for agents with “发帖号”").waitFor();
  await agentRuns.getByRole("button", { name: "Withdraw" }).click();
  await agentRuns.getByRole("button", { name: "Allow agents to run version 1" }).waitFor();
  const approvalCalls = await live.evaluate(() => window.browserCalls.filter(call => call[0] === "approve" || call[0] === "revoke"));
  assert.deepEqual(approvalCalls, [["approve", "scr_blog_post", 1, "pf_post", "博客发文章（填好等确认）"], ["revoke", "scr_blog_post", 1]]);
  // Dark theme and a phone width render without horizontal overflow.
  await live.emulateMedia({ colorScheme: "dark" });
  await live.setViewportSize({ width: 390, height: 780 });
  await live.getByRole("tab", { name: "Editor" }).click();
  const overflow = await live.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 0, "no horizontal scroll on a phone");
  await live.close();
  // A first protocol-1 host without approvals: the page works and offers no agent approval.
  const early = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  early.on("pageerror", error => errors.push(error.message));
  await early.addInitScript(bridge, { sample, withBrowser: true });
  await early.addInitScript(() => { delete window.myco.browser.approvals; });
  await early.addInitScript(() => { delete window.myco.browser.profiles.configure; });
  await early.goto(url);
  await early.getByRole("button", { name: "Install component" }).click();
  await early.getByRole("button", { name: "Profiles" }).click();
  await early.getByRole("dialog", { name: "Profiles" }).getByText("发帖号").waitFor();
  assert.equal(await early.getByRole("button", { name: /^Browser settings/ }).count(), 0, "no settings on Apps without configure");
  await early.getByRole("dialog", { name: "Profiles" }).getByRole("button", { name: "Done" }).click();
  await early.getByRole("tab", { name: "Settings" }).click();
  await early.getByRole("region", { name: "Script settings" }).getByLabel("Script name").waitFor();
  assert.equal(await early.getByText("Agent runs").count(), 0);
  await early.close();
  // A recording started from the browser's panel lands in a new script; deletions in the panel follow.
  const panel = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  panel.on("pageerror", error => errors.push(error.message));
  await panel.addInitScript(bridge, { sample, withBrowser: true, outdated: true });
  await panel.goto(url);
  await panel.getByText("Browser component update available").waitFor();
  const scriptsBefore = await panel.evaluate(() => [...window.rows.values()].filter(row => row.collection === "scripts").length);
  await panel.evaluate(() => { window.panel = { active: [{ id: "rec_panel", profile: "pf_post", url: "https://forum.example.com/", started_at: "2026-11-25T09:00:00+08:00", origin: "browser" }],
    steps: [{ id: "b1", type: "click", target: { locators: [{ kind: "role", role: "link", name: "New topic" }] } },
      { id: "b2", type: "type", value: "hello", target: { locators: [{ kind: "label", value: "Title" }] } }], removed: [], done: false }; });
  await panel.locator(".wa-node").filter({ hasText: "New topic" }).waitFor();
  await panel.getByRole("button", { name: "Stop recording" }).waitFor();
  const panelScript = () => panel.evaluate(() => [...window.rows.values()].find(row => row.collection === "scripts" && row.data.start_url === "https://forum.example.com/")?.data);
  assert.equal(await panel.evaluate(() => [...window.rows.values()].filter(row => row.collection === "scripts").length), scriptsBefore + 1, "a new script for the panel recording");
  assert.equal((await panelScript()).profile, "发帖号");
  await panel.evaluate(() => { window.panel.removed.push("b1"); window.panel.steps.push({ id: "b3", type: "click", target: { locators: [{ kind: "role", role: "button", name: "Publish" }] } }); });
  await panel.locator(".wa-node").filter({ hasText: "New topic" }).waitFor({ state: "detached" });
  await panel.locator(".wa-node").filter({ hasText: "Publish" }).waitFor();
  assert.deepEqual((await panelScript()).graph.edges, [["b2", "b3"]], "deleted steps leave a connected chain");
  await panel.evaluate(() => { window.panel.done = true; });
  await panel.getByRole("button", { name: "Record", exact: true }).waitFor();
  await panel.waitForTimeout(3000);
  assert.equal(await panel.evaluate(() => [...window.rows.values()].filter(row => row.collection === "scripts").length), scriptsBefore + 1, "a finished panel recording is not taken twice");
  await panel.close();
  // A failing status() on an App that has the bridge says why and can retry.
  const failing = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  failing.on("pageerror", error => errors.push(error.message));
  await failing.addInitScript(bridge, { sample, withBrowser: true, outdated: true });
  await failing.addInitScript(() => { const real = window.myco.browser.status; let fail = true;
    window.myco.browser.status = async () => { if (fail) { fail = false; throw { code: "browser_failed" }; } return real(); }; });
  await failing.goto(url);
  await failing.getByText("The browser component did not respond").waitFor();
  await failing.getByText("browser_failed").waitFor();
  assert.equal(await failing.getByText("need a newer myco App", { exact: false }).count(), 0, "a bridge failure is not reported as an old App");
  await failing.getByRole("button", { name: "Retry" }).click();
  await failing.getByText("Browser component update available").waitFor();
  await failing.close();
  // An older compatible component is installed: the page offers the App's release.
  const stale = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  stale.on("pageerror", error => errors.push(error.message));
  await stale.addInitScript(bridge, { sample, withBrowser: true, outdated: true });
  await stale.goto(url);
  await stale.getByText("Browser component update available").waitFor();
  assert(!(await stale.getByRole("button", { name: "Run", exact: true }).isDisabled()), "an older compatible component still runs");
  await stale.getByRole("button", { name: "Update component" }).click();
  await stale.getByText("Browser component update available").waitFor({ state: "detached" });
  assert.deepEqual(await stale.evaluate(() => window.browserCalls), [["install"]]);
  await stale.getByRole("button", { name: "Profiles" }).click();
  await stale.getByRole("dialog", { name: "Profiles" }).getByText("发帖号").waitFor();
  // A region screenshot shows its area, and an older component refuses to run it.
  await stale.evaluate(() => window.myco.data.put("scripts", { name: "Clip shot", start_url: "https://forum.example.com/", profile: "发帖号", params: [], on_error: "stop",
    graph: { nodes: [{ id: "c1", type: "screenshot", pos: [0, 0], clip: { x: 12, y: 34, width: 320, height: 180 } }], edges: [] } }, { id: "scr_clip" }));
  await stale.getByRole("dialog", { name: "Profiles" }).getByRole("button", { name: "Done" }).click();
  await stale.locator(".wa-switcher").click();
  await stale.getByRole("dialog", { name: "Scripts" }).getByText("Clip shot").click();
  await stale.locator(".wa-node").filter({ hasText: "Region 320×180" }).click();
  await stale.getByText("12, 34 · 320×180").waitFor();
  await stale.getByRole("button", { name: "Run", exact: true }).click();
  await stale.getByRole("dialog", { name: /Run “Clip shot”/ }).getByRole("button", { name: "Start run" }).click();
  await stale.getByText("This script has a region screenshot. Update the browser component first.").waitFor();
  assert(!(await stale.evaluate(() => window.browserCalls.some(call => call[0] === "run"))), "no run starts without screenshot_clip");
  // A profile whose old browser could not be verified explains what to do.
  await stale.evaluate(() => { window.myco.browser.record.start = async () => { throw { code: "profile_locked", reason: "leftover_unverified" }; }; });
  await stale.getByRole("button", { name: "Record", exact: true }).click();
  const locked = stale.getByRole("dialog", { name: "Record" });
  await locked.getByLabel("Open URL").fill("https://forum.example.com/");
  await locked.getByRole("button", { name: "Start recording" }).click();
  await stale.getByText("This profile's previous browser is still running. Close it and retry, or restart your computer.").waitFor();
  await stale.close();
  // The script library: read through the App's network bridge, checked, then copied into the page.
  const shelf = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  shelf.on("pageerror", error => errors.push(error.message));
  await shelf.addInitScript(bridge, { sample, withBrowser: true });
  const libScript = JSON.stringify({ id: "bw_hn", version: 1, name: "Hacker News top", start_url: "https://news.example/", params: [], on_error: "stop",
    graph: { nodes: [{ id: "n1", type: "navigate", url: "https://news.example/", pos: [0, 0] }, { id: "n2", type: "js", code: "return document.title;", into: "title", pos: [0, 128] }], edges: [["n1", "n2"]] } });
  const { createHash } = await import("node:crypto");
  const libIndex = JSON.stringify({ schema: 1, scripts: [
    { id: "bw_hn", version: 1, name: "Hacker News top", category: "tech", status: "verified", steps: 2, file: "scripts/tech/bw_hn.json", sha256: createHash("sha256").update(libScript).digest("hex") },
    { id: "bw_jobs", version: 1, name: "Job search", category: "jobs", status: "needs_input", requires_login: true, params: ["keyword"], steps: 3, file: "scripts/jobs/bw_jobs.json", sha256: "0".repeat(64) },
  ] });
  await shelf.addInitScript(({ libIndex, libScript }) => {
    window.netCalls = [];
    window.myco.features.push("net");
    window.myco.net = { fetch: async ({ url }) => { window.netCalls.push(url);
      const body = url.endsWith("/index.json") ? libIndex : url.endsWith("/bw_hn.json") ? libScript : null;
      return body === null ? { status: 404, status_text: "Not Found", url, headers: {}, body: "", encoding: "utf8" } : { status: 200, status_text: "OK", url, headers: {}, body, encoding: "utf8" }; } };
  }, { libIndex, libScript });
  await shelf.goto(url);
  await shelf.locator(".wa-switcher").click();
  await shelf.getByRole("dialog", { name: "Scripts" }).getByRole("button", { name: "Add from library" }).click();
  const library = shelf.getByRole("dialog", { name: "Script library" });
  await library.getByText("Hacker News top").waitFor();
  await library.getByText("Sign-in needed").waitFor();
  await library.getByRole("textbox", { name: "Search the library" }).fill("job");
  await library.getByText("Hacker News top").waitFor({ state: "detached" });
  await library.getByRole("textbox", { name: "Search the library" }).fill("");
  await library.locator("li").filter({ hasText: "Hacker News top" }).getByRole("button", { name: "Add", exact: true }).click();
  await shelf.getByText("Added “Hacker News top”").waitFor();
  const libStored = await shelf.evaluate(() => window.myco.data.list("scripts").then(result => result.records.find(row => row.data.library)?.data));
  assert.deepEqual([libStored.source, libStored.library, libStored.graph.nodes.length], ["library", { id: "bw_hn", version: 1 }, 2]);
  assert(await shelf.evaluate(() => window.netCalls.every(call => call.startsWith("https://raw.githubusercontent.com/myco-ai/browser-scripts/main/"))), "only the library's own address is read");
  await shelf.close();
  // Large extracted data: a table with downloads, a note about the cut, and the complete data kept as a page file.
  const bulk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  bulk.on("pageerror", error => errors.push(error.message));
  await bulk.addInitScript(bridge, { sample, withBrowser: true, outdated: true });
  await bulk.addInitScript(() => {
    window.fileCalls = [];
    window.myco.pageFiles = {
      put: async (collection, name, blob) => { window.fileCalls.push(["put", collection, name, (await blob.text()).length]); return { file_id: "paf_full", page: "pg", collection, name, size: blob.size, sha256: "", content_type: blob.type, state: "ready", created_at: "" }; },
      download: async file => { window.fileCalls.push(["download", file.file_id]); return true; },
    };
    window.myco.browser.runs.start = async () => ({ id: "bulk" });
    window.myco.browser.runs.get = async (_id, after) => ({ state: "succeeded", node: "n1", steps: [{ node: "n1", state: "ok", ms: 900 }], next: after + 1, error: "", error_node: "",
      output: { hot_list: JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ rank: i + 1, title: "Story " + (i + 1), url: "https://news.example/" + i }))), source: "news" } });
  });
  await bulk.goto(url);
  await bulk.evaluate(() => window.myco.data.put("scripts", { name: "Bulk list", start_url: "https://news.example/", profile: "发帖号", params: [], on_error: "stop",
    graph: { nodes: [{ id: "n1", type: "js", code: "return 1;", into: "hot_list", pos: [0, 0] }], edges: [] } }, { id: "scr_bulk" }));
  await bulk.locator(".wa-switcher").click();
  await bulk.getByRole("dialog", { name: "Scripts" }).getByText("Bulk list").click();
  await bulk.getByRole("button", { name: "Run", exact: true }).click();
  await bulk.getByRole("dialog", { name: /Run “Bulk list”/ }).getByRole("button", { name: "Start run" }).click();
  const card = bulk.locator(".wa-output-card").filter({ hasText: "hot_list" });
  await card.getByText("200 rows · 3 columns").waitFor();
  await card.locator(".wa-table td").getByText("Story 200", { exact: true }).waitFor();
  await bulk.getByText("The data was too large, so only part of it is kept here. Use “Download complete data” for all of it.").waitFor();
  await bulk.getByRole("button", { name: "Download complete data" }).click();
  const fileCalls = await bulk.evaluate(() => window.fileCalls);
  assert.deepEqual(fileCalls.map(call => call.slice(0, 3)), [["put", "runs", fileCalls[0][2]], ["download", "paf_full"]]);
  assert(/^run-run_/.test(fileCalls[0][2]) && fileCalls[0][3] > 10000, "the complete output is saved as a page file");
  const bulkRun = await bulk.evaluate(() => [...window.rows.values()].find(row => row.collection === "runs" && row.data.script_name === "Bulk list").data);
  assert.equal(bulkRun.output.hot_list.length, 200);
  assert.equal(bulkRun.output_file.file_id, "paf_full");
  await card.getByRole("button", { name: "CSV" }).waitFor();
  await bulk.close();
  assert.deepEqual(errors, []);
  console.log("PASS web automation UI: old-App editor, no native selects or checkboxes, script switcher, settings and step edits with drawn controls, locator order, issues, library click and drop, toolbar delete, branch ports, runs, draft adoption, component install and update, profile proxy/UA/argument settings, recordings from the browser panel with deletions, agent-run approval, hosts without approvals, profiles, recording, paused run approval, script library, extracted data tables and complete-data files, and narrow dark layout");
} finally {
  await browser.close();
  server.close();
}
