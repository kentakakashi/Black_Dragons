const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionFlagsBits
}=require("discord.js");

const lb=require("../systems/leaderboards");
const sessions=new Map();
const TTL=30*60*1000;

const row=x=>new ActionRowBuilder().addComponents(x);
const admin=i=>i.memberPermissions?.has(PermissionFlagsBits.Administrator);
const id=()=>Math.random().toString(36).slice(2,10);

function put(s){
  if(s.t)clearTimeout(s.t);
  s.t=setTimeout(()=>sessions.delete(s.id),TTL);
  if(s.t.unref)s.t.unref();
  sessions.set(s.id,s);
}

function get(i){
  return sessions.get(i.customId.split(":").pop());
}

function board(s){
  return new StringSelectMenuBuilder()
    .setCustomId("embedit:board:"+s.id)
    .setPlaceholder("Choose a leaderboard")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Ranking Titles")
        .setDescription("Edit the live ranking-title embed appearance.")
        .setEmoji("🏅")
        .setValue("ranking"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Top Kills")
        .setDescription("Edit the live kill leaderboard appearance.")
        .setEmoji("🏆")
        .setValue("topKills")
    );
}

function home(){
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("🏆 LEADERBOARD EMBED EDITOR")
    .setDescription(
      "Choose a live leaderboard to edit.\n\n"+
      "🏅 **Ranking Titles** — edit the title, description and color.\n"+
      "🏆 **Top Kills** — edit the title, description and color.\n\n"+
      "🎭 Ranking-title holders are pulled automatically from the roles configured in **/setup → Leaderboards**."
    );
}

function ranking(data,guild){
  return lb.rankingEditorEmbed(data,guild);
}

function kills(data){
  const c=lb.ensure(data);
  return new EmbedBuilder()
    .setColor(c.topKillsColor)
    .setTitle("🛠️ TOP KILLS EDITOR")
    .setDescription(
      "The live leaderboard reads the existing **rankUsers** kill records.\n\n"+
      "The public design shows **Rank + Kills** for each player, following the reference leaderboard style.\n\n"+
      "Use **APPEARANCE** to edit the title, description and color."
    )
    .setFooter({text:"Firebase-backed configuration"});
}

function controls(s){
  return [
    row(
      new ButtonBuilder()
        .setCustomId("embedit:appearance:"+s.id)
        .setLabel("APPEARANCE")
        .setEmoji("🎨")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("embedit:back:"+s.id)
        .setLabel("← CATEGORIES")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function render(i,s){
  put(s);
  const embed=s.mode==="ranking"
    ? ranking(s.data,i.guild)
    : kills(s.data);

  await i.update({
    embeds:[embed],
    components:controls(s),
    allowedMentions:{parse:[]}
  });
}

function modal(s){
  const c=lb.ensure(s.data);
  const r=s.mode==="ranking";

  return new ModalBuilder()
    .setCustomId("embedit:modal:"+s.id)
    .setTitle(r?"🏅 Ranking Embed":"🏆 Top Kills Embed")
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Embed title")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256)
          .setValue(String(r?c.rankingTitle:c.topKillsTitle).slice(0,256))
      ),
      row(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000)
          .setValue(String(r?c.rankingDescription:c.topKillsDescription).slice(0,4000))
      ),
      row(
        new TextInputBuilder()
          .setCustomId("color")
          .setLabel("HEX color")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(7)
          .setValue("#"+Number(r?c.rankingColor:c.topKillsColor).toString(16).padStart(6,"0"))
      )
    );
}

async function handleSelect(i){
  if(!i.customId.startsWith("embed:")&&!i.customId.startsWith("embedit:"))return false;

  if(!admin(i)){
    await i.reply({content:"❌ Administrator only.",ephemeral:true});
    return true;
  }

  if(i.customId==="embed:category"){
    const data=i.client.appData;
    if(!data){
      await i.reply({content:"❌ Bot database is not loaded.",ephemeral:true});
      return true;
    }

    const s={id:id(),mode:null,data};
    put(s);

    await i.update({
      embeds:[home()],
      components:[row(board(s))]
    });
    return true;
  }

  if(i.customId.startsWith("embedit:board:")){
    const s=get(i);
    if(!s)return true;

    try{
      s.mode=i.values[0];
      await render(i,s);
    }catch(error){
      console.error("❌ Embed editor leaderboard render failed:",error);
      if(!i.replied&&!i.deferred){
        await i.reply({content:"❌ Could not open that leaderboard editor: "+(error?.message||"Unknown error"),ephemeral:true});
      }
    }
    return true;
  }

  return false;
}

async function handleButton(i){
  if(!i.customId.startsWith("embedit:"))return false;

  if(!admin(i)){
    await i.reply({content:"❌ Administrator only.",ephemeral:true});
    return true;
  }

  const s=get(i);
  if(!s)return true;

  if(i.customId.startsWith("embedit:back:")){
    s.mode=null;
    await i.update({
      embeds:[home()],
      components:[row(board(s))]
    });
    return true;
  }

  if(i.customId.startsWith("embedit:appearance:")){
    await i.showModal(modal(s));
    return true;
  }

  return false;
}

async function handleModal(i){
  if(!i.customId.startsWith("embedit:modal:"))return false;

  const s=get(i);
  if(!s)return true;

  const color=String(i.fields.getTextInputValue("color")).replace(/^#/,"");
  if(!/^[0-9a-f]{6}$/i.test(color)){
    await i.reply({content:"❌ Invalid HEX color.",ephemeral:true});
    return true;
  }

  try{
    await lb.updateStyle(
      i.client,
      s.data,
      s.mode,
      {
        title:i.fields.getTextInputValue("title"),
        description:i.fields.getTextInputValue("description"),
        color:parseInt(color,16)
      }
    );

    const embed=s.mode==="ranking"
      ? ranking(s.data,i.guild)
      : kills(s.data);

    await i.update({
      embeds:[embed],
      components:controls(s),
      allowedMentions:{parse:[]}
    });
  }catch(error){
    console.error("❌ Embed editor save failed:",error);
    await i.reply({
      content:"❌ Could not save the embed settings: "+(error?.message||"Unknown error"),
      ephemeral:true
    });
  }

  return true;
}

module.exports={handleSelect,handleButton,handleModal};
