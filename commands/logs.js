const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const logging = require("../systems/logging/logger");
const { saveData } = require("../utils/database");

module.exports = {
  name: "logs",
  async execute(interaction, context) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({content:"❌ Only administrators can configure logs.",ephemeral:true});
      return;
    }
    const sub = interaction.options.getSubcommand();
    if (sub === "setup") {
      await interaction.deferReply({ephemeral:true});
      try {
        await logging.ensure(interaction.guild, context.data);
        await saveData(context.data);
        const c = context.data.config.logs;
        const text = Object.entries(c.channels).map(([k,v]) => "• **"+k+"** → <#"+v+">").join("\n");
        await interaction.editReply({
          embeds:[new EmbedBuilder().setColor(0x8B0000).setTitle("🐉 BLACK DRAGONS • LOGGING SETUP").setDescription(
            "✅ **All categorized log channels are ready.**\n\n**Category:** <#"+c.categoryId+">\n\n"+text+
            "\n\nEvery configured event now goes to its category. Use /logs status any time to inspect the configuration."
          ).setTimestamp()]
        });
      } catch (e) {
        console.error("❌ Log setup failed:",e);
        await interaction.editReply({content:"❌ Could not create the logging category/channels. Check the bot's Manage Channels permission."});
      }
      return;
    }
    if (sub === "status") {
      const c = context.data.config?.logs || {categoryId:null,channels:{}};
      const text = Object.keys(logging.CHANNELS).map(k => "• **"+k+"** → "+(c.channels?.[k] ? "<#"+c.channels[k]+">" : "Not configured")).join("\n");
      await interaction.reply({
        embeds:[new EmbedBuilder().setColor(0x8B0000).setTitle("📋 BLACK DRAGONS • LOGGING STATUS").setDescription(
          "**Category:** "+(c.categoryId ? "<#"+c.categoryId+">" : "Not configured")+"\n\n"+text
        ).setTimestamp()],
        ephemeral:true
      });
    }
  }
};
