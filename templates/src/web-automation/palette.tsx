// The block library: search, folding groups, two columns of tiles. Drag a
// tile onto the canvas, or click it to add it after the selected step.
import { useState } from "react";
import { t as uiText } from "../_lib/i18n";
import type { NodeType } from "./model";
import { groups, typeName } from "./labels";
import { Icon, StepIcon } from "./icons";
import { dragType } from "./canvas";

export function typeHint(type: NodeType) {
  switch (type) {
    case "navigate": return uiText("在当前标签页打开一个网址");
    case "click": return uiText("单击、双击或右键一个元素");
    case "type": return uiText("在输入框里填文字");
    case "select": return uiText("在下拉框里选一项");
    case "press": return uiText("按下一个键或组合键");
    case "hover": return uiText("把鼠标停在元素上");
    case "drag": return uiText("把元素拖到另一个元素上");
    case "scroll": return uiText("滚动页面或元素");
    case "upload": return uiText("给文件框选一个文件");
    case "tab": return uiText("切到另一个标签页");
    case "wait": return uiText("等元素出现、网络空闲或一段时间");
    case "assert": return uiText("检查不通过就按出错处理");
    case "extract": return uiText("把文字、属性或表格存进变量");
    case "js": return uiText("在页面里执行一段 JS");
    case "screenshot": return uiText("截下页面或元素");
    case "branch": return uiText("按条件走两条路");
    case "loop": return uiText("对列表里的每一项重复");
    case "subflow": return uiText("调用另一个脚本");
    case "confirm": return uiText("停下来等人同意");
    case "note": return uiText("写在画布上的说明");
  }
}

export function Palette({ add, editable }: { add: (type: NodeType) => void; editable: boolean }) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<string[]>([]);
  const words = query.trim().toLowerCase();
  const match = (type: NodeType) => !words || `${typeName(type)} ${typeHint(type)} ${type}`.toLowerCase().includes(words);
  const shown = groups.map(group => ({ ...group, types: group.types.filter(match) })).filter(group => group.types.length);
  return <div className="wa-palette">
    <label className="wa-search">
      <Icon.search size={15}/>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder={uiText("搜索积木")} aria-label={uiText("搜索积木")}/>
      {query && <button type="button" onClick={() => setQuery("")} aria-label={uiText("清除搜索")}><Icon.close size={13}/></button>}
    </label>
    <div className="wa-groups">
      {shown.map(group => {
        const open = words !== "" || !closed.includes(group.key);
        return <section key={group.key} className="wa-group" data-cat={group.key}>
          <button type="button" className="wa-group-head" aria-expanded={open}
            onClick={() => setClosed(open ? [...closed, group.key] : closed.filter(key => key !== group.key))}>
            <span className="wa-group-dot"/>{group.name()}<span className="wa-group-count">{group.types.length}</span>
            <Icon.chevronDown size={14} className="wa-group-chevron"/>
          </button>
          {open && <div className="wa-tiles">
            {group.types.map(type => <button type="button" key={type} className="wa-block" data-cat={type === "note" ? "note" : group.key}
              draggable={editable} disabled={!editable} title={typeHint(type)}
              onDragStart={event => { event.dataTransfer.setData(dragType, type); event.dataTransfer.effectAllowed = "copy"; }}
              onClick={() => add(type)}>
              <span className="wa-tile"><StepIcon type={type} size={18}/></span>
              <span>{typeName(type)}</span>
            </button>)}
          </div>}
        </section>;
      })}
      {!shown.length && <p className="wa-muted wa-pad">{uiText("没有匹配的积木。")}</p>}
    </div>
    <p className="wa-palette-tip">{uiText("拖到画布上，或点一下加在选中步骤后面。")}</p>
  </div>;
}
