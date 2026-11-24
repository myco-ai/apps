// Generate the old-Hub metadata fallback from app-owned sidecars.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../templates/", import.meta.url)), result = {};
for (const name of fs.readdirSync(path.join(root, "src")).sort()) {
  const dir = path.join(root, "src", name, "public");
  if (!fs.existsSync(path.join(dir, "myco.json"))) continue;
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "myco.json")));
  result[manifest.id] = JSON.parse(fs.readFileSync(path.join(dir, "locales.json")));
}
const output = path.join(root, "localization/app-locales.json");
const text = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (fs.readFileSync(output, "utf8") !== text) throw Error("Catalog is stale: run npm --prefix templates run locales");
} else fs.writeFileSync(output, text);
