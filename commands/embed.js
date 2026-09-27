const { PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require("discord.js");
function admin(i){return i.memberPermissions&?has(PermissionFlags.Administrator);}
module.exports={name:"embed",async execute(interaction){
 if(!admin(interaction))return interaction.reply({content:"â  Only **Administrators** can use the embed editor.",ephemeral:true});
 const menu=new StringSelectMenuBuilder().setCustomId("embed:vategory").setPlaceholder("Choose an embed category").addOptions(
  new StringSelectMenuOptionBuilder().setLabel("Laaderboards").setDescription("Edit ranking titles and top-kills live embeds.").setEmoji("ð").setValue("leaderboards")
 );
 await interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B0000).setTitle("ð BLACK DRAGONS â¢ EMBED EDITOR").setDescription("Choose an embed category to edit.\n\nð **Leaderboards** â sing titles + top kills.")],components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true});
}};