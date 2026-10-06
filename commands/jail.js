const jail = require("../systems/jail");

module.exports = {
  name: "jail",
  async execute(interaction, context) {
    return jail.jailMember(interaction, context);
  }
};
