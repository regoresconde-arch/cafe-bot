import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dependency-free JSON store. Runs on any Node 18+ (no node:sqlite, no native
// build) — picked because the host runs Node 20 alongside another bot. Fine for
// a personal-scale, low-write cafe log. Writes are atomic (temp file + rename)
// so a crash mid-write can't corrupt the data.
const FILE = join(__dirname, "..", "cafes.json");

function load() {
  if (!existsSync(FILE)) return { nextId: 1, cafes: [] };
  try {
    const data = JSON.parse(readFileSync(FILE, "utf8"));
    return {
      nextId: data.nextId ?? (data.cafes?.length ? Math.max(...data.cafes.map((c) => c.id)) + 1 : 1),
      cafes: Array.isArray(data.cafes) ? data.cafes : [],
    };
  } catch {
    return { nextId: 1, cafes: [] };
  }
}

let state = load();

function persist() {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, FILE);
}

export function addCafe(entry) {
  const id = state.nextId++;
  state.cafes.push({
    id,
    name: entry.name,
    address: entry.address ?? null,
    stars: entry.stars,
    notes: entry.notes ?? null,
    logged_by: entry.loggedBy,
    logged_name: entry.loggedName,
    guild_id: entry.guildId,
    logged_at: new Date().toISOString(),
  });
  persist();
  return id;
}

export function listCafes(guildId) {
  // Newest first, matching the previous SQL ORDER BY logged_at DESC.
  return state.cafes
    .filter((c) => c.guild_id === guildId)
    .sort((a, b) => (a.logged_at < b.logged_at ? 1 : a.logged_at > b.logged_at ? -1 : 0));
}

// Delete one entry by id, scoped to its guild. Returns the removed entry, or
// null if nothing matched.
export function deleteCafe(id, guildId) {
  const idx = state.cafes.findIndex((c) => c.id === id && c.guild_id === guildId);
  if (idx === -1) return null;
  const [removed] = state.cafes.splice(idx, 1);
  persist();
  return removed;
}
