#!/usr/bin/env node
// SMCHS app MCP server. Exposes every app capability as MCP tools, mapped 1:1
// onto the HTTP API in server/index.mjs so the app's own auth enforces every
// permission — this process holds no privileged path into the data files.
//
//   node server/mcp.mjs                 stdio transport (Claude Code, local agents)
//   node server/mcp.mjs --http [port]   Streamable HTTP on /mcp (external models),
//                                       plus GET /mcp/tools for plain function callers
//
// Env:
//   SMCHS_API     base URL of the running app server (default http://127.0.0.1:$PORT or 8080)
//   SMCHS_TOKEN   optional staff bearer token to pre-authenticate the stdio session
//   SMCHS_PUBLIC  "1" (or --public) registers ONLY the read tools — no auth,
//                 no admin, no push writes. Required for any endpoint exposed
//                 beyond localhost/tailnet (claude.ai connectors connect from
//                 Anthropic's servers, so their URL must be public).
//   MCP_PORT      same as --http <port>
//   MCP_HOST      bind address for HTTP mode (default 127.0.0.1 — tokens travel
//                 over this port, so expose it only behind TLS, like the app)
//
// Roles mirror the app exactly:
//   public — every read feed. Students and parents are client-side personas in
//            the app, so their entire capability surface is public here too.
//   staff  — a signed-in session (staff_login / set_staff_token)
//   admin  — a staff session the app itself recognizes as admin (ADMIN_EMAILS
//            or membership in the admin departments). The API returns 403 for
//            anyone else; this process never decides who is admin — the app does.
//
// Device-local app features (personal schedule canvas, parent child list, the
// on-device staff passcode, theme) live in each device's localStorage and have
// no server API, so they intentionally have no tools here.

import http from 'node:http'
import { readFileSync } from 'node:fs'
import { randomUUID, randomBytes } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

const API_BASE = (process.env.SMCHS_API || `http://127.0.0.1:${process.env.PORT || 8080}`).replace(/\/$/, '')

// Public-only mode: read tools only. See header.
const PUBLIC_ONLY = process.env.SMCHS_PUBLIC === '1' || process.argv.includes('--public')

// ---------------------------------------------------------------------------
// API client. Every tool goes through here; nothing touches .data directly.

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

async function api(path, { method = 'GET', token, ifMatch, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (ifMatch) headers['If-Match'] = ifMatch
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = { raw: text } }
  if (!res.ok) throw new ApiError(res.status, parsed)
  return { status: res.status, etag: res.headers.get('etag'), body: parsed }
}

async function getData() {
  try {
    return await api('/api/data')
  } catch (err) {
    if (err.status === 404) return { status: 404, etag: null, body: null } // nothing published yet
    throw err
  }
}

// Read-modify-write against /api/data with the app's fail-closed If-Match
// protocol, mirroring the app client's own read-before-write. `mutate(doc)`
// returns the patch to PUT (only the keys it changed). On a 412 the operation
// re-reads and re-applies once — safe because mutate expresses an operation on
// fresh state, not a stale blob.
async function updateData(token, mutate) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = await getData()
    const patch = mutate(structuredClone(cur.body || {}))
    try {
      const res = await api('/api/data', { method: 'PUT', token, ifMatch: cur.etag || undefined, body: patch })
      return { updatedAt: res.body.updatedAt, updatedBy: res.body.updatedBy, changed: Object.keys(patch) }
    } catch (err) {
      if (err.status === 412 && attempt === 0) continue
      throw err
    }
  }
  throw new ApiError(412, { error: 'data kept changing while writing; try again' })
}

// The app client falls back to bundled seed content when a server key is
// absent, and the admin UI materializes the seed on first write. Admin tools
// must start from the same baseline: writing a fresh one-element list would
// silently erase the seeds from every device. seeds.json is generated from
// the client sources by server/build-seeds.mjs.
const SEED_KEYS = ['prayers', 'contactGroups', 'diningItems', 'outlines']
let SEEDS = null
try { SEEDS = JSON.parse(readFileSync(new URL('./seeds.json', import.meta.url), 'utf8')) } catch { /* refused lazily below */ }

function list(doc, key) {
  if (Array.isArray(doc[key])) return doc[key]
  if (SEED_KEYS.includes(key)) {
    if (!SEEDS) throw new Error(`the app falls back to bundled seed content for "${key}" and this write must start from that baseline, but server/seeds.json is missing — run: node server/build-seeds.mjs`)
    return structuredClone(SEEDS[key] || [])
  }
  return []
}

// The legacy single `alert` banner renders as a synthetic notice with id
// "legacy-alert"; fold it into the notices baseline so it can be edited or
// taken down like any other notice (every notices write also nulls `alert`).
function noticesBaseline(doc) {
  const items = Array.isArray(doc.notices) ? [...doc.notices] : []
  if (doc.alert?.message && !items.some(n => n.id === 'legacy-alert')) {
    items.unshift({ id: 'legacy-alert', page: '*', message: doc.alert.message, tone: doc.alert.tone === 'urgent' ? 'urgent' : 'info' })
  }
  return items
}

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'

function mustFind(items, id, what) {
  if (!items.some(x => x.id === id)) throw new Error(`${what} "${id}" not found`)
}

const stripUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

// ---------------------------------------------------------------------------
// Shared schemas & date helpers

const NOTICE_PAGES = ['*', '/', '/calendar', '/announcements', '/announcements/read', '/more', '/more/schedule',
  '/more/clubs', '/more/athletics', '/more/menu', '/more/map', '/more/faith', '/more/faith/prayers',
  '/more/attendance', '/more/contacts', '/more/safety', '/parent']

const EVENT_CATEGORIES = ['academic', 'athletics', 'arts', 'ministry', 'campus-life', 'holiday']
const DAY_TYPES = ['regular', 'all-periods', 'meeting', 'mass', 'minimum', 'rally', 'split-mass', 'no-school']
const HHMM = z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm')
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-MM-dd')

