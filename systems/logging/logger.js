const { EmbedBuilder, ChannelType, AuditLogEvent, PermissionsBitField } = require("discord.js");

const CHANNELS = {
  message:"message-logs", moderation:"moderation-logs", roles:"role-logs",
  voice:"vc-logs", users:"user-logs", invites:"invite-logs", server:"server-logs",
  channels:"channel-logs", bot:"bot-logs", general:"general-logs"
};
const COLORS = {message:0x5865f2,moderation:0xed4245,roles:0xf1c40f,voice:0x9b59b6,users:0x2ecc71,invites:0x3498db,server:0xe67e22,channels:0x95a5a6,bot:0x7289da,general:0x607d8b};
const TITLES = {message:"💬 MESSAGE",moderation:"🛡️ MODERATION",roles:"🎭 ROLE",voice:"🔊 VOICE",users:"👤 USER",invites:"📨 INVITE",server:"🏠 SERVER",channels:"📺 CHANNEL",bot:"🤖 BOT",general:"📋 GENERAL"};
const purgeIds = new Set();

function cfg(data){data.config ||= {};data.config.logs ||= {categoryId:null,channels:{}};data.config.logs.channels ||= {};return data.config.logs;}
function clip(v,n=900){const s=String(v ?? "");return !s?"*(empty)*":s.length>n?s.slice(0,n-20)+"\n… truncated":s;}
function permissionNames(bits){ const out=[]; for(const [name,flag] of Object.entries(PermissionsBitField.Flags)){ try{if((BigInt(bits)&BigInt(flag))===BigInt(flag))out.push(name);}catch{} } return out.join(", ")||"None"; }
function detailsUser(u){return u?"<@"+u.id+">\n**Tag:** "+(u.tag||u.username)+"\n**ID:** "+u.id+"\n**Bot:** "+(u.bot?"Yes":"No"):"Unknown";}
function detailsChannel(c){return c?"<#"+c.id+"> **"+c.name+"**\n**ID:** "+c.id+"\n**Type:** "+c.type:"Unknown";}
function when(t=Date.now()){return "<t:"+Math.floor(t/1000)+":F> • <t:"+Math.floor(t/1000)+":R>";}
function link(m){return m?.guildId&&m?.channelId&&m?.id?"https://discord.com/channels/"+m.guildId+"/"+m.channelId+"/"+m.id:null;}
function block(v){
  const raw=String(v??"");
  const safe=clip(raw,950).replace(/```/g,"``\\u200b`");
  return "```text\n"+safe+"\n```";
}
function base(type,title,desc){return new EmbedBuilder().setColor(COLORS[type]||COLORS.general).setTitle((TITLES[type]||TITLES.general)+" • "+title).setDescription(desc||"").setTimestamp();}
async function send(guild,data,type,embed){
  if(!guild?.channels) return false;
  const c=cfg(data);
  const expectedName=CHANNELS[type];
  let ch=null;

  try {
    const configuredId=c.channels[type];

    if(configuredId) {
      ch=guild.channels.cache.get(configuredId)||null;

      // A stale ID may belong to another guild. Never blindly fetch it.
      if(!ch) {
        try {
          const fetched=await guild.channels.fetch(configuredId);
          if(fetched?.guildId===guild.id) ch=fetched;
        } catch {}
      }
    }

    // Self-heal stale/missing IDs by finding the expected channel
    // in this guild's logging category.
    if(!ch && expectedName) {
      const categoryId=c.categoryId;
      ch=guild.channels.cache.find(channel =>
        channel.guildId===guild.id &&
        channel.type===ChannelType.GuildText &&
        channel.name===expectedName &&
        (!categoryId || channel.parentId===categoryId)
      )||null;

      if(ch) c.channels[type]=ch.id;
    }

    if(!ch?.isTextBased() || ch.guildId!==guild.id) return false;

    if(embed?.setFooter){
      const icon=guild.client?.user?.displayAvatarURL?.({extension:"png",size:64})||undefined;
      embed.setFooter({text:"BLACK DRAGONS • Audit Logs",iconURL:icon});
    }
    await ch.send({embeds:[embed]});
    return true;
  } catch(e) {
    // Logging must never create repeated unhandled errors itself.
    console.error("Logging "+type+" failed:",e);
    return false;
  }
}
async function actor(guild,type,target){try{const a=await guild.fetchAuditLogs({type,limit:8});const e=a.entries.find(x=>Date.now()-x.createdTimestamp<10000&&(!target||String(x.target?.id||x.targetId)===String(target)));return e?.executor||null;}catch{return null;}}

function tokenize(text){
  return String(text??"").match(/\s+|[\p{L}\p{N}_]+|[^\p{L}\p{N}\s]/gu)||[];
}

function underline(text){
  const s=String(text??"");
  if(!s)return "";
  return "__"+s.replace(/\\/g,"\\\\").replace(/_/g,"\\_")+"__";
}

function prefixSuffixDiff(oldText,newText){
  const a=String(oldText??"");
  const b=String(newText??"");
  let start=0;
  while(start<a.length&&start<b.length&&a[start]===b[start])start++;
  let ai=a.length-1,bi=b.length-1;
  while(ai>=start&&bi>=start&&a[ai]===b[bi]){ai--;bi--;}
  const oldMiddle=a.slice(start,ai+1);
  const newMiddle=b.slice(start,bi+1);
  const oldOut=a.slice(0,start)+(oldMiddle?underline(oldMiddle):"")+a.slice(ai+1);
  const newOut=b.slice(0,start)+(newMiddle?underline(newMiddle):"")+b.slice(bi+1);
  return {
    old:oldOut||"*(empty)*",
    next:newOut||"*(empty)*"
  };
}

function diff(oldText,newText){
  const aAll=tokenize(oldText);
  const bAll=tokenize(newText);

  let left=0;
  while(left<aAll.length&&left<bAll.length&&aAll[left]===bAll[left])left++;

  let ar=aAll.length-1,br=bAll.length-1;
  while(ar>=left&&br>=left&&aAll[ar]===bAll[br]){ar--;br--;}

  const prefix=aAll.slice(0,left);
  const suffix=aAll.slice(ar+1);
  const a=aAll.slice(left,ar+1);
  const b=bAll.slice(left,br+1);

  if(!a.length&&!b.length){
    return {old:String(oldText||"")||"*(empty)*",next:String(newText||"")||"*(empty)*"};
  }

  if(a.length*b.length>900000){
    return prefixSuffixDiff(oldText,newText);
  }

  const n=a.length,m=b.length;
  const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--){
    for(let j=m-1;j>=0;j--){
      dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
    }
  }

  let i=0,j=0,oldOut=[],newOut=[];
  while(i<n||j<m){
    if(i<n&&j<m&&a[i]===b[j]){
      oldOut.push(a[i]);
      newOut.push(b[j]);
      i++;j++;
      continue;
    }

    const removed=[],added=[];
    while(i<n||j<m){
      if(i<n&&j<m&&a[i]===b[j])break;
      if(j<m&&(i===n||dp[i][j+1]>=dp[i+1][j]))added.push(b[j++]);
      else if(i<n)removed.push(a[i++]);
    }

    if(removed.length)oldOut.push(underline(removed.join("")));
    if(added.length)newOut.push(underline(added.join("")));
  }

  const oldMiddle=oldOut.join("");
  const newMiddle=newOut.join("");
  const commonEdges=prefix.join("");
  const commonSuffix=suffix.join("");

  return {
    old:(commonEdges+oldMiddle+commonSuffix)||"*(empty)*",
    next:(commonEdges+newMiddle+commonSuffix)||"*(empty)*"
  };
}

