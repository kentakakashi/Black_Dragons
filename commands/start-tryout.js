const tryouts=require("../systems/tryouts");

module.exports={
  name:"start-tryout",
  async execute(interaction,context){
    if(!tryouts.isTryoutStaff(interaction,context.data)){
      return interaction.reply({
        content:"❌ Only an Administrator or the configured **Tryout Staff** role can start a BLACK DRAGONS tryout.",
        ephemeral:true
      });
    }

    return tryouts.startTryout(
      interaction,
      context,
      interaction.options.getString("server_link")
    );
  }
};