// Assembled from parts, not from a locale's date order: Node builds without
// full ICU fall back from en-CA to en-US and format "08/17/2026", which is not
// a date anything downstream can parse.
const DAY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
})
const todayIso = () => {
  const p = Object.create(null)
  for (const { type, value } of DAY_FMT.formatToParts(new Date())) p[type] = value
  const iso = `${p.year}-${p.month}-${p.day}`
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date().toISOString().slice(0, 10)
}
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const weekdayOf = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })

// Grade for the current school year (rollover June 1): class of 2027 is a
// senior (12) throughout the 2026-27 year.
function gradeFromGradYear(gradYear) {
  const now = new Date()
  const y = now.getUTCFullYear()
  const startYear = (now.getUTCMonth() + 1) >= 6 ? y : y - 1
  return 12 - (gradYear - (startYear + 1))
}

// The app's attendance rules: grade-limited rows and split-lunch tracks.
function filterPeriodsFor(periods, grade, lunch) {
  let out = periods || []
  if (grade != null) {
    out = out.filter(p => {
      if (p.grades && !p.grades.includes(grade)) return false
      if (p.group === 'jrsr' && grade < 11) return false
      if (p.group === 'frso' && grade > 10) return false
      return true
    })
  }
  if (lunch) out = out.filter(p => !p.track || p.track === lunch)
  return out
}

const periodSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  start: HHMM,
  end: HHMM,
  kind: z.enum(['class', 'break', 'lunch', 'special']),
  periodNumber: z.number().int().min(1).max(7).optional(),
  track: z.enum(['first', 'second']).optional(),
  group: z.enum(['jrsr', 'frso']).optional(),
  grades: z.array(z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12)])).optional(),
  note: z.string().optional(),
})

const contactPersonSchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  phone: z.string().optional(),
  ext: z.string().optional(),
  email: z.string().optional(),
  url: z.string().optional(),
  urlLabel: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Tool plumbing

// Compact JSON: these payloads go into a model's context window.
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] })
const fail = (err) => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify(err instanceof ApiError ? { status: err.status, ...err.body } : { error: String(err?.message || err) }) }],
})
// Results that are already MCP content (e.g. get_map_tile's image) pass
// through untouched; everything else is wrapped as compact JSON.
const run = (fn) => async (args) => {
  try {
    const r = await fn(args ?? {})
    return r && Array.isArray(r.content) ? r : ok(r)
  } catch (err) { return fail(err) }
}

function needToken(auth) {
  if (!auth.token) {
    throw new Error('Not signed in. Call staff_login (or set_staff_token with an existing session token) first. Write access additionally requires the app to recognize the account as admin.')
  }
  return auth.token
}

export function buildServer(auth) {
  const mcp = new McpServer({ name: 'smchs-app', version: '1.0.0' })
  const tool = (name, description, schema, fn) =>
    mcp.registerTool(name, { description, inputSchema: schema }, run(fn))

  registerPublicTools(tool)
  if (!PUBLIC_ONLY) {
    registerPushTools(tool)
    registerAuthTools(tool, auth)
    registerAdminTools(tool, auth)
  }
  return mcp
}

// ---------------------------------------------------------------------------
// PUBLIC — the full student/parent/anonymous surface (read-only)

