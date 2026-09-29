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

function announcement(t){
  const closed=t.status==="ended";
  return new EmbedBuilder()
    .setColor(closed?0x555555:0x8B0000)
    .setTitle(closed?"⚔️ BLACK DRAGONS • TRYOUT CLOSED":"⚔️ BLACK DRAGONS • TRYOUT NOW OPEN")
    .setDescription(closed
      ?"This tryout has officially ended. The match history is preserved in the Tryout History channel."
      :"A new BLACK DRAGONS tryout has officially begun.\n\n**The arena is open. The trial is live.**\nJoin the Roblox server below and wait for Tryout Staff to organize your matchup.\n\nStaff will manage matchups, referee fights, record results, and keep the trial moving.")
    .addFields(
      {name:"👑 Tryout Host",value:"<@"+t.startedBy+">",inline:true},
      {name:"🆔 Tryout ID",value:t.id,inline:true},
      {name:"📊 Matches Recorded",value:String(t.results?.length||0),inline:true},
      {name:"🔗 Roblox Server",value:"[**JOIN THE TRYOUT SERVER**]("+t.serverLink+")",inline:false},
      {name:closed?"🏁 Status":"📜 Before You Fight",value:closed
        ?"**TRYOUT ENDED**\nEnded by <@"+t.endedBy+">"
        :"Read the rules in <#"+t.rulesChannelId+"> before entering the arena. Respect your opponent and follow the referee's instructions.",inline:false}
    )
    .setFooter({text:"BLACK DRAGONS • TRYOUT SYSTEM"})
    .setTimestamp(t.createdAt);
}

function historyEmbed(t){
  const closed=t.status==="ended";
  return new EmbedBuilder()
    .setColor(closed?0x555555:0x8B0000)
    .setTitle("📚 BLACK DRAGONS • TRYOUT HISTORY")
    .setDescription("Complete record for **"+t.id+"**. Match results are posted live in the thread attached to this entry.")
    .addFields(
      {name:"🆔 Tryout ID",value:t.id,inline:true},
      {name:"👑 Host",value:"<@"+t.startedBy+">",inline:true},
      {name:"📊 Matches",value:String(t.results?.length||0),inline:true},
      {name:"🔗 Roblox Server",value:"[Join Server]("+t.serverLink+")",inline:false},
      {name:"📅 Started",value:"<t:"+Math.floor(t.createdAt/1000)+":F>",inline:true},
      {name:"🏁 Status",value:closed?"Ended":"Active",inline:true}
    )
    .setFooter({text:"BLACK DRAGONS • Permanent Tryout Record"})
    .setTimestamp(t.createdAt);
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
          .setValue(s.loserKills!==null?String(s.loserKills):"")
      )
    );
}

async function startTryout(i,c,link){
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
      const announcementMessage=tc?.messages?.fetch?t.announcementMessageId?await tc.messages.fetch(t.announcementMessageId).catch(()=>null):null:null;
      if(announcementMessage){
        await announcementMessage.edit({
          embeds:[announcement(t)],
          components:[
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setLabel("TRYOUT ENDED").setEmoji("🏁").setStyle(ButtonStyle.Secondary).setDisabled(true)
            )
          ]
        });
      }

      const hc=await i.client.channels.fetch(t.historyChannelId).catch(()=>null);
      const historyMessage=hc?.messages?.fetch?t.historyMessageId?await hc.messages.fetch(t.historyMessageId).catch(()=>null):null:null;
      if(historyMessage)await historyMessage.edit({embeds:[historyEmbed(t)]});

      if(t.historyThreadId){
        const thread=await i.client.channels.fetch(t.historyThreadId).catch(()=>null);
        if(thread?.isThread()){
          await thread.send({
            embeds:[
              new EmbedBuilder()
                .setColor(0x555555)
                .setTitle("🏁 "+t.id+" • TRYOUT ENDED")
                .setDescription("The tryout has ended. **"+t.results.length+" match"+(t.results.length===1?"":"es")+"** were officially recorded.")
                .addFields({name:"Ended By",value:"<@"+t.endedBy+">",inline:true})
                .setTimestamp(t.endedAt)
            ]
          });
          await thread.setLocked(true,"Tryout ended").catch(()=>{});
          await thread.setArchived(true,"Tryout ended").catch(()=>{});
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

  const winnerKills=Number(i.fields.getTextInputValue("winner_kills"));
  const loserKills=Number(i.fields.getTextInputValue("loser_kills"));

  if(!Number.isInteger(winnerKills)||!Number.isInteger(loserKills)||winnerKills<0||loserKills<0){
    await i.reply({content:"❌ Kill counts must be whole numbers.",ephemeral:true});
    return true;
  }

  if(winnerKills!==5){
    await i.reply({content:"❌ The winning score must be **5** because the first player to reach 5 kills wins.",ephemeral:true});
    return true;
  }

  if(loserKills>=5){
    await i.reply({content:"❌ The opponent's score must be **0–4** when the winner reaches 5.",ephemeral:true});
    return true;
  }

  const w=await i.guild.members.fetch(session.winnerId).catch(()=>null);
  const l=await i.guild.members.fetch(session.loserId).catch(()=>null);

  if(!w||!l){
    await i.reply({content:"❌ One of the selected players could not be found in this server.",ephemeral:true});
    return true;
  }

  session.winnerKills=winnerKills;
  session.loserKills=loserKills;

  const winnerTotalWins=Number(t.winnerStats?.[w.id]?.wins||0)+1;
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
  await saveData(c.data);

  const thread=t.historyThreadId
    ? await i.client.channels.fetch(t.historyThreadId).catch(()=>null)
    : null;

  if(thread?.isTextBased()){
    await thread.send({embeds:[resultEmbed(t,r,i.guild)]});
  }

  sessions.delete(key(i));

  await i.reply({
    content:"✅ **Match #"+t.results.length+" recorded successfully.**\n\n"+w.toString()+" won against "+l.toString()+" with a **"+winnerKills+" - "+loserKills+"** score.\n📚 The official result was added to the tryout history thread.",
    ephemeral:true
  });
  return true;
}

module.exports={
  getStore:store,
  startTryout,
  startResult,
  handleSelect,
  handleButton,
  handleModal
};
