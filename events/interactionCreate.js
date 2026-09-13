const { Events } = require("discord.js");
const { handleHelpDeskButton, handleHelpDeskModal } = require("../buttons/helpDesk");
const { handleRankButton, handleRankModal, handleDeclineModal } = require("../buttons/rank");
const { handleSetupButton } = require("../buttons/setup");
const leaderboard = require("../commands/leaderboard");

module.exports = function registerInteractionCreate(client) {
  client.on(Events.InteractionCreate, async interaction => {
    const context = {
      client,
      data: client.appData
    };

    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        await command.execute(interaction, context);
        return;
      }

      if (interaction.isButton()) {
        if (await handleHelpDeskButton(interaction, client.appData)) return;
        if (await handleRankButton(interaction, client.appData)) return;
        if (await handleSetupButton(interaction, client.appData)) return;
        if (await leaderboard.handleButton(interaction, context)) return;
        return;
      }

      if (interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
        if (await handleSetupButton(interaction, client.appData)) return;
        return;
      }

      if (interaction.isModalSubmit()) {
        if (await handleHelpDeskModal(interaction, client.appData, client)) return;
        if (await handleRankModal(interaction, client.appData, client)) return;
        if (await handleDeclineModal(interaction, client.appData, client)) return;
      }
    } catch (error) {
      console.error("❌ Interaction handler failed:", error);

      const response = {
        content: "❌ Something went wrong while processing that action.",
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        try {
          await interaction.followUp(response);
        } catch {}
      } else {
        try {
          await interaction.reply(response);
        } catch {}
      }
    }
  });
};
