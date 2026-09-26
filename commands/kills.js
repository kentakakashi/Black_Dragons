
const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { saveData } = require("../utils/database");
const { getRank, getRankDisplay, formatKills } = require("../utils/ranks");
const rankSystem = require("../systems/rankSystem");

function admin(i){ return i.memberPermissions?.has(PermissionFlagsBits.Administrator); }

module.exports = {
  name: "kills",
  data: new SlashCommandBuilder()
    .setName("kills")
    .setDescription("Administrator kill-stat management.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addUserOption(o=>o.setName("member").setDescription("Ranked Discord member.").setRequired(true))
    .addStringOption(o=>o.setName("action").setDescription("Add, remove or set the kill total.").setRequired(true)
      .addChoices({name:"Add",value:"add"},{name:"Remove",value:"remove"},{name:"Update",value:"update"}))
    .addIntegerOption(o=>o.setName("amount").setDescription("Kills to add/remove, or the new total.").setMinValue(0).setMaxValue(1000000000).setRequired(true)),
  async execute(interaction, context) {
    if(!admin(interaction)){
      await interaction.reply({content:"❌ Only **Administrators** can edit kill stats.",ephemeral:true});
      return;
    }

    const target=interaction.options.getUser("member",true);
    const action=interaction.options.getString("action",true);
    const amount=interaction.options.getInteger("amount",true);
    const data=context.data;
    const old=data.rankUsers?.[target.id];

    if(!old){
      await interaction.reply({content:"❌ That member does not have an approved Black Dragons rank yet.",ephemeral:true});
      return;
    }

    const previousKills=Math.max(0,Number(old.kills)||0);
    let newKills=previousKills;
    if(action==="add") newKills=previousKills+amount;
    if(action==="remove") newKills=Math.max(0,previousKills-amount);
    if(action==="update") newKills=amount;

    const previousRank=getRank(previousKills);
    const nextRank=getRank(newKills);

    let member;
    try{
      member=await interaction.guild.members.fetch(target.id);
      await rankSystem.applyRankRole(member,nextRank.key,data);
    }catch(error){
      console.error("❌ Manual kill update role sync failed:",error);
      await interaction.reply({
        content:"❌ Kill stats were **not changed** because the rank role could not be safely synchronized.\\n\\n**Reason:** "+(error?.message||"Unknown rank-role error"),
        ephemeral:true
      });
      return;
    }

    const timestamp=Date.now();
    data.rankUsers[target.id]={
      ...old,
      discordId:target.id,
      kills:newKills,
      rank:nextRank.key,
      updatedAt:timestamp,
      lastReviewerId:interaction.user.id
    };

    if(!Array.isArray(data.rankHistory))data.rankHistory=[];
    data.rankHistory.push({
      applicationId:null,
      userId:target.id,
      robloxUsername:old.robloxUsername||null,
      kills:newKills,
      rank:nextRank.key,
      action:"admin_kills_"+action,
      reviewerId:interaction.user.id,
      previousKills,
      previousRank:previousRank.key,
      reason:"Administrator manual kill-stat adjustment",
      timestamp
    });

    await saveData(data);

    await interaction.reply({
      embeds:[
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("⚔️ BLACK DRAGONS • KILL STATS UPDATED")
          .setDescription("<@"+target.id+">'s kill statistics were updated by an administrator.")
          .addFields(
            {name:"👤 Member",value:"<@"+target.id+">",inline:true},
            {name:"🛠️ Action",value:action==="update"?"Update":action==="add"?"Add":"Remove",inline:true},
            {name:"⚔️ Change",value:action==="update"?formatKills(newKills):((action==="add"?"+":"-")+formatKills(amount)),inline:true},
            {name:"📊 Previous Kills",value:formatKills(previousKills),inline:true},
            {name:"📊 New Kills",value:formatKills(newKills),inline:true},
            {name:"🏆 Rank",value:getRankDisplay(previousRank)+" → "+getRankDisplay(nextRank),inline:true},
            {name:"👮 Modified By",value:"<@"+interaction.user.id+">",inline:true}
          )
          .setTimestamp()
      ]
    });
  }
};
