// Google Places API (New) lookup, restricted to the Philippines. Used for cafes
// and restaurants. Degrades to empty/null on any error so logging still works.

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";

export function placesEnabled() {
  return Boolean(API_KEY);
}

function mapsUrl(placeId) {
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
 * Autocomplete PH places of a given primary type ("cafe" | "restaurant").
 * @returns {Promise<Array<{id: string, name: string, subtitle: string|null, link: string}>>}
 */
export async function placesAutocomplete(input, type) {
  if (!API_KEY || !input || !input.trim()) return [];
  try {
    const res = await fetchWithTimeout(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": API_KEY },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["ph"],
        includedPrimaryTypes: [type],
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
        id: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        subtitle: p.structuredFormat?.secondaryText?.text ?? null,
        link: mapsUrl(p.placeId),
      }))
      .filter((p) => p.id && p.name);
  } catch {
    return [];
  }
}

/**
 * Resolve a place id (fallback when the autocomplete cache was lost).
 * @returns {Promise<{name: string, subtitle: string|null, link: string}|null>}
 */
export async function placeDetails(id) {
  if (!API_KEY || !id) return null;
  try {
    const res = await fetchWithTimeout(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
      {
        headers: {
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask": "displayName,formattedAddress",
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.displayName?.text) return null;
    return { name: data.displayName.text, subtitle: data.formattedAddress ?? null, link: mapsUrl(id) };
  } catch {
    return null;
  }
}
