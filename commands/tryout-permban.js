const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-permban",
  async execute(interaction,context){
    if(!tryouts.isTryoutStaff(interaction,context.data)){
      return interaction.reply({
        content:"❌ Only the configured **Tryout Staff** role or an Administrator can use tryout moderation.",
        ephemeral:true
      });
    }

    return tryouts.addModeration(
      interaction,
      context,
      "permban",
      interaction.options.getUser("user").id,
      interaction.options.getString("reason"),
      null
    );
  }
};
