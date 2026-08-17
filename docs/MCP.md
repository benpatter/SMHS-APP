# SMCHS App MCP Server

`server/mcp.mjs` exposes every server-reachable capability of the app as MCP
tools — everything a student, parent, staff member, or administrator can do
through the app itself. Every tool call is proxied to the app's HTTP API
(`server/index.mjs`), so the app's own auth decides every permission; the MCP
process has no privileged path into the data files.

## Running

`./start-prod.sh` starts the MCP server alongside the app automatically
(public read-only mode on `127.0.0.1:8181`; set `MCP_PORT=0` in `.env` to
disable, `SMCHS_PUBLIC=0` for the full staff/admin tool set on a non-exposed
instance). One signal stops both processes.

Manual runs:

```sh
node server/mcp.mjs                 # stdio — Claude Code, local agents (full mode)
node server/mcp.mjs --http 8181    # Streamable HTTP on /mcp — external models
```

| Env | Meaning |
|---|---|
| `SMCHS_API` | Base URL of the app server (default `http://127.0.0.1:$PORT` or 8080) |
| `SMCHS_TOKEN` | Optional staff session token to pre-authenticate the stdio session |
| `SMCHS_PUBLIC` | `1` (or `--public`) registers ONLY the 16 read tools — no auth, no admin, no push-subscription writes. Required mode for any endpoint exposed beyond localhost/tailnet. |
| `MCP_PORT` | Same as `--http <port>` |
| `MCP_HOST` | HTTP bind address, default `127.0.0.1`. Staff tokens travel over this port — expose it only behind TLS, exactly like the app itself. |

Internal discovery: the repo's `.mcp.json` registers the stdio server as
`smchs-app`, so Claude Code and other MCP-aware tools pick it up automatically
in this project.

Claude Desktop / claude.ai **custom connectors connect from Anthropic's
servers**, not from the local machine — the URL must be publicly reachable
(e.g. a Cloudflare tunnel, or the production reverse proxy routing `/mcp` to
`127.0.0.1:8181`). Their OAuth discovery probes
(`/.well-known/oauth-protected-resource` etc.) must reach this server and 404
cleanly, which means "no auth, connect directly"; if a fronting proxy routes
those paths elsewhere (or to a dead backend), the connector fails with a
registration error. The server answers `GET /mcp` with a spec-sanctioned 405
instead of a standalone SSE stream: headers-only SSE responses wedge for
~15 s behind buffering proxies and stall the session's queued requests.

External discovery: MCP clients connect to `POST /mcp` (Streamable HTTP).
Non-MCP callers can read the full tool catalog as plain JSON at
`GET /mcp/tools` and drive tools with ordinary JSON-RPC `tools/call` requests.

## Roles and permissions

The app server enforces exactly three tiers, and the MCP tools mirror them:

