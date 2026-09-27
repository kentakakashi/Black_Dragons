const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const leaderboards = require("../systems/leaderboards");

module.exports = {
  name: "publish-leaderboards",
  async execute(interaction, context) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ Only **Administrators** can publish the live leaderboards.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await leaderboards.refreshAll(context.client, context.data);
      const missing = [];
      if (!result.ranking.ok) missing.push("Ranking Titles channel");
      if (!result.topKills.ok) missing.push("Top Kills channel");
      const description =
        (result.ranking.ok ? "✅ Ranking Titles" : "❌ Ranking Titles") + "\n" +
        (result.topKills.ok ? "✅ Top Kills" : "❌ Top Kills") +
        (missing.length
          ? "\n\nConfigure/fix: **" + missing.join("**, **") + "** in /setup → Leaderboards."
          : "\n\nBoth are now permanent live messages and will refresh automatically.");
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(missing.length ? 0xED4245 : 0x57F287)
            .setTitle(missing.length ? "⚠️ LEADERBOARDS NOT FULLY PUBLISHED" : "✅ LEADERBOARDS PUBLISHED")
            .setDescription(description)
        ]
      });
    } catch (error) {
      console.error("❌ Leaderboard publish failed:", error);
      await interaction.editReply({ content: "❌ Could not publish the leaderboards: " + (error?.message || "Unknown error") });
    }
  }
};