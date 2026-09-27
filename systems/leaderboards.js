const { EmbedBuilder } = require("discord.js");
const { saveData } = require("../utils/database");

const TITLE_DEFINITIONS = [
  { key:"shadow_monarch", name:"SHADOW MONARCH", emoji:"◈", color:0x5865F2 },
  { key:"destruction_monarch", name:"DESTRUCTION MONARCH", emoji:"✦", color:0xE84393 },
  { key:"white_flame_monarch", name:"WHITE FLAME MONARCH", emoji:"◇", color:0xF5F5F5 },
  { key:"frost_monarch", name:"FROST MONARCH", emoji:"❄", color:0x55E88A },
  { key:"plague_monarch", name:"PLAGUE MONARCH", emoji:"♕", color:0xF1E34B },
  { key:"fang_monarch", name:"FANG MONARCH", emoji:"⌁", color:0x66B9F2 },
  { key:"monarch_of_beginning", name:"MONARCH OF BEGINNING", emoji:"✺", color:0xA855F7 },
  { key:"iron_body_monarch", name:"IRON BODY MONARCH", emoji:"♜", color:0xA7B0B7 },
  { key:"transfiguration_monarch", name:"TRANSFIGURATION MONARCH", emoji:"◇", color:0xB7FF3C },
  { key:"rising_monarch", name:"RISING MONARCH", emoji:"☆", color:0xE52D6F }
];

const DEFAULT_CONFIG = {
  rankingChannelId:null, topKillsChannelId:null,
  rankingMessageId:null, topKillsMessageId:null,
  rankingTitle:"🏅 BLACK DRAGONS • RANKING TITLES",
  rankingDescription:"The strongest people you defeat determine how high your title can rise. One warrior may hold only one title.",
  topKillsTitle:"🏆 BLACK DRAGONS • TOP KILLS",
  topKillsDescription:"The live Black Dragons kill leaderboard.",
  rankingColor:0x8B0000, topKillsColor:0x8B0000, titles:{}
};

function ensure(data){
  data.config ||= {};
  const old=data.config.leaderboards || {};
  data.config.leaderboards={...DEFAULT_CONFIG,...old,titles:{...(old.titles||{})}};
  return data.config.leaderboards;
}

function rankingEmbed(data){
  const cfg=ensure(data);
  const e=new EmbedBuilder().setColor(Number.isInteger(cfg.rankingColor)?cfg.rankingColor:DEFAULT_CONFIG.rankingColor)
    .setTitle(cfg.rankingTitle||DEFAULT_CONFIG.rankingTitle)
    .setDescription(cfg.rankingDescription||DEFAULT_CONFIG.rankingDescription)
    .setTimestamp().setFooter({text:"BLACK DRAGONS • TITLES • LIVE"});
  for(const t of TITLE_DEFINITIONS){
    const holder=cfg.titles[t.key] && cfg.titles[t.key].userId;
    e.addFields({name:t.emoji+" • "+t.name,value:holder?"👤 <@"+holder+">":"👤 **VACANT**",inline:false});
  }
  return e;
}

function killsEmbed(data){
  const cfg=ensure(data);
  const users=Object.values(data.rankUsers||{}).filter(x=>x&&x.discordId)
    .sort((a,b)=>(Number(b.kills)||0)-(Number(a.kills)||0)).slice(0,25);
  const lines=users.length ? users.map((u,i)=>{
    const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":"**"+(i+1)+".**";
    const name=u.robloxUsername?" • "+String(u.robloxUsername).slice(0,60):"";
    const rank=u.rank?" • **"+u.rank+"**":"";
    return medal+" <@"+u.discordId+">"+name+" — **"+(Number(u.kills)||0)+" KILLS**"+rank;
  }).join("\n") : "No ranked players yet.";
  return new EmbedBuilder().setColor(Number.isInteger(cfg.topKillsColor)?cfg.topKillsColor:DEFAULT_CONFIG.topKillsColor)
    .setTitle(cfg.topKillsTitle||DEFAULT_CONFIG.topKillsTitle)
    .setDescription((cfg.topKillsDescription||DEFAULT_CONFIG.topKillsDescription)+"\n\n"+lines)
    .setTimestamp().setFooter({text:"BLACK DRAGONS • LIVE • TOP "+users.length});
}

async function upsert(client,data,kind,embed){
  const cfg=ensure(data);
  const channelId=kind==="ranking"?cfg.rankingChannelId:cfg.topKillsChannelId;
  const messageKey=kind==="ranking"?"rankingMessageId":"topKillsMessageId";
  if(!channelId)return {ok:false,reason:"NOT_CONFIGURED"};
  let channel; try{channel=await client.channels.fetch(String(channelId));}catch{return {ok:false,reason:"CHANNEL_NOT_FOUND"};}
  if(!channel||!channel.isTextBased())return {ok:false,reason:"INVALID_CHANNEL"};
  let message=null;
  if(cfg[messageKey]){try{message=await channel.messages.fetch(String(cfg[messageKey]));}catch{}}
  const payload={embeds:[embed],allowedMentions:{parse:[]}};
  if(message)await message.edit(payload);
  else{message=await channel.send(payload);cfg[messageKey]=message.id;await saveData(data);}
  return {ok:true,message};
}

async function refreshAll(client,data){
  ensure(data);
  const results={ranking:await upsert(client,data,"ranking",rankingEmbed(data)),topKills:await upsert(client,data,"topKills",killsEmbed(data))};
  if(results.ranking.ok||results.topKills.ok)await saveData(data);
  return results;
}

async function assignTitle(client,data,titleKey,userId,actorId){
  const cfg=ensure(data);
  const title=TITLE_DEFINITIONS.find(x=>x.key===titleKey);
  if(!title)throw new Error("Unknown ranking title.");
  if(userId){
    const other=TITLE_DEFINITIONS.find(x=>x.key!==titleKey&&cfg.titles[x.key]&&cfg.titles[x.key].userId===userId);
    if(other)throw new Error("<@"+userId+"> already holds **"+other.name+"**. One person can hold only one title.");
    cfg.titles[titleKey]={userId:String(userId),updatedAt:Date.now(),updatedBy:actorId||null};
  }else delete cfg.titles[titleKey];
  await saveData(data); return refreshAll(client,data);
}

async function updateStyle(client,data,kind,changes){
  const cfg=ensure(data);
  if(kind==="ranking"){
    if(changes.title!==undefined)cfg.rankingTitle=String(changes.title).trim()||DEFAULT_CONFIG.rankingTitle;
    if(changes.description!==undefined)cfg.rankingDescription=String(changes.description).trim()||DEFAULT_CONFIG.rankingDescription;
    if(changes.color!==undefined)cfg.rankingColor=Number(changes.color);
  }else{
    if(changes.title!==undefined)cfg.topKillsTitle=String(changes.title).trim()||DEFAULT_CONFIG.topKillsTitle;
    if(changes.description!==undefined)cfg.topKillsDescription=String(changes.description).trim()||DEFAULT_CONFIG.topKillsDescription;
    if(changes.color!==undefined)cfg.topKillsColor=Number(changes.color);
  }
  await saveData(data); return refreshAll(client,data);
}

module.exports={TITLE_DEFINITIONS,DEFAULT_CONFIG,ensure,rankingEmbed,killsEmbed,refreshAll,assignTitle,updateStyle};
