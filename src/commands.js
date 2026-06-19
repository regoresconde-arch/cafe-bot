import { SlashCommandBuilder } from "discord.js";

// Slash command definitions shared by the registration script and the runtime.
export const commands = [
  new SlashCommandBuilder()
    .setName("logcafe")
    .setDescription("Log a cafe you visited, then pick a star rating.")
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Name of the cafe (and city helps the lookup, e.g. 'Blue Bottle, Tokyo')")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("notes")
        .setDescription("Optional notes about your visit")
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("cafes")
    .setDescription("List every cafe logged in this server with stars and date.")
    .toJSON(),
];