function registerPublicTools(tool) {
  tool('get_health', 'Server health and which calendar source (bellcalsync or legacy CalendarWiz) is live.', {}, () => api('/api/health').then(r => r.body))

  tool('list_events',
    'School events: athletics, ministry, arts, campus-life, holidays, academic. Defaults to the next 30 days — pass from/to (yyyy-MM-dd) for other ranges. Filter by category, sport, gender, or a free-text query (title/location). Returns at most limit events (default 25) plus the total match count.',
    {
      from: ISO_DATE.optional(), to: ISO_DATE.optional(),
      category: z.enum(EVENT_CATEGORIES).optional(),
      sport: z.string().max(40).optional(), gender: z.string().max(20).optional(),
      query: z.string().max(80).optional(), includeTentative: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ from, to, category, sport, gender, query, includeTentative, limit = 25 }) => {
      const q = new URLSearchParams()
      if (sport) q.set('sport', sport)
      if (gender) q.set('gender', gender)
      if (includeTentative) q.set('tentative', '1')
      const qs = q.toString()
      const r = await api('/api/events' + (qs ? `?${qs}` : ''))
      const start = from || todayIso()
      const end = to || (from ? '9999-12-31' : addDays(start, 30))
      const needle = query?.toLowerCase()
      const matches = (r.body.events || []).filter(e =>
        (e.endDate || e.date) >= start && e.date <= end &&
        (!category || e.category === category) &&
        (!needle || `${e.title} ${e.location || ''}`.toLowerCase().includes(needle)))
      const events = matches.slice(0, limit)
      return {
        source: r.body.source, from: start, to: end === '9999-12-31' ? undefined : end,
        total: matches.length, returned: events.length, events,
        note: matches.length > events.length ? `${matches.length - events.length} more match; narrow with from/to/category/query or raise limit` : undefined,
      }
    })

  tool('list_sports', 'All sports known to the calendar source (for use as list_events filters).', {}, () => api('/api/sports').then(r => r.body))

  tool('list_weekly_posts',
    'Eagle Weekly announcement posts from smhs.org, newest first, 5 per page (id + title stubs).',
    { page: z.number().int().min(1).max(500).optional() },
    ({ page }) => api(`/api/weekly?page=${page || 1}`).then(r => r.body))

  tool('get_weekly_post',
    'Full sanitized body of one Eagle Weekly post. postId is the numeric part of a list_weekly_posts id (strip the "weekly-" prefix).',
    { postId: z.string().regex(/^\d{1,9}$/) },
    ({ postId }) => api(`/api/weekly?post=${postId}`).then(r => r.body))

  tool('list_news',
    'School news from smhs.org — the Campus, Arts and Sports boards merged newest-first (id, channel, title, date, thumbnail).',
    { page: z.number().int().min(1).max(200).optional() },
    ({ page }) => api(`/api/news?page=${page || 1}`).then(r => r.body))

  tool('get_news_post',
    'Full sanitized body of one news story. Pass the id from list_news verbatim ("news-<board>-<post>").',
    { id: z.string().regex(/^(?:news-)?\d{1,9}-\d{1,9}$/) },
    ({ id }) => api(`/api/news?post=${encodeURIComponent(id)}`).then(r => r.body))

  tool('get_bell_schedule',
    'Rotating-block bell schedule keyed by date: label, rotation day, periods with start/end, lunch tracks, grade groups, no-school days. Defaults to the next 14 days — pass from/to (yyyy-MM-dd) for other ranges. For a single day prefer get_day_schedule. Admin overrides in get_app_data scheduleDays take precedence per date.',
    { from: ISO_DATE.optional(), to: ISO_DATE.optional() },
    async ({ from, to }) => {
      const r = await api('/api/schedule')
      const start = from || todayIso()
      const end = to || addDays(start, 14)
      const days = Object.fromEntries(Object.entries(r.body.days || {}).filter(([iso]) => iso >= start && iso <= end).sort())
      const totalDays = Object.keys(r.body.days || {}).length
      return {
        source: r.body.source, from: start, to: end,
        count: Object.keys(days).length, totalDaysOnFile: totalDays, days,
        note: totalDays > Object.keys(days).length ? 'more dates exist outside this range; pass from/to' : undefined,
      }
    })

  tool('get_day_schedule',
    "One day's effective schedule with admin overrides applied, optionally filtered to what one student actually attends (their grade, and their lunch track if known). ONE day only — for date ranges or planning around specific periods (\"which days does period 3 meet?\") call find_period_times once instead of calling this per day.",
    { date: ISO_DATE.optional(), gradYear: z.number().int().optional(), lunch: z.enum(['first', 'second']).optional() },
    async ({ date, gradYear, lunch }) => {
      const iso = date || todayIso()
      const [live, data] = await Promise.all([api('/api/schedule'), getData()])
      const day = data.body?.scheduleDays?.[iso] || live.body.days?.[iso] || null
      if (!day) return { date: iso, day: null, note: 'no schedule information for this date' }
      const grade = gradYear ? gradeFromGradYear(gradYear) : null
      const periods = filterPeriodsFor(day.periods, grade, lunch)
      return {
        date: iso, weekday: weekdayOf(iso), label: day.label, school: day.school, rotationDay: day.rotationDay,
        overridden: Boolean(data.body?.scheduleDays?.[iso]), grade, periods,
        note: !lunch && periods.some(p => p.track) ? 'periods include both lunch tracks; pass lunch to narrow (track derives from the P3 building — see get_dining lunch chart)' : undefined,
      }
    })

  tool('find_period_times',
    'Planning tool: when do specific class periods meet across a date range, in ONE call (e.g. "which January days can I miss periods 3, 4 and 7?"). Returns one compact row per day: weekday, day label, and each requested period\'s time — null means it does not meet that day. Periods ROTATE BY DATE at this school, so the same weekday differs week to week; always use this (never repeated get_day_schedule calls) for multi-day questions. Optional gradYear + lunch narrow to what that student attends. Range up to 92 days.',
    {
      from: ISO_DATE, to: ISO_DATE,
      periods: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
      gradYear: z.number().int().optional(), lunch: z.enum(['first', 'second']).optional(),
    },
    async ({ from, to, periods, gradYear, lunch }) => {
      if (to < from) throw new Error('to must not be before from')
      if (addDays(from, 92) < to) throw new Error('range too large: max 92 days')
      const [live, data] = await Promise.all([api('/api/schedule'), getData()])
      const want = periods?.length ? [...new Set(periods)].sort() : [1, 2, 3, 4, 5, 6, 7]
      const grade = gradYear ? gradeFromGradYear(gradYear) : null
      const days = []
      const unknownDates = []
      for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
        const day = data.body?.scheduleDays?.[iso] || live.body.days?.[iso]
        if (!day) {
          // Weekends are simply absent from the feed; only weekday gaps
          // (e.g. holidays the calendar hasn't published) are worth flagging.
          if (!['Sat', 'Sun'].includes(weekdayOf(iso))) unknownDates.push(iso)
          continue
        }
        const row = { date: iso, weekday: weekdayOf(iso), label: day.label }
        if (!day.school || !(day.periods || []).length) {
          row.school = false
        } else {
          row.times = {}
          for (const n of want) {
            const rows = filterPeriodsFor(day.periods, grade, lunch).filter(p => p.periodNumber === n)
            row.times[`p${n}`] = rows.length
              ? rows.map(p => `${p.start}-${p.end}${p.track ? ` (${p.track} lunch)` : ''}`).join(' / ')
              : null
          }
        }
        days.push(row)
      }
      return {
        from, to, grade, requestedPeriods: want, days,
        unknownDates: unknownDates.length ? unknownDates : undefined,
        note: 'periods rotate by calendar date — the same weekday differs week to week; weekends omitted'
          + (unknownDates.length ? `; no schedule on file for ${unknownDates.join(', ')} (often a holiday)` : '')
          + (!lunch && days.some(d => d.times && Object.values(d.times).some(t => /lunch/.test(t || ''))) ? '; some times differ by lunch track — pass lunch to narrow' : ''),
      }
    })

  tool('list_staff_directory',
    'Staff directory from smhs.org (name, title, email, departments). Filter with query (matches name/title/email/department) and/or department; returns at most limit people (default 25) plus the total match count. departmentsOnly:true returns just the department list.',
    { query: z.string().max(80).optional(), department: z.string().max(60).optional(), departmentsOnly: z.boolean().optional(), limit: z.number().int().min(1).max(300).optional() },
    async ({ query, department, departmentsOnly, limit = 25 }) => {
      const r = await api('/api/staff')
      if (departmentsOnly) return { source: r.body.source, departments: r.body.departments }
      const needle = query?.toLowerCase()
      const dep = department?.toLowerCase()
      const matches = (r.body.staff || []).filter(s =>
        (!dep || (s.departments || []).some(d => d.toLowerCase().includes(dep))) &&
        (!needle || `${s.name} ${s.title} ${s.email} ${(s.departments || []).join(' ')}`.toLowerCase().includes(needle)))
      const staff = matches.slice(0, limit)
      return {
        source: r.body.source, total: matches.length, returned: staff.length, staff,
        note: matches.length > staff.length ? `${matches.length - staff.length} more match; narrow with query/department or raise limit` : undefined,
      }
    })

  tool('get_dining', "Hanna's on Campus dining info from smhs.org: hours, payment, menu PDF, and the lunch-by-building chart (first vs second lunch). Menu items themselves are in get_app_data diningItems.", {}, () => api('/api/dining').then(r => r.body))

  tool('list_clubs',
    'Student clubs (name, category, description, moderator, email). Filter with query and/or category; returns at most limit clubs (default 20) plus the total match count. Descriptions are truncated unless full:true.',
    { query: z.string().max(80).optional(), category: z.string().max(60).optional(), full: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() },
    async ({ query, category, full, limit = 20 }) => {
      const r = await api('/api/clubs')
      const needle = query?.toLowerCase()
      const cat = category?.toLowerCase()
      const matches = (r.body.clubs || []).filter(c =>
        (!cat || (c.category || '').toLowerCase().includes(cat)) &&
        (!needle || `${c.name} ${c.category} ${c.description}`.toLowerCase().includes(needle)))
      const clubs = matches.slice(0, limit).map(c =>
        full || !c.description || c.description.length <= 160 ? c : { ...c, description: c.description.slice(0, 157) + '…' })
      return {
        source: r.body.source, year: r.body.year, rush: r.body.rush,
        total: matches.length, returned: clubs.length, clubs,
        note: matches.length > clubs.length ? `${matches.length - clubs.length} more match; narrow with query/category or raise limit` : undefined,
      }
    })

  tool('get_campus', 'Campus buildings (number + name), map/locator URLs, security phone.', {}, () => api('/api/campus').then(r => r.body))
  tool('get_safety', 'Campus safety: security phone, hours, closed-campus and visitor policy, tip line.', {}, () => api('/api/safety').then(r => r.body))

  tool('get_app_data',
    'The shared app data document with its ETag — announcements, notices (page banners), alert, diningItems, prayers, admin events + eventEdits, contactGroups, map pois/outlines, scheduleDays overrides, school info overrides, updatedAt/updatedBy. Public read. Pass keys to fetch only what you need (strongly recommended); listLimit caps each returned array (default 50, raise when you truly need everything).',
    { keys: z.array(z.string()).optional(), listLimit: z.number().int().min(1).max(2000).optional() },
    async ({ keys, listLimit = 50 }) => {
      const r = await getData()
      if (!r.body) return { etag: null, data: null, note: 'no data published yet' }
      let data = r.body
      if (keys?.length) data = Object.fromEntries(keys.filter(k => k in r.body).map(k => [k, r.body[k]]))
      const truncated = {}
      data = Object.fromEntries(Object.entries(data).map(([k, v]) => {
        if (Array.isArray(v) && v.length > listLimit) {
          truncated[k] = v.length
          return [k, v.slice(0, listLimit)]
        }
        return [k, v]
      }))
      return {
        etag: r.etag, data,
        note: Object.keys(truncated).length
          ? `truncated to first ${listLimit}: ${Object.entries(truncated).map(([k, n]) => `${k} (${n} total)`).join(', ')} — raise listLimit for the rest`
          : undefined,
      }
    })

  tool('get_map_tile',
    'One cached campus map tile (sat = Esri imagery, osm = OpenStreetMap). Zoom 12-19, coordinates must fall inside the campus bounding box.',
    { source: z.enum(['sat', 'osm']), z: z.number().int().min(12).max(19), x: z.number().int(), y: z.number().int() },
    async ({ source, z: zoom, x, y }) => {
      const res = await fetch(`${API_BASE}/api/tiles/${source}/${zoom}/${x}/${y}`)
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null))
      const buf = Buffer.from(await res.arrayBuffer())
      return { content: [{ type: 'image', data: buf.toString('base64'), mimeType: source === 'sat' ? 'image/jpeg' : 'image/png' }] }
    })

  tool('get_push_key', 'VAPID public key for Web Push subscriptions.', {}, () => api('/api/push/key').then(r => r.body))
}

