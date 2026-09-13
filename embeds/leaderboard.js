const { EmbedBuilder } = require("discord.js");
const { getRank, getRankDisplay, formatKills } = require("../utils/ranks");

function createLeaderboardEmbed(users, page = 0, pageSize = 10) {
  const sorted = [...users].sort((a, b) => b.kills - a.kills);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * pageSize;
  const top = sorted.slice(start, start + pageSize);

  const lines = top.map((user, index) => {
    const position = start + index;
    const medal =
      position === 0 ? "🥇" :
      position === 1 ? "🥈" :
      position === 2 ? "🥉" :
      `**${position + 1}.**`;

    return `${medal} <@${user.discordId}> — **${formatKills(user.kills)}** kills — ${getRankDisplay(getRank(user.kills))}`;
  });

  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("🏆 BLACK DRAGONS KILL LEADERBOARD")
    .setDescription(lines.join("\n") || "No approved players on this page.")
    .setFooter({ text: `Page ${safePage + 1}/${totalPages} • ${sorted.length} approved players` })
    .setTimestamp();
}

module.exports = { createLeaderboardEmbed };
