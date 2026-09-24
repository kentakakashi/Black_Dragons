const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType
} = require("discord.js");

const {
  STEPS,
  createSetupEmbed
} = require("../embeds/setup");

const {
  saveData
} = require("../utils/database");

const sessions = new Map();

/*
==================================================
SESSION HELPERS
==================================================
*/

function sessionKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function getSession(interaction) {
  return sessions.get(
    sessionKey(interaction)
  );
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

function clearSession(
  interaction
) {
  sessions.delete(
    sessionKey(interaction)
  );
}

/*
==================================================
CURRENT VALUE
==================================================
*/

function currentValue(
  data,
  stepKey
) {
  const h =
    data.config.helpDesk;

  const r =
    data.config.rank;

  const map = {
    helpdesk_channel:
      h.channelId,

    war_role:
      h.warRoleId,

    backup_role:
      h.backupRoleId,

    rank_registration:
      r.registrationChannelId,

    rank_review:
      r.reviewChannelId,

    rank_history:
      r.historyChannelId,

    leaderboard_channel:
      r.leaderboardChannelId
  };

  if (stepKeyStartsWithRankRole(stepKey)) {
    const rankKey = stepKey.replace("rank_role_", "");
    return r.rankRoleIds?.[rankKey] || null;
  }

  return (
    map[stepKey] || null
  );
}

function stepKeyStartsWithRankRole(stepKey) {
  return typeof stepKey === "string" &&
    stepKey.startsWith("rank_role_");
}

/*
==================================================
CONTROLS
==================================================
*/

function controlsForStep(
  stepIndex
) {
  const step =
    STEPS[stepIndex];

  const select =
    (
      step.key.endsWith("_role") ||
      step.key.startsWith("rank_role_")
    )
      ? new RoleSelectMenuBuilder()
          .setCustomId(
            `setup_select:${step.key}`
          )
          .setPlaceholder(
            "Select a role"
          )
          .setMinValues(1)
          .setMaxValues(1)

      : new ChannelSelectMenuBuilder()
          .setCustomId(
            `setup_select:${step.key}`
          )
          .setPlaceholder(
            "Select a text channel"
          )
          .setMinValues(1)
          .setMaxValues(1)
          .addChannelTypes(
            ChannelType.GuildText
          );

  const selectRow =
    new ActionRowBuilder()
      .addComponents(select);

  const navRow =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "setup_skip"
          )
          .setLabel(
            "SKIP, LEAVE UNCHANGED"
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "setup_next"
          )
          .setLabel(
            stepIndex ===
            STEPS.length - 1
              ? "FINISH"
              : "NEXT"
          )
          .setStyle(
            ButtonStyle.Success
          )
      );

  return [
    selectRow,
    navRow
  ];
}

/*
==================================================
START SETUP
==================================================
*/

async function startSetup(
  interaction,
  data
) {
  if (
    !interaction.memberPermissions?.has(
      "Administrator"
    )
  ) {
    await interaction.reply({
      content:
        "❌ You need **Administrator** permission to use the setup wizard.",
      ephemeral: true
    });

    return;
  }

  const session = {
    step: 0
  };

  saveSession(
    interaction,
    session
  );

  await interaction.reply({
    embeds: [
      createSetupEmbed(
        0,
        currentValue(
          data,
          STEPS[0].key
        )
      )
    ],

    components:
      controlsForStep(0),

    ephemeral: true
  });
}

/*
==================================================
HANDLE SETUP
==================================================
*/

