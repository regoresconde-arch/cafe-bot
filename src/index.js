import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { addCafe, listCafes } from "./db.js";
import { lookupCafe } from "./osm.js";

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

client.once("clientReady", (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "logcafe") return handleLogCafe(interaction);
      if (interaction.commandName === "cafes") return handleListCafes(interaction);
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith("star:")) return handleStarClick(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Something went wrong. Try again.", ephemeral: true });
    }
  }
});

async function handleLogCafe(interaction) {
  const query = interaction.options.getString("name", true);
  const notes = interaction.options.getString("notes") ?? null;

  await interaction.deferReply({ ephemeral: true });

  // Optional recognition — falls back to exactly what the user typed.
  const match = await lookupCafe(query);
  const name = match?.name ?? query;
  const address = match?.address ?? null;

  const token = makeToken();
  pending.set(token, {
    name,
    address,
    notes,
    mapUrl: match?.mapUrl ?? null,
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

  const lines = [`**${name}**`];
  if (address) lines.push(address);
  if (!match) lines.push("_(no internet match found — logging the name as typed)_");
  lines.push("", "How many stars?");

  await interaction.editReply({ content: lines.join("\n"), components: [row] });
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

client.login(DISCORD_TOKEN);
