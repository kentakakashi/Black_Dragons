const { PermissionFlagsBits } = require("discord.js");
const {
  getRank,
  getRankDisplay,
  formatKills
} = require("../utils/ranks");
const { getRankConfig } = require("../utils/config");
const { createRankModal } = require("../modals/rank");
const { createDeclineModal } = require("../modals/decline");
const { createRankReviewEmbed } = require("../embeds/rank");
const { saveData } = require("../utils/database");

function touchApplication(application, activity = true) {
  const timestamp = Date.now();

  application.updatedAt = timestamp;

  if (activity) {
    application.lastActivityAt = timestamp;
  }
}

function getPendingApplication(data, userId) {
  if (!Array.isArray(data.rankApplications)) {
    data.rankApplications = [];
  }

  return data.rankApplications.find(
    app =>
      app.userId === userId &&
      (app.status === "pending_upload" ||
        app.status === "pending_review")
  );
}

function newApplication(
  interaction,
  isUpdate,
  kills,
  robloxUsername
) {
  const timestamp = Date.now();

  return {
    id:
      `${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`.toUpperCase(),

    userId: interaction.user.id,
    discordUsername: interaction.user.username,

    robloxUsername,
    kills,
    rank: getRank(kills).key,

    type: isUpdate ? "update" : "register",

    status: "pending_upload",

    createdAt: timestamp,
    updatedAt: timestamp,
    lastActivityAt: timestamp,

    threadId: null,
    reviewMessageId: null,

    proofUrl: null,
    proofName: null,

    reviewerId: null,
    reviewedAt: null,

    declineReason: null,

    closedAt: null,
    closedById: null,
    closeReason: null
  };
}

/*
 * Find an application from a review button.
 *
 * Normally the application must be pending_review.
 *
 * If an old database copy incorrectly says pending_upload,
 * but the clicked Discord review message belongs to this exact
 * application and proof exists, repair it to pending_review.
 */
function getReviewApplication(
  data,
  applicationId,
  interaction
) {
  if (!Array.isArray(data.rankApplications)) {
    data.rankApplications = [];
  }

  const application = data.rankApplications.find(
    app => String(app.id) === String(applicationId)
  );

  if (!application) {
    return null;
  }

  if (application.status === "pending_review") {
    return application;
  }

  const sameReviewMessage =
    application.reviewMessageId &&
    interaction.message?.id &&
    String(application.reviewMessageId) ===
      String(interaction.message.id);

  if (
    application.status === "pending_upload" &&
    sameReviewMessage &&
    application.proofUrl
  ) {
    application.status = "pending_review";
    touchApplication(application);

    return application;
  }

  return null;
}

/* =========================================================
   BUTTONS
========================================================= */

