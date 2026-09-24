const { EmbedBuilder } = require("discord.js");

const CATEGORIES = {
  helpdesk: { label: "Help Desk", emoji: "🛠️", description: "Help Desk channel and request roles.", settings: [
    { key: "helpdesk_channel", label: "Help Desk Channel", type: "channel" },
    { key: "war_role", label: "WAR Role", type: "role" },
    { key: "backup_role", label: "BACKUP Role", type: "role" }
  ]},
  rank_channels: { label: "Rank System", emoji: "🏆", description: "Rank registration, review, history and leaderboard channels.", settings: [
    { key: "rank_registration", label: "Registration Channel", type: "channel" },
    { key: "rank_review", label: "Review Channel", type: "channel" },
    { key: "rank_history", label: "History Channel", type: "channel" },
    { key: "leaderboard_channel", label: "Leaderboard Channel", type: "channel" }
  ]},
  rank_roles: { label: "Rank Roles", emoji: "🎖️", description: "Discord role assigned for each kill rank.", settings: [
    { key: "rank_role_Z", label: "Z • 50,000+", type: "role" },
    { key: "rank_role_SSS", label: "SSS • 20,000–49,999", type: "role" },
    { key: "rank_role_SS", label: "SS • 15,000–19,999", type: "role" },
    { key: "rank_role_S", label: "S • 10,000–14,999", type: "role" },
    { key: "rank_role_A", label: "A • 7,500–9,999", type: "role" },
    { key: "rank_role_B", label: "B • 5,000–7,499", type: "role" },
    { key: "rank_role_C", label: "C • 2,500–4,999", type: "role" },
    { key: "rank_role_D", label: "D • 1,000–2,499", type: "role" },
    { key: "rank_role_E", label: "E • 0–999", type: "role" }
  ]}
};
const CATEGORY_ORDER = ["helpdesk", "rank_channels", "rank_roles"];
function getSetting(c, k) { return CATEGORIES[c]?.settings.find(s => s.key === k) || null; }
function currentValue(data, key) {
  const h = data.config.helpDesk, r = data.config.rank;
  const map = { helpdesk_channel:h.channelId, war_role:h.warRoleId, backup_role:h.backupRoleId, rank_registration:r.registrationChannelId, rank_review:r.reviewChannelId, rank_history:r.historyChannelId, leaderboard_channel:r.leaderboardChannelId };
  return key.startsWith("rank_role_") ? (r.rankRoleIds?.[key.replace("rank_role_","")] || null) : (map[key] || null);
}
function valueText(data, s) { const v=currentValue(data,s.key); return v ? (s.type==="role" ? "<@&"+v+">" : "<#"+v+">") : "Not configured"; }
function base() { return new EmbedBuilder().setColor(0x8B0000).setFooter({text:"Black Dragons • Setup Panel"}).setTimestamp(); }
function createHomeEmbed() { return base().setTitle("🐉 BLACK DRAGONS • BOT SETUP").setDescription("**Choose a category to edit.**\n\n🛠️ **Help Desk** — channels and request roles\n🏆 **Rank System** — registration, review, history and leaderboard channels\n🎖️ **Rank Roles** — Z through E role mapping\n\nPick only the setting you want to change. Changes save immediately.\n\n🔒 The panel is **public**, but only the administrator who started this session can edit it."); }
function createCategoryEmbed(data, key, notice) { const c=CATEGORIES[key]; const lines=c.settings.map(s => (s.type==="role"?"🎭":"📺")+" **"+s.label+"** — "+valueText(data,s)).join("\n"); return base().setTitle(c.emoji+" BLACK DRAGONS • "+c.label.toUpperCase()).setDescription(c.description+"\n\n"+lines+"\n\n"+(notice?notice+"\n\n":"")+"Select one setting below to edit only that setting."); }
function createSettingEmbed(data, c, k) { const cat=CATEGORIES[c], s=getSetting(c,k); return base().setTitle(cat.emoji+" "+cat.label+" • "+s.label).setDescription("Current value: **"+valueText(data,s)+"**\n\nChoose the new value below. It will be saved immediately."); }
module.exports = { CATEGORIES, CATEGORY_ORDER, getSetting, currentValue, createHomeEmbed, createCategoryEmbed, createSettingEmbed };