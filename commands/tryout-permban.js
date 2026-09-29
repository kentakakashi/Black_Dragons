const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-permban",
  async execute(interaction,context){
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
