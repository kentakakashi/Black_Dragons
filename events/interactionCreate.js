const {
  Events
} = require('discord.js');

module.exports =
  function registerInteractionCreate(
    client
  ) {
    client.on(
      Events.InteractionCreate,
      async interaction => {
        try {
          /*
           * =========================
           * SLASH COMMANDS
           * =========================
           */

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
                  '❌ This command is not available.',
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

          /*
           * =========================
           * BUTTONS
           * =========================
           */

          if (
            interaction.isButton()
          ) {
            const customId =
              interaction.customId;

            /*
             * Allies editor buttons
             */
            if (
              customId.startsWith(
                'ae:'
              ) ||
              customId.startsWith(
                'aef:'
              ) ||
              customId.startsWith(
                'aeh:'
              )
            ) {
              const editor =
                require(
                  '../buttons/alliesEditor'
                );

              if (
                await editor.handleButton(
                  interaction
                )
              ) {
                return;
              }
            }

            /*
             * Allies remove confirmation
             */
            if (
              customId.startsWith(
                'aeremove:'
              ) ||
              customId.startsWith(
                'aecancelremove:'
              )
            ) {
              const editor =
                require(
                  '../buttons/alliesEditor'
                );

              if (
                await editor.handleOtherButton(
                  interaction
                )
              ) {
                return;
              }
            }

            /*
             * Help Desk
             */
            if (
              customId === 'war' ||
              customId === 'backup' ||
              customId ===
                'end_request' ||
              customId.startsWith(
                'helpdesk_'
              )
            ) {
              const helpDesk =
                require(
                  '../buttons/helpDesk'
                );

              if (
                await helpDesk.handleHelpDeskButton(
                  interaction,
                  client.appData,
                  client
                )
              ) {
                return;
              }
            }

            /*
             * Rank
             */
            if (
              customId.startsWith(
                'rank_'
              )
            ) {
              const rank =
                require(
                  '../buttons/rank'
                );

              if (
                await rank.handleRankButton(
                  interaction,
                  client.appData,
                  client
                )
              ) {
                return;
              }
            }

            /*
             * Setup
             */
            if (
              customId.startsWith(
                'setup_'
              )
            ) {
              const setup =
                require(
                  '../buttons/setup'
                );

              if (
                await setup.handleSetupButton(
                  interaction,
                  client.appData
                )
              ) {
                return;
              }
            }

            /*
             * Applications
             */
            if (
              customId.startsWith(
                'applications_close:'
              ) ||
              customId.startsWith(
                'applications_retry:'
              ) ||
              customId.startsWith(
                'applications:'
              )
            ) {
              const applications =
                require(
                  '../commands/applications'
                );

              if (
                typeof applications.handleButton ===
                  'function' &&
                await applications.handleButton(
                  interaction,
                  {
                    client,
                    data:
                      client.appData
                  }
                )
              ) {
                return;
              }
            }

            /*
             * Blacklist
             */
            if (
              customId.startsWith(
                'bl:'
              )
            ) {
              const blacklist =
                require(
                  '../commands/blacklist'
                );

              if (
                await blacklist.handleButton(
                  interaction,
                  {
                    client,
                    data:
                      client.appData
                  }
                )
              ) {
                return;
              }
            }

            /*
             * Leaderboard
             */
            if (
              customId.startsWith(
                'leaderboard:'
              )
            ) {
              const leaderboard =
                require(
                  '../commands/leaderboard'
                );

              if (
                typeof leaderboard.handleButton ===
                  'function' &&
                await leaderboard.handleButton(
                  interaction,
                  {
                    client,
                    data:
                      client.appData
                  }
                )
              ) {
                return;
              }
            }

            return;
          }

          /*
           * =========================
           * SELECT MENUS
           * =========================
           */

          if (
            interaction.isChannelSelectMenu() ||
            interaction.isRoleSelectMenu() ||
            interaction.isStringSelectMenu()
          ) {
            const customId =
              interaction.customId;

            /*
             * Allies editor selects
             */
            if (
              customId.startsWith(
                'aeclan:'
              ) ||
              customId.startsWith(
                'aef:'
              ) ||
              customId.startsWith(
                'aehf:'
              )
            ) {
              const editor =
                require(
                  '../buttons/alliesEditor'
                );

              if (
                await editor.handleSelect(
                  interaction
                )
              ) {
                return;
              }
            }

            /*
             * Setup selects
             */
            const setup =
              require(
                '../buttons/setup'
              );

            if (
              await setup.handleSetupButton(
                interaction,
                client.appData
              )
            ) {
              return;
            }

            return;
          }

          /*
           * =========================
           * MODALS
           * =========================
           */

          if (
            interaction.isModalSubmit()
          ) {
            const customId =
              interaction.customId;

            /*
             * Allies editor modals
             */
            if (
              customId.startsWith(
                'aem:'
              ) ||
              customId.startsWith(
                'aefm:'
              ) ||
              customId.startsWith(
                'aehm:'
              )
            ) {
              const editor =
                require(
                  '../buttons/alliesEditor'
                );

              if (
                await editor.handleModal(
                  interaction
                )
              ) {
                return;
              }
            }

            /*
             * Blacklist modals
             */
            if (
              customId.startsWith(
                'blrm:'
              )
            ) {
              const blacklist =
                require(
                  '../commands/blacklist'
                );

              if (
                await blacklist.handleModal(
                  interaction,
                  {
                    client,
                    data:
                      client.appData
                  }
                )
              ) {
                return;
              }
            }

            /*
             * Help Desk modals
             */
            if (
              customId ===
                'war_modal' ||
              customId ===
                'backup_modal' ||
              customId.startsWith(
                'helpdesk_'
              )
            ) {
              const helpDesk =
                require(
                  '../buttons/helpDesk'
                );

              if (
                await helpDesk.handleHelpDeskModal(
                  interaction,
                  client.appData,
                  client
                )
              ) {
                return;
              }
            }

            /*
             * Rank decline modal
             */
            if (
              customId.startsWith(
                'rank_decline_modal:'
              )
            ) {
              const rank =
                require(
                  '../buttons/rank'
                );

              if (
                await rank.handleDeclineModal(
                  interaction,
                  client.appData,
                  client
                )
              ) {
                return;
              }
            }

            /*
             * Rank register/update modal
             */
            if (
              customId ===
                'rank_register_modal' ||
              customId ===
                'rank_update_modal'
            ) {
              const rank =
                require(
                  '../buttons/rank'
                );

              if (
                await rank.handleRankModal(
                  interaction,
                  client.appData,
                  client
                )
              ) {
                return;
              }
            }

            return;
          }
        } catch (error) {
          console.error(
            '❌ Interaction handler error:',
            error
          );

          /*
           * Discord can report 10062/10015 when an interaction
           * has already expired or its webhook is gone. Do not
           * attempt a second response in that case.
           */
          try {
            const logger = require("../systems/logging/logger");
            if (interaction.guild && interaction.client?.appData) {
              await logger.error(
                interaction.guild,
                interaction.client.appData,
                error,
                "Interaction " + (interaction.commandName || interaction.customId || "unknown")
              );
            }
          } catch (loggingError) {
            console.error("❌ Could not write interaction error to logs:", loggingError);
          }

          if (
            error?.code === 10062 ||
            error?.code === 10015
          ) {
            console.warn(
              `⚠️ Interaction expired before an error response could be sent (code ${error.code}).`
            );

            return;
          }

          try {
            if (
              interaction.replied ||
              interaction.deferred
            ) {
              await interaction.followUp({
                content:
                  '❌ Something went wrong while processing that action.',
                ephemeral: true
              });
            } else {
              await interaction.reply({
                content:
                  '❌ Something went wrong while processing that action.',
                ephemeral: true
              });
            }
          } catch (
            responseError
          ) {
            if (
              responseError?.code === 10062 ||
              responseError?.code === 10015
            ) {
              return;
            }

            console.error(
              '❌ Could not send error response:',
              responseError
            );
          }
        }
      }
    );
  };
