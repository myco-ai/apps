import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { language } from "../_lib/i18n";
import type { Account } from "./client";
import {
  filterCount,
  supportsFilter,
  type Filters,
  type FilterSupport,
} from "./filters";
const tr = (en: string, zh: string) => (language() === "zh" ? zh : en);
export function FilterPanel({
  support,
  accounts,
  kind,
  repo,
  scope,
  value,
  onApply,
}: {
  support: FilterSupport | null;
  accounts: Account[];
  kind: string;
  repo: string;
  scope: string;
  value: Filters;
  onApply: (f: Filters) => void;
}) {
  const [draft, setDraft] = useState<Filters>(value);
  useEffect(() => setDraft(value), [value]);
  const has = (field: string) => supportsFilter(support, accounts, field);
  const author = has("author") || (!!repo && has("author_repo"));
  const field = (key: keyof Filters, v: string) =>
    setDraft((prev) => ({ ...prev, [key]: v }));
  const count = filterCount(value);
  return (
    <details className="advanced-filters">
      <summary>
        <SlidersHorizontal size={14} />
        {tr("More filters", "更多筛选")}
        {count > 0 && <span className="filter-count">{count}</span>}
      </summary>
      {!support ? (
        <p className="hint">
          {tr(
            "Author, label, date, draft and sorting need a newer desktop App. Repository, scope, status and search work now.",
            "作者、标签、日期、草稿与排序需要更新桌面 App；仓库、范围、状态和搜索现在可用。",
          )}
        </p>
      ) : (
        <form
          className="filter-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f: Filters = {};
            for (const [k, v] of Object.entries(draft)) {
              if (v?.trim()) f[k as keyof Filters] = v.trim();
            }
            onApply(f);
          }}
        >
          <label>
            {tr("Author", "作者")}
            <input
              aria-label={tr("Author", "作者")}
              placeholder={tr("Username", "用户名")}
              value={draft.author || ""}
              disabled={!author || (scope === "created" && !repo)}
              pattern="[a-zA-Z0-9_.\[\]\-]+"
              maxLength={100}
              onChange={(e) => field("author", e.target.value)}
            />
          </label>
          <label>
            {tr("Label", "标签")}
            <input
              aria-label={tr("Label", "标签")}
              placeholder={tr("One label name", "一个标签名称")}
              pattern="[^,]+"
              value={draft.label || ""}
              disabled={!has("label")}
              maxLength={100}
              onChange={(e) => field("label", e.target.value)}
            />
          </label>
          <label>
            {tr("Updated since (UTC)", "更新起始日期（UTC）")}
            <input
              aria-label={tr("Updated since (UTC)", "更新起始日期（UTC）")}
              type="date"
              value={draft.updated_after || ""}
              disabled={!has("updated_after")}
              onChange={(e) => field("updated_after", e.target.value)}
            />
          </label>
          {kind === "pull" && (
            <label>
              {tr("Draft", "草稿")}
              <select
                aria-label={tr("Draft", "草稿")}
                value={draft.draft || ""}
                disabled={!has("draft")}
                onChange={(e) => field("draft", e.target.value)}
              >
                <option value="">{tr("Any", "不限")}</option>
                <option value="only">{tr("Draft only", "仅草稿")}</option>
                <option value="exclude">
                  {tr("Ready for review", "排除草稿")}
                </option>
              </select>
            </label>
          )}
          <label>
            {tr("Sort", "排序")}
            <select
              aria-label={tr("Sort", "排序")}
              value={draft.sort || ""}
              disabled={!has("sort")}
              onChange={(e) => field("sort", e.target.value)}
            >
              <option value="">{tr("Recently updated", "最近更新")}</option>
              <option value="updated_asc">
                {tr("Least recently updated", "最早更新")}
              </option>
              <option value="created_desc">
                {tr("Newest created", "最新创建")}
              </option>
              <option value="created_asc">
                {tr("Oldest created", "最早创建")}
              </option>
            </select>
          </label>
          <p className="hint filter-note">
            {!has("label")
              ? tr(
                  "Some conditions are unavailable for the selected providers. Choose one account for its supported filters.",
                  "所选平台不支持部分条件，可切换到单个账户使用该平台的筛选。",
                )
              : tr(
                  "Conditions apply together on the provider before pagination. Choose a repository to filter by another author.",
                  "条件由平台组合筛选后再分页；选择仓库后可查询其他作者。",
                )}
          </p>
          <div className="filter-actions">
            <button
              type="button"
              onClick={() => {
                setDraft({});
                onApply({});
              }}
            >
              {tr("Clear filters", "清除条件")}
            </button>
            <button type="submit">{tr("Apply filters", "应用筛选")}</button>
          </div>
        </form>
      )}
    </details>
  );
}
