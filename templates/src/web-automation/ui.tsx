// Drawn controls for this page: no native select or checkbox, so they look
// the same on every platform and in both themes. Each keeps the ARIA role
// and keyboard behaviour of the control it replaces.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

export type Option<T extends string> = { value: T; label: string; hint?: string; icon?: ReactNode };

/** Floats under an anchor inside the window, above scrolling panels. */
function usePlace(open: boolean, anchor: React.RefObject<HTMLElement>, width?: number) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const rect = anchor.current!.getBoundingClientRect();
      const w = Math.max(width || 0, rect.width);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8);
      const below = window.innerHeight - rect.bottom;
      setStyle(below > 220 || below > rect.top
        ? { left, top: rect.bottom + 4, minWidth: w, maxHeight: Math.max(120, below - 12) }
        : { left, bottom: window.innerHeight - rect.top + 4, minWidth: w, maxHeight: Math.max(120, rect.top - 12) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, anchor, width]);
  return style;
}

function useOutside(open: boolean, refs: React.RefObject<HTMLElement>[], close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => { if (!refs.some(ref => ref.current?.contains(event.target as Node))) close(); };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  });
}

export function Select<T extends string>({ value, options, onChange, label, disabled, placeholder, className }: {
  value: T | ""; options: Option<T>[]; onChange: (value: T) => void; label: string; disabled?: boolean; placeholder?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const style = usePlace(open, button);
  const current = options.find(option => option.value === value);
  useOutside(open, [button, list], () => setOpen(false));
  useEffect(() => { if (open) setActive(Math.max(0, options.findIndex(option => option.value === value))); }, [open]);
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [open, active]);
  const choose = (index: number) => { const option = options[index]; if (option) onChange(option.value); setOpen(false); button.current?.focus(); };
  return <>
    <button ref={button} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
      disabled={disabled} className={`ui-select${className ? " " + className : ""}`} onClick={() => setOpen(!open)}
      onKeyDown={event => {
        if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ")) { event.preventDefault(); setOpen(true); return; }
        if (!open) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        else if (event.key === "ArrowDown") { event.preventDefault(); setActive(index => Math.min(options.length - 1, index + 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
        else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); }
        else if (event.key === "Tab") setOpen(false);
      }}>
      {current?.icon}
      <span className={current ? "ui-select-value" : "ui-select-value is-placeholder"}>{current?.label || placeholder || ""}</span>
      <Icon.chevronDown size={14} className="ui-select-chevron"/>
    </button>
    {open && createPortal(<ul ref={list} id={id} role="listbox" aria-label={label} className="ui-pop ui-listbox" style={style}>
      {options.map((option, index) => <li key={option.value} role="option" aria-selected={option.value === value} data-index={index}
        data-active={index === active} onPointerEnter={() => setActive(index)} onClick={() => choose(index)}>
        {option.icon}<span><span>{option.label}</span>{option.hint && <small>{option.hint}</small>}</span>
        {option.value === value && <Icon.check size={14} className="ui-option-check"/>}
      </li>)}
    </ul>, document.body)}
  </>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="ui-switch"
    onClick={() => onChange(!checked)}><span/></button>;
}

/** A labelled row: text on the left, a switch on the right. */
export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return <div className="ui-toggle">
    <span><span>{label}</span>{hint && <small>{hint}</small>}</span>
    <Switch checked={checked} onChange={onChange} label={label} disabled={disabled}/>
  </div>;
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} className="ui-checkbox" onClick={() => onChange(!checked)}>
    <span className="ui-box">{checked && <Icon.check size={12}/>}</span>{label}
  </button>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (value: T) => void; label: string }) {
  return <div className="ui-segmented" role="tablist" aria-label={label}>
    {options.map(option => <button type="button" role="tab" key={option.value} aria-selected={option.value === value} onClick={() => onChange(option.value)}
      onKeyDown={event => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        const index = options.findIndex(item => item.value === value) + (event.key === "ArrowRight" ? 1 : -1);
        const next = options[(index + options.length) % options.length];
        onChange(next.value);
        (event.currentTarget.parentElement?.children[options.indexOf(next)] as HTMLElement | undefined)?.focus();
      }}>{option.icon}{option.label}</button>)}
  </div>;
}

export function IconButton({ label, onClick, children, disabled, pressed, tone }: {
  label: string; onClick: () => void; children: ReactNode; disabled?: boolean; pressed?: boolean; tone?: "danger";
}) {
  return <button type="button" className={`ui-icon-btn${tone ? " is-" + tone : ""}`} aria-label={label} title={label} disabled={disabled}
    aria-pressed={pressed} onClick={onClick}>{children}</button>;
}

/** A popover menu under a button. */
export function Popover({ open, anchor, close, children, width, label }: {
  open: boolean; anchor: React.RefObject<HTMLElement>; close: () => void; children: ReactNode; width?: number; label: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const style = usePlace(open, anchor, width);
  useOutside(open, [anchor, panel], close);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); anchor.current?.focus(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  if (!open) return null;
  return createPortal(<div ref={panel} className="ui-pop ui-popover" role="dialog" aria-label={label} style={{ ...style, width }}>{children}</div>, document.body);
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return <div className="ui-field">
    <label htmlFor={htmlFor}>{label}</label>
    {children}
    {hint && <small>{hint}</small>}
  </div>;
}
