const {
  ChannelType
} = require("discord.js");

const {
  getRank,
  getRankDisplay,
  formatKills
} = require("../utils/ranks");

const {
  getRankConfig
} = require("../utils/config");

const {
  createRankPanelEmbed,
  createRankPanelButtons,
  createRankReviewEmbed,
  createRankReviewButtons
} = require("../embeds/rank");

const {
  saveData
} = require("../utils/database");

/*
==================================================
APPLICATION INACTIVITY
==================================================
*/

const INACTIVITY_LIMIT =
  60 * 60 * 1000;

/*
==================================================
RANK PANEL
==================================================
*/

async function sendRankPanel(
  channel,
  client
) {
  const messages =
    await channel.messages.fetch({
      limit: 50
    });

  const existing =
    messages.find(
      message =>
        message.author.id ===
          client.user.id &&
        message.components.some(
          row =>
            row.components.some(
              component =>
                component.customId ===
                "rank_register"
            )
        )
    );

  const payload = {
    embeds: [
      createRankPanelEmbed()
    ],

    components: [
      createRankPanelButtons()
    ]
  };

  if (existing) {
    await existing.edit(
      payload
    );

    return existing;
  }

  return channel.send(
    payload
  );
}

/*
==================================================
CREATE PROOF THREAD
==================================================
*/

async function createRankUploadThread(
  interaction,
  application,
  data,
  client
) {
  const config =
    getRankConfig(data);

  const channel =
    await client.channels.fetch(
      config.registrationChannelId
    );

  if (
    !channel ||
    !channel.isTextBased() ||
    !channel.threads
  ) {
    throw new Error(
      "Rank registration channel is not configured correctly."
    );
  }

  const thread =
    await channel.threads.create({
      name:
        `🏆 Rank Proof - ${interaction.user.username}`,

      type:
        ChannelType.PrivateThread,

      /*
        Discord thread auto archive.
        Our own 1-hour inactivity
        system is the real enforcement.
      */
      autoArchiveDuration: 60,

      reason:
        `Rank application #${application.id}`
    });

  await thread.members.add(
    interaction.user.id
  );

  application.lastActivityAt =
    Date.now();

  await thread.send(
    `# 🚨 ACTION REQUIRED — UPLOAD YOUR PROOF HERE\n\n` +
    `## 📸 **SEND YOUR LEADERBOARD SCREENSHOT IN THIS THREAD**\n\n` +
    `**DO NOT REPLY WITH TEXT.**\n` +
    `**UPLOAD THE SCREENSHOT AS AN IMAGE ATTACHMENT BELOW.**\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `**Application:** #${application.id}\n` +
    `**Roblox:** ${application.robloxUsername}\n` +
    `**Kills:** ${formatKills(application.kills)}\n` +
    `**Calculated Rank:** ${getRankDisplay(
      getRank(application.kills)
    )}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ **STEP 1:** Take/open your leaderboard screenshot.\n` +
    `✅ **STEP 2:** Tap **+ / Attach** below.\n` +
    `✅ **STEP 3:** SEND THE IMAGE IN THIS THREAD.\n\n` +
    `⚠️ **YOUR APPLICATION CANNOT BE REVIEWED UNTIL THE SCREENSHOT IS SENT.**\n` +
    `⏱️ No activity for **1 hour** automatically closes this application.`
  );

  return thread;
}

/*
==================================================
RETRY PROOF THREAD
==================================================
*/

async function retryRankUploadThread(
  application,
  client,
  data
) {
  if (!application) {
    throw new Error("Application not found.");
  }

  if (application.status !== "pending_upload") {
    throw new Error("Application is not waiting for proof upload.");
  }

  const user = await client.users.fetch(application.userId);

  const interactionLike = {
    user
  };

  const thread = await createRankUploadThread(
    interactionLike,
    application,
    data,
    client
  );

  application.threadId = thread.id;
  application.lastActivityAt = Date.now();
  application.updatedAt = Date.now();

  await saveData(data);

  return thread;
}

