const {
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const allies =
  require("../systems/allies");

function isAdmin(
  interaction
) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator
  );
}

async function execute(
  interaction,
  { client }
) {
  if (
    !isAdmin(interaction)
  ) {
    await interaction.reply({
      content:
        "❌ Only administrators can use the Allies commands.",
      ephemeral: true
    });

    return;
  }

  const subcommand =
    interaction.options.getSubcommand();

  /*
  ==================================================
  VIEW
  ==================================================
  */

  if (
    subcommand === "view"
  ) {
    await allies.initialize();

    await interaction.reply({
      embeds:
        allies.buildEmbeds(),

      ephemeral: true
    });

    return;
  }

  /*
  ==================================================
  SETUP
  ==================================================
  */

  if (
    subcommand === "setup"
  ) {
    const channel =
      interaction.options.getChannel(
        "channel",
        true
      );

    if (
      channel.type !==
      ChannelType.GuildText
    ) {
      await interaction.reply({
        content:
          "❌ Please select a normal text channel.",
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
          "❌ I could not create/update the Allies message. Make sure I can **View Channel**, **Send Messages**, and **Embed Links** there.",
        ephemeral: true
      });

      return;
    }

    await interaction.reply({
      content:
        `✅ **Allies system connected to ${channel}.**\n\n` +
        "The bot will keep editing the **same message** whenever an ally is added, removed, or updated.",

      ephemeral: true
    });

    return;
  }

  /*
  ==================================================
  ADD
  ==================================================
  */

  if (
    subcommand === "add"
  ) {
    const name =
      interaction.options.getString(
        "name",
        true
      );

    const leaders =
      interaction.options.getString(
        "leaders",
        true
      );

    const invite =
      interaction.options.getString(
        "invite",
        true
      );

    const logo =
      interaction.options.getString(
        "logo"
      ) || null;

    await allies.initialize();

    if (
      !allies.getState()
        .channelId
    ) {
      await interaction.reply({
        content:
          "❌ Run `/allies setup` first.",
        ephemeral: true
      });

      return;
    }

    if (
      !allies.extractUserIds(
        leaders
      ).length
    ) {
      await interaction.reply({
        content:
          "❌ I could not find a Discord user in `leaders`.\n\nExample: `@wencantcook @anotherleader`",
        ephemeral: true
      });

      return;
    }

    const result =
      await allies.addClan(
        client,
        {
          name,
          leaders,
          invite,
          logo
        }
      );

    if (!result.ok) {
      let message;

      if (
        result.reason ===
        "TOO_MANY_CLANS"
      ) {
        message =
          "❌ Discord's single-message embed limit has been reached.\n\n" +
          "This design supports **9 allied clans + 1 header embed**.";
      } else if (
        result.reason ===
        "DUPLICATE"
      ) {
        message =
          `❌ **${name}** is already on the Allies list.`;
      } else {
        message =
          "❌ I could not add that clan.";
      }

      await interaction.reply({
        content: message,
        ephemeral: true
      });

      return;
    }

    await interaction.reply({
      content:
        `✅ **${name}** was added.\n\n` +
        "The permanent Allies message has been updated.",

      ephemeral: true
    });

    return;
  }

  /*
  ==================================================
  REMOVE
  ==================================================
  */

  if (
    subcommand === "remove"
  ) {
    const clan =
      interaction.options.getString(
        "clan",
        true
      );

    const result =
      await allies.removeClan(
        client,
        clan
      );

    if (!result.ok) {
      await interaction.reply({
        content:
          `❌ I could not find **${clan}** in the Allies list.`,

        ephemeral: true
      });

      return;
    }

    await interaction.reply({
      content:
        `✅ **${result.clan.name}** was removed.\n\n` +
        "The permanent Allies message has been updated.",

      ephemeral: true
    });

    return;
  }

  /*
  ==================================================
  UPDATE
  ==================================================
  */

  if (
    subcommand === "update"
  ) {
    const clan =
      interaction.options.getString(
        "clan",
        true
      );

    const name =
      interaction.options.getString(
        "name"
      );

    const leaders =
      interaction.options.getString(
        "leaders"
      );

    const invite =
      interaction.options.getString(
        "invite"
      );

    const logo =
      interaction.options.getString(
        "logo"
      );

    if (
      leaders &&
      !allies.extractUserIds(
        leaders
      ).length
    ) {
      await interaction.reply({
        content:
          "❌ I could not find any Discord users in `leaders`.",

        ephemeral: true
      });

      return;
    }

    if (
      !name &&
      !leaders &&
      !invite &&
      !logo
    ) {
      await interaction.reply({
        content:
          "❌ Give me at least one thing to update: name, leaders, invite, or logo.",

        ephemeral: true
      });

      return;
    }

    const result =
      await allies.updateClan(
        client,
        clan,
        {
          name,
          leaders,
          invite,
          logo
        }
      );

    if (!result.ok) {
      await interaction.reply({
        content:
          `❌ I could not find **${clan}** in the Allies list.`,

        ephemeral: true
      });

      return;
    }

    await interaction.reply({
      content:
        `✅ **${result.clan.name}** was updated.\n\n` +
        "The permanent Allies message has been refreshed.",

      ephemeral: true
    });

    return;
  }
}

module.exports = {
  name: "allies",
  execute
};
