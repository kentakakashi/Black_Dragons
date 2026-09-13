const { Events } = require("discord.js");

module.exports = function registerInteractionCreate(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ================================
      // SLASH COMMANDS
      // ================================
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
          console.error(
            `❌ Command not found: /${interaction.commandName}`
          );

          await interaction.reply({
            content: "❌ This command is not available.",
            ephemeral: true
          });

          return;
        }

        console.log(
          `📌 Running /${interaction.commandName} for ${interaction.user.tag}`
        );

        await command.execute(interaction, {
          client,
          data: client.appData
        });

        return;
      }

      // ================================
      // BUTTONS
      // ================================
      if (interaction.isButton()) {
        const customId = interaction.customId;

        // Help Desk buttons
        if (
          customId.startsWith("helpdesk_") ||
          customId === "war" ||
          customId === "backup" ||
          customId === "end_request"
        ) {
          const helpDesk = require("../buttons/helpDesk");

          const handled = await helpDesk.handleHelpDeskButton(
            interaction,
            client.appData
          );

          if (handled) return;
        }

        // Rank buttons
        if (customId.startsWith("rank_")) {
          const rank = require("../buttons/rank");

          const handled = await rank.handleRankButton(
            interaction,
            client.appData,
            client
          );

          if (handled) return;
        }

        // Setup buttons
        if (customId.startsWith("setup_")) {
          const setup = require("../buttons/setup");

          const handled = await setup.handleSetupButton(
            interaction,
            client.appData
          );

          if (handled) return;
        }

        // Leaderboard buttons
        if (customId.startsWith("leaderboard_")) {
          const leaderboard = require("../commands/leaderboard");

          if (
            typeof leaderboard.handleButton === "function"
          ) {
            const handled = await leaderboard.handleButton(
              interaction,
              {
                client,
                data: client.appData
              }
            );

            if (handled) return;
          }
        }

        return;
      }

      // ================================
      // SELECT MENUS
      // ================================
      if (
        interaction.isChannelSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isStringSelectMenu()
      ) {
        const setup = require("../buttons/setup");

        const handled = await setup.handleSetupButton(
          interaction,
          client.appData
        );

        if (handled) return;

        return;
      }

      // ================================
      // MODALS
      // ================================
      if (interaction.isModalSubmit()) {
        const customId = interaction.customId;

        // Help Desk modal
        if (customId.startsWith("helpdesk_")) {
          const helpDesk = require("../buttons/helpDesk");

          const handled = await helpDesk.handleHelpDeskModal(
            interaction,
            client.appData,
            client
          );

          if (handled) return;
        }

        // Rank modal
        if (customId.startsWith("rank_")) {
          const rank = require("../buttons/rank");

          const handled = await rank.handleRankModal(
            interaction,
            client.appData,
            client
          );

          if (handled) return;
        }

        // Decline modal
        if (customId.startsWith("decline_")) {
          const rank = require("../buttons/rank");

          const handled = await rank.handleDeclineModal(
            interaction,
            client.appData,
            client
          );

          if (handled) return;
        }

        return;
      }
    } catch (error) {
      console.error(
        "❌ Interaction handler error:",
        error
      );

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              "❌ Something went wrong while processing that action.",
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content:
              "❌ Something went wrong while processing that action.",
            ephemeral: true
          });
        }
      } catch (responseError) {
        console.error(
          "❌ Could not send error response:",
          responseError
        );
      }
    }
  });
};
