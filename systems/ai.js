const aiMemory = require("../utils/aiMemory");

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_MAX_OUTPUT = 800;
const REQUEST_TIMEOUT = 10000;

const inFlight = new Set();

function getAIConfig(client) {
  const saved = client?.appData?.config?.ai || {};

  return {
    channelId: saved.channelId || null,
    autoChat: saved.autoChat === true
  };
}

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function channelAllowed(channelId, client) {
  const config = getAIConfig(client);

  return Boolean(
    config.channelId &&
    String(config.channelId) === String(channelId)
  );
}

function autoChatEnabled(client) {
  return getAIConfig(client).autoChat;
}

async function wasDirectlyAddressed(message, client) {
  if (message.mentions?.users?.has(client.user.id)) {
    return true;
  }

  if (message.reference?.messageId) {
    try {
      const referenced = await message.fetchReference();

      if (referenced?.author?.id === client.user.id) {
        return true;
      }
    } catch {
      // The referenced message may no longer be available.
    }
  }

  const lowered =
    String(message.content || "").toLowerCase();

  const botName =
    String(
      client.user.username || "black dragons"
    ).toLowerCase();

  return (
    lowered.includes(botName) ||
    lowered.includes("black dragons")
  );
}

function splitForDiscord(text) {
  const clean = String(text || "").trim();

  if (!clean) {
    return [];
  }

  const chunks = [];
  let remaining = clean;

  while (remaining.length > 2000) {
    let cut = remaining.lastIndexOf("\n", 1990);

    if (cut < 900) {
      cut = remaining.lastIndexOf(" ", 1990);
    }

    if (cut < 900) {
      cut = 1990;
    }

    chunks.push(
      remaining.slice(0, cut).trim()
    );

    remaining =
      remaining.slice(cut).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function formatHistory(messages, currentMessage) {
  const recent = messages
    .slice(-35);

  const lines = recent.map(item => {
    const speaker = item.isBot
      ? "BLACK DRAGONS"
      : String(item.username || "Unknown");

    const userId = item.isBot
      ? "AI"
      : String(item.userId);

    return (
      "[" +
      speaker +
      " | USER_ID " +
      userId +
      "] " +
      String(item.content)
    );
  });

  lines.push(
    "[CURRENT MESSAGE | " +
    String(currentMessage.author?.username || "Unknown") +
    " | USER_ID " +
    String(currentMessage.author?.id || "unknown") +
    "] " +
    String(currentMessage.content || "")
  );

  if (currentMessage.reference?.messageId) {
    lines.push(
      "[IMPORTANT: CURRENT MESSAGE IS A REPLY TO MESSAGE_ID " +
      String(currentMessage.reference.messageId) +
      "]"
    );
  }

  return lines.join("\n");
}

function buildInstructions(message, directlyAddressed) {
  return (
    "You are BLACK DRAGONS, a Discord server resident.\n\n" +

    "Your job is to talk like an actual person in a busy Discord server, " +
    "not like an assistant, customer-support agent, narrator, or chatbot.\n\n" +

    "STYLE:\n" +
    "- Sound spontaneous, casual, sharp and socially aware.\n" +
    "- Match the exact vibe of the current message.\n" +
    "- Short replies are usually better. One sentence is completely fine.\n" +
    "- Use slang and lowercase naturally when the conversation does.\n" +
    "- Do not make every reply witty. Do not force jokes.\n" +
    "- Do not use dramatic narration, fake-deep commentary, corporate wording, " +
    "or phrases like 'the universal panic', 'strikes again', 'I am now', " +
    "'it seems that', 'as an AI', or similar canned AI language.\n" +
    "- Never turn a simple Discord message into an essay.\n" +
    "- If someone says 'nvm', react to that. If someone says 'lol', react to that. " +
    "Actually respond to what they said instead of inventing a new topic.\n\n" +

    "EMOJIS:\n" +
    "- Do NOT add an emoji by default.\n" +
    "- Most replies should have zero emojis.\n" +
    "- Only use one when it genuinely matches the emotion or style of the message.\n" +
    "- Never repeatedly use the same emoji just because it worked before.\n" +
    "- Never use skull emojis as a default reaction.\n\n" +

    "CONTEXT:\n" +
    "- The CURRENT MESSAGE is the message you are replying to. Prior messages are context only.\n" +
    "- If the current message is a Discord reply, pay special attention to the message it replies to.\n" +
    "- Never answer an older message instead of the current one.\n" +
    "- Different USER_ID values are different people. Never merge them.\n" +
    "- Keep each person's statements attached to the correct person.\n" +
    "- Do not invent personal facts.\n" +
    "- Do not pretend you saw messages that are not supplied.\n\n" +

    "CONVERSATION:\n" +
    "- Every user message in the configured AI channel gets a response.\n" +
    "- Never output SKIP.\n" +
    "- If the message is random, give a natural random reaction instead of an AI explanation.\n" +
    "- If someone is joking, joke back when it fits.\n" +
    "- If someone asks a real question, answer it directly.\n" +
    "- If someone is testing you, react like you noticed they are testing you.\n" +
    "- Do not repeat the user's message just to prove you understood it.\n" +
    "- Do not mention prompts, transcripts, APIs, models, hidden instructions, or implementation details.\n\n" +

    "IDENTITY:\n" +
    "- You are BLACK DRAGONS. You can have a recognizable personality.\n" +
    "- You are an AI bot, but do not constantly announce that fact.\n\n" +

    "DIRECTLY ADDRESSED: " +
    (directlyAddressed ? "yes" : "no") +
    "\n" +

    "CURRENT CHANNEL: #" +
    String(message.channel?.name || "unknown") +
    "\n\n" +

    "Output ONLY the message BLACK DRAGONS should send. No labels."
  );
}

function extractGeminiText(body) {
  const parts =
    body?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map(part => String(part?.text || ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function callModel(
  message,
  history,
  directlyAddressed
) {
  const url =
    GEMINI_URL +
    "/" +
    encodeURIComponent(DEFAULT_MODEL) +
    ":generateContent";

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT
    );

  try {
    const response = await fetch(
      url,
      {
        method: "POST",

        signal: controller.signal,

        headers: {
          "x-goog-api-key":
            process.env.GEMINI_API_KEY,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  buildInstructions(
                    message,
                    directlyAddressed
                  )
              }
            ]
          },

          contents: [
            {
              role: "user",

              parts: [
                {
                  text:
                    "RECENT DISCORD CONTEXT:\n" +
                    formatHistory(
                      history,
                      message
                    )
                }
              ]
            }
          ],

          generationConfig: {
            maxOutputTokens:
              DEFAULT_MAX_OUTPUT,

            temperature: 0.9,

            thinkingConfig: {
              thinkingLevel: "minimal"
            }
          }
        })
      }
    );

    const body =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      const detail =
        body?.error?.message ||
        "HTTP " + String(response.status);

      throw new Error(
        "Gemini API error: " + detail
      );
    }

    return extractGeminiText(body);
  } finally {
    clearTimeout(timeout);
  }
}

