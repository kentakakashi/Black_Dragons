const { EmbedBuilder } = require("discord.js");

const STEPS = [
  { key: "helpdesk_channel", title: "Help Desk Channel", text: "Where should the Black Dragons Help Desk dashboard be handled?" },
  { key: "war_role", title: "WAR Role", text: "Which role should be pinged for WAR requests?" },
  { key: "backup_role", title: "BACKUP Role", text: "Which role should be pinged for BACKUP requests?" },
  { key: "rank_registration", title: "Rank Registration", text: "Which channel should contain the Rank Register panel and proof-upload threads?" },
  { key: "rank_review", title: "Rank Review", text: "Which staff channel should receive rank applications for review?" },
  { key: "rank_history", title: "Rank History", text: "Which channel should receive accepted/declined rank history?" },
  { key: "leaderboard_channel", title: "Leaderboard Channel", text: "Which channel should be used for future leaderboard updates?" },

  { key: "rank_role_Z", title: "Rank Role • Z", text: "Which Discord role should be given to members with 50,000+ kills?" },
  { key: "rank_role_SSS", title: "Rank Role • SSS", text: "Which Discord role should be given to members with 20,000–49,999 kills?" },
  { key: "rank_role_SS", title: "Rank Role • SS", text: "Which Discord role should be given to members with 15,000–19,999 kills?" },
  { key: "rank_role_S", title: "Rank Role • S", text: "Which Discord role should be given to members with 10,000–14,999 kills?" },
  { key: "rank_role_A", title: "Rank Role • A", text: "Which Discord role should be given to members with 7,500–9,999 kills?" },
  { key: "rank_role_B", title: "Rank Role • B", text: "Which Discord role should be given to members with 5,000–7,499 kills?" },
  { key: "rank_role_C", title: "Rank Role • C", text: "Which Discord role should be given to members with 2,500–4,999 kills?" },
  { key: "rank_role_D", title: "Rank Role • D", text: "Which Discord role should be given to members with 1,000–2,499 kills?" },
  { key: "rank_role_E", title: "Rank Role • E", text: "Which Discord role should be given to members with 0–999 kills?" }
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
      "Choose a value below, or use **Skip** to leave the current setting unchanged. Rank-role steps map the approved kill rank to the Discord role the bot should assign."
    )
    .setFooter({ text: "Black Dragons • Guided Setup" })
    .setTimestamp();
}

module.exports = { STEPS, createSetupEmbed };
