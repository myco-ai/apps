// Read actual host contracts from an explicit checkout, never copied mocks.
import path from "node:path";
import { fileURLToPath } from "node:url";
export const hostRoot = path.resolve(process.env.MYCO_HOST_ROOT || fileURLToPath(new URL("../.cache/myco/", import.meta.url)));
export const hostPath = (...parts) => path.join(hostRoot, ...parts);
