// The Movie Database (TMDB) lookup for movies and TV shows.
// Needs a free TMDB v3 API key in TMDB_API_KEY. Degrades to empty/null on error.

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

export function tmdbEnabled() {
  return Boolean(API_KEY);
}

async function fetchWithTimeout(url, ms = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const title = (r) => r.title ?? r.name ?? "";
const year = (r) => (r.release_date || r.first_air_date || "").slice(0, 4) || null;
const link = (type, id) => `https://www.themoviedb.org/${type}/${id}`;
const poster = (r) => (r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null);

/**
 * Search TMDB for a movie ("movie") or TV show ("tv").
 * @returns {Promise<Array<{id: string, name: string, subtitle: string|null, link: string}>>}
 */
export async function tmdbSearch(type, input) {
  if (!API_KEY || !input || !input.trim()) return [];
  try {
    const url = `${BASE}/search/${type}?api_key=${API_KEY}&include_adult=false&language=en-US&query=${encodeURIComponent(input)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return results
      .map((r) => ({ id: String(r.id), name: title(r), subtitle: year(r), link: link(type, r.id), image: poster(r) }))
      .filter((r) => r.name);
  } catch {
    return [];
  }
}

/**
 * Resolve a TMDB id (fallback when the autocomplete cache was lost).
 * @returns {Promise<{name: string, subtitle: string|null, link: string}|null>}
 */
export async function tmdbDetails(type, id) {
  if (!API_KEY || !id) return null;
  try {
    const res = await fetchWithTimeout(`${BASE}/${type}/${id}?api_key=${API_KEY}&language=en-US`);
    if (!res.ok) return null;
    const r = await res.json();
    if (!title(r)) return null;
    return { name: title(r), subtitle: year(r), link: link(type, id), image: poster(r) };
  } catch {
    return null;
  }
}
