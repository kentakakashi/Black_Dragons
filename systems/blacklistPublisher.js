const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { saveData } = require("../utils/database");
const PLAYER_NAMES = ["blacklisted-players","blacklisted-player","bl-player"];
const CLAN_NAMES = ["blacklisted-clans","blacklisted-clan","bl-clan"];
function isAdmin(i){return i.memberPermissions?.has(PermissionFlagsBits.Administrator);}
function normalizeName(name){return String(name||"").toLowerCase().replace(/[^a-z0-9-]/g,"");}
function getConfig(data){
  data.config ||= {}; data.config.blacklist ||= {};
  data.config.blacklist.public ||= {enabled:false,playerChannelId:null,clanChannelId:null,playerMessages:{},clanMessages:{}};
  const p=data.config.blacklist.public;
  p.enabled=Boolean(p.enabled); p.playerChannelId ||= null; p.clanChannelId ||= null; p.playerMessages ||= {}; p.clanMessages ||= {};
  return p;
}
function entries(data,type){
  const store=type==="clan"?data.blacklist?.clans||{}:data.blacklist?.players||{};
  return Object.values(store).filter(x=>x&&x.active!==false).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
}
function publicEmbed(entry,type){
  const clan=type==="clan";
  const e=new EmbedBuilder().setColor(0x8b0000)
    .setTitle(clan?"🚫 BLACK DRAGONS • BLACKLISTED CLAN":"🚫 BLACK DRAGONS • BLACKLISTED PLAYER")
    .setDescription(clan?"This clan is currently blacklisted by **BLACK DRAGONS**.":"This Roblox player is currently blacklisted by **BLACK DRAGONS**.")
    .addFields({name:clan?"🏴 Clan name":"👤 Roblox username",value:"**"+String(entry.name||"Unknown").slice(0,100)+"**",inline:false});
  if(entry.externalId)e.addFields({name:clan?"🆔 Clan ID":"🆔 Roblox ID",value:"`"+String(entry.externalId).slice(0,40)+"`",inline:true});
  if(entry.discordId)e.addFields({name:"💬 Discord",value:"<@"+entry.discordId+">",inline:true});
  if(entry.notes)e.addFields({name:"📝 Notes",value:String(entry.notes).slice(0,1000),inline:false});
  e.addFields({name:"📅 Added",value:"<t:"+Math.floor(Number(entry.createdAt||Date.now())/1000)+":F>",inline:false});
  if(entry.profileImageUrl)e.setImage(entry.profileImageUrl);
  return e.setFooter({text:"BLACK DRAGONS • Public Blacklist"});
}
async function findChannel(guild,type,configuredId){
  if(configuredId){try{const c=await guild.channels.fetch(String(configuredId));if(c&&c.guildId===guild.id&&c.type===ChannelType.GuildText)return c;}catch{}}
  const names=type==="clan"?CLAN_NAMES:PLAYER_NAMES; const wanted=new Set(names.map(normalizeName));
  return guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&wanted.has(normalizeName(c.name)))||null;
}
async function syncType(guild,data,type){
  const cfg=getConfig(data);
  const channelKey=type==="clan"?"clanChannelId":"playerChannelId";
  const messageKey=type==="clan"?"clanMessages":"playerMessages";
  const channel=await findChannel(guild,type,cfg[channelKey]);
  if(!channel)throw new Error(type==="clan"?"Could not find the clan blacklist channel. Expected blacklisted-clans (or bl-clan).":"Could not find the player blacklist channel. Expected blacklisted-players (or bl-player).");
  cfg[channelKey]=channel.id;
  const active=entries(data,type), wanted=new Set(active.map(x=>x.id)), messages=cfg[messageKey];
  for(const [entryId,messageId] of Object.entries(messages)){
    if(wanted.has(entryId))continue;
    try{const m=await channel.messages.fetch(String(messageId));await m.delete();}catch{}
    delete messages[entryId];
  }
  for(const entry of active){
    const embed=publicEmbed(entry,type), existingId=messages[entry.id];
    if(existingId){
      try{const m=await channel.messages.fetch(String(existingId));await m.edit({embeds:[embed],components:[]});continue;}catch{delete messages[entry.id];}
    }
    const m=await channel.send({embeds:[embed]}); messages[entry.id]=m.id;
  }
  return {channel,count:active.length};
}
async function publish(guild,data){
  const cfg=getConfig(data); cfg.enabled=true;
  const players=await syncType(guild,data,"player");
  const clans=await syncType(guild,data,"clan");
  await saveData(data);
  return {players,clans};
}
async function syncIfPublished(guild,data,type){if(!getConfig(data).enabled)return false;await syncType(guild,data,type);return true;}
async function restore(client){
  const data=client.appData,cfg=getConfig(data); if(!cfg.enabled)return;
  const guild=client.guilds.cache.first(); if(!guild)return;
  try{await syncType(guild,data,"player");await syncType(guild,data,"clan");await saveData(data);console.log("🚫 Public blacklist embeds restored.");}
  catch(error){console.error("❌ Could not restore public blacklist embeds:",error);}
}
async function execute(interaction,context){
  if(!isAdmin(interaction)){await interaction.reply({content:"❌ Only **Administrators** can publish the public blacklist.",ephemeral:true});return;}
  await interaction.deferReply({ephemeral:true});
  try{
    const r=await publish(interaction.guild,context.data);
    await interaction.editReply({content:"✅ **BLACKLIST PUBLISHED SUCCESSFULLY.**\n\n👤 Player blacklist: **"+r.players.count+"** embed(s) in <#"+r.players.channel.id+">\n🏴 Clan blacklist: **"+r.clans.count+"** embed(s) in <#"+r.clans.channel.id+">\n\nExisting blacklist messages were updated instead of duplicated."});
  }catch(error){
    console.error("❌ Blacklist publish failed:",error);
    await interaction.editReply({content:"❌ **BLACKLIST PUBLISH FAILED.**\n\n"+String(error?.message||"Unknown error")});
  }
}
module.exports={name:"blacklist-publish",execute,publish,restore,syncIfPublished,publicEmbed};