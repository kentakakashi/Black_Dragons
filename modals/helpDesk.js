const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

function createRequestModal(customId, title, reasonPlaceholder) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("region")
          .setLabel("Region")
          .setPlaceholder("Example: India / Asia / Europe / NA")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("server_link")
          .setLabel("Server / Game Link")
          .setPlaceholder("Paste the game/server link")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(500)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Reason")
          .setPlaceholder(reasonPlaceholder)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("clan")
          .setLabel("Clan / People Names")
          .setPlaceholder("Enter the clan or people involved")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
      )
    );
}

function createWarModal() {
  return createRequestModal("war_modal", "⚔️ WAR REQUEST", "Why do you need members for the war?");
}

function createBackupModal() {
  return createRequestModal("backup_modal", "🛡️ BACKUP REQUEST", "Why do you need backup?");
}

module.exports = { createWarModal, createBackupModal };
