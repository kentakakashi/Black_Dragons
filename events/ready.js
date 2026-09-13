const { Events } = require("discord.js");
const { registerCommandsWhenReady } = require("../utils/config");
const { checkDailyReset } = require("../utils/database");
const { setupDashboard } = require("../systems/helpDesk");
const { sendRankPanel } = require("../systems/rankSystem");
const { getRankConfig } = require("../utils/config");

module.exports = function registerReady(client) {
  client.once(Events.ClientReady, async bot => {
    console.log(`✅ ${bot.user.tag} is online!`);

    checkDailyReset(client.appData);

    await registerCommandsWhenReady(client);

    await setupDashboard(client, client.appData);

    const rankConfig = getRankConfig(client.appData);
    if (rankConfig.registrationChannelId) {
      try {
        const channel = await client.channels.fetch(rankConfig.registrationChannelId);
        if (channel?.isTextBased()) {
          await sendRankPanel(channel, client);
          console.log("✅ Rank Register panel restored.");
        }
      } catch (error) {
        console.error("❌ Could not restore Rank Register panel:", error);
      }
    }
  });
};
