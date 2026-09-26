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
function detailsChannel(c){return c?"< #"+c.name+" >\n**ID:** "+c.id+"\n**Type:** "+c.type:"Unknown";}
function when(t=Date.now()){return "<t:"+Math.floor(t/1000)+":F> • <t:"+Math.floor(t/1000)+":R>";}
function link(m){return m?.guildId&&m?.channelId&&m?.id?"https://discord.com/channels/"+m.guildId+"/"+m.channelId+"/"+m.id:null;}
function block(v){return "~~~\n"+clip(v,3300)+"\n~~~";}
function base(type,title,desc){return new EmbedBuilder().setColor(COLORS[type]||COLORS.general).setTitle((TITLES[type]||TITLES.general)+" • "+title).setDescription(desc||"").setTimestamp();}
async function send(guild,data,type,embed){const id=cfg(data).channels[type];if(!id)return false;try{const ch=await guild.channels.fetch(id);if(!ch?.isTextBased())return false;await ch.send({embeds:[embed]});return true;}catch(e){console.error("Logging "+type+" failed:",e);return false;}}
async function actor(guild,type,target){try{const a=await guild.fetchAuditLogs({type,limit:8});const e=a.entries.find(x=>Date.now()-x.createdTimestamp<10000&&(!target||String(x.target?.id||x.targetId)===String(target)));return e?.executor||null;}catch{return null;}}

function diff(oldText,newText){
  const a=String(oldText||"").match(/\s+|[A-Za-z0-9_]+|[^A-Za-z0-9_\s]/g)||[];
  const b=String(newText||"").match(/\s+|[A-Za-z0-9_]+|[^A-Za-z0-9_\s]/g)||[];
  const n=a.length,m=b.length;
  if(n*m>120000){return{old:"__"+clip(oldText,1800)+"__",next:"__"+clip(newText,1800)+"__"};}
  const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  let i=0,j=0,oldOut=[],newOut=[];
  while(i<n||j<m){
    if(i<n&&j<m&&a[i]===b[j]){oldOut.push(a[i]);newOut.push(b[j]);i++;j++;continue;}
    let ro=[],an=[];
    while(i<n||j<m){
      if(i<n&&j<m&&a[i]===b[j])break;
      if(j<m&&(i===n||dp[i][j+1]>=dp[i+1][j]))an.push(b[j++]);else if(i<n)ro.push(a[i++]);
    }
    if(ro.length)oldOut.push("__"+ro.join("")+"__");
    if(an.length)newOut.push("__"+an.join("")+"__");
  }
  return{old:oldOut.join("")||"*(empty)*",next:newOut.join("")||"*(empty)*"};
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
  if(oldM.content===newM.content&&oldM.attachments?.size===newM.attachments?.size)return;
  const d=diff(oldM.content,newM.content),e=base("message","Message Edited","👤 **Author**\n"+detailsUser(newM.author)+"\n\n📍 **Channel**\n"+detailsChannel(newM.channel))
    .addFields({name:"🕐 Edited",value:when()},{name:"⬅️ Previous",value:clip(d.old,1800)},{name:"➡️ Edited",value:clip(d.next,1800)},{name:"📎 Attachments",value:clip(attachmentText(newM),900)});
  const l=link(newM);if(l)e.addFields({name:"🔗 Message",value:"[Jump to message]("+l+")"});await send(newM.guild,data,"message",e);
}
async function messageDelete(m,data){
  if(!m.guild||m.author?.bot)return;
  const a=await actor(m.guild,AuditLogEvent.MessageDelete,m.author?.id),e=base("message","Message Deleted","👤 **Author**\n"+detailsUser(m.author)+"\n\n📍 **Channel**\n"+detailsChannel(m.channel))
    .addFields({name:"🕐 Deleted",value:when()},{name:"🛡️ Deleted By",value:a?detailsUser(a):"Unknown / unavailable"},{name:"📝 Original",value:block(m.content||"Not cached by the bot.")},{name:"📎 Attachments",value:clip(attachmentText(m),900)},{name:"🆔 Message ID",value:m.id});
  await send(m.guild,data,"message",e);
}
async function bulkDelete(messages,channel,data){
  const list=[...messages.values()].filter(m=>!m.author?.bot);if(!list.length)return;
  const lines=list.map(m=>"<@"+(m.author?.id||"0")+"> • "+m.id+"\n"+clip(m.content||"(no cached text)",300));
  for(let i=0;i<lines.length;i+=8){const part=lines.slice(i,i+8).join("\n\n");const e=base("message","Bulk Message Deletion","📍 **Channel:** "+detailsChannel(channel)+"\n🗑️ **Count:** "+list.length+"\n📦 **Part:** "+(Math.floor(i/8)+1))
    .addFields({name:"Deleted Messages",value:clip(part,3900)});await send(channel.guild,data,"message",e);}
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
  const c=cfg(data);let cat=c.categoryId?guild.channels.cache.get(c.categoryId):null;if(!cat||cat.type!==ChannelType.GuildCategory)cat=guild.channels.cache.find(x=>x.type===ChannelType.GuildCategory&&x.name==="BLACK DRAGONS • LOGS");if(!cat)cat=await guild.channels.create({name:"BLACK DRAGONS • LOGS",type:ChannelType.GuildCategory});c.categoryId=cat.id;
  for(const [type,name] of Object.entries(CHANNELS)){let ch=c.channels[type]?guild.channels.cache.get(c.channels[type]):null;if(!ch)ch=guild.channels.cache.find(x=>x.parentId===cat.id&&x.name===name);if(!ch)ch=await guild.channels.create({name,type:ChannelType.GuildText,parent:cat.id,topic:(TITLES[type]||type)+" • BLACK DRAGONS detailed audit log"});c.channels[type]=ch.id;}return c;
}
module.exports={CHANNELS,TITLES,ensure,send,messageCreate,messageUpdate,messageDelete,bulkDelete,purgeLog,markPurge,wasPurged,memberAdd,memberRemove,memberUpdate,ban,roleCreate,roleDelete,roleUpdate,voice,channelCreate,channelDelete,channelUpdate,guildUpdate,inviteCreate,inviteDelete,inviteUse,thread,command,error};
