const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

/*
==================================================
HELP DESK CONFIG
==================================================
*/

function getHelpDeskConfig(
  data
) {
  const saved =
    data.config?.helpDesk || {};

  return {
    channelId:
      saved.channelId ||
      process.env.DASHBOARD_CHANNEL_ID ||
      null,

    warRoleId:
      saved.warRoleId ||
      process.env.WAR_ROLE_ID ||
      null,

    backupRoleId:
      saved.backupRoleId ||
      process.env.BACKUP_ROLE_ID ||
      null
  };
}

/*
==================================================
RANK CONFIG
==================================================
*/

function getRankConfig(
  data
) {
  const saved =
    data.config?.rank || {};

  const legacy =
    data.rankConfig || {};

  return {
    registrationChannelId:
      saved.registrationChannelId ||
      legacy.registrationChannelId ||
      null,

    reviewChannelId:
      saved.reviewChannelId ||
      legacy.reviewChannelId ||
      null,

    historyChannelId:
      saved.historyChannelId ||
      legacy.historyChannelId ||
      null,

    leaderboardChannelId:
      saved.leaderboardChannelId ||
      null,

    rankRoleIds: {
      Z:
        saved.rankRoleIds?.Z ||
        legacy.rankRoleIds?.Z ||
        null,

      SSS:
        saved.rankRoleIds?.SSS ||
        legacy.rankRoleIds?.SSS ||
        null,

      SS:
        saved.rankRoleIds?.SS ||
        legacy.rankRoleIds?.SS ||
        null,

      S:
        saved.rankRoleIds?.S ||
        legacy.rankRoleIds?.S ||
        null,

      A:
        saved.rankRoleIds?.A ||
        legacy.rankRoleIds?.A ||
        null,

      B:
        saved.rankRoleIds?.B ||
        legacy.rankRoleIds?.B ||
        null,

      C:
        saved.rankRoleIds?.C ||
        legacy.rankRoleIds?.C ||
        null,

      D:
        saved.rankRoleIds?.D ||
        legacy.rankRoleIds?.D ||
        null,

      E:
        saved.rankRoleIds?.E ||
        legacy.rankRoleIds?.E ||
        null
    }
  };
}

/*
==================================================
SLASH COMMANDS
==================================================
*/

function buildCommands() {
  return [
    /*
    ==============================
    SETUP
    ==============================
    */

    new SlashCommandBuilder()
      .setName("setup")
      .setDescription(
        "Open the Black Dragons setup wizard."
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator.toString()
      ),

    /*
    ==============================
    RANK VIEW
    ==============================
    */

    new SlashCommandBuilder()
      .setName("rank-view")
      .setDescription(
        "View an approved Black Dragons rank."
      )
      .addUserOption(
        option =>
          option
            .setName("user")
            .setDescription(
              "The Discord user to view."
            )
            .setRequired(false)
      ),

    /*
    ==============================
    LEADERBOARD
    ==============================
    */

    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription(
        "Show the Black Dragons kill leaderboard."
      ),

    /*
    ==============================
    APPLICATIONS
    ==============================
    */

    new SlashCommandBuilder()
      .setName("applications")
      .setDescription(
        "View and manage all open Black Dragons rank applications."
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator.toString()
      ),

    /*
    ==================================================
    ALLIES
    ==================================================
    */

    new SlashCommandBuilder()
      .setName("allies")
      .setDescription(
        "Manage the Black Dragons allied clans list."
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator.toString()
      )

      /*
      ==============================
      SETUP
      ==============================
      */

      .addSubcommand(
        subcommand =>
          subcommand
            .setName("setup")
            .setDescription(
              "Create or move the permanent Allies message."
            )
            .addChannelOption(
              option =>
                option
                  .setName("channel")
                  .setDescription(
                    "The channel where the permanent Allies message should live."
                  )
                  .addChannelTypes(
                    ChannelType.GuildText
                  )
                  .setRequired(true)
            )
      )

      /*
      ==============================
      VIEW
      ==============================
      */

      .addSubcommand(
        subcommand =>
          subcommand
            .setName("view")
            .setDescription(
              "Preview the current Allies list."
            )
      )

      /*
      ==============================
      ADD
      ==============================
      */

      .addSubcommand(
        subcommand =>
          subcommand
            .setName("add")
            .setDescription(
              "Add a new allied clan."
            )

            .addStringOption(
              option =>
                option
                  .setName("name")
                  .setDescription(
                    "The clan/server name."
                  )
                  .setRequired(true)
            )

            .addStringOption(
              option =>
                option
                  .setName("leaders")
                  .setDescription(
                    "Leader mentions, e.g. @user1 @user2."
                  )
                  .setRequired(true)
            )

            .addStringOption(
              option =>
                option
                  .setName("invite")
                  .setDescription(
                    "Discord invite link."
                  )
                  .setRequired(true)
            )

            .addStringOption(
              option =>
                option
                  .setName("logo")
                  .setDescription(
                    "Optional direct URL to the clan logo."
                  )
                  .setRequired(false)
            )
      )

      /*
      ==============================
      REMOVE
      ==============================
      */

      .addSubcommand(
        subcommand =>
          subcommand
            .setName("remove")
            .setDescription(
              "Remove an allied clan."
            )
            .addStringOption(
              option =>
                option
                  .setName("clan")
                  .setDescription(
                    "Exact clan name."
                  )
                  .setRequired(true)
            )
      )

      /*
      ==============================
      UPDATE
      ==============================
      */

      .addSubcommand(
        subcommand =>
          subcommand
            .setName("update")
            .setDescription(
              "Update an existing allied clan."
            )

            .addStringOption(
              option =>
                option
                  .setName("clan")
                  .setDescription(
                    "Current exact clan name."
                  )
                  .setRequired(true)
            )

            .addStringOption(
              option =>
                option
                  .setName("name")
                  .setDescription(
                    "New clan name."
                  )
                  .setRequired(false)
            )

            .addStringOption(
              option =>
                option
                  .setName("leaders")
                  .setDescription(
                    "New leader mentions."
                  )
                  .setRequired(false)
            )

            .addStringOption(
              option =>
                option
                  .setName("invite")
                  .setDescription(
                    "New Discord invite link."
                  )
                  .setRequired(false)
            )

            .addStringOption(
              option =>
                option
                  .setName("logo")
                  .setDescription(
                    "New clan logo URL."
                  )
                  .setRequired(false)
            )
      )
  ];
}

/*
==================================================
REGISTER COMMANDS
==================================================
*/

async function registerCommandsWhenReady(
  client
) {
  if (!client.user) {
    throw new Error(
      "Bot is not ready yet."
    );
  }

  if (!process.env.DISCORD_TOKEN) {
    throw new Error(
      "DISCORD_TOKEN is missing."
    );
  }

  const commands =
    buildCommands().map(
      command =>
        command.toJSON()
    );

  const rest =
    new REST({
      version: "10"
    }).setToken(
      process.env.DISCORD_TOKEN
    );

  await rest.put(
    Routes.applicationCommands(
      client.user.id
    ),
    {
      body:
        commands
    }
  );

  console.log(
    `✅ Registered ${commands.length} slash commands.`
  );
}

module.exports = {
  getHelpDeskConfig,
  getRankConfig,
  buildCommands,
  registerCommandsWhenReady
};
