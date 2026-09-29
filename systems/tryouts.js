const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
}=require("discord.js");

const {saveData}=require("../utils/database");

const sessions=new Map();

function store(data){
  data.tryouts ||= {};
  data.tryouts.active ||= null;
  data.tryouts.history ||= [];
  data.tryouts.playerStats ||= {};
  return data.tryouts;
}

function configuredChannels(data,guild){
  const cfg=data?.config?.tryouts||{};
  return {
    rules: cfg.rulesChannelId ? guild.channels.cache.get(String(cfg.rulesChannelId)) : null,
    tryout: cfg.channelId ? guild.channels.cache.get(String(cfg.channelId)) : null,
    history: cfg.historyChannelId ? guild.channels.cache.get(String(cfg.historyChannelId)) : null,
    staffRoleId: cfg.staffRoleId ? String(cfg.staffRoleId) : null
  };
}

function validLink(link){
  try{return new URL(link).protocol==="https:";}catch{return false;}
}

function syncHistory(data,t){
  const s=store(data);
  const index=s.history.findIndex(x=>String(x?.id)===String(t.id));
  if(index>=0)s.history[index]={...t,results:Array.isArray(t.results)?t.results.map(x=>({...x})):[]};
  else s.history.push({...t,results:Array.isArray(t.results)?t.results.map(x=>({...x})):[]});
}

function isTryoutStaff(interaction,data){
  if(interaction.memberPermissions?.has("Administrator"))return true;
  const roleId=data?.config?.tryouts?.staffRoleId;
  return !!roleId && interaction.member?.roles?.cache?.has(String(roleId));
}

function moderationStore(data){
  const s=store(data);
  s.moderation ||= {};
  return s.moderation;
}

function cleanupModeration(data){
  const m=moderationStore(data);
  const now=Date.now();

  for(const [userId,cases] of Object.entries(m)){
    if(!Array.isArray(cases)){
      m[userId]=[];
      continue;
    }

    m[userId]=cases.filter(x=>{
      if(!x?.expiresAt)return true;
      return Number(x.expiresAt)>now;
    });

    if(!m[userId].length)delete m[userId];
  }

  return m;
}

function activeModerationCases(data,userId){
  const m=cleanupModeration(data);
  return Array.isArray(m[String(userId)])?m[String(userId)]:[];
}

function moderationTypeLabel(type){
  return ({
    timeout:"⏱️ TIMEOUT",
    ban:"🚫 TEMPORARY BAN",
    permban:"🔒 PERMANENT BAN"
  })[type]||String(type||"MODERATION").toUpperCase();
}

function moderationDurationText(expiresAt){
  if(!expiresAt)return "Permanent";
  return "<t:"+Math.floor(Number(expiresAt)/1000)+":R>";
}

function moderationCaseEmbed(guild,userId,cases,staffView=false){
  const member=guild.members.cache.get(String(userId));
  const name=member?member.user.tag:"User "+userId;

  const embed=new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle(staffView?"🛡️ TRYOUT MODERATION CASE":"🛡️ YOUR TRYOUT STATUS")
    .setDescription(staffView
      ?"Current restrictions affecting **"+name+"**."
      :"Your current BLACK DRAGONS tryout eligibility.")
    .addFields({
      name:"👤 Player",
      value:"<@"+userId+">",
      inline:false
    });

  for(const x of cases.slice(0,10)){
    embed.addFields({
      name:moderationTypeLabel(x.type)+" • "+String(x.id||"CASE"),
      value:
        "**Reason:** "+String(x.reason||"No reason provided")+"\n"+
        "**Issued By:** <@"+String(x.issuedBy||"unknown")+">\n"+
        "**Issued:** <t:"+Math.floor(Number(x.createdAt||Date.now())/1000)+":F>\n"+
        "**Expires:** "+moderationDurationText(x.expiresAt),
      inline:false
    });
  }

  return embed;
}

