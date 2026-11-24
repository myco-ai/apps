import type { Envelope } from "./vault";

export function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("myco-password-vault", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("encrypted"); };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("vault_storage_blocked"));
  });
}

export function read(db: IDBDatabase): Promise<Envelope | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction("encrypted").objectStore("encrypted").get("vault");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Compare inside the same read/write transaction to prevent lost edits in two tabs.
export function save(db: IDBDatabase, previous: Envelope | undefined, next: Envelope): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("encrypted", "readwrite");
    const store = tx.objectStore("encrypted");
    const request = store.get("vault");
    let conflict = false;
    request.onsuccess = () => {
      const current = request.result as Envelope | undefined;
      if (current?.iv !== previous?.iv || current?.ciphertext !== previous?.ciphertext) {
        conflict = true;
        tx.abort();
      } else store.put(next, "vault");
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(conflict ? new Error("vault_conflict") : tx.error);
  });
}
