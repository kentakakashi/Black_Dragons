const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-timeout",
  async execute(interaction,context){
    return tryouts.addModeration(
      interaction,
      context,
      "timeout",
      interaction.options.getUser("user").id,
      interaction.options.getString("reason"),
      interaction.options.getInteger("duration_minutes")
    );
  }
};
