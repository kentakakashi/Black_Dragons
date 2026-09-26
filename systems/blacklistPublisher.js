const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { saveData } = require("../utils/database");
function isAdmin(i){return i.memberPermissions?.has(PermissionFlagsBits.Administrator);}
function getConfig(data){
  data.config ||= {};
  data.config.blacklist ||= {};
  data.config.blacklist.public ||= {
    enabled:false,
    playerChannelId:null,
    clanChannelId:null,
    playerMessages:{},
    clanMessages:{}
  };
  const cfg=data.config.blacklist.public;
  cfg.playerMessages ||= {};
  cfg.clanMessages ||= {};
  return cfg;
}
function entries(data,type){
  const store=data.blacklist?.[type==="clan"?"clans":"players"]||{};
  return Object.values(store)
    .filter(entry=>entry&&entry.active!==false)
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function publicEmbed(entry,type){
  const isClan=type==="clan";
  const embed=new EmbedBuilder()
    .setColor(0x8b0000)
    .setTitle("🚫 "+(isClan?"BLACK DRAGONS • CLAN BLACKLIST":"BLACK DRAGONS • PLAYER BLACKLIST"))
    .setDescription((isClan?"🏴 **Clan:** ":"👤 **Roblox username:** ")+String(entry.name||"Unknown"))
    .addFields(
      {name:isClan?"🏴 Clan ID":"🆔 Roblox ID",value:entry.externalId?`\`${entry.externalId}\``:"Not provided",inline:true},
      {name:"💬 Discord",value:entry.discordId?"<@"+entry.discordId+">":"Not provided",inline:true},
      {name:"📅 Added",value:`<t:${Math.floor((entry.createdAt||Date.now())/1000)}:F>`,inline:false}
    )
    .setFooter({text:"BLACK DRAGONS • Public Blacklist"})
    .setTimestamp();
  if(entry.notes)embed.addFields({name:"📝 Notes",value:String(entry.notes).slice(0,1024),inline:false});
  if(entry.profileImageUrl)embed.setImage(entry.profileImageUrl);
  return embed;
}

async function syncType(guild,data,type){
  const cfg=getConfig(data);
  const channelKey=type==="clan"?"clanChannelId":"playerChannelId";
  const messageKey=type==="clan"?"clanMessages":"playerMessages";
  const configuredId=cfg[channelKey];
  if(!configuredId){
    throw new Error(
      type==="clan"
        ? "The Blacklist → Blacklisted Clans Channel is not configured. Run /setup and SAVE ALL first."
        : "The Blacklist → Blacklisted Players Channel is not configured. Run /setup and SAVE ALL first."
    );
  }

  let channel;
  try{
    channel=await guild.channels.fetch(String(configuredId));
  }catch{
    throw new Error(
      type==="clan"
        ? "The configured Blacklisted Clans channel could not be found. Reconfigure it in /setup."
        : "The configured Blacklisted Players channel could not be found. Reconfigure it in /setup."
    );
  }

  if(!channel || channel.guildId!==guild.id || channel.type!==ChannelType.GuildText){
    throw new Error(
      type==="clan"
        ? "The configured Blacklisted Clans channel is invalid. Reconfigure it in /setup."
        : "The configured Blacklisted Players channel is invalid. Reconfigure it in /setup."
    );
  }
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