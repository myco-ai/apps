// The page's side of the browser component (myco-browser), reached through
// `myco.browser` when the App lists the "browser" feature. This file is the
// proposed contract for the App bridge; no released App implements it yet,
// so every caller checks `browser()` first and the page stays an editor
// without it. Profiles, sign-ins, snapshots and secrets stay on the computer
// that runs the browser: nothing here is written to shared records.
import { myco } from "../_lib/myco";
import type { Run, RunStep, Script, ScriptNode, Target } from "./model";

export type BrowserProfile = {
  id: string; name: string; running: boolean;
  /** The owner allowed agents to use this profile (browser.view/run/control). */
  agents: boolean;
};
export type BrowserStatus = {
  protocol: number;
  /** The component's version; "" while it is not installed. */
  version: string;
  /** The optional component is on this computer (an App reports the
   *  "browser" feature before it is installed, like remote desktop). */
  installed: boolean;
  /** This computer can run it (platform, browser present…). */
  supported: boolean;
  /** Why it is not supported or not ready, for the person. */
  reason?: string;
  /** Installed browsers it can drive, e.g. ["chrome", "edge"]. */
  browsers: string[];
  machine: string;
  profiles: BrowserProfile[];
};
/** Recorded steps, in order. What a step causes is its own following step,
 *  observed from CDP and never replayed twice: a navigation becomes
 *  wait "url" (value: a stable part of the new address), a new window or tab
 *  tab "popup", a download wait "download", a native dialog a "dialog" step
 *  (accept/dismiss; a prompt's typed text only as a secret parameter
 *  reference). A tab the person opens by hand is tab "new" then navigate.
 *  No hidden fields: everything replay needs is visible and editable. */
export type RecordEvents = { steps: ScriptNode[]; next: number; done: boolean; url?: string };
export type RunUpdate = Pick<Run, "state" | "node" | "error" | "error_node" | "question"> & {
  steps: RunStep[]; next: number; output: Record<string, unknown>;
};
export type RunOptions = {
  script: Script; script_id: string; script_version: number;
  params: Record<string, string>;
  /** Only for this run, never stored. */
  secrets: Record<string, string>;
  profile: string; headless: boolean;
  start_at?: string; breakpoints?: string[];
  /** Sub-flow scripts the run may call, by record id. */
  scripts?: Record<string, Script>;
};

export interface BrowserBridge {
  /** Never fails because the component is missing: see installed. */
  status(): Promise<BrowserStatus>;
  /** Asks the App to install or update the component. The App shows its
   *  own trusted confirmation; the page only asks. Rejects with
   *  "cancelled" when the person declines. */
  install(): Promise<BrowserStatus>;
  profiles: {
    create(name: string): Promise<BrowserProfile>;
    /** Opens the profile's browser window to sign in by hand. */
    open(id: string): Promise<true>;
    /** A request only: the App confirms with the computer's owner in its
     *  own UI before agents may use the profile, and resolves with the
     *  profile as it now is (unchanged, or rejected with "cancelled", when
     *  declined). Turning it off needs no confirmation. */
    allowAgents(id: string, allowed: boolean): Promise<BrowserProfile>;
  };
  record: {
    start(options: { profile: string; url: string }): Promise<{ id: string }>;
    /** Long-polls recorded steps after `after`; done once stopped. */
    events(id: string, after: number): Promise<RecordEvents>;
    stop(id: string): Promise<true>;
  };
  runs: {
    start(options: RunOptions): Promise<{ id: string }>;
    /** Long-polls a run's progress after `after`. */
    get(id: string, after: number): Promise<RunUpdate>;
    control(id: string, action: "pause" | "resume" | "step" | "cancel", choice?: string): Promise<true>;
  };
  /** Highlights matches in the profile's page and counts them. */
  locate(options: { profile: string; target: Target }): Promise<{ count: number }>;
  /** Lets the person click an element in the page; returns its locators. */
  pick(options: { profile: string }): Promise<Target>;
  /** A local snapshot (element shot or page thumbnail) as an image. */
  snapshot(id: string): Promise<Blob>;
}

export const browserProtocol = 1;

export function browser(): BrowserBridge | undefined {
  const bridge = myco as unknown as { features?: string[]; browser?: BrowserBridge } | undefined;
  return bridge?.features?.includes("browser") && bridge.browser ? bridge.browser : undefined;
}

export function errorCode(error: unknown) {
  return (error as { code?: string })?.code || "failed";
}
