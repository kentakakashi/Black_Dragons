const { PermissionFlagsBits } = require("discord.js");
const { getRank, getRankDisplay, formatKills } = require("../utils/ranks");
const { getRankConfig } = require("../utils/config");
const { createRankModal } = require("../modals/rank");
const { createDeclineModal } = require("../modals/decline");
const { createRankReviewEmbed } = require("../embeds/rank");
const { saveData } = require("../utils/database");

function getPendingApplication(data, userId) {
  return data.rankApplications.find(app =>
    app.userId === userId &&
    (app.status === "pending_upload" || app.status === "pending_review")
  );
}

function newApplication(interaction, isUpdate, kills, robloxUsername) {
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
    userId: interaction.user.id,
    discordUsername: interaction.user.username,
    robloxUsername,
    kills,
    rank: getRank(kills).key,
    type: isUpdate ? "update" : "register",
    status: "pending_upload",
    createdAt: Date.now(),
    threadId: null,
    reviewMessageId: null,
    proofUrl: null,
    proofName: null,
    reviewerId: null,
    reviewedAt: null,
    declineReason: null
  };
}

async function handleRankButton(interaction, data) {
  if (interaction.customId === "rank_register" || interaction.customId === "rank_update") {
    const config = getRankConfig(data);

    if (!config.registrationChannelId || !config.reviewChannelId) {
      await interaction.reply({
        content: "❌ The kill-rank system has not been configured yet. An administrator must use `/setup` first.",
        ephemeral: true
      });
      return true;
    }

    const pending = getPendingApplication(data, interaction.user.id);
    if (pending) {
      await interaction.reply({
        content: `⏳ You already have an active rank application **#${pending.id}**. Finish that application before starting another one.`,
        ephemeral: true
      });
      return true;
    }

    const isUpdate = interaction.customId === "rank_update";

    if (isUpdate && !data.rankUsers[interaction.user.id]) {
      await interaction.reply({
        content: "❌ You do not have an approved rank yet. Please use **REGISTER RANK** first.",
        ephemeral: true
      });
      return true;
    }

    await interaction.showModal(createRankModal(isUpdate));
    return true;
  }

  if (interaction.customId.startsWith("rank_accept:")) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: "❌ Only administrators can review rank applications.",
        ephemeral: true
      });
      return true;
    }

    const applicationId = interaction.customId.split(":")[1];
    const application = data.rankApplications.find(app => app.id === applicationId);

    if (!application || application.status !== "pending_review") {
      await interaction.reply({
        content: "❌ This application is no longer awaiting review.",
        ephemeral: true
      });
      return true;
    }

    const rank = getRank(application.kills);

    try {
      const member = await interaction.guild.members.fetch(application.userId);

      const rankSystem = require("../systems/rankSystem");
      await rankSystem.applyRankRole(member, rank.key, data);

      const previous = data.rankUsers[application.userId];

      data.rankUsers[application.userId] = {
        discordId: application.userId,
        robloxUsername: application.robloxUsername,
        kills: application.kills,
        rank: rank.key,
        verifiedAt: previous?.verifiedAt || Date.now(),
        updatedAt: Date.now(),
        lastReviewerId: interaction.user.id
      };

      application.status = "accepted";
      application.reviewerId = interaction.user.id;
      application.reviewedAt = Date.now();

      saveData(data);

      await rankSystem.recordRankHistory(
        data,
        application,
        "accepted",
        interaction.user.id,
        previous
      );

      await interaction.update({
        content: "✅ **Application accepted.**",
        embeds: [createRankReviewEmbed(application)],
        components: []
      });

      try {
        const user = await interaction.client.users.fetch(application.userId);
        await user.send(
          `🏆 **Your Black Dragons rank application has been accepted!**\n\n` +
          `**Kills:** ${formatKills(application.kills)}\n` +
          `**Rank:** ${getRankDisplay(rank)}`
        );
      } catch {
        console.log("Could not DM applicant.");
      }
    } catch (error) {
      console.error("❌ Could not accept rank application:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Something went wrong while accepting the application. Check that the bot can manage the rank roles.",
          ephemeral: true
        });
      }
    }

    return true;
  }

  if (interaction.customId.startsWith("rank_decline:")) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: "❌ Only administrators can review rank applications.",
        ephemeral: true
      });
      return true;
    }

    const applicationId = interaction.customId.split(":")[1];
    const application = data.rankApplications.find(app => app.id === applicationId);

    if (!application || application.status !== "pending_review") {
      await interaction.reply({
        content: "❌ This application is no longer awaiting review.",
        ephemeral: true
      });
      return true;
    }

    await interaction.showModal(createDeclineModal(applicationId));
    return true;
  }

  return false;
}

