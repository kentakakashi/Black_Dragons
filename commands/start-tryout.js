
const {PermissionFlagsBits}=require("discord.js");
const tryouts=require("../systems/tryouts");
module.exports={name:"start-tryout",async execute(interaction,context){
  if(!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))return interaction.reply({content:"❌ Only administrators can start a BLACK DRAGONS tryout.",ephemeral:true});
  return tryouts.startTryout(interaction,context,interaction.options.getString("server_link"));
}};
