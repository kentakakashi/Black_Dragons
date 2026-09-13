const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const rankSystem = require("../systems/rankSystem");
const {
  getRankDisplay,
  getRank,
  formatKills
} = require("../utils/ranks");

const PAGE_SIZE = 5;
const sessions = new Map();

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator
  );
}

function getOpenApplications(data) {
  if (!Array.isArray(data.rankApplications)) {
    data.rankApplications = [];
  }

  return data.rankApplications
    .filter(
      app =>
        app.status === "pending_upload" ||
        app.status === "pending_review"
    )
    .sort(
      (a, b) =>
        (a.createdAt || 0) -
        (b.createdAt || 0)
    );
}

function formatAge(timestamp) {
  if (!timestamp) {
    return "Unknown";
  }

  const seconds = Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) / 1000
    )
  );

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.floor(minutes / 60);

  return `${hours}h ${minutes % 60}m ago`;
}

function stageText(application) {
  if (
    application.status ===
    "pending_upload"
  ) {
    return "🟡 Waiting for proof";
  }

  if (
    application.status ===
    "pending_review"
  ) {
    return "🔵 Waiting for admin review";
  }

  return application.status || "Unknown";
}

function createApplicationsEmbed(
  applications,
  page
) {
  const totalPages = Math.max(
    1,
    Math.ceil(
      applications.length /
        PAGE_SIZE
    )
  );

  const start =
    page * PAGE_SIZE;

  const current =
    applications.slice(
      start,
      start + PAGE_SIZE
    );

  const embed =
    new EmbedBuilder()
      .setColor(0x8B0000)
      .setTitle(
        "⚔️ BLACK DRAGONS • OPEN APPLICATIONS"
      )
      .setDescription(
        applications.length
          ? "These rank applications are currently open. Administrators can close any application at any time.\n\n" +
            "**Automatic rule:** applications with no activity for **1 hour** are closed automatically."
          : "There are currently **no open rank applications**."
      )
      .setFooter({
        text:
          `Black Dragons • Page ${page + 1}/${totalPages} • ` +
          `${applications.length} open`
      })
      .setTimestamp();

  for (const application of current) {
    const rank =
      getRank(application.kills);

    embed.addFields({
      name:
        `📋 #${application.id} • ` +
        `${stageText(application)}`,

      value:
        `👤 **Discord:** <@${application.userId}>\n` +
        `🎮 **Roblox:** ${application.robloxUsername || "Unknown"}\n` +
        `⚔️ **Kills:** ${formatKills(application.kills)}\n` +
        `🏅 **Rank:** ${getRankDisplay(rank)}\n` +
        `🕐 **Last activity:** ${formatAge(
          application.lastActivityAt ||
            application.createdAt
        )}\n` +
        `📅 **Created:** <t:${Math.floor(
          (application.createdAt ||
            Date.now()) /
            1000
        )}:R>`,

      inline: false
    });
  }

  return embed;
}

function createButtons(
  applications,
  page
) {
  const totalPages = Math.max(
    1,
    Math.ceil(
      applications.length /
        PAGE_SIZE
    )
  );

  const start =
    page * PAGE_SIZE;

  const current =
    applications.slice(
      start,
      start + PAGE_SIZE
    );

  const rows = [];

  /*
    Discord allows a maximum of
    5 buttons in one row.

    Put all CLOSE buttons into
    one row, then navigation into
    a second row.
  */

  if (current.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        current.map(
          application =>
            new ButtonBuilder()
              .setCustomId(
                `applications_close:${application.id}`
              )
              .setLabel(
                `CLOSE #${application.id}`
              )
              .setEmoji("🔒")
              .setStyle(
                ButtonStyle.Danger
              )
        )
      )
    );
  }

  const navigation =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "applications:prev"
        )
        .setLabel("PREVIOUS")
        .setEmoji("⬅️")
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(page <= 0),

      new ButtonBuilder()
        .setCustomId(
          "applications:refresh"
        )
        .setLabel("REFRESH")
        .setEmoji("🔄")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "applications:next"
        )
        .setLabel("NEXT")
        .setEmoji("➡️")
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(
          page >= totalPages - 1
        )
    );

  rows.push(navigation);

  return rows;
}

