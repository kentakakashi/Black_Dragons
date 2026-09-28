const { getHelpDeskConfig } = require("../utils/config");
const { createDashboardEmbed, createDashboardButtons } = require("../embeds/helpDesk");
const { saveData } = require("../utils/database");

const REQUEST_RETENTION_MS = 6 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

let dashboardMessage = null;

function isRequestCard(message, client) {
  if (!message || !client?.user) return false;
  if (message.author?.id !== client.user.id) return false;

  const title = message.embeds?.[0]?.title;
  return title === "WAR REQUEST" || title === "BACKUP REQUEST";
}

async function cleanupExpiredRequests(client, data) {
  const config = getHelpDeskConfig(data);
  if (!config.channelId) return 0;

  try {
    const channel = await client.channels.fetch(config.channelId);

    if (!channel?.isTextBased() || !channel.messages) return 0;

    const messages = await channel.messages.fetch({ limit: 100 });
    const cutoff = Date.now() - REQUEST_RETENTION_MS;
    let deleted = 0;

    for (const message of messages.values()) {
      if (!isRequestCard(message, client)) continue;
      if (message.createdTimestamp > cutoff) continue;

      try {
        await message.delete("Black Dragons Help Desk request retention cleanup");
        deleted++;
      } catch (error) {
        console.warn(
          "⚠️ Could not delete expired Help Desk request " + message.id + ":",
          error?.message || error
        );
      }
    }

    if (deleted > 0) {
      console.log("🧹 Help Desk cleanup removed " + deleted + " expired request card(s).");
    }

    return deleted;
  } catch (error) {
    console.error("❌ Help Desk request cleanup failed:", error);
    return 0;
  }
}

async function setupDashboard(client, data) {
  const config = getHelpDeskConfig(data);

  if (!config.channelId) {
    console.log("ℹ️ Help Desk channel is not configured. Use /setup.");
    return null;
  }

  try {
    const channel = await client.channels.fetch(config.channelId);

    if (!channel || !channel.isTextBased()) {
      console.error("❌ Dashboard channel not found or is not a text channel.");
      return null;
    }

    if (data.dashboardMessageId) {
      try {
        dashboardMessage = await channel.messages.fetch(data.dashboardMessageId);
        await updateDashboard(client, data);
        console.log("✅ Existing dashboard restored.");
        return dashboardMessage;
      } catch {
        data.dashboardMessageId = null;
        await saveData(data);
      }
    }

    const messages = await channel.messages.fetch({ limit: 50 });

    dashboardMessage = messages.find(message =>
      message.author.id === client.user.id &&
      message.components.some(row =>
        row.components.some(component => component.customId === "war")
      )
    );

    if (dashboardMessage) {
      data.dashboardMessageId = dashboardMessage.id;
      await saveData(data);
      await updateDashboard(client, data);
      console.log("✅ Existing dashboard found and updated.");
      return dashboardMessage;
    }

    dashboardMessage = await channel.send({
      embeds: [createDashboardEmbed(data)],
      components: [createDashboardButtons()]
    });

    data.dashboardMessageId = dashboardMessage.id;
    await saveData(data);

    console.log("✅ New Help Desk dashboard created.");
    return dashboardMessage;
  } catch (error) {
    console.error("❌ Dashboard setup failed:", error);
    return null;
  }
}

async function updateDashboard(client, data) {
  if (!dashboardMessage) return;

  try {
    await dashboardMessage.edit({
      embeds: [createDashboardEmbed(data)],
      components: [createDashboardButtons()]
    });
  } catch (error) {
    console.error("❌ Could not update dashboard:", error);
  }
}

function startCleanupWatcher(client, data) {
  const run = () => cleanupExpiredRequests(client, data).catch(() => {});

  run();

  const timer = setInterval(run, CLEANUP_INTERVAL_MS);

  if (timer.unref) timer.unref();

  return timer;
}

module.exports = {
  setupDashboard,
  updateDashboard,
  cleanupExpiredRequests,
  startCleanupWatcher
};
