// The app's own icon set: 24-unit grid, 1.6 stroke, round caps. Drawn for
// this page so steps read at a glance inside their tiles.
import type { SVGProps } from "react";
import type { NodeType } from "./model";

type Props = SVGProps<SVGSVGElement> & { size?: number };
function Svg({ size = 18, children, ...rest }: Props) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>{children}</svg>;
}
const make = (paths: JSX.Element) => (props: Props) => <Svg {...props}>{paths}</Svg>;

export const Icon = {
  // Steps
  navigate: make(<><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3 8.5h18"/><circle cx="6" cy="6.5" r=".4" fill="currentColor"/><circle cx="8" cy="6.5" r=".4" fill="currentColor"/><path d="M9.5 14h5m-2-2.2 2.2 2.2-2.2 2.2"/></>),
  click: make(<><path d="m10 9.2 9.5 3.7-4 1.6-1.6 4z"/><path d="M6.2 4.3 7.4 6M3.5 8.6l2 .5M10.8 3.3l-.4 2M4.4 13.2l1.8-1"/></>),
  type: make(<><rect x="3" y="6.5" width="18" height="11" rx="2.5"/><path d="M8 9.5v5M6.8 9.5h2.4M6.8 14.5h2.4"/><path d="M12 12h5.5" opacity=".55"/></>),
  select: make(<><rect x="3" y="4.5" width="18" height="6" rx="2"/><path d="m15.5 6.8 1.5 1.4 1.5-1.4"/><path d="M5 14h14M5 17.5h9" opacity=".55"/><path d="M6.5 7.5h5"/></>),
  press: make(<><rect x="4" y="5" width="16" height="14" rx="3.5"/><path d="M7 15.5h10" /><path d="M8 9h.01M12 9h.01M16 9h.01M10 12h.01M14 12h.01" strokeWidth={2.2}/></>),
  hover: make(<><rect x="3" y="3.5" width="12" height="9" rx="2" strokeDasharray="2.2 2.2"/><path d="m11 11 8.5 3.3-3.6 1.4-1.4 3.6z"/></>),
  drag: make(<><path d="M12 3v18M3 12h18"/><path d="m9.5 5.5 2.5-2.5 2.5 2.5M9.5 18.5 12 21l2.5-2.5M5.5 9.5 3 12l2.5 2.5M18.5 9.5 21 12l-2.5 2.5"/></>),
  scroll: make(<><rect x="7" y="3" width="10" height="16" rx="5"/><path d="M12 6.5v3"/><path d="m9.5 21 2.5 1.5 2.5-1.5" opacity=".55"/></>),
  upload: make(<><path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15"/><path d="M12 15.5V4m-4.2 4.2L12 4l4.2 4.2"/></>),
  wait: make(<><path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5v2.3a4 4 0 0 0 1.6 3.2L12 11l2.4-2a4 4 0 0 0 1.6-3.2V3.5M8 20.5v-2.3a4 4 0 0 1 1.6-3.2L12 13l2.4 2a4 4 0 0 1 1.6 3.2v2.3"/></>),
  assert: make(<><path d="M12 3.2 5 6v5.3c0 4.3 3 7.6 7 9.5 4-1.9 7-5.2 7-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/></>),
  extract: make(<><rect x="3.5" y="3.5" width="12" height="12" rx="2"/><path d="M3.5 7.5h12M7.5 3.5v12"/><path d="M19.5 10.5v7M17 15l2.5 2.5L22 15" /><path d="M10.5 20.5h9"/></>),
  js: make(<><path d="M8 4.5H7a2 2 0 0 0-2 2v3.2a2.3 2.3 0 0 1-2 2.3 2.3 2.3 0 0 1 2 2.3v3.2a2 2 0 0 0 2 2h1M16 4.5h1a2 2 0 0 1 2 2v3.2a2.3 2.3 0 0 0 2 2.3 2.3 2.3 0 0 0-2 2.3v3.2a2 2 0 0 1-2 2h-1"/><path d="m13 8.5-2 7"/></>),
  screenshot: make(<><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2"/></>),
  tab: make(<><path d="M3 19.5V8a2 2 0 0 1 2-2h4.5l1.5 2.5H19a2 2 0 0 1 2 2v9"/><path d="M3 19.5h18"/><path d="M14 4.5h4.5" opacity=".55"/></>),
  branch: make(<><circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7.5v9M6 13c0-2.5 2-4 5-4h5"/></>),
  loop: make(<><path d="M17 3.5 19.5 6 17 8.5"/><path d="M4.5 11.5V10A4 4 0 0 1 8.5 6h11"/><path d="M7 20.5 4.5 18 7 15.5"/><path d="M19.5 12.5V14a4 4 0 0 1-4 4h-11"/></>),
  subflow: make(<><rect x="3" y="3" width="18" height="18" rx="3"/><rect x="7.5" y="9" width="9" height="7.5" rx="1.8"/><path d="M7.5 6h3" opacity=".55"/></>),
  confirm: make(<><circle cx="9.5" cy="8" r="3.5"/><path d="M3.5 19.5c.6-3 3-5 6-5 1.3 0 2.5.4 3.5 1"/><path d="m15 18 2 2 4-4.3"/></>),
  note: make(<><path d="M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v9.5l-6 6H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M14.5 20.5v-4.5a1.5 1.5 0 0 1 1.5-1.5h4.5"/><path d="M7.5 8.5h9M7.5 12h5"/></>),
  // Interface
  play: make(<path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L8.7 4.5a.8.8 0 0 0-1.2.7z" fill="currentColor" stroke="none"/>),
  record: make(<><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></>),
  stop: make(<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>),
  pause: make(<path d="M8.5 6v12M15.5 6v12" strokeWidth={2.4}/>),
  step: make(<><path d="M6 5.5v13l8.5-6.5z"/><path d="M18 5.5v13"/></>),
  layout: make(<><rect x="3" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="15" width="6" height="5" rx="1.5"/><path d="M9 6.5h6M18 9v6"/></>),
  profile: make(<><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.6 3.9-5.8 7.5-5.8s6.6 2.2 7.5 5.8"/></>),
  search: make(<><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></>),
  chevronDown: make(<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>),
  chevronRight: make(<path d="m9.5 6 6 6-6 6"/>),
  back: make(<path d="M19 12H5m6-6.5L4.5 12 11 18.5"/>),
  trash: make(<><path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5"/><path d="M6.5 6.5 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.8-12.5"/><path d="M10.2 10.5v6M13.8 10.5v6"/></>),
  breakpoint: make(<><path d="M8.3 3.5h7.4l5.2 5.2v6.6l-5.2 5.2H8.3l-5.2-5.2V8.7z"/><path d="M10 9.5v5M14 9.5v5"/></>),
  plus: make(<path d="M12 5v14M5 12h14"/>),
  close: make(<path d="M6.5 6.5l11 11m0-11-11 11"/>),
  up: make(<path d="M12 18.5v-13m-5 5 5-5 5 5"/>),
  down: make(<path d="M12 5.5v13m-5-5 5 5 5-5"/>),
  crosshair: make(<><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></>),
  scan: make(<><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M7.5 12h9"/></>),
  check: make(<path d="m5.5 12.5 4 4 9-9.5"/>),
  copy: make(<><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>),
  settings: make(<><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></>),
  blocks: make(<><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M17 14v6M14 17h6"/></>),
  warning: make(<><path d="M10.3 4.3 3 17a2 2 0 0 0 1.7 3h14.6A2 2 0 0 0 21 17L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 16.8h.01"/></>),
  file: make(<><path d="M6.5 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M13.5 3.5V8H18"/></>),
  history: make(<><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4"/><path d="M12 8v4.3l3 1.7"/></>),
  draft: make(<><path d="M14.5 4.5 19.5 9.5 9 20H4v-5z"/><path d="m12.5 6.5 5 5"/></>),
  download: make(<><path d="M12 3.5V15m-4.2-4.2L12 15l4.2-4.2"/><path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15"/></>),
  more: make(<path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth={2.6}/>),
  logo: make(<><rect x="2.5" y="4" width="19" height="16" rx="3.5"/><path d="M2.5 8.5h19"/><path d="m11 11.5 2 7 1.2-2.8 2.8-1.2z"/></>),
} as const;

export function StepIcon({ type, size }: { type: NodeType; size?: number }) {
  const Draw = Icon[type];
  return <Draw size={size}/>;
}
