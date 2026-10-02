const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-kick",
  async execute(interaction,context){
    if(!tryouts.isTryoutStaff(interaction,context.data)){
      return interaction.reply({
        content:"❌ Only the configured **Tryout Staff** role or an Administrator can remove players from tryouts.",
        ephemeral:true
      });
    }

    return tryouts.kickFromTryout(
      interaction,
      context,
      interaction.options.getUser("user").id,
      interaction.options.getString("reason")
    );
  }
};