async function handleRankButton(
  interaction,
  data,
  client
) {
  /* REGISTER / UPDATE */

  if (
    interaction.customId === "rank_register" ||
    interaction.customId === "rank_update"
  ) {
    const config = getRankConfig(data);

    if (
      !config.registrationChannelId ||
      !config.reviewChannelId
    ) {
      await interaction.reply({
        content:
          "❌ The kill-rank system has not been configured yet. An administrator must use `/setup` first.",
        ephemeral: true
      });

      return true;
    }

    const pending = getPendingApplication(
      data,
      interaction.user.id
    );

    if (pending) {
      await interaction.reply({
        content:
          `⏳ You already have an active rank application **#${pending.id}**.\n\n` +
          "Finish that application before starting another one.",
        ephemeral: true
      });

      return true;
    }

    const isUpdate =
      interaction.customId === "rank_update";

    if (
      isUpdate &&
      !data.rankUsers?.[interaction.user.id]
    ) {
      await interaction.reply({
        content:
          "❌ You do not have an approved rank yet. Please use **REGISTER RANK** first.",
        ephemeral: true
      });

      return true;
    }

    await interaction.showModal(
      createRankModal(isUpdate)
    );

    return true;
  }

  /* ACCEPT */

  if (
    interaction.customId.startsWith("rank_accept:")
  ) {
    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      await interaction.reply({
        content:
          "❌ Only administrators can review rank applications.",
        ephemeral: true
      });

      return true;
    }

    const applicationId =
      interaction.customId.split(":")[1];

    const application =
      getReviewApplication(
        data,
        applicationId,
        interaction
      );

    if (!application) {
      await interaction.reply({
        content:
          "❌ This application is no longer awaiting review.",
        ephemeral: true
      });

      return true;
    }

    try {
      /*
       * Acknowledge the button immediately. Firebase, member fetching,
       * role changes, and history logging can take long enough to make
       * interaction.update() expire.
       */
      await interaction.deferUpdate();

      /*
       * Persist a repaired pending_review state before accepting.
       */
      await saveData(data);

      const rank = getRank(application.kills);

      const member =
        await interaction.guild.members.fetch(
          application.userId
        );

      const rankSystem =
        require("../systems/rankSystem");

      const previous =
        data.rankUsers?.[application.userId] || null;

      await rankSystem.applyRankRole(
        member,
        rank.key,
        data
      );

      if (!data.rankUsers) {
        data.rankUsers = {};
      }

      const timestamp = Date.now();

      data.rankUsers[application.userId] = {
        discordId: application.userId,

        robloxUsername:
          application.robloxUsername,

        kills: application.kills,

        rank: rank.key,

        verifiedAt:
          previous?.verifiedAt || timestamp,

        updatedAt: timestamp,

        lastReviewerId:
          interaction.user.id
      };

      application.status = "accepted";
      application.reviewerId =
        interaction.user.id;
      application.reviewedAt =
        timestamp;

      touchApplication(application);

      /*
       * Save the accepted state BEFORE writing history.
       */
      await saveData(data);

      await rankSystem.recordRankHistory(
        data,
        application,
        "accepted",
        interaction.user.id,
        previous,
        client
      );

      await interaction.editReply({
        content:
          "✅ **Application accepted.**",

        embeds: [
          createRankReviewEmbed(application)
        ],

        components: []
      });

      try {
        const user =
          await client.users.fetch(
            application.userId
          );

        await user.send(
          `🏆 **Your Black Dragons rank application has been accepted!**\n\n` +
          `**Kills:** ${formatKills(
            application.kills
          )}\n` +
          `**Rank:** ${getRankDisplay(rank)}`
        );
      } catch {
        console.log(
          "Could not DM applicant."
        );
      }
    } catch (error) {
      console.error(
        "❌ Could not accept rank application:",
        error
      );

      if (
        error?.code === 10062 ||
        error?.code === 10015
      ) {
        return true;
      }
      if (error?.code === "RANK_ROLE_ERROR") {
        try {
          await interaction.editReply({
            content:
              "❌ **Rank role update failed.**\\n\\n" +
              error.message +
              "\\n\\n**The application is still waiting for review. Fix the role setup/hierarchy and press ACCEPT again.**",
            embeds: [
              createRankReviewEmbed(application)
            ],
            components: [
              require("../embeds/rank").createRankReviewButtons(
                application.id
              )
            ]
          });
        } catch (responseError) {
          console.error(
            "❌ Could not report rank role failure:",
            responseError
          );
        }

        return true;
      }

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content:
              "❌ Something went wrong while accepting the application.\n\n" +
              "Check the Bot-Hosting console for the exact error.",
            embeds: [],
            components: []
          });
        } else {
          await interaction.reply({
            content:
              "❌ Something went wrong while accepting the application.\n\n" +
              "Check the Bot-Hosting console for the exact error.",
            ephemeral: true
          });
        }
      } catch (responseError) {
        console.error(
          "❌ Could not send rank acceptance error response:",
          responseError
        );
      }
    }

    return true;
  }

  /* DECLINE */

  if (
    interaction.customId.startsWith("rank_decline:")
  ) {
    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      await interaction.reply({
        content:
          "❌ Only administrators can review rank applications.",
        ephemeral: true
      });

      return true;
    }

    const applicationId =
      interaction.customId.split(":")[1];

    const application =
      getReviewApplication(
        data,
        applicationId,
        interaction
      );

    if (!application) {
      await interaction.reply({
        content:
          "❌ This application is no longer awaiting review.",
        ephemeral: true
      });

      return true;
    }

    /*
     * Do not delay showModal with Firebase I/O. The modal submission
     * will persist the repaired application state safely.
     */
    await interaction.showModal(
      createDeclineModal(applicationId)
    );

    return true;
  }

  return false;
}

/* =========================================================
   REGISTER / UPDATE MODAL
========================================================= */

