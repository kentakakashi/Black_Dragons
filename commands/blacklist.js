
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { randomUUID } = require("crypto");
const { saveData } = require("../utils/database");
const blacklistPublisher = require("../systems/blacklistPublisher");

const PAGE = 6;
function admin(i){ return i.memberPermissions?.has(PermissionFlagsBits.Administrator); }
function bl(d){
  if(!d.blacklist)d.blacklist={players:{},clans:{},history:[]};
  d.blacklist.players ||= {};
  d.blacklist.clans ||= {};
  if(!Array.isArray(d.blacklist.history))d.blacklist.history=[];
  return d.blacklist;
}
function id(type){ return type+"_"+Date.now().toString(36)+"_"+randomUUID().slice(0,8); }
function entries(d,type){
  return Object.values(bl(d)[type==="clan"?"clans":"players"])
    .filter(x=>x&&x.active!==false)
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function history(d,e,action,actor){
  bl(d).history.push({id:e.id,type:e.type,action,actorId:actor,timestamp:Date.now(),snapshot:JSON.parse(JSON.stringify(e))});
}
function menu(){
  return new EmbedBuilder().setColor(0x8b0000)
    .setTitle("🚫 BLACK DRAGONS • BLACKLIST")
    .setDescription("Manage players and clans that are not permitted within BLACK DRAGONS.\\n\\nChoose what you want to manage below.")
    .addFields(
      {name:"👤 Player Blacklist",value:"Individual Roblox players.",inline:true},
      {name:"🏴 Clan Blacklist",value:"Entire clans.",inline:true}
    ).setFooter({text:"Administrator access only • Black Dragons"}).setTimestamp();
}
function menuButtons(){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bl:menu:player").setLabel("PLAYER BLACKLIST").setEmoji("👤").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("bl:menu:clan").setLabel("CLAN BLACKLIST").setEmoji("🏴").setStyle(ButtonStyle.Danger)
  );
}
function listEmbed(d,type,page){
  const all=entries(d,type), max=Math.max(0,Math.ceil(all.length/PAGE)-1), p=Math.min(Math.max(0,page),max);
  const part=all.slice(p*PAGE,(p+1)*PAGE);
  const e=new EmbedBuilder().setColor(0x8b0000)
    .setTitle("🚫 BLACK DRAGONS • "+(type==="clan"?"CLAN":"PLAYER")+" BLACKLIST")
    .setDescription(part.length?"**"+all.length+"** active "+(type==="clan"?"clan":"player")+" entries.":"There are currently **no active "+(type==="clan"?"clan":"player")+" blacklist entries.**")
    .setFooter({text:"Live list • Page "+(p+1)+"/"+(max+1)+" • Refresh to reload current data"}).setTimestamp();
  for(const x of part){
    const v=[
      x.discordId?"💬 **Discord:** <@"+x.discordId+">":null,
      x.externalId?"🆔 **"+(type==="clan"?"Clan":"Roblox")+" ID:** `"+x.externalId+"`":null,
      x.notes?"📝 **Notes:** "+String(x.notes).slice(0,500):null,
      "👮 **Added by:** <@"+x.addedBy+">",
      "📅 **Added:** <t:"+Math.floor((x.createdAt||Date.now())/1000)+":F>",
      "🔖 **Entry ID:** `"+x.id+"`"
    ].filter(Boolean).join("\\n");
    e.addFields({name:(type==="clan"?"🏴 ":"👤 ")+x.name,value:v,inline:false});
  }
  if(part.length===1&&part[0].profileImageUrl)e.setThumbnail(part[0].profileImageUrl);
  return e;
}
function listButtons(type,page,count){
  const max=Math.max(0,Math.ceil(count/PAGE)-1);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bl:page:"+type+":"+(page-1)).setLabel("PREVIOUS").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page<=0),
      new ButtonBuilder().setCustomId("bl:refresh:"+type+":"+page).setLabel("REFRESH").setEmoji("🔄").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bl:page:"+type+":"+(page+1)).setLabel("NEXT").setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page>=max)
    ),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bl:menu:"+type).setLabel("MANAGE").setEmoji("⚙️").setStyle(ButtonStyle.Secondary))
  ];
}
function image(a){return !!a&&((a.contentType||"").startsWith("image/")||/\\.(png|jpe?g|gif|webp)$/i.test(a.name||""));}

