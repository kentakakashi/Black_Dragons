require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Collection
} = require("discord.js");

const { loadData } = require("./utils/database");
const { registerCommands } = require("./utils/config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
client.appData = loadData();

async function main() {
  await registerCommands(client);
  require("./events/ready")(client);
  require("./events/interactionCreate")(client);
  require("./events/messageCreate")(client);

  if (!process.env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN is missing from the hosting environment.");
  }

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(error => {
  console.error("❌ Bot failed to start:", error);
  process.exit(1);
});
