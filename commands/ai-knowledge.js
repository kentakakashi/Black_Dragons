const {
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const knowledge = require("../utils/aiKnowledge");

module.exports = {
  name: "ai-knowledge",

  async execute(interaction) {
    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return interaction.reply({
        content: "❌ Only Administrators can manage BLACK DRAGONS' server knowledge.",
        ephemeral: true
      });
    }

    const action = interaction.options.getSubcommand();

    if (action === "add-text") {
      const title = interaction.options.getString("title", true);
      const text = interaction.options.getString("text", true);

      await interaction.deferReply({ ephemeral: true });

      try {
        const result = await knowledge.addText(
          interaction.guildId,
          title,
          text,
          interaction.user.id
        );

        return interaction.editReply({
          content:
            "✅ Added **" +
            result.title +
            "** to BLACK DRAGONS' server knowledge.\\n" +
            "Source ID: " +
            result.sourceId +
            "\\n" +
            "Indexed chunks: **" +
            result.chunks +
            "**"
        });
      } catch (error) {
        return interaction.editReply({
          content:
            "❌ Could not add that knowledge: " +
            String(error?.message || "Unknown error").slice(0, 500)
        });
      }
    }

    if (action === "add-url") {
      const url = interaction.options.getString("url", true);

      await interaction.deferReply({ ephemeral: true });

      try {
        const result = await knowledge.addUrl(
          interaction.guildId,
          url,
          interaction.user.id
        );

        return interaction.editReply({
          content:
            "✅ Indexed **" +
            result.title +
            "** from the provided URL.\\n" +
            "Source ID: " +
            result.sourceId +
            "\\n" +
            "Indexed chunks: **" +
            result.chunks +
            "**"
        });
      } catch (error) {
        return interaction.editReply({
          content:
            "❌ Could not index that URL: " +
            String(error?.message || "Unknown error").slice(0, 500)
        });
      }
    }

    if (action === "list") {
      await interaction.deferReply({ ephemeral: true });

      try {
        const sources = await knowledge.listSources(
          interaction.guildId
        );

        if (!sources.length) {
          return interaction.editReply({
            content: "📚 BLACK DRAGONS has no custom server knowledge yet."
          });
        }

        const description = sources
          .slice(0, 20)
          .map((source, index) =>
            "**" +
            (index + 1) +
            ". " +
            String(source.title || "Untitled") +
            "**\\n" +
            "ID: " +
            source.id +
            " • " +
            String(source.type || "text") +
            " • " +
            String(source.chunkCount || 0) +
            " chunks"
          )
          .join("\\n\\n");

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("📚 BLACK DRAGONS — AI KNOWLEDGE")
              .setDescription(description.slice(0, 3800))
              .setFooter({
                text:
                  sources.length > 20
                    ? "Showing the first 20 sources."
                    : "Use /ai-knowledge remove to delete a source."
              })
          ]
        });
      } catch (error) {
        return interaction.editReply({
          content:
            "❌ Could not load the knowledge list: " +
            String(error?.message || "Unknown error").slice(0, 500)
        });
      }
    }

    if (action === "remove") {
      const sourceId = interaction.options.getString(
        "source_id",
        true
      );

      await interaction.deferReply({ ephemeral: true });

      try {
        const removed = await knowledge.removeSource(
          interaction.guildId,
          sourceId
        );

        return interaction.editReply({
          content: removed
            ? "🗑️ Removed AI knowledge source " + sourceId + "."
            : "❌ I could not find a knowledge source with that ID in this server."
        });
      } catch (error) {
        return interaction.editReply({
          content:
            "❌ Could not remove that knowledge source: " +
            String(error?.message || "Unknown error").slice(0, 500)
        });
      }
    }

    return interaction.reply({
      content: "❌ Unknown AI knowledge action.",
      ephemeral: true
    });
  }
};

module.exports.data = new SlashCommandBuilder()
  .setName("ai-knowledge")
  .setDescription("Manage BLACK DRAGONS' persistent server AI knowledge.")
  .setDefaultMemberPermissions(
    PermissionFlagsBits.Administrator.toString()
  )
  .addSubcommand(sub =>
    sub
      .setName("add-text")
      .setDescription("Add a server-specific knowledge note.")
      .addStringOption(option =>
        option
          .setName("title")
          .setDescription("Short name for this knowledge source.")
          .setRequired(true)
          .setMaxLength(120)
      )
      .addStringOption(option =>
        option
          .setName("text")
          .setDescription("Knowledge BLACK DRAGONS should remember for this server.")
          .setRequired(true)
          .setMaxLength(4000)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("add-url")
      .setDescription("Read a webpage and add it to server AI knowledge.")
      .addStringOption(option =>
        option
          .setName("url")
          .setDescription("The public http(s) URL to index.")
          .setRequired(true)
          .setMaxLength(500)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("list")
      .setDescription("List this server's AI knowledge sources.")
  )
  .addSubcommand(sub =>
    sub
      .setName("remove")
      .setDescription("Remove one AI knowledge source by ID.")
      .addStringOption(option =>
        option
          .setName("source_id")
          .setDescription("The source ID shown by /ai-knowledge list.")
          .setRequired(true)
          .setMaxLength(100)
      )
  );
