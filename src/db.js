import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dependency-free JSON store (runs on any Node 18+, no native build). One row per
// logged entry, tagged by category. Writes are atomic (temp file + rename).
const FILE = join(__dirname, "..", "cafes.json");

// Normalize older rows that predate categories/subtitle/link so reads are uniform.
function migrate(entry) {
  return {
    id: entry.id,
    category: entry.category ?? "cafe",
    name: entry.name,
    subtitle: entry.subtitle ?? entry.address ?? null,
    stars: entry.stars,
    notes: entry.notes ?? null,
    link: entry.link ?? entry.mapUrl ?? null,
    logged_by: entry.logged_by,
    logged_name: entry.logged_name,
    guild_id: entry.guild_id,
    logged_at: entry.logged_at,
  };
}

function load() {
  if (!existsSync(FILE)) return { nextId: 1, cafes: [] };
  try {
    const data = JSON.parse(readFileSync(FILE, "utf8"));
    const cafes = Array.isArray(data.cafes) ? data.cafes.map(migrate) : [];
    return {
      nextId: data.nextId ?? (cafes.length ? Math.max(...cafes.map((c) => c.id)) + 1 : 1),
      cafes,
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

export function addEntry(entry) {
  const id = state.nextId++;
  state.cafes.push({
    id,
    category: entry.category,
    name: entry.name,
    subtitle: entry.subtitle ?? null,
    stars: entry.stars,
    notes: entry.notes ?? null,
    link: entry.link ?? null,
    logged_by: entry.loggedBy,
    logged_name: entry.loggedName,
    guild_id: entry.guildId,
    logged_at: new Date().toISOString(),
  });
  persist();
  return id;
}

export function listEntries(guildId, category) {
  return state.cafes
    .filter((c) => c.guild_id === guildId && c.category === category)
    .sort((a, b) => (a.logged_at < b.logged_at ? 1 : a.logged_at > b.logged_at ? -1 : 0));
}

// Delete one entry by id, scoped to its guild + category. Returns the removed
// entry, or null if nothing matched.
export function deleteEntry(id, guildId, category) {
  const idx = state.cafes.findIndex(
    (c) => c.id === id && c.guild_id === guildId && c.category === category,
  );
  if (idx === -1) return null;
  const [removed] = state.cafes.splice(idx, 1);
  persist();
  return removed;
}