// Push subscription writes are public in the app itself but stay off any
// internet-exposed endpoint; they register alongside auth/admin in full mode.
function registerPushTools(tool) {
  tool('push_subscribe',
    'Register a Web Push subscription (endpoint must be a real browser push service: Google, Apple, Mozilla, or Windows).',
    { endpoint: z.string().url(), p256dh: z.string(), auth: z.string() },
    ({ endpoint, p256dh, auth: a }) => api('/api/push/subscribe', { method: 'POST', body: { endpoint, keys: { p256dh, auth: a } } }).then(r => r.body))

  tool('push_unsubscribe',
    'Remove a Web Push subscription. Passing the subscription auth secret proves ownership.',
    { endpoint: z.string().url(), auth: z.string().optional() },
    ({ endpoint, auth: a }) => api('/api/push/unsubscribe', { method: 'POST', body: { endpoint, keys: a ? { auth: a } : undefined } }).then(r => r.body))
}

// ---------------------------------------------------------------------------
// AUTH — session-scoped; the token lives only in this MCP session

function registerAuthTools(tool, auth) {
  tool('whoami', 'Current auth state of this MCP session (no server call).', {}, () => ({
    signedIn: Boolean(auth.token),
    email: auth.email || null,
    note: auth.token ? 'Session token held; admin tools work only if the app recognizes the account as admin.' : 'Anonymous: public read tools only.',
  }))

  tool('staff_login',
    'Sign in with staff email + password. The session token is held inside this MCP session and used by every admin tool. Rate-limited: 10 auth requests/minute per IP.',
    { email: z.string().email(), password: z.string() },
    async ({ email, password }) => {
      const r = await api('/api/auth/login', { method: 'POST', body: { email, password } })
      auth.token = r.body.token
      auth.email = email
      return { ok: true, signedInAs: email, note: 'Token stored for this MCP session (30-day server-side expiry). Admin tools work only if the app recognizes this account as admin.' }
    })

  tool('set_staff_token',
    'Authenticate this MCP session with an existing staff session token instead of a password.',
    { token: z.string().min(16) },
    ({ token }) => { auth.token = token; auth.email = null; return { ok: true } })

  tool('staff_logout',
    'Sign out: revokes the session server-side and clears it from this MCP session.',
    {},
    async () => {
      const token = needToken(auth)
      const r = await api('/api/auth/logout', { method: 'POST', body: { token } })
      auth.token = null
      auth.email = null
      return r.body
    })

  tool('staff_request_setup',
    'Start first-time account setup or a password reset for a staff email (must be in the smhs.org staff directory). The app emails a one-hour setup link to that address. Rate-limited.',
    { email: z.string().email() },
    ({ email }) => api('/api/auth/request-setup', { method: 'POST', body: { email } }).then(r => r.body))

  tool('staff_set_password',
    'Complete account setup with the token from the emailed link. Sets the password (min 6 chars) and revokes all existing sessions for the account.',
    { setupToken: z.string(), password: z.string().min(6) },
    ({ setupToken, password }) => api('/api/auth/set-password', { method: 'POST', body: { token: setupToken, password } }).then(r => r.body))
}

