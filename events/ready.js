const {
  Events
} = require("discord.js");

const {
  registerCommandsWhenReady,
  getRankConfig
} = require("../utils/config");

const {
  checkDailyReset
} = require("../utils/database");

const {
  setupDashboard
} = require("../systems/helpDesk");

const {
  sendRankPanel,
  closeInactiveApplications
} = require("../systems/rankSystem");

const allies =
  require("../systems/allies");

module.exports =
  function registerReady(
    client
  ) {
    client.once(
      Events.ClientReady,
      async bot => {
        console.log(
          `✅ ${bot.user.tag} is online!`
        );

        checkDailyReset(
          client.appData
        );

        await registerCommandsWhenReady(
          client
        );

        /*
        ==========================================
        HELP DESK
        ==========================================
        */

        await setupDashboard(
          client,
          client.appData
        );

        /*
        ==========================================
        RANK PANEL
        ==========================================
        */

        const rankConfig =
          getRankConfig(
            client.appData
          );

        if (
          rankConfig.registrationChannelId
        ) {
          try {
            const channel =
              await client.channels.fetch(
                rankConfig.registrationChannelId
              );

            if (
              channel?.isTextBased()
            ) {
              await sendRankPanel(
                channel,
                client
              );

              console.log(
                "✅ Rank Register panel restored."
              );
            }
          } catch (error) {
            console.error(
              "❌ Could not restore Rank Register panel:",
              error
            );
          }
        }

        /*
        ==========================================
        ALLIES MESSAGE
        ==========================================

        IMPORTANT:

        This does NOT create a new message every
        restart.

        It loads the saved message ID and edits
        that same message.
        */

        try {
          await allies.restore(
            client
          );
        } catch (error) {
          console.error(
            "❌ Could not restore Allies message:",
            error
          );
        }

        /*
        ==========================================
        RANK APPLICATION CLEANUP
        ==========================================
        */

        try {
          const closed =
            await closeInactiveApplications(
              client,
              client.appData
            );

          if (
            closed > 0
          ) {
            console.log(
              `🧹 Automatically closed ${closed} inactive rank application(s).`
            );
          }
        } catch (error) {
          console.error(
            "❌ Initial application cleanup failed:",
            error
          );
        }

        /*
        Check inactive applications
        every 5 minutes.
        */

        const cleanupTimer =
          setInterval(
            async () => {
              try {
                const closed =
                  await closeInactiveApplications(
                    client,
                    client.appData
                  );

                if (
                  closed > 0
                ) {
                  console.log(
                    `🧹 Automatically closed ${closed} inactive rank application(s).`
                  );
                }
              } catch (error) {
                console.error(
                  "❌ Automatic application cleanup failed:",
                  error
                );
              }
            },
            5 * 60 * 1000
          );

        if (
          cleanupTimer.unref
        ) {
          cleanupTimer.unref();
        }

        console.log(
          "🧹 Automatic application cleanup is active. Inactivity limit: 1 hour."
        );
        /*
        ==========================================
        DAILY HELP DESK RESET WATCHER
        ==========================================

        The reset must happen when the date changes in
        Asia/Kolkata, not only when the bot restarts.
        */
        let lastHelpDeskDate = client.appData.date;

        const dailyResetTimer = setInterval(
          async () => {
            try {
              const changed = checkDailyReset(
                client.appData
              );

              if (
                changed ||
                client.appData.date !== lastHelpDeskDate
              ) {
                lastHelpDeskDate = client.appData.date;

                await setupDashboard(
                  client,
                  client.appData
                );

                console.log(
                  `🌅 Help Desk daily reset detected. Dashboard refreshed for ${client.appData.date}.`
                );
              }
            } catch (error) {
              console.error(
                "❌ Automatic daily Help Desk reset failed:",
                error
              );
            }
          },
          30 * 1000
        );

        if (dailyResetTimer.unref) {
          dailyResetTimer.unref();
        }

      }
    );
  };
