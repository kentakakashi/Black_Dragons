const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-end",
  async execute(interaction,context){
    if(!tryouts.isTryoutStaff(interaction,context.data)){
      return interaction.reply({
        content:"❌ Only the configured **Tryout Staff** role or an Administrator can end a BLACK DRAGONS tryout.",
        ephemeral:true
      });
    }

    return tryouts.endTryout(
      interaction,
      context
    );
  }
};
