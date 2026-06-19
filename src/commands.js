import { SlashCommandBuilder } from "discord.js";
import { CATEGORIES, logName, deleteName } from "./categories.js";

// Three commands per category: log / list / delete. All generated from CATEGORIES.
export const commands = [];

for (const c of CATEGORIES) {
  commands.push(
    new SlashCommandBuilder()
      .setName(logName(c.key))
      .setDescription(`Log a ${c.noun} and give it a star rating.`)
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription(`Start typing — pick a ${c.noun} from the suggestions`)
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt.setName("notes").setDescription("Optional notes").setRequired(false),
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName(c.plural)
      .setDescription(`List every ${c.noun} logged in this server.`)
      .toJSON(),

    new SlashCommandBuilder()
      .setName(deleteName(c.key))
      .setDescription(`Remove a logged ${c.noun} (pick it from a dropdown).`)
      .toJSON(),
  );
}