function moderationListEmbed(data,guild){
  const m=cleanupModeration(data);
  const entries=Object.entries(m)
    .filter(([,cases])=>Array.isArray(cases)&&cases.length)
    .sort((a,b)=>Number(b[1][0]?.createdAt||0)-Number(a[1][0]?.createdAt||0));

  const embed=new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("🛡️ BLACK DRAGONS • TRYOUT RESTRICTIONS")
    .setDescription(entries.length
      ?"Players currently restricted from joining BLACK DRAGONS tryouts."
      :"No players are currently under a tryout restriction.")
    .setFooter({text:"BLACK DRAGONS • Tryout Moderation"})
    .setTimestamp();

  if(entries.length){
    const lines=entries.slice(0,25).map(([userId,cases])=>{
      const current=cases[0];
      return "<@"+userId+"> — **"+moderationTypeLabel(current.type)+"** — "+moderationDurationText(current.expiresAt);
    });
    embed.addFields({name:"🚫 Restricted Players",value:lines.join("\n")||"None"});
  }

  if(entries.length>25){
    embed.addFields({name:"📋 Note",value:"Showing the first 25 currently restricted players."});
  }

  return embed;
}

async function showModerationStatus(i,c){
  const staff=isTryoutStaff(i,c.data);
  if(staff){
    await i.reply({embeds:[moderationListEmbed(c.data,i.guild)],ephemeral:true});
    return true;
  }

  const cases=activeModerationCases(c.data,i.user.id);

  if(!cases.length){
    await i.reply({
      content:"✅ **You are not currently moderated for BLACK DRAGONS tryouts.**\n\nYou are **good to go**.",
      ephemeral:true
    });
    return true;
  }

  await i.reply({
    embeds:[moderationCaseEmbed(i.guild,i.user.id,cases,false)],
    ephemeral:true
  });
  return true;
}

async function addModeration(i,c,type,targetId,reason,minutes=null){
  if(!isTryoutStaff(i,c.data)){
    await i.reply({content:"❌ Only an Administrator or the configured **Tryout Staff** role can use tryout moderation.",ephemeral:true});
    return true;
  }

  if(String(targetId)===String(i.user.id)){
    await i.reply({content:"❌ You cannot moderate yourself.",ephemeral:true});
    return true;
  }

  const member=await i.guild.members.fetch(targetId).catch(()=>null);
  if(!member){
    await i.reply({content:"❌ That member could not be found in this server.",ephemeral:true});
    return true;
  }

  const m=moderationStore(c.data);
  const userId=String(targetId);
  const now=Date.now();
  const expiresAt=minutes?now+(Number(minutes)*60*1000):null;

  const entry={
    id:"CASE-"+now.toString(36).toUpperCase(),
    type,
    userId,
    issuedBy:i.user.id,
    reason:String(reason||"No reason provided").slice(0,500),
    createdAt:now,
    expiresAt
  };

  m[userId] ||= [];
  m[userId]=m[userId].filter(x=>x?.expiresAt && Number(x.expiresAt)>now);
  m[userId].unshift(entry);

  await saveData(c.data);

  // A moderation action also removes the player from the currently active
  // tryout roster if one exists.
  const active=store(c.data).active;
  if(active){
    active.moderatedUserIds ||= [];
    if(!active.moderatedUserIds.includes(userId))active.moderatedUserIds.push(userId);
    await saveData(c.data);
  }

  await i.reply({
    content:
      "✅ **"+moderationTypeLabel(type)+"** applied to <@"+userId+">.\n"+
      "🆔 Case: **"+entry.id+"**\n"+
      "📝 Reason: "+entry.reason+"\n"+
      "⏳ Expires: "+moderationDurationText(entry.expiresAt),
    ephemeral:true
  });

  return true;
}

async function kickFromTryout(i,c,targetId,reason){
  if(!isTryoutStaff(i,c.data)){
    await i.reply({content:"❌ Only an Administrator or the configured **Tryout Staff** role can use tryout moderation.",ephemeral:true});
    return true;
  }

  const active=store(c.data).active;
  if(!active){
    await i.reply({content:"❌ There is no active tryout.",ephemeral:true});
    return true;
  }

  const member=await i.guild.members.fetch(targetId).catch(()=>null);
  if(!member){
    await i.reply({content:"❌ That member could not be found in this server.",ephemeral:true});
    return true;
  }

  active.kickedUserIds ||= [];
  const userId=String(targetId);
  if(!active.kickedUserIds.includes(userId))active.kickedUserIds.push(userId);

  active.kickHistory ||= [];
  active.kickHistory.push({
    userId,
    issuedBy:i.user.id,
    reason:String(reason||"No reason provided").slice(0,500),
    timestamp:Date.now()
  });

  await saveData(c.data);

  await i.reply({
    content:"✅ <@"+userId+"> has been **kicked from the current tryout**.\n📝 Reason: "+String(reason||"No reason provided"),
    ephemeral:true
  });

  return true;
}

