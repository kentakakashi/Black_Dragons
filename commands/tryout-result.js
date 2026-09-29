const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-result",
  async execute(interaction,context){
    if(!tryouts.isTryoutStaff(interaction,context.data)){
      return interaction.reply({
        content:"❌ Only an Administrator or the configured **Tryout Staff** role can record BLACK DRAGONS tryout results.",
        ephemeral:true
      });
    }

    return tryouts.startResult(interaction,context);
  }
};