async function syncPublic(i,d,type){
  try{
    if(await blacklistPublisher.syncIfPublished(i.guild,d,type)){
      await saveData(d);
      return null;
    }
  }catch(error){
    console.error("❌ Public blacklist sync failed:",error);
    return error;
  }
  return null;
}
async function show(i,d,type,page,update){
  const all=entries(d,type);

  /*
   * Public/admin blacklist views are one embed per entry.
   * No pagination buttons: each blacklisted person/clan is its own card.
   */
  if(!all.length){
    const empty=new EmbedBuilder()
      .setColor(0x8b0000)
      .setTitle("🚫 BLACK DRAGONS • "+(type==="clan"?"CLAN":"PLAYER")+" BLACKLIST")
      .setDescription("There are currently **no active "+(type==="clan"?"clan":"player")+" blacklist entries.**")
      .setFooter({text:"BLACK DRAGONS • Blacklist"})
      .setTimestamp();

    if(update)await i.update({embeds:[empty],components:[]});
    else await i.reply({embeds:[empty],components:[]});
    return;
  }

  const embeds=all.map(entry=>blacklistPublisher.publicEmbed(entry,type));

  if(update){
    await i.update({embeds:embeds.slice(0,10),components:[]});
    for(let n=10;n<embeds.length;n+=10){
      await i.followUp({embeds:embeds.slice(n,n+10),components:[],ephemeral:true});
    }
    return;
  }

  await i.reply({
    embeds:embeds.slice(0,10),
    components:[],
    ephemeral:true
  });

  for(let n=10;n<embeds.length;n+=10){
    await i.followUp({
      embeds:embeds.slice(n,n+10),
      components:[],
      ephemeral:true
    });
  }
}
async function execute(i,c){
  if(!admin(i))return i.reply({content:"❌ Only **Administrators** can use the blacklist system.",ephemeral:true});
  const d=c.data,type=i.options.getString("type"),action=i.options.getString("action");
  if(!type||!action)return i.reply({embeds:[menu()],components:[menuButtons()]});
  if(action==="show")return show(i,d,type,0,false);
  const store=bl(d)[type==="clan"?"clans":"players"];
  if(action==="add"){
    const name=i.options.getString("name"),profile=i.options.getAttachment("profile");
    if(!name||!image(profile))return i.reply({content:"❌ Add requires **Name** and an image **Roblox Profile** attachment.",ephemeral:true});
    const now=Date.now(),e={id:id(type),type,name:name.trim(),profileImageUrl:profile.url,profileFileName:profile.name||"roblox-profile.png",discordId:i.options.getUser("discord")?.id||null,externalId:i.options.getString("external_id")?.trim()||null,notes:i.options.getString("notes")?.trim()||null,active:true,addedBy:i.user.id,createdAt:now,updatedAt:now,removedAt:null,removedBy:null};
    store[e.id]=e;history(d,e,"added",i.user.id);await saveData(d);
    const publishError=await syncPublic(i,d,type);
    const publishWarning=publishError?"\n\n⚠️ The blacklist was saved, but the public blacklist could not be updated: "+publishError.message:"";
    return i.reply({embeds:[new EmbedBuilder().setColor(0x8b0000).setTitle("🚫 "+(type==="clan"?"CLAN":"PLAYER")+" BLACKLISTED").setDescription("**"+e.name+"** has been added to the active blacklist."+publishWarning).setThumbnail(e.profileImageUrl).addFields({name:"🔖 Entry ID",value:"`"+e.id+"`",inline:true},{name:"💬 Discord",value:e.discordId?"<@"+e.discordId+">":"Not provided",inline:true},{name:"🆔 "+(type==="clan"?"Clan":"Roblox")+" ID",value:e.externalId?"`"+e.externalId+"`":"Not provided",inline:true},{name:"📝 Notes",value:e.notes||"None"}).setTimestamp()]});
  }
  const eid=i.options.getString("entry_id"),e=eid?store[eid]:null;
  if(!e)return i.reply({content:"❌ That blacklist entry ID was not found.",ephemeral:true});
  if(action==="remove"){
    if(e.active===false)return i.reply({content:"ℹ️ That blacklist entry is already removed.",ephemeral:true});
    e.active=false;e.removedAt=Date.now();e.removedBy=i.user.id;e.updatedAt=Date.now();history(d,e,"removed",i.user.id);await saveData(d);
    const publishError=await syncPublic(i,d,type);
    const publishWarning=publishError?"\n\n⚠️ The blacklist was saved, but the public blacklist could not be updated: "+publishError.message:"";
    return i.reply({embeds:[new EmbedBuilder().setColor(0x2b2d31).setTitle("🗑️ BLACKLIST ENTRY REMOVED").setDescription("**"+e.name+"** is no longer on the active blacklist."+publishWarning).addFields({name:"🔖 Entry ID",value:"`"+e.id+"`",inline:true},{name:"👮 Removed By",value:"<@"+i.user.id+">",inline:true}).setFooter({text:"History retained"}).setTimestamp()]});
  }
  if(action==="edit"){
    const changed=[],name=i.options.getString("name"),profile=i.options.getAttachment("profile"),discord=i.options.getUser("discord"),external=i.options.getString("external_id"),notes=i.options.getString("notes");
    if(name!==null){e.name=name.trim();changed.push("name");}
    if(profile){if(!image(profile))return i.reply({content:"❌ Roblox Profile must be an image.",ephemeral:true});e.profileImageUrl=profile.url;e.profileFileName=profile.name||"roblox-profile.png";changed.push("Roblox Profile");}
    if(discord){e.discordId=discord.id;changed.push("Discord");}
    if(external!==null){e.externalId=external.trim()||null;changed.push(type==="clan"?"Clan ID":"Roblox ID");}
    if(notes!==null){e.notes=notes.trim()||null;changed.push("notes");}
    if(!changed.length)return i.reply({content:"❌ No editable values were provided.",ephemeral:true});
    e.updatedAt=Date.now();history(d,e,"edited",i.user.id);await saveData(d);
    const publishError=await syncPublic(i,d,type);
    const publishWarning=publishError?"\n\n⚠️ The blacklist was saved, but the public blacklist could not be updated: "+publishError.message:"";
    return i.reply({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle("✏️ BLACKLIST ENTRY UPDATED").setDescription("**"+e.name+"** was updated."+publishWarning).addFields({name:"Changed",value:changed.join(", ")},{name:"🔖 Entry ID",value:"`"+e.id+"`",inline:true}).setThumbnail(e.profileImageUrl).setTimestamp()]});
  }
}
async function handleModal(i,c){
  if(!i.customId.startsWith("blrm:"))return false;
  if(!admin(i)){await i.reply({content:"❌ Only **Administrators** can use the blacklist system.",ephemeral:true});return true;}
  const type=i.customId.split(":")[1];
  const entryId=i.fields.getTextInputValue("entry_id").trim();
  const store=bl(c.data)[type==="clan"?"clans":"players"];
  const e=store[entryId];
  if(!e)return i.reply({content:"❌ That blacklist entry ID was not found.",ephemeral:true});
  if(e.active===false)return i.reply({content:"ℹ️ That blacklist entry is already removed.",ephemeral:true});
  await i.reply({
    content:"⚠️ Remove **"+e.name+"** from the active blacklist?",
    ephemeral:true,
    components:[new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("blconfirm:"+type+":"+entryId).setLabel("REMOVE").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("bl:cancel").setLabel("CANCEL").setStyle(ButtonStyle.Secondary)
    )]
  });
  return true;
}

