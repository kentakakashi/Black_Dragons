const {
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const allies =
  require('../systems/allies');

const editor =
  require('../buttons/alliesEditor');

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator
  );
}

async function execute(
  interaction,
  { client }
) {
  if (!isAdmin(interaction)) {
    await interaction.reply({
      content:
        '❌ Only administrators can use the Allies commands.',
      ephemeral: true
    });

    return;
  }

  const subcommand =
    interaction.options.getSubcommand();

  if (
    ['add', 'update', 'remove'].includes(
      subcommand
    )
  ) {
    await editor.handleCommand(
      interaction,
      subcommand
    );

    return;
  }

  if (subcommand === 'view') {
    await allies.initialize();

    const preview =
      allies.buildMessagePayload();

    await interaction.reply({
      embeds: preview.embeds,
      files: preview.files,
      ephemeral: true,
      allowedMentions: {
        parse: []
      }
    });

    return;
  }

  if (subcommand === 'setup') {
    const channel =
      interaction.options.getChannel(
        'channel',
        true
      );

    if (
      channel.type !==
      ChannelType.GuildText
    ) {
      await interaction.reply({
        content:
          '❌ Please select a normal text channel.',
        ephemeral: true
      });

      return;
    }

    const result =
      await allies.setup(
        client,
        channel.id
      );

    if (!result.ok) {
      await interaction.reply({
        content:
          '❌ I could not create/update the Allies message. Make sure I can **View Channel**, **Send Messages**, and **Embed Links** there.',
        ephemeral: true
      });

      return;
    }

    await interaction.reply({
      content:
        '✅ **Allies system connected to ' +
        channel +
        '.**\n\n' +
        'The bot will keep editing the **same permanent message**. ' +
        'Use `/allies add`, `/allies update`, or `/allies remove` to open the editor.',
      ephemeral: true
    });
  }
}

module.exports = {
  name: 'allies',
  execute
};
