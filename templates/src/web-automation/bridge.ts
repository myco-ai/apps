// The page's side of the browser component (myco-browser), reached through
// `myco.browser` when the App lists the "browser" feature. This file is the
// proposed contract for the App bridge; no released App implements it yet,
// so every caller checks `browser()` first and the page stays an editor
// without it. Profiles, sign-ins, snapshots and secrets stay on the computer
// that runs the browser: nothing here is written to shared records.
import { myco } from "../_lib/myco";
import type { ProfileSettings, ProfileSettingsInput, Run, RunStep, Script, ScriptNode, Target } from "./model";

export type BrowserProfile = {
  id: string; name: string; running: boolean;
  /** The owner allowed agents to use this profile (browser.view/run/control). */
  agents: boolean;
  /** Proxy, user agent, language and launch arguments; components before
   *  0.2.0 omit it. Proxy passwords never come back: see has_password. */
  settings?: ProfileSettings;
};
export type BrowserStatus = {
  protocol: number;
  /** Optional component abilities, e.g. "screenshot_clip"; older ones omit it. */
  features?: string[];
  /** The component's version; "" while it is not installed. */
  version: string;
  /** The optional component is on this computer (an App reports the
   *  "browser" feature before it is installed, like remote desktop). */
  installed: boolean;
  /** This computer can run it (platform, browser present…). */
  supported: boolean;
  /** Why it is not supported or not ready, for the person. */
  reason?: string;
  /** An older compatible release is installed; install() fetches the
   *  release this App ships with. Older Apps never send it. */
  update_available?: boolean;
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
/** removed: ids of steps sent earlier that the person deleted in the
 *  browser's recording panel (components before 0.3.0 never send it). */
export type RecordEvents = { steps: ScriptNode[]; next: number; done: boolean; url?: string; removed?: string[] };
/** A recording in progress for this page's scope; "browser" ones were
 *  started from the recording panel and wait for a page to take them. */
export type ActiveRecording = { id: string; profile: string; url: string; started_at: string; origin: "browser" | "page" };
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

/** A script version the computer's owner allowed agents to run. The App
 *  keeps the full snapshot (and its sub-flows) on this computer; agent runs
 *  use only approved snapshots, never the shared record's latest content. */
export type Approval = { script_id: string; version: number; digest: string; profile: string; approved_at: string; name: string };

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
    /** Optional (older Apps lack it). The App lists every value in its own
     *  confirmation, since a proxy sees this profile's traffic. Applies the
     *  next time the profile's browser starts. Rejects with "cancelled"
     *  when declined and "invalid_argument" for a disallowed value. */
    configure?(id: string, settings: ProfileSettingsInput): Promise<BrowserProfile>;
  };
  record: {
    start(options: { profile: string; url: string }): Promise<{ id: string }>;
    /** Long-polls recorded steps after `after`; done once stopped. */
    events(id: string, after: number): Promise<RecordEvents>;
    stop(id: string): Promise<true>;
    /** Optional (older Apps lack it): recordings in progress, including
     *  those started from the browser's own recording panel. */
    active?(): Promise<ActiveRecording[]>;
  };
  runs: {
    start(options: RunOptions): Promise<{ id: string }>;
    /** Long-polls a run's progress after `after`. */
    get(id: string, after: number): Promise<RunUpdate>;
    control(id: string, action: "pause" | "resume" | "step" | "cancel", choice?: string): Promise<true>;
  };
  approvals: {
    list(): Promise<Approval[]>;
    /** Asks the owner, in the App's own dialog that lists the script's
     *  addresses, code and sub-flows, to let agents run this exact version
     *  with this profile. Rejects with "cancelled" when declined. */
    request(options: { script_id: string; version: number; script: Script; scripts: Record<string, Script>; profile: string }): Promise<Approval>;
    /** Withdraws one version, or every version of the script. */
    revoke(script_id: string, version?: number): Promise<true>;
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
/** Optional detail for some codes (profile_locked: leftover_unverified,
 *  cleanup_pending, cleanup_failed); older Apps never send it. */
export function errorReason(error: unknown) {
  const reason = (error as { reason?: unknown })?.reason;
  return typeof reason === "string" ? reason : "";
}
