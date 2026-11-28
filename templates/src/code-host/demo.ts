import type { Account, Comment, FileDiff, Item, Repository } from "./client";
export function demoData(zh: boolean) {
  const accounts: Account[] = [
    {
      id: "demo-gh",
      provider: "github",
      host: "https://github.com",
      login: "alex-demo",
      name: zh ? "开源项目" : "Open source",
      source: "cli",
    },
    {
      id: "demo-gl",
      provider: "gitlab",
      host: "https://gitlab.example.com",
      login: "sam-demo",
      name: zh ? "团队协作" : "Team projects",
      source: "token",
    },
  ];
  const titles = zh
    ? [
        "为新用户简化首次连接流程",
        "修复暗色模式下的列表对比度",
        "支持按标签筛选任务",
        "文档：补充自建服务器配置",
        "大型仓库首次加载较慢",
        "发布前检查失败时保留日志",
        "优化移动端仓库选择器",
      ]
    : [
        "Simplify the first connection for new users",
        "Fix list contrast in dark mode",
        "Filter work items by label",
        "Docs: configure a self-hosted server",
        "Slow initial load in large repositories",
        "Keep logs when release checks fail",
        "Improve the repository picker on mobile",
      ];
  const repos = [
    "acme/workbench",
    "acme/design-system",
    "acme/workbench",
    "acme/docs",
    "acme/workbench",
    "acme/pipeline",
    "acme/workbench",
  ];
  const items: Item[] = titles.map((title, i) => ({
    account: i === 3 || i === 5 ? "demo-gl" : "demo-gh",
    number: [128, 126, 124, 87, 119, 81, 114][i],
    repo: repos[i],
    project: "",
    kind: i === 4 ? "issue" : "pull",
    title,
    body: zh
      ? "## 这次改动\n\n把首次连接拆成三个清晰的步骤，让用户更快找到自己的仓库。\n\n- 展示当前账户和服务器\n- 明确只读权限与凭证保存位置\n- 保留已有筛选条件\n\n## 验证\n\n桌面与窄屏检查已完成。"
      : "## What changed\n\nA clearer first connection, with three simple steps to find your repositories.\n\n- Show the current account and server\n- Explain read access and credential storage\n- Preserve the selected filters\n\n## Validation\n\nDesktop and narrow layouts checked.",
    url: `https://${i === 3 || i === 5 ? "gitlab.example.com" : "github.com"}/${repos[i]}/${i === 3 || i === 5 ? "-/merge_requests" : i === 4 ? "issues" : "pull"}/${[128, 126, 124, 87, 119, 81, 114][i]}`,
    state: i === 2 ? "merged" : "open",
    author: ["alex-demo", "jordan-demo", "casey-demo"][i % 3],
    created: `2026-11-${String(20 - i).padStart(2, "0")}T12:00:00Z`,
    updated: `2026-11-27T${String(16 - i).padStart(2, "0")}:20:00Z`,
    labels: [
      ["enhancement"],
      ["bug", "design"],
      ["enhancement"],
      ["documentation"],
      ["performance"],
      ["ci"],
      ["design"],
    ][i],
    comments: [4, 2, 3, 1, 6, 2, 0][i],
    draft: i === 6,
    branch: "feat/first-connection",
    base: "main",
  }));
  const comments: Comment[] = [
    {
      author: "jordan-demo",
      body: zh
        ? "步骤清楚多了。窄屏上也能看到当前账户吗？"
        : "The steps are much clearer. Can we also show the current account on narrow screens?",
      at: "2026-11-27T15:10:00Z",
      url: "",
    },
    {
      author: "alex-demo",
      body: zh
        ? "已补上，也检查了深浅色和键盘导航。"
        : "Added, with checks for both themes and keyboard navigation.",
      at: "2026-11-27T15:30:00Z",
      url: "",
    },
  ];
  const files: FileDiff[] = [
    {
      name: "src/connect/AccountPicker.tsx",
      status: "modified",
      patch:
        "@@ -12,3 +12,6 @@\n export function AccountPicker() {\n-  return <AccountList />;\n+  return <section>\n+    <CurrentAccount />\n+    <AccountList />\n+  </section>;\n }",
    },
  ];
  files.push(
    {
      name: "src/inbox/filters.ts",
      status: "modified",
      patch:
        "@@ -1,2 +1,3 @@\n export function queryItems() {\n+  return applyRepositoryConditions();\n }",
    },
    {
      name: "docs/setup.md",
      status: "added",
      patch: zh
        ? "+## 首次连接\n+选择账户和仓库，再查看需要的 PR 与 Issue。"
        : "+## First connection\n+Choose an account and repository, then find the PRs and issues you need.",
    },
  );
  const repositories: Repository[] = [...new Set(repos)].map((name, i) => ({
    id: String(i),
    name,
    url: `https://${name === "acme/docs" || name === "acme/pipeline" ? "gitlab.example.com" : "github.com"}/${name}`,
    private: i > 1,
  }));
  return { accounts, items, comments, files, repositories };
}
