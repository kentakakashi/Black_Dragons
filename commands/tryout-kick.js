const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-kick",
  async execute(interaction,context){
    return tryouts.kickFromTryout(
      interaction,
      context,
      interaction.options.getUser("user").id,
      interaction.options.getString("reason")
    );
  }
};
