export type Node = { id: string; label: string; kind: string; file: string; location: string; group: string };
export type Edge = { source: string; target: string; relation: string; confidence: string; file: string; location: string };
export type Graph = { nodes: Node[]; links: Edge[] };
export type Step = { from: string; to: string; edge: Edge };
export const maxGraphSize = 16 * 1024 * 1024;
const maxNodes = 20000;
const maxLinks = 100000;

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 512) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const key = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? String(value) : text(value, 2048);

export function readGraph(input: unknown): Graph {
  const data = record(input);
  const rawLinks = data.links ?? data.edges;
  if (!Array.isArray(data.nodes) || !Array.isArray(rawLinks) || !data.nodes.length) throw new Error("invalid");
  if (data.nodes.length > maxNodes || rawLinks.length > maxLinks) throw new Error("limit");

  const nodes = new Map<string, Node>();
  for (const value of data.nodes) {
    const row = record(value);
    const id = key(row.id);
    if (!id || nodes.has(id)) throw new Error("invalid");
    nodes.set(id, { id, label: text(row.label ?? row.name) || id, kind: text(row.file_type ?? row.kind, 48),
      file: text(row.source_file ?? row.file, 2048), location: text(row.source_location ?? row.location, 120),
      group: key(row.community ?? row.group) });
  }

  const links: Edge[] = [];
  for (const value of rawLinks) {
    const row = record(value);
    const source = key(row.source), target = key(row.target);
    if (!nodes.has(source) || !nodes.has(target)) throw new Error("invalid");
    links.push({ source, target, relation: text(row.relation, 80) || "related",
      confidence: text(row.confidence, 64), file: text(row.source_file ?? row.file, 2048),
      location: text(row.source_location ?? row.location, 120) });
  }
  return { nodes: [...nodes.values()], links };
}

export function indexGraph(graph: Graph) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const neighbors = new Map(graph.nodes.map(node => [node.id, [] as Step[]]));
  for (const edge of graph.links) {
    neighbors.get(edge.source)!.push({ from: edge.source, to: edge.target, edge });
    if (edge.source !== edge.target) neighbors.get(edge.target)!.push({ from: edge.target, to: edge.source, edge });
  }
  return { nodes, neighbors };
}

export function shortestPath(neighbors: Map<string, Step[]>, from: string, to: string): Step[] | null {
  if (!neighbors.has(from) || !neighbors.has(to)) return null;
  const queue = [from], previous = new Map<string, Step>();
  const seen = new Set(queue);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (id === to) {
      const path: Step[] = [];
      let step = previous.get(id);
      while (step) {
        path.push(step);
        step = previous.get(step.from);
      }
      return path.reverse();
    }
    for (const step of neighbors.get(id)!) {
      if (seen.has(step.to)) continue;
      seen.add(step.to);
      previous.set(step.to, step);
      queue.push(step.to);
    }
  }
  return null;
}
