
const {PermissionFlagsBits}=require("discord.js");
const tryouts=require("../systems/tryouts");
module.exports={name:"tryout-result",async execute(interaction,context){
  if(!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))return interaction.reply({content:"❌ Only administrators can record BLACK DRAGONS tryout results.",ephemeral:true});
  return tryouts.startResult(interaction,context);
}};