// ---------------------------------------------------------------------------
// ADMIN — every write the admin UI can perform. All flow through PUT /api/data
// (fail-closed If-Match; 401 without a session, 403 unless the app recognizes
// the account as admin) and fire the same push side effects as the admin UI.

const PUSH_WARNING = ' Sends a push notification to every subscribed device.'

function registerAdminTools(tool, auth) {
  const write = (mutate) => updateData(needToken(auth), mutate)

  // -- announcements --
  tool('admin_post_announcement',
    'ADMIN. Post an announcement. audience: null/omitted = All-School, or a grade 9-12. url makes the card open a link; teamsUrl adds an "Open in Teams" action.',
    { title: z.string(), body: z.string(), audience: z.number().int().min(9).max(12).nullable().optional(), author: z.string().optional(), url: z.string().optional(), teamsUrl: z.string().optional() },
    ({ title, body, audience = null, author, url, teamsUrl }) => write(doc => {
      const item = stripUndefined({
        id: newId('ann'), title, body, audience,
        channel: audience ? `Campus Life ${audience}` : 'All-School',
        author: author || 'Administration', postedAt: new Date().toISOString(),
        url, teamsUrl,
      })
      return { announcements: [item, ...list(doc, 'announcements')] }
    }))

  tool('admin_update_announcement',
    'ADMIN. Edit an announcement (id from get_app_data announcements). Only provided fields change; empty string clears url/teamsUrl.',
    { id: z.string(), title: z.string().optional(), body: z.string().optional(), audience: z.number().int().min(9).max(12).nullable().optional(), author: z.string().optional(), url: z.string().optional(), teamsUrl: z.string().optional(), hidden: z.boolean().optional() },
    ({ id, ...patch }) => write(doc => {
      const items = list(doc, 'announcements'); mustFind(items, id, 'announcement')
      return {
        announcements: items.map(a => {
          if (a.id !== id) return a
          const next = { ...a, ...stripUndefined(patch) }
          if (patch.audience !== undefined) next.channel = patch.audience ? `Campus Life ${patch.audience}` : 'All-School'
          for (const k of ['url', 'teamsUrl']) if (next[k] === '') delete next[k]
          return next
        }),
      }
    }))

  tool('admin_delete_announcement', 'ADMIN. Delete an announcement permanently (use admin_update_announcement with hidden:true to just hide it).',
    { id: z.string() },
    ({ id }) => write(doc => {
      const items = list(doc, 'announcements'); mustFind(items, id, 'announcement')
      return { announcements: items.filter(a => a.id !== id) }
    }))

  // -- notices / banners --
  tool('admin_post_notice',
    `ADMIN. Post a notice. page "*" = school-wide banner shown on every page (this one also${PUSH_WARNING.toLowerCase().trim()}); any other page path shows a card on that page only. tone: info (blue), gold, urgent (red).`,
    { page: z.enum(NOTICE_PAGES), message: z.string(), title: z.string().optional(), tone: z.enum(['info', 'gold', 'urgent']).optional() },
    ({ page, message, title, tone }) => write(doc => ({
      notices: [...noticesBaseline(doc), stripUndefined({ id: newId('notice'), page, message, title: page === '*' ? undefined : title, tone: tone || 'info' })],
      alert: null, // legacy single-alert key is drained on every notices write, as the admin UI does
    })))

  tool('admin_update_notice', 'ADMIN. Edit a notice (including the legacy "legacy-alert" banner if one exists). Edits never re-send push notifications.',
    { id: z.string(), page: z.enum(NOTICE_PAGES).optional(), message: z.string().optional(), title: z.string().optional(), tone: z.enum(['info', 'gold', 'urgent']).optional() },
    ({ id, ...patch }) => write(doc => {
      const items = noticesBaseline(doc); mustFind(items, id, 'notice')
      return { notices: items.map(n => n.id === id ? { ...n, ...stripUndefined(patch) } : n), alert: null }
    }))

  tool('admin_delete_notice', 'ADMIN. Take down a notice (including the legacy "legacy-alert" banner if one exists).',
    { id: z.string() },
    ({ id }) => write(doc => {
      const items = noticesBaseline(doc); mustFind(items, id, 'notice')
      return { notices: items.filter(n => n.id !== id), alert: null }
    }))

  // -- schedule days --
  tool('admin_set_schedule_day',
    `ADMIN. Override the bell schedule for one date (replaces any prior override for that date).${PUSH_WARNING} Periods: label, start/end HH:mm, kind class|break|lunch|special, periodNumber 1-7, track first|second for split lunches, group jrsr|frso or grades [9,10,11,12] for grade-limited rows. school:false with empty periods = no school.`,
    {
      date: ISO_DATE,
      label: z.string(),
      short: z.string(),
      school: z.boolean(),
      rotationDay: z.number().int().min(1).max(7).optional(),
      dayType: z.enum(DAY_TYPES).optional(),
      periods: z.array(periodSchema),
    },
    ({ date, label, short, school, rotationDay, dayType, periods }) => write(doc => ({
      scheduleDays: {
        ...(doc.scheduleDays || {}),
        [date]: stripUndefined({
          label, short, school, rotationDay, dayType,
          periods: periods
            .map(p => ({ ...p, id: p.id || newId('per') }))
            .sort((a, b) => a.start.localeCompare(b.start)),
        }),
      },
    })))

  tool('admin_clear_schedule_day',
    `ADMIN. Remove the override for a date so the live calendar wins again.${PUSH_WARNING}`,
    { date: ISO_DATE },
    ({ date }) => write(doc => {
      const days = { ...(doc.scheduleDays || {}) }
      if (!(date in days)) throw new Error(`no schedule override exists for ${date}`)
      delete days[date]
      return { scheduleDays: days }
    }))

  // -- admin-added events --
  tool('admin_add_event',
    'ADMIN. Add a school event beyond the live calendar feed (shows on Calendar and, for athletics, the Athletics page). venue is the badge: "Home", a host school, or omitted.',
    { title: z.string(), date: ISO_DATE, category: z.enum(EVENT_CATEGORIES), endDate: ISO_DATE.optional(), time: z.string().optional(), location: z.string().optional(), venue: z.string().optional(), tentative: z.boolean().optional() },
    (fields) => write(doc => ({ events: [...list(doc, 'events'), stripUndefined({ id: newId('evt'), ...fields })] })))

  tool('admin_update_event', 'ADMIN. Edit or hide an admin-added event (ids from get_app_data events — feed events use admin_edit_feed_event instead).',
    { id: z.string(), title: z.string().optional(), date: ISO_DATE.optional(), category: z.enum(EVENT_CATEGORIES).optional(), endDate: ISO_DATE.optional(), time: z.string().optional(), location: z.string().optional(), venue: z.string().optional(), tentative: z.boolean().optional(), hidden: z.boolean().optional() },
    ({ id, ...patch }) => write(doc => {
      const items = list(doc, 'events'); mustFind(items, id, 'event')
      return { events: items.map(e => e.id === id ? { ...e, ...stripUndefined(patch) } : e) }
    }))

  tool('admin_delete_event', 'ADMIN. Delete an admin-added event (also drops any feed-style override stored for it).',
    { id: z.string() },
    ({ id }) => write(doc => {
      const items = list(doc, 'events'); mustFind(items, id, 'event')
      const patch = { events: items.filter(e => e.id !== id) }
      if (doc.eventEdits && id in doc.eventEdits) {
        const edits = { ...doc.eventEdits }
        delete edits[id]
        patch.eventEdits = edits
      }
      return patch
    }))

  tool('admin_edit_feed_event',
    'ADMIN. Override a live-feed calendar event (id from list_events). Feed events cannot be deleted (the feed resends them) — set hidden:true instead. Passing an empty string for title/time/location/venue clears that override back to the feed value.',
    { id: z.string(), title: z.string().optional(), time: z.string().optional(), location: z.string().optional(), venue: z.string().optional(), hidden: z.boolean().optional() },
    ({ id, ...patch }) => write(doc => {
      const edits = { ...(doc.eventEdits || {}) }
      const entry = { ...(edits[id] || {}) }
      for (const [k, v] of Object.entries(stripUndefined(patch))) {
        if (v === '' || v === false) delete entry[k]
        else entry[k] = v
      }
      if (Object.keys(entry).length === 0) delete edits[id]
      else edits[id] = entry
      return { eventEdits: edits }
    }))

  // -- prayers --
  tool('admin_add_prayer', 'ADMIN. Add a prayer to the Faith prayer book.',
    { title: z.string(), text: z.string() },
    ({ title, text }) => write(doc => ({ prayers: [...list(doc, 'prayers'), { id: newId('prayer'), title, text }] })))

  tool('admin_update_prayer', 'ADMIN. Edit, hide, or restore a prayer.',
    { id: z.string(), title: z.string().optional(), text: z.string().optional(), hidden: z.boolean().optional() },
    ({ id, ...patch }) => write(doc => {
      const items = list(doc, 'prayers'); mustFind(items, id, 'prayer')
      return { prayers: items.map(p => p.id === id ? { ...p, ...stripUndefined(patch) } : p) }
    }))

  tool('admin_delete_prayer', 'ADMIN. Delete a prayer.',
    { id: z.string() },
    ({ id }) => write(doc => {
      const items = list(doc, 'prayers'); mustFind(items, id, 'prayer')
      return { prayers: items.filter(p => p.id !== id) }
    }))

  tool('admin_reorder_prayers', 'ADMIN. Set the display order of the prayer book. Prayers missing from ids are appended in their current order.',
    { ids: z.array(z.string()) },
    ({ ids }) => write(doc => {
      const items = list(doc, 'prayers')
      const byId = new Map(items.map(p => [p.id, p]))
      const ordered = ids.map(id => byId.get(id)).filter(Boolean)
      const rest = items.filter(p => !ids.includes(p.id))
      return { prayers: [...ordered, ...rest] }
    }))

  // -- dining --
  tool('admin_add_dining_item',
    'ADMIN. Add a menu item. section: breakfast | lunch | elite; group is the menu-board grouping (e.g. "Hot Items"); price is a display string (e.g. "$9.50").',
    { section: z.enum(['breakfast', 'lunch', 'elite']), group: z.string(), name: z.string(), price: z.string(), description: z.string().optional() },
    (fields) => write(doc => ({ diningItems: [...list(doc, 'diningItems'), stripUndefined({ id: newId('menu'), ...fields })] })))

  tool('admin_update_dining_item', 'ADMIN. Edit, hide, or restore a menu item; section/group move it on the menu board.',
    { id: z.string(), name: z.string().optional(), price: z.string().optional(), description: z.string().optional(), section: z.enum(['breakfast', 'lunch', 'elite']).optional(), group: z.string().optional(), hidden: z.boolean().optional() },
    ({ id, ...patch }) => write(doc => {
      const items = list(doc, 'diningItems'); mustFind(items, id, 'dining item')
      return { diningItems: items.map(m => m.id === id ? { ...m, ...stripUndefined(patch) } : m) }
    }))

  tool('admin_delete_dining_item', 'ADMIN. Delete a menu item.',
    { id: z.string() },
    ({ id }) => write(doc => {
      const items = list(doc, 'diningItems'); mustFind(items, id, 'dining item')
      return { diningItems: items.filter(m => m.id !== id) }
    }))

  tool('admin_set_dining_overrides',
    'ADMIN. Override dining hours text and/or contact email. Empty string clears an override back to the live smhs.org value.',
    { hours: z.string().optional(), contact: z.string().optional() },
    (patch) => write(doc => {
      const cur = { ...(doc.dining || {}) }
      for (const [k, v] of Object.entries(stripUndefined(patch))) {
        if (v === '') delete cur[k]
        else cur[k] = v
      }
      return { dining: cur }
    }))

  // -- contacts directory --
  tool('admin_add_contact_group', 'ADMIN. Add a contact directory category.',
    { title: z.string() },
    ({ title }) => write(doc => {
      const groups = list(doc, 'contactGroups')
      let id = slug(title); let n = 2
      while (groups.some(g => g.id === id)) id = `${slug(title)}-${n++}`
      return { contactGroups: [...groups, { id, title, entries: [] }] }
    }))

  tool('admin_rename_contact_group', 'ADMIN. Rename a contact category.',
    { groupId: z.string(), title: z.string() },
    ({ groupId, title }) => write(doc => {
      const groups = list(doc, 'contactGroups'); mustFind(groups, groupId, 'contact group')
      return { contactGroups: groups.map(g => g.id === groupId ? { ...g, title } : g) }
    }))

  tool('admin_delete_contact_group', 'ADMIN. Delete a contact category AND every topic in it.',
    { groupId: z.string() },
    ({ groupId }) => write(doc => {
      const groups = list(doc, 'contactGroups'); mustFind(groups, groupId, 'contact group')
      return { contactGroups: groups.filter(g => g.id !== groupId) }
    }))

  tool('admin_add_contact_entry',
    'ADMIN. Add a topic to a contact category: who to contact and how, with an optional numbered escalation ladder (steps), what the office handles, and hidden search keywords.',
    {
      groupId: z.string(), topic: z.string(), note: z.string().optional(),
      steps: z.array(z.string()).optional(), handles: z.array(z.string()).optional(), keywords: z.array(z.string()).optional(),
      contacts: z.array(contactPersonSchema).optional(),
    },
    ({ groupId, ...fields }) => write(doc => {
      const groups = list(doc, 'contactGroups'); mustFind(groups, groupId, 'contact group')
      const entry = stripUndefined({
        id: `${groupId}-${slug(fields.topic)}-${Date.now().toString(36)}`,
        ...fields,
        contacts: fields.contacts?.filter(c => c.name.trim()).map(c => ({ id: newId('person'), ...stripUndefined(c) })),
      })
      return { contactGroups: groups.map(g => g.id === groupId ? { ...g, entries: [...(g.entries || []), entry] } : g) }
    }))

  tool('admin_update_contact_entry',
    'ADMIN. Edit, hide, or restore a contact topic (entryId from get_app_data contactGroups). Provided fields replace the old values wholesale; contacts replaces the whole people list.',
    {
      entryId: z.string(), topic: z.string().optional(), note: z.string().optional(),
      steps: z.array(z.string()).optional(), handles: z.array(z.string()).optional(), keywords: z.array(z.string()).optional(),
      contacts: z.array(contactPersonSchema).optional(), hidden: z.boolean().optional(),
    },
    ({ entryId, ...patch }) => write(doc => {
      const groups = list(doc, 'contactGroups')
      if (!groups.some(g => (g.entries || []).some(e => e.id === entryId))) throw new Error(`contact entry "${entryId}" not found`)
      const clean = stripUndefined(patch)
      if (clean.contacts) clean.contacts = clean.contacts.filter(c => c.name.trim()).map(c => ({ id: c.id || newId('person'), ...stripUndefined(c) }))
      return {
        contactGroups: groups.map(g => ({
          ...g,
          entries: (g.entries || []).map(e => e.id === entryId ? { ...e, ...clean } : e),
        })),
      }
    }))

  tool('admin_delete_contact_entry', 'ADMIN. Delete a contact topic.',
    { entryId: z.string() },
    ({ entryId }) => write(doc => {
      const groups = list(doc, 'contactGroups')
      if (!groups.some(g => (g.entries || []).some(e => e.id === entryId))) throw new Error(`contact entry "${entryId}" not found`)
      return { contactGroups: groups.map(g => ({ ...g, entries: (g.entries || []).filter(e => e.id !== entryId) })) }
    }))

  // -- campus map --
  tool('admin_add_poi',
    'ADMIN. Pin a location on the campus map. position is world [x, z] (the map editor picks these by tapping; existing pois/outlines in get_app_data show the coordinate space). building links the pin to the interior viewer (building code).',
    { name: z.string(), position: z.tuple([z.number(), z.number()]), desc: z.string().optional(), building: z.string().optional() },
    (fields) => write(doc => ({ pois: [...list(doc, 'pois'), stripUndefined({ id: newId('poi'), ...fields })] })))

  tool('admin_update_poi', 'ADMIN. Edit or move a map pin.',
    { id: z.string(), name: z.string().optional(), position: z.tuple([z.number(), z.number()]).optional(), desc: z.string().optional(), building: z.string().optional(), hidden: z.boolean().optional() },
    ({ id, ...patch }) => write(doc => {
      const items = list(doc, 'pois'); mustFind(items, id, 'poi')
      return { pois: items.map(p => p.id === id ? { ...p, ...stripUndefined(patch) } : p) }
    }))

  tool('admin_delete_poi', 'ADMIN. Delete a map pin.',
    { id: z.string() },
    ({ id }) => write(doc => {
      const items = list(doc, 'pois'); mustFind(items, id, 'poi')
      return { pois: items.filter(p => p.id !== id) }
    }))

  tool('admin_add_outline',
    'ADMIN. Draw a building outline polygon on the campus map (at least 3 [x, z] corner points). label renames the building across the whole app; building is the building code.',
    { points: z.array(z.tuple([z.number(), z.number()])).min(3), label: z.string().optional(), building: z.string().optional() },
    (fields) => write(doc => ({ outlines: [...list(doc, 'outlines'), stripUndefined({ id: newId('outline'), ...fields })] })))

  tool('admin_update_outline', 'ADMIN. Reshape, relabel, hide, or restore an outline. Seed outlines (ids in get_app_data outlines) should be hidden rather than deleted.',
    { id: z.string(), points: z.array(z.tuple([z.number(), z.number()])).min(3).optional(), label: z.string().optional(), building: z.string().optional(), hidden: z.boolean().optional() },
    ({ id, ...patch }) => write(doc => {
      const items = list(doc, 'outlines'); mustFind(items, id, 'outline')
      return { outlines: items.map(o => o.id === id ? { ...o, ...stripUndefined(patch) } : o) }
    }))

  tool('admin_delete_outline', 'ADMIN. Delete an admin-drawn outline (seed outlines come back on rebuild — hide those instead).',
    { id: z.string() },
    ({ id }) => write(doc => {
      const items = list(doc, 'outlines'); mustFind(items, id, 'outline')
      return { outlines: items.filter(o => o.id !== id) }
    }))

  // -- school info --
  tool('admin_set_school_info',
    'ADMIN. Override school info & links. Empty string clears a field back to the built-in default. attendancePhone should be E.164 (+1...); attendancePhoneDisplay is the human-readable form.',
    {
      attendancePhone: z.string().optional(), attendancePhoneDisplay: z.string().optional(),
      attendanceProcedure: z.string().optional(), attendanceHours: z.string().optional(),
      securityPhone: z.string().optional(), aeriesWebPortal: z.string().optional(),
      prayerRequestFormUrl: z.string().optional(), athleticsTicketsUrl: z.string().optional(),
      athleticsLivestreamUrl: z.string().optional(),
    },
    (patch) => write(doc => {
      const cur = { ...(doc.school || {}) }
      for (const [k, v] of Object.entries(stripUndefined(patch))) {
        if (v === '') delete cur[k]
        else cur[k] = v
      }
      return { school: cur }
    }))

  // -- escape hatch --
  tool('admin_update_data',
    `ADMIN. Low-level merge-write of the shared data document. Keys in patch replace the same keys wholesale (lists: pois, outlines, announcements, diningItems, prayers, events, contactGroups, notices; objects: dining, alert, scheduleDays, eventEdits, school; anything else is silently ignored by the server). Prefer the purpose-built admin_* tools. Writing scheduleDays or new school-wide notices${PUSH_WARNING.toLowerCase()}`,
    { patch: z.record(z.unknown()) },
    ({ patch }) => write(() => patch))
}

