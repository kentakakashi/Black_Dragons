const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { saveData } = require("../utils/database");

const KILL_PAGE_SIZE = 10;
const killLeaderboardPages = new Map();
function killUsers(data){return Object.values(data.rankUsers||{}).filter(x=>x&&x.discordId).sort((a,b)=>(Number(b.kills)||0)-(Number(a.kills)||0));}
function killPageButtons(page,total,messageId){const maxPage=Math.max(0,Math.ceil(total/KILL_PAGE_SIZE)-1);return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("livekills:prev:"+messageId).setLabel("PREVIOUS").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page<=0),new ButtonBuilder().setCustomId("livekills:next:"+messageId).setLabel("NEXT").setEmoji("➡️").setStyle(ButtonStyle.Primary).setDisabled(page>=maxPage));}
function pageFromMessage(message){const footer=message?.embeds?.[0]?.footer?.text||"";const match=footer.match(/PAGE (\d+)\//i);return match?Math.max(0,Number(match[1])-1):0;}


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
    const holderMembers=role
      ? [...role.members.values()]
      : [];

    const holders=holderMembers.map(member=>String(member.id));

    result.push({
      title,
      roleId:roleId?String(roleId):null,
      role,
      holders,
      holderMembers
    });
  }
  return result;
}

async function rankingEmbed(client,data,guildOverride=null){
  const cfg=ensure(data);
  const states=await getRankingRoleState(client,data,guildOverride);

  const lines=states.map((state,index)=>{
    // Use the fetched GuildMember's native mention string so the holder
    // is a real clickable Discord user mention, not plain text.
    // GuildMember#toString() returns the proper <@USER_ID> mention format.
    const holderText=state.holderMembers?.length
      ? state.holderMembers.map(member => member.toString()).join(", ")
      : "VACANT";

    // Use the actual Discord role configured in /setup → Leaderboards.
    // Role#toString() produces a real <@&ROLE_ID> role mention.
    const titleText=state.role
      ? state.role.toString()
      : "**"+state.title.name+"**";

    return "**"+(index+1)+".** "+titleText+" : "+holderText;
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

function killsEmbed(data,client,guildOverride=null,page=0){
  const cfg=ensure(data), users=killUsers(data);
  const totalPages=Math.max(1,Math.ceil(users.length/KILL_PAGE_SIZE));
  const safePage=Math.min(Math.max(0,Number(page)||0),totalPages-1);
  const pageUsers=users.slice(safePage*KILL_PAGE_SIZE,(safePage+1)*KILL_PAGE_SIZE);
  const icon=guildOverride?.iconURL?.({size:256,dynamic:true,extension:"png"})||client?.guilds?.cache?.first()?.iconURL?.({size:256,dynamic:true,extension:"png"});
  const lines=pageUsers.length?pageUsers.map((u,index)=>{
    const position=safePage*KILL_PAGE_SIZE+index, medal=position===0?"🥇":position===1?"🥈":position===2?"🥉":"#"+(position+1);
    return medal+"  <@"+u.discordId+">\\n   **Rank:** "+String(u.rank||"E").toUpperCase()+"  •  **Kills:** "+(Number(u.kills)||0).toLocaleString("en-US");
  }).join("\\n\\n"):"No ranked players yet.";
  const e=new EmbedBuilder().setColor(Number.isInteger(cfg.topKillsColor)?cfg.topKillsColor:DEFAULT_CONFIG.topKillsColor)
    .setTitle(cfg.topKillsTitle||DEFAULT_CONFIG.topKillsTitle)
    .setDescription((cfg.topKillsDescription||DEFAULT_CONFIG.topKillsDescription)+"\\n\\n"+lines)
    .setTimestamp().setFooter({text:"BLACK DRAGONS • LIVE • TOP • PAGE "+(safePage+1)+"/"+totalPages+" • "+users.length+" PLAYERS"});
  if(icon)e.setThumbnail(icon);return e;
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

  // First try the persisted message ID.
  if(cfg[messageKey]){
    try{
      message=await channel.messages.fetch(String(cfg[messageKey]));
    }catch{
      message=null;
    }
  }

  // If the saved ID is missing/stale, recover the existing leaderboard
  // instead of creating another copy. This also repairs old data where the
  // message ID was not persisted correctly.
  if(!message){
    try{
      const recent=await channel.messages.fetch({limit:100});
      const footerMarker=kind==="ranking"
        ? "BLACK DRAGONS • TITLES • LIVE"
        : "BLACK DRAGONS • LIVE • TOP";

      const matches=[...recent.values()].filter(candidate=>{
        if(candidate.author?.id!==client.user?.id) return false;
        const embed=candidate.embeds?.[0];
        const footer=embed?.footer?.text || "";
        return footer.startsWith(footerMarker);
      }).sort((a,b)=>Number(b.createdTimestamp)-Number(a.createdTimestamp));

      if(matches.length){
        message=matches[0];

        // Clean up duplicate copies created by earlier broken refreshes.
        for(const duplicate of matches.slice(1)){
          try{await duplicate.delete();}catch{}
        }

        cfg[messageKey]=message.id;
        await saveData(data);
      }
    }catch{}
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

  const currentPage=kind==="topKills"?(message?(killLeaderboardPages.get(message.id)??pageFromMessage(message)):0):0;
  const displayEmbed=kind==="topKills"?killsEmbed(data,client,null,currentPage):embed;
  const payload={
    content:"",
    embeds:[displayEmbed],
    ...(kind==="topKills"?{components:[killPageButtons(currentPage,killUsers(data).length,message?.id||"pending")]}:{}),
    allowedMentions:{parse:[],users:[...new Set(holderIds.map(String))],roles:[...new Set(roleIds.map(String))]}
  };

  if(message){
    if(kind==="topKills"){payload.components=[killPageButtons(currentPage,killUsers(data).length,message.id)];killLeaderboardPages.set(message.id,currentPage);}
    await message.edit(payload);

    // If we recovered a message after a stale/missing ID, persist the repaired
    // ID so future live refreshes always edit this same message.
    if(cfg[messageKey]!==message.id){
      cfg[messageKey]=message.id;
      await saveData(data);
    }
  }else{
    message=await channel.send(payload);
    if(kind==="topKills"){await message.edit({components:[killPageButtons(0,killUsers(data).length,message.id)]});killLeaderboardPages.set(message.id,0);}
    cfg[messageKey]=message.id;
    await saveData(data);
  }

  return {ok:true,message};
}

async function handleKillPageButton(interaction,client,data){
  if(!interaction.customId.startsWith("livekills:"))return false;
  const [,direction,messageId]=interaction.customId.split(":");
  if(!interaction.message||interaction.message.id!==messageId){await interaction.reply({content:"This leaderboard control is no longer valid. Please wait for the live leaderboard to refresh.",ephemeral:true});return true;}
  const users=killUsers(data||client.appData||{}), maxPage=Math.max(0,Math.ceil(users.length/KILL_PAGE_SIZE)-1);
  const current=killLeaderboardPages.get(messageId)??pageFromMessage(interaction.message);
  const next=direction==="next"?Math.min(maxPage,current+1):Math.max(0,current-1);
  killLeaderboardPages.set(messageId,next);
  await interaction.update({embeds:[killsEmbed(data||client.appData,client,interaction.guild,next)],components:[killPageButtons(next,users.length,messageId)],allowedMentions:{parse:[]}});
  return true;
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
  handleKillPageButton,
  refreshAll,
  updateStyle
};
