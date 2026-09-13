const { ChannelType } = require("discord.js");
const { getHelpDeskConfig } = require("../utils/config");
const { createDashboardEmbed, createDashboardButtons } = require("../embeds/helpDesk");
const { saveData } = require("../utils/database");

let dashboardMessage = null;

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
        saveData(data);
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
      saveData(data);
      await updateDashboard(client, data);
      console.log("✅ Existing dashboard found and updated.");
      return dashboardMessage;
    }

    dashboardMessage = await channel.send({
      embeds: [createDashboardEmbed(data)],
      components: [createDashboardButtons()]
    });

    data.dashboardMessageId = dashboardMessage.id;
    saveData(data);

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

module.exports = { setupDashboard, updateDashboard };
