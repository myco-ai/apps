# Password Vault

The vault is for direct human use. It has no shared page data or agent actions. Ask people to enter secrets directly into their isolated local vault.

Build and run from the apps repository:

```sh
npm --prefix templates ci
node templates/build.mjs password-vault
node scripts/serve-password-vault.mjs
```

Open `http://127.0.0.1:47631/` in a regular browser profile. This fixed loopback origin has its own IndexedDB. Clearing site data or switching profiles changes what is available. Keep a copy of an encrypted backup and remember the master password. Backups can be restored into an empty vault. Clipboard copies use the operating system clipboard.

Open Password Vault inside an updated desktop myco App. The desktop host assigns the page a stable isolated origin and separates local storage by profile, workspace, account and page. Old desktop clients and mobile clients display an upgrade notice. To move from the standalone loopback preview to the App, export an encrypted backup from the preview and restore it inside the App. An unlocked session relies on a trusted browser, extensions and device.

The version 1 backup format uses a per-vault random 16-byte salt, PBKDF2-HMAC-SHA-256 with 600,000 iterations and AES-256-GCM with a fresh 12-byte IV per save. Keys are non-extractable. IndexedDB contains only encrypted envelopes. Authentication failure rejects changed ciphertext and wrong master passwords. A versioned authenticated context separates the format from other encrypted payloads. Use a long, unique, randomly chosen master password. The browser implementation has not been independently audited.

References: [Web Cryptography API](https://www.w3.org/TR/webcrypto/), [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
