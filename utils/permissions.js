const { PermissionFlagsBits } = require("discord.js");

function isAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

function canManageThreads(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads)
  );
}

module.exports = { isAdmin, canManageThreads };