async function handleRankModal(interaction, data, client) {
  if (interaction.customId !== "rank_register_modal" && interaction.customId !== "rank_update_modal") {
    return false;
  }

  const isUpdate = interaction.customId === "rank_update_modal";
  const robloxUsername = interaction.fields.getTextInputValue("roblox_username").trim();
  const killText = interaction.fields.getTextInputValue("kill_count").replace(/,/g, "").trim();
  const kills = Number(killText);

  if (!Number.isInteger(kills) || kills < 0 || kills > 1000000000) {
    await interaction.reply({
      content: "❌ Please enter a valid whole-number kill count.",
      ephemeral: true
    });
    return true;
  }

  const pending = getPendingApplication(data, interaction.user.id);
  if (pending) {
    await interaction.reply({
      content: `❌ You already have an active application **#${pending.id}**.`,
      ephemeral: true
    });
    return true;
  }

  if (isUpdate && !data.rankUsers[interaction.user.id]) {
    await interaction.reply({
      content: "❌ You do not have an approved rank yet. Please use **REGISTER RANK** first.",
      ephemeral: true
    });
    return true;
  }

  const application = newApplication(interaction, isUpdate, kills, robloxUsername);
  data.rankApplications.push(application);
  saveData(data);

  try {
    const rankSystem = require("../systems/rankSystem");
    const thread = await rankSystem.createRankUploadThread(interaction, application, data, client);

    application.threadId = thread.id;
    saveData(data);

    await interaction.reply({
      content:
        `✅ **Application #${application.id} created.**\n\n` +
        `📁 ${thread}\n\n` +
        `Please open the thread and upload your leaderboard screenshot there.`,
      ephemeral: true
    });
  } catch (error) {
    console.error("❌ Could not create rank upload thread:", error);
    application.status = "cancelled";
    saveData(data);

    await interaction.reply({
      content: "❌ I could not create the proof-upload thread. Please contact an administrator.",
      ephemeral: true
    });
  }

  return true;
}

async function handleDeclineModal(interaction, data) {
  if (!interaction.customId.startsWith("rank_decline_modal:")) return false;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "❌ Only administrators can review rank applications.",
      ephemeral: true
    });
    return true;
  }

  const applicationId = interaction.customId.split(":")[1];
  const reason = interaction.fields.getTextInputValue("decline_reason").trim();
  const application = data.rankApplications.find(app => app.id === applicationId);

  if (!application || application.status !== "pending_review") {
    await interaction.reply({
      content: "❌ This application is no longer awaiting review.",
      ephemeral: true
    });
    return true;
  }

  application.status = "declined";
  application.reviewerId = interaction.user.id;
  application.reviewedAt = Date.now();
  application.declineReason = reason;
  saveData(data);

  const rankSystem = require("../systems/rankSystem");
  await rankSystem.recordRankHistory(data, application, "declined", interaction.user.id, null, client);

  await interaction.update({
    content: "❌ **Application declined.**",
    embeds: [
      createRankReviewEmbed(application).addFields({
        name: "📝 Reason",
        value: reason
      })
    ],
    components: []
  });

  try {
    const user = await client.users.fetch(application.userId);
    await user.send(
      `❌ **Your Black Dragons rank application has been declined.**\n\n` +
      `**Reason:** ${reason}\n\n` +
      `You may submit a new application after correcting the issue.`
    );
  } catch {
    console.log("Could not DM applicant.");
  }

  return true;
}

module.exports = {
  handleRankButton,
  handleRankModal,
  handleDeclineModal,
  getPendingApplication
};
