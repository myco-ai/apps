import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({entryPoints:[new URL("src/code-host/route.ts",import.meta.url).pathname],bundle:true,write:false,format:"esm",platform:"node"});
const {readItemRoute,itemLink} = await import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
const fragment = (provider,url,tab="") => "#item?"+new URLSearchParams({provider,url,...(tab?{tab}:{})});
for (const [provider,url,repo,kind] of [
 ["github","https://github.com/acme/widget/pull/17","acme/widget","pull"],
 ["github","https://github.example.com/acme/widget/issues/17","acme/widget","issue"],
 ["gitlab","https://gitlab.example.com/group/team/widget/-/merge_requests/17","group/team/widget","pull"],
 ["gitea","https://git.example.com/acme/widget/pulls/17","acme/widget","pull"],
]) {const r=readItemRoute(fragment(provider,url));assert.equal(r.repo,repo);assert.equal(r.kind,kind);assert.equal(r.number,17);assert.equal(r.host,new URL(url).origin);}
assert.equal(readItemRoute(""),null);
const link=itemLink("https://workspace.example/pages/pg_demo","github","https://github.com/acme/widget/pull/17","files");
assert.equal(readItemRoute(new URL(link).hash).tab,"files");
for (const bad of [
 fragment("github","javascript:alert(1)"), fragment("github","http://github.com/acme/widget/pull/17"),
 fragment("github","https://user:secret@github.com/acme/widget/pull/17"),
 fragment("github","https://github.com/acme/widget/pull/17?token=secret"),
 fragment("github","https://github.com/acme/widget/pull/17#token=secret"),
 fragment("github","https://github.com/acme%2fother/widget/pull/17"),
 fragment("github","https://github.com/a/b/c/pull/17"),
 fragment("github","https://github.com/acme/widget/pull/1e2"),
 fragment("github","https://github.com/acme/widget/pull/0"),
 fragment("github","https://github.com/acme/widget/pull/17","unknown"),
 fragment("github","https://github.com/acme/widget/issues/17","files"),
 fragment("gitlab","https://gitlab.example.com/acme/widget/merge_requests/17"),
 fragment("github","https://github.com/acme/widget/pull/17")+"&provider=gitlab",
 "#item?url="+encodeURIComponent("https://github.com/acme/widget/pull/17"),
]) assert.throws(()=>readItemRoute(bad),bad);
assert.throws(()=>itemLink("https://workspace.example/?token=secret","github","https://github.com/acme/widget/pull/17"));
console.log("PASS code-host links: provider paths, nested projects, credential-free routes, strict parameters and read-only navigation");