function sessionKey(
  interaction
) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function saveSession(
  interaction,
  session
) {
  sessions.set(
    sessionKey(interaction),
    session
  );
}

function getSession(
  interaction
) {
  return sessions.get(
    sessionKey(interaction)
  );
}

async function execute(
  interaction,
  context
) {
  if (!isAdmin(interaction)) {
    await interaction.reply({
      content:
        "❌ Only administrators can use `/applications`.",
      ephemeral: true
    });

    return;
  }

  const applications =
    getOpenApplications(
      context.data
    );

  saveSession(
    interaction,
    {
      page: 0
    }
  );

  await interaction.reply({
    embeds: [
      createApplicationsEmbed(
        applications,
        0
      )
    ],

    components:
      createButtons(
        applications,
        0
      ),

    ephemeral: true
  });
}

async function handleButton(
  interaction,
  context
) {
  if (
    !interaction.customId.startsWith(
      "applications"
    )
  ) {
    return false;
  }

  if (!isAdmin(interaction)) {
    await interaction.reply({
      content:
        "❌ Only administrators can manage applications.",
      ephemeral: true
    });

    return true;
  }

  const session =
    getSession(interaction) ||
    {
      page: 0
    };

  /*
  ================================================
  CLOSE APPLICATION
  ================================================
  */

  if (
    interaction.customId.startsWith(
      "applications_close:"
    )
  ) {
    const applicationId =
      interaction.customId.split(
        ":"
      )[1];

    const application =
      context.data.rankApplications?.find(
        app =>
          app.id ===
          applicationId
      );

    if (
      !application ||
      !(
        application.status ===
          "pending_upload" ||
        application.status ===
          "pending_review"
      )
    ) {
      const applications =
        getOpenApplications(
          context.data
        );

      const maxPage =
        Math.max(
          0,
          Math.ceil(
            applications.length /
              PAGE_SIZE
          ) - 1
        );

      session.page =
        Math.min(
          session.page,
          maxPage
        );

      saveSession(
        interaction,
        session
      );

      await interaction.update({
        embeds: [
          createApplicationsEmbed(
            applications,
            session.page
          )
        ],
        components:
          createButtons(
            applications,
            session.page
          )
      });

      return true;
    }

    try {
      await rankSystem.closeApplication(
        application,
        context.data,
        context.client,
        `Manually closed by administrator ${interaction.user.tag}`,
        interaction.user.id
      );
    } catch (error) {
      console.error(
        "❌ Could not close application:",
        error
      );

      await interaction.reply({
        content:
          "❌ I could not close that application. Check the bot permissions and try again.",
        ephemeral: true
      });

      return true;
    }

    const applications =
      getOpenApplications(
        context.data
      );

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          applications.length /
            PAGE_SIZE
        )
      );

    session.page =
      Math.min(
        session.page,
        totalPages - 1
      );

    saveSession(
      interaction,
      session
    );

    await interaction.update({
      embeds: [
        createApplicationsEmbed(
          applications,
          session.page
        )
      ],

      components:
        createButtons(
          applications,
          session.page
        )
    });

    return true;
  }

  /*
  ================================================
  PAGINATION / REFRESH
  ================================================
  */

  if (
    interaction.customId ===
    "applications:prev"
  ) {
    session.page =
      Math.max(
        0,
        session.page - 1
      );
  }

  if (
    interaction.customId ===
    "applications:next"
  ) {
    const applications =
      getOpenApplications(
        context.data
      );

    const maxPage =
      Math.max(
        0,
        Math.ceil(
          applications.length /
            PAGE_SIZE
        ) - 1
      );

    session.page =
      Math.min(
        maxPage,
        session.page + 1
      );
  }

  /*
    Refresh keeps the current page.
  */

  const applications =
    getOpenApplications(
      context.data
    );

  const maxPage =
    Math.max(
      0,
      Math.ceil(
        applications.length /
          PAGE_SIZE
      ) - 1
    );

  session.page =
    Math.min(
      Math.max(
        0,
        session.page
      ),
      maxPage
    );

  saveSession(
    interaction,
    session
  );

  await interaction.update({
    embeds: [
      createApplicationsEmbed(
        applications,
        session.page
      )
    ],

    components:
      createButtons(
        applications,
        session.page
      )
  });

  return true;
}

module.exports = {
  name: "applications",
  execute,
  handleButton
};
