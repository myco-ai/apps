// Serve the built vault on its own stable loopback origin.
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../dist/official/password-vault/", import.meta.url);
const host = "127.0.0.1";
const port = 47631;
if (!existsSync(fileURLToPath(new URL("index.html", root)))) throw new Error("Build the password-vault app first.");
createServer((request, response) => {
  const address = request.url?.split("?")[0];
  const file = address === "/" ? "index.html" : /^\/assets\/[a-z\d_.-]+\.(?:js|css)$/i.test(address || "") ? address.slice(1) : "";
  if (request.headers.host !== host + ":" + port || request.method !== "GET" || !file) {
    response.writeHead(404).end();
    return;
  }
  const path = fileURLToPath(new URL(file, root));
  if (!existsSync(path)) { response.writeHead(404).end(); return; }
  response.writeHead(200, {
    "Content-Type": file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  });
  createReadStream(path).pipe(response);
}).listen(port, host, () => process.stdout.write(`Password Vault http://${host}:${port}/\n`));