/*
==================================================
FORWARD APPLICATION TO REVIEW
==================================================
*/

async function forwardRankApplication(
  application,
  attachment,
  client,
  data
) {
  const config =
    getRankConfig(data);

  if (!config.reviewChannelId) {
    throw new Error(
      "Rank Review channel ID is not configured."
    );
  }

  console.log(
    `📤 Forwarding application #${application.id} to review channel ${config.reviewChannelId}...`
  );

  const channel =
    await client.channels.fetch(
      config.reviewChannelId
    );

  if (!channel) {
    throw new Error(
      `Rank Review channel ${config.reviewChannelId} could not be found.`
    );
  }

  if (!channel.isTextBased()) {
    throw new Error(
      `Rank Review channel ${config.reviewChannelId} is not a text-based channel.`
    );
  }

  if (!attachment?.url) {
    throw new Error(
      "The uploaded proof attachment has no URL."
    );
  }

  /*
  ------------------------------------------------
  SAVE PROOF INFORMATION FIRST
  ------------------------------------------------
  */

  application.proofUrl =
    attachment.url;

  application.proofName =
    attachment.name ||
    "rank-proof.png";

  application.lastActivityAt =
    Date.now();

  /*
  ------------------------------------------------
  CREATE STAFF MESSAGE
  ------------------------------------------------
  */

  const embed =
    createRankReviewEmbed(
      application
    );

  let message;

  try {
    message =
      await channel.send({
        content:
          `<@${application.userId}>`,

        embeds: [
          embed
        ],

        files: [
          {
            attachment:
              attachment.url,

            name:
              attachment.name ||
              "rank-proof.png"
          }
        ],

        components: [
          createRankReviewButtons(
            application.id
          )
        ],

        allowedMentions: {
          users: [
            application.userId
          ]
        }
      });

  } catch (error) {
    console.error(
      `❌ Discord rejected application #${application.id} forwarding.`
    );

    console.error(
      "❌ Error name:",
      error?.name
    );

    console.error(
      "❌ Error message:",
      error?.message
    );

    console.error(
      "❌ Error code:",
      error?.code
    );

    /*
      IMPORTANT:
      Do NOT mark the application as pending_review.
      It remains pending_upload so the user can retry.
    */

    application.status =
      "pending_upload";

    application.lastActivityAt =
      Date.now();

    await saveData(data);

    throw error;
  }

  /*
  ------------------------------------------------
  ONLY MARK AS REVIEW AFTER SUCCESS
  ------------------------------------------------
  */

  application.status =
    "pending_review";

  application.reviewMessageId =
    message.id;

  application.lastActivityAt =
    Date.now();

  await saveData(data);

  console.log(
    `✅ Application #${application.id} successfully forwarded to staff. Message ID: ${message.id}`
  );

  return message;
}

/*
==================================================
RANK ROLE
==================================================
*/

async function applyRankRole(
  member,
  rankKey,
  data
) {
  const roleId =
    data.config.rank
      .rankRoleIds?.[rankKey] ||
    data.rankConfig
      .rankRoleIds?.[rankKey];

  if (!roleId) {
    return;
  }

  const allRankRoleIds =
    Object.values(
      data.config.rank
        .rankRoleIds ||
        data.rankConfig
          .rankRoleIds ||
        {}
    ).filter(Boolean);

  for (
    const oldRoleId
    of allRankRoleIds
  ) {
    if (
      oldRoleId !== roleId &&
      member.roles.cache.has(
        oldRoleId
      )
    ) {
      try {
        await member.roles.remove(
          oldRoleId,
          "Black Dragons rank update"
        );
      } catch (error) {
        console.error(
          "❌ Could not remove old rank role:",
          error
        );
      }
    }
  }

  if (
    !member.roles.cache.has(
      roleId
    )
  ) {
    try {
      await member.roles.add(
        roleId,
        "Black Dragons rank accepted"
      );
    } catch (error) {
      console.error(
        "❌ Could not add rank role:",
        error
      );
    }
  }
}

