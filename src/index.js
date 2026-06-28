import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { addEntry, listEntries, deleteEntry } from "./db.js";
import { CATEGORIES, logName, deleteName, byKey } from "./categories.js";
import { placesAutocomplete, placeDetails, placeImage } from "./places.js";
import { tmdbSearch, tmdbDetails } from "./tmdb.js";
import { animeSearch, animeDetails } from "./anime.js";
import { chat, llmConfigured } from "./llm.js";
import { buildSystem, buildPrompt } from "./persona.js";

const { DISCORD_TOKEN } = process.env;
if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

// GuildMessages lets us receive messageCreate events. We deliberately do NOT
// request the privileged MessageContent intent: Discord still includes message
// content for messages that @mention the bot, which is all this feature needs —
// and requesting it un-toggled would block login entirely.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// Command-name -> category lookups, built from the shared config.
const byLog = new Map(CATEGORIES.map((c) => [logName(c.key), c]));
const byList = new Map(CATEGORIES.map((c) => [c.plural, c]));
const byDelete = new Map(CATEGORIES.map((c) => [deleteName(c.key), c]));

// Pending logs awaiting a star click, keyed by a short token in the button id.
const pending = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000;

// Resolved picks from autocomplete, keyed by the choice's submitted value, so
// selecting a suggestion needs no extra API call. Lightly capped.
const pickCache = new Map();
function rememberPick(value, info) {
  pickCache.set(value, info);
  if (pickCache.size > 2000) pickCache.delete(pickCache.keys().next().value);
}

function makeToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Per-channel short-term chat memory for @mention conversations.
const convo = new Map();
const CONVO_TURNS = 12; // keep ~12 exchanges
const CONVO_IDLE_MS = 30 * 60 * 1000; // reset after 30 min idle

const STAR = "⭐";
const starsText = (n) => STAR.repeat(n) + "☆".repeat(5 - n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// --- lookup dispatch -------------------------------------------------------

async function lookupAutocomplete(cat, input) {
  const l = cat.lookup;
  if (l.kind === "places") return placesAutocomplete(input, l.type);
  if (l.kind === "tmdb") return tmdbSearch(l.type, input);
  if (l.kind === "anime") return animeSearch(input);
  return [];
}

async function lookupDetails(cat, id) {
  const l = cat.lookup;
  if (l.kind === "places") return placeDetails(id);
  if (l.kind === "tmdb") return tmdbDetails(l.type, id);
  if (l.kind === "anime") return animeDetails(id);
  return null;
}

// --- event routing ---------------------------------------------------------

client.once("clientReady", (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const n = interaction.commandName;
      if (byLog.has(n)) return handleLog(interaction, byLog.get(n));
      if (byList.has(n)) return handleList(interaction, byList.get(n));
      if (byDelete.has(n)) return handleDeletePrompt(interaction, byDelete.get(n));
    } else if (interaction.isAutocomplete()) {
      if (byLog.has(interaction.commandName)) {
        return handleAutocomplete(interaction, byLog.get(interaction.commandName));
      }
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith("star:")) return handleStarClick(interaction);
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith("del:")) return handleDeleteSelect(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Something went wrong. Try again.", ephemeral: true });
    }
  }
});

// --- handlers --------------------------------------------------------------

async function handleAutocomplete(interaction, cat) {
  const focused = interaction.options.getFocused();
  const results = await lookupAutocomplete(cat, focused);

  const seen = new Set();
  const choices = [];
  for (const r of results) {
    // "#<id>" marks a real pick; the cache holds its resolved fields.
    let value = `#${r.id}`;
    if (value.length > 100) value = r.name.slice(0, 100);
    if (seen.has(value)) continue; // Discord rejects duplicate choice values
    seen.add(value);
    rememberPick(value, { name: r.name, subtitle: r.subtitle, link: r.link, image: r.image ?? null });
    const label = (r.subtitle ? `${r.name} — ${r.subtitle}` : r.name).slice(0, 100);
    choices.push({ name: label, value });
    if (choices.length >= 25) break;
  }

  await interaction.respond(choices);
}

