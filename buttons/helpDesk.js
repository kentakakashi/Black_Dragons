const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getHelpDeskConfig } = require("../utils/config");
const { createWarModal, createBackupModal } = require("../modals/helpDesk");
const { createRequestEmbed, createEndButton } = require("../embeds/helpDesk");
const { checkCooldown, setCooldown } = require("../utils/cooldown");
const { saveData } = require("../utils/database");

const COOLDOWN_TIME = 60000;

async function handleHelpDeskButton(interaction, data, client) {
  if (interaction.customId === "war" || interaction.customId === "backup") {
    const cooldown = checkCooldown(interaction.user.id, COOLDOWN_TIME);
    if (cooldown.active) {
      await interaction.reply({
        content: "⏳ **Slow down!** You can request again in **" + cooldown.remaining + " seconds**.",
        ephemeral: true
      });
      return true;
    }
    await interaction.showModal(interaction.customId === "war" ? createWarModal() : createBackupModal());
    return true;
  }

  if (interaction.customId === "end_request") {
    if (!interaction.channel?.isThread()) {
      await interaction.reply({ content: "❌ This button can only be used inside a request thread.", ephemeral: true });
      return true;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads)) {
      await interaction.reply({ content: "❌ You need **Manage Threads** permission to end this request.", ephemeral: true });
      return true;
    }

    /* Acknowledge immediately. Then fetch the thread fresh, unarchive if necessary, and delete it. */
    await interaction.deferReply({ ephemeral: true });

    try {
      const thread = await client.channels.fetch(interaction.channelId);
      if (!thread?.isThread()) {
        await interaction.editReply({ content: "❌ I could not find the request thread anymore." });
        return true;
      }
      if (thread.locked) {
        await interaction.editReply({ content: "❌ This request is locked, so I cannot end it." });
        return true;
      }
      if (thread.archived) {
        await thread.setArchived(false, "Black Dragons request end button");
      }
      await interaction.editReply({ content: "🗑️ **Request ended. Deleting this thread...**" });
      await thread.delete("Black Dragons request ended");
    } catch (error) {
      console.error("❌ Could not delete request thread:", error);
      try {
        await interaction.editReply({
          content: "❌ I could not end this request. Check that the bot still has **Manage Threads** permission."
        });
      } catch {}
    }
    return true;
  }

  return false;
}

async function handleHelpDeskModal(interaction, data, client) {
  if (interaction.customId !== "war_modal" && interaction.customId !== "backup_modal") return false;

  const type = interaction.customId === "war_modal" ? "war" : "backup";
  const config = getHelpDeskConfig(data);
  const channel = interaction.channel;

  if (!channel?.isTextBased() || !channel.threads) {
    await interaction.reply({
      content: "❌ This Help Desk dashboard cannot create request threads.",
      ephemeral: true
    });
    return true;
  }

  const details = {
    region: interaction.fields.getTextInputValue("region"),
    serverLink: interaction.fields.getTextInputValue("server_link"),
    reason: interaction.fields.getTextInputValue("reason"),
    clan: interaction.fields.getTextInputValue("clan")
  };

  try {
    await interaction.deferReply({ ephemeral: true });

    const roleId = type === "war" ? config.warRoleId : config.backupRoleId;
    const threadName = type === "war"
      ? "⚔️ WAR - " + interaction.user.username
      : "🛡️ BACKUP - " + interaction.user.username;

    const thread = await channel.threads.create({
      name: threadName,
      type: ChannelType.PublicThread,
      autoArchiveDuration: 10080,
      reason: type === "war" ? "Black Dragons WAR request" : "Black Dragons BACKUP request"
    });

    await thread.send({
      content: roleId ? "<@&" + roleId + ">" : "",
      embeds: [createRequestEmbed(type, interaction.user, details)],
      components: [createEndButton()],
      allowedMentions: roleId ? { roles: [roleId] } : { parse: [] }
    });

    if (type === "war") data.war++;
    else data.backup++;

    setCooldown(interaction.user.id);
    saveData(data);

    const helpDesk = require("../systems/helpDesk");
    await helpDesk.updateDashboard(client, data);

    await interaction.editReply({
      content: "✅ Your " + (type === "war" ? "WAR" : "BACKUP") + " request has been created!\n\n📁 " + thread
    });
  } catch (error) {
    console.error("❌ Could not create request:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "❌ Something went wrong while creating your request. Please try again." });
    } else {
      await interaction.reply({
        content: "❌ Something went wrong while creating your request. Please try again.",
        ephemeral: true
      });
    }
  }
  return true;
}

module.exports = { handleHelpDeskButton, handleHelpDeskModal };
