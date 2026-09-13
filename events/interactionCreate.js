const { Events } = require("discord.js");

module.exports = function registerInteractionCreate(
  client
) {
  client.on(
    Events.InteractionCreate,
    async interaction => {
      try {
        /* =================================================
           SLASH COMMANDS
        ================================================= */

        if (
          interaction.isChatInputCommand()
        ) {
          const command =
            client.commands.get(
              interaction.commandName
            );

          if (!command) {
            console.error(
              `❌ Command not found: /${interaction.commandName}`
            );

            await interaction.reply({
              content:
                "❌ This command is not available.",
              ephemeral: true
            });

            return;
          }

          console.log(
            `📌 Running /${interaction.commandName} for ${interaction.user.tag}`
          );

          await command.execute(
            interaction,
            {
              client,
              data: client.appData
            }
          );

          return;
        }

        /* =================================================
           BUTTONS
        ================================================= */

        if (
          interaction.isButton()
        ) {
          const customId =
            interaction.customId;

          /* ---------------------------------------------
             HELP DESK
          --------------------------------------------- */

          if (
            customId === "war" ||
            customId === "backup" ||
            customId === "end_request" ||
            customId.startsWith(
              "helpdesk_"
            )
          ) {
            const helpDesk =
              require("../buttons/helpDesk");

            const handled =
              await helpDesk.handleHelpDeskButton(
                interaction,
                client.appData,
                client
              );

            if (handled) {
              return;
            }
          }

          /* ---------------------------------------------
             RANK SYSTEM
          --------------------------------------------- */

          if (
            customId.startsWith(
              "rank_"
            )
          ) {
            const rank =
              require("../buttons/rank");

            const handled =
              await rank.handleRankButton(
                interaction,
                client.appData,
                client
              );

            if (handled) {
              return;
            }
          }

          /* ---------------------------------------------
             SETUP
          --------------------------------------------- */

          if (
            customId.startsWith(
              "setup_"
            )
          ) {
            const setup =
              require("../buttons/setup");

            const handled =
              await setup.handleSetupButton(
                interaction,
                client.appData
              );

            if (handled) {
              return;
            }
          }

          /* ---------------------------------------------
   APPLICATION MANAGEMENT
--------------------------------------------- */

if (
  customId.startsWith(
    "applications_close:"
  ) ||
  customId.startsWith(
    "applications:"
  )
) {
  const applications =
    require("../commands/applications");

  if (
    typeof applications.handleButton ===
    "function"
  ) {
    const handled =
      await applications.handleButton(
        interaction,
        {
          client,
          data: client.appData
        }
      );

    if (handled) {
      return;
    }
  }
}

          /* ---------------------------------------------
             LEADERBOARD
          --------------------------------------------- */

          if (
            customId.startsWith(
              "leaderboard:"
            )
          ) {
            const leaderboard =
              require("../commands/leaderboard");

            if (
              typeof leaderboard.handleButton ===
              "function"
            ) {
              const handled =
                await leaderboard.handleButton(
                  interaction,
                  {
                    client,
                    data: client.appData
                  }
                );

              if (handled) {
                return;
              }
            }
          }

          return;
        }

        /* =================================================
           SELECT MENUS
        ================================================= */

        if (
          interaction.isChannelSelectMenu() ||
          interaction.isRoleSelectMenu() ||
          interaction.isStringSelectMenu()
        ) {
          const setup =
            require("../buttons/setup");

          const handled =
            await setup.handleSetupButton(
              interaction,
              client.appData
            );

          if (handled) {
            return;
          }

          return;
        }

        /* =================================================
           MODALS
        ================================================= */

        if (
          interaction.isModalSubmit()
        ) {
          const customId =
            interaction.customId;

          /* ---------------------------------------------
             HELP DESK MODALS
          --------------------------------------------- */

          if (
            customId === "war_modal" ||
            customId === "backup_modal" ||
            customId.startsWith(
              "helpdesk_"
            )
          ) {
            const helpDesk =
              require("../buttons/helpDesk");

            const handled =
              await helpDesk.handleHelpDeskModal(
                interaction,
                client.appData,
                client
              );

            if (handled) {
              return;
            }
          }

          /* ---------------------------------------------
             DECLINE MODAL
             
             IMPORTANT:
             This MUST come before the general rank
             modal route because:
             
             rank_decline_modal:XXXX
             
             also starts with "rank_".
          --------------------------------------------- */

          if (
            customId.startsWith(
              "rank_decline_modal:"
            )
          ) {
            const rank =
              require("../buttons/rank");

            const handled =
              await rank.handleDeclineModal(
                interaction,
                client.appData,
                client
              );

            if (handled) {
              return;
            }
          }

          /* ---------------------------------------------
             REGISTER / UPDATE MODALS
          --------------------------------------------- */

          if (
            customId ===
              "rank_register_modal" ||
            customId ===
              "rank_update_modal"
          ) {
            const rank =
              require("../buttons/rank");

            const handled =
              await rank.handleRankModal(
                interaction,
                client.appData,
                client
              );

            if (handled) {
              return;
            }
          }

          return;
        }
      } catch (error) {
        console.error(
          "❌ Interaction handler error:",
          error
        );

        try {
          if (
            interaction.replied ||
            interaction.deferred
          ) {
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
    }
  );
};
