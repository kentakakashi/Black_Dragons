const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createLeaderboardEmbed } = require("../embeds/leaderboard");

const pageSize = 10;
const sessions = new Map();

module.exports = {
  name: "leaderboard",
  async execute(interaction, context) {
    const users = Object.values(context.data.rankUsers || {});

    if (!users.length) {
      await interaction.reply({
        content: "🏆 The kill leaderboard is currently empty."
      });
      return;
    }

    const key = `${interaction.guildId}:${interaction.user.id}`;
    sessions.set(key, { users, page: 0 });

    await interaction.reply({
      embeds: [createLeaderboardEmbed(users, 0, pageSize)],
      components: [buttons(0, users.length)]
    });
  },

  async handleButton(interaction, context) {
    if (!interaction.customId.startsWith("leaderboard:")) return false;

    const session = sessions.get(`${interaction.guildId}:${interaction.user.id}`);
    if (!session) {
      await interaction.reply({
        content: "❌ This leaderboard session expired. Run `/leaderboard` again.",
        ephemeral: true
      });
      return true;
    }

    const direction = interaction.customId.split(":")[1];
    const maxPage = Math.max(0, Math.ceil(session.users.length / pageSize) - 1);

    if (direction === "next") session.page = Math.min(maxPage, session.page + 1);
    if (direction === "prev") session.page = Math.max(0, session.page - 1);

    await interaction.update({
      embeds: [createLeaderboardEmbed(session.users, session.page, pageSize)],
      components: [buttons(session.page, session.users.length)]
    });

    return true;
  }
};

function buttons(page, count) {
  const maxPage = Math.max(0, Math.ceil(count / pageSize) - 1);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("leaderboard:prev")
      .setLabel("PREVIOUS")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId("leaderboard:next")
      .setLabel("NEXT")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= maxPage)
  );
}
