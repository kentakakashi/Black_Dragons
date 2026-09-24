const { EmbedBuilder } = require("discord.js");

const CATEGORIES = {};
const CATEGORY_ORDER = [];

function createHomeEmbed() {
  return new EmbedBuilder().setTitle("BLACK DRAGONS • BOT SETUP");
}

module.exports = { CATEGORIES, CATEGORY_ORDER, createHomeEmbed };