function announcement(t){
  const closed=t.status==="ended";

  const embed=new EmbedBuilder()
    .setColor(closed?0x555555:0x8B0000)
    .setTitle(closed
      ?"🏁 BLACK DRAGONS • TRYOUT COMPLETED"
      :"⚔️ BLACK DRAGONS • TRYOUT NOW OPEN")
    .setDescription(closed
      ?"This tryout has officially finished. The official match history has been preserved and archived."
      :"A new BLACK DRAGONS tryout has officially begun.\n\n**The arena is open. The trial is live.**\nJoin the Roblox server below and wait for Tryout Staff to organize your matchup.\n\nStaff will manage matchups, referee fights, record results, and keep the trial moving.")
    .addFields(
      {name:"👑 Tryout Host",value:"<@"+t.startedBy+">",inline:true},
      {name:"🆔 Tryout ID",value:t.id,inline:true},
      {name:"📊 Matches Recorded",value:String(t.results?.length||0),inline:true}
    )
    .setFooter({text:"BLACK DRAGONS • TRYOUT SYSTEM"})
    .setTimestamp(t.createdAt);

  if(closed){
    embed.addFields(
      {name:"🏁 Status",value:"**COMPLETED**",inline:true},
      {name:"📅 Started",value:"<t:"+Math.floor(t.createdAt/1000)+":F>",inline:true},
      {name:"🛑 Ended",value:"<t:"+Math.floor(t.endedAt/1000)+":F>",inline:true},
      {name:"👤 Ended By",value:"<@"+t.endedBy+">",inline:false}
    );
  }else{
    embed.addFields(
      {name:"🔗 Roblox Server",value:"[**JOIN THE TRYOUT SERVER**]("+t.serverLink+")",inline:false},
      {name:"📜 Before You Fight",value:"Read the rules in <#"+t.rulesChannelId+"> before entering the arena. Respect your opponent and follow the referee's instructions.",inline:false}
    );
  }

  return embed;
}

function historyEmbed(t){
  const closed=t.status==="ended";

  const embed=new EmbedBuilder()
    .setColor(closed?0x555555:0x8B0000)
    .setTitle(closed
      ?"📚 BLACK DRAGONS • COMPLETED TRYOUT"
      :"📚 BLACK DRAGONS • TRYOUT HISTORY")
    .setDescription(closed
      ?"Permanent record for **"+t.id+"**. This tryout is finished and its match-results thread has been archived."
      :"Complete record for **"+t.id+"**. Match results are posted live in the thread attached to this entry.")
    .addFields(
      {name:"🆔 Tryout ID",value:t.id,inline:true},
      {name:"👑 Host",value:"<@"+t.startedBy+">",inline:true},
      {name:"📊 Matches",value:String(t.results?.length||0),inline:true},
      {name:"📅 Started",value:"<t:"+Math.floor(t.createdAt/1000)+":F>",inline:true},
      {name:"🏁 Status",value:closed?"**COMPLETED / ARCHIVED**":"**ACTIVE**",inline:true}
    )
    .setFooter({text:"BLACK DRAGONS • Permanent Tryout Record"})
    .setTimestamp(t.createdAt);

  if(closed){
    embed.addFields(
      {name:"🛑 Ended",value:"<t:"+Math.floor(t.endedAt/1000)+":F>",inline:true},
      {name:"👤 Ended By",value:"<@"+t.endedBy+">",inline:true}
    );
  }else{
    embed.addFields({
      name:"🔗 Roblox Server",
      value:"[Join Server]("+t.serverLink+")",
      inline:false
    });
  }

  return embed;
}

function panel(t,s,g){
  const w=s.winnerId?g.members.cache.get(s.winnerId):null;
  const l=s.loserId?g.members.cache.get(s.loserId):null;
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("⚔️ TRYOUT RESULT • RECORD MATCH")
    .setDescription("Tryout: **"+t.id+"**\n\nSelect the two players who fought. Then enter the kill score.\n\n**First to 5 kills wins the match.**")
    .addFields(
      {name:"🏆 Winner",value:w?"<@"+w.id+">":"**Not selected**",inline:true},
      {name:"⚔️ Opponent",value:l?"<@"+l.id+">":"**Not selected**",inline:true},
      {name:"📊 Kill Score",value:s.winnerKills!==null&&s.loserKills!==null?"**"+s.winnerKills+" - "+s.loserKills+"**":"**Not entered**",inline:false}
    )
    .setFooter({text:"Tryout Staff • Record the actual match score"});
}

