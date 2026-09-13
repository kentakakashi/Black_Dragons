const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

function createDeclineModal(applicationId) {
  return new ModalBuilder()
    .setCustomId(`rank_decline_modal:${applicationId}`)
    .setTitle("❌ DECLINE RANK APPLICATION")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("decline_reason")
          .setLabel("Reason for rejection")
          .setPlaceholder("Explain clearly why this application was declined.")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
}

module.exports = { createDeclineModal };
