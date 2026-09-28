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
  rankingChannelId:null,
  topKillsChannelId:null,
  rankingMessageId:null,
  topKillsMessageId:null,
  rankingTitle:"🏅 BLACK DRAGONS • RANKING TITLES",
  rankingDescription:"The strongest people you defeat determine how high your title can rise. One warrior may hold only one title.",
  topKillsTitle:"🏆 BLACK DRAGONS • TOP KILLS",
  topKillsDescription:"The live Black Dragons kill leaderboard.",
  rankingColor:0x8B0000,
  topKillsColor:0x8B0000,
  rankingRoleIds:{},
  titles:{}
};

function ensure(data){
  if(!data) throw new Error("Leaderboard data is unavailable.");
  data.config ||= {};
  const old=data.config.leaderboards || {};
  data.config.leaderboards={
    ...DEFAULT_CONFIG,
    ...old,
    rankingRoleIds:{...DEFAULT_CONFIG.rankingRoleIds,...(old.rankingRoleIds||{})},
    titles:{...(old.titles||{})}
  };
  return data.config.leaderboards;
}

function mention(id, role=false){
  return role ? "<@&"+String(id)+">" : "<@"+String(id)+">";
}

async function resolveLeaderboardGuild(client,data){
  const cfg=ensure(data);
  const channelIds=[
    cfg.rankingChannelId,
    cfg.topKillsChannelId
  ].filter(Boolean);

  for(const channelId of channelIds){
    try{
      const channel=await client.channels.fetch(String(channelId));
      if(channel?.guild) return channel.guild;
    }catch{}
  }

  return client?.guilds?.cache?.first() || null;
}

async function getRankingRoleState(client,data,guildOverride=null){
  const cfg=ensure(data);
  const guild=guildOverride || await resolveLeaderboardGuild(client,data);
  const result=[];
  if(!guild) return result;

  // GuildMembers intent is enabled. Fetch once so role membership is current
  // even when the role's members were not already cached.
  try{ await guild.members.fetch(); }catch{}

  for(const title of TITLE_DEFINITIONS){
    const roleId=cfg.rankingRoleIds?.[title.key] || null;
    let role=null;
    if(roleId){
      try{role=await guild.roles.fetch(String(roleId));}catch{}
    }
    const holders=role
      ? [...role.members.values()].map(member=>String(member.id))
      : [];

    result.push({title,roleId:roleId?String(roleId):null,role,holders});
  }
  return result;
}

async function rankingEmbed(client,data,guildOverride=null){
  const cfg=ensure(data);
  const states=await getRankingRoleState(client,data,guildOverride);

  const lines=states.map((state,index)=>{
    const holderText=state.holders.length
      ? state.holders.map(id=>mention(id)).join(", ")
      : "VACANT";

    // Use the actual Discord role configured in /setup → Leaderboards.
    // Role#toString() produces a real <@&ROLE_ID> role mention.
    const titleText=state.role
      ? state.role.toString()
      : "**"+state.title.name+"**";

    return "**"+(index+1)+".** "+titleText+" — "+holderText;
  });

  const description=lines.length
    ? lines.join("\n")
    : "No ranking titles are configured yet.";

  return new EmbedBuilder()
    .setColor(Number.isInteger(cfg.rankingColor)?cfg.rankingColor:DEFAULT_CONFIG.rankingColor)
    .setTitle(cfg.rankingTitle||DEFAULT_CONFIG.rankingTitle)
    .setDescription(description)
    .setFooter({text:"BLACK DRAGONS • TITLES • LIVE"});
}
function rankingEditorEmbed(data,guild){
  const cfg=ensure(data);
  const lines=TITLE_DEFINITIONS.map(t=>{
    const roleId=cfg.rankingRoleIds?.[t.key];
    const role=roleId ? guild?.roles?.cache?.get(String(roleId)) : null;
    return t.emoji+" **"+t.name+"**\n🎭 "+(role?role.toString():"**Not configured**");
  }).join("\n\n");

  return new EmbedBuilder()
    .setColor(cfg.rankingColor)
    .setTitle("🛠️ RANKING TITLES EDITOR")
    .setDescription(lines+"\n\nThe live leaderboard reads the members of these Discord roles automatically. Role mapping is configured in **/setup → Leaderboards**.")
    .setFooter({text:"Firebase-backed configuration"});
}

