const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { Collection } = require("discord.js");
const logging = require("../systems/logging/logger");

module.exports = {
  name: "purge",
  async execute(interaction, context) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({content:"❌ You need **Manage Messages** to use /purge.",ephemeral:true});
      return;
    }
    if (!interaction.channel?.isTextBased() || !interaction.channel.messages) {
      await interaction.reply({content:"❌ Purge can only be used in a text channel.",ephemeral:true});
      return;
    }

    const amount = interaction.options.getInteger("amount", true);
    await interaction.deferReply({ephemeral:true});

    try {
      const fetched = await interaction.channel.messages.fetch({limit:amount});
      if (!fetched.size) {
        await interaction.editReply({content:"❌ No messages were found to purge."});
        return;
      }

      for (const m of fetched.values()) logging.markPurge(m.id);

      const deleted = new Collection();
      const recent = fetched.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
      const old = fetched.filter(m => !recent.has(m.id));

      if (recent.size) {
        const result = await interaction.channel.bulkDelete(recent, true);
        for (const [id,m] of result) deleted.set(id,m);
      }
      for (const m of old.values()) {
        try {
          await m.delete();
          deleted.set(m.id,m);
        } catch (e) {
          console.warn("⚠️ Could not individually delete old purge message "+m.id,e?.message||e);
        }
      }

      await logging.purgeLog(interaction.guild, context.data, interaction.channel, interaction.user, deleted);

      const failed = fetched.size - deleted.size;
      await interaction.editReply({
        embeds:[new EmbedBuilder().setColor(failed ? 0xe67e22 : 0x2ecc71)
          .setTitle("🧹 BLACK DRAGONS • PURGE COMPLETE")
          .setDescription(
            "🗑️ **Requested:** "+amount+"\n"+
            "✅ **Deleted:** "+deleted.size+"\n"+
            "⚠️ **Failed:** "+failed+"\n"+
            "📍 **Channel:** "+interaction.channel
          ).setTimestamp()]
      });
    } catch (e) {
      console.error("❌ Purge failed:",e);
      await interaction.editReply({content:"❌ Purge failed. Check the bot's **Manage Messages** permission and channel permissions."});
    }
  }
};
