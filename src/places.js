// Google Places API (New) lookup, restricted to the Philippines and to cafes.
// Powers the live autocomplete on /logcafe. Every function degrades to a safe
// empty/null result on error so logging keeps working even if the API is down.

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";

export function placesEnabled() {
  return Boolean(API_KEY);
}

export function mapsUrl(placeId) {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

async function fetchWithTimeout(url, options, ms = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Autocomplete PH cafes for a free-text input.
 * @returns {Promise<Array<{placeId: string, name: string, address: string|null}>>}
 */
export async function autocompleteCafes(input) {
  if (!API_KEY || !input || !input.trim()) return [];
  try {
    const res = await fetchWithTimeout(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": API_KEY },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["ph"],
        includedPrimaryTypes: ["cafe"],
        languageCode: "en",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    return suggestions
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p) => ({
        placeId: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        address: p.structuredFormat?.secondaryText?.text ?? null,
      }))
      .filter((p) => p.placeId && p.name);
  } catch {
    return [];
  }
}

/**
 * Resolve a place id to {name, address} via Place Details (New). Used only as a
 * fallback when the in-memory autocomplete cache was lost (e.g. a bot restart
 * between picking a suggestion and submitting the command).
 * @returns {Promise<{name: string|null, address: string|null}|null>}
 */
export async function getPlaceDetails(placeId) {
  if (!API_KEY || !placeId) return null;
  try {
    const res = await fetchWithTimeout(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask": "displayName,formattedAddress",
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { name: data.displayName?.text ?? null, address: data.formattedAddress ?? null };
  } catch {
    return null;
  }
}
