
const {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,UserSelectMenuBuilder,StringSelectMenuBuilder}=require("discord.js");
const {saveData}=require("../utils/database");
const sessions=new Map();

function store(data){
  data.tryouts ||= {};
  data.tryouts.active ||= null;
  data.tryouts.history ||= [];
  return data.tryouts;
}
function configuredChannels(data,guild){
  const cfg=data?.config?.tryouts||{};
  return {
    rules: cfg.rulesChannelId ? guild.channels.cache.get(String(cfg.rulesChannelId)) : null,
    tryout: cfg.channelId ? guild.channels.cache.get(String(cfg.channelId)) : null,
    history: cfg.historyChannelId ? guild.channels.cache.get(String(cfg.historyChannelId)) : null
  };
}
function validLink(link){
  try{return new URL(link).protocol==="https:";}catch{return false;}
}
function announcement(t){
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("⚔️ BLACK DRAGONS • TRYOUT NOW OPEN")
    .setDescription("A new BLACK DRAGONS tryout has officially begun.\n\n**The arena is open. The trial is live.**\nJoin the Roblox server below and wait for Tryout Staff to organize your matchup.\n\nStaff will manage matchups, referee fights, record results, and keep the trial moving.")
    .addFields(
      {name:"👑 Tryout Host",value:"<@"+t.startedBy+">",inline:true},
      {name:"🆔 Tryout ID",value:t.id,inline:true},
      {name:"📊 Matches Recorded",value:String(t.results.length),inline:true},
      {name:"🔗 Roblox Server",value:"[**JOIN THE TRYOUT SERVER**]("+t.serverLink+")",inline:false},
      {name:"📜 Before You Fight",value:"Read the rules in <#"+t.rulesChannelId+"> before entering the arena. Respect your opponent and follow the referee's instructions.",inline:false}
    )
    .setFooter({text:"BLACK DRAGONS • TRYOUT SYSTEM"})
    .setTimestamp(t.createdAt);
}
function key(i){return i.guildId+":"+i.user.id;}
function panel(t,s,g){
  const w=s.winnerId?g.members.cache.get(s.winnerId):null;
  const l=s.loserId?g.members.cache.get(s.loserId):null;
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("⚔️ TRYOUT RESULT • RECORD MATCH")
    .setDescription("Tryout: "+t.id+"\n\n**This panel is private to you.** Select the winner, loser, and points.\n\nThe completed result will be posted in #tryout.")
    .addFields(
      {name:"🏆 Who Won",value:w?"<@"+w.id+">":"**Not selected**",inline:true},
      {name:"💀 Who Lost",value:l?"<@"+l.id+">":"**Not selected**",inline:true},
      {name:"⭐ Winner Point",value:s.points?"**+"+s.points+"**":"**Not selected**",inline:true}
    )
    .setFooter({text:"Tryout Staff • Check everything before submitting"});
}
function components(s){
  const w=new UserSelectMenuBuilder().setCustomId("tryoutres:winner").setPlaceholder("Select the winner").setMinValues(1).setMaxValues(1);
  const l=new UserSelectMenuBuilder().setCustomId("tryoutres:loser").setPlaceholder("Select the loser").setMinValues(1).setMaxValues(1);
  const p=new StringSelectMenuBuilder().setCustomId("tryoutres:points").setPlaceholder("Select winner points").setMinValues(1).setMaxValues(1).addOptions(Array.from({length:20},(_,i)=>({label:(i+1)+" point"+(i?"s":""),value:String(i+1),description:"Award "+(i+1)+" point"+(i?"s":"")+" to the winner."})));
  const submit=new ButtonBuilder().setCustomId("tryoutres:submit").setLabel("RECORD RESULT").setEmoji("🏆").setStyle(ButtonStyle.Success).setDisabled(!(s.winnerId&&s.loserId&&s.points));
  const cancel=new ButtonBuilder().setCustomId("tryoutres:cancel").setLabel("CANCEL").setStyle(ButtonStyle.Secondary);
  return [new ActionRowBuilder().addComponents(w),new ActionRowBuilder().addComponents(l),new ActionRowBuilder().addComponents(p),new ActionRowBuilder().addComponents(submit,cancel)];
}
async function startTryout(i,c,link){
  if(!validLink(link))return i.reply({content:"❌ Please provide a valid HTTPS server link.",ephemeral:true});
  const s=store(c.data);
  if(s.active)return i.reply({content:"❌ A tryout is already active: **"+s.active.id+"**.",ephemeral:true});
  const configured=configuredChannels(c.data,i.guild);
  const tc=configured.tryout;
  const rc=configured.rules;
  if(!tc||!rc)return i.reply({content:"❌ Tryout channels are not configured. Use `/setup` → **Tryouts** and select the Rules, Tryout, and History channels first.",ephemeral:true});
  const now=Date.now();
  const t={id:"TRY-"+now.toString(36).toUpperCase(),guildId:i.guildId,channelId:tc.id,rulesChannelId:rc?.id||tc.id,serverLink:link,startedBy:i.user.id,createdAt:now,results:[],announcementMessageId:null};
  const m=await tc.send({content:"@everyone",embeds:[announcement(t)],allowedMentions:{parse:["everyone"]},components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("JOIN ROBLOX SERVER").setStyle(ButtonStyle.Link).setURL(link).setEmoji("🎮"))]});
  t.announcementMessageId=m.id;
  s.active=t;
  s.history.push({id:t.id,startedBy:t.startedBy,serverLink:t.serverLink,channelId:t.channelId,startedAt:t.createdAt,announcementMessageId:m.id});
  await saveData(c.data);
  return i.reply({content:"✅ Tryout **"+t.id+"** started in <#"+tc.id+">. Everyone has been notified.",ephemeral:true});
}
async function startResult(i,c){
  const t=store(c.data).active;
  if(!t)return i.reply({content:"❌ There is currently **no active tryout**. Start one with /start-tryout first.",ephemeral:true});
  const s={tryoutId:t.id,winnerId:null,loserId:null,points:null};
  sessions.set(key(i),s);
  return i.reply({embeds:[panel(t,s,i.guild)],components:components(s),ephemeral:true});
}
async function handleSelect(i,c){
  if(!i.customId.startsWith("tryoutres:"))return false;
  const t=store(c.data).active,s=sessions.get(key(i));
  if(!t||!s||s.tryoutId!==t.id){await i.reply({content:"❌ This result panel is no longer active. Run /tryout-result again.",ephemeral:true});return true;}
  if(i.isUserSelectMenu()){
    if(i.customId==="tryoutres:winner")s.winnerId=i.values[0];
    if(i.customId==="tryoutres:loser")s.loserId=i.values[0];
  }
  if(i.isStringSelectMenu()&&i.customId==="tryoutres:points")s.points=Number(i.values[0]);
  await i.update({embeds:[panel(t,s,i.guild)],components:components(s)});
  return true;
}
function resultEmbed(t,r,g){
  const w=g.members.cache.get(r.winnerId),l=g.members.cache.get(r.loserId);
  const wt=t.results.filter(x=>x.winnerId===r.winnerId).reduce((a,x)=>a+Number(x.points||0),0);
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("⚔️ BLACK DRAGONS • TRYOUT RESULT")
    .setDescription("Match **#"+t.results.length+"** has been officially recorded.")
    .addFields(
      {name:"🏆 WINNER",value:w?"<@"+w.id+">":"<@"+r.winnerId+">",inline:true},
      {name:"💀 LOSER",value:l?"<@"+l.id+">":"<@"+r.loserId+">",inline:true},
      {name:"⭐ WINNER POINT",value:"**+"+r.points+"**",inline:true},
      {name:"📈 Winner Total",value:"**"+wt+" point"+(wt===1?"":"s")+"**",inline:true},
      {name:"👁️ Referee / Staff",value:"<@"+r.recordedBy+">",inline:true},
      {name:"🆔 Tryout",value:t.id,inline:true},
      {name:"🎮 Server",value:"[Join Server]("+t.serverLink+")",inline:true}
    )
    .setFooter({text:"BLACK DRAGONS • Official Tryout Record"})
    .setTimestamp(r.timestamp);
}
async function handleButton(i,c){
  if(!i.customId.startsWith("tryoutres:"))return false;
  const s=store(c.data),t=s.active,session=sessions.get(key(i));
  if(i.customId==="tryoutres:cancel"){sessions.delete(key(i));await i.update({content:"❌ Result entry cancelled.",embeds:[],components:[]});return true;}
  if(!t||!session||session.tryoutId!==t.id){await i.reply({content:"❌ This result panel is no longer active. Run /tryout-result again.",ephemeral:true});return true;}
  if(i.customId!=="tryoutres:submit")return true;
  if(!session.winnerId||!session.loserId||!session.points)return i.reply({content:"❌ Select a winner, loser, and winner point first.",ephemeral:true});
  if(session.winnerId===session.loserId)return i.reply({content:"❌ Winner and loser cannot be the same person.",ephemeral:true});
  const w=await i.guild.members.fetch(session.winnerId).catch(()=>null),l=await i.guild.members.fetch(session.loserId).catch(()=>null);
  if(!w||!l)return i.reply({content:"❌ One of the selected members could not be found in this server.",ephemeral:true});
  const r={id:"MATCH-"+Date.now().toString(36).toUpperCase(),winnerId:w.id,loserId:l.id,points:Number(session.points),recordedBy:i.user.id,timestamp:Date.now()};
  t.results.push(r);
  await saveData(c.data);
  const tc=await i.client.channels.fetch(t.channelId).catch(()=>null);
  if(!tc?.isTextBased()){sessions.delete(key(i));await i.update({content:"⚠️ Result saved, but the #tryout channel could not be found.",embeds:[],components:[]});return true;}
  await tc.send({embeds:[resultEmbed(t,r,i.guild)],allowedMentions:{parse:[],users:[w.id,l.id,i.user.id]}});
  sessions.delete(key(i));
  await i.update({content:"✅ **Match #"+t.results.length+" recorded.** The result has been posted in <#"+t.channelId+">.",embeds:[],components:[]});
  return true;
}
module.exports={getStore:store,startTryout,startResult,handleSelect,handleButton};
