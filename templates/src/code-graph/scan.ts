import type { Edge, Graph, Node } from "./model";

const code = /\.(?:[cm]?[jt]sx?|go|py|rs|java|kt|cs|swift|sql)$/i;
const docs = /\.(?:mdx?|rst|txt)$/i;
const ignored = new Set(["node_modules", "vendor", "dist", "build", "target", "__pycache__", "graphify-out"]);
const maxFileSize = 256 * 1024;
const maxFolderBytes = 128 * 1024 * 1024;
const jsExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
type Source = Pick<File, "text" | "size" | "webkitRelativePath">;

function resolvePath(from: string, to: string) {
  const parts = from.split("/").slice(0, -1);
  for (const part of to.split("/")) {
    if (part === "..") {
      if (!parts.length) return "";
      parts.pop();
    } else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

export async function scanFolder(files: Source[]): Promise<Graph> {
  const sources = new Map<string, Source>();
  let moduleFile: Source | undefined;
  for (const file of files) {
    const parts = file.webkitRelativePath.split("/").slice(1);
    if (!parts.length || parts.some(part => part.startsWith(".") || ignored.has(part))) continue;
    const path = parts.join("/");
    if (path === "go.mod" && file.size <= 128 * 1024) moduleFile = file;
    if (!code.test(path) && !docs.test(path)) continue;
    sources.set(path, file);
  }
  if (!sources.size) throw new Error("empty");
  const readableBytes = [...sources.values()].reduce((total, file) => total + (file.size <= maxFileSize ? file.size : 0), 0);
  if (sources.size > 5000 || readableBytes > maxFolderBytes) throw new Error("folder_limit");
  const nodes: Node[] = [...sources.keys()].sort().map(path => ({
    id: path, label: path.split("/").pop()!, kind: docs.test(path) ? "document" : "code",
    file: path, location: "", group: path.includes("/") ? path.split("/")[0] : ".",
  }));
  const goModule = moduleFile ? /^\s*module\s+([^\s]+)\s*$/m.exec(await moduleFile.text())?.[1] : undefined;
  const goPackages = new Map<string, string>();
  for (const { id } of nodes) {
    if (!id.endsWith(".go") || id.endsWith("_test.go")) continue;
    const dir = id.split("/").slice(0, -1).join("/");
    if (!goPackages.has(dir)) goPackages.set(dir, id);
  }

  const links: Edge[] = [], seen = new Set<string>();
  for (const { id } of nodes) {
    const file = sources.get(id)!;
    if (file.size > maxFileSize) continue;
    const content = await file.text();
    function add(target: string, relation: string, index: number, confidence = "EXTRACTED") {
      if (!target || target === id || !sources.has(target)) return;
      const key = JSON.stringify([id, target, relation]);
      if (seen.has(key)) return;
      seen.add(key);
      if (links.length >= 100000) throw new Error("limit");
      links.push({ source: id, target, relation, confidence, file: id, location: `L${content.slice(0, index).split("\n").length}` });
    }

    if (/\.[cm]?[jt]sx?$/i.test(id)) {
      const imports = /(?:^\s*(?:import|export)\s+(?:[^;'"`]*?\s+from\s*)?|\b(?:import|require)\s*\(\s*)["'](\.{1,2}\/[^"'\r\n]+)["']/gm;
      for (const match of content.matchAll(imports)) {
        const path = resolvePath(id, match[1]);
        if (!path) continue;
        const stem = path.replace(/\.[cm]?jsx?$/, "");
        const candidates = [path, ...jsExtensions.map(ext => stem + ext), ...jsExtensions.map(ext => path + "/index" + ext)];
        add(candidates.find(candidate => sources.has(candidate)) || "", "imports", match.index! + match[0].indexOf(match[1]), "INFERRED");
      }
    } else if (docs.test(id)) {
      for (const match of content.matchAll(/\]\((?:<([^>\r\n]+)>|([^\s)]+))\)/g)) {
        const link = (match[1] ?? match[2]).split(/[?#]/)[0];
        if (!link || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(link)) continue;
        let path = link;
        try { path = decodeURIComponent(link); } catch { /* Keep literal path. */ }
        add(resolvePath(id, path), "links", match.index!);
      }
    } else if (goModule && id.endsWith(".go")) {
      for (const declaration of content.matchAll(/^import\s+(?:(\([^)]*\))|([^\r\n]+))/gm)) {
        const list = declaration[1] ?? declaration[2];
        for (const spec of list.matchAll(/"([^"\r\n]+)"/g)) {
          const path = spec[1];
          if (path !== goModule && !path.startsWith(goModule + "/")) continue;
          add(goPackages.get(path.slice(goModule.length + 1)) || "", "imports package", declaration.index! + declaration[0].indexOf(list) + spec.index!, "INFERRED");
        }
      }
    }
  }
  return { nodes, links };
}
