const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

function getHelpDeskConfig(data) {
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

function getRankConfig(data) {
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

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription(
        'Open the Black Dragons setup wizard.'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator.toString()
      ),

    new SlashCommandBuilder()
      .setName('logs')
      .setDescription('Configure Black Dragons categorized audit logs.')
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator.toString()
      )
      .addSubcommand(sub =>
        sub
          .setName('setup')
          .setDescription('Create or repair all categorized log channels.')
      )
      .addSubcommand(sub =>
        sub
          .setName('status')
          .setDescription('Show the current categorized logging configuration.')
      ),

    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Delete messages and archive every deleted message in the message logs.')
      .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageMessages.toString()
      )
      .addIntegerOption(option =>
        option
          .setName('amount')
          .setDescription('Number of recent messages to delete (1-100).')
          .setMinValue(1)
          .setMaxValue(100)
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('rank-view')
      .setDescription(
        'View an approved Black Dragons rank.'
      )
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription(
            'The Discord user to view.'
          )
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription(
        'Show the Black Dragons kill leaderboard.'
      ),

    new SlashCommandBuilder()
      .setName('applications')
      .setDescription(
        'View and manage all open Black Dragons rank applications.'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator.toString()
      ),

    new SlashCommandBuilder()
      .setName('allies')
      .setDescription(
        'Manage the Black Dragons allied clans list.'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator.toString()
      )

      .addSubcommand(sub =>
        sub
          .setName('setup')
          .setDescription(
            'Create or move the permanent Allies message.'
          )
          .addChannelOption(o =>
            o
              .setName('channel')
              .setDescription(
                'The channel where the permanent Allies message should live.'
              )
              .addChannelTypes(
                ChannelType.GuildText
              )
              .setRequired(true)
          )
      )

      .addSubcommand(sub =>
        sub
          .setName('view')
          .setDescription(
            'Preview the current Allies list.'
          )
      )

      .addSubcommand(sub =>
        sub
          .setName('add')
          .setDescription(
            'Open the advanced editor to create an allied clan.'
          )
      )

      .addSubcommand(sub =>
        sub
          .setName('update')
          .setDescription(
            'Choose an allied clan and open the advanced editor.'
          )
      )

      .addSubcommand(sub =>
        sub
          .setName('remove')
          .setDescription(
            'Choose an allied clan and remove it.'
          )
      )
  ];
}

async function registerCommandsWhenReady(
  client
) {
  if (!client.user) {
    throw new Error(
      'Bot is not ready yet.'
    );
  }

  if (!process.env.DISCORD_TOKEN) {
    throw new Error(
      'DISCORD_TOKEN is missing.'
    );
  }

  const commands =
    buildCommands().map(
      command => command.toJSON()
    );

  const rest =
    new REST({
      version: '10'
    }).setToken(
      process.env.DISCORD_TOKEN
    );

  await rest.put(
    Routes.applicationCommands(
      client.user.id
    ),
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
