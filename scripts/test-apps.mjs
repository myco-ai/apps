// Keep inherited suites discoverable; stdin Hub fixtures have a separate job.
import { readdirSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(path.join(root, "artifacts"), { recursive: true });
const browser = name => /(?:\.ui-test|\.browser|personality-ui\.test|design-studio\.test|podcast-feed\.test)\.mjs$/.test(name);
const mode = process.argv[2] || "unit";
const shard = Number(process.env.TEST_SHARD || 0), shards = Number(process.env.TEST_SHARDS || 1);
if (!Number.isInteger(shard) || !Number.isInteger(shards) || shards < 1 || shard < 0 || shard >= shards) throw Error("Invalid test shard");
const names = readdirSync(path.join(root, "templates")).sort().filter(name =>
  mode === "browser" ? browser(name) : name.endsWith(".test.mjs") && !browser(name),
).filter((name, index) => name === "localization.ui-test.mjs" || index % shards === shard);
for (const name of names) {
  console.log(`\n=== ${name} ===`);
  const run = spawnSync(process.execPath, [path.join(root, "templates", name)], {
    cwd: root, stdio: "inherit", timeout: 300_000, env: { ...process.env, LOCALIZATION_SHARD: String(shard), LOCALIZATION_SHARDS: String(shards) },
  });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status || 1);
}
if (!names.length) throw Error("No tests selected");
console.log(`PASS ${names.length} ${mode} suites (shard ${shard + 1}/${shards})`);
