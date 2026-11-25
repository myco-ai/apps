// Versioned writes shared by the forms and original-image import.
import { myco, type Store, type MycoRecord } from "../_lib/myco";
import { t as uiText } from "../_lib/i18n";
import { entries, images, kit, type Entry, type Picture } from "./model";

async function save<T extends Record<string, unknown>>(store: Store<T>, id: string, data: T, version: number) {
  const record = await myco!.data.put(store.collection, data, { id, ifVersion: version });
  store.apply({ seq: 0, collection: record.collection, record: record.id, op: "put", data: record.data, version: record.version });
  kit.emit();
  return record;
}

export const saveEntry = (id: string, data: Entry, version: number) => save(entries, id, data, version);
export const savePicture = (id: string, data: Picture, version: number) => save(images, id, data, version);

export async function removePicture(record: MycoRecord<Picture>) {
  const snapshot = { version: record.version, data: JSON.stringify(record.data), id: record.id };
  const data = JSON.parse(snapshot.data) as Picture;
  let attachment = data.attachment;
  if (!attachment && data.file) {
    try { attachment = await myco!.pageFiles!.resolve(data.file); }
    catch (error) {
      if ((error as {code?:string}).code === "not_found") throw new Error(uiText("旧原文件尚未迁移，请稍后重试删除。"));
      throw error;
    }
  }
  try {
    const current = await myco!.data.get(images.collection, snapshot.id);
    if (current.version !== snapshot.version || JSON.stringify(current.data) !== snapshot.data) {
      images.apply({ seq:0, collection:images.collection, record:current.id, op:"put", data:current.data, version:current.version });
      kit.emit();
      throw Object.assign(new Error(uiText("别人刚改过，已显示最新的")), { code:"conflict" });
    }
    await myco!.data.remove(images.collection, snapshot.id, {ifVersion:current.version});
  } catch (error) { if ((error as {code?:string}).code !== "not_found") throw error; }
  images.apply({seq:0,collection:images.collection,record:snapshot.id,op:"delete",version:snapshot.version});
  kit.emit();
  if (attachment) {
    try { await myco!.pageFiles!.remove(attachment); }
    catch (error) {
      const code=(error as {code?:string}).code;
      if (code === "conflict") { kit.flash(uiText("素材已删除，其他记录仍在使用原文件，已保留。")); return true; }
      if (code !== "not_found") { kit.flash(uiText("素材已删除，原文件尚未清理。可让 agent 按附件编号重试：{0}", attachment.file_id)); return true; }
    }
  }
  kit.flash(uiText("素材已删除"));
  return true;
}
