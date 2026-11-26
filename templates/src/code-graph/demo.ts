import { readGraph } from "./model";

export const demo = readGraph({
  nodes: [
    ["readme", "README.md", "document", "README.md", "Docs"],
    ["guide", "Queue guide", "document", "docs/queue.md", "Docs"],
    ["router", "router.ts", "code", "api/router.ts", "API"],
    ["health", "health.ts", "code", "api/health.ts", "API"],
    ["queue", "queue.ts", "code", "core/queue.ts", "Core"],
    ["events", "events.ts", "code", "core/events.ts", "Core"],
    ["worker", "worker.ts", "code", "core/worker.ts", "Core"],
    ["store", "store.ts", "code", "infra/store.ts", "Storage"],
    ["schema", "schema.sql", "code", "infra/schema.sql", "Storage"],
    ["test", "queue.test.ts", "code", "tests/queue.test.ts", "Tests"],
  ].map(([id, label, file_type, source_file, community]) => ({ id, label, file_type, source_file, community })),
  links: [
    ["readme", "guide", "links", "README.md", "L12"],
    ["guide", "queue", "links", "docs/queue.md", "L21"],
    ["router", "health", "imports", "api/router.ts", "L3"],
    ["router", "queue", "imports", "api/router.ts", "L6"],
    ["queue", "events", "imports", "core/queue.ts", "L2"],
    ["queue", "store", "imports", "core/queue.ts", "L4"],
    ["worker", "queue", "imports", "core/worker.ts", "L1"],
    ["worker", "events", "imports", "core/worker.ts", "L3"],
    ["store", "schema", "reads", "infra/store.ts", "L11"],
    ["test", "queue", "imports", "tests/queue.test.ts", "L1"],
  ].map(([source, target, relation, source_file, source_location]) => ({
    source, target, relation, source_file, source_location, confidence: "EXTRACTED",
  })),
});
