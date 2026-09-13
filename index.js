require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Collection
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const { loadData } = require("./utils/database");
const { registerCommandsWhenReady } = require("./utils/config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
client.appData = loadData();

/*
==================================================
LOAD COMMANDS
==================================================
*/

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));

    if (!command.name || typeof command.execute !== "function") {
      console.error(`❌ Invalid command file: ${file}`);
      continue;
    }

    client.commands.set(command.name, command);
    console.log(`✅ Loaded command: /${command.name}`);
  } catch (error) {
    console.error(`❌ Failed to load command ${file}:`, error);
  }
}

/*
==================================================
LOAD EVENTS
==================================================
*/

const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter(file => file.endsWith(".js"));

for (const file of eventFiles) {
  try {
    const registerEvent = require(path.join(eventsPath, file));

    if (typeof registerEvent === "function") {
      registerEvent(client);
      console.log(`✅ Loaded event: ${file}`);
    }
  } catch (error) {
    console.error(`❌ Failed to load event ${file}:`, error);
  }
}

/*
==================================================
START BOT
==================================================
*/

client.once("ready", async () => {
  console.log(`🐉 ${client.user.tag} is online!`);

  try {
    await registerCommandsWhenReady(client);
  } catch (error) {
    console.error("❌ Slash command registration failed:", error);
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("❌ Discord login failed:", error);
  process.exit(1);
});
