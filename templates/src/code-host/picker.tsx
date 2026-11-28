import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { language } from "../_lib/i18n";
const tr = (en: string, zh: string) => (language() === "zh" ? zh : en);

/** Keep menus in their modal's top layer and inside the visible viewport. */
export function Flyout({
  anchor,
  open,
  onClose,
  label,
  children,
  className = "",
  role = "dialog",
}: {
  anchor: RefObject<HTMLButtonElement>;
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  role?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    if (!open || !panel.current || !anchor.current) return;
    const el = panel.current,
      trigger = anchor.current;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const left = viewport?.offsetLeft || 0,
      top = viewport?.offsetTop || 0;
    el.style.maxWidth = `${Math.max(0, width - 16)}px`;
    const roomBelow = top + height - rect.bottom - 12;
    const roomAbove = rect.top - top - 12;
    const above =
      roomBelow < Math.min(el.scrollHeight, 280) && roomAbove > roomBelow;
    const room = Math.max(80, above ? roomAbove : roomBelow);
    el.style.maxHeight = `${room}px`;
    el.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - el.offsetWidth - 8))}px`;
    el.style.top = `${above ? Math.max(top + 8, rect.top - el.offsetHeight - 4) : rect.bottom + 4}px`;
    (
      el.querySelector<HTMLElement>("[data-menu-focus]") ||
      el.querySelector<HTMLElement>('[aria-selected="true"]') ||
      el.querySelector<HTMLElement>('[role="option"]') ||
      el
    ).focus({ preventScroll: true });
    function outside(e: PointerEvent) {
      if (
        e.target instanceof Node &&
        !el.contains(e.target) &&
        !trigger.contains(e.target)
      )
        close.current();
    }
    function scroll(e: Event) {
      // Scrolling the options itself must not dismiss the menu.
      if (
        e.target instanceof Node &&
        !el.contains(e.target) &&
        (e.target === document || e.target.contains(trigger))
      )
        close.current();
    }
    const resize = () => close.current();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
      viewport?.removeEventListener("resize", resize);
    };
  }, [open, anchor]);
  if (!open || !anchor.current) return null;
  return createPortal(
    <div
      ref={panel}
      className={`ch-flyout ${className}`}
      role={role}
      aria-label={label}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close.current();
          anchor.current?.focus({ preventScroll: true });
        }
      }}
    >
      {children}
    </div>,
    anchor.current.closest(".ch-flyout") ||
      anchor.current.closest("dialog") ||
      document.body,
  );
}

export function Picker({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
  searchable = false,
  className = "",
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false),
    [needle, setNeedle] = useState("");
  const anchor = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null);
  const prefix = useRef({ text: "", at: 0 });
  const id = useId();
  const search = searchable || options.length > 6;
  const shown = options.filter((o) =>
    o.label.toLocaleLowerCase().includes(needle.toLocaleLowerCase()),
  );
  const selected = options.find((o) => o.value === value);
  function show() {
    setNeedle("");
    setOpen(true);
  }
  function choose(next: string) {
    setOpen(false);
    anchor.current?.focus({ preventScroll: true });
    onChange(next);
  }
  useLayoutEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`ch-picker ${className}`}
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        title={selected?.label || placeholder || label}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span>{selected?.label || placeholder || label}</span>
        <ChevronDown size={14} />
      </button>
      <Flyout
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        label={label}
        role="presentation"
        className="ch-picker-menu"
      >
        <div
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              setOpen(false);
              anchor.current?.focus({ preventScroll: true });
              return;
            }
            const buttons = Array.from(
              list.current?.querySelectorAll<HTMLButtonElement>(
                '[role="option"]',
              ) || [],
            );
            const at = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const inSearch = e.target instanceof HTMLInputElement;
            if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
              !(inSearch && ["Home", "End"].includes(e.key))
            ) {
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? buttons.length - 1
                    : e.key === "ArrowDown"
                      ? (at + 1) % buttons.length
                      : at < 0
                        ? buttons.length - 1
                        : (at - 1 + buttons.length) % buttons.length;
              buttons[next]?.focus();
            } else if (
              !search &&
              e.key.length === 1 &&
              !e.altKey &&
              !e.ctrlKey &&
              !e.metaKey &&
              e.key !== " "
            ) {
              e.preventDefault();
              const now = Date.now();
              prefix.current = {
                text:
                  (now - prefix.current.at < 600 ? prefix.current.text : "") +
                  e.key.toLocaleLowerCase(),
                at: now,
              };
              buttons
                .find((b) =>
                  b.textContent
                    ?.toLocaleLowerCase()
                    .startsWith(prefix.current.text),
                )
                ?.focus();
            }
          }}
        >
          {search && (
            <label className="ch-menu-search">
              <Search size={14} />
              <input
                data-menu-focus
                aria-label={tr(`Search ${label}`, `搜索${label}`)}
                placeholder={tr("Type to find…", "输入以查找…")}
                value={needle}
                onChange={(e) => setNeedle(e.target.value)}
              />
            </label>
          )}
          <div
            id={id}
            ref={list}
            role="listbox"
            aria-label={label}
            className="ch-options"
          >
            {shown.map((o) => (
              <button
                type="button"
                role="option"
                key={o.value}
                aria-selected={o.value === value}
                tabIndex={-1}
                title={o.label}
                onClick={() => choose(o.value)}
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={14} />}
              </button>
            ))}
            {!shown.length && (
              <p className="hint ch-no-options" role="status">
                {tr("No matches", "没有匹配项")}
              </p>
            )}
          </div>
        </div>
      </Flyout>
    </>
  );
}
