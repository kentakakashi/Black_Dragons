const jail = require("../systems/jail");

module.exports = {
  name: "unjail",
  async execute(interaction, context) {
    return jail.unjailMember(interaction, context);
  }
};
