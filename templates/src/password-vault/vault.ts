export type Login = { id: string; title: string; site: string; login: string; password: string; notes: string };
export type Envelope = { version: 1; salt: string; iv: string; ciphertext: string };
const encoder = new TextEncoder();
const maxRecords = 1000;
const maxBytes = 4 * 1024 * 1024;
const context = encoder.encode("myco/password-vault/v1");

function encode(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

function decode(value: string) { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }
export const newSalt = () => encode(crypto.getRandomValues(new Uint8Array(16)));

export function parseBackup(text: string): Envelope {
  if (text.length > maxBytes * 2) throw new Error("backup_size");
  const data = JSON.parse(text);
  if (data?.version !== 1 || typeof data.salt !== "string" || typeof data.iv !== "string" ||
      typeof data.ciphertext !== "string" || data.salt.length !== 24 || data.iv.length !== 16 ||
      decode(data.salt).length !== 16 || decode(data.iv).length !== 12 ||
      decode(data.ciphertext).length < 16 || decode(data.ciphertext).length > maxBytes) throw new Error("backup_format");
  return { version: 1, salt: data.salt, iv: data.iv, ciphertext: data.ciphertext };
}

export async function derive(password: string, salt: string) {
  const bytes = encoder.encode(password);
  try {
    const material = await crypto.subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey({ name: "PBKDF2", salt: decode(salt), iterations: 600_000, hash: "SHA-256" },
      material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } finally { bytes.fill(0); }
}

export async function seal(key: CryptoKey, salt: string, records: Login[]): Promise<Envelope> {
  if (records.length > maxRecords) throw new Error("vault_size");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(records));
  try {
    if (plaintext.length + 16 > maxBytes) throw new Error("vault_size");
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: context }, key, plaintext);
    return { version: 1, salt, iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) };
  } finally { plaintext.fill(0); }
}

export async function openVault(key: CryptoKey, envelope: Envelope): Promise<Login[]> {
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(envelope.iv), additionalData: context }, key, decode(envelope.ciphertext),
  ));
  try {
    const items: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
    if (!Array.isArray(items) || items.length > maxRecords || !items.every(item =>
      item && ["id", "title", "site", "login", "password", "notes"].every(field => typeof item[field] === "string")
    ) || new Set(items.map(item => item.id)).size !== items.length) throw new Error("vault_format");
    return items.map(({ id, title, site, login, password, notes }) => ({ id, title, site, login, password, notes }));
  } finally { plaintext.fill(0); }
}

export function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-=";
  const limit = 256 - (256 % alphabet.length);
  let output = "";
  while (output.length < 24) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < limit) output += alphabet[byte % alphabet.length];
      if (output.length === 24) break;
    }
  }
  return output;
}
