import { Picker } from "./picker";
import { useRef, useState } from "react";
import { ChevronRight, Code2, Search, X } from "lucide-react";
import { language } from "../_lib/i18n";
import type { FileDiff } from "./client";
const tr = (en: string, zh: string) => (language() === "zh" ? zh : en);
export function ChangedFiles({
  files,
  more,
  busy,
  onMore,
}: {
  files: FileDiff[];
  more: boolean;
  busy: boolean;
  onMore: () => void;
}) {
  const [needle, setNeedle] = useState(""),
    [closed, setClosed] = useState<Record<string, boolean>>({});
  const nodes = useRef(new Map<string, HTMLElement>());
  const shown = files.filter((f) =>
    f.name.toLowerCase().includes(needle.toLowerCase()),
  );
  function jump(name: string) {
    setClosed((prev) => ({ ...prev, [name]: false }));
    requestAnimationFrame(() => {
      const el = nodes.current.get(name);
      const toolbar = el
        ?.closest(".changed-files")
        ?.querySelector(".files-toolbar");
      if (el && toolbar)
        el.style.scrollMarginTop = `${toolbar.getBoundingClientRect().height + 16}px`;
      el?.scrollIntoView({ block: "start" });
      el?.querySelector("summary")?.focus({ preventScroll: true });
    });
  }
  return (
    <div className="changed-files">
      <div className="files-toolbar">
        <label className="file-search">
          <Search size={14} />
          <input
            aria-label={tr("Filter changed files", "筛选变更文件")}
            placeholder={tr("Filter changed files…", "按路径筛选文件…")}
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
          />
          {needle && (
            <button
              className="icon"
              title={tr("Clear file search", "清空文件搜索")}
              onClick={() => setNeedle("")}
            >
              <X size={13} />
            </button>
          )}
        </label>
        <div className="file-fold-actions">
          <button
            onClick={() =>
              setClosed(Object.fromEntries(files.map((f) => [f.name, true])))
            }
          >
            {tr("Collapse all", "全部折叠")}
          </button>
          <button onClick={() => setClosed({})}>
            {tr("Expand all", "全部展开")}
          </button>
        </div>
        <Picker
          label={tr("Jump to file", "定位文件")}
          value=""
          searchable
          className="file-picker"
          placeholder={`${tr("Jump to file", "定位文件")} · ${shown.length}`}
          onChange={jump}
          options={shown.map((f) => ({ value: f.name, label: f.name }))}
        />

        <span className="hint">
          {more
            ? tr(
                `${files.length} files loaded · load more to search the rest`,
                `已加载 ${files.length} 个文件，加载更多后可筛选其余文件`,
              )
            : tr(
                `${shown.length} / ${files.length} files`,
                `${shown.length} / ${files.length} 个文件`,
              )}
        </span>
      </div>
      {!shown.length && (
        <p className="hint">
          {tr("No files match this path.", "没有匹配此路径的文件。")}
        </p>
      )}
      {shown.map((file) => (
        <details
          className="diff-file"
          key={file.name}
          ref={(el) => {
            if (el) nodes.current.set(file.name, el);
            else nodes.current.delete(file.name);
          }}
          open={!closed[file.name]}
          onToggle={(e) => {
            const isClosed = !e.currentTarget.open;
            setClosed((prev) =>
              prev[file.name] === isClosed
                ? prev
                : { ...prev, [file.name]: isClosed },
            );
          }}
        >
          <summary>
            <ChevronRight size={14} className="fold-chevron" />
            <Code2 size={14} />
            <strong>{file.name}</strong>
            <span>{file.status}</span>
          </summary>
          {file.patch ? (
            <pre>
              {file.patch.split("\n").map((line, j) => (
                <span
                  className={
                    line.startsWith("+")
                      ? "added"
                      : line.startsWith("-")
                        ? "removed"
                        : ""
                  }
                  key={j}
                >
                  {line}
                  {"\n"}
                </span>
              ))}
            </pre>
          ) : (
            <p className="hint">
              {tr(
                "No text patch supplied (binary, unchanged or provider limit). Open the original to inspect it.",
                "平台未提供文本差异（可能是二进制文件或平台限制），请打开原文查看。",
              )}
            </p>
          )}
        </details>
      ))}
      {more && (
        <button disabled={busy} onClick={onMore}>
          {busy
            ? tr("Loading…", "加载中…")
            : tr("Load more files", "加载更多文件")}
        </button>
      )}
    </div>
  );
}