function components(s){
  const w=new UserSelectMenuBuilder()
    .setCustomId("tryoutres:winner")
    .setPlaceholder("Select the winner")
    .setMinValues(1).setMaxValues(1);

  const l=new UserSelectMenuBuilder()
    .setCustomId("tryoutres:loser")
    .setPlaceholder("Select the opponent")
    .setMinValues(1).setMaxValues(1);

  const enter=new ButtonBuilder()
    .setCustomId("tryoutres:kills")
    .setLabel("ENTER KILL SCORE")
    .setEmoji("📊")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!(s.winnerId&&s.loserId));

  const cancel=new ButtonBuilder()
    .setCustomId("tryoutres:cancel")
    .setLabel("CANCEL")
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(w),
    new ActionRowBuilder().addComponents(l),
    new ActionRowBuilder().addComponents(enter,cancel)
  ];
}

function killModal(s){
  return new ModalBuilder()
    .setCustomId("tryoutres:kills_modal")
    .setTitle("Record Tryout Kill Score")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("winner_kills")
          .setLabel("Winner kills")
          .setPlaceholder("Example: 5")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1).setMaxLength(2)
          .setRequired(true)
          .setValue(s.winnerKills!==null?String(s.winnerKills):"5")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("loser_kills")
          .setLabel("Opponent kills")
          .setPlaceholder("Example: 3")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1).setMaxLength(2)
          .setRequired(true)
          
      )
    );
}

async function startTryout(i,c,link){
  if(!isTryoutStaff(i,c.data))return i.reply({content:"❌ Only an Administrator or the configured **Tryout Staff** role can start a tryout.",ephemeral:true});
  if(!validLink(link))return i.reply({content:"❌ Please provide a valid HTTPS server link.",ephemeral:true});

  const s=store(c.data);
  if(s.active)return i.reply({content:"❌ A tryout is already active: **"+s.active.id+"**.",ephemeral:true});

  const configured=configuredChannels(c.data,i.guild);
  const tc=configured.tryout;
  const rc=configured.rules;
  const hc=configured.history;

  if(!tc||!rc||!hc)return i.reply({content:"❌ Tryout setup is incomplete. Use `/setup` → **Tryouts** and select the Rules, Tryout, and History channels.",ephemeral:true});

  await i.deferReply({ephemeral:true});

  const now=Date.now();
  const t={
    id:"TRY-"+now.toString(36).toUpperCase(),
    guildId:i.guildId,
    channelId:tc.id,
    rulesChannelId:rc.id,
    historyChannelId:hc.id,
    staffRoleId:configured.staffRoleId,
    serverLink:link,
    startedBy:i.user.id,
    createdAt:now,
    status:"active",
    endedAt:null,
    endedBy:null,
    results:[],
    announcementMessageId:null,
    historyMessageId:null,
    historyThreadId:null,
    winnerStats:{}
  };

  try{
    const m=await tc.send({
      content:"@everyone",
      embeds:[announcement(t)],
      allowedMentions:{parse:["everyone"]},
      components:[
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("JOIN ROBLOX SERVER").setStyle(ButtonStyle.Link).setURL(link).setEmoji("🎮"),
          new ButtonBuilder().setLabel("READ RULES").setStyle(ButtonStyle.Link).setURL("https://discord.com/channels/"+i.guildId+"/"+rc.id).setEmoji("📜"),
          new ButtonBuilder().setCustomId("tryout:status").setLabel("TRYOUT STATUS").setEmoji("🛡️").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("tryout:end").setLabel("END TRYOUT").setEmoji("🏁").setStyle(ButtonStyle.Danger)
        )
      ]
    });

    t.announcementMessageId=m.id;

    const hm=await hc.send({embeds:[historyEmbed(t)]});
    t.historyMessageId=hm.id;

    const thread=await hm.startThread({
      name:t.id+" • Match Results",
      autoArchiveDuration:10080,
      reason:"BLACK DRAGONS tryout history"
    });
    t.historyThreadId=thread.id;

    await thread.send({
      embeds:[
        new EmbedBuilder()
          .setColor(0x8B0000)
          .setTitle("⚔️ "+t.id+" • MATCH LOG")
          .setDescription("This thread contains the live official results for this tryout.\n\n**First to 5 kills wins.** Every recorded match is stored here permanently.")
          .setFooter({text:"BLACK DRAGONS • Official Tryout History"})
          .setTimestamp(now)
      ]
    });

    s.active=t;
    syncHistory(c.data,t);
    await saveData(c.data);

    return i.editReply({content:"✅ **"+t.id+"** started successfully.\n\n📢 Announcement sent to <#"+tc.id+">\n📚 History entry created in <#"+hc.id+">\n🧵 Match-results thread created."});
  }catch(error){
    console.error("❌ Tryout start failed:",error);
    return i.editReply({content:"❌ The tryout could not be started completely. Check the bot's permissions in the configured Tryout and History channels."});
  }
}