async function handleRankModal(
  interaction,
  data,
  client
) {
  if (
    interaction.customId !==
      "rank_register_modal" &&
    interaction.customId !==
      "rank_update_modal"
  ) {
    return false;
  }

  const isUpdate =
    interaction.customId ===
    "rank_update_modal";

  const robloxUsername =
    interaction.fields
      .getTextInputValue(
        "roblox_username"
      )
      .trim();

  const killText =
    interaction.fields
      .getTextInputValue(
        "kill_count"
      )
      .replace(/,/g, "")
      .trim();

  const kills = Number(killText);

  if (!robloxUsername) {
    await interaction.reply({
      content:
        "❌ Please enter your Roblox username.",
      ephemeral: true
    });

    return true;
  }

  if (
    !Number.isInteger(kills) ||
    kills < 0 ||
    kills > 1000000000
  ) {
    await interaction.reply({
      content:
        "❌ Please enter a valid whole-number kill count.",
      ephemeral: true
    });

    return true;
  }

  const pending =
    getPendingApplication(
      data,
      interaction.user.id
    );

  if (pending) {
    await interaction.reply({
      content:
        `❌ You already have an active application **#${pending.id}**.`,
      ephemeral: true
    });

    return true;
  }

  if (
    isUpdate &&
    !data.rankUsers?.[interaction.user.id]
  ) {
    await interaction.reply({
      content:
        "❌ You do not have an approved rank yet. Please use **REGISTER RANK** first.",
      ephemeral: true
    });

    return true;
  }

  const application =
    newApplication(
      interaction,
      isUpdate,
      kills,
      robloxUsername
    );

  // Acknowledge immediately so Discord does not expire the modal interaction
  // while Firebase/Discord thread creation is still running.
  await interaction.deferReply({ ephemeral: true });

  if (
    !Array.isArray(
      data.rankApplications
    )
  ) {
    data.rankApplications = [];
  }

  data.rankApplications.push(
    application
  );

  await saveData(data);

  try {
    const rankSystem =
      require("../systems/rankSystem");

    const thread =
      await rankSystem.createRankUploadThread(
        interaction,
        application,
        data,
        client
      );

    application.threadId =
      thread.id;

    touchApplication(application);

    await saveData(data);

    await interaction.editReply({
      content:
        `✅ **Application #${application.id} created.**\n\n` +
        `📁 ${thread}\n\n` +
        "Please open the thread and upload your leaderboard screenshot there."
    });
  } catch (error) {
    console.error(
      "❌ Could not create rank upload thread:",
      error
    );

    // Keep the application recoverable. A temporary Discord/API failure
    // must never erase a legitimate application.
    application.status =
      "pending_upload";

    touchApplication(application);

    await saveData(data);

    await interaction.editReply({
      content:
        "❌ I could not create the proof-upload thread.\n\n" +
        `Your application **#${application.id}** was saved and remains recoverable. An administrator can retry the proof thread from **/applications**.`
    });
  }

  return true;
}

/* =========================================================
   DECLINE MODAL
========================================================= */

async function handleDeclineModal(
  interaction,
  data,
  client
) {
  if (
    !interaction.customId.startsWith(
      "rank_decline_modal:"
    )
  ) {
    return false;
  }

  if (
    !interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator
    )
  ) {
    await interaction.reply({
      content:
        "❌ Only administrators can review rank applications.",
      ephemeral: true
    });

    return true;
  }

  const applicationId =
    interaction.customId.split(":")[1];

  const reason =
    interaction.fields
      .getTextInputValue(
        "decline_reason"
      )
      .trim();

  const application =
    getReviewApplication(
      data,
      applicationId,
      interaction
    );

  if (!application) {
    await interaction.reply({
      content:
        "❌ This application is no longer awaiting review.",
      ephemeral: true
    });

    return true;
  }

  const timestamp = Date.now();

  application.status =
    "declined";

  application.reviewerId =
    interaction.user.id;

  application.reviewedAt =
    timestamp;

  application.declineReason =
    reason;

  touchApplication(application);

  /*
   * Acknowledge the modal immediately so database/history work
   * cannot make the modal interaction expire.
   */
  await interaction.deferUpdate();

  await saveData(data);

  const rankSystem =
    require("../systems/rankSystem");

  await rankSystem.recordRankHistory(
    data,
    application,
    "declined",
    interaction.user.id,
    null,
    client
  );

  await interaction.editReply({
    content:
      "❌ **Application declined.**",

    embeds: [
      createRankReviewEmbed(
        application
      ).addFields({
        name: "📝 Reason",
        value:
          reason || "No reason provided."
      })
    ],

    components: []
  });

  try {
    const user =
      await client.users.fetch(
        application.userId
      );

    await user.send(
      `❌ **Your Black Dragons rank application has been declined.**\n\n` +
      `**Reason:** ${
        reason || "No reason provided."
      }\n\n` +
      "You may submit a new application after correcting the issue."
    );
  } catch {
    console.log(
      "Could not DM applicant."
    );
  }

  return true;
}

module.exports = {
  handleRankButton,
  handleRankModal,
  handleDeclineModal,
  getPendingApplication
};