function attachmentText(m){const a=[...(m?.attachments?.values?.()||[])];return a.length?a.map(x=>x.name+": "+x.url).join("\n"):"None";}

async function messageCreate(m,data){
  if(!m.guild||m.author?.bot)return;
  const e=base("message","Message Created","👤 **Author**\n"+detailsUser(m.author)+"\n\n📍 **Channel**\n"+detailsChannel(m.channel))
    .addFields({name:"🕐 Time",value:when(m.createdTimestamp)},{name:"📝 Content",value:block(m.content||"(no text content)")},{name:"📎 Attachments",value:clip(attachmentText(m),900)});
  const l=link(m);if(l)e.addFields({name:"🔗 Message",value:"[Jump to message]("+l+")"});
  await send(m.guild,data,"message",e);
}
async function messageUpdate(oldM,newM,data){
  if(!newM.guild||newM.author?.bot)return;
  const contentChanged=oldM.content!==newM.content;
  const attachmentsChanged=oldM.attachments?.size!==newM.attachments?.size;
  if(!contentChanged&&!attachmentsChanged)return;

  const d=diff(oldM.content,newM.content);
  const avatar=newM.author?.displayAvatarURL?.({extension:"png",size:128})||null;
  const e=base("message","Message Edited","✏️ **A message was edited.**\nOnly the text that changed is underlined.")
    .addFields(
      {name:"👤 Author",value:detailsUser(newM.author),inline:true},
      {name:"📍 Channel",value:detailsChannel(newM.channel),inline:true},
      {name:"🕐 Edited",value:when(),inline:true},
      {name:"⬅️ Before",value:clip(d.old,1000)},
      {name:"➡️ After",value:clip(d.next,1000)},
      {name:"📎 Attachments",value:clip(attachmentText(newM),900),inline:true},
      {name:"🆔 Message ID",value:newM.id,inline:true}
    );

  if(avatar)e.setThumbnail(avatar);
  const l=link(newM);
  if(l)e.addFields({name:"🔗 Jump to Message",value:"[Open the edited message]("+l+")"});
  await send(newM.guild,data,"message",e);
}
async function messageDelete(m,data){
  if(!m.guild||m.author?.bot)return;

  const a=await actor(m.guild,AuditLogEvent.MessageDelete,m.author?.id);
  const avatar=m.author?.displayAvatarURL?.({extension:"png",size:128})||null;
  const cached=Boolean(m.content||m.attachments?.size);
  const e=base("message","Message Deleted","🗑️ **A message was deleted.**\nThe original content is shown below without strikethrough styling.")
    .addFields(
      {name:"👤 Author",value:detailsUser(m.author),inline:true},
      {name:"📍 Channel",value:detailsChannel(m.channel),inline:true},
      {name:"🕐 Deleted",value:when(),inline:true},
      {name:"🛡️ Deleted By",value:a?detailsUser(a):"Unknown / unavailable",inline:true},
      {name:"📝 Original Message",value:cached?block(m.content||"(attachment-only message)"):"*(Message content was not cached by the bot.)*"},
      {name:"📎 Attachments",value:clip(attachmentText(m),900),inline:true},
      {name:"🆔 Message ID",value:m.id,inline:true}
    );

  if(avatar)e.setThumbnail(avatar);
  const l=link(m);
  if(l)e.addFields({name:"🔗 Message Link",value:"[Open the message location]("+l+")"});
  await send(m.guild,data,"message",e);
}
async function purgeLog(guild,data,channel,mod,messages){
  const list=[...messages.values()].filter(m=>!m.author?.bot);list.forEach(m=>purgeIds.add(m.id));setTimeout(()=>list.forEach(m=>purgeIds.delete(m.id)),15000);
  const lines=list.map(m=>{const l=link(m);return"<@"+(m.author?.id||"0")+"> • "+m.id+(l?" • [Jump]("+l+")":"")+"\n"+clip(m.content||"(no text)",450);});
  if(!lines.length)lines.push("No cached message records were available.");
  for(let i=0;i<lines.length;i+=7){const e=base("message",i?"🧹 PURGE • Continued":"🧹 PURGE","🛡️ **Moderator:** "+detailsUser(mod)+"\n📍 **Channel:** "+detailsChannel(channel)+"\n🗑️ **Deleted:** "+list.length+"\n📦 **Part:** "+(Math.floor(i/7)+1))
    .addFields({name:"Deleted Messages",value:clip(lines.slice(i,i+7).join("\n\n"),3900)});await send(guild,data,"message",e);}
}
function markPurge(id){purgeIds.add(id);setTimeout(()=>purgeIds.delete(id),20000);}
function wasPurged(id){return purgeIds.has(id);}

