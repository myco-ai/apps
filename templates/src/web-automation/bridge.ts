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
  protocol: number; version: string;
  /** Installed browsers it can drive, e.g. ["chrome", "edge"]. */
  browsers: string[];
  machine: string;
  profiles: BrowserProfile[];
};
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
  status(): Promise<BrowserStatus>;
  profiles: {
    create(name: string): Promise<BrowserProfile>;
    /** Opens the profile's browser window to sign in by hand. */
    open(id: string): Promise<true>;
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
