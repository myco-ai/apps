// Icons: one line family (lucide) at a thin, even stroke, in gray only.
import { AppWindow, ArrowDown, ArrowDownUp, ArrowLeft, ArrowUp, Blocks, Braces, Camera, Check, ChevronDown, ChevronRight, Circle, CircleDot, Copy,
  Crosshair, Download, MessageSquareMore, Ellipsis, FileOutput, FilePlus, FileText, GitBranch, Globe, History, Hourglass, Keyboard, LayoutGrid, ListChecks,
  MousePointer2, MousePointerClick, Move, OctagonPause, Pause, PenLine, Play, Plus, Repeat, ScanSearch, Search, ShieldCheck, SlidersHorizontal,
  Square, SquareMousePointer, StepForward, StickyNote, TextCursorInput, Trash2, TriangleAlert, Upload, User, UserCheck, Workflow, X,
  type LucideIcon, type LucideProps } from "lucide-react";
import type { NodeType } from "./model";

type Props = LucideProps & { size?: number };
const make = (Draw: LucideIcon, fill = false) => ({ size = 16, ...props }: Props) =>
  <Draw size={size} strokeWidth={1.6} aria-hidden="true" focusable="false" {...(fill ? { fill: "currentColor" } : {})} {...props}/>;

export const Icon = {
  navigate: make(Globe), click: make(MousePointerClick), type: make(TextCursorInput), select: make(ListChecks), press: make(Keyboard),
  hover: make(SquareMousePointer), drag: make(Move), scroll: make(ArrowDownUp), upload: make(Upload), tab: make(AppWindow),
  wait: make(Hourglass), assert: make(ShieldCheck), extract: make(FileOutput), js: make(Braces), screenshot: make(Camera),
  dialog: make(MessageSquareMore), branch: make(GitBranch), loop: make(Repeat), subflow: make(Workflow), confirm: make(UserCheck), note: make(StickyNote),
  play: make(Play, true), record: make(CircleDot), stop: make(Square, true), pause: make(Pause), step: make(StepForward),
  layout: make(LayoutGrid), profile: make(User), search: make(Search), chevronDown: make(ChevronDown), chevronRight: make(ChevronRight),
  back: make(ArrowLeft), trash: make(Trash2), breakpoint: make(OctagonPause), plus: make(Plus), close: make(X), up: make(ArrowUp), down: make(ArrowDown),
  crosshair: make(Crosshair), scan: make(ScanSearch), check: make(Check), copy: make(Copy), settings: make(SlidersHorizontal), blocks: make(Blocks),
  warning: make(TriangleAlert), file: make(FileText), history: make(History), draft: make(PenLine), more: make(Ellipsis), download: make(Download),
  newFile: make(FilePlus), dot: make(Circle, true), pointer: make(MousePointer2),
  logo: make(Workflow),
} as const;

export function StepIcon({ type, size }: { type: NodeType; size?: number }) {
  const Draw = Icon[type];
  return <Draw size={size}/>;
}
