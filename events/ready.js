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

module.exports =
  function registerReady(client) {
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

        await setupDashboard(
          client,
          client.appData
        );

        /*
        ==========================================
        RESTORE RANK PANEL
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
        APPLICATION CLEANUP
        ==========================================
        */

        /*
          Check immediately when the bot starts.
          This also catches applications that became
          inactive while the bot was offline.
        */

        try {
          const closed =
            await closeInactiveApplications(
              client,
              client.appData
            );

          if (closed > 0) {
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
          Then check every 5 minutes.
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

                if (closed > 0) {
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
      }
    );
  };
