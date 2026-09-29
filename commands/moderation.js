const tryouts = require("../systems/tryouts");

module.exports = {
  name: "moderation",
  async execute(interaction, context) {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(false);

    if (group === "case" && subcommand === "list") {
      return tryouts.listModerationCases(interaction, context);
    }

    return interaction.reply({
      content: "❌ Unknown moderation command.",
      ephemeral: true
    });
  }
};
