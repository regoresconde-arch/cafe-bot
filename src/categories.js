// Single source of truth for every loggable category. Both the command
// registration (commands.js) and the runtime (index.js) are generated from this,
// so adding a new category is a one-line change here.

export const CATEGORIES = [
  { key: "cafe", noun: "cafe", plural: "cafes", emoji: "☕", subtitleLabel: "Where", lookup: { kind: "places", type: "cafe" } },
  { key: "resto", noun: "restaurant", plural: "restos", emoji: "🍽️", subtitleLabel: "Where", lookup: { kind: "places", type: "restaurant" } },
  { key: "anime", noun: "anime", plural: "animes", emoji: "🍿", subtitleLabel: "Info", lookup: { kind: "anime" } },
  { key: "show", noun: "show", plural: "shows", emoji: "📺", subtitleLabel: "Year", lookup: { kind: "tmdb", type: "tv" } },
  { key: "movie", noun: "movie", plural: "movies", emoji: "🎬", subtitleLabel: "Year", lookup: { kind: "tmdb", type: "movie" } },
];

export const logName = (key) => `log${key}`;
export const deleteName = (key) => `delete${key}`;
export const byKey = (key) => CATEGORIES.find((c) => c.key === key);
