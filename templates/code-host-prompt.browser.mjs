import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { hostPath } from "./test-paths.mjs";

// Mount the actual trusted-host prompt in a separate origin from an untrusted
// app. The credential is typed only in the host and never sent via postMessage.
const fixture = mkdtempSync(path.join(tmpdir(), "code-host-prompt-"));
const component = hostPath("web/src/app/code-host-prompt.tsx");
const bundled = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{CodeHostPrompt}from ${JSON.stringify(component)};createRoot(document.getElementById('root')).render(<CodeHostPrompt prompt={{confirmation:'fixture',provider:'gitlab',host:'https://gitlab.example.com',source:'token',private_network:true}} answer={value=>{window.__answer=value;}}/>);`,
    resolveDir: hostPath("web"),
    loader: "tsx",
  },
  absWorkingDir: hostPath("web"),
  alias: { "@": hostPath("web/src") },
  bundle: true,
  write: false,
  format: "esm",
  define: { "process.env.NODE_ENV": '"production"' },
});
const script = bundled.outputFiles[0].text;
const app = createServer((req, res) =>
  res
    .setHeader("content-type", "text/html")
    .end(
      `<script>window.seen=[];addEventListener('message',e=>seen.push(e.data));</script><p>Untrusted app</p>`,
    ),
);
await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
const appOrigin = `http://127.0.0.1:${app.address().port}`;
const css = readFileSync(hostPath("web/src/app/app.css"), "utf8");
const host = createServer((req, res) =>
  req.url === "/style.css"
    ? res.setHeader("content-type", "text/css").end(css)
    : req.url === "/script.js"
      ? res.setHeader("content-type", "text/javascript").end(script)
      : res
          .setHeader("content-type", "text/html")
          .end(
            `<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><div id="root"></div><iframe src="${appOrigin}"></iframe><script type="module" src="/script.js"></script></html>`,
          ),
);
await new Promise((resolve) => host.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  args: ["--no-sandbox"],
  ...(process.env.UI_SMOKE_EXECUTABLE
    ? { executablePath: process.env.UI_SMOKE_EXECUTABLE }
    : {}),
});
try {
  const page = await browser.newPage();
  for (const [lang, theme, width] of [
    ["en", "light", 1200],
    ["en", "dark", 760],
    ["zh", "light", 760],
    ["zh", "dark", 1200],
  ]) {
    const zh = lang === "zh";
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`http://127.0.0.1:${host.address().port}/?lang=${lang}`);
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    const input = page.getByLabel(zh ? "访问令牌" : "Access token", {
      exact: true,
    });
    const bounds = await page.getByRole("dialog").boundingBox();
    assert.ok(
      bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1,
      "host prompt overflow",
    );
    await input.fill("fixture-native-secret");
    const submit = page.getByRole("button", {
      name: zh ? "连接" : "Connect",
      exact: true,
    });
    assert.equal(await submit.isDisabled(), true);
    await page
      .getByRole("checkbox", {
        name: zh ? "允许连接此内网服务器" : "Allow this private-network server",
      })
      .check();
    await submit.click();
    const result = await page.evaluate(() => window.__answer);
    assert.deepEqual(result, {
      token: "fixture-native-secret",
      allowPrivate: true,
    });
    assert.equal(await input.inputValue(), "");
    const frame = page.frames().find((f) => f.url().startsWith(appOrigin));
    assert.equal(await frame.locator("input").count(), 0);
    assert.deepEqual(await frame.evaluate(() => window.seen), []);
    assert.equal(
      await frame.evaluate(() => {
        try {
          return window.parent.document.body.innerText;
        } catch {
          return "blocked";
        }
      }),
      "blocked",
    );
  }
  console.log(
    "PASS actual host prompt: token confined to host origin, private-network confirmation required, input cleared",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => host.close(resolve));
  await new Promise((resolve) => app.close(resolve));
  rmSync(fixture, { recursive: true, force: true });
}
