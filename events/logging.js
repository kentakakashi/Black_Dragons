const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const log = require("../systems/logging/logger");

module.exports = function registerLogging(client) {
  const run = (name, fn) => fn().catch(e => console.error("❌ Logging "+name+" failed:", e));

  client.on("messageCreate", m => run("messageCreate",()=>log.messageCreate(m,client.appData)));
  client.on("messageUpdate", (o,n) => run("messageUpdate",()=>log.messageUpdate(o,n,client.appData)));
  client.on("messageDelete", m => { if (!log.wasPurged(m.id)) run("messageDelete",()=>log.messageDelete(m,client.appData)); });
  client.on("messageDeleteBulk", (messages,ch) => run("messageDeleteBulk",()=>log.bulkDelete(messages,ch,client.appData)));

  client.on("guildMemberAdd", m => run("memberAdd",()=>log.memberAdd(m,client.appData)));
  client.on("guildMemberRemove", async m => {
    try {
      const a = await m.guild.fetchAuditLogs({type:AuditLogEvent.MemberKick,limit:5});
      const entry = a.entries.find(x => Date.now()-x.createdTimestamp < 10000 && String(x.target?.id||x.targetId) === String(m.id));
      if (entry) {
        const e = new EmbedBuilder().setColor(0xed4245).setTitle("🛡️ MODERATION • Member Kicked")
          .setDescription("👤 **User**\n"+(m.user ? "<@"+m.user.id+">\n**Tag:** "+m.user.tag+"\n**ID:** "+m.id : "Unknown"))
          .addFields(
            {name:"🛡️ Moderator",value:entry.executor ? "<@"+entry.executor.id+">\n"+entry.executor.tag : "Unknown"},
            {name:"📝 Reason",value:entry.reason || "No reason supplied / unavailable"},
            {name:"🕐 Time",value:"<t:"+Math.floor(Date.now()/1000)+":F>"}
          ).setTimestamp();
        await log.send(m.guild,client.appData,"moderation",e);
      }
    } catch {}
    run("memberRemove",()=>log.memberRemove(m,client.appData));
  });

  client.on("guildMemberUpdate", (o,n) => {
    run("memberUpdate",()=>log.memberUpdate(o,n,client.appData));
    if (o.communicationDisabledUntilTimestamp !== n.communicationDisabledUntilTimestamp) {
      const e = new EmbedBuilder().setColor(0xed4245).setTitle("🛡️ MODERATION • Timeout Updated")
        .setDescription("👤 **User**\n<@"+n.id+">\n**ID:** "+n.id)
        .addFields(
          {name:"🕐 Time",value:"<t:"+Math.floor(Date.now()/1000)+":F>"},
          {name:"⏱️ Previous",value:o.communicationDisabledUntilTimestamp ? "<t:"+Math.floor(o.communicationDisabledUntilTimestamp/1000)+":F>" : "No timeout"},
          {name:"⏱️ New",value:n.communicationDisabledUntilTimestamp ? "<t:"+Math.floor(n.communicationDisabledUntilTimestamp/1000)+":F>" : "Timeout removed"}
        ).setTimestamp();
      run("timeout",()=>log.send(n.guild,client.appData,"moderation",e));
    }
  });

  client.on("guildBanAdd", b => run("ban",()=>log.ban(b,client.appData,true)));
  client.on("guildBanRemove", b => run("unban",()=>log.ban(b,client.appData,false)));

  client.on("roleCreate", r => run("roleCreate",()=>log.roleCreate(r,client.appData)));
  client.on("roleDelete", r => run("roleDelete",()=>log.roleDelete(r,client.appData)));
  client.on("roleUpdate", (o,n) => run("roleUpdate",()=>log.roleUpdate(o,n,client.appData)));

  client.on("voiceStateUpdate", (o,n) => run("voiceStateUpdate",()=>log.voice(o,n,client.appData)));

  client.on("channelCreate", c => run("channelCreate",()=>log.channelCreate(c,client.appData)));
  client.on("channelDelete", c => run("channelDelete",()=>log.channelDelete(c,client.appData)));
  client.on("channelUpdate", (o,n) => run("channelUpdate",()=>log.channelUpdate(o,n,client.appData)));
  client.on("threadCreate", t => run("threadCreate",()=>log.thread("created",t,client.appData)));
  client.on("threadUpdate", (o,n) => run("threadUpdate",()=>log.thread("updated",n,client.appData)));
  client.on("threadDelete", t => run("threadDelete",()=>log.thread("deleted",t,client.appData)));

  client.on("guildUpdate", (o,n) => run("guildUpdate",()=>log.guildUpdate(o,n,client.appData)));
  client.on("inviteCreate", i => run("inviteCreate",()=>log.inviteCreate(i,client.appData)));
  client.on("inviteDelete", i => run("inviteDelete",()=>log.inviteDelete(i,client.appData)));

  client.on("interactionCreate", i => {
    if (i.isChatInputCommand()) run("command",()=>log.command(i,client.appData));
  });
  client.on("userUpdate", (o,n) => {
    if (o.username===n.username && o.avatar===n.avatar && o.globalName===n.globalName) return;
    for (const guild of client.guilds.cache.values()) {
      if (!guild.members.cache.has(n.id)) continue;
      const e = new EmbedBuilder().setColor(0x2ecc71).setTitle("👤 USER • Global Profile Updated")
        .setDescription("👤 **User**\n<@"+n.id+">\n**ID:** "+n.id)
        .addFields(
          {name:"Username",value:o.username+" → "+n.username},
          {name:"Global Name",value:(o.globalName||"None")+" → "+(n.globalName||"None")},
          {name:"Avatar",value:o.avatar===n.avatar ? "Unchanged" : "Changed"}
        ).setTimestamp();
      run("userUpdate",()=>log.send(guild,client.appData,"users",e));
    }
  });

  client.on("error", e => console.error("Discord client error:",e));
  client.on("warn", w => console.warn("Discord client warning:",w));
};