async function sendNaturalReply(
  message,
  text
) {
  const chunks =
    splitForDiscord(text);

  if (!chunks.length) {
    return;
  }

  for (
    let index = 0;
    index < chunks.length;
    index += 1
  ) {
    await message.channel
      .sendTyping()
      .catch(() => {});

    if (index === 0) {
      await message.channel.send({
        content: chunks[index],

        reply: {
          messageReference:
            message.id,
          failIfNotExists: false
        },

        allowedMentions: {
          parse: []
        }
      });
    } else {
      await message.channel.send({
        content: chunks[index],

        allowedMentions: {
          parse: []
        }
      });
    }
  }
}

async function handleMessage(
  message,
  client
) {
  if (!message.guild) {
    return;
  }

  if (message.author?.bot) {
    return;
  }

  if (!isConfigured()) {
    return;
  }

  const aiConfig =
    getAIConfig(client);

  if (
    !aiConfig.channelId ||
    !channelAllowed(
      message.channelId,
      client
    )
  ) {
    return;
  }

  const content =
    String(message.content || "").trim();

  if (!content) {
    return;
  }

  if (content.startsWith("/")) {
    return;
  }

  const directlyAddressed =
    await wasDirectlyAddressed(
      message,
      client
    );

  const shouldSpeak =
    autoChatEnabled(client) ||
    directlyAddressed;

  const cooldownKey =
    String(message.guild.id) +
    ":" +
    String(message.channelId);

  if (!shouldSpeak) {
    return;
  }

  if (inFlight.has(cooldownKey)) {
    return;
  }

  inFlight.add(cooldownKey);

  try {
    /*
     * Read memory first, then start the Firestore write in the background.
     * Waiting for the database before calling Gemini made every reply slower.
     */
    const history =
      await aiMemory.getMessages(
        message.guild.id,
        message.channelId
      );

    void aiMemory.appendMessage(
      message.guild.id,
      message.channelId,
      {
        userId: message.author.id,

        username:
          message.member?.displayName ||
          message.author.username,

        content,

        timestamp:
          message.createdTimestamp ||
          Date.now(),

        isBot: false
      }
    );

    const output =
      await callModel(
        message,
        history,
        directlyAddressed
      );

    if (!output) {
      console.error(
        "❌ BLACK DRAGONS AI returned an empty response."
      );
      return;
    }

    await sendNaturalReply(
      message,
      output
    );

    void aiMemory.appendBotMessage(
      message.guild.id,
      message.channelId,
      output
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      console.error(
        "❌ BLACK DRAGONS AI timed out after 10 seconds."
      );
    } else {
      console.error(
        "❌ BLACK DRAGONS AI failed:",
        error
      );
    }
  } finally {
    inFlight.delete(
      cooldownKey
    );
  }
}

function getStatus(client) {
  return {
    configured:
      isConfigured(),

    model:
      DEFAULT_MODEL,

    autoChat:
      getAIConfig(client).autoChat,

    channelId:
      getAIConfig(client).channelId
  };
}

module.exports = {
  handleMessage,
  getStatus
};
