# Declared computer capabilities

An app's `myco.json` lists the computer capability groups its source uses in
`os`. Include calls made by shared hooks, helpers and reused app components,
not only direct calls from its entry point. The host still asks the person for
access; a declaration is not a grant. Optional capabilities remain declared even
when an older host falls back to a browser implementation.

These declaration-bearing releases require Hub 0.22.1 or newer, the first version
whose manifest parser accepts `os` and `net`. Earlier Hubs use strict decoding
and cannot parse these releases. App v0.22.9 enforces undeclared capabilities;
older App versions retain their existing consent behavior.

The official apps that use the OS bridge declare:

| App | Groups |
| --- | --- |
| AI Canvas | `network` |
| Arcade | `exec`, `files`, `system` |
| Cinema | `network` |
| Database | `database`, `files` |
| Disk | `files`, `files.delete`, `system` |
| Meeting | `files`, `files.delete`, `microphone`, `speech`, `system` |
| Motion | `files`, `files.write`, `files.delete`, `speech` |
| Podcast | `network` |
| Proxy Console | `proxy` |
| Recorder | `files`, `screen`, `system` |
| Server Console | `ssh` |
| Stocks | `network` |
| Video | `files`, `screen`, `system` |
| Whiteboard | `clipboard` |

For example, Meeting's `useOS()` hook reads `system.info`; Motion writes and
removes a temporary WAV before/after `speech.transcribe`; Recorder mounts Video's
recorder, which invokes `screen.record`. Database's query, catalog, row and cancel
operations all belong to `database`; both SSH profile management and execution
belong to `ssh`, and proxy profile/control operations belong to `proxy`.

AI Canvas declares its fixed `api.replicate.com` and `openrouter.ai` services in
`net`; Podcast declares its fixed `itunes.apple.com` discovery service. Media
outputs, feed publishers and Cinema catalogs have user/provider-selected public
hosts and retain the host's per-domain consent flow.

Stocks keeps its network destinations dynamic: its built-in providers use
`query1.finance.yahoo.com` and `web.ifzq.gtimg.cn`, but custom gateways also support
loopback addresses, including IPv6. A fixed `net` list would deny undeclared
private gateways; the current manifest host syntax cannot declare IPv6 literals.
Keep the per-domain consent flow rather than silently narrowing gateway support.
Do not add broad local-network patterns to avoid a consent prompt.

Browser automation and remote desktop use their dedicated bridges and grants;
these declarations do not replace those authorization flows. Keep existing
`permissions` for `send` and `download` separate from `os`.