async function startResult(i,c){
  if(!isTryoutStaff(i,c.data))return i.reply({content:"❌ Only an Administrator or the configured **Tryout Staff** role can record tryout results.",ephemeral:true});
  const t=store(c.data).active;
  if(!t)return i.reply({content:"❌ There is currently **no active tryout**. Start one with /start-tryout first.",ephemeral:true});
  const s={tryoutId:t.id,winnerId:null,loserId:null,winnerKills:null,loserKills:null};
  sessions.set(key(i),s);
  return i.reply({embeds:[panel(t,s,i.guild)],components:components(s),ephemeral:true});
}

function key(i){return i.guildId+":"+i.user.id;}

async function handleSelect(i,c){
  if(!i.customId.startsWith("tryoutres:"))return false;
  const t=store(c.data).active;
  const s=sessions.get(key(i));

  if(!t||!s||s.tryoutId!==t.id){
    await i.reply({content:"❌ This result panel is no longer active. Run /tryout-result again.",ephemeral:true});
    return true;
  }

  if(i.isUserSelectMenu()){
    if(i.customId==="tryoutres:winner")s.winnerId=i.values[0];
    if(i.customId==="tryoutres:loser")s.loserId=i.values[0];
  }

  await i.update({embeds:[panel(t,s,i.guild)],components:components(s)});
  return true;
}

function resultEmbed(t,r,g){
  const w=g.members.cache.get(r.winnerId);
  const l=g.members.cache.get(r.loserId);

  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("⚔️ BLACK DRAGONS • TRYOUT MATCH")
    .setDescription("**"+(w?"<@"+w.id+">":"Player")+" won against "+(l?"<@"+l.id+">":"Player")+"**")
    .addFields(
      {name:"📊 Kill Score",value:"**"+r.winnerKills+" - "+r.loserKills+"**",inline:true},
      {name:"👁️ Recorded By",value:"<@"+r.recordedBy+">",inline:true},
      {name:"🆔 Match",value:"#"+t.results.length,inline:true},
      {name:"🏆 Tryout Wins",value:"**"+String(r.winnerTotalWins)+"**",inline:true},
      {name:"🆔 Tryout",value:t.id,inline:true}
    )
    .setFooter({text:"BLACK DRAGONS • Official Tryout Match Record"})
    .setTimestamp(r.timestamp);
}

