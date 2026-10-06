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
  ]},
  jail: { label: "Jail", emoji: "⛓️", description: "Choose the role used when a member is thrown into jail.", settings: [
    { key: "jail_role", label: "Jail Role", type: "role" }
  ]},
  tryouts: { label: "Tryouts", emoji: "⚔️", description: "Configure the channels used by the BLACK DRAGONS tryout system.", settings: [
    { key: "tryout_rules", label: "Tryout Rules Channel", type: "channel" },
    { key: "tryout_channel", label: "Tryout Channel", type: "channel" },
    { key: "tryout_history", label: "Tryout History Channel", type: "channel" },
    { key: "tryout_staff_role", label: "Tryout Staff Role", type: "role" }
  ]},
  ai: { label: "AI Chat", emoji: "🤖", description: "Configure BLACK DRAGONS AI, its channel, knowledge, live search and GIF reactions.", settings: [
    { key: "ai_enabled", label: "AI Enabled", type: "toggle" },
    { key: "ai_channel", label: "AI Chat Channel", type: "channel" },
    { key: "ai_auto_chat", label: "AI Auto Chat", type: "toggle" },
    { key: "ai_knowledge", label: "Server Knowledge", type: "toggle" },
    { key: "ai_web_search", label: "Live Web Search", type: "toggle" },
    { key: "ai_gif_reactions", label: "GIF Reactions", type: "toggle" },
    {
      key: "ai_tone",
      label: "Response Tone",
      type: "choice",
      options: [
        { label: "Casual", description: "Natural Discord-first wording.", value: "casual" },
        { label: "Balanced", description: "Casual with a little more polish.", value: "balanced" },
        { label: "Formal", description: "More structured and restrained.", value: "formal" }
      ]
    },
    {
      key: "ai_humor",
      label: "Humor Level",
      type: "choice",
      options: [
        { label: "Low", description: "Mostly direct with occasional jokes.", value: "low" },
        { label: "Medium", description: "Normal playful balance.", value: "medium" },
        { label: "High", description: "More teasing and playful reactions.", value: "high" }
      ]
    },
    {
      key: "ai_friendliness",
      label: "Friendliness",
      type: "choice",
      options: [
        { label: "Reserved", description: "Friendly but less familiar.", value: "reserved" },
        { label: "Warm", description: "Open, friendly server presence.", value: "warm" },
        { label: "Very Friendly", description: "Extra welcoming and expressive.", value: "very-friendly" }
      ]
    },
    {
      key: "ai_response_length",
      label: "Response Length",
      type: "choice",
      options: [
        { label: "Concise", description: "Prefer short replies.", value: "concise" },
        { label: "Balanced", description: "Normal conversational length.", value: "balanced" },
        { label: "Detailed", description: "Allow longer answers when useful.", value: "detailed" }
      ]
    }
  ]},
  leaderboards: { label: "Leaderboards", emoji: "🏆", description: "Ranking-title role mapping plus permanent live leaderboard channels.", settings: [
    { key: "leaderboard_role_shadow_monarch", label: "SHADOW MONARCH Role", type: "role" },
    { key: "leaderboard_role_destruction_monarch", label: "DESTRUCTION MONARCH Role", type: "role" },
    { key: "leaderboard_role_white_flame_monarch", label: "WHITE FLAME MONARCH Role", type: "role" },
    { key: "leaderboard_role_frost_monarch", label: "FROST MONARCH Role", type: "role" },
    { key: "leaderboard_role_plague_monarch", label: "PLAGUE MONARCH Role", type: "role" },
    { key: "leaderboard_role_fang_monarch", label: "FANG MONARCH Role", type: "role" },
    { key: "leaderboard_role_monarch_of_beginning", label: "MONARCH OF BEGINNING Role", type: "role" },
    { key: "leaderboard_role_iron_body_monarch", label: "IRON BODY MONARCH Role", type: "role" },
    { key: "leaderboard_role_transfiguration_monarch", label: "TRANSFIGURATION MONARCH Role", type: "role" },
    { key: "leaderboard_role_rising_monarch", label: "RISING MONARCH Role", type: "role" },
    { key: "leaderboard_ranking_titles", label: "Ranking Titles Channel", type: "channel" },
    { key: "leaderboard_top_kills", label: "Top Kills Channel", type: "channel" }
  ]}
};
const CATEGORY_ORDER = ["helpdesk", "rank_channels", "rank_roles", "logging", "blacklist", "ai", "leaderboards", "jail", "tryouts"];
function getSetting(c, k) { return CATEGORIES[c]?.settings.find(s => s.key === k) || null; }
function currentValue(data, key) {
  const h = data.config.helpDesk || {}, r = data.config.rank || {}, logs = data.config.logs?.channels || {}, bl = data.config.blacklist?.public || {}, ai = data.config.ai || {}, lb = data.config.leaderboards || {}, j = data.config.jail || {}, t = data.config.tryouts || {};
  const map = {
    helpdesk_channel:h.channelId, war_role:h.warRoleId, backup_role:h.backupRoleId,
    rank_registration:r.registrationChannelId, rank_review:r.reviewChannelId, rank_history:r.historyChannelId,
    leaderboard_channel:r.leaderboardChannelId,
    log_message:logs.message, log_moderation:logs.moderation, log_roles:logs.roles, log_voice:logs.voice,
    log_users:logs.users, log_invites:logs.invites, log_server:logs.server, log_channels:logs.channels,
    log_bot:logs.bot, log_general:logs.general,
    blacklist_players:bl.playerChannelId, blacklist_clans:bl.clanChannelId,
    ai_enabled:ai.enabled !== false, ai_channel:ai.channelId, ai_auto_chat:ai.autoChat === true,
    ai_knowledge:ai.knowledge !== false, ai_web_search:ai.webSearch !== false, ai_gif_reactions:ai.gifReactions !== false,
    ai_tone:ai.tone || "casual", ai_humor:ai.humor || "medium", ai_friendliness:ai.friendliness || "warm", ai_response_length:ai.responseLength || "balanced",
    leaderboard_ranking_titles:lb.rankingChannelId, leaderboard_top_kills:lb.topKillsChannelId,
    jail_role:j.roleId,
    tryout_rules:t.rulesChannelId, tryout_channel:t.channelId, tryout_history:t.historyChannelId, tryout_staff_role:t.staffRoleId
  };
  if(key.startsWith("rank_role_")) return r.rankRoleIds?.[key.replace("rank_role_","")] || null;
  if(key.startsWith("leaderboard_role_")) return lb.rankingRoleIds?.[key.replace("leaderboard_role_","")] || null;
  return map[key] || null;
}
function valueText(data, s, guild) {
  const v=currentValue(data,s.key);
  if(s.type==="toggle") return v ? "🟢 Enabled" : "🔴 Disabled";
  if(s.type==="choice"){
    const option=s.options?.find(item=>item.value===v);
    return option ? option.label : String(v || "Not configured");
  }
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
  const leaderboardConfigured=[currentValue(data,"leaderboard_ranking_titles"),currentValue(data,"leaderboard_top_kills")].filter(Boolean).length;
  const tryoutConfigured=[currentValue(data,"tryout_rules"),currentValue(data,"tryout_channel"),currentValue(data,"tryout_history"),currentValue(data,"tryout_staff_role")].filter(Boolean).length;
  const aiChannelConfigured=currentValue(data,"ai_channel") ? 1 : 0;
  return base().setTitle("🐉 BLACK DRAGONS • BOT SETUP").setDescription(
    (notice?notice+"\n\n":"")+"**Choose a category to configure.**\n\n"+
    "🛠️ **Help Desk** — channels and request roles\n"+
    "🏆 **Rank System** — registration, review, history and leaderboard\n"+
    "🎖️ **Rank Roles** — Z through E role mapping\n"+
    "📋 **Logging** — message, moderation, roles, VC, users, invites, server, channels, bot and general logs\n"+
    "🚫 **Blacklist** — public player and clan blacklist channels\n"+
    "🤖 **AI Chat** — AI channel and automatic conversation setting\n"+
    "🏆 **Leaderboards** — permanent Ranking Titles and Top Kills channels\n"+
    "⛓️ **Jail** — the role used for jailed members\n"+
    "⚔️ **Tryouts** — rules, live tryout and history channels\n\n"+
    "⚙️ Select settings one by one. Changes stay in a **draft**.\n"+
    "💾 Press **SAVE ALL** once at the end to save everything together.\n\n"+
    "📋 **Logging configured:** "+configured+"/10\n"+
    "🚫 **Blacklist channels:** "+blacklistConfigured+"/2\n"+
    "🤖 **AI:** "+(currentValue(data,"ai_enabled") ? "Enabled" : "Disabled")+" • **AI channel:** "+aiChannelConfigured+"/1 • **Auto chat:** "+(currentValue(data,"ai_auto_chat") ? "Enabled" : "Disabled")+" • **Knowledge:** "+(currentValue(data,"ai_knowledge") ? "On" : "Off")+" • **Web:** "+(currentValue(data,"ai_web_search") ? "On" : "Off")+" • **GIFs:** "+(currentValue(data,"ai_gif_reactions") ? "On" : "Off")+"\n"+
    "🏆 **Leaderboard channels:** "+leaderboardConfigured+"/2\n"+
    "⚔️ **Tryout setup:** "+tryoutConfigured+"/4"
  );
}
function createCategoryEmbed(data, key, notice, guild) {
  const c=CATEGORIES[key];
  const lines=c.settings.map(s => (s.type==="role"?"🎭":"📺")+" **"+s.label+"** — "+valueText(data,s,guild)).join("\n");
  return base().setTitle(c.emoji+" BLACK DRAGONS • "+c.label.toUpperCase()).setDescription(c.description+"\n\n"+lines+"\n\n"+(notice?notice+"\n\n":"")+"Select a setting, choose its value, then continue. **Nothing is permanently saved until SAVE ALL.**");
}
function createSettingEmbed(data, c, k, guild) {
  const cat=CATEGORIES[c], s=getSetting(c,k);
  const actionText = s.type==="role" ? "role" : s.type==="channel" ? "channel" : "setting";
  return base().setTitle(cat.emoji+" "+cat.label+" • "+s.label).setDescription("Current draft value: **"+valueText(data,s,guild)+"**\n\n"+(s.type==="toggle" ? "Choose whether this setting should be enabled or disabled." : "Choose the new "+actionText+" below.")+"\n\n💾 **Nothing is permanently saved until SAVE ALL.**");
}
module.exports = { CATEGORIES, CATEGORY_ORDER, getSetting, currentValue, createHomeEmbed, createCategoryEmbed, createSettingEmbed };