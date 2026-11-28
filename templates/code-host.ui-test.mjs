import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { hostPath } from "./test-paths.mjs";

const home = new URL("../dist/official/code-host/", import.meta.url);
const shots = new URL("../artifacts/code-host/", import.meta.url);
mkdirSync(shots, { recursive: true });
const bridge = readFileSync(hostPath("internal/console/pagebridge.js"), "utf8");
const calls = [];
let failList = false;
let filterCap = true;
let holdDetail;
const account = {
  id: "fixture-gh",
  provider: "github",
  host: "https://github.com",
  login: "demo",
  name: "Demo account",
  source: "token",
};
const item = {
  account: account.id,
  number: 17,
  repo: "acme/widget",
  kind: "pull",
  title: "Fix a real fixture",
  body: "## Description\n\n<iframe src='https://evil.example'></iframe>",
  url: "https://github.com/acme/widget/pull/17",
  state: "open",
  author: "demo",
  updated: "2026-11-27T15:00:00Z",
  labels: ["bug"],
  comments: 1,
  draft: false,
};
let accounts = [];
const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname === "/") {
    const fragment = (u.searchParams.get("route") || "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;");
    return res
      .setHeader("content-type", "text/html")
      .end(
        `<style>html,body,iframe{height:100%;width:100%;border:0;margin:0;display:block}</style><iframe src="/app/?myco_lang=${u.searchParams.get("lang") || "en"}${fragment}"></iframe><script>const prefs=${JSON.stringify({ language: u.searchParams.get("lang") || "en", theme: u.searchParams.get("theme") || "light" })};const supported=${u.searchParams.get("old") !== "1"};const f=document.querySelector('iframe');addEventListener('message',async e=>{if(e.source!==f.contentWindow||e.data?.myco!=='call')return;const{id,method,args}=e.data;const r=await fetch('/rpc',{method:'POST',body:JSON.stringify({method,args,supported,prefs})}).then(r=>r.json());e.source.postMessage({myco:'result',id,...r},location.origin);});</script>`,
      );
  }
  if (u.pathname === "/rpc") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const { method, args: a, supported, prefs } = JSON.parse(raw);
    calls.push({ method, args: a });
    let value = true,
      error,
      code;
    if (method === "ready")
      value = {
        page: {
          id: "pg_demo",
          name: "Code hosts",
          url: "https://workspace.example/pages/pg_demo",
        },
        me: { name: "demo" },
        isolation: supported,
        preferences: prefs,
      };
    else if (method === "os.list")
      value = {
        caps: supported
          ? [
              { name: "forge.accounts", available: true },
              { name: "forge.query", available: true },
              ...(filterCap
                ? [
                    { name: "forge.filters", available: true },
                    { name: "forge.history", available: true },
                  ]
                : []),
            ]
          : [],
      };
    else if (method === "os.call") {
      const p = a.args;
      if (a.name === "forge.history") {
        value = { version: 1 };
      } else if (a.name === "forge.filters") {
        value = {
          version: 1,
          providers: {
            github: [
              "author",
              "label",
              "updated_after",
              "draft",
              "sort",
              "merged",
            ],
            gitlab: [
              "author",
              "label",
              "updated_after",
              "draft",
              "sort",
              "merged",
            ],
            gitea: ["author_repo", "updated_after"],
          },
        };
      } else if (a.name === "forge.accounts") {
        if (p.action === "list") value = accounts;
        if (p.action === "discover")
          value = [
            { cli: "gh", installed: true },
            { cli: "glab", installed: false },
          ];
        if (p.action === "connect") {
          assert.equal(p.token, undefined, "app must never handle credentials");
          assert.equal(p.provider, "github");
          accounts = [account];
          value = account;
        }
        if (p.action === "remove") {
          assert.equal(p.id, account.id);
          accounts = [];
          value = true;
        }
      } else if (a.name === "forge.query") {
        assert.ok([account.id, "fixture-gh-2"].includes(p.account));
        if (p.action === "repos")
          value = {
            items: [
              {
                id: "repo" + p.page,
                name: p.page === 1 ? "acme/widget" : "acme/other",
                private: true,
              },
            ],
            page: p.page,
            has_more: p.page === 1,
          };
        if (p.action === "list") {
          if (failList) {
            error = "unauthorized";
            code = "no_credentials";
          } else
            value = {
              items: p.kind === "issue" ? [] : [item],
              page: p.page,
              has_more: p.page === 1,
            };
        }
        if (p.action === "detail") {
          if (holdDetail) await holdDetail;
          value = item;
        }
        if (p.action === "comments")
          value = {
            items: [
              {
                author: "reviewer",
                body: "<img src=x onerror=alert(1)>",
                at: "2026-11-27T15:00:00Z",
              },
            ],
            page: 1,
            has_more: false,
          };
        if (p.action === "branches")
          value = {
            items: [
              { name: "main", sha: "a".repeat(40) },
              { name: "feature/demo", sha: "b".repeat(40) },
            ],
            has_more: false,
            page: 1,
          };
        if (p.action === "commits")
          value = {
            items: [
              {
                sha: (p.ref ? "b" : "a").repeat(40),
                parents: ["c".repeat(40)],
                subject: p.ref ? "Feature commit" : "Repository commit",
                message: "Fictional history",
                author: "Demo",
                date: "2026-11-01T12:00:00Z",
                url: "https://github.com/acme/widget/commit/" + "a".repeat(40),
              },
            ],
            has_more: false,
            page: 1,
          };
        if (p.action === "files")
          value = {
            items:
              p.page === 1
                ? [
                    {
                      name: "src/main.ts",
                      status: "modified",
                      patch: "-old\n+new",
                    },
                    { name: "docs/guide.md", status: "added", patch: "+Guide" },
                  ]
                : [
                    {
                      name: "tests/main.test.ts",
                      status: "added",
                      patch: "+Test",
                    },
                  ],
            page: p.page,
            has_more: p.page === 1,
          };
      } else throw Error("Unexpected capability " + a.name);
    } else if (method.startsWith("data.") && method !== "data.watch")
      throw Error("Private data must not use shared records");
    return res
      .setHeader("content-type", "application/json")
      .end(JSON.stringify({ value, error, code }));
  }
  if (u.pathname === "/app/bridge.js")
    return res.setHeader("content-type", "text/javascript").end(bridge);
  if (u.pathname.startsWith("/app/")) {
    const name = u.pathname.slice(5) || "index.html";
    if (name.includes("..")) return res.writeHead(404).end();
    let data = readFileSync(new URL(name, home));
    if (name === "index.html")
      data = data
        .toString()
        .replace("<head>", '<head><script src="/app/bridge.js"></script>');
    return res
      .setHeader(
        "content-type",
        name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : "text/html",
      )
      .end(data);
  }
  res.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  args: ["--no-sandbox"],
  ...(process.env.UI_SMOKE_EXECUTABLE
    ? { executablePath: process.env.UI_SMOKE_EXECUTABLE }
    : {}),
});
const failures = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1320, height: 860 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto(origin);
  const app = page.frameLocator("iframe");
  await app.getByRole("button", { name: "Connect your first account" }).click();
  await app.getByRole("button", { name: "Access token", exact: true }).click();
  assert.equal(await app.locator("input[type=password]").count(), 0);
  await app
    .getByRole("button", { name: "Connect account", exact: true })
    .last()
    .click();
  await app.getByRole("button", { name: /Fix a real fixture/ }).waitFor();
  await page.setViewportSize({ width: 662, height: 720 });
  await app.locator(".account-row button").first().click();
  await app.getByRole("button", { name: /Fix a real fixture/ }).waitFor();
  const compactFrame = page.frames().find((f) => f.url().includes("/app/"));
  const firstTop = await compactFrame
    .locator(".item-row")
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(firstTop <= 220, `connected inbox starts too low: ${firstTop}`);
  assert.equal(
    await app.getByRole("button", { name: "Refresh", exact: true }).count(),
    1,
  );
  await app.getByRole("button", { name: "Refresh", exact: true }).click();
  await app.getByRole("button", { name: /Fix a real fixture/ }).waitFor();
  await app
    .getByRole("button", { name: "Connect account", exact: true })
    .click();
  await app.locator(".connect-dialog").waitFor();
  await app.locator(".connect-dialog button.icon").click();
  await page.setViewportSize({ width: 1320, height: 860 });
  await app.getByRole("button", { name: /Fix a real fixture/ }).click();
  await app.getByRole("heading", { name: "Description" }).waitFor();
  assert.equal(await app.locator(".markdown iframe").count(), 0);
  await app.getByRole("button", { name: "Discussion", exact: true }).click();
  await app
    .getByText("<img src=x onerror=alert(1)>", { exact: true })
    .waitFor();
  assert.equal(await app.locator(".comment img").count(), 0);
  await app.getByRole("button", { name: "Files", exact: true }).click();
  await app
    .locator(".diff-file strong")
    .filter({ hasText: "src/main.ts" })
    .waitFor();
  await app.getByRole("button", { name: "Collapse all", exact: true }).click();
  assert.equal(await app.locator(".diff-file[open]").count(), 0);
  await app
    .getByRole("combobox", { name: "Jump to file", exact: true })
    .selectOption("docs/guide.md");
  assert.equal(
    await app.locator(".diff-file[open] strong").textContent(),
    "docs/guide.md",
  );
  await app
    .getByRole("textbox", { name: "Filter changed files", exact: true })
    .fill("src/");
  assert.equal(await app.locator(".diff-file").count(), 1);
  await app
    .getByRole("button", { name: "Clear file search", exact: true })
    .click();
  await app.getByRole("button", { name: "Expand all", exact: true }).click();
  assert.equal(await app.locator(".diff-file[open]").count(), 2);
  await app
    .getByRole("button", { name: "Load more files", exact: true })
    .click();
  await app
    .locator(".diff-file strong")
    .filter({ hasText: "tests/main.test.ts" })
    .waitFor();
  assert.equal(
    await app.locator(".diff-file").count(),
    3,
    "file pagination must append",
  );
  const divider = app.getByRole("separator", { name: "Resize details" });
  const detailBefore = await app
    .locator(".detail")
    .evaluate((el) => el.getBoundingClientRect().width);
  const rect = await divider.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 100);
  await page.mouse.down();
  await page.mouse.move(rect.x - 120, rect.y + 100, { steps: 8 });
  await page.mouse.up();
  const detailAfter = await app
    .locator(".detail")
    .evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(
    detailAfter > detailBefore + 90,
    `drag did not resize ${detailBefore} -> ${detailAfter}`,
  );
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  const keyWidth = await app
    .locator(".detail")
    .evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(keyWidth < detailAfter);
  assert.ok(
    await app
      .locator(".filter-controls")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().right <=
          el.closest(".workspace").getBoundingClientRect().right,
      ),
    "resizing must not overflow the inbox filters",
  );
  await app.getByRole("button", { name: "Close details" }).click();
  const beforeRepo = calls.length;
  await app.getByRole("button", { name: "Repository", exact: true }).click();
  await app
    .getByRole("heading", { name: "Choose a repository", exact: true })
    .waitFor();
  assert.ok(
    !calls
      .slice(beforeRepo)
      .some(
        (c) =>
          c.method === "os.call" &&
          c.args.name === "forge.query" &&
          c.args.args.action === "list" &&
          c.args.args.scope === "repo" &&
          !c.args.args.repo,
      ),
    "unselected repository sent a list query",
  );
  await app
    .locator(".repository-options")
    .getByRole("button", { name: /acme\/widget/ })
    .waitFor();
  await app.getByRole("button", { name: "Load more repositories" }).click();
  await app
    .locator(".repository-options")
    .getByRole("button", { name: /acme\/other/ })
    .waitFor();
  assert.equal(
    await app.locator(".repository-options > button").count(),
    2,
    "more repositories should append, not replace",
  );
  await app
    .getByRole("textbox", { name: "Repository path", exact: true })
    .fill("acme/not-listed");
  await app
    .getByRole("button", { name: "Open repository", exact: true })
    .click();
  await app.getByRole("button", { name: /Fix a real fixture/ }).waitFor();
  assert.ok(
    calls.some(
      (c) =>
        c.method === "os.call" &&
        c.args.args.action === "list" &&
        c.args.args.repo === "acme/not-listed" &&
        c.args.args.scope === "repo",
    ),
  );
  await app.locator(".advanced-filters summary").click();
  await app
    .getByRole("textbox", { name: "Author", exact: true })
    .fill("reviewer");
  await app
    .getByRole("textbox", { name: "Label", exact: true })
    .fill("needs review");
  await app
    .getByLabel("Updated since (UTC)", { exact: true })
    .fill("2026-11-01");
  await app
    .getByRole("combobox", { name: "Draft", exact: true })
    .selectOption("exclude");
  await app
    .getByRole("combobox", { name: "Sort", exact: true })
    .selectOption("created_asc");
  await app.getByRole("button", { name: "Apply filters", exact: true }).click();
  await app.getByRole("button", { name: /Fix a real fixture/ }).waitFor();
  await app.getByRole("button", { name: "Next", exact: true }).click();
  await app.locator(".pagination span").filter({ hasText: "2" }).waitFor();
  const advanced = calls
    .filter(
      (c) =>
        c.method === "os.call" &&
        c.args.args.action === "list" &&
        c.args.args.page === 2 &&
        c.args.args.filters?.author === "reviewer",
    )
    .at(-1);
  assert.deepEqual(advanced.args.args.filters, {
    author: "reviewer",
    label: "needs review",
    updated_after: "2026-11-01",
    draft: "exclude",
    sort: "created_asc",
  });
  assert.equal(advanced.args.args.repo, "acme/not-listed");
  await app.getByRole("button", { name: "Clear filters", exact: true }).click();
  await app.locator(".advanced-filters summary").click();
  await app.getByRole("button", { name: "Commit graph", exact: true }).click();
  await app.getByRole("button", { name: /Repository commit/ }).waitFor();
  await app.getByRole("button", { name: /Repository commit/ }).click();
  await app
    .locator(".commit-detail")
    .getByText("Fictional history", { exact: true })
    .waitFor();
  assert.equal(await app.locator(".commit-lines .unloaded").count(), 1);
  await app
    .getByRole("combobox", { name: "Branch", exact: true })
    .selectOption("feature/demo");
  await app.getByRole("button", { name: /Feature commit/ }).waitFor();
  assert.ok(
    calls.some(
      (c) =>
        c.method === "os.call" &&
        c.args.args.action === "commits" &&
        c.args.args.ref === "feature/demo",
    ),
  );
  await app
    .getByRole("button", { name: "Close commit graph", exact: true })
    .click();
  await app.getByRole("button", { name: "Created by me", exact: true }).click();
  await app.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(() => true);
  await app
    .locator(".result-footer .pagination span")
    .filter({ hasText: "2" })
    .waitFor();
  failList = true;
  await app.getByRole("button", { name: "Refresh", exact: true }).click();
  await app.getByRole("alert").filter({ hasText: "Sign in" }).waitFor();
  failList = false;
  await app.getByRole("button", { name: "Manage accounts" }).click();
  await app.getByRole("button", { name: "Disconnect Demo account" }).click();
  await app
    .getByRole("alertdialog")
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await app
    .getByRole("button", { name: "Connect your first account" })
    .waitFor();
  accounts = [account];
  filterCap = false;
  await page.goto(origin);
  await app.getByRole("button", { name: /Fix a real fixture/ }).waitFor();
  await app.locator(".advanced-filters summary").click();
  await app
    .getByText(
      "Author, label, date, draft and sorting need a newer desktop App. Repository, scope, status and search work now.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await app.getByRole("textbox", { name: "Author", exact: true }).count(),
    0,
  );
  await app
    .getByRole("button", { name: "All repositories", exact: true })
    .click();
  await app
    .getByRole("heading", { name: "Choose a repository", exact: true })
    .waitFor();
  await app
    .locator(".repository-options")
    .getByRole("button", { name: /acme\/widget/ })
    .click();
  await app.getByRole("button", { name: /Fix a real fixture/ }).waitFor();
  const oldQuery = calls
    .filter((c) => c.method === "os.call" && c.args.args.action === "list")
    .at(-1).args.args;
  assert.equal(oldQuery.repo, "acme/widget");
  assert.equal(oldQuery.filters, undefined);
  const oldHistory = calls.length;
  await app.getByRole("button", { name: "Commit graph", exact: true }).click();
  await app
    .getByText(
      "Commit history needs a desktop App with repository history support. Update the desktop App to use it.",
      { exact: true },
    )
    .waitFor();
  assert.ok(
    !calls
      .slice(oldHistory)
      .some(
        (c) =>
          c.method === "os.call" &&
          ["branches", "commits"].includes(c.args.args.action),
      ),
  );
  await app
    .getByRole("button", { name: "Close commit graph", exact: true })
    .click();
  accounts = [];
  filterCap = true;
  for (const [lang, theme, width] of [
    ["zh", "light", 1320],
    ["zh", "dark", 1320],
    ["en", "light", 1320],
    ["en", "dark", 1320],
    ["en", "light", 390],
    ["zh", "dark", 760],
    ["zh", "dark", 662],
    ["en", "light", 662],
  ]) {
    await page.setViewportSize({ width, height: 860 });
    await page.goto(`${origin}/?lang=${lang}&theme=${theme}`);
    const zh = lang === "zh";
    await app
      .getByRole("button", { name: zh ? "查看示例" : "Explore an example" })
      .click();
    await app
      .getByRole("button", { name: zh ? /为新用户简化/ : /Simplify the first/ })
      .waitFor();
    if (width <= 800) {
      await app.locator(".account-row button").first().click();
    }
    const listFrame = page.frames().find((f) => f.url().includes("/app/"));
    const layout = await listFrame.evaluate(() => {
      const row = document.querySelector(".item-row");
      return {
        firstTop: row.getBoundingClientRect().top,
        titleFont: parseFloat(
          getComputedStyle(row.querySelector("strong")).fontSize,
        ),
        metaFont: parseFloat(getComputedStyle(row.querySelector("p")).fontSize),
        width: document.documentElement.scrollWidth,
      };
    });
    assert.ok(
      layout.titleFont >= 15,
      `small title at ${width}: ${layout.titleFont}`,
    );
    assert.ok(
      layout.metaFont >= 12,
      `small metadata at ${width}: ${layout.metaFont}`,
    );
    assert.ok(layout.width <= width + 1, `list overflow at ${width}`);
    if (width <= 800) {
      assert.ok(
        layout.firstTop <= (width <= 440 ? 290 : 260),
        `inbox pushed below compact controls at ${width}: ${layout.firstTop}`,
      );
      assert.equal(
        await app
          .getByRole("button", { name: zh ? "刷新" : "Refresh", exact: true })
          .count(),
        1,
      );
      await app
        .getByRole("button", { name: zh ? "刷新" : "Refresh", exact: true })
        .click();
      await app
        .getByRole("button", {
          name: zh ? /为新用户简化/ : /Simplify the first/,
        })
        .waitFor();
    }
    console.log(`LAYOUT ${lang}/${theme}/${width}`, JSON.stringify(layout));
    await page.screenshot({
      path: new URL(`inbox-${lang}-${theme}-${width}.png`, shots).pathname,
    });
    await app.locator(".advanced-filters summary").click();
    await app
      .getByRole("textbox", { name: zh ? "标签" : "Label", exact: true })
      .fill("enhancement");
    await app
      .getByRole("button", {
        name: zh ? "应用筛选" : "Apply filters",
        exact: true,
      })
      .click();
    await app
      .getByRole("button", { name: zh ? /为新用户简化/ : /Simplify the first/ })
      .waitFor();
    await page.screenshot({
      path: new URL(`filters-${lang}-${theme}-${width}.png`, shots).pathname,
    });
    await app.locator(".advanced-filters summary").click();
    if (width === 1320) {
      const graphBefore = calls.length;
      await app
        .getByRole("button", {
          name: zh ? "全部仓库" : "All repositories",
          exact: true,
        })
        .click();
      await app
        .locator(".repository-options")
        .getByRole("button", { name: /acme\/workbench/ })
        .click();
      await app
        .getByRole("button", {
          name: zh ? "提交图" : "Commit graph",
          exact: true,
        })
        .click();
      await app
        .getByRole("button", {
          name: zh ? /合并仓库筛选/ : /Merge repository filtering/,
        })
        .waitFor();
      await page.screenshot({
        path: new URL(`graph-${lang}-${theme}-${width}.png`, shots).pathname,
      });
      assert.ok(
        calls.slice(graphBefore).every((c) => c.method !== "os.call"),
        "demo graph accessed provider",
      );
      await app
        .getByRole("button", {
          name: zh ? "关闭提交图" : "Close commit graph",
          exact: true,
        })
        .click();
    }
    const before = calls.length;
    await app
      .getByRole("button", { name: zh ? /为新用户简化/ : /Simplify the first/ })
      .click();
    await app
      .getByRole("heading", {
        name: zh
          ? "为新用户简化首次连接流程"
          : "Simplify the first connection for new users",
        exact: true,
      })
      .waitFor();
    const frame = page.frames().find((f) => f.url().includes("/app/"));
    if (width === 662) {
      const bodyTop = await frame
        .locator(".detail-content")
        .evaluate((el) => el.getBoundingClientRect().top);
      assert.ok(
        bodyTop <= 190,
        `detail header pushes body too low: ${bodyTop}`,
      );
      console.log(`DETAIL ${lang}/${width}`, bodyTop);
    }
    assert.ok(
      await frame.evaluate(
        (w) => document.documentElement.scrollWidth <= w + 1,
        width,
      ),
      `overflow at ${width}`,
    );
    assert.ok(
      calls.slice(before).every((c) => c.method !== "os.call"),
      "example accessed provider",
    );
    await page.screenshot({
      path: new URL(`${lang}-${theme}-${width}.png`, shots).pathname,
    });
    await app
      .getByRole("button", { name: zh ? "文件" : "Files", exact: true })
      .click();
    await app.locator(".diff-file strong").first().waitFor();
    if (width === 1320) {
      const splitter = app.getByRole("separator", {
        name: zh ? "调整详情宽度" : "Resize details",
      });
      const bounds = await splitter.boundingBox();
      await page.mouse.move(bounds.x + 4, bounds.y + 180);
      await page.mouse.down();
      await page.mouse.move(bounds.x - 110, bounds.y + 180, { steps: 5 });
      await page.mouse.up();
    }
    assert.ok(
      await frame.evaluate(
        (w) => document.documentElement.scrollWidth <= w + 1,
        width,
      ),
      `files overflow at ${width}`,
    );
    await app
      .getByRole("button", {
        name: zh ? "全部折叠" : "Collapse all",
        exact: true,
      })
      .click();
    await app
      .getByRole("combobox", {
        name: zh ? "定位文件" : "Jump to file",
        exact: true,
      })
      .selectOption("src/inbox/filters.ts");
    await page.screenshot({
      path: new URL(`files-${lang}-${theme}-${width}.png`, shots).pathname,
    });
  }
  // A fresh URL opens the exact item, with skeletons while its private read is pending.
  const route =
    "#item?" + new URLSearchParams({ provider: "github", url: item.url });
  const filesRoute = route + "&tab=files";
  accounts = [account];
  let finishDetail;
  holdDetail = new Promise((resolve) => {
    finishDetail = resolve;
  });
  await page.setViewportSize({ width: 662, height: 720 });
  await page.goto(`${origin}/?route=${encodeURIComponent(route)}`);
  await app.locator(".detail .skeleton-detail").waitFor();
  await page.screenshot({
    path: new URL("detail-loading-en-light-662.png", shots).pathname,
  });
  finishDetail();
  holdDetail = null;
  await app.getByRole("heading", { name: "Description" }).waitFor();
  assert.ok(
    await app
      .locator(".detail .markdown")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 15),
  );
  await app.getByRole("button", { name: "Close details" }).click();
  await page.evaluate(
    (fragment) =>
      document
        .querySelector("iframe")
        .contentWindow.postMessage(
          { myco: "page-route", fragment },
          location.origin,
        ),
    filesRoute,
  );
  await app
    .locator(".diff-file strong")
    .filter({ hasText: "src/main.ts" })
    .waitFor();
  await app.getByRole("button", { name: "Copy link", exact: true }).click();
  const shared = await app.locator(".share-box input").inputValue();
  assert.ok(shared.startsWith("https://workspace.example/pages/pg_demo#item?"));
  assert.equal(
    new URLSearchParams(new URL(shared).hash.split("?")[1]).get("tab"),
    "files",
  );
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/rpc") &&
        response.request().postData()?.includes('"action":"files"'),
    ),
    page.evaluate(
      (fragment) =>
        document
          .querySelector("iframe")
          .contentWindow.postMessage(
            { myco: "page-route", fragment },
            location.origin,
          ),
      filesRoute,
    ),
  ]);
  await app
    .locator(".diff-file strong")
    .filter({ hasText: "src/main.ts" })
    .waitFor();
  await app.getByRole("button", { name: "Close details" }).click();
  assert.equal(await app.locator(".detail").count(), 0);
  // Multiple local identities require a deliberate account choice.
  accounts = [
    account,
    {
      ...account,
      id: "fixture-gh-2",
      login: "other-demo",
      name: "Other account",
    },
  ];
  await page.goto(`${origin}/?route=${encodeURIComponent(route)}`);
  await app.locator(".route-notice select").waitFor();
  assert.equal(await app.locator(".detail").count(), 0);
  await app.locator(".route-notice select").selectOption("fixture-gh-2");
  await app.getByRole("heading", { name: "Description" }).waitFor();
  assert.ok(
    calls.some(
      (c) =>
        c.method === "os.call" &&
        c.args.args.action === "detail" &&
        c.args.args.account === "fixture-gh-2",
    ),
  );
  // No matching local credential: keep the target visible and ask the person to connect.
  accounts = [];
  const beforeMissing = calls.length;
  await page.goto(`${origin}/?route=${encodeURIComponent(route)}`);
  await app
    .getByText("Connect an account for this server to open the item.", {
      exact: true,
    })
    .waitFor();
  assert.ok(
    !calls
      .slice(beforeMissing)
      .some((c) => c.method === "os.call" && c.args.args.action === "detail"),
  );
  await app
    .locator(".route-notice")
    .getByRole("button", { name: "Connect account", exact: true })
    .click();
  assert.equal(
    await app.getByLabel("Server", { exact: true }).inputValue(),
    "https://github.com",
  );
  await app.locator(".connect-dialog button.icon").click();
  await page.goto(
    `${origin}/?route=${encodeURIComponent("#item?provider=github&url=javascript%3Aalert(1)")}`,
  );
  await app
    .getByText("This item link is invalid. Check the provider and URL.", {
      exact: true,
    })
    .waitFor();
  await page.goto(`${origin}/?old=1`);
  await app.getByRole("button", { name: "Connect your first account" }).click();
  await app
    .getByText(/This needs a desktop App/)
    .first()
    .waitFor();
  assert.equal(
    await app.locator("input[type=password]").count(),
    0,
    "old unisolated host exposed credential input",
  );
  assert.deepEqual(failures, []);
  assert.ok(
    !calls.some((c) => ["data.put", "data.list"].includes(c.method)),
    "private data used shared records",
  );
  console.log(
    "PASS code-host: account/read/privacy, repository paths and pagination, server filters, file folding/jump/search, pointer and keyboard resizing, commit graph/branches, old host fallback, eight layouts and private PR deep links",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