async function handleButton(i,c){
  const id=i.customId;

  if(id==="tryout:status"){
    return showModerationStatus(i,c);
  }

  if(id==="tryout:end"){
    const t=store(c.data).active;
    if(!t){
      await i.reply({content:"❌ There is no active tryout to end.",ephemeral:true});
      return true;
    }
    if(!isTryoutStaff(i,c.data)){
      await i.reply({content:"❌ Only an Administrator or the configured **Tryout Staff** role can end a tryout.",ephemeral:true});
      return true;
    }

    await i.deferReply({ephemeral:true});
    t.status="ended";
    t.endedAt=Date.now();
    t.endedBy=i.user.id;

    syncHistory(c.data,t);
    store(c.data).active=null;
    await saveData(c.data);

    try{
      const tc=await i.client.channels.fetch(t.channelId).catch(()=>null);
      const announcementMessage=tc?.messages?.fetch
        ?(t.announcementMessageId?await tc.messages.fetch(t.announcementMessageId).catch(()=>null):null)
        :null;

      if(announcementMessage){
        try{
          await announcementMessage.edit({
            embeds:[announcement(t)],
            components:[]
          });
        }catch(error){
          console.error("❌ Tryout announcement update failed:",error);
        }
      }

      const hc=await i.client.channels.fetch(t.historyChannelId).catch(()=>null);
      const historyMessage=hc?.messages?.fetch
        ?(t.historyMessageId?await hc.messages.fetch(t.historyMessageId).catch(()=>null):null)
        :null;

      if(historyMessage){
        try{
          await historyMessage.edit({embeds:[historyEmbed(t)],components:[]});
        }catch(error){
          console.error("❌ Tryout history message update failed:",error);
        }
      }

      if(t.historyThreadId){
        const thread=await i.client.channels.fetch(t.historyThreadId).catch(()=>null);

        if(thread?.isThread()){
          try{
            await thread.send({
              embeds:[
                new EmbedBuilder()
                  .setColor(0x555555)
                  .setTitle("🏁 "+t.id+" • TRYOUT COMPLETED")
                  .setDescription("The tryout has officially ended. **"+t.results.length+" match"+(t.results.length===1?" was":"es were")+" recorded.")
                  .addFields(
                    {name:"Ended By",value:"<@"+t.endedBy+">",inline:true},
                    {name:"Status",value:"**COMPLETED • ARCHIVED**",inline:true}
                  )
                  .setTimestamp(t.endedAt)
              ]
            });
          }catch(error){
            console.error("❌ Tryout completion log failed:",error);
          }

          try{
            await thread.setLocked(true,"Tryout ended");
          }catch(error){
            console.error("❌ Tryout history thread lock failed:",error);
          }

          try{
            await thread.setArchived(true,"Tryout ended");
          }catch(error){
            console.error("❌ Tryout history thread archive failed:",error);
          }
        }
      }
    }catch(error){
      console.error("❌ Tryout end display update failed:",error);
    }

    await i.editReply({content:"✅ **"+t.id+"** has been ended. The history and match record have been preserved."});
    return true;
  }

  if(!id.startsWith("tryoutres:"))return false;

  const s=store(c.data);
  const t=s.active;
  const session=sessions.get(key(i));

  if(id==="tryoutres:cancel"){
    sessions.delete(key(i));
    await i.update({content:"❌ Result entry cancelled.",embeds:[],components:[]});
    return true;
  }

  if(!t||!session||session.tryoutId!==t.id){
    await i.reply({content:"❌ This result panel is no longer active. Run /tryout-result again.",ephemeral:true});
    return true;
  }

  if(id==="tryoutres:kills"){
    if(!session.winnerId||!session.loserId){
      await i.reply({content:"❌ Select both players first.",ephemeral:true});
      return true;
    }
    if(session.winnerId===session.loserId){
      await i.reply({content:"❌ Winner and opponent cannot be the same person.",ephemeral:true});
      return true;
    }
    await i.showModal(killModal(session));
    return true;
  }

  return true;
}

