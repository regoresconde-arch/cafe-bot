# ☕ Log Bot

A Discord bot for logging things you've experienced — cafes, restaurants, anime,
TV shows, and movies — each with a ⭐1–5 star review. Logs are shared per server.
Every log command has live autocomplete that recognizes the real title/place.

## Commands

Each category has three commands (`log` / list / `delete`):

| Category | Log | List | Delete | Recognized via |
| --- | --- | --- | --- | --- |
| Cafes | `/logcafe` | `/cafes` | `/deletecafe` | Google Places (PH) |
| Restaurants | `/logresto` | `/restos` | `/deleteresto` | Google Places (PH) |
| Anime | `/loganime` | `/animes` | `/deleteanime` | Jikan / MyAnimeList (no key) |
| TV shows | `/logshow` | `/shows` | `/deleteshow` | TMDB |
| Movies | `/logmovie` | `/movies` | `/deletemovie` | TMDB |

- **Log**: start typing the name — suggestions appear; pick one (or type freely),
  then click a star to save. Run it in the matching channel and the public log
  posts there.
- **List**: shows that category's entries with stars, who logged it, and when.
- **Delete**: pick an entry from a dropdown to remove it.

Add a new category by adding one line to [`src/categories.js`](src/categories.js).

## Setup

### 1. Create the Discord application
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Reset Token** → copy the token.
3. **General Information** → copy the **Application ID**.
4. In Discord, enable Developer Mode (Settings → Advanced), then right-click your
   server icon → **Copy Server ID**.

### 2. Invite the bot to your server
On the **OAuth2 → URL Generator** page, tick **`bot`** and **`applications.commands`**
scopes (no extra permissions are required since the bot only uses slash commands and
posts messages). Open the generated URL and add the bot to your server.

### 3. Configure
```sh
cp .env.example .env
```
Fill in `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID` in `.env`.

Optional API keys for autocomplete (each is independent — omit one and that
category just stores names as typed; anime needs no key):

- **`GOOGLE_MAPS_API_KEY`** — cafes & restaurants (PH).
  In the [Google Cloud Console](https://console.cloud.google.com/google/maps-apis),
  create a project, enable **Places API (New)**, create an **API key**, and
  (recommended) restrict it to *Places API (New)*. Region-locked to the
  Philippines (`includedRegionCodes: ["ph"]`).
- **`TMDB_API_KEY`** — movies & TV shows.
  Get a free **API Key (v3 auth)** at
  [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api). No billing.

### 4. Install, register commands, run
```sh
npm install
npm run register   # registers the slash commands in your server (run again if you change them)
npm start          # starts the bot
```

`npm run dev` runs with auto-restart on file changes.

## Notes
- Storage is a local JSON file (`cafes.json`) with atomic writes — no database server,
  no native build step, and no special Node version required (runs on **Node 18+**).
  All categories share this file, tagged by category.
- List commands show the 25 most recent entries (a Discord embed limit). Easy to
  paginate later if your lists grow.
