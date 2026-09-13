const {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { getHelpDeskConfig } = require("../utils/config");
const { createWarModal, createBackupModal } = require("../modals/helpDesk");
const { createRequestEmbed, createEndButton } = require("../embeds/helpDesk");
const { checkCooldown, setCooldown } = require("../utils/cooldown");
const { saveData } = require("../utils/database");

const COOLDOWN_TIME = 60000;

async function handleHelpDeskButton(interaction, data) {
  if (interaction.customId === "war" || interaction.customId === "backup") {
    const cooldown = checkCooldown(interaction.user.id, COOLDOWN_TIME);
    if (cooldown.active) {
      await interaction.reply({
        content: `⏳ **Slow down!** You can request again in **${cooldown.remaining} seconds**.`,
        ephemeral: true
      });
      return true;
    }

    await interaction.showModal(
      interaction.customId === "war" ? createWarModal() : createBackupModal()
    );
    return true;
  }

  if (interaction.customId === "end_request") {
    if (!interaction.channel?.isThread()) {
      await interaction.reply({
        content: "❌ This button can only be used inside a request thread.",
        ephemeral: true
      });
      return true;
    }

    if (!interaction.memberPermissions?.has("ManageThreads")) {
      await interaction.reply({
        content: "❌ You need **Manage Threads** permission to end this request.",
        ephemeral: true
      });
      return true;
    }

    await interaction.reply({ content: "🗑️ **This request is being deleted...**" });
    setTimeout(async () => {
      try {
        await interaction.channel.delete("Black Dragons request ended");
      } catch (error) {
        console.error("❌ Could not delete request thread:", error);
      }
    }, 3000);

    return true;
  }

  return false;
}

async function handleHelpDeskModal(interaction, data, client) {
  if (interaction.customId !== "war_modal" && interaction.customId !== "backup_modal") {
    return false;
  }

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
      ? `⚔️ WAR - ${interaction.user.username}`
      : `🛡️ BACKUP - ${interaction.user.username}`;

    const thread = await channel.threads.create({
      name: threadName,
      type: ChannelType.PublicThread,
      autoArchiveDuration: 1440,
      reason: type === "war" ? "Black Dragons WAR request" : "Black Dragons BACKUP request"
    });

    await thread.send({
      content: roleId ? `<@&${roleId}>` : "",
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
      content: `✅ Your ${type === "war" ? "WAR" : "BACKUP"} request has been created!\n\n📁 ${thread}`
    });
  } catch (error) {
    console.error("❌ Could not create request:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: "❌ Something went wrong while creating your request. Please try again."
      });
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
