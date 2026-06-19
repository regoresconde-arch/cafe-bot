// Optional cafe recognition via OpenStreetMap's Nominatim search API.
// No API key required. Their usage policy asks for a descriptive User-Agent and
// limits to ~1 request/second, which is far below what this bot will do.

const CONTACT = process.env.OSM_CONTACT || "cafe-bot (example contact)";
const USER_AGENT = `cafe-bot/1.0 (${CONTACT})`;

/**
 * Look up a cafe by free-text name. Returns the best match or null.
 * Never throws — on any failure it resolves to null so logging still works.
 *
 * @param {string} query
 * @returns {Promise<{name: string, address: string|null, lat: string, lon: string, mapUrl: string}|null>}
 */
export async function lookupCafe(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const r = results[0];
    // Prefer the named place; fall back to the formatted display name.
    const name = r.name && r.name.trim() ? r.name : r.display_name.split(",")[0];
    const address = r.display_name || null;

    return {
      name,
      address,
      lat: r.lat,
      lon: r.lon,
      mapUrl: `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=18/${r.lat}/${r.lon}`,
    };
  } catch {
    return null; // network error, timeout, bad JSON — degrade gracefully
  }
}
