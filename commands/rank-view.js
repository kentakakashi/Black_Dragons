const { EmbedBuilder } = require("discord.js");
const { createRankViewEmbed } = require("../embeds/rank");

module.exports = {
  name: "rank-view",
  async execute(interaction, context) {
    const target = interaction.options.getUser("user") || interaction.user;
    const record = context.data.rankUsers[target.id];

    if (!record) {
      await interaction.reply({
        content: `❌ ${target} does not have an approved Black Dragons rank yet.`,
        ephemeral: true
      });
      return;
    }

    const member = await interaction.guild.members.fetch(target.id);
    await interaction.reply({
      embeds: [createRankViewEmbed(member, record)]
    });
  }
};
