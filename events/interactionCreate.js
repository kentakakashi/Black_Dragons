const { Events } = require("discord.js");

const {
  handleHelpDeskButton,
  handleHelpDeskModal
} = require("../buttons/helpDesk");

const {
  handleRankButton,
  handleRankModal,
  handleDeclineModal
} = require("../buttons/rank");

const {
  handleSetupButton
} = require("../buttons/setup");

const leaderboard = require("../commands/leaderboard");

module.exports = function registerInteractionCreate(client) {
  client.on(
    Events.InteractionCreate,
    async interaction => {
      try {
        /*
        ==============================================
        SLASH COMMANDS
        ==============================================
        */

        if (interaction.isChatInputCommand()) {
          const command = client.commands.get(
            interaction.commandName
          );

          if (!command) {
            console.error(
              `❌ Command not found: /${interaction.commandName}`
            );

            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content:
                  "❌ This command is not loaded correctly. Please contact an administrator.",
                ephemeral: true
              });
            }

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

        /*
        ==============================================
        BUTTONS
        ==============================================
        */

        if (interaction.isButton()) {
          if (
            await handleHelpDeskButton(
              interaction,
              client.appData
            )
          ) {
            return;
          }

          if (
            await handleRankButton(
              interaction,
              client.appData
            )
          ) {
            return;
          }

          if (
            await handleSetupButton(
              interaction,
              client.appData
            )
          ) {
            return;
          }

          if (
            await leaderboard.handleButton(
              interaction,
              {
                client,
                data: client.appData
              }
            )
          ) {
            return;
          }

          return;
        }

        /*
        ==============================================
        SELECT MENUS
        ==============================================
        */

        if (
          interaction.isChannelSelectMenu() ||
          interaction.isRoleSelectMenu()
        ) {
          if (
            await handleSetupButton(
              interaction,
              client.appData
            )
          ) {
            return;
          }

          return;
        }

        /*
        ==============================================
        MODALS
        ==============================================
        */

        if (interaction.isModalSubmit()) {
          if (
            await handleHelpDeskModal(
              interaction,
              client.appData,
              client
            )
          ) {
            return;
          }

          if (
            await handleRankModal(
              interaction,
              client.appData,
              client
            )
          ) {
            return;
          }

          if (
            await handleDeclineModal(
              interaction,
              client.appData,
              client
            )
          ) {
            return;
          }

          return;
        }
      } catch (error) {
        console.error(
          "❌ Interaction handler failed:",
          error
        );

        try {
          if (
            interaction.deferred ||
            interaction.replied
          ) {
            await interaction.followUp({
              content:
                "❌ Something went wrong while processing that action. Check the bot console for the exact error.",
              ephemeral: true
            });
          } else {
            await interaction.reply({
              content:
                "❌ Something went wrong while processing that action. Check the bot console for the exact error.",
              ephemeral: true
            });
          }
        } catch (responseError) {
          console.error(
            "❌ Could not respond to failed interaction:",
            responseError
          );
        }
      }
    }
  );
};
