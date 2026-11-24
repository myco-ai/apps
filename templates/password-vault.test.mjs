import assert from "node:assert/strict";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: [new URL("./src/password-vault/vault.ts", import.meta.url).pathname],
  bundle: true, format: "esm", write: false,
});
const vault = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
const salt = vault.newSalt();
const master = await vault.derive("Synthetic test passphrase only", salt);
assert.equal(master.extractable, false);
const records = [{ id: "1", title: "Sample", site: "example.invalid", login: "demo", password: "sample-password", notes: "测试" }];
const first = await vault.seal(master, salt, records);
const second = await vault.seal(master, salt, records);
assert.notEqual(first.iv, second.iv);
assert.notEqual(first.ciphertext, second.ciphertext);
assert.ok(!JSON.stringify(first).includes("sample-password"));
assert.deepEqual(await vault.openVault(master, vault.parseBackup(JSON.stringify(first))), records);
assert.throws(() => vault.parseBackup(JSON.stringify({ ...first, version: 2 })));
assert.throws(() => vault.parseBackup(JSON.stringify({ ...first, salt: "short" })));
const wrong = await vault.derive("An incorrect master passphrase", salt);
await assert.rejects(vault.openVault(wrong, first), { name: "OperationError" });
const changed = { ...first, ciphertext: (first.ciphertext.startsWith("A") ? "B" : "A") + first.ciphertext.slice(1) };
await assert.rejects(vault.openVault(master, changed), { name: "OperationError" });
const random = Array.from({ length: 32 }, vault.generatePassword);
assert.equal(new Set(random).size, random.length);
assert.ok(random.every(value => value.length === 24));
console.log("Password Vault: authenticated portable backup, unique IVs, wrong-key and tamper rejection, non-extractable keys and random passwords passed");
