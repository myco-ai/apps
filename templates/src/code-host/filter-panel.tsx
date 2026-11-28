import { Flyout, Picker } from "./picker";
import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  useEffect(() => setDraft(value), [value]);
  const has = (field: string) => supportsFilter(support, accounts, field);
  const author = has("author") || (!!repo && has("author_repo"));
  const field = (key: keyof Filters, v: string) =>
    setDraft((prev) => ({ ...prev, [key]: v }));
  const count = filterCount(value);
  return (
    <div className="advanced-filters">
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setDraft(value);
          setOpen((v) => !v);
        }}
        className="filter-trigger"
      >
        <SlidersHorizontal size={14} />
        {tr("More filters", "更多筛选")}
        {count > 0 && <span className="filter-count">{count}</span>}
      </button>
      <Flyout
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        label={tr("More filters", "更多筛选")}
        className="filter-flyout"
      >
        <header>
          <strong>{tr("More filters", "更多筛选")}</strong>
          <button
            type="button"
            className="icon"
            aria-label={tr("Close filters", "关闭筛选")}
            onClick={() => {
              setOpen(false);
              anchor.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        </header>
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
              setOpen(false);
              anchor.current?.focus();
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
                <Picker
                  label={tr("Draft", "草稿")}
                  value={draft.draft || ""}
                  disabled={!has("draft")}
                  onChange={(v) => field("draft", v)}
                  options={[
                    { value: "", label: tr("Any", "不限") },
                    { value: "only", label: tr("Draft only", "仅草稿") },
                    {
                      value: "exclude",
                      label: tr("Ready for review", "排除草稿"),
                    },
                  ]}
                />
              </label>
            )}
            <label>
              {tr("Sort", "排序")}
              <Picker
                label={tr("Sort", "排序")}
                value={draft.sort || ""}
                disabled={!has("sort")}
                onChange={(v) => field("sort", v)}
                options={[
                  { value: "", label: tr("Recently updated", "最近更新") },
                  {
                    value: "updated_asc",
                    label: tr("Least recently updated", "最早更新"),
                  },
                  {
                    value: "created_desc",
                    label: tr("Newest created", "最新创建"),
                  },
                  {
                    value: "created_asc",
                    label: tr("Oldest created", "最早创建"),
                  },
                ]}
              />
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
                  setOpen(false);
                  anchor.current?.focus();
                }}
              >
                {tr("Clear filters", "清除条件")}
              </button>
              <button type="submit">{tr("Apply filters", "应用筛选")}</button>
            </div>
          </form>
        )}
      </Flyout>
    </div>
  );
}
