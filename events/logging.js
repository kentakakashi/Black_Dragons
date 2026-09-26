const log = require("../systems/logging/logger");

module.exports = function registerLogging(client) {
  client.on("messageCreate", m => log.messageCreate(m, client.appData).catch(e => console.error("logging messageCreate",e)));
  client.on("messageUpdate", (o,n) => log.messageUpdate(o,n,client.appData).catch(e => console.error("logging messageUpdate",e)));
  client.on("messageDelete", m => { if (!log.wasPurged(m.id)) log.messageDelete(m,client.appData).catch(e=>console.error("logging messageDelete",e)); });
  client.on("messageDeleteBulk", (messages,channel) => log.bulkDelete(messages,channel,client.appData).catch(e=>console.error("logging bulkDelete",e)));

  client.on("guildMemberAdd", m => log.memberAdd(m,client.appData).catch(e=>console.error("logging memberAdd",e)));
  client.on("guildMemberRemove", async m => {
    try {
      const a = await client.guilds.cache.get(m.guild.id)?.fetchAuditLogs({type:require("discord.js").AuditLogEvent.MemberKick,limit:5});
      const kicked = a?.entries.find(x => Date.now()-x.createdTimestamp < 10000 && String(x.target?.id||x.targetId) === String(m.id));
      if (kicked) {
        await log.send(m.guild,client.appData,"moderation",
          require("discord.js").EmbedBuilder.from(
            require("discord.js").EmbedBuilder.from({})
          )
        ).catch(()=>{});
      }
    } catch {}
    log.memberRemove(m,client.appData).catch(e=>console.error("logging memberRemove",e));
  });
  client.on("guildMemberUpdate", (o,n) => {
    log.memberUpdate(o,n,client.appData).catch(e=>console.error("logging memberUpdate",e));
    if (o.communicationDisabledUntilTimestamp !== n.communicationDisabledUntilTimestamp) {
      log.send(n.guild,client.appData,"moderation",
        new (require("discord.js").EmbedBuilder)()
          .setColor(0xed4245).setTitle("🛡️ MODERATION • Timeout Updated")
          .setDescription("👤 **User**
"+(n.user ? "<@"+n.user.id+">" : "Unknown"))
          .addFields(
            {name:"🕐 Time",value:"<t:"+Math.floor(Date.now()/1000)+":F>"},
            {name:"⏱️ Previous",value:o.communicationDisabledUntilTimestamp ? "<t:"+Math.floor(o.communicationDisabledUntilTimestamp/1000)+":F>" : "No timeout"},
            {name:"⏱️ New",value:n.communicationDisabledUntilTimestamp ? "<t:"+Math.floor(n.communicationDisabledUntilTimestamp/1000)+":F>" : "Timeout removed"}
          ).setTimestamp()
      ).catch(e=>console.error("logging timeout",e));
    }
  });
  client.on("guildBanAdd", b => log.ban(b,client.appData,true).catch(e=>console.error("logging ban",e)));
  client.on("guildBanRemove", b => log.ban(b,client.appData,false).catch(e=>console.error("logging unban",e)));

  client.on("roleCreate", r => log.roleCreate(r,client.appData).catch(e=>console.error("logging roleCreate",e)));
  client.on("roleDelete", r => log.roleDelete(r,client.appData).catch(e=>console.error("logging roleDelete",e)));
  client.on("roleUpdate", (o,n) => log.roleUpdate(o,n,client.appData).catch(e=>console.error("logging roleUpdate",e)));

  client.on("voiceStateUpdate", (o,n) => log.voice(o,n,client.appData).catch(e=>console.error("logging voice",e)));

  client.on("channelCreate", c => log.channelCreate(c,client.appData).catch(e=>console.error("logging channelCreate",e)));
  client.on("channelDelete", c => log.channelDelete(c,client.appData).catch(e=>console.error("logging channelDelete",e)));
  client.on("channelUpdate", (o,n) => log.channelUpdate(o,n,client.appData).catch(e=>console.error("logging channelUpdate",e)));
  client.on("threadCreate", t => log.thread("created",t,client.appData).catch(e=>console.error("logging threadCreate",e)));
  client.on("threadUpdate", (o,n) => log.thread("updated",n,client.appData).catch(e=>console.error("logging threadUpdate",e)));
  client.on("threadDelete", t => log.thread("deleted",t,client.appData).catch(e=>console.error("logging threadDelete",e)));

  client.on("guildUpdate", (o,n) => log.guildUpdate(o,n,client.appData).catch(e=>console.error("logging guildUpdate",e)));
  client.on("inviteCreate", i => log.inviteCreate(i,client.appData).catch(e=>console.error("logging inviteCreate",e)));
  client.on("inviteDelete", i => log.inviteDelete(i,client.appData).catch(e=>console.error("logging inviteDelete",e)));

  client.on("interactionCreate", i => {
    if (i.isChatInputCommand()) log.command(i,client.appData).catch(e=>console.error("logging command",e));
  });

  client.on("error", e => console.error("Discord client error:",e));
  client.on("warn", w => console.warn("Discord client warning:",w));
};
