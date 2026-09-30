const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-end",
  async execute(interaction,context){
    return tryouts.endTryout(
      interaction,
      context
    );
  }
};
