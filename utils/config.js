const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

function getHelpDeskConfig(data) {
  const saved = data.config?.helpDesk || {};
  return {
    channelId: saved.channelId || process.env.DASHBOARD_CHANNEL_ID || null,
    warRoleId: saved.warRoleId || process.env.WAR_ROLE_ID || null,
    backupRoleId: saved.backupRoleId || process.env.BACKUP_ROLE_ID || null
  };
}

function getRankConfig(data) {
  const saved = data.config?.rank || {};
  return {
    registrationChannelId: saved.registrationChannelId || null,
    reviewChannelId: saved.reviewChannelId || null,
    historyChannelId: saved.historyChannelId || null,
    leaderboardChannelId: saved.leaderboardChannelId || null,
    rankRoleIds: saved.rankRoleIds || {}
  };
}

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Open the guided Black Dragons bot setup wizard.")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),

    new SlashCommandBuilder()
      .setName("rank-view")
      .setDescription("View an approved player's Black Dragons rank.")
      .addUserOption(option =>
        option.setName("user").setDescription("Discord user to view.").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("Show the Black Dragons kill leaderboard.")
  ];
}

async function registerCommands(client) {
  client.commands.clear();

  for (const command of buildCommands()) {
    client.commands.set(command.name, command);
  }

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user?.id || "0"),
      { body: buildCommands().map(command => command.toJSON()) }
    );
  } catch (error) {
    // The first registration happens after login in ready.js.
    // This call is intentionally harmless if client.user isn't available yet.
    if (client.user?.id && client.user.id !== "0") {
      console.error("❌ Could not register slash commands:", error);
    }
  }
}

async function registerCommandsWhenReady(client) {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: buildCommands().map(command => command.toJSON()) }
  );

  console.log("✅ Slash commands registered.");
}

module.exports = {
  getHelpDeskConfig,
  getRankConfig,
  buildCommands,
  registerCommands,
  registerCommandsWhenReady
};
