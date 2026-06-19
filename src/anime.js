// Anime lookup via the Jikan API (unofficial MyAnimeList). Free, no API key.
// Degrades to empty/null on any error so logging still works.

const BASE = "https://api.jikan.moe/v4";

async function fetchWithTimeout(url, ms = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function shape(a) {
  const name = a.title_english || a.title || "";
  const bits = [a.type, a.year].filter(Boolean);
  return {
    id: String(a.mal_id),
    name,
    subtitle: bits.length ? bits.join(" · ") : null,
    link: a.url ?? null,
  };
}

/**
 * Search anime by title.
 * @returns {Promise<Array<{id: string, name: string, subtitle: string|null, link: string|null}>>}
 */
export async function animeSearch(input) {
  if (!input || !input.trim()) return [];
  try {
    const url = `${BASE}/anime?q=${encodeURIComponent(input)}&limit=10&sfw=true`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data.data) ? data.data : [];
    return results.map(shape).filter((a) => a.id && a.name);
  } catch {
    return [];
  }
}

/**
 * Resolve an anime id (fallback when the autocomplete cache was lost).
 * @returns {Promise<{name: string, subtitle: string|null, link: string|null}|null>}
 */
export async function animeDetails(id) {
  if (!id) return null;
  try {
    const res = await fetchWithTimeout(`${BASE}/anime/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data) return null;
    const a = shape(data.data);
    return a.name ? a : null;
  } catch {
    return null;
  }
}
