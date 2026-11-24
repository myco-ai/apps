import { t as uiText } from "../_lib/i18n";
import type { Issue, LocatorKind, NodeType, ParamType, RunState } from "./model";

export type Category = "page" | "data" | "flow" | "note";
export const groups: { key: Category; name: () => string; types: NodeType[] }[] = [
  { key: "page", name: () => uiText("页面操作"), types: ["navigate", "click", "type", "select", "press", "hover", "drag", "scroll", "upload", "tab"] },
  { key: "data", name: () => uiText("等待与数据"), types: ["wait", "assert", "extract", "js", "screenshot"] },
  { key: "flow", name: () => uiText("流程"), types: ["branch", "loop", "subflow", "confirm", "note"] },
];
export const category = (type: NodeType): Category => type === "note" ? "note" : groups.find(group => group.types.includes(type))!.key;

export function typeName(type: NodeType) {
  switch (type) {
    case "navigate": return uiText("打开网址");
    case "click": return uiText("点击");
    case "type": return uiText("输入");
    case "select": return uiText("选择");
    case "press": return uiText("按键");
    case "hover": return uiText("悬停");
    case "drag": return uiText("拖拽");
    case "scroll": return uiText("滚动");
    case "upload": return uiText("上传文件");
    case "wait": return uiText("等待");
    case "assert": return uiText("检查");
    case "extract": return uiText("提取");
    case "js": return uiText("执行 JS");
    case "screenshot": return uiText("页面截图");
    case "tab": return uiText("切换标签页");
    case "branch": return uiText("分支");
    case "loop": return uiText("循环");
    case "subflow": return uiText("子流程");
    case "confirm": return uiText("等人确认");
    case "note": return uiText("便签");
  }
}

export function portName(label: string) {
  switch (label) {
    case "true": return uiText("是");
    case "false": return uiText("否");
    case "ok": return uiText("同意");
    case "cancel": return uiText("拒绝");
    case "each": return uiText("每一项");
    case "done": return uiText("结束后");
    default: return label;
  }
}

export function locatorName(kind: LocatorKind) {
  switch (kind) {
    case "testid": return uiText("测试属性");
    case "role": return uiText("角色和名称");
    case "label": return uiText("标签");
    case "placeholder": return uiText("占位文字");
    case "text": return uiText("可见文本");
    case "css": return "CSS";
    case "xpath": return "XPath";
  }
}

export function paramTypeName(type: ParamType) {
  switch (type) {
    case "string": return uiText("文字");
    case "text": return uiText("长文本");
    case "number": return uiText("数字");
    case "bool": return uiText("是或否");
    case "secret": return uiText("敏感（不保存）");
  }
}

export function stateName(state: RunState) {
  switch (state) {
    case "queued": return uiText("排队中");
    case "running": return uiText("运行中");
    case "paused": return uiText("等待确认");
    case "succeeded": return uiText("成功");
    case "failed": return uiText("失败");
    case "cancelled": return uiText("已取消");
    case "offline": return uiText("电脑离线");
  }
}

export const stateDot = (state: RunState) => state === "running" ? "working" : state === "paused" ? "pending" :
  state === "failed" ? "failed" : state === "queued" || state === "offline" ? "offline" : "idle";

export function issueText(issue: Issue) {
  switch (issue.code) {
    case "empty": return uiText("还没有步骤。");
    case "param_name": return uiText("参数名「{0}」只能用字母、数字和下划线，且不能以数字开头。", issue.detail);
    case "param_duplicate": return uiText("参数名「{0}」重复了。", issue.detail);
    case "secret_default": return uiText("敏感参数「{0}」不能有默认值。", issue.detail);
    case "edge_missing": return uiText("有一条连线指向不存在的步骤。");
    case "edge_note": return uiText("便签不能连线。");
    case "edge_label": return uiText("连线的出口不对。");
    case "edge_fanout": return uiText("一个出口只能连一个步骤；要分开走，请用分支。");
    case "many_starts": return uiText("有 {0} 个步骤没有上游，只能有一个起点。", issue.detail);
    case "no_start": return uiText("找不到起点。");
    case "cycle": return uiText("连线成了环；要重复执行，请用循环。");
    case "target": return uiText("还没有选择元素。");
    case "drag_to": return uiText("还没有选择拖到哪里。");
    case "url": return uiText("请填写网址。");
    case "url_scheme": return uiText("网址要以 http:// 或 https:// 开头。");
    case "value": return uiText("请填写要输入或选择的值。");
    case "key": return uiText("请填写按键，例如 Enter 或 Control+A。");
    case "ms": return uiText("等待时长要在 1 毫秒到 10 分钟之间。");
    case "into": return issue.detail ? uiText("变量名「{0}」不可用。", issue.detail) : uiText("请填写保存到哪个变量。");
    case "code": return uiText("请填写 JS 代码。");
    case "list": return uiText("请填写要遍历的列表。");
    case "message": return uiText("请填写要问的话。");
    case "subflow": return uiText("请选择要调用的脚本。");
    case "subflow_self": return uiText("子流程不能调用自己。");
    case "subflow_missing": return uiText("要调用的脚本不存在了。");
    case "goto": return uiText("出错后要跳转的步骤不存在了。");
    case "retry": return uiText("重试次数要在 1 到 5 之间。");
    case "unknown_var": return uiText("没有叫「{0}」的参数或变量。", issue.detail);
    case "sensitive_literal": return uiText("敏感输入只能填参数，例如 ${password}，不要直接写值。");
    case "secret_use": return uiText("敏感参数「{0}」只能用在输入和选择里。", issue.detail);
    case "too_large": return uiText("脚本太大了（上限 64 KB），请拆成子流程。");
    default: return issue.code;
  }
}

export function bridgeError(code: string) {
  switch (code) {
    case "unsupported": return uiText("这台电脑的 App 还不支持这个操作。");
    case "not_installed": return uiText("请先安装浏览器组件。");
    case "no_browser": return uiText("没找到 Chrome 或 Edge。");
    case "busy": return uiText("这个 profile 正被别的录制或运行占用。");
    case "not_found": return uiText("页面上没找到这个元素。");
    case "cancelled": return uiText("已取消。");
    case "timeout": return uiText("浏览器组件没有及时回应。");
    case "permission_denied": return uiText("没有得到使用浏览器的许可。");
    default: return uiText("浏览器组件没有完成这个操作。");
  }
}
