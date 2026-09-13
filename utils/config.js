const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

/*
==================================================
HELP DESK CONFIG
==================================================
*/

function getHelpDeskConfig(data) {
  const saved = data.config?.helpDesk || {};

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

function getRankConfig(data) {
  const saved = data.config?.rank || {};

  return {
    registrationChannelId: saved.registrationChannelId || null,
    reviewChannelId: saved.reviewChannelId || null,
    historyChannelId: saved.historyChannelId || null,
    leaderboardChannelId: saved.leaderboardChannelId || null,

    rankRoleIds: {
      Z: saved.rankRoleIds?.Z || null,
      SSS: saved.rankRoleIds?.SSS || null,
      SS: saved.rankRoleIds?.SS || null,
      S: saved.rankRoleIds?.S || null,
      A: saved.rankRoleIds?.A || null,
      B: saved.rankRoleIds?.B || null,
      C: saved.rankRoleIds?.C || null,
      D: saved.rankRoleIds?.D || null,
      E: saved.rankRoleIds?.E || null
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
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Open the Black Dragons setup wizard.")
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator.toString()
      ),

    new SlashCommandBuilder()
      .setName("rank-view")
      .setDescription("View an approved Black Dragons rank.")
      .addUserOption(option =>
        option
          .setName("user")
          .setDescription("The Discord user to view.")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("Show the Black Dragons kill leaderboard.")
  ];
}

/*
==================================================
REGISTER COMMANDS
==================================================
*/

async function registerCommandsWhenReady(client) {
  if (!client.user) {
    throw new Error("Bot is not ready yet.");
  }

  if (!process.env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN is missing.");
  }

  const commands = buildCommands().map(command =>
    command.toJSON()
  );

  const rest = new REST({
    version: "10"
  }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    {
      body: commands
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