/*
==================================================
RANK HISTORY
==================================================
*/

async function recordRankHistory(
  data,
  application,
  action,
  reviewerId,
  previous = null,
  client = null
) {
  const entry = {
    applicationId:
      application.id,

    userId:
      application.userId,

    robloxUsername:
      application.robloxUsername,

    kills:
      application.kills,

    rank:
      getRank(
        application.kills
      ).key,

    action,

    reviewerId,

    previousKills:
      previous?.kills ?? null,

    previousRank:
      previous?.rank ?? null,

    reason:
      application.declineReason ||
      null,

    timestamp:
      Date.now()
  };

  if (
    !Array.isArray(
      data.rankHistory
    )
  ) {
    data.rankHistory =
      [];
  }

  data.rankHistory.push(
    entry
  );

  await saveData(data);

  const config =
    getRankConfig(data);

  if (
    !config.historyChannelId
  ) {
    return;
  }

  try {
    const channel =
      client
        ? await client.channels.fetch(
            config.historyChannelId
          )
        : null;

    if (
      !channel?.isTextBased()
    ) {
      return;
    }

    const embed =
      createRankReviewEmbed(
        application
      ).setTitle(
        action === "accepted"
          ? `✅ ACCEPTED • APPLICATION #${application.id}`
          : `❌ DECLINED • APPLICATION #${application.id}`
      );

    embed.addFields(
      {
        name:
          "👮 Reviewed By",

        value:
          `<@${reviewerId}>`,

        inline: true
      },

      {
        name:
          "📅 Reviewed",

        value:
          `<t:${Math.floor(
            Date.now() / 1000
          )}:F>`,

        inline: true
      }
    );

    if (
      application.declineReason
    ) {
      embed.addFields({
        name:
          "📝 Reason",

        value:
          application.declineReason
      });
    }

    await channel.send({
      embeds: [
        embed
      ]
    });
  } catch (error) {
    console.error(
      "❌ Could not write rank history:",
      error
    );
  }
}

/*
==================================================
CLOSE APPLICATION
==================================================
*/

