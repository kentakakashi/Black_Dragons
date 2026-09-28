const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const BANNER_URL =
  "https://cdn.discordapp.com/attachments/1542930463495295077/1546900483422167100/file_00000000cb9c8211a2f59f8b106f4507.png?ex=6aa176d7&is=6aa02557&hm=c6429f873321f8c8e68aa9319142f986d18e5215ca239eddc30105fd5adbe888&";

function createDashboardEmbed(data) {
  const total = data.war + data.backup;

  const embed = new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("🐉 BLACK DRAGONS")
    .setDescription(
      "## DRAGON'S CALL\n\n" +
      "The battlefield doesn't wait.\n" +
      "When the Black Dragons need reinforcements, send the call.\n\n" +
      "### 🐉 REQUEST ASSISTANCE\n\n" +
      "⚔️ **WAR CALL**\n" +
      "Summon the dragons for battle.\n\n" +
      "🛡️ **BACKUP CALL**\n" +
      "Call for immediate reinforcement."
    )
    .addFields({
      name: "📊 TODAY'S CALLS",
      value:
        "⚔️ **War** — `" + data.war + "`\n" +
        "🛡️ **Backup** — `" + data.backup + "`\n" +
        "🐉 **Total** — `" + total + "`"
    })
    .setFooter({ text: "Black Dragons • United by strength • Fearless in battle" });

  if (BANNER_URL.startsWith("http")) embed.setImage(BANNER_URL);
  return embed;
}

function createDashboardButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("war")
      .setLabel("WAR")
      .setEmoji("⚔️")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("backup")
      .setLabel("BACKUP")
      .setEmoji("🛡️")
      .setStyle(ButtonStyle.Primary)
  );
}

function createRequestEmbed(type, user, details) {
  const isWar = type === "war";

  return new EmbedBuilder()
    .setColor(isWar ? 0xA61B1B : 0x3F6FB5)
    .setTitle(isWar ? "WAR REQUEST" : "BACKUP REQUEST")
    .addFields(
      { name: "Requested By", value: String(user), inline: true },
      { name: "Region", value: details.region, inline: true },
      { name: "Targets", value: details.clan },
      { name: "Reason", value: details.reason },
      { name: "Server / Game", value: details.serverLink }
    )
    .setFooter({ text: "Black Dragons • Help Desk" });
}

function createEndButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("end_request")
      .setLabel("End Request")
      .setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
  createDashboardEmbed,
  createDashboardButtons,
  createRequestEmbed,
  createEndButton,
  BANNER_URL
};
