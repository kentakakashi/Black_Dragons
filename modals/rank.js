const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

function createRankModal(isUpdate) {
  return new ModalBuilder()
    .setCustomId(isUpdate ? "rank_update_modal" : "rank_register_modal")
    .setTitle(isUpdate ? "🔄 UPDATE KILL RANK" : "📝 REGISTER KILL RANK")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("roblox_username")
          .setLabel("Roblox Username")
          .setPlaceholder("Enter your exact Roblox username")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("kill_count")
          .setLabel("Current Kill Count")
          .setPlaceholder("Example: 8247")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
      )
    );
}

module.exports = { createRankModal };