async function handleLog(interaction, cat) {
  const raw = interaction.options.getString("name", true);
  const notes = interaction.options.getString("notes") ?? null;

  let name = raw;
  let subtitle = null;
  let link = null;
  let image = null;
  // The submitted value of a chosen suggestion is "#<id>"; keep the id so we can
  // lazily fetch a place photo later (places don't return one at autocomplete time).
  const id = raw.startsWith("#") ? raw.slice(1) : null;

  const cached = pickCache.get(raw);
  if (cached) {
    ({ name, subtitle, link, image } = cached);
  } else if (raw.startsWith("#")) {
    // A suggestion was chosen but the cache was lost (e.g. restart) — resolve it.
    await interaction.deferReply({ ephemeral: true });
    const details = await lookupDetails(cat, id);
    if (!details?.name) {
      return interaction.editReply(`Couldn't fetch that ${cat.noun} just now — try \`/${logName(cat.key)}\` again.`);
    }
    ({ name, subtitle, link } = details);
    image = details.image ?? null;
  }

  const token = makeToken();
  pending.set(token, {
    category: cat.key,
    id,
    name,
    subtitle,
    notes,
    link,
    image,
    loggedBy: interaction.user.id,
    loggedName: interaction.member?.displayName ?? interaction.user.username,
    guildId: interaction.guildId,
  });
  setTimeout(() => pending.delete(token), PENDING_TTL_MS);

  const row = new ActionRowBuilder().addComponents(
    ...[1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`star:${token}:${n}`)
        .setLabel(`${n}`)
        .setEmoji("⭐")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  const content = [`**${name}**`, subtitle, "", "How many stars?"]
    .filter((l) => l !== null)
    .join("\n");

  if (interaction.deferred) {
    await interaction.editReply({ content, components: [row] });
  } else {
    await interaction.reply({ content, components: [row], ephemeral: true });
  }
}

async function handleStarClick(interaction) {
  const [, token, starsRaw] = interaction.customId.split(":");
  const stars = Number(starsRaw);
  const data = pending.get(token);

  if (!data) {
    return interaction.update({ content: "This rating prompt expired. Run the log command again.", components: [] });
  }
  if (interaction.user.id !== data.loggedBy) {
    return interaction.reply({ content: "Only the person who started this log can rate it.", ephemeral: true });
  }

  pending.delete(token);
  addEntry({ ...data, stars });

  const cat = byKey(data.category);
  await interaction.update({
    content: `Logged **${data.name}** — ${starsText(stars)}`,
    components: [],
  });

  // Places don't return a photo at autocomplete time — fetch one now (the update
  // above already acknowledged the click, so this extra call has no time limit).
  let image = data.image;
  if (!image && data.id && cat?.lookup.kind === "places") {
    image = await placeImage(data.id);
  }

  const embed = new EmbedBuilder()
    .setTitle(`${cat?.emoji ?? ""} ${data.name}`.trim())
    .setDescription(starsText(stars))
    .setFooter({ text: `Logged by ${data.loggedName}` })
    .setTimestamp(new Date());
  if (data.subtitle) embed.addFields({ name: cat?.subtitleLabel ?? "Details", value: data.subtitle });
  if (data.notes) embed.addFields({ name: "Notes", value: data.notes });
  if (data.link) embed.setURL(data.link);
  if (image) embed.setImage(image);

  await interaction.followUp({ embeds: [embed] });
}

async function handleList(interaction, cat) {
  const rows = listEntries(interaction.guildId, cat.key);

  if (rows.length === 0) {
    return interaction.reply({
      content: `No ${cat.plural} logged yet. Use \`/${logName(cat.key)}\` to add the first one!`,
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji} Logged ${cap(cat.plural)}`)
    .setColor(0xa9744f)
    .setFooter({ text: `${rows.length} logged` });

  for (const r of rows.slice(0, 25)) {
    const when = `<t:${Math.floor(new Date(r.logged_at).getTime() / 1000)}:R>`;
    const parts = [`${starsText(r.stars)} · ${when} · by ${r.logged_name}`];
    if (r.subtitle) parts.push(`_${r.subtitle}_`);
    if (r.notes) parts.push(r.notes);
    embed.addFields({ name: r.name, value: parts.join("\n") });
  }

  if (rows.length > 25) {
    embed.setDescription(`Showing the 25 most recent of ${rows.length}.`);
  }

  await interaction.reply({ embeds: [embed] });
}

async function handleDeletePrompt(interaction, cat) {
  const rows = listEntries(interaction.guildId, cat.key);

  if (rows.length === 0) {
    return interaction.reply({ content: `Nothing to delete — no ${cat.plural} logged yet.`, ephemeral: true });
  }

  const options = rows.slice(0, 25).map((r) => {
    const date = new Date(r.logged_at).toISOString().slice(0, 10);
    return {
      label: r.name.slice(0, 100),
      description: `${starsText(r.stars)} · ${date} · by ${r.logged_name}`.slice(0, 100),
      value: String(r.id),
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`del:${cat.key}`)
    .setPlaceholder(`Pick a ${cat.noun} to delete`)
    .addOptions(options);

  const note = rows.length > 25 ? "\n_(showing the 25 most recent)_" : "";
  await interaction.reply({
    content: `Which ${cat.noun} should I delete?${note}`,
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

async function handleDeleteSelect(interaction) {
  const category = interaction.customId.split(":")[1];
  const id = Number(interaction.values[0]);
  const removed = deleteEntry(id, interaction.guildId, category);

  if (!removed) {
    return interaction.update({ content: "That entry was already deleted.", components: [] });
  }

  await interaction.update({
    content: `🗑️ Deleted **${removed.name}** — ${starsText(removed.stars)}`,
    components: [],
  });
}

// Casual conversation when the bot is @mentioned.
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot || !client.user) return;
    if (!message.mentions.has(client.user) || message.mentions.everyone) return;

    const content = message.content.replace(/<@!?\d+>/g, "").trim();
    if (!content) {
      await message.reply("oy? anong kailangan mo? 👀");
      return;
    }
    if (!llmConfigured()) {
      await message.reply("_(chat isn't set up yet — no Claude token configured)_");
      return;
    }

    const speaker = message.member?.displayName ?? message.author.username;

    const now = Date.now();
    let state = convo.get(message.channelId);
    if (!state || now - state.updated > CONVO_IDLE_MS) state = { turns: [], updated: now };

    await message.channel.sendTyping();

    let reply;
    try {
      reply = await chat({
        system: buildSystem(speaker),
        prompt: buildPrompt(state.turns, speaker, content),
      });
    } catch (err) {
      console.error("Chat error:", err.message);
      await message.reply("sandali, nag-glitch ako 😵‍💫 try mo ulit.");
      return;
    }
    reply = reply || "...";

    state.turns.push({ role: "user", name: speaker, content });
    state.turns.push({ role: "assistant", name: "you", content: reply });
    if (state.turns.length > CONVO_TURNS * 2) {
      state.turns.splice(0, state.turns.length - CONVO_TURNS * 2);
    }
    state.updated = now;
    convo.set(message.channelId, state);

    await message.reply(reply.length > 1900 ? `${reply.slice(0, 1900)}…` : reply);
  } catch (err) {
    console.error("messageCreate error:", err);
  }
});

client.login(DISCORD_TOKEN);
