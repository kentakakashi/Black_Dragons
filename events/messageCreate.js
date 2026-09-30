const { Events } = require("discord.js");
const { processProofMessage } = require("../systems/rankSystem");
const ai = require("../systems/ai");

module.exports = function registerMessageCreate(client) {
  client.on(Events.MessageCreate, async message => {
    try {
      await processProofMessage(
        message,
        client.appData,
        client
      );
    } catch (error) {
      console.error(
        "❌ messageCreate handler failed:",
        error
      );
    }

    try {
      await ai.handleMessage(
        message,
        client
      );
    } catch (error) {
      console.error(
        "❌ AI message handler failed:",
        error
      );
    }
  });
};
