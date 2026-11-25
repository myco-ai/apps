import { hostPath } from "./test-paths.mjs";
import { waitForPage } from "./test-poll.mjs";
// Exercise the built template, the real iframe bridge and the desktop file
// dispatcher. The server below supplies fixture data and project file routes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "noop.js"));
const { chromium } = require("playwright");
const { build } = await import("esbuild");
const source = hostPath("web/src/");
const { outputFiles } = await build({
  nodePaths: [hostPath("web/node_modules/")],
  stdin: { contents: 'export * from "./app/page-project-files"; export * from "./app/page-files";', resolveDir: source, loader: "ts" },
  alias: { "@": source }, bundle: true, format: "esm", write: false,
});
const bridge = readFileSync(hostPath("internal/console/pagebridge.js"), "utf8");
const root = new URL("../dist/official/media-kit/", import.meta.url);
const files = new Map();
const rows = new Map();
let lastDownload;
let downloaded;
const downloadOrder = [];
let failDownload;
let failUpload = false;
let backfillConflict = false;
let recordWrites = 0;
const lifecycle = [];
let projectFileBase = 91;
let modernQuota = false;
let pageFileBase = 991;
let requests = 0;
let projectUploads = 0;
const uploadKeys = new Map();
let fileCounter = 0;
const json = (res, data) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(data));
const host = `
  import { answerProjectFiles, projectFileScope, answerPageFiles } from "/dispatcher.js";
  const frame = document.querySelector("iframe");
  const params = new URLSearchParams(location.search);
  const page = { id: "pg_test", project: "pilot", template: { id: "tp_myco_media-kit" }, read_only: params.has("readonly"), attachments_version: params.has("legacy") || params.has("old-files") || params.has("old-hub") ? undefined : 1 };
  window.scopeTest = async () => {
    const cases = [
      [{ ...page, project: undefined }, "mk-pg_test-entry-valid000.png"],
      [{ ...page, template: { id: "tp_other" } }, "mk-pg_test-entry-valid000.png"],
      [page, "mk-pg_another-entry-valid000.png"],
      [page, "mk-pg_test-../valid000.png"],
      [page, "readme.md"],
    ];
    const denied = answerProjectFiles("hub", { ...page, read_only: true }, "projectFiles.put", {
      name: "mk-pg_test-entry-valid000.png", blob: new Blob(["bytes"], { type: "image/png" }),
    }).then(() => "accepted", error => error.code);
    const missingDeclaration = answerPageFiles("hub", { ...page, template: {...page.template, declares:true, permissions:[]} }, "pageFiles.download", {file:"paf_unavailable"}).then(()=>"accepted",error=>error.code);
    return Promise.all([denied, missingDeclaration, ...cases.map(async ([value, name]) => {
      try { await answerProjectFiles("hub", value, "projectFiles.get", { name }); }
      catch (error) { return error.code; }
      return "accepted";
    })]);
  };
  addEventListener("message", async e => {
    const { id, method, args, myco } = e.data || {};
    if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
    if (myco === "open-url") { window.openedURL = e.data.url; return; }
    if (myco !== "call") return;
    const reply = payload => e.source.postMessage({ myco: "result", id, ...payload }, e.origin);
    try {
      if (method === "ready") return reply({ value: {
        page, render: params.has("render") ? {instance:"render_fixture"} : undefined, me: { name: "tester", can_edit: !params.has("readonly") }, pageFiles: page.attachments_version === 1, projectFiles: !params.has("legacy") && Boolean(projectFileScope(page)),
        projectMedia: !params.has("legacy") && !params.has("old-files") && Boolean(projectFileScope(page)),
        preferences: { theme: params.has("dark") ? "dark" : "light", language: params.has("zh") ? "zh" : "en" },
      } });
      if (method === "data.watch") return reply({ value: true });
      if (method.startsWith("data.")) {
        const response = await fetch("/records", { method: "POST", body: JSON.stringify({ method, args }) });
        return reply(await response.json());
      }
      const value = await (method.startsWith("pageFiles.") ? answerPageFiles : answerProjectFiles)("hub", page, method, args);
      reply({ value });
    } catch (error) { reply({ error: error.message, code: error.code }); }
  });
  frame.src = "/template/";
`;
const server = createServer(async (req, res) => {
  const route = new URL(req.url, "http://test").pathname;
  if (route === "/") return res.writeHead(200, { "content-type": "text/html" }).end(
    '<style>html,body,iframe{height:100%;width:100%;margin:0;border:0;display:block}</style><iframe allow="clipboard-write"></iframe><script type="module" src="/host.js"></script>',
  );
  if (route === "/host.js" || route === "/dispatcher.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(route === "/host.js" ? host : outputFiles[0].text);
  if (route.startsWith("/template/")) {
    const name = route.slice(10) || "index.html";
    if (name === "bridge.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(bridge);
    try {
      const body = readFileSync(new URL(name, root));
      if (name === "index.html") return res.writeHead(200, {
        "content-type": "text/html",
        "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob: data:; media-src blob:",
      }).end(
        body.toString().replace("<head>", '<head><script src="./bridge.js"></script>'));
      const type = name.endsWith(".js") ? "text/javascript" : "text/css";
      return res.writeHead(200, { "content-type": type }).end(body);
    } catch { return res.writeHead(404).end(); }
  }
  if (route === "/app/hubs/hub/pages/pg_test/attachments") {
    const query = new URL(req.url, "http://test").searchParams;
    const usage = () => ({files_used:(modernQuota?0:pageFileBase)+files.size,files_max:1000,bytes_used:[...files.values()].reduce((sum,f)=>sum+f.bytes.length,0),bytes_max:2*1024**3,max_file_bytes:20*1024**2});
    if (req.method === "POST") {
      const chunks=[];for await (const chunk of req) chunks.push(chunk);
      const bytes=Buffer.concat(chunks),key=req.headers["idempotency-key"];
      if(failUpload)return res.writeHead(409,{"content-type":"application/json"}).end(JSON.stringify({error:"invalid_state",message:"Hub disk storage is low."}));
      const old=uploadKeys.get(key);
      if(old) { assert.ok(files.get(old).bytes.equals(bytes)); return json(res,files.get(old).metadata); }
      const id="paf_file"+(++fileCounter),name=query.get("name");
      const metadata={file_id:id,page:"pg_test",collection:query.get("collection"),name,size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),content_type:req.headers["content-type"],state:"pending",created_at:new Date().toISOString(),legacy_name:query.get("legacy_name")||undefined};
      files.set(id,{bytes,type:metadata.content_type,metadata});uploadKeys.set(key,id);
      return json(res,metadata);
    }
    if(query.has("name")) {
      const f=[...files.values()].find(f=>f.metadata?.name===query.get("name")||f.metadata?.legacy_name===query.get("name"));
      return f?json(res,f.metadata):res.writeHead(404,{"content-type":"application/json"}).end(JSON.stringify({error:"not_found",message:"No alias"}));
    }
    const all=[...files.values()].filter(f=>f.metadata).map(f=>f.metadata).sort((a,b)=>a.file_id.localeCompare(b.file_id)).filter(f=>f.file_id>(query.get("after")||""));
    const limit=Number(query.get("limit"))||100;
    return json(res,{attachments_version:1,attachments:all.slice(0,limit),usage:usage(),next:all.length>limit?all[limit-1].file_id:undefined});
  }
  const attachmentRoute=/^\/app\/hubs\/hub\/pages\/pg_test\/attachments\/(paf_[a-z0-9]+)(?:\/(content|save))?$/.exec(route);
  if(attachmentRoute){
    const [,id,action]=attachmentRoute; const f=files.get(id);
    if(action==="save") downloadOrder.push(id);
    if(!f||id===failDownload)return res.writeHead(404,{"content-type":"application/json"}).end(JSON.stringify({error:"not_found",message:"Missing original"}));
    if(action==="save"){lastDownload=id;downloaded=f.bytes;return json(res,{path:"/Downloads/"+f.metadata.name});}
    if(req.method==="DELETE"){
      lifecycle.push("file.remove "+id);
      if([...rows.values()].some(r=>r.data.attachment?.file_id===id||r.data.file===f.metadata.name))return res.writeHead(409,{"content-type":"application/json"}).end(JSON.stringify({error:"conflict",message:"Still referenced"}));
      files.delete(id);return res.writeHead(204).end();
    }
    return res.writeHead(200,{"content-type":f.type}).end(f.bytes);
  }
  if (route === "/app/hubs/hub/projects/pilot/storage") {
    if(!modernQuota)return res.writeHead(404,{"content-type":"application/json"}).end(JSON.stringify({error:"not_found",message:"old Hub"}));
    return json(res,{files_used:files.size,files_max:1000,bytes_used:[...files.values()].reduce((sum,f)=>sum+f.bytes.length,0),bytes_max:2*1024**3,docs_used:projectFileBase,docs_max:100});
  }
  if (route === "/app/hubs/hub/projects/pilot") {
    return json(res, { docs: Array.from({ length: projectFileBase + files.size }, () => ({})) });
  }
  const fileRoute = /^\/app\/hubs\/hub\/projects\/pilot\/files\/([^/]+)(\/save)?$/.exec(route);
  if (fileRoute) {
    requests++;
    const [, filename, save] = fileRoute;
    if (save) {
      downloadOrder.push(filename);
      const file = filename === failDownload ? undefined : files.get(filename);
      if (!file) return res.writeHead(404).end();
      lastDownload = filename;
      downloaded = file.bytes;
      return json(res, { path: "/Downloads/" + filename });
    }
    if (req.method === "PUT") {
      projectUploads++;
      assert.fail("Application originals must never upload to project files");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      files.set(filename, { bytes: Buffer.concat(chunks), type: req.headers["content-type"] });
      return json(res, { name: filename });
    }
    const file = files.get(filename);
    return file ? res.writeHead(200, { "content-type": file.type }).end(file.bytes) : res.writeHead(404).end();
  }
  if (route === "/records") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { method, args } = JSON.parse(Buffer.concat(chunks));
    if (method === "data.list") return json(res, { value: { records: [...rows.values()].filter(row => row.collection === args.collection), seq: 0 } });
    const key = args.collection + "/" + args.id;
    const version = rows.get(key)?.version || 0;
    if(method === "data.get") return rows.has(key) ? json(res,{value:rows.get(key)}) : json(res,{error:"Missing record",code:"not_found"});
    recordWrites++;
    lifecycle.push(method+" "+key);
    if(method === "data.put" && args.collection === "images" && args.data?.attachment && rows.get(key)?.data.file && !rows.get(key)?.data.attachment && backfillConflict) {
      backfillConflict=false;rows.get(key).data.caption="Agent edited during migration";rows.get(key).version++;
      return json(res,{error:"Record changed",code:"conflict"});
    }
    if (args.ifVersion !== version) return json(res, { error: "Record changed", code: "conflict" });
    if(method === "data.remove") { rows.delete(key);return json(res,{value:true}); }
    const row = { id: args.id, collection: args.collection, data: args.data, version: version + 1 };
    rows.set(key, row);
    return json(res, { value: row });
  }
  res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: process.env.UI_SMOKE_EXECUTABLE });
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(10000);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  const content = page.frameLocator("iframe");
  await content.getByText("Nearly full", { exact: false }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.scopeTest()), ["permission_denied", "permission_denied", "permission_denied", "permission_denied", "invalid_argument", "invalid_argument", "invalid_argument"]);
  assert.equal(requests, 0, "forbidden requests must stop at the desktop scope");

  await content.getByRole("button", { name: "New entry", exact: true }).click();
  await content.getByLabel("Title").fill("Usage reporting");
  await content.getByLabel("Labels").fill("App, CLI");
  await content.getByLabel("English tagline").fill("Track tokens by agent.");
  await content.getByLabel("English caption").fill("Share usage totals across the workspace.");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200; canvas.height = 120;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f06741"; ctx.fillRect(0, 0, 200, 120);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const sourcePNG = Buffer.from(png, "base64");
  // PNG decoders stop at IEND. The trailing bytes test the actual original
  // upload size and byte preservation without committing a huge fixture.
  const original = Buffer.concat([sourcePNG, Buffer.alloc(11 * 1024 * 1024)]);
  await content.locator('input[type="file"]').setInputFiles([
    { name: "usage.png", mimeType: "image/png", buffer: original },
    { name: "alt.png", mimeType: "image/png", buffer: sourcePNG },
  ]);
  await content.getByLabel("Media language").first().selectOption("en");
  await content.getByLabel("Media theme").first().selectOption("dark");
  await content.getByLabel("Media language").nth(1).selectOption("en");
  await content.getByLabel("Media theme").nth(1).selectOption("dark");
  await content.getByLabel("Visual description").first().fill("   ");
  await content.getByLabel("Visual description").nth(1).fill("Usage dashboard");
  await content.getByRole("button", { name: "Save", exact: true }).click();
  await content.getByRole("alert").getByText("Describe what is visible in each file.").waitFor();
  await content.getByLabel("Visual description").first().fill("Monthly activity overview");
  await content.getByLabel("Asset tags").first().fill("Rankings, Charts");
  await content.getByRole("button", { name: "Save", exact: true }).click();
  await content.getByText("Uploaded 2 files").waitFor();
  const [first, second] = [...rows.values()].filter(row => row.collection === "images");
  assert.equal(first.data.width, 200);
  assert.equal(first.data.height, 120);
  assert.equal(first.data.language, "en");
  assert.equal(first.data.file, "");
  assert.match(first.data.attachment.file_id, /^paf_/);
  assert.match(first.data.attachment.name, /^mk-pg_test-entry_[a-z0-9]+-[a-z0-9]{20}\.png$/);
  assert.ok(files.get(first.data.attachment.file_id).bytes.equals(original));
  assert.equal(first.data.kind, "screenshot");
  assert.equal(first.data.aspect, "landscape");
  assert.deepEqual(first.data.tags, ["Rankings", "Charts"]);
  // Exercise records made before the kind field existed.
  delete first.data.kind;
  await content.getByRole("button", { name: "Enlarge image" }).click();
  const viewer = content.getByRole("dialog", { name: "Image viewer" });
  await viewer.getByText("1 / 2", { exact: true }).waitFor();
  assert.equal(await viewer.locator("img").getAttribute("src"), await content.locator(".mk-expand-photo img").getAttribute("src"));
  await viewer.getByRole("button", { name: "100%" }).click();
  assert.equal(await viewer.locator(".mk-viewer-stage").getAttribute("data-actual"), "true");
  assert.equal(await viewer.locator("img").evaluate(img => img.width), 200);
  await page.keyboard.press("ArrowRight");
  await viewer.getByText("2 / 2", { exact: true }).waitFor();
  await page.keyboard.press("ArrowLeft");
  await viewer.getByText("1 / 2", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await viewer.waitFor({ state: "detached" });
  await content.getByRole("button", { name: "Next asset" }).click();
  await content.getByText("2 / 2", { exact: true }).waitFor();
  await content.getByRole("button", { name: "Copy text" }).last().click();
  await content.getByText("Copied", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Share usage totals across the workspace.");
  await content.getByRole("button", { name: "Copy image" }).click();
  await content.getByText("Image copied", { exact: true }).waitFor();
  assert.ok(await page.evaluate(async () => (await navigator.clipboard.read())[0].types.includes("image/png")));
  await content.getByRole("button", { name: "Download original" }).click();
  await content.getByText("Downloaded", { exact: true }).waitFor();
  assert.equal(lastDownload, second.data.attachment.file_id);
  await content.getByRole("button", { name: "Edit media details" }).click();
  await content.getByLabel("Media note").fill("Light layout");
  await content.getByLabel("Media language").selectOption("zh");
  await content.getByLabel("Media theme").selectOption("light");
  await content.locator("form").getByLabel("Platform").selectOption("mobile");
  await content.getByRole("button", { name: "Save", exact: true }).click();
  await content.getByText(/Light layout/).waitFor();
  await content.locator(".mk-image-badge").getByText("中 · Light", { exact: true }).waitFor();
  await content.getByLabel("Language", { exact: true }).selectOption("zh");
  await content.getByText("1 / 1", { exact: true }).waitFor();
  assert.ok(await content.getByRole("button", { name: "Next asset" }).isDisabled());
  await content.getByLabel("Theme", { exact: true }).selectOption("dark");
  await content.getByText("No entries match these filters.").waitFor();
  assert.ok(await content.getByRole("button", { name: "Download this set" }).isDisabled());
  await content.getByLabel("Theme", { exact: true }).selectOption("light");
  await content.getByRole("button", { name: "Download this set" }).click();
  await content.getByText("Images saved (1)", { exact: true }).waitFor();
  assert.equal(lastDownload, second.data.attachment.file_id);
  await content.getByLabel("Platform", { exact: true }).selectOption("app");
  await content.getByText("No entries match these filters.").waitFor();
  await content.getByLabel("Platform", { exact: true }).selectOption("mobile");
  await content.getByLabel("Orientation", { exact: true }).selectOption("landscape");
  await content.getByText("1 / 1", { exact: true }).waitFor();
  await content.getByLabel("Platform", { exact: true }).selectOption("");
  await content.getByLabel("Orientation", { exact: true }).selectOption("");
  await content.getByLabel("Language", { exact: true }).selectOption("");
  await content.getByLabel("Theme", { exact: true }).selectOption("");
  downloadOrder.length = 0;
  failDownload = first.data.attachment.file_id;
  await content.getByRole("button", { name: "Download this set" }).click();
  await content.getByText("Images saved (1). 1 could not be downloaded.").waitFor();
  assert.deepEqual(downloadOrder, [first.data.attachment.file_id, second.data.attachment.file_id]);
  failDownload = undefined;
  await content.getByRole("button", { name: "Edit or add files" }).click();
  await content.getByLabel("Status").selectOption("published");
  await content.getByLabel("Published to").fill("Community group");
  await content.getByRole("button", { name: "Save", exact: true }).click();
  await content.getByText("Community group", { exact: true }).waitFor();
  await content.getByRole("button", { name: "Back", exact: true }).click();
  await content.getByLabel("Search assets").fill("missing");
  await content.getByText("No entries match these filters.").waitFor();
  await content.getByLabel("Search assets").fill("rankings");
  await content.getByRole("button", { name: /Usage reporting/ }).waitFor();
  await content.getByLabel("Search assets").fill("activity overview");
  await content.getByRole("button", { name: /Usage reporting/ }).waitFor();
  await content.getByLabel("Search assets").fill("Track tokens");
  await content.getByLabel("Labels", { exact: true }).selectOption("CLI");
  await content.getByLabel("Status", { exact: true }).selectOption("published");
  await content.getByRole("button", { name: /Usage reporting/ }).waitFor();
  await content.getByLabel("Search assets").fill("");
  await content.getByLabel("Labels", { exact: true }).selectOption("");
  await content.getByLabel("Status", { exact: true }).selectOption("");
  await content.getByRole("button", { name: "New entry", exact: true }).click();
  await content.getByLabel("Title").fill("Launch video");
  await content.getByRole("button", { name: "Add video link" }).click();
  await content.getByLabel("Video URL").fill("javascript:alert(1)");
  await content.getByRole("button", { name: "Save", exact: true }).click();
  await content.getByRole("alert").getByText("Enter a valid HTTP or HTTPS URL.").waitFor();
  assert.ok(![...rows.values()].some(row => row.data.title === "Launch video"));
  await content.getByLabel("Video URL").fill("https://example.com/demo");
  await content.getByLabel("Link description").fill("Launch walkthrough");
  await content.getByRole("button", { name: "Add video link" }).click();
  await content.getByLabel("Video URL").last().fill("http://example.com/replay");
  await content.getByLabel("Link description").last().fill("Full replay");

  const makeMedia = (format, args) => execFileSync("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=12",
    "-t", "2", "-threads", "2", ...args, "-f", format, "pipe:1",
  ]);
  const mp4 = makeMedia("mp4", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov"]);
  // Give a valid MP4 a 15 MiB representation without a large fixture in Git.
  const padding = Buffer.alloc(15 * 1024 * 1024 - mp4.length);
  padding.writeUInt32BE(padding.length);
  padding.write("free", 4);
  const originalVideo = Buffer.concat([mp4, padding]);
  const gif = makeMedia("gif", []);
  const webm = makeMedia("webm", ["-c:v", "libvpx-vp9"]);
  await content.locator('input[type="file"]').setInputFiles([
    { name: "launch.mp4", mimeType: "video/mp4", buffer: originalVideo },
    { name: "launch.gif", mimeType: "image/gif", buffer: gif },
    { name: "launch.webm", mimeType: "video/webm", buffer: webm },
  ]);
  for (const field of await content.getByLabel("Visual description").all()) await field.fill("Animated test pattern");
  await content.getByRole("button", { name: "Save", exact: true }).click();
  await content.getByText("Uploaded 3 files").waitFor();
  const shot = content.locator("video");
  await shot.evaluate(async video => {
    await video.play();
    if (video.currentTime < 0.2) await new Promise(resolve => {
      const moved = () => { if (video.currentTime >= 0.2) { video.removeEventListener("timeupdate", moved); resolve(); } };
      video.addEventListener("timeupdate", moved);
    });
    video.pause();
  });
  assert.equal(await shot.evaluate(video => video.videoWidth), 320);
  assert.equal(await content.getByRole("button", { name: "Copy image" }).count(), 0);
  const launch = [...rows.values()].find(row => row.data.title === "Launch video");
  assert.deepEqual(launch.data.video_links, [
    { url: "https://example.com/demo", label: "Launch walkthrough" },
    { url: "http://example.com/replay", label: "Full replay" },
  ]);
  const launchFiles = [...rows.values()].filter(row => row.data.entry === launch.id);
  assert.deepEqual(launchFiles.map(row => [row.data.kind, row.data.bytes]), [["video", originalVideo.length], ["gif", gif.length], ["video", webm.length]]);
  assert.ok(launchFiles.every(row => row.data.preview.startsWith("data:image/jpeg;base64,")));
  await content.getByRole("button", { name: "Download original file" }).click();
  await content.getByText("Downloaded", { exact: true }).waitFor();
  assert.equal(lastDownload, launchFiles[0].data.attachment.file_id);
  assert.ok(downloaded.equals(originalVideo));
  const link = content.getByRole("link", { name: "Launch walkthrough" });
  assert.equal(await link.getAttribute("target"), "_blank");
  await link.click();
  await page.waitForFunction(() => window.openedURL === "https://example.com/demo");
  await content.getByRole("button", { name: "Copy link" }).first().click();
  // copyText confirms success only after the asynchronous clipboard write.
  await content.getByText("Copied", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "https://example.com/demo");

  await content.getByRole("button", { name: "Next asset" }).click();
  await content.locator('.mk-photo img[src^="blob:"]').evaluate(image => image.decode());
  assert.equal(await content.locator(".mk-photo video").count(), 0);
  assert.ok(await content.getByRole("button", { name: "Copy image" }).isEnabled());
  await content.getByRole("button", { name: "Next asset" }).click();
  await content.locator("video").evaluate(async video => { await video.play(); video.pause(); });
  await content.getByRole("button", { name: "Back", exact: true }).click();
  const card = content.getByRole("button", { name: /Launch video/ });
  assert.match(await card.locator("img").getAttribute("src"), /^data:image\/jpeg/);
  assert.ok(await card.locator(".mk-play-mark").isVisible());

  const usage = content.getByRole("button", { name: /Usage reporting/ });
  await content.getByLabel("Language", { exact: true }).selectOption("zh");
  await usage.locator(".mk-image-badge").getByText("中 · Light", { exact: true }).waitFor();
  assert.ok(await card.isVisible(), "entries without the chosen language keep their default cover");
  await content.getByLabel("Platform", { exact: true }).selectOption("mobile");
  await content.getByLabel("Orientation", { exact: true }).selectOption("landscape");
  assert.ok(await usage.isVisible());
  assert.equal(await card.count(), 0);
  await content.getByLabel("Platform", { exact: true }).selectOption("");
  await content.getByLabel("Orientation", { exact: true }).selectOption("");
  await usage.click();
  await content.getByLabel("Language", { exact: true }).selectOption("en");
  await content.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.reload();
  assert.equal(await content.getByLabel("Language", { exact: true }).inputValue(), "zh");
  await usage.click();
  assert.equal(await content.getByLabel("Language", { exact: true }).inputValue(), "en");
  assert.equal(await content.getByLabel("Theme", { exact: true }).inputValue(), "dark");
  await content.locator(".mk-image-badge").getByText("EN · Dark", { exact: true }).waitFor();

  // Agent-authored values pass the same URL checks before any link is rendered.
  launch.data.video_links.push({ url: "data:text/html,unsafe", label: "Unsafe link" });
  const shots = process.env.MEDIA_KIT_SHOTS;
  if (shots && process.env.MEDIA_KIT_DEMO) {
    projectFileBase = 20;
    for (const [item, name, description] of [
      [first, "en.png", "Member groups on the project sidebar, dark theme."],
      [second, "zh.png", "用量页，30 天柱状图和成员排行，浅色。"],
    ]) {
      const bytes = readFileSync(path.join(process.env.MEDIA_KIT_DEMO, name));
      const data = rows.get(item.collection + "/" + item.id).data;
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      files.set(data.attachment.file_id, { type: "image/png", bytes });
      Object.assign(data, { width, height, aspect: width > height ? "landscape" : width < height ? "portrait" : "square", platform: "app", caption: "", tags: [], description });
    }
  }
  if (shots) mkdirSync(shots, { recursive: true });
  for (const width of [400, 1200]) {
    for (const theme of ["light", "dark"]) {
      for (const locale of ["en", "zh"]) {
        const view = await browser.newPage({ viewport: { width, height: 800 }, colorScheme: theme, deviceScaleFactor: shots ? 2 : 1 });
        const query = [theme, locale].join("&");
        await view.goto(base + "?" + query);
        const frame = view.frameLocator("iframe");
        await frame.getByRole("button", { name: /Launch video/ }).click();
        assert.equal(await frame.getByRole("link", { name: "Unsafe link" }).count(), 0);
        assert.ok(await frame.getByRole("heading", { name: locale === "zh" ? "视频链接" : "Video links" }).isVisible());
        assert.equal(await frame.locator(".mk-app").evaluate(el => el.scrollWidth), width);
        const video = frame.locator("video");
        await video.evaluate(async media => { await media.play(); media.pause(); });
        await frame.getByRole("button", { name: locale === "zh" ? "返回" : "Back", exact: true }).click();
        await frame.getByRole("button", { name: /Usage reporting/ }).click();
        await frame.getByLabel(locale === "zh" ? "语言" : "Language", { exact: true }).selectOption(locale);
        await frame.locator(".mk-image-badge").waitFor();
        await frame.locator('.mk-photo img[src^="blob:"]').evaluate(image => image.decode());
        assert.equal(await frame.locator(".mk-app").evaluate(el => el.scrollWidth), width);
        await frame.getByRole("button", { name: locale === "zh" ? "放大查看" : "Enlarge image" }).click();
        const lightbox = frame.getByRole("dialog");
        await lightbox.getByText("1 / 1", { exact: true }).waitFor();
        assert.ok(await lightbox.getByRole("button", { name: locale === "zh" ? "下一个素材" : "Next asset" }).isDisabled());
        await lightbox.locator("img").evaluate(image => image.decode());
        if (shots) await view.screenshot({ path: path.join(shots, `media-kit-${width}-${theme}-${locale}.png`) });
        await view.close();
      }
    }
  }
  const old = await browser.newPage();
  await old.goto(base + "?old-files");
  const oldContent = old.frameLocator("iframe");
  await oldContent.getByRole("button", { name: /Launch video/ }).click();
  await oldContent.getByText("Update the desktop app to open and download this file.").waitFor();
  assert.ok(await oldContent.getByRole("button", { name: "Download original file" }).isDisabled());
  assert.ok(await oldContent.getByRole("link", { name: "Launch walkthrough" }).isVisible());
  await old.close();
  assert.deepEqual(errors, []);

  const narrow = await browser.newPage({ viewport: { width: 400, height: 780 }, colorScheme: "dark" });
  narrow.setDefaultTimeout(10000);
  await narrow.goto(base + "?legacy&dark");
  const fallback = narrow.frameLocator("iframe");
  await fallback.getByText(/View only. Update the workspace and desktop App/).waitFor();
  await fallback.getByRole("button", { name: /Usage reporting/ }).click();
  assert.ok(await fallback.getByRole("button", { name: "Download original" }).isDisabled());
  await fallback.getByRole("button", { name: "Enlarge image" }).click();
  assert.ok(await fallback.getByRole("dialog").getByRole("button", { name: "100%" }).isDisabled());
  await fallback.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  const dimensions = await fallback.locator(".mk-app").evaluate(el => [el.scrollWidth, el.clientWidth]);
  assert.equal(dimensions[0], dimensions[1]);
  await narrow.goto(base + "?readonly&dark");
  await fallback.getByText("View only", { exact: true }).waitFor();
  assert.equal(await fallback.getByRole("button", { name: "New entry" }).count(), 0);
  await fallback.getByRole("button", { name: /Usage reporting/ }).click();
  assert.equal(await fallback.getByRole("button", { name: "Edit or add files" }).count(), 0);
  assert.ok(await fallback.getByRole("button", { name: "Download original" }).isEnabled());
  // The new app on an old Hub remains read-only, while legacy originals
  // still read through the old project bridge. No upload fallback is allowed.
  const savedAttachment=first.data.attachment;
  first.data.file=savedAttachment.name;delete first.data.attachment;
  files.set(first.data.file,files.get(savedAttachment.file_id));
  const oldHub=await browser.newPage();await oldHub.goto(base+"?old-hub");
  const oldHubContent=oldHub.frameLocator("iframe");
  await oldHubContent.getByText(/View only. Update the workspace and desktop App/).waitFor();
  assert.equal(await oldHubContent.getByRole("button",{name:"New entry",exact:true}).count(),0);
  await oldHubContent.locator(".mk-app").evaluate(async()=>{
    try { await window.myco.projectFiles.put("mk-pg_test-entry-valid000.png",new Blob(["png"],{type:"image/png"}));throw new Error("old Hub upload accepted"); }
    catch(error){if(error.code!=="unsupported")throw error;}
  });
  await oldHubContent.getByRole("button",{name:/Usage reporting/}).click();
  await oldHubContent.locator('.mk-photo img[src^="blob:"]').evaluate(image=>image.decode());
  await oldHub.close();
  backfillConflict=true;
  const migrated=await browser.newPage();await migrated.goto(base);
  const migratedContent=migrated.frameLocator("iframe");
  await migratedContent.getByRole("button",{name:/Usage reporting/}).click();
  await migratedContent.locator('.mk-photo img[src^="blob:"]').evaluate(image=>image.decode());
  await migratedContent.getByText(/Agent edited during migration/).waitFor();
  assert.equal(backfillConflict,false,"legacy backfill did not use CAS");
  await migrated.reload();
  await migratedContent.locator(".mk-app").waitFor();
  const migratedFrame=migrated.frames().find(f=>f.url().includes("/template/"));
  await waitForPage(migratedFrame,async id=>(await window.myco.data.get("images",id)).data.attachment?.file_id,first.id);
  const rebound=rows.get(first.collection+"/"+first.id);
  assert.equal(rebound.data.caption,"Agent edited during migration");
  assert.equal(rebound.data.file,savedAttachment.name);
  assert.equal(rebound.data.attachment.file_id,savedAttachment.file_id);
  await migrated.close();
  const oldRebound=await browser.newPage();await oldRebound.goto(base+"?old-hub");
  const oldReboundContent=oldRebound.frameLocator("iframe");
  await oldReboundContent.getByRole("button",{name:/Usage reporting/}).click();
  await oldReboundContent.locator('.mk-photo img[src^="blob:"]').evaluate(image=>image.decode());
  assert.ok(await oldReboundContent.getByRole("button",{name:"Download original",exact:true}).isEnabled(),"backfilled legacy names must remain readable on older hosts");
  await oldRebound.close();
  const renderData={...rebound.data};delete rebound.data.attachment;rebound.version++;
  const writesBeforeRender=recordWrites;
  const render=await browser.newPage();await render.goto(base+"?render");
  const renderContent=render.frameLocator("iframe");
  await renderContent.getByText("View only",{exact:true}).waitFor();
  await renderContent.getByRole("button",{name:/Usage reporting/}).click();
  await renderContent.locator('.mk-photo img[src^="blob:"]').evaluate(image=>image.decode());
  assert.equal(recordWrites,writesBeforeRender,"renderers must not backfill records");
  assert.equal(rebound.data.attachment,undefined);
  await render.close();rebound.data=renderData;

  files.delete(first.data.file);first.data.file="";first.data.attachment=savedAttachment;
  assert.equal(projectUploads,0);
  modernQuota=true;
  const modern=await browser.newPage();await modern.goto(base);
  const modernContent=modern.frameLocator("iframe");
  await modernContent.locator(".mk-quota").filter({hasText:/\/1000/}).waitFor();
  await modernContent.locator(".mk-quota").filter({hasText:/Total size .*\/2\.00 GiB/}).waitFor();
  assert.ok(!(await modernContent.locator(".mk-quota").innerText()).includes("Nearly full"));
  await modern.close();
  // Reducing file limits never blocks edits that upload no originals.
  modernQuota=false;pageFileBase=1001;
  const full=await browser.newPage();await full.goto(base);
  const fullContent=full.frameLocator("iframe");
  await fullContent.getByRole("button",{name:/Usage reporting/}).click();
  await fullContent.getByRole("button",{name:"Edit or add files"}).click();
  await fullContent.getByLabel("Title").fill("Usage after quota reached");
  await fullContent.getByRole("button",{name:"Save",exact:true}).click();
  await fullContent.getByRole("heading",{name:"Usage after quota reached",exact:true}).waitFor();
  await full.close();
  modernQuota=true;failUpload=true;
  const disk=await browser.newPage();await disk.goto(base);
  const diskContent=disk.frameLocator("iframe");
  await diskContent.getByRole("button",{name:"New entry",exact:true}).click();
  await diskContent.getByLabel("Title").fill("Storage failure example");
  await diskContent.locator('input[type="file"]').setInputFiles({name:"fixture.png",mimeType:"image/png",buffer:sourcePNG});
  await diskContent.getByLabel("Visual description").fill("Synthetic color fixture");
  await diskContent.getByRole("button",{name:"Save",exact:true}).click();
  await diskContent.getByText("Upload stopped at file 1: Hub disk storage is low.",{exact:true}).waitFor();
  await disk.close();
  failUpload=false;
  const deletion=await browser.newPage();await deletion.goto(base);
  const deletionContent=deletion.frameLocator("iframe");
  await deletionContent.getByRole("button",{name:/Usage after quota reached/}).click();
  const firstID=first.id,firstFile=savedAttachment.file_id;
  deletion.once("dialog",dialog=>dialog.dismiss());
  await deletionContent.getByRole("button",{name:"Delete this asset"}).click();
  assert.ok(rows.has("images/"+firstID)&&files.has(firstFile),"cancelled deletion changed storage");
  deletion.once("dialog",dialog=>dialog.accept());
  await deletionContent.getByRole("button",{name:"Delete this asset"}).click();
  await deletionContent.getByText("Asset deleted",{exact:true}).waitFor();
  assert.ok(!rows.has("images/"+firstID)&&!files.has(firstFile));
  assert.ok(lifecycle.indexOf("data.remove images/"+firstID)<lifecycle.indexOf("file.remove "+firstFile),"file removed before its record reference");
  const remaining=rows.get("images/"+second.id);
  rows.set("images/shared",{id:"shared",collection:"images",version:1,data:{...remaining.data,entry:"another-entry"}});
  deletion.once("dialog",dialog=>dialog.accept());
  await deletionContent.getByRole("button",{name:"Delete this asset"}).click();
  await deletionContent.getByText("Asset deleted. Its original is still used by other records and was kept.",{exact:true}).waitFor();
  assert.ok(!rows.has("images/"+second.id)&&files.has(remaining.data.attachment.file_id));
  await deletion.close();
  console.log("Media Kit: page-owned files, old-Hub read-only mode and migrated aliases, 11 MiB PNG, 15 MiB MP4 playback and byte-for-byte download, WebM, GIF, validated links, legacy bridge, asset filters, ordered batch download and bilingual responsive views passed");
} finally {
  await browser.close();
  server.close();
}
