const { startSetup } = require("../buttons/setup");

module.exports = {
  name: "setup",
  async execute(interaction, context) {
    await startSetup(interaction, context.data);
  }
};
