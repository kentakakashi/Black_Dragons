const tryouts=require("../systems/tryouts");

module.exports={
  name:"tryout-status",
  async execute(interaction,context){
    return tryouts.showModerationStatus(interaction,context);
  }
};
