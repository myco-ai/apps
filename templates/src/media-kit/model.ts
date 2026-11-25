import { Kit } from "../_lib/appkit";
import { t as uiText } from "../_lib/i18n";
import { myco, Store, type PageFile, type MycoRecord } from "../_lib/myco";

export type Status = "draft" | "ready" | "published";
export type VideoLink = { url: string; label: string };
export type Entry = {
  title: string; date: string; version: string; pitch_zh: string; pitch_en: string;
  copy_zh: string; copy_en: string; tags: string[]; status: Status; channels: string; video_links?: VideoLink[];
};
export const platforms = ["app", "mobile", "cli", "web"] as const;
export const aspects = ["landscape", "portrait", "square"] as const;
export type Platform = (typeof platforms)[number];
export type Aspect = (typeof aspects)[number];
export type Picture = {
  kind?: "image" | "screenshot" | "video" | "gif";
  platform?: Platform; aspect?: Aspect; tags?: string[]; description?: string;
  entry: string; file: string; attachment?: PageFile; name: string; language: "zh" | "en" | "none";
  theme: "light" | "dark"; width: number; height: number; bytes: number;
  caption: string; preview: string; order: number;
};
export const entries = new Store<Entry>("entries");
export const images = new Store<Picture>("images");
export const kit = new Kit([entries, images], { quiet: true });
export const statuses = ["draft", "ready", "published"] as const;
export const maxFile = 20 * 1024 * 1024;
export const imageTypes = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export const mediaTypes = { ...imageTypes, gif: "image/gif", mp4: "video/mp4", webm: "video/webm" } as const;
export const maxLinks = 10;
export const maxLinkLength = 2048;
export let canUseMedia = false;
export let hasPageFiles = false;
let canBackfill = false, backfillBusy = false, backfillError = "";

export function videoURL(value: string) {
  try {
    const url = new URL(value.trim());
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.href.length <= maxLinkLength) return url.href;
  } catch { /* Unparseable URL. */ }
  return "";
}

export function videoLinks(value: unknown): VideoLink[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxLinks).flatMap(link => {
    const url = typeof link?.url === "string" ? videoURL(link.url) : "";
    return url ? [{ url, label: typeof link.label === "string" ? link.label.trim().slice(0, 240) : "" }] : [];
  });
}

export function needsMediaBridge(picture?: Picture) {
  return picture?.kind === "video" || picture?.kind === "gif" || /\.gif$/i.test(picture?.file || "");
}
export let canUseOriginals = false;
export async function initialize() {
  const context = await myco!.ready;
  hasPageFiles = Boolean(context.pageFiles && myco?.pageFiles);
  canUseOriginals = hasPageFiles || Boolean(context.projectFiles && myco?.projectFiles);
  canUseMedia = hasPageFiles || (canUseOriginals && context.projectMedia === true);
  // Old Hubs remain readable. Never send application media back to projects.
  if (!hasPageFiles || context.render) kit.canEdit = false;
  canBackfill = hasPageFiles && kit.canEdit && !context.render;
  void backfillLegacyReferences();
}

export function dateToday() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function pictures(entry: string) {
  return images.rows.filter(record => record.data.entry === entry).sort((a, b) =>
    (a.data.order || 0) - (b.data.order || 0) || a.id.localeCompare(b.id));
}

export function thumbnail(value: string | undefined) {
  return typeof value === "string" && value.length <= 18000 &&
    /^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/]+=*$/i.test(value) ? value : "";
}

export function mediaAspect(width: number, height: number): Aspect | undefined {
  if (!(width > 0 && height > 0)) return undefined;
  return width === height ? "square" : width > height ? "landscape" : "portrait";
}

export function mediaKind(data: Picture) {
  return data.kind === "video" ? "video" : data.kind === "gif" || /\.gif$/i.test(data.file || "") ? "gif" : "screenshot";
}

export function mediaTags(value: string) {
  return [...new Set(value.split(/[,，]/).map(tag => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
}

export function originalID(picture?: Picture) { return (hasPageFiles && picture?.attachment?.file_id) || picture?.file || picture?.attachment?.file_id || ""; }
async function originalFile(picture: Picture) {
  if (!myco?.pageFiles || !hasPageFiles) return undefined;
  if (picture.attachment) return picture.attachment;
  if (!picture.file) return undefined;
  try { return await myco.pageFiles.resolve(picture.file); }
  catch (error) { if ((error as {code?: string}).code !== "not_found") throw error; return undefined; }
}
export async function readOriginal(picture: Picture) {
  const attachment = await originalFile(picture);
  if (attachment) return myco!.pageFiles!.get(attachment);
  if (picture.file && myco?.projectFiles) return myco.projectFiles.get(picture.file);
  throw new Error("bridge_missing");
}
export async function downloadOriginal(picture: Picture) {
  const attachment = await originalFile(picture);
  if (attachment) return myco!.pageFiles!.download(attachment);
  if (picture.file && myco?.projectFiles) return myco.projectFiles.download(picture.file);
  throw new Error("bridge_missing");
}

function acceptPicture(record: MycoRecord) {
  images.apply({ seq: 0, collection: images.collection, record: record.id, op: "put", data: record.data, version: record.version });
  kit.emit();
}

export async function backfillLegacyReferences() {
  if (!canBackfill || backfillBusy) return;
  backfillBusy = true;
  try {
    for (const candidate of [...images.rows]) {
      const filename = candidate.data.file;
      if (!filename || candidate.data.attachment?.file_id) continue;
      try {
        const attachment = await myco!.pageFiles!.resolve(filename);
        // Re-read the server, preserving concurrent edits and delete/recreate
        // changes even when the record's numeric version is reused.
        const current = await myco!.data.get(images.collection, candidate.id) as MycoRecord<Picture>;
        acceptPicture(current);
        if (current.data.attachment?.file_id || current.data.file !== filename) continue;
        const saved = await myco!.data.put(images.collection, { ...current.data, attachment }, { id: current.id, ifVersion: current.version });
        acceptPicture(saved);
      } catch (error) {
        const code = (error as {code?: string}).code;
        if (code === "not_found") continue;
        if (code === "conflict") {
          try { acceptPicture(await myco!.data.get(images.collection, candidate.id)); }
          catch (readError) { if ((readError as {code?:string}).code !== "not_found") throw readError; }
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== backfillError) { backfillError = message; kit.flash(uiText("旧素材仍可查看，附件引用更新失败：{0}", message)); }
  } finally { backfillBusy = false; }
}
