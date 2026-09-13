const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { RANKS, getRank, getRankDisplay, getNextRank, formatKills } = require("../utils/ranks");

function createRankPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("⚔️ 𝐊𝐈𝐋𝐋 𝐑𝐀𝐍𝐊 𝐒𝐘𝐒𝐓𝐄𝐌 ⚔️")
    .setDescription(
      "───────────────────────────\n\n" +
      "👑  **𝐙**     •     **𝟓𝟎𝐊+**\n" +
      "💠  **𝐒𝐒𝐒**   •     **𝟐𝟎𝐊+**\n" +
      "🔥  **𝐒𝐒**    •     **𝟏𝟓𝐊+**\n" +
      "⚡  **𝐒**     •     **𝟏𝟎𝐊+**\n" +
      "🏆  **𝐀**     •     **𝟕.𝟓𝐊+**\n" +
      "💫  **𝐁**     •     **𝟓𝐊+**\n" +
      "⚔️  **𝐂**     •     **𝟐.𝟓𝐊+**\n" +
      "🗡️  **𝐃**     •     **𝟏𝐊+**\n" +
      "🌱  **𝐄**     •     **𝟎–𝟗𝟗𝟗**\n\n" +
      "───────────────────────────\n\n" +
      "### 🏅 𝐏𝐑𝐎𝐕𝐄 𝐘𝐎𝐔𝐑 𝐖𝐎𝐑𝐓𝐇\n\n" +
      "Your kill count determines your official Black Dragons rank. Submit accurate information " +
      "and clear leaderboard proof for verification.\n\n" +
      "Applications are reviewed by authorized staff. False, altered, or misleading proof may result in rejection."
    )
    .setFooter({ text: "Black Dragons • Kill Rank Verification" })
    .setTimestamp();
}

function createRankPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("rank_register")
      .setLabel("REGISTER RANK")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("rank_update")
      .setLabel("UPDATE RANK")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary)
  );
}

function createRankReviewEmbed(application) {
  const rank = getRank(application.kills);

  const embed = new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle(`🏆 RANK APPLICATION #${application.id}`)
    .setDescription(
      "A kill-rank application has been submitted for staff verification.\n\n" +
      "Please compare the submitted kill count with the attached leaderboard proof before making a decision."
    )
    .addFields(
      { name: "👤 Discord", value: `<@${application.userId}>`, inline: true },
      { name: "🎮 Roblox", value: application.robloxUsername, inline: true },
      { name: "⚔️ Kills", value: formatKills(application.kills), inline: true },
      { name: "🏅 Calculated Rank", value: getRankDisplay(rank), inline: true },
      { name: "📅 Submitted", value: `<t:${Math.floor(application.createdAt / 1000)}:F>`, inline: true },
      { name: "📌 Type", value: application.type === "update" ? "Rank Update" : "New Registration", inline: true }
    )
    .setFooter({ text: "Review the attached proof before accepting." })
    .setTimestamp();

  if (application.proofUrl) embed.addFields({ name: "🖼️ Proof", value: application.proofUrl });
  return embed;
}

function createRankReviewButtons(applicationId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rank_accept:${applicationId}`)
      .setLabel("ACCEPT")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rank_decline:${applicationId}`)
      .setLabel("DECLINE")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );
}

function createRankViewEmbed(member, record) {
  const rank = getRank(record.kills);
  const next = getNextRank(record.kills);

  let progress;
  if (!next) {
    progress = "MAX RANK • Z";
  } else {
    const needed = Math.max(0, next.min - record.kills);
    progress = `${formatKills(needed)} kills needed for ${next.emoji} **${next.key}** (${formatKills(next.min)} total)`;
  }

  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("🏆 BLACK DRAGONS • RANK PROFILE")
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "👤 Discord", value: `${member}`, inline: true },
      { name: "🎮 Roblox", value: record.robloxUsername || "Unknown", inline: true },
      { name: "⚔️ Kills", value: formatKills(record.kills), inline: true },
      { name: "🏅 Current Rank", value: getRankDisplay(rank), inline: true },
      { name: "📈 Next Rank", value: progress, inline: true },
      { name: "📅 Verified", value: record.verifiedAt ? `<t:${Math.floor(record.verifiedAt / 1000)}:F>` : "Unknown", inline: true },
      { name: "🔄 Last Update", value: record.updatedAt ? `<t:${Math.floor(record.updatedAt / 1000)}:R>` : "Unknown", inline: true }
    )
    .setFooter({ text: "Black Dragons • Verified Kill Rank" })
    .setTimestamp();
}

module.exports = {
  createRankPanelEmbed,
  createRankPanelButtons,
  createRankReviewEmbed,
  createRankReviewButtons,
  createRankViewEmbed,
  RANKS
};
