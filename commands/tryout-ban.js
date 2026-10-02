const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-ban",
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
      "ban",
      interaction.options.getUser("user").id,
      interaction.options.getString("reason"),
      interaction.options.getInteger("duration_minutes")
    );
  }
};