async function handleButton(i,c){
  if(!i.customId.startsWith("bl:")&&!i.customId.startsWith("blconfirm:"))return false;
  if(!admin(i)){await i.reply({content:"❌ Only **Administrators** can use the blacklist system.",ephemeral:true});return true;}
  const p=i.customId.split(":"),a=p[0]==="blconfirm"?"confirmremove":p[1],type=p[0]==="blconfirm"?p[1]:p[2];
  if(a==="menu"&&!type){await i.update({embeds:[menu()],components:[menuButtons()]});return true;}
  if(a==="menu"&&type){await show(i,c.data,type,0,true);return true;}
  if(a==="back"){await i.update({embeds:[menu()],components:[menuButtons()]});return true;}
  if(a==="show"||a==="page"||a==="refresh"){await show(i,c.data,type,Number(p[3]||0),true);return true;}
  if(a==="removehelp"){
    const modal=new ModalBuilder().setCustomId("blrm:"+type).setTitle("Remove "+(type==="clan"?"Clan":"Player")+" Blacklist Entry");
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("entry_id").setLabel("Entry ID").setPlaceholder(type+"_...").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
    ));
    await i.showModal(modal);
    return true;
  }
  if(a==="addhelp"||a==="edithelp"){
    const x=a.replace("help","");
    await i.reply({content:"Use /blacklist with type:"+type+" action:"+x+(x==="add"?" and provide name + Roblox Profile.":" and provide entry_id."),ephemeral:true});
    return true;
  }
  if(a==="cancel"){
    await i.update({content:"❌ Cancelled.",components:[]});
    return true;
  }
  if(a==="confirmremove"){
    const entryId=p[3],store=bl(c.data)[type==="clan"?"clans":"players"],e=store[entryId];
    if(!e)return i.update({content:"❌ That blacklist entry no longer exists.",components:[]});
    if(e.active===false)return i.update({content:"ℹ️ That blacklist entry is already removed.",components:[]});
    e.active=false;e.removedAt=Date.now();e.removedBy=i.user.id;e.updatedAt=Date.now();
    history(c.data,e,"removed",i.user.id);await saveData(c.data);
    const publishError=await syncPublic(i,c.data,type);
    await i.update({content:publishError?"⚠️ **"+e.name+"** was removed and saved, but the public blacklist could not be updated: "+publishError.message:"🗑️ **"+e.name+"** was removed from the active blacklist. History retained.",components:[]});
    return true;
  }
  return false;
}
module.exports={
  name:"blacklist",
  data:new SlashCommandBuilder().setName("blacklist").setDescription("Manage the Black Dragons player and clan blacklist.").setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addStringOption(o=>o.setName("type").setDescription("Player or clan.").addChoices({name:"Player",value:"player"},{name:"Clan",value:"clan"}))
    .addStringOption(o=>o.setName("action").setDescription("Add, edit, remove or show.").addChoices({name:"Add",value:"add"},{name:"Edit",value:"edit"},{name:"Remove",value:"remove"},{name:"Show",value:"show"}))
    .addStringOption(o=>o.setName("name").setDescription("Roblox username or clan name.").setMaxLength(100))
    .addAttachmentOption(o=>o.setName("profile").setDescription("Roblox Profile image."))
    .addUserOption(o=>o.setName("discord").setDescription("Optional Discord account."))
    .addStringOption(o=>o.setName("external_id").setDescription("Optional Roblox ID or Clan ID.").setMaxLength(40))
    .addStringOption(o=>o.setName("notes").setDescription("Optional private notes.").setMaxLength(1000))
    .addStringOption(o=>o.setName("entry_id").setDescription("Entry ID for edit/remove.").setMaxLength(80)),
  execute,handleButton,handleModal
};
