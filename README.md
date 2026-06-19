# ☕ Cafe Bot

A Discord bot with slash commands for logging cafes you've visited and giving them a
star review. Logs are shared per server.

## Commands

| Command | What it does |
| --- | --- |
| `/logcafe name:<cafe> [notes:<text>]` | Stores the cafe name exactly as you type it, then shows ⭐1–5 buttons. Click one to save the visit. |
| `/cafes` | Lists every cafe logged in this server with stars, who logged it, and when. |
| `/deletecafe` | Pops up a dropdown of logged cafes; pick one to remove it. |

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
  Plenty for a personal-scale cafe log.
- `/cafes` shows the 25 most recent entries (a Discord embed limit). Easy to paginate
  later if your list grows.
