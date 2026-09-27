const { PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require("discord.js");

function admin(i) {
  return i.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

module.exports = {
  name: "embed",
  async execute(interaction) {
    if (!admin(interaction)) {
      return interaction.reply({
        content: "❌ Only **Administrators** can use the embed editor.",
        ephemeral: true
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("embed:category")
      .setPlaceholder("Choose an embed category")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Leaderboards")
          .setDescription("Edit ranking titles and top-kills live embeds.")
          .setEmoji("🏆")
          .setValue("leaderboards")
      );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8B0000)
          .setTitle("🛠️ BLACK DRAGONS • EMBED EDITOR")
          .setDescription("Choose an embed category to edit.\n\n🏆 **Leaderboards** — ranking titles + top kills.")
      ],
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }
};