async function memberAdd(m,data){const e=base("users","Member Joined","👤 **Member**\n"+detailsUser(m.user)).addFields({name:"🕐 Joined",value:when(m.joinedTimestamp||Date.now())},{name:"📅 Account Created",value:when(m.user.createdTimestamp)},{name:"👥 Server Members",value:String(m.guild.memberCount)});await send(m.guild,data,"users",e);}
async function memberRemove(m,data){const roles=m.roles?.cache?.filter(r=>r.id!==m.guild.id).map(r=>r.toString()).join(", ")||"None";const e=base("users","Member Left","👤 **Member**\n"+detailsUser(m.user)).addFields({name:"🕐 Left",value:when()},{name:"📅 Joined",value:m.joinedTimestamp?when(m.joinedTimestamp):"Unknown"},{name:"🎭 Roles",value:clip(roles)});await send(m.guild,data,"users",e);}
async function memberUpdate(o,n,data){
  const c=[];if(o.nickname!==n.nickname){const d=diff(o.nickname||"",n.nickname||"");c.push("**Nickname**\nPrevious: "+d.old+"\nNew: "+d.next);}
  const or=new Set(o.roles.cache.keys()),nr=new Set(n.roles.cache.keys());const add=[...nr].filter(x=>!or.has(x)).map(x=>n.guild.roles.cache.get(x)).filter(Boolean),rem=[...or].filter(x=>!nr.has(x)).map(x=>n.guild.roles.cache.get(x)).filter(Boolean);
  if(add.length)c.push("**Roles Added:** "+add.map(x=>x.toString()).join(", "));if(rem.length)c.push("**Roles Removed:** "+rem.map(x=>x.toString()).join(", "));if(!c.length)return;
  const a=await actor(n.guild,AuditLogEvent.MemberRoleUpdate,n.id),e=base("roles","Member Updated","👤 **Member**\n"+detailsUser(n.user)).addFields({name:"🕐 Time",value:when()},{name:"🔎 Changes",value:clip(c.join("\n\n"),3800)},{name:"🛡️ Changed By",value:a?detailsUser(a):"Self / Bot / Unknown"});await send(n.guild,data,"roles",e);
}
async function ban(b,data,added){const a=await actor(b.guild,added?AuditLogEvent.MemberBanAdd:AuditLogEvent.MemberBanRemove,b.user.id),e=base("moderation",added?"Member Banned":"Member Unbanned","👤 **User**\n"+detailsUser(b.user)).addFields({name:"🕐 Time",value:when()},{name:"🛡️ Moderator",value:a?detailsUser(a):"Unknown / unavailable"},{name:"📝 Reason",value:b.reason||"No reason supplied / unavailable"});await send(b.guild,data,"moderation",e);}
async function roleCreate(r,data){const a=await actor(r.guild,AuditLogEvent.RoleCreate,r.id),e=base("roles","Role Created","🎭 **Role:** "+r).addFields({name:"Name",value:r.name,inline:true},{name:"ID",value:r.id,inline:true},{name:"Color",value:r.hexColor,inline:true},{name:"Position",value:String(r.position),inline:true},{name:"Mentionable",value:r.mentionable?"Yes":"No",inline:true},{name:"🛡️ Created By",value:a?detailsUser(a):"Unknown"});await send(r.guild,data,"roles",e);}
async function roleDelete(r,data){const a=await actor(r.guild,AuditLogEvent.RoleDelete,r.id),e=base("roles","Role Deleted","🎭 **Role:** "+r.name).addFields({name:"ID",value:r.id,inline:true},{name:"Color",value:r.hexColor,inline:true},{name:"Position",value:String(r.position),inline:true},{name:"🛡️ Deleted By",value:a?detailsUser(a):"Unknown"});await send(r.guild,data,"roles",e);}
async function roleUpdate(o,n,data){const c=[];if(o.name!==n.name){const d=diff(o.name,n.name);c.push("**Name**\nPrevious: "+d.old+"\nNew: "+d.next);}if(o.hexColor!==n.hexColor)c.push("**Color:** "+o.hexColor+" → "+n.hexColor);if(o.position!==n.position)c.push("**Position:** "+o.position+" → "+n.position);if(o.permissions.bitfield!==n.permissions.bitfield)c.push("**Permissions:**\nPrevious: "+permissionNames(o.permissions.bitfield)+"\nNew: "+permissionNames(n.permissions.bitfield));if(o.mentionable!==n.mentionable)c.push("**Mentionable:** "+(o.mentionable?"Yes":"No")+" → "+(n.mentionable?"Yes":"No"));if(!c.length)return;const a=await actor(n.guild,AuditLogEvent.RoleUpdate,n.id),e=base("roles","Role Updated","🎭 **Role:** "+n).addFields({name:"🔎 Changes",value:clip(c.join("\n\n"),3800)},{name:"🛡️ Changed By",value:a?detailsUser(a):"Unknown"});await send(n.guild,data,"roles",e);}
async function voice(o,n,data){
  if(!n.guild)return;const c=[];let title="Voice State Changed";if(!o.channelId&&n.channelId){title="Voice Joined";c.push("**Channel:** "+n.channel);}else if(o.channelId&&!n.channelId){title="Voice Left";c.push("**Channel:** "+(o.channel||"Unknown"));}else if(o.channelId!==n.channelId){title="Voice Channel Moved";c.push("**From:** "+(o.channel||"Unknown")+"\n**To:** "+(n.channel||"Unknown"));}
  if(o.serverMute!==n.serverMute)c.push("**Server Mute:** "+(o.serverMute?"ON":"OFF")+" → "+(n.serverMute?"ON":"OFF"));if(o.serverDeaf!==n.serverDeaf)c.push("**Server Deaf:** "+(o.serverDeaf?"ON":"OFF")+" → "+(n.serverDeaf?"ON":"OFF"));if(o.selfMute!==n.selfMute)c.push("**Self Mute:** "+(o.selfMute?"ON":"OFF")+" → "+(n.selfMute?"ON":"OFF"));if(o.selfDeaf!==n.selfDeaf)c.push("**Self Deaf:** "+(o.selfDeaf?"ON":"OFF")+" → "+(n.selfDeaf?"ON":"OFF"));if(o.streaming!==n.streaming)c.push("**Streaming:** "+(o.streaming?"ON":"OFF")+" → "+(n.streaming?"ON":"OFF"));if(o.selfVideo!==n.selfVideo)c.push("**Camera:** "+(o.selfVideo?"ON":"OFF")+" → "+(n.selfVideo?"ON":"OFF"));if(!c.length)return;const a=o.channelId!==n.channelId?await actor(n.guild,AuditLogEvent.MemberMove,n.id):null;const e=base("voice",title,"👤 **User**\n"+detailsUser(n.member?.user||o.member?.user)).addFields({name:"🕐 Time",value:when()},{name:"🔎 Details",value:clip(c.join("\n"),3800)},{name:"🛡️ Changed By",value:a?detailsUser(a):"User / Unknown"});await send(n.guild,data,"voice",e);
}
async function channelCreate(ch,data){if(!ch.guild)return;const a=await actor(ch.guild,AuditLogEvent.ChannelCreate,ch.id),e=base("channels","Channel Created","📺 **Channel:** "+ch).addFields({name:"Name",value:ch.name,inline:true},{name:"ID",value:ch.id,inline:true},{name:"Type",value:String(ch.type),inline:true},{name:"Category",value:ch.parent?ch.parent.toString():"None"},{name:"🛡️ Created By",value:a?detailsUser(a):"Unknown"});await send(ch.guild,data,"channels",e);}
async function channelDelete(ch,data){if(!ch.guild)return;const a=await actor(ch.guild,AuditLogEvent.ChannelDelete,ch.id),e=base("channels","Channel Deleted","📺 **Channel:** #"+ch.name).addFields({name:"ID",value:ch.id,inline:true},{name:"Type",value:String(ch.type),inline:true},{name:"🛡️ Deleted By",value:a?detailsUser(a):"Unknown"});await send(ch.guild,data,"channels",e);}
async function channelUpdate(o,n,data){if(!n.guild)return;const c=[];if(o.name!==n.name)c.push("**Name:** "+o.name+" → "+n.name);if(o.topic!==n.topic){const d=diff(o.topic||"",n.topic||"");c.push("**Topic**\nPrevious: "+d.old+"\nNew: "+d.next);}if(o.parentId!==n.parentId)c.push("**Category:** "+(o.parent?.toString()||"None")+" → "+(n.parent?.toString()||"None"));if(o.rateLimitPerUser!==n.rateLimitPerUser)c.push("**Slowmode:** "+o.rateLimitPerUser+"s → "+n.rateLimitPerUser+"s");if(o.permissionOverwrites?.cache?.size!==n.permissionOverwrites?.cache?.size || o.permissionOverwrites?.cache?.some((x,id)=>{const y=n.permissionOverwrites.cache.get(id);return !y||x.allow.bitfield!==y.allow.bitfield||x.deny.bitfield!==y.deny.bitfield;})) { const rows=[]; for(const [id,x] of n.permissionOverwrites.cache){const y=o.permissionOverwrites?.cache?.get(id); if(!y||x.allow.bitfield!==y.allow.bitfield||x.deny.bitfield!==y.deny.bitfield) rows.push("**Overwrite "+id+"**\nAllow: "+permissionNames(x.allow.bitfield)+"\nDeny: "+permissionNames(x.deny.bitfield));} c.push("**Permission Overwrites**\n"+clip(rows.join("\n\n"),1800)); }if(!c.length)return;const a=await actor(n.guild,AuditLogEvent.ChannelUpdate,n.id),e=base("channels","Channel Updated","📺 **Channel:** "+n).addFields({name:"🔎 Changes",value:clip(c.join("\n\n"),3800)},{name:"🛡️ Changed By",value:a?detailsUser(a):"Unknown"});await send(n.guild,data,"channels",e);}
async function guildUpdate(o,n,data){const c=[];if(o.name!==n.name)c.push("**Name:** "+o.name+" → "+n.name);if(o.description!==n.description){const d=diff(o.description||"",n.description||"");c.push("**Description**\nPrevious: "+d.old+"\nNew: "+d.next);}if(o.icon!==n.icon)c.push("**Icon:** "+(o.icon?"Changed/removed":"None")+" → "+(n.icon?"Changed":"None"));if(!c.length)return;const a=await actor(n,AuditLogEvent.GuildUpdate,n.id),e=base("server","Server Updated","🏠 **"+n.name+"**").addFields({name:"🔎 Changes",value:clip(c.join("\n\n"),3800)},{name:"🛡️ Changed By",value:a?detailsUser(a):"Unknown"});await send(n,data,"server",e);}
async function inviteCreate(i,data){const e=base("invites","Invite Created","📨 **Code:** "+i.code).addFields({name:"👤 Creator",value:i.inviter?detailsUser(i.inviter):"Unknown"},{name:"📍 Channel",value:i.channel?detailsChannel(i.channel):"Unknown"},{name:"🔢 Max Uses",value:String(i.maxUses??"Unlimited"),inline:true},{name:"⏳ Max Age",value:i.maxAge?String(i.maxAge)+"s":"Never",inline:true},{name:"🔗 Invite",value:"https://discord.gg/"+i.code});await send(i.guild,data,"invites",e);}
async function inviteUse(guild,data,member,invite){const e=base("invites","Invite Used","📨 **Invite:** "+invite.code).addFields({name:"👤 Member",value:detailsUser(member.user)},{name:"👤 Creator",value:invite.inviter?detailsUser(invite.inviter):"Unknown"},{name:"📍 Channel",value:invite.channel?detailsChannel(invite.channel):"Unknown"},{name:"🔢 Uses",value:String(invite.uses??"Unknown")},{name:"🕐 Time",value:when()},{name:"🔗 Invite",value:"https://discord.gg/"+invite.code});await send(guild,data,"invites",e);}
async function inviteDelete(i,data){const e=base("invites","Invite Deleted","📨 **Code:** "+i.code).addFields({name:"📍 Channel",value:i.channel?detailsChannel(i.channel):"Unknown"},{name:"🔗 Invite","value":"https://discord.gg/"+i.code});await send(i.guild,data,"invites",e);}
async function thread(action,t,data){if(!t.guild)return;const ty=action==="created"?AuditLogEvent.ThreadCreate:action==="deleted"?AuditLogEvent.ThreadDelete:AuditLogEvent.ThreadUpdate,a=await actor(t.guild,ty,t.id),e=base("channels","Thread "+action,"🧵 **"+t.name+"**").addFields({name:"ID",value:t.id},{name:"Parent",value:t.parent?t.parent.toString():"Unknown"},{name:"🛡️ Actor",value:a?detailsUser(a):"Unknown"});await send(t.guild,data,"channels",e);}
async function command(i,data){if(!i.guild)return;const e=base("bot","Slash Command Used","⚙️ **/"+i.commandName+"**").addFields({name:"👤 User",value:detailsUser(i.user)},{name:"📍 Channel",value:detailsChannel(i.channel)},{name:"🕐 Time",value:when()},{name:"🆔 Interaction ID",value:i.id});await send(i.guild,data,"bot",e);}
async function error(guild,data,err,context){if(!guild)return;const e=base("bot","Bot Error","⚠️ **Context:** "+context).addFields({name:"🕐 Time",value:when()},{name:"Error",value:block(err?.stack||err?.message||err)});await send(guild,data,"bot",e);}
async function ensure(guild,data){
  if(!guild?.channels) throw new Error("Guild channels are unavailable.");

  const c=cfg(data);

  // IMPORTANT:
  // A channel selected in /setup is authoritative. It does NOT have to be
  // inside BLACK DRAGONS • LOGS and it does NOT have to use our default name.
  // The old code rejected such channels and silently created replacements.
  let cat=null;

  if(c.categoryId){
    cat=guild.channels.cache.get(c.categoryId)||null;
    if(!cat){
      try{
        const fetched=await guild.channels.fetch(c.categoryId);
        if(fetched?.guildId===guild.id) cat=fetched;
      }catch{}
    }
  }

  // Only recover/create the logging category when we actually need a
  // fallback channel. Configured channels themselves never depend on it.
  if(!cat||cat.type!==ChannelType.GuildCategory){
    cat=guild.channels.cache.find(
      x=>x.guildId===guild.id &&
         x.type===ChannelType.GuildCategory &&
         x.name==="BLACK DRAGONS • LOGS"
    )||null;
  }

  for(const [type,name] of Object.entries(CHANNELS)){
    const configuredId=c.channels[type];

    // A configured channel is the user's explicit choice.
    if(configuredId){
      let ch=guild.channels.cache.get(configuredId)||null;

      if(!ch){
        try{
          const fetched=await guild.channels.fetch(configuredId);
          if(fetched?.guildId===guild.id) ch=fetched;
        }catch{}
      }

      if(ch && ch.type===ChannelType.GuildText && ch.guildId===guild.id){
        // Keep it exactly where the administrator selected it.
        continue;
      }

      // The configured channel was deleted/invalid. Try to recover a channel
      // with our canonical name anywhere in this guild before creating one.
      ch=guild.channels.cache.find(
        x=>x.guildId===guild.id &&
           x.type===ChannelType.GuildText &&
           x.name===name
      )||null;

      if(ch){
        c.channels[type]=ch.id;
        continue;
      }

      if(!cat){
        cat=guild.channels.cache.find(
          x=>x.guildId===guild.id &&
             x.type===ChannelType.GuildCategory &&
             x.name==="BLACK DRAGONS • LOGS"
        )||null;
      }

      if(!cat){
        cat=await guild.channels.create({
          name:"BLACK DRAGONS • LOGS",
          type:ChannelType.GuildCategory
        });
      }

      const replacement=await guild.channels.create({
        name,
        type:ChannelType.GuildText,
        parent:cat.id,
        topic:(TITLES[type]||type)+" • BLACK DRAGONS detailed audit log"
      });
      c.channels[type]=replacement.id;
      continue;
    }

    // Do NOT manufacture channels for settings the administrator has not
    // selected. Unconfigured logging categories simply remain disabled.
  }

  if(cat) c.categoryId=cat.id;

  return c;
}
module.exports={CHANNELS,TITLES,ensure,send,messageCreate,messageUpdate,messageDelete,purgeLog,markPurge,wasPurged,memberAdd,memberRemove,memberUpdate,ban,roleCreate,roleDelete,roleUpdate,voice,channelCreate,channelDelete,channelUpdate,guildUpdate,inviteCreate,inviteDelete,inviteUse,thread,command,error};
