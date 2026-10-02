const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");

const ai = require("../systems/ai");

module.exports = {
  name: "wack-brain",

  async execute(interaction) {
    if (!interaction.guildId || !interaction.channelId) {
      return interaction.reply({
        content: "❌ This command can only be used inside a server channel.",
        ephemeral: true
      });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ Only server administrators can reset the channel conversation.",
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await ai.resetConversation(
        interaction.guildId,
        interaction.channelId
      );

      return interaction.editReply({
        content:
          "🧠 **Wack. Fresh start.** I've cleared the conversation context for this channel. " +
          "I still remember members' saved facts, preferences and individual memories."
      });
    } catch (error) {
      console.error("❌ /wack-brain failed:", error);
      return interaction.editReply({
        content: "❌ I couldn't reset the conversation just now. Please try again."
      });
    }
  }
};

module.exports.data = new SlashCommandBuilder()
  .setName("wack-brain")
  .setDescription("Forget the current channel conversation and start fresh.")
  .setDefaultMemberPermissions(
    PermissionFlagsBits.Administrator.toString()
  );
