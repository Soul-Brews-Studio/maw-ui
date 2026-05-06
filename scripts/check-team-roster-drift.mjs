#!/usr/bin/env node
// check-team-roster-drift.mjs — CI gate for cross-team queue TEAM_ROSTER.
//
// Compares our local TEAM_ROSTER in src/lib/cross-team-queue-types.ts against
// FORGE's canonical source at Soul-Brews-Studio/maw-js:src/shared/cross-team-queue.types.ts.
//
// Exit codes:
//   0 — rosters match, or canonical not-yet-on-main (advisory skip)
//   1 — rosters differ (drift detected; PR must update)
//   2 — local file unreadable / unparsable (repo state bug)
//
// Env:
//   MAW_JS_REPO — override canonical repo (default: Soul-Brews-Studio/maw-js)
//   MAW_JS_REF  — override canonical ref (default: main). Useful during co-dev
//                 before FORGE's PR lands on main (MAW_JS_REF=feature/cross-team-queue).
//
// Run locally:  node scripts/check-team-roster-drift.mjs
// Run in CI:    added as "check-team-roster-drift" job in .github/workflows/build.yml

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO = process.env.MAW_JS_REPO || "Soul-Brews-Studio/maw-js";
const REF = process.env.MAW_JS_REF || "main";
const CANONICAL_PATH = "src/shared/cross-team-queue.types.ts";
const LOCAL_PATH = "src/lib/cross-team-queue-types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

/**
 * Extract the TEAM_ROSTER object literal from a TypeScript source string.
 * Returns { software: string[], business: string[], cross: string[] } or null.
 *
 * The parse is intentionally narrow — if FORGE restructures the declaration
 * shape (e.g. moves to a JSON file), this script fails loud so we notice.
 */
function extractRoster(source) {
  const match = source.match(/export\s+const\s+TEAM_ROSTER\s*=\s*(\{[\s\S]*?\})\s+as\s+const\s*;/);
  if (!match) return null;
  const block = match[1];
  const teams = ["software", "business", "cross"];
  const out = {};
  for (const team of teams) {
    const re = new RegExp(`${team}\\s*:\\s*\\[([^\\]]*)\\]`);
    const m = block.match(re);
    if (!m) return null;
    out[team] = m[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return out;
}

function eqRoster(a, b) {
  const keys = ["software", "business", "cross"];
  for (const k of keys) {
    if (!a[k] || !b[k]) return false;
    if (a[k].length !== b[k].length) return false;
    const sa = [...a[k]].sort();
    const sb = [...b[k]].sort();
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  }
  return true;
}

function diffRoster(local, remote) {
  const lines = [];
  for (const team of ["software", "business", "cross"]) {
    const l = new Set(local[team] || []);
    const r = new Set(remote[team] || []);
    const onlyLocal = [...l].filter((x) => !r.has(x));
    const onlyRemote = [...r].filter((x) => !l.has(x));
    if (onlyLocal.length === 0 && onlyRemote.length === 0) continue;
    lines.push(`  ${team}:`);
    for (const x of onlyLocal) lines.push(`    + ${x}  (only in VELA local)`);
    for (const x of onlyRemote) lines.push(`    - ${x}  (only in FORGE canonical)`);
  }
  return lines.join("\n");
}

async function main() {
  // 1. Read local
  let localSource;
  try {
    localSource = readFileSync(resolve(repoRoot, LOCAL_PATH), "utf-8");
  } catch (err) {
    console.error(`[drift-check] cannot read ${LOCAL_PATH}: ${err.message}`);
    process.exit(2);
  }
  const local = extractRoster(localSource);
  if (!local) {
    console.error(`[drift-check] failed to parse TEAM_ROSTER from ${LOCAL_PATH}.`);
    console.error(`[drift-check] the local declaration shape changed — update the parse or restore the shape.`);
    process.exit(2);
  }

  // 2. Fetch canonical
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${CANONICAL_PATH}`;
  console.log(`[drift-check] canonical: ${url}`);
  let remoteSource;
  try {
    const res = await fetch(url);
    if (res.status === 404) {
      console.log(`[drift-check] canonical not found (404) — FORGE's types not yet on ${REF}.`);
      console.log(`[drift-check] advisory skip: rerun after FORGE's maw-js PR merges.`);
      process.exit(0);
    }
    if (!res.ok) {
      console.error(`[drift-check] canonical fetch failed: HTTP ${res.status}`);
      process.exit(0); // advisory — network is not a correctness signal
    }
    remoteSource = await res.text();
  } catch (err) {
    console.error(`[drift-check] canonical fetch errored: ${err.message}`);
    console.log(`[drift-check] advisory skip: offline or DNS issue.`);
    process.exit(0);
  }

  const remote = extractRoster(remoteSource);
  if (!remote) {
    console.warn(`[drift-check] canonical fetched but TEAM_ROSTER not found at ${CANONICAL_PATH}.`);
    console.warn(`[drift-check] FORGE may have moved/removed the roster. Advisory skip — file follow-up to ping FORGE.`);
    process.exit(0);
  }

  // 3. Compare
  if (eqRoster(local, remote)) {
    console.log(`[drift-check] ✅ TEAM_ROSTER matches canonical (${REPO}@${REF}).`);
    for (const team of ["software", "business", "cross"]) {
      console.log(`  ${team}: ${local[team].length} member${local[team].length === 1 ? "" : "s"}`);
    }
    process.exit(0);
  }

  console.error(`[drift-check] ❌ TEAM_ROSTER drift detected vs canonical (${REPO}@${REF}).`);
  console.error(diffRoster(local, remote));
  console.error("");
  console.error(`[drift-check] resolution:`);
  console.error(`  1. decide which side is correct (usually canonical — FORGE's ADR-002 owns the registry)`);
  console.error(`  2. if canonical is right: copy ${CANONICAL_PATH} block into ${LOCAL_PATH}`);
  console.error(`  3. if VELA is right: open PR on maw-js to update canonical FIRST, then resync`);
  console.error(`  4. never diverge on purpose — promote to shared config file (ADR-002 v2.2 path)`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`[drift-check] unexpected error: ${err.stack || err.message}`);
  process.exit(2);
});