// ---------------------------------------------------------------------------
// Transports

async function mainStdio() {
  const auth = { token: process.env.SMCHS_TOKEN || null, email: null }
  const mcp = buildServer(auth)
  await mcp.connect(new StdioServerTransport())
  console.error(`smchs-app MCP on stdio → ${API_BASE}${PUBLIC_ONLY ? ' (public tools only)' : ''}${auth.token ? ' (pre-authenticated)' : ''}`)
}

async function toolCatalog() {
  const [ct, st] = InMemoryTransport.createLinkedPair()
  await buildServer({ token: null }).connect(st)
  const client = new Client({ name: 'catalog', version: '1.0.0' })
  await client.connect(ct)
  const { tools } = await client.listTools()
  await client.close()
  return tools
}

async function mainHttp(port, host) {
  const sessions = new Map() // session id → { transport, auth }
  let catalog = null

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')

      // Plain-function-call discovery: the tool catalog as JSON.
      if (url.pathname === '/mcp/tools' && req.method === 'GET') {
        catalog ||= await toolCatalog()
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({
          server: 'smchs-app', version: '1.0.0', endpoint: '/mcp', transport: 'streamable-http',
          auth: PUBLIC_ONLY
            ? 'Public read-only server: no authentication, no write tools.'
            : 'Anonymous callers get the public read surface. Staff/admin tools need a session: call staff_login, or send Authorization: Bearer <staff session token> on your requests.',
          tools: catalog,
        }, null, 2))
        return
      }

      if (url.pathname !== '/mcp') {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'not found; MCP lives at /mcp (tool catalog at /mcp/tools)' }))
        return
      }

      // No server-initiated notifications here, so decline the optional
      // standalone SSE stream (spec-sanctioned 405). Long-lived headers-only
      // SSE responses wedge behind buffering proxies (e.g. cloudflared holds
      // them ~15s and stalls the session's queued POSTs).
      if (req.method === 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST, DELETE' })
        res.end(JSON.stringify({ error: 'standalone SSE stream not offered; use POST' }))
        return
      }

      // Only POST carries a body. Draining the stream on GET/DELETE hangs
      // behind proxies (e.g. cloudflared) that hold the request stream open.
      let body
      if (req.method === 'POST') {
        const chunks = []
        for await (const c of req) chunks.push(c)
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined }
        catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid JSON' }))
          return
        }
      }

      const sid = req.headers['mcp-session-id']
      let session = sid && sessions.get(sid)

      if (!session) {
        if (!(req.method === 'POST' && isInitializeRequest(body))) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'no session; send an initialize request first' }))
          return
        }
        const auth = { token: null, email: null }
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          onsessioninitialized: (id) => sessions.set(id, { transport, auth }),
        })
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId) }
        session = { transport, auth }
        await buildServer(auth).connect(transport)
      }

      // A bearer on the HTTP request authenticates this session's staff/admin
      // tools — the token is forwarded to the app API, which decides everything.
      const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1]
      if (bearer) session.auth.token = bearer

      await session.transport.handleRequest(req, res, body)
    } catch (err) {
      console.error('mcp http error:', err)
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'internal error' }))
    }
  })

  server.listen(port, host, () => {
    console.error(`smchs-app MCP on http://${host}:${port}/mcp → ${API_BASE}${PUBLIC_ONLY ? ' (public tools only)' : ''}`)
    console.error(`tool catalog for plain callers: http://${host}:${port}/mcp/tools`)
  })
}

const httpFlag = process.argv.indexOf('--http')
const port = httpFlag !== -1 ? Number(process.argv[httpFlag + 1]) || 8181 : (process.env.MCP_PORT ? Number(process.env.MCP_PORT) : null)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (port) mainHttp(port, process.env.MCP_HOST || '127.0.0.1')
  else mainStdio()
}
