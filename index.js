require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Collection
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const {
  initializeDatabase
} = require("./utils/database");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands =
  new Collection();

/*
==================================================
LOAD COMMANDS
==================================================
*/

const commandsPath =
  path.join(
    __dirname,
    "commands"
  );

const commandFiles =
  fs
    .readdirSync(commandsPath)
    .filter(
      file =>
        file.endsWith(".js")
    );

for (
  const file of commandFiles
) {
  try {
    const command =
      require(
        path.join(
          commandsPath,
          file
        )
      );

    if (
      !command.name ||
      typeof command.execute !==
        "function"
    ) {
      console.error(
        `❌ Invalid command file: ${file}`
      );

      continue;
    }

    client.commands.set(
      command.name,
      command
    );

    console.log(
      `✅ Loaded command: /${command.name}`
    );

  } catch (error) {
    console.error(
      `❌ Failed to load command ${file}:`,
      error
    );
  }
}

/*
==================================================
LOAD EVENTS
==================================================
*/

const eventsPath =
  path.join(
    __dirname,
    "events"
  );

const eventFiles =
  fs
    .readdirSync(eventsPath)
    .filter(
      file =>
        file.endsWith(".js")
    );

for (
  const file of eventFiles
) {
  try {
    const registerEvent =
      require(
        path.join(
          eventsPath,
          file
        )
      );

    if (
      typeof registerEvent ===
      "function"
    ) {
      registerEvent(client);

      console.log(
        `✅ Loaded event: ${file}`
      );
    }

  } catch (error) {
    console.error(
      `❌ Failed to load event ${file}:`,
      error
    );
  }
}

/*
==================================================
START BOT
==================================================
*/

async function startBot() {
  if (
    !process.env.DISCORD_TOKEN
  ) {
    console.error(
      "❌ DISCORD_TOKEN is missing."
    );

    process.exit(1);
  }

  try {
    /*
      VERY IMPORTANT:

      Firestore loads BEFORE Discord starts
      using client.appData.

      This prevents the bot from starting
      with an empty database and accidentally
      behaving as if configuration disappeared.
    */

    client.appData =
      await initializeDatabase();

    console.log(
      "💾 Database initialization complete."
    );

    console.log(
      `👥 Players loaded: ${
        Object.keys(
          client.appData.rankUsers || {}
        ).length
      }`
    );

    console.log(
      `📋 Applications loaded: ${
        (
          client.appData
            .rankApplications || []
        ).length
      }`
    );

    console.log(
      `📜 Rank history loaded: ${
        (
          client.appData
            .rankHistory || []
        ).length
      }`
    );

    console.log(
      `⚙️ Rank registration channel: ${
        client.appData.config?.rank
          ?.registrationChannelId ||
        "NOT SET"
      }`
    );

    console.log(
      `⚙️ Rank review channel: ${
        client.appData.config?.rank
          ?.reviewChannelId ||
        "NOT SET"
      }`
    );

  } catch (error) {
    console.error(
      "🚨 DATABASE INITIALIZATION FAILED 🚨",
      error
    );

    console.error(
      "❌ Bot will NOT start because persistent data could not be initialized safely."
    );

    process.exit(1);
  }

  try {
    await client.login(
      process.env.DISCORD_TOKEN
    );

  } catch (error) {
    console.error(
      "❌ Discord login failed:",
      error
    );

    process.exit(1);
  }
}

startBot();
