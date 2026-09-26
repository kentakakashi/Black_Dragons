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
  ]},
  logging: { label: "Logging", emoji: "📋", description: "Choose where each detailed audit-log category is sent.", settings: [
    { key: "log_message", label: "Message Logs", type: "channel" },
    { key: "log_moderation", label: "Moderation Logs", type: "channel" },
    { key: "log_roles", label: "Role Logs", type: "channel" },
    { key: "log_voice", label: "Voice / VC Logs", type: "channel" },
    { key: "log_users", label: "User Logs", type: "channel" },
    { key: "log_invites", label: "Invite Logs", type: "channel" },
    { key: "log_server", label: "Server Logs", type: "channel" },
    { key: "log_channels", label: "Channel Logs", type: "channel" },
    { key: "log_bot", label: "Bot Logs", type: "channel" },
    { key: "log_general", label: "General Logs", type: "channel" }
  ]},
  blacklist: { label: "Blacklist", emoji: "🚫", description: "Public channels for blacklisted players and clans.", settings: [
    { key: "blacklist_players", label: "Blacklisted Players Channel", type: "channel" },
    { key: "blacklist_clans", label: "Blacklisted Clans Channel", type: "channel" }
  ]}
};
const CATEGORY_ORDER = ["helpdesk", "rank_channels", "rank_roles", "logging", "blacklist"];
function getSetting(c, k) { return CATEGORIES[c]?.settings.find(s => s.key === k) || null; }
function currentValue(data, key) {
  const h = data.config.helpDesk, r = data.config.rank, logs = data.config.logs?.channels || {}, bl = data.config.blacklist?.public || {};
  const map = {
    helpdesk_channel:h.channelId, war_role:h.warRoleId, backup_role:h.backupRoleId,
    rank_registration:r.registrationChannelId, rank_review:r.reviewChannelId, rank_history:r.historyChannelId,
    leaderboard_channel:r.leaderboardChannelId,
    log_message:logs.message, log_moderation:logs.moderation, log_roles:logs.roles, log_voice:logs.voice,
    log_users:logs.users, log_invites:logs.invites, log_server:logs.server, log_channels:logs.channels,
    log_bot:logs.bot, log_general:logs.general,
    blacklist_players:bl.playerChannelId, blacklist_clans:bl.clanChannelId
  };
  return key.startsWith("rank_role_") ? (r.rankRoleIds?.[key.replace("rank_role_","")] || null) : (map[key] || null);
}
function valueText(data, s, guild) {
  const v=currentValue(data,s.key);
  if(!v) return "Not configured";

  if(s.type==="role"){
    const role=guild?.roles?.cache?.get(v);
    return role ? role.toString() : "⚠️ Role unavailable ("+v+")";
  }

  const channel=guild?.channels?.cache?.get(v);
  return channel ? "#"+channel.name : "⚠️ Channel unavailable ("+v+")";
}
function base() { return new EmbedBuilder().setColor(0x8B0000).setFooter({text:"Black Dragons • Setup Panel"}).setTimestamp(); }
function createHomeEmbed(data, notice, guild) {
  const configured=CATEGORIES.logging.settings.filter(s=>currentValue(data,s.key)).length;
  const blacklistConfigured=[currentValue(data,"blacklist_players"),currentValue(data,"blacklist_clans")].filter(Boolean).length;
  return base().setTitle("🐉 BLACK DRAGONS • BOT SETUP").setDescription(
    (notice?notice+"\\n\\n":"")+"**Choose a category to configure.**\\n\\n"+
    "🛠️ **Help Desk** — channels and request roles\\n"+
    "🏆 **Rank System** — registration, review, history and leaderboard\\n"+
    "🎖️ **Rank Roles** — Z through E role mapping\\n"+
    "📋 **Logging** — message, moderation, roles, VC, users, invites, server, channels, bot and general logs\\n"+
    "🚫 **Blacklist** — public player and clan blacklist channels\\n\\n"+
    "⚙️ Select settings one by one. Changes stay in a **draft**.\\n"+
    "💾 Press **SAVE ALL** once at the end to save everything together.\\n\\n"+
    "📋 **Logging configured:** "+configured+"/10\\n"+
    "🚫 **Blacklist channels:** "+blacklistConfigured+"/2"
  );
}
function createCategoryEmbed(data, key, notice, guild) {
  const c=CATEGORIES[key];
  const lines=c.settings.map(s => (s.type==="role"?"🎭":"📺")+" **"+s.label+"** — "+valueText(data,s,guild)).join("\n");
  return base().setTitle(c.emoji+" BLACK DRAGONS • "+c.label.toUpperCase()).setDescription(c.description+"\n\n"+lines+"\n\n"+(notice?notice+"\n\n":"")+"Select a setting, choose its value, then continue. **Nothing is permanently saved until SAVE ALL.**");
}
function createSettingEmbed(data, c, k, guild) {
  const cat=CATEGORIES[c], s=getSetting(c,k);
  return base().setTitle(cat.emoji+" "+cat.label+" • "+s.label).setDescription("Current draft value: **"+valueText(data,s,guild)+"**\n\nChoose the new "+(s.type==="role"?"role":"channel")+" below.\n\n💾 **Nothing is permanently saved until SAVE ALL.**");
}
module.exports = { CATEGORIES, CATEGORY_ORDER, getSetting, currentValue, createHomeEmbed, createCategoryEmbed, createSettingEmbed };