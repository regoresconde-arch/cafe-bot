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
import { addCafe, listCafes, deleteCafe } from "./db.js";
import { autocompleteCafes, getPlaceDetails, mapsUrl } from "./places.js";

const { DISCORD_TOKEN } = process.env;
if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Pending logs awaiting a star click, keyed by a short token embedded in the
// button customId. Cleared after it's used or after a timeout.
const pending = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

function makeToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const STAR = "⭐";
const starsText = (n) => STAR.repeat(n) + "☆".repeat(5 - n);

// Maps an autocomplete choice's submitted value -> the resolved cafe, captured
// at autocomplete time so picking a suggestion needs no extra API call. Trimmed
// to a rough cap so it can't grow without bound.
const placeCache = new Map();
function rememberPlace(value, info) {
  placeCache.set(value, info);
  if (placeCache.size > 1000) placeCache.delete(placeCache.keys().next().value);
}

client.once("clientReady", (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "logcafe") return handleLogCafe(interaction);
      if (interaction.commandName === "cafes") return handleListCafes(interaction);
      if (interaction.commandName === "deletecafe") return handleDeleteCafePrompt(interaction);
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith("star:")) return handleStarClick(interaction);
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "delcafe") return handleDeleteCafeSelect(interaction);
    } else if (interaction.isAutocomplete()) {
      if (interaction.commandName === "logcafe") return handleLogCafeAutocomplete(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Something went wrong. Try again.", ephemeral: true });
    }
  }
});

async function handleLogCafeAutocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const results = await autocompleteCafes(focused);

  const choices = results.slice(0, 25).map((r) => {
    // Submit the place id (prefixed) so the handler knows a real cafe was chosen.
    let value = `g:${r.placeId}`;
    if (value.length > 100) value = r.name.slice(0, 100); // Discord value cap
    rememberPlace(value, { name: r.name, address: r.address, placeId: r.placeId });
    const label = (r.address ? `${r.name} — ${r.address}` : r.name).slice(0, 100);
    return { name: label, value };
  });

  await interaction.respond(choices);
}

async function handleLogCafe(interaction) {
  const raw = interaction.options.getString("name", true);
  const notes = interaction.options.getString("notes") ?? null;

  // Resolve the cafe: a picked suggestion (cache hit, or details fallback on a
  // cache miss) vs. plain typed text (stored as-is).
  let name = raw;
  let address = null;
  let placeId = null;

  const cached = placeCache.get(raw);
  if (cached) {
    ({ name, address, placeId } = cached);
  } else if (raw.startsWith("g:")) {
    await interaction.deferReply({ ephemeral: true });
    placeId = raw.slice(2);
    const details = await getPlaceDetails(placeId);
    if (!details?.name) {
      return interaction.editReply("Couldn't fetch that cafe just now — try `/logcafe` again.");
    }
    name = details.name;
    address = details.address;
  }

  const token = makeToken();
  pending.set(token, {
    name,
    address,
    notes,
    mapUrl: placeId ? mapsUrl(placeId) : null,
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

  const content = [`**${name}**`, address ?? null, "", "How many stars?"]
    .filter((l) => l !== null)
    .join("\n");

  // If we deferred (cache-miss fallback), we must edit rather than reply.
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
    return interaction.update({
      content: "This rating prompt expired. Run `/logcafe` again.",
      components: [],
    });
  }
  if (interaction.user.id !== data.loggedBy) {
    return interaction.reply({ content: "Only the person who started this log can rate it.", ephemeral: true });
  }

  pending.delete(token);
  addCafe({ ...data, stars });

  // Private confirmation (the prompt was ephemeral)...
  await interaction.update({
    content: `Logged **${data.name}** — ${starsText(stars)}`,
    components: [],
  });

  // ...plus a public note in the channel so the shared log feels alive.
  const embed = new EmbedBuilder()
    .setTitle(`☕ ${data.name}`)
    .setDescription(starsText(stars))
    .setFooter({ text: `Logged by ${data.loggedName}` })
    .setTimestamp(new Date());
  if (data.address) embed.addFields({ name: "Where", value: data.address });
  if (data.notes) embed.addFields({ name: "Notes", value: data.notes });
  if (data.mapUrl) embed.setURL(data.mapUrl);

  await interaction.followUp({ embeds: [embed] });
}

async function handleListCafes(interaction) {
  const rows = listCafes(interaction.guildId);

  if (rows.length === 0) {
    return interaction.reply({
      content: "No cafes logged yet. Use `/logcafe` to add the first one!",
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("☕ Logged Cafes")
    .setColor(0xa9744f)
    .setFooter({ text: `${rows.length} cafe${rows.length === 1 ? "" : "s"} logged` });

  // Discord embeds cap at 25 fields; show the most recent 25.
  for (const r of rows.slice(0, 25)) {
    const when = `<t:${Math.floor(new Date(r.logged_at).getTime() / 1000)}:R>`;
    const parts = [`${starsText(r.stars)} · ${when} · by ${r.logged_name}`];
    if (r.notes) parts.push(`_${r.notes}_`);
    embed.addFields({ name: r.name, value: parts.join("\n") });
  }

  if (rows.length > 25) {
    embed.setDescription(`Showing the 25 most recent of ${rows.length} logged cafes.`);
  }

  await interaction.reply({ embeds: [embed] });
}

async function handleDeleteCafePrompt(interaction) {
  const rows = listCafes(interaction.guildId);

  if (rows.length === 0) {
    return interaction.reply({ content: "Nothing to delete — no cafes logged yet.", ephemeral: true });
  }

  // String select menus allow at most 25 options; offer the most recent 25.
  const options = rows.slice(0, 25).map((r) => {
    const date = new Date(r.logged_at).toISOString().slice(0, 10);
    return {
      label: r.name.slice(0, 100),
      description: `${starsText(r.stars)} · ${date} · by ${r.logged_name}`.slice(0, 100),
      value: String(r.id),
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("delcafe")
    .setPlaceholder("Pick a cafe to delete")
    .addOptions(options);

  const note =
    rows.length > 25 ? "\n_(showing the 25 most recent)_" : "";

  await interaction.reply({
    content: `Which cafe should I delete?${note}`,
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

async function handleDeleteCafeSelect(interaction) {
  const id = Number(interaction.values[0]);
  const removed = deleteCafe(id, interaction.guildId);

  if (!removed) {
    return interaction.update({ content: "That cafe was already deleted.", components: [] });
  }

  await interaction.update({
    content: `🗑️ Deleted **${removed.name}** — ${starsText(removed.stars)}`,
    components: [],
  });
}

client.login(DISCORD_TOKEN);
