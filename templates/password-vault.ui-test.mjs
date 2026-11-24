import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const require = createRequire(join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "noop.js"));
const { chromium } = require("playwright");
const app = "http://127.0.0.1:47631/";
const launcher = spawn(process.execPath, [fileURLToPath(new URL("../scripts/serve-password-vault.mjs", import.meta.url))]);
try {
  await Promise.race([
    once(launcher.stdout, "data"),
    once(launcher, "exit").then(([code]) => { throw new Error("Vault server exited: " + code); }),
  ]);
  const browser = await chromium.launch({ executablePath: process.env.UI_SMOKE_EXECUTABLE });
  try {
    const context = await browser.newContext();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await context.newPage();
    const master = "Fixture master password only!";
    const secret = "DEMO-not-a-real-account!";
    await page.goto(app + "?myco_lang=en");
    await page.getByLabel("Master password", { exact: true }).fill(master);
    await page.getByLabel("Confirm master password").fill(master);
    await page.getByRole("button", { name: "Create vault" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByLabel("Title").fill("Studio mail");
    await page.getByLabel("Username").fill("alex@example.invalid");
    await page.getByRole("button", { name: "Generate password" }).click();
    assert.equal((await page.getByLabel("Password", { exact: true }).inputValue()).length, 24);
    await page.getByLabel("Password", { exact: true }).fill(secret);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("heading", { name: "Studio mail" }).waitFor();
    assert.ok(!(await page.locator("body").innerText()).includes(secret));
    await page.getByRole("button", { name: "Copy password" }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), secret);
    await page.getByLabel("Search logins").fill("missing");
    await page.getByText("No matching logins.").waitFor();
    await page.getByLabel("Search logins").fill("alex@example");
    await page.getByRole("button", { name: /Studio mail/ }).waitFor();
    await page.getByLabel("Search logins").clear();
    const encrypted = await page.evaluate(() => new Promise(resolve => {
      const request = indexedDB.open("myco-password-vault");
      request.onsuccess = () => {
        const value = request.result.transaction("encrypted").objectStore("encrypted").get("vault");
        value.onsuccess = () => { resolve(value.result); request.result.close(); };
      };
    }));
    assert.deepEqual(Object.keys(encrypted).sort(), ["ciphertext", "iv", "salt", "version"]);
    assert.ok(!JSON.stringify(encrypted).includes(secret) && !JSON.stringify(encrypted).includes(master));
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export encrypted backup" }).click();
    const backup = await pendingDownload;
    const filename = await backup.path();
    assert.deepEqual(JSON.parse(readFileSync(filename, "utf8")), encrypted);

    const other = await context.newPage();
    await other.goto(app + "?myco_lang=en");
    await other.getByLabel("Master password", { exact: true }).fill(master);
    await other.getByRole("button", { name: "Unlock" }).click();
    await other.getByRole("button", { name: /Studio mail/ }).click();
    await other.getByRole("button", { name: "Edit", exact: true }).click();

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Title").fill("Studio email");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("heading", { name: "Studio email" }).waitFor();
    await other.getByLabel("Title").fill("Stale change");
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await other.getByText(/changed in another window/).waitFor();

    await page.getByRole("button", { name: "Lock", exact: true }).click();
    assert.equal(await page.getByText("Studio email").count(), 0);
    await page.getByLabel("Master password", { exact: true }).fill("An incorrect test password");
    await page.getByRole("button", { name: "Unlock" }).click();
    await page.getByRole("alert").getByText(/incorrect/).waitFor();
    await page.clock.install();
    await page.getByLabel("Master password", { exact: true }).fill(master);
    await page.getByRole("button", { name: "Unlock" }).click();
    await page.getByRole("button", { name: /Studio email/ }).click();
    await page.clock.fastForward(5 * 60 * 1000 + 2000);
    await page.getByRole("heading", { name: "Unlock vault" }).waitFor();

    const restored = await browser.newContext();
    const restorePage = await restored.newPage();
    await restorePage.goto(app + "?myco_lang=en");
    await restorePage.getByLabel("Import encrypted backup").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(encrypted)) });
    await restorePage.getByLabel("Master password", { exact: true }).fill(master);
    await restorePage.getByRole("button", { name: "Restore backup" }).click();
    await restorePage.getByRole("button", { name: /Studio mail/ }).click();
    await restorePage.getByRole("button", { name: "Show password" }).click();
    await restorePage.getByText(secret, { exact: true }).waitFor();
    restorePage.on("dialog", dialog => dialog.accept());
    await restorePage.getByRole("button", { name: "Delete", exact: true }).click();
    await restorePage.getByText("No logins yet").waitFor();
    await restored.close();

    const shots = process.env.PASSWORD_VAULT_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    for (const [locale, theme, width] of [["zh", "light", 1200], ["en", "dark", 400], ["en", "light", 1200], ["zh", "dark", 400]]) {
      const view = await browser.newContext({ viewport: { width, height: 760 }, colorScheme: theme, deviceScaleFactor: shots ? 2 : 1 });
      const screen = await view.newPage();
      await screen.goto(app + "?myco_lang=" + locale);
      await screen.locator("input[type=file]").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(encrypted)) });
      await screen.getByLabel(locale === "zh" ? "主密码" : "Master password", { exact: true }).fill(master);
      await screen.getByRole("button", { name: locale === "zh" ? "恢复备份" : "Restore backup" }).click();
      await screen.getByRole("button", { name: /Studio mail/ }).click();
      assert.equal(await screen.evaluate(() => document.documentElement.scrollWidth), width);
      if (shots) {
        await screen.setViewportSize({ width: 1200, height: 760 });
        const zh = locale === "zh";
        const records = zh
          ? [["设计工作台", "canvas.example.invalid"], ["知识库", "notes.example.invalid"], ["代码仓库", "code.example.invalid"]]
          : [["Design workspace", "canvas.example.invalid"], ["Knowledge base", "notes.example.invalid"], ["Code repository", "code.example.invalid"]];
        for (const [title, site] of records) {
          await screen.getByRole("button", { name: zh ? "新增" : "Add", exact: true }).click();
          await screen.getByLabel(zh ? "标题" : "Title").fill(title);
          await screen.getByLabel(zh ? "网站" : "Website").fill(site);
          await screen.getByLabel(zh ? "密码" : "Password", { exact: true }).fill(secret);
          await screen.getByRole("button", { name: zh ? "保存" : "Save", exact: true }).click();
          await screen.getByRole("heading", { name: title }).waitFor();
        }
        await screen.getByRole("button", { name: /Studio mail/ }).click();
        await screen.getByRole("button", { name: zh ? "编辑" : "Edit", exact: true }).click();
        const title = zh ? "工作室邮箱" : "Studio mail";
        await screen.getByLabel(zh ? "标题" : "Title").fill(title);
        await screen.getByLabel(zh ? "网站" : "Website").fill("mail.example.invalid");
        await screen.getByLabel(zh ? "备注" : "Note").fill(zh ? "用于接收工作室的项目通知与协作邀请。" : "Project notifications and invitations for the studio.");
        await screen.getByRole("button", { name: zh ? "保存" : "Save", exact: true }).click();
        await screen.getByRole("heading", { name: title }).waitFor();
        await screen.screenshot({ path: join(shots, `vault-${locale}-${theme}.png`) });
      }
      await view.close();
    }
    const headers = (await context.request.get(app)).headers();
    const untrusted = await context.newPage();
    await untrusted.route("http://127.0.0.1:47632/**", async route => {
      const response = await context.request.get(app + new URL(route.request().url()).pathname.slice(1));
      await route.fulfill({ response });
    });
    await untrusted.goto("http://127.0.0.1:47632/?myco_lang=en");
    await untrusted.getByRole("link", { name: "Open local vault" }).waitFor();
    assert.equal(await untrusted.locator("input").count(), 0);
    assert.ok(headers["content-security-policy"].includes("frame-ancestors 'none'"));
    assert.ok(headers["content-security-policy"].includes("connect-src 'none'"));
    assert.equal(headers["cross-origin-opener-policy"], "same-origin");
    console.log("Password Vault: create, hide/reveal/copy, encrypted storage and backup, restore, stale-write rejection, idle lock and bilingual layouts passed");
  } finally { await browser.close(); }
} finally { launcher.kill(); }
