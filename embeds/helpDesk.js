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
        `⚔️ **War** — \`${data.war}\`\n` +
        `🛡️ **Backup** — \`${data.backup}\`\n` +
        `🐉 **Total** — \`${total}\``
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
    .setColor(isWar ? 0xED4245 : 0x5865F2)
    .setTitle(isWar ? "⚔️ WAR REQUEST" : "🛡️ BACKUP REQUEST")
    .setDescription(
      isWar
        ? `${user} has requested a **WAR**.\n\nIf you're available, join up and assist.`
        : `${user} has requested **BACKUP**.\n\nIf you're available, join up and assist.`
    )
    .addFields(
      { name: "🌍 Region", value: details.region },
      { name: "👤 Requested By", value: `${user}` },
      { name: "👥 Clan / People", value: details.clan },
      { name: "📝 Reason", value: details.reason },
      { name: "🔗 Server Link", value: details.serverLink }
    )
    .setTimestamp();
}

function createEndButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("end_request")
      .setLabel("END")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Danger)
  );
}

module.exports = {
  createDashboardEmbed,
  createDashboardButtons,
  createRequestEmbed,
  createEndButton,
  BANNER_URL
};