| Tier | Who | Tools |
|---|---|---|
| **Public** | students, parents, anonymous — the app has no server-side student/parent auth; their whole capability surface is public reads | all `get_*` / `list_*` tools, `find_period_times` |
| **Staff session** | signed-in staff (`staff_login`, `set_staff_token`, or an `Authorization: Bearer <token>` header on HTTP requests) | `staff_logout`; a plain teacher session grants nothing more — writes still return 403 |
| **Admin** | a staff session the **app** recognizes as admin (`ADMIN_EMAILS` env, else membership in Dean's Office / Educational Technology / President's Office / Principal's Office in the scraped directory, the directory title "Rector", or hand-granted access from Administration → Admins) | every `admin_*` tool |

Gating is fail-closed at three layers: tools refuse locally without a session,
the app returns 401 for a missing/expired session and 403 for a non-admin one,
and every write must present the current `If-Match` ETag (the MCP server
handles the read-modify-write cycle, retrying once on a 412 conflict).

Credentials are per-MCP-session: each HTTP session holds its own token, and
separate sessions never share auth state.

## Tool map

Reads (public): `get_health`, `list_events`, `list_sports`,
`list_weekly_posts`, `get_weekly_post`, `get_bell_schedule`,
`get_day_schedule` (one day with admin overrides applied, optionally filtered
to a student's grade and lunch track), `find_period_times` (one-call planner:
when do specific periods meet across a date range — built so models don't
loop `get_day_schedule` per day), `list_staff_directory`, `get_dining`,
`list_clubs`, `get_campus`, `get_safety`, `get_app_data` (the shared data
document + ETag), `get_map_tile`, `get_push_key`.

The big list tools are filtered and capped so responses stay small in a
model's context: `list_events` defaults to the next 30 days, 25 events max,
with `from`/`to`/`category`/`sport`/`query`/`limit`; `get_bell_schedule`
defaults to the next 14 days with `from`/`to`; `list_staff_directory` caps at
25 with `query`/`department`/`departmentsOnly`; `list_clubs` caps at 20 with
truncated descriptions (`query`/`category`/`full`); `get_app_data` caps each
array at `listLimit` (default 50). Truncation is always announced in a `note`
with the total match count, and responses are compact JSON.

Auth (full mode): `whoami`, `staff_login`, `set_staff_token`, `staff_logout`,
`staff_request_setup`, `staff_set_password`. Push (full mode):
`push_subscribe`, `push_unsubscribe`.

Admin writes (full mode; all via `PUT /api/data`, all audited and backed up
by the app): announcements (post/update/delete), notices & banners
(post/update/delete), bell-schedule day overrides (set/clear), events
(add/update/delete), live-feed event overrides (`admin_edit_feed_event`),
prayers (add/update/delete/reorder), dining items + hours/contact overrides,
contact directory (groups and entries), campus map pins and outlines, school
info & links, plus `admin_update_data` as a low-level escape hatch.

## Seed baselines

The app client falls back to bundled seed content when a server key is absent
(10 prayers, 15 contact groups, 45 dining items, 10 building outlines), and
the admin UI materializes the seed into the server document on first write.
The MCP tools do the same, reading the baseline from `server/seeds.json` —
regenerate it with `node server/build-seeds.mjs` after editing any
`src/config` seed file. If `seeds.json` is missing, writes to those four keys
refuse rather than risk erasing the seed content from every device.

The legacy single `alert` banner is addressable through the notice tools as
id `legacy-alert`, exactly as the admin UI treats it.

## Side effects to know before writing

- `admin_set_schedule_day` / `admin_clear_schedule_day` and a **new**
  school-wide notice (`admin_post_notice` with `page: "*"`) send a push
  notification to every subscribed device. Edits and deletions are silent.
- Every successful write is stamped `updatedBy`, appended to
  `server/.data/audit.log`, and snapshotted into `server/.data/backups/`
  (last 50) by the app server.

## Intentionally not exposed

- `POST /api/auth/status` — dead code; always answers `{exists: true}` by
  design so account existence can't be probed.
- Device-local features that never touch the server: the personal schedule
  canvas, parent child lists, the on-device admin passcode, theme, schedule
  share links, and the `?edit=1` map layout editor. They live in each
  device's localStorage and have no server API to call.
- `Announcement.bodyHtml` — the app renders it as raw HTML, and unlike the
  weekly feed it never passes through the server's sanitizer, so the
  dedicated tools don't offer it. Reordering lists other than prayers and
  moving a contact entry between groups have no admin-UI equivalent either;
  all of these remain reachable through `admin_update_data` when genuinely
  needed.

## Verification

E2E suites (stdio + HTTP + public tunnel) run against a sandboxed copy of
the app server with an isolated `.data` directory: fail-closed gating (no
session, bogus token, non-admin staff session, post-logout), the full
account lifecycle, every entity write family, seed materialization,
legacy-alert addressing, session isolation between HTTP clients,
bearer-header auth, OAuth-discovery 404s, all read-tool filters, and the
`find_period_times` planner. A five-agent capability audit plus an
adversarial completeness sweep confirmed every server-reachable capability
maps to a tool.