async function handleSetupButton(
  interaction,
  data
) {
  if (
    !interaction.customId.startsWith(
      "setup_"
    )
  ) {
    return false;
  }

  const session =
    getSession(interaction);

  if (!session) {
    await interaction.reply({
      content:
        "❌ Your setup session expired. Run `/setup` again.",
      ephemeral: true
    });

    return true;
  }

  /*
  -----------------------------------------------
  CANCEL
  -----------------------------------------------
  */

  if (
    interaction.customId ===
    "setup_cancel"
  ) {
    clearSession(interaction);

    await interaction.update({
      content:
        "Setup cancelled.",
      embeds: [],
      components: []
    });

    return true;
  }

  /*
  -----------------------------------------------
  NEXT / SKIP
  -----------------------------------------------
  */

  if (
    interaction.customId ===
      "setup_skip" ||
    interaction.customId ===
      "setup_next"
  ) {
    if (
      interaction.customId ===
        "setup_next" &&
      !session.selected
    ) {
      await interaction.reply({
        content:
          "⚠️ Select a value first, or press Skip.",
        ephemeral: true
      });

      return true;
    }

    /*
      SAVE THE SELECTED VALUE.

      IMPORTANT:
      We await Firestore here.
      The setup wizard will not claim the
      setting is saved until the cloud save
      has completed.
    */

    if (session.selected) {
      applySelection(
        data,
        STEPS[session.step].key,
        session.selected
      );

      session.selected = null;

      await saveData(data);
    }

    /*
    ---------------------------------------------
    FINISH
    ---------------------------------------------
    */

    if (
      session.step >=
      STEPS.length - 1
    ) {
      /*
        Save one final time so the complete
        configuration definitely exists in
        Firestore.
      */

      await saveData(data);

      clearSession(
        interaction
      );

      await interaction.update({
        content:
          "✅ **BLACK DRAGONS setup complete.** Your saved settings are now active and stored permanently.",
        embeds: [],
        components: []
      });

      return true;
    }

    session.step++;

    saveSession(
      interaction,
      session
    );

    await interaction.update({
      embeds: [
        createSetupEmbed(
          session.step,
          currentValue(
            data,
            STEPS[
              session.step
            ].key
          )
        )
      ],

      components:
        controlsForStep(
          session.step
        )
    });

    return true;
  }

  /*
  -----------------------------------------------
  SELECT MENU
  -----------------------------------------------
  */

  if (
    interaction.customId.startsWith(
      "setup_select:"
    )
  ) {
    const key =
      interaction.customId.split(
        ":"
      )[1];

    session.selected =
      interaction.values[0];

    saveSession(
      interaction,
      session
    );

    await interaction.update({
      embeds: [
        createSetupEmbed(
          session.step,

          key.endsWith("_role")
            ? `<@&${session.selected}>`
            : `<#${session.selected}>`
        )
      ],

      components:
        controlsForStep(
          session.step
        )
    });

    return true;
  }

  return false;
}

/*
==================================================
APPLY SELECTION
==================================================
*/

function applySelection(
  data,
  key,
  value
) {
  if (
    key ===
    "helpdesk_channel"
  ) {
    data.config.helpDesk.channelId =
      value;

  } else if (
    key === "war_role"
  ) {
    data.config.helpDesk.warRoleId =
      value;

  } else if (
    key === "backup_role"
  ) {
    data.config.helpDesk.backupRoleId =
      value;

  } else if (
    key === "rank_registration"
  ) {
    data.config.rank.registrationChannelId =
      value;

  } else if (
    key === "rank_review"
  ) {
    data.config.rank.reviewChannelId =
      value;

  } else if (
    key === "rank_history"
  ) {
    data.config.rank.historyChannelId =
      value;

  } else if (
    key === "leaderboard_channel"
  ) {
    data.config.rank.leaderboardChannelId =
      value;
  } else if (stepKeyStartsWithRankRole(key)) {
    const rankKey =
      key.replace("rank_role_", "");

    data.config.rank.rankRoleIds[rankKey] =
      value;
  }

  /*
    Keep legacy Rank configuration synchronized.
  */

  data.rankConfig = {
    ...data.rankConfig,

    registrationChannelId:
      data.config.rank
        .registrationChannelId,

    reviewChannelId:
      data.config.rank
        .reviewChannelId,

    historyChannelId:
      data.config.rank
        .historyChannelId,

    rankRoleIds: {
      ...(data.rankConfig
        .rankRoleIds || {}),

      ...(data.config.rank
        .rankRoleIds || {})
    }
  };
}

/*
==================================================
EXPORTS
==================================================
*/

module.exports = {
  startSetup,
  handleSetupButton
};
