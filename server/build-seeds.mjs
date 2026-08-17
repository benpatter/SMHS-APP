#!/usr/bin/env node
// Snapshot the client's bundled seed content into server/seeds.json for the
// MCP server. The app's admin UI edits the *effective* lists — seed content
// when a server key is absent — and materializes the seed on first write;
// the MCP tools must start from the same baseline or a first write would
// silently erase the seeds from every device. Re-run after editing any
// src/config seed file (imports the TS sources via Node's type stripping).

import { writeFileSync } from 'node:fs'

const { SEED_PRAYERS } = await import('../src/config/prayers.seed.ts')
const { CONTACT_GROUPS } = await import('../src/config/contacts.ts')
const { DINING_MENU } = await import('../src/config/dining.seed.ts')
const { SEED_OUTLINES } = await import('../src/config/campus3d/outlines.ts')

const seeds = {
  prayers: SEED_PRAYERS,
  contactGroups: CONTACT_GROUPS,
  diningItems: DINING_MENU,
  outlines: SEED_OUTLINES,
}

const out = new URL('./seeds.json', import.meta.url)
writeFileSync(out, JSON.stringify(seeds, null, 2) + '\n')
console.log(`seeds.json written: ${Object.entries(seeds).map(([k, v]) => `${k}=${v.length}`).join(', ')}`)
