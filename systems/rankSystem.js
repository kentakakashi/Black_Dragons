const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getRank, getRankDisplay, formatKills } = require("../utils/ranks");
const { getRankConfig } = require("../utils/config");
const { createRankPanelEmbed, createRankPanelButtons, createRankReviewEmbed, createRankReviewButtons } = require("../embeds/rank");
const { saveData } = require("../utils/database");

async function sendRankPanel(channel, client) {
  const messages = await channel.messages.fetch({ limit: 50 });

  const existing = messages.find(message =>
    message.author.id === client.user.id &&
    message.components.some(row =>
      row.components.some(component => component.customId === "rank_register")
    )
  );

  const payload = {
    embeds: [createRankPanelEmbed()],
    components: [createRankPanelButtons()]
  };

  if (existing) {
    await existing.edit(payload);
    return existing;
  }

  return channel.send(payload);
}

async function createRankUploadThread(interaction, application, data, client) {
  const config = getRankConfig(data);
  const channel = await client.channels.fetch(config.registrationChannelId);

  if (!channel || !channel.isTextBased() || !channel.threads) {
    throw new Error("Rank registration channel is not configured correctly.");
  }

  const thread = await channel.threads.create({
    name: `🏆 Rank Proof - ${interaction.user.username}`,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 1440,
    reason: `Rank application #${application.id}`
  });

  await thread.members.add(interaction.user.id);

  await thread.send(
    `🏆 **Black Dragons Rank Proof Upload**\n\n` +
    `Application: **#${application.id}**\n` +
    `Roblox: **${application.robloxUsername}**\n` +
    `Kills: **${formatKills(application.kills)}**\n` +
    `Calculated Rank: ${getRankDisplay(getRank(application.kills))}\n\n` +
    `Please upload your leaderboard screenshot as an image attachment in this thread.`
  );

  return thread;
}

async function forwardRankApplication(application, attachment, client, data) {
  const config = getRankConfig(data);
  const channel = await client.channels.fetch(config.reviewChannelId);

  if (!channel || !channel.isTextBased()) {
    throw new Error("Rank review channel is not configured correctly.");
  }

  application.proofUrl = attachment.url;
  application.proofName = attachment.name || null;
  application.status = "pending_review";

  const message = await channel.send({
    content: `<@${application.userId}>`,
    embeds: [createRankReviewEmbed(application)],
    files: [attachment.url],
    components: [createRankReviewButtons(application.id)],
    allowedMentions: { users: [application.userId] }
  });

  application.reviewMessageId = message.id;
  saveData(data);
  return message;
}

async function applyRankRole(member, rankKey, data) {
  const roleId = data.config.rank.rankRoleIds?.[rankKey] || data.rankConfig.rankRoleIds?.[rankKey];
  if (!roleId) return;

  const allRankRoleIds = Object.values(
    data.config.rank.rankRoleIds || data.rankConfig.rankRoleIds || {}
  ).filter(Boolean);

  for (const oldRoleId of allRankRoleIds) {
    if (oldRoleId !== roleId && member.roles.cache.has(oldRoleId)) {
      try {
        await member.roles.remove(oldRoleId, "Black Dragons rank update");
      } catch (error) {
        console.error("❌ Could not remove old rank role:", error);
      }
    }
  }

  if (!member.roles.cache.has(roleId)) {
    try {
      await member.roles.add(roleId, "Black Dragons rank accepted");
    } catch (error) {
      console.error("❌ Could not add rank role:", error);
    }
  }
}

async function recordRankHistory(data, application, action, reviewerId, previous = null, client = null) {
  const entry = {
    applicationId: application.id,
    userId: application.userId,
    robloxUsername: application.robloxUsername,
    kills: application.kills,
    rank: getRank(application.kills).key,
    action,
    reviewerId,
    previousKills: previous?.kills ?? null,
    previousRank: previous?.rank ?? null,
    reason: application.declineReason || null,
    timestamp: Date.now()
  };

  if (!Array.isArray(data.rankHistory)) data.rankHistory = [];
  data.rankHistory.push(entry);
  saveData(data);

  const config = getRankConfig(data);
  if (!config.historyChannelId) return;

  try {
    const channel = client ? await client.channels.fetch(config.historyChannelId) : null;
    if (!channel?.isTextBased()) return;

    const embed = createRankReviewEmbed(application)
      .setTitle(
        action === "accepted"
          ? `✅ ACCEPTED • APPLICATION #${application.id}`
          : `❌ DECLINED • APPLICATION #${application.id}`
      )
      .addFields(
        { name: "👮 Reviewed By", value: `<@${reviewerId}>`, inline: true },
        { name: "📅 Reviewed", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      );

    if (application.declineReason) {
      embed.addFields({ name: "📝 Reason", value: application.declineReason });
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("❌ Could not write rank history:", error);
  }
}

async function processProofMessage(message, data, client) {
  if (message.author.bot || !message.channel.isThread()) return;

  const application = data.rankApplications.find(app =>
    app.threadId === message.channel.id &&
    app.status === "pending_upload" &&
    app.userId === message.author.id
  );

  if (!application) return;

  const attachment = message.attachments.find(file =>
    file.contentType?.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(file.name || "")
  );

  if (!attachment) {
    await message.reply("⚠️ Please upload the leaderboard screenshot as an image attachment.");
    return;
  }

  try {
    await message.react("✅");

    // Give history writing enough context without adding global state.
    application._client = client;
    await forwardRankApplication(application, attachment, client, data);
    saveData(data);

    await message.channel.send(
      `✅ **Proof received.** Your application has been sent to staff for review.\n\n` +
      `Application: **#${application.id}**\n` +
      `Status: 🟡 Pending Review`
    );

    try {
      await message.channel.setArchived(true);
    } catch {
      // Optional.
    }

    console.log(`✅ Rank application #${application.id} sent for review.`);
  } catch (error) {
    console.error("❌ Could not forward rank proof:", error);
    await message.channel.send(
      "❌ I could not forward your proof to staff. Please contact an administrator."
    );
  }
}

module.exports = {
  sendRankPanel,
  createRankUploadThread,
  forwardRankApplication,
  applyRankRole,
  recordRankHistory,
  processProofMessage
};