function killsEmbed(data,client,guildOverride=null){
  const cfg=ensure(data);
  const users=Object.values(data.rankUsers||{})
    .filter(x=>x&&x.discordId)
    .sort((a,b)=>(Number(b.kills)||0)-(Number(a.kills)||0))
    .slice(0,25);

  const icon=guildOverride?.iconURL?.({size:256,dynamic:true,extension:"png"})
    || client?.guilds?.cache?.first()?.iconURL?.({size:256,dynamic:true,extension:"png"});

  const lines=users.length
    ? users.map((u,i)=>{
        const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":"#"+(i+1);
        const rank=String(u.rank||"E").toUpperCase();
        return medal+"  <@"+u.discordId+">\n   **Rank:** "+rank+"  •  **Kills:** "+(Number(u.kills)||0).toLocaleString("en-US");
      }).join("\n\n")
    : "No ranked players yet.";

  const e=new EmbedBuilder()
    .setColor(Number.isInteger(cfg.topKillsColor)?cfg.topKillsColor:DEFAULT_CONFIG.topKillsColor)
    .setTitle(cfg.topKillsTitle||DEFAULT_CONFIG.topKillsTitle)
    .setDescription((cfg.topKillsDescription||DEFAULT_CONFIG.topKillsDescription)+"\n\n"+lines)
    .setTimestamp()
    .setFooter({text:"BLACK DRAGONS • LIVE • TOP "+users.length});

  if(icon) e.setThumbnail(icon);
  return e;
}

async function upsert(client,data,kind,embed){
  const cfg=ensure(data);
  const channelId=kind==="ranking"?cfg.rankingChannelId:cfg.topKillsChannelId;
  const messageKey=kind==="ranking"?"rankingMessageId":"topKillsMessageId";

  if(!channelId)return {ok:false,reason:"NOT_CONFIGURED"};

  let channel;
  try{channel=await client.channels.fetch(String(channelId));}
  catch{return {ok:false,reason:"CHANNEL_NOT_FOUND"};}

  if(!channel||!channel.isTextBased())return {ok:false,reason:"INVALID_CHANNEL"};

  let message=null;
  if(cfg[messageKey]){
    try{message=await channel.messages.fetch(String(cfg[messageKey]));}catch{}
  }

  // Keep the persistent leaderboard clean: role/user mentions are displayed
  // in the embed itself. Do NOT dump all configured Monarch roles into the
  // message content on every refresh/edit, or Discord will show a giant block
  // of role mentions above the embed and may repeatedly notify those roles.
  const rankingStates = kind === "ranking"
    ? await getRankingRoleState(client,data)
    : [];
  const holderIds = rankingStates.flatMap(state => state.holders);
  const roleIds = rankingStates
    .map(state => state.roleId)
    .filter(Boolean);

  const payload={
    embeds:[embed],
    allowedMentions:{
      parse:[],
      users:[...new Set(holderIds.map(String))],
      roles:[...new Set(roleIds.map(String))]
    }
  };

  if(message){
    await message.edit(payload);
  }else{
    message=await channel.send(payload);
    cfg[messageKey]=message.id;
    await saveData(data);
  }

  return {ok:true,message};
}

async function refreshAll(client,data){
  ensure(data);
  const guild=await resolveLeaderboardGuild(client,data);
  const results={
    ranking:await upsert(client,data,"ranking",await rankingEmbed(client,data,guild)),
    topKills:await upsert(client,data,"topKills",killsEmbed(data,client,guild))
  };
  if(results.ranking.ok||results.topKills.ok) await saveData(data);
  return results;
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

  await saveData(data);
  return refreshAll(client,data);
}

module.exports={
  TITLE_DEFINITIONS,
  DEFAULT_CONFIG,
  ensure,
  resolveLeaderboardGuild,
  getRankingRoleState,
  rankingEmbed,
  rankingEditorEmbed,
  killsEmbed,
  refreshAll,
  updateStyle
};
