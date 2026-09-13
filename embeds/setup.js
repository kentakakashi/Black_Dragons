const { EmbedBuilder } = require("discord.js");

const STEPS = [
  { key: "helpdesk_channel", title: "Help Desk Channel", text: "Where should the Black Dragons Help Desk dashboard be handled?" },
  { key: "war_role", title: "WAR Role", text: "Which role should be pinged for WAR requests?" },
  { key: "backup_role", title: "BACKUP Role", text: "Which role should be pinged for BACKUP requests?" },
  { key: "rank_registration", title: "Rank Registration", text: "Which channel should contain the Rank Register panel and proof-upload threads?" },
  { key: "rank_review", title: "Rank Review", text: "Which staff channel should receive rank applications for review?" },
  { key: "rank_history", title: "Rank History", text: "Which channel should receive accepted/declined rank history?" },
  { key: "leaderboard_channel", title: "Leaderboard Channel", text: "Which channel should be used for future leaderboard updates?" }
];

function createSetupEmbed(stepIndex, currentValue = null) {
  const step = STEPS[stepIndex];

  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("🐉 BLACK DRAGONS • BOT SETUP")
    .setDescription(
      `### Step ${stepIndex + 1}/${STEPS.length}\n\n` +
      `**${step.title}**\n${step.text}\n\n` +
      (currentValue ? `Current: ${currentValue}\n\n` : "") +
      "Choose a value below, or use **Skip** to leave the current setting unchanged."
    )
    .setFooter({ text: "Black Dragons • Guided Setup" })
    .setTimestamp();
}

module.exports = { STEPS, createSetupEmbed };