async function handleModal(i,c){
  if(i.customId!=="tryoutres:kills_modal")return false;

  const s=store(c.data);
  const t=s.active;
  const session=sessions.get(key(i));

  if(!t||!session||session.tryoutId!==t.id){
    await i.reply({content:"❌ This result panel is no longer active. Run /tryout-result again.",ephemeral:true});
    return true;
  }

  // A modal interaction must be acknowledged immediately.
  // Database writes and Discord thread operations can take long enough
  // to make Discord show the generic "Something went wrong" message.
  await i.deferReply({ephemeral:true});

  try{
    const winnerKills=Number(i.fields.getTextInputValue("winner_kills"));
    const loserKills=Number(i.fields.getTextInputValue("loser_kills"));

    if(!Number.isInteger(winnerKills)||!Number.isInteger(loserKills)||winnerKills<0||loserKills<0){
      await i.editReply({content:"❌ Kill counts must be whole numbers."});
      return true;
    }

    if(winnerKills!==5){
      await i.editReply({content:"❌ The winning score must be **5** because the first player to reach 5 kills wins."});
      return true;
    }

    if(loserKills>=5){
      await i.editReply({content:"❌ The opponent's score must be **0–4** when the winner reaches 5."});
      return true;
    }

    const w=await i.guild.members.fetch(session.winnerId).catch(()=>null);
    const l=await i.guild.members.fetch(session.loserId).catch(()=>null);

    if(!w||!l){
      await i.editReply({content:"❌ One of the selected players could not be found in this server."});
      return true;
    }

    const winnerRestriction=activeModerationCases(c.data,w.id);
    const loserRestriction=activeModerationCases(c.data,l.id);
    const activeTryout=store(c.data).active;

    if(winnerRestriction.length){
      await i.editReply({content:"❌ <@"+w.id+"> is currently restricted from BLACK DRAGONS tryouts and cannot have a result recorded."});
      return true;
    }

    if(loserRestriction.length){
      await i.editReply({content:"❌ <@"+l.id+"> is currently restricted from BLACK DRAGONS tryouts and cannot have a result recorded."});
      return true;
    }

    if(activeTryout?.kickedUserIds?.includes(String(w.id))||activeTryout?.kickedUserIds?.includes(String(l.id))){
      await i.editReply({content:"❌ One of the selected players has been kicked from the current tryout and cannot have another result recorded."});
      return true;
    }

    session.winnerKills=winnerKills;
    session.loserKills=loserKills;

    const lifetimeStats=store(c.data).playerStats;
    lifetimeStats[w.id] ||= {wins:0,kills:0};
    lifetimeStats[w.id].wins=Number(lifetimeStats[w.id].wins||0)+1;
    lifetimeStats[w.id].kills=Number(lifetimeStats[w.id].kills||0)+winnerKills;

    const winnerTotalWins=lifetimeStats[w.id].wins;

    t.winnerStats ||= {};
    t.winnerStats[w.id] ||= {wins:0,kills:0};

    const r={
      id:"MATCH-"+Date.now().toString(36).toUpperCase(),
      winnerId:w.id,
      loserId:l.id,
      winnerKills,
      loserKills,
      recordedBy:i.user.id,
      timestamp:Date.now(),
      winnerTotalWins
    };

    t.winnerStats[w.id].wins=winnerTotalWins;
    t.winnerStats[w.id].kills=Number(t.winnerStats[w.id].kills||0)+winnerKills;
    t.results.push(r);

    syncHistory(c.data,t);

    // Persist the match even if Discord has a temporary problem sending
    // the history message.
    await saveData(c.data);

    const matchEmbed=resultEmbed(t,r,i.guild);

    const tryoutChannel=await i.client.channels.fetch(t.channelId).catch(()=>null);
    let tryoutPosted=true;

    if(tryoutChannel?.isTextBased()){
      try{
        await tryoutChannel.send({embeds:[matchEmbed]});
      }catch(error){
        tryoutPosted=false;
        console.error("❌ Tryout match public post failed:",error);
      }
    }else{
      tryoutPosted=false;
      console.error("❌ Tryout channel could not be found.");
    }

    const thread=t.historyThreadId
      ? await i.client.channels.fetch(t.historyThreadId).catch(()=>null)
      : null;

    let historyPosted=true;

    if(thread?.isTextBased()){
      try{
        await thread.send({embeds:[matchEmbed]});
      }catch(error){
        historyPosted=false;
        console.error("❌ Tryout match history post failed:",error);
      }
    }else{
      historyPosted=false;
      console.error("❌ Tryout match history thread could not be found.");
    }

    sessions.delete(key(i));

    await i.editReply({
      content:
        "✅ **Match #"+t.results.length+" recorded successfully.**\\n\\n"+
        w.toString()+" won against "+l.toString()+" with a **"+winnerKills+" - "+loserKills+"** score."+
        (historyPosted
          ?"\\n📚 The official result was added to the tryout history thread."
          :"\\n⚠️ The match was saved, but I could not post it to the history thread.")
    });

    return true;
  }catch(error){
    console.error("❌ Tryout result submission failed:",error);

    try{
      await i.editReply({
        content:"❌ The match could not be recorded. The error was logged; no partial confirmation was sent."
      });
    }catch(replyError){
      console.error("❌ Could not update tryout result error reply:",replyError);
    }

    return true;
  }
}

module.exports={
  getStore:store,
  startTryout,
  startResult,
  handleSelect,
  handleButton,
  handleModal,
  isTryoutStaff,
  showModerationStatus,
  addModeration,
  kickFromTryout
};
