import type { Commit } from "./client";
/** Topological order inside the loaded subgraph. Provider timestamps can be skewed. */
export function commitGraph(input: Commit[]) {
  const commits = [...new Map(input.map((c) => [c.sha, c])).values()],
    bySHA = new Map(commits.map((c) => [c.sha, c]));
  const children = new Map(commits.map((c) => [c.sha, 0]));
  for (const c of commits)
    for (const p of new Set(c.parents))
      if (children.has(p)) children.set(p, children.get(p)! + 1);
  const pending = commits.filter((c) => children.get(c.sha) === 0),
    ordered: Commit[] = [];
  while (pending.length) {
    const c = pending.shift()!;
    ordered.push(c);
    for (const p of new Set(c.parents))
      if (bySHA.has(p)) {
        children.set(p, children.get(p)! - 1);
        if (children.get(p) === 0) pending.push(bySHA.get(p)!);
      }
  }
  if (ordered.length !== commits.length) throw Error("invalid_graph");
  const lanes: (string | null)[] = [],
    nodes = ordered.map((commit) => {
      let lane = lanes.indexOf(commit.sha);
      if (lane < 0) {
        lane = lanes.indexOf(null);
        if (lane < 0) lane = lanes.length;
      }
      lanes[lane] = null;
      commit.parents.forEach((sha, i) => {
        if (lanes.includes(sha)) return;
        let slot = i === 0 && lanes[lane] === null ? lane : lanes.indexOf(null);
        if (slot < 0) slot = lanes.length;
        lanes[slot] = sha;
      });
      return { commit, lane };
    });
  const index = new Map(
    nodes.map((n, i) => [n.commit.sha, { ...n, index: i }]),
  );
  const edges = nodes.flatMap((n, i) =>
    [...new Set(n.commit.parents)].map((sha) => {
      const parent = index.get(sha);
      return {
        from: i,
        to: parent?.index ?? null,
        fromLane: n.lane,
        toLane: parent?.lane ?? n.lane,
        sha,
      };
    }),
  );
  return { nodes, edges, lanes: Math.max(1, ...nodes.map((n) => n.lane + 1)) };
}
export function demoHistory(zh: boolean): Commit[] {
  const sha = (n: number) => n.toString(16).repeat(40);
  const rows = zh
    ? [
        "合并仓库筛选改进",
        "完善标签与作者条件",
        "调整窄屏文件导航",
        "补充提交图说明",
        "修复分页条件丢失",
        "合并阅读体验改进",
        "简化账户连接",
        "初始化工作台",
      ]
    : [
        "Merge repository filtering improvements",
        "Refine author and label conditions",
        "Improve narrow file navigation",
        "Document commit graph navigation",
        "Keep conditions across pages",
        "Merge reading improvements",
        "Simplify account connection",
        "Initialize workbench",
      ];
  return rows.map((subject, i) => ({
    sha: sha(8 - i),
    parents: (i === 0
      ? [7, 6]
      : i === 1
        ? [4]
        : i === 2
          ? [5]
          : i === 3
            ? [4]
            : i === 4
              ? [3]
              : i === 5
                ? [2]
                : i === 6
                  ? [1]
                  : []
    ).map(sha),
    subject,
    message:
      subject +
      "\n\n" +
      (zh
        ? "用于演示的提交记录，未读取真实仓库。"
        : "Fictional commit metadata for the example, with no live repository access."),
    author: i % 2 ? "Jordan Demo" : "Alex Demo",
    date: `2026-11-${String(27 - i).padStart(2, "0")}T12:00:00Z`,
    url: "",
  }));
}
