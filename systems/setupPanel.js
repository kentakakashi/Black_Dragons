const{ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelSelectMenuBuilder,RoleSelectMenuBuilder,StringSelectMenuBuilder,StringSelectMenuOptionBuilder,ChannelType}=require("discord.js");
const{CATEGORIES,CATEGORY_ORDER,getSetting,createHomeEmbed,createCategoryEmbed,createSettingEmbed}=require("../embeds/setup");
const{saveData}=require("../utils/database");
const logging=require("./logging/logger");
const sessions=new Map();
const sid=i=>i.guildId+":"+i.user.id;
const admin=i=>i.memberPermissions?.has("Administrator");
const clone=v=>JSON.parse(JSON.stringify(v||{}));
function draft(data){return{config:clone(data.config),rankConfig:clone(data.rankConfig)}}
function view(data,s){return{...data,config:s.draft.config,rankConfig:s.draft.rankConfig}}
function check(i){if(!admin(i))return"❌ Only administrators can use this setup panel.";const s=sessions.get(sid(i));if(!s)return"❌ Setup session expired. Run `/setup` again.";if(s.messageId!==i.message?.id)return"❌ This is not your active setup panel.";return s}
async function hydrateSetupChannels(guild,data){
  const ids=new Set();
  const c=data?.config||{};
  const h=c.helpDesk||{};
  const r=c.rank||{};
  const l=c.logs?.channels||{};
  const b=c.blacklist?.public||{};
  for(const id of [h.channelId,r.registrationChannelId,r.reviewChannelId,r.historyChannelId,r.leaderboardChannelId,b.playerChannelId,b.clanChannelId,...Object.values(l)]){
    if(id) ids.add(String(id));
  }
  await Promise.all([...ids].map(async id=>{
    try{await guild.channels.fetch(id);}catch{}
  }));
  const roleIds=new Set(Object.values(r.rankRoleIds||{}).filter(Boolean).map(String));
  for(const id of [h.warRoleId,h.backupRoleId,...roleIds]){
    if(id) try{await guild.roles.fetch(String(id));}catch{}
  }
}
function home(){return[
 new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("setup_category").setPlaceholder("Choose a category to configure").addOptions(CATEGORY_ORDER.map(k=>{const c=CATEGORIES[k];return new StringSelectMenuOptionBuilder().setLabel(c.label).setDescription(c.description).setEmoji(c.emoji).setValue(k)}))),
 new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("setup_save").setLabel("SAVE ALL").setEmoji("💾").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("setup_cancel").setLabel("CANCEL").setStyle(ButtonStyle.Secondary))
]}
function cat(k){return[
 new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("setup_setting:"+k).setPlaceholder("Choose a setting to configure").addOptions(CATEGORIES[k].settings.map(s=>new StringSelectMenuOptionBuilder().setLabel(s.label).setDescription((s.type==="role"?"Role":"Channel")+" • Select a value").setValue(s.key)))),
 new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("setup_home").setLabel("← CATEGORIES").setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId("setup_save").setLabel("SAVE ALL").setEmoji("💾").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("setup_cancel").setLabel("CANCEL").setStyle(ButtonStyle.Danger))
]}
function val(c,k,s){const m=s.type==="role"?new RoleSelectMenuBuilder():new ChannelSelectMenuBuilder().addChannelTypes(ChannelType.GuildText);m.setCustomId("setup_value:"+c+":"+k).setPlaceholder("Select "+s.label).setMinValues(1).setMaxValues(1);return[
 new ActionRowBuilder().addComponents(m),
 new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("setup_back:"+c).setLabel("← BACK").setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId("setup_home").setLabel("CATEGORIES").setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId("setup_save").setLabel("SAVE ALL").setEmoji("💾").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("setup_cancel").setLabel("CANCEL").setStyle(ButtonStyle.Danger))
]}
async function startSetup(i,d){if(!admin(i))return i.reply({content:"❌ You need **Administrator** permission.",ephemeral:true});const s={messageId:null,draft:draft(d)};await hydrateSetupChannels(i.guild,s.draft);const r=await i.reply({embeds:[createHomeEmbed(view(d,s),null,i.guild)],components:home(),fetchReply:true});s.messageId=r.id;sessions.set(sid(i),s)}
async function saveAll(i,d,s){d.config=s.draft.config;d.rankConfig=s.draft.rankConfig;d.config.logs ||= {categoryId:null,channels:{}};d.config.logs.channels ||= {};d.config.blacklist ||= {};d.config.blacklist.public ||= {enabled:false,playerChannelId:null,clanChannelId:null,playerMessages:{},clanMessages:{}};try{if(Object.values(d.config.logs.channels).some(Boolean)||d.config.logs.categoryId)await logging.ensure(i.guild,d);await saveData(d);sessions.delete(sid(i));await i.editReply({embeds:[createHomeEmbed(d,"✅ **ALL SETUP SAVED SUCCESSFULLY.**",i.guild)],components:[]})}catch(e){console.error("❌ Setup save failed:",e);await i.editReply({content:"❌ Setup could not be saved. Check that the bot has **Manage Channels** permission.",embeds:[],components:[]})}}
async function handleSetupButton(i,d){if(!i.customId.startsWith("setup_"))return false;if(i.isStringSelectMenu?.()||i.isRoleSelectMenu?.()||i.isChannelSelectMenu?.())return handleSetupSelect(i,d);const s=check(i);if(typeof s==="string"){await i.reply({content:s,ephemeral:true});return true}if(i.customId==="setup_save"){await i.deferUpdate();return saveAll(i,d,s).then(()=>true)}if(i.customId==="setup_cancel"){sessions.delete(sid(i));await i.update({embeds:[createHomeEmbed(d,"⚠️ Setup cancelled. No draft changes were saved.",i.guild)],components:[]});return true}if(i.customId==="setup_home"){await i.update({embeds:[createHomeEmbed(view(d,s),null,i.guild)],components:home()});return true}if(i.customId.startsWith("setup_back:")){const k=i.customId.split(":")[1];await i.update({embeds:[createCategoryEmbed(view(d,s),k,null,i.guild)],components:cat(k)});return true}return true}
async function handleSetupSelect(i,d){if(!i.customId.startsWith("setup_"))return false;const s=check(i);if(typeof s==="string"){await i.reply({content:s,ephemeral:true});return true}if(i.customId==="setup_category"){const k=i.values[0];await i.update({embeds:[createCategoryEmbed(view(d,s),k,null,i.guild)],components:cat(k)});return true}if(i.customId.startsWith("setup_setting:")){const p=i.customId.split(":"),c=p[1],k=i.values[0],set=getSetting(c,k);if(!set){await i.reply({content:"❌ Unknown setup setting.",ephemeral:true});return true}await i.update({embeds:[createSettingEmbed(view(d,s),c,k,i.guild)],components:val(c,k,set)});return true}if(i.customId.startsWith("setup_value:")){const p=i.customId.split(":"),c=p[1],k=p[2],set=getSetting(c,k);if(!set){await i.reply({content:"❌ Unknown setup setting.",ephemeral:true});return true}apply(s.draft,k,i.values[0]);await i.update({embeds:[createCategoryEmbed(view(d,s),c,"📝 **"+set.label+" added to your draft.**",i.guild)],components:cat(c)});return true}return false}
function apply(d,k,v){d.config ||= {};d.config.helpDesk ||= {};d.config.rank ||= {};d.config.rank.rankRoleIds ||= {};d.config.logs ||= {categoryId:null,channels:{}};d.config.logs.channels ||= {};d.config.blacklist ||= {};d.config.blacklist.public ||= {enabled:false,playerChannelId:null,clanChannelId:null,playerMessages:{},clanMessages:{}};if(k==="helpdesk_channel")d.config.helpDesk.channelId=v;else if(k==="war_role")d.config.helpDesk.warRoleId=v;else if(k==="backup_role")d.config.helpDesk.backupRoleId=v;else if(k==="rank_registration")d.config.rank.registrationChannelId=v;else if(k==="rank_review")d.config.rank.reviewChannelId=v;else if(k==="rank_history")d.config.rank.historyChannelId=v;else if(k==="leaderboard_channel")d.config.rank.leaderboardChannelId=v;else if(k.startsWith("rank_role_"))d.config.rank.rankRoleIds[k.slice(10)]=v;else if(k.startsWith("log_"))d.config.logs.channels[k.slice(4)]=v;else if(k==="blacklist_players")d.config.blacklist.public.playerChannelId=v;else if(k==="blacklist_clans")d.config.blacklist.public.clanChannelId=v;d.rankConfig={...(d.rankConfig||{}),registrationChannelId:d.config.rank.registrationChannelId,reviewChannelId:d.config.rank.reviewChannelId,historyChannelId:d.config.rank.historyChannelId,rankRoleIds:{...((d.rankConfig||{}).rankRoleIds||{}),...(d.config.rank.rankRoleIds||{})}}}
module.exports={startSetup,handleSetupButton,handleSetupSelect};