async function closeApplication(
  application,
  data,
  client,
  reason = "Application closed",
  closedById = null
) {
  if (!application) {
    throw new Error(
      "Application not found."
    );
  }

  if (
    application.status !==
      "pending_upload" &&
    application.status !==
      "pending_review"
  ) {
    return false;
  }

  const config =
    getRankConfig(data);

  const now =
    Date.now();

  application.status =
    "closed";

  application.closedAt =
    now;

  application.closedById =
    closedById;

  application.closeReason =
    reason;

  application.lastActivityAt =
    now;

  /*
  ------------------------------------------------
  CLOSE PROOF THREAD
  ------------------------------------------------
  */

  if (
    application.threadId &&
    client
  ) {
    try {
      const thread =
        await client.channels.fetch(
          application.threadId
        );

      if (
        thread?.isThread()
      ) {
        try {
          await thread.send(
            `🔒 **Application #${application.id} closed.**\n\n${reason}`
          );
        } catch {
          // Thread may already be inaccessible.
        }

        try {
          await thread.setArchived(
            true,
            reason
          );
        } catch (error) {
          console.error(
            `⚠️ Could not archive proof thread for #${application.id}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error(
        `⚠️ Could not fetch proof thread for #${application.id}:`,
        error
      );
    }
  }

  /*
  ------------------------------------------------
  DISABLE REVIEW BUTTONS
  ------------------------------------------------
  */

  if (
    application.reviewMessageId &&
    client &&
    config.reviewChannelId
  ) {
    try {
      const channel =
        await client.channels.fetch(
          config.reviewChannelId
        );

      if (
        channel?.isTextBased()
      ) {
        const message =
          await channel.messages.fetch(
            application.reviewMessageId
          );

        if (message) {
          await message.edit({
            content:
              `🔒 **Application #${application.id} closed.**\n${reason}`,

            components: []
          });
        }
      }
    } catch (error) {
      console.error(
        `⚠️ Could not close review message for #${application.id}:`,
        error
      );
    }
  }

  /*
    IMPORTANT:
    This does NOT delete the application.
    It stays in data + Firestore.
  */

  await saveData(data);

  console.log(
    `🔒 Rank application #${application.id} closed: ${reason}`
  );

  return true;
}

/*
==================================================
AUTO CLOSE INACTIVE APPLICATIONS
==================================================
*/

async function closeInactiveApplications(
  client,
  data
) {
  if (
    !Array.isArray(
      data.rankApplications
    )
  ) {
    data.rankApplications =
      [];

    return 0;
  }

  const now =
    Date.now();

  const inactive = [];

  for (
    const application
    of data.rankApplications
  ) {
    if (
      application.status !==
        "pending_upload" &&
      application.status !==
        "pending_review"
    ) {
      continue;
    }

    /*
      Older applications may not have
      lastActivityAt.

      In that case we use createdAt.
    */

    const lastActivity =
      Number(
        application.lastActivityAt
      ) ||
      Number(
        application.createdAt
      ) ||
      now;

    if (
      now - lastActivity >=
      INACTIVITY_LIMIT
    ) {
      inactive.push(
        application
      );
    }
  }

  if (!inactive.length) {
    return 0;
  }

  for (
    const application
    of inactive
  ) {
    try {
      await closeApplication(
        application,
        data,
        client,
        "Automatically closed after 1 hour of inactivity.",
        null
      );
    } catch (error) {
      console.error(
        `❌ Could not automatically close application #${application.id}:`,
        error
      );
    }
  }

  return inactive.length;
}

/*
==================================================
PROCESS PROOF MESSAGE
==================================================
*/

async function processProofMessage(
  message,
  data,
  client
) {
  if (
    message.author.bot ||
    !message.channel.isThread()
  ) {
    return;
  }

  const application =
    data.rankApplications.find(
      app =>
        app.threadId ===
          message.channel.id &&
        app.status ===
          "pending_upload" &&
        app.userId ===
          message.author.id
    );

  if (!application) {
    return;
  }

  /*
    Any message from the applicant counts
    as activity.
  */

  application.lastActivityAt =
    Date.now();

  const attachment =
    message.attachments.find(
      file =>
        file.contentType?.startsWith(
          "image/"
        ) ||
        /\.(png|jpe?g|webp|gif)$/i.test(
          file.name || ""
        )
    );

  if (!attachment) {
    await saveData(data);

    await message.reply(
      "⚠️ Please upload the leaderboard screenshot as an image attachment."
    );

    return;
  }

  try {
    await message.react(
      "✅"
    );

    await forwardRankApplication(
  application,
  attachment,
  client,
  data
);
    await saveData(data);

    await message.channel.send(
      `✅ **Proof received.** Your application has been sent to staff for review.\n\n` +
      `Application: **#${application.id}**\n` +
      `Status: 🟡 Pending Review\n\n` +
      `⏱️ The application will close automatically if there is no activity for **1 hour**.`
    );

    try {
      await message.channel.setArchived(
        true
      );
    } catch {
      // Optional.
    }

    console.log(
      `✅ Rank application #${application.id} sent for review.`
    );
  } catch (error) {
    console.error(
      "❌ Could not forward rank proof:",
      error
    );

    await message.channel.send(
      "❌ I could not forward your proof to staff. Please contact an administrator."
    );
  }
}

module.exports = {
  sendRankPanel,
  createRankUploadThread,
  retryRankUploadThread,
  forwardRankApplication,
  applyRankRole,
  recordRankHistory,
  closeApplication,
  closeInactiveApplications,
  processProofMessage,
  INACTIVITY_LIMIT
};
