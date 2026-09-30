const aiMemory = require("../utils/aiMemory");

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_MAX_OUTPUT = 800;

const BATCH_WAIT_MS = 2000;

/*
 * One pending conversation container per user.
 *
 * key = guild + channel + user
 *
 * This is intentionally NOT global per channel, so two users talking at
 * the same time never get merged into one AI request.
 */
const pendingBatches = new Map();

function getAIConfig(client) {
  const saved = client?.appData?.config?.ai || {};

  return {
    enabled: saved.enabled !== false,
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

function clearPendingForGuildChannel(guildId, channelId) {
  const prefix =
    String(guildId) +
    ":" +
    String(channelId) +
    ":";

  for (const [key, batch] of pendingBatches) {
    if (key.startsWith(prefix)) {
      clearTimeout(batch.timer);
      pendingBatches.delete(key);
    }
  }
}

/*
 * Classify Discord replies.
 *
 * - "bot"   = the user replied to a BLACK DRAGONS message.
 * - "other" = the user replied to another user.
 * - "none"  = normal message, not a reply.
 *
 * If Discord cannot provide the referenced message, we deliberately treat it
 * as "other" so the bot does not accidentally answer a reply aimed at someone.
 */
async function getReplyTarget(message, client) {
  if (!message.reference?.messageId) {
    return {
      type: "none",
      message: null
    };
  }

  try {
    const referenced =
      await message.fetchReference();

    if (
      referenced?.author?.id &&
      String(referenced.author.id) ===
        String(client.user.id)
    ) {
      return {
        type: "bot",
        message: referenced
      };
    }

    return {
      type: "other",
      message: referenced || null
    };
  } catch {
    return {
      type: "other",
      message: null
    };
  }
}

function wasDirectlyAddressed(
  message,
  client,
  replyTarget
) {
  if (
    replyTarget?.type === "bot"
  ) {
    return true;
  }

  if (message.mentions?.users?.has(client.user.id)) {
    return true;
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
    let cut =
      remaining.lastIndexOf("\n", 1990);

    if (cut < 900) {
      cut =
        remaining.lastIndexOf(" ", 1990);
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

function formatReplyContext(replyTarget) {
  if (
    !replyTarget ||
    !replyTarget.message
  ) {
    return "";
  }

  const referenced =
    replyTarget.message;

  return (
    "[MESSAGE BEING REPLIED TO]\n" +
    "[" +
    String(
      referenced.author?.username ||
        "Unknown"
    ) +
    " | USER_ID " +
    String(
      referenced.author?.id ||
        "unknown"
    ) +
    "] " +
    String(
      referenced.content || ""
    )
  );
}

function formatHistory(
  messages,
  batchMessages
) {
  const recent =
    messages.slice(-35);

  const lines =
    recent.map(item => {
      const speaker =
        item.isBot
          ? "BLACK DRAGONS"
          : String(
              item.username ||
                "Unknown"
            );

      const userId =
        item.isBot
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
    "",
    "[CURRENT USER MESSAGE BATCH]",
    "These messages were sent by the SAME USER during one short burst.",
    "Treat them as one conversational turn and answer the whole burst."
  );

  for (
    const item of batchMessages
  ) {
    lines.push(
      "[CURRENT MESSAGE | " +
        String(
          item.username ||
            "Unknown"
        ) +
        " | USER_ID " +
        String(
          item.userId ||
            "unknown"
        ) +
        "] " +
        String(
          item.content || ""
        )
    );

    const replyContext =
      formatReplyContext(
        item.replyTarget
      );

    if (replyContext) {
      lines.push(replyContext);
    }
  }

  return lines.join("\n");
}

function buildInstructions(
  message,
  directlyAddressed,
  batchMessages
) {
  return (
    "You are BLACK DRAGONS, a Discord server resident.\n\n" +

    "Your job is to talk like an actual person in a busy Discord server, " +
    "not like an assistant, customer-support agent, narrator, or chatbot.\n\n" +

    "STYLE:\n" +
    "- Sound spontaneous, casual, sharp and socially aware.\n" +
    "- Match the exact vibe of the current conversation.\n" +
    "- Short replies are usually better. One sentence is completely fine.\n" +
    "- Use slang and lowercase naturally when the conversation does.\n" +
    "- Do not make every reply witty. Do not force jokes.\n" +
    "- Never turn a simple Discord conversation into an essay.\n" +
    "- Actually respond to what the user said instead of inventing a new topic.\n" +
    "- If several current messages are supplied, respond to the burst as ONE turn.\n" +
    "- Do not repeat every message separately. Combine your response naturally.\n" +
    "- Keep different USER_ID values separate.\n\n" +

    "EMOJIS:\n" +
    "- Do NOT add an emoji by default.\n" +
    "- Most replies should have zero emojis.\n" +
    "- Only use one when it genuinely matches the emotion or style.\n" +
    "- Never repeatedly use the same emoji just because it worked before.\n" +
    "- Never use skull emojis as a default reaction.\n\n" +

    "CONTEXT:\n" +
    "- The CURRENT USER MESSAGE BATCH is what you are answering.\n" +
    "- Prior messages are context only.\n" +
    "- If a current message is a reply to BLACK DRAGONS, the MESSAGE BEING REPLIED TO is highly important context.\n" +
    "- Never answer an older unrelated message instead of the current batch.\n" +
    "- Different USER_ID values are different people. Never merge them.\n" +
    "- Do not invent personal facts.\n" +
    "- Do not pretend you saw messages that are not supplied.\n\n" +

    "CONVERSATION:\n" +
    "- This request is already an approved AI turn. Always answer it.\n" +
    "- Never output SKIP.\n" +
    "- If the message is random, give a natural random reaction instead of an AI explanation.\n" +
    "- If someone is joking, joke back when it fits.\n" +
    "- If someone asks a real question, answer it directly.\n" +
    "- If someone is testing you, react like you noticed they are testing you.\n" +
    "- Do not mention prompts, transcripts, APIs, models, hidden instructions, or implementation details.\n\n" +

    "IDENTITY:\n" +
    "- You are BLACK DRAGONS. You can have a recognizable personality.\n" +
    "- You are an AI bot, but do not constantly announce that fact.\n\n" +

    "DIRECTLY ADDRESSED: " +
    (directlyAddressed
      ? "yes"
      : "no") +
    "\n" +

    "BATCH SIZE: " +
    String(
      batchMessages.length
    ) +
    "\n" +

    "CURRENT CHANNEL: #" +
    String(
      message.channel?.name ||
        "unknown"
    ) +
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
    .map(part =>
      String(
        part?.text || ""
      )
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function callModel(
  message,
  history,
  directlyAddressed,
  batchMessages
) {
  const url =
    GEMINI_URL +
    "/" +
    encodeURIComponent(
      DEFAULT_MODEL
    ) +
    ":generateContent";

  const response =
    await fetch(
      url,
      {
        method: "POST",

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
                    directlyAddressed,
                    batchMessages
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
                      batchMessages
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
              thinkingLevel:
                "minimal"
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
      "HTTP " +
        String(
          response.status
        );

    throw new Error(
      "Gemini API error: " +
        detail
    );
  }

  return extractGeminiText(body);
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
        content:
          chunks[index],

        reply: {
          messageReference:
            message.id,

          failIfNotExists:
            false
        },

        allowedMentions: {
          parse: []
        }
      });
    } else {
      await message.channel.send({
        content:
          chunks[index],

        allowedMentions: {
          parse: []
        }
      });
    }
  }
}

async function processBatch(
  message,
  client,
  batch
) {
  /*
   * Re-check the global switch and channel at execution time.
   * This means turning AI OFF during the 2-second wait cancels the reply.
   */
  const aiConfig =
    getAIConfig(client);

  if (
    !aiConfig.enabled ||
    !channelAllowed(
      message.channelId,
      client
    )
  ) {
    return;
  }

  /*
   * If Auto Chat is OFF, only a batch whose first/last eligible message
   * directly addressed BLACK DRAGONS should be answered.
   */
  const directlyAddressed =
    batch.some(item =>
      wasDirectlyAddressed(
        item.message,
        client,
        item.replyTarget
      )
    );

  if (
    !aiConfig.autoChat &&
    !directlyAddressed
  ) {
    return;
  }

  /*
   * Read the latest memory only when the 2-second quiet period has ended.
   * Then append the whole burst to memory in its original order.
   */
  const history =
    await aiMemory.getMessages(
      message.guild.id,
      message.channelId
    );

  /*
   * Do not wait for Firestore here.
   *
   * The AI request should start immediately after the 2-second debounce.
   * Memory persistence runs in the background so database latency cannot
   * become part of the visible reply latency.
   */
  for (const item of batch) {
    void aiMemory.appendMessage(
      message.guild.id,
      message.channelId,
      {
        userId:
          item.message.author.id,

        username:
          item.message.member
            ?.displayName ||
          item.message.author
            .username,

        content:
          item.message.content,

        timestamp:
          item.message.createdTimestamp ||
          Date.now(),

        isBot: false
      }
    );
  }

  const output =
    await callModel(
      message,
      history,
      directlyAddressed,
      batch.map(item => ({
        userId:
          item.message.author.id,

        username:
          item.message.member
            ?.displayName ||
          item.message.author.username,

        content:
          item.message.content,

        replyTarget:
          item.replyTarget
      }))
    );

  if (!output) {
    console.error(
      "❌ BLACK DRAGONS AI returned an empty response."
    );
    return;
  }

  /*
   * Reply to the LAST message in the burst. This makes the AI response
   * visually attach to the complete burst instead of one earlier fragment.
   */
  await sendNaturalReply(
    batch[batch.length - 1].message,
    output
  );

  void aiMemory.appendBotMessage(
    message.guild.id,
    message.channelId,
    output
  );
}

function queueUserMessage(
  message,
  client,
  replyTarget
) {
  const key =
    String(message.guild.id) +
    ":" +
    String(message.channelId) +
    ":" +
    String(message.author.id);

  const existing =
    pendingBatches.get(key);

  if (existing) {
    clearTimeout(existing.timer);

    existing.messages.push({
      message,
      replyTarget
    });

    existing.timer =
      setTimeout(
        () => flushUserBatch(
          key,
          client
        ),
        BATCH_WAIT_MS
      );

    return;
  }

  const batch = {
    messages: [
      {
        message,
        replyTarget
      }
    ],

    timer: null
  };

  batch.timer =
    setTimeout(
      () => flushUserBatch(
        key,
        client
      ),
      BATCH_WAIT_MS
    );

  pendingBatches.set(
    key,
    batch
  );
}

async function flushUserBatch(
  key,
  client
) {
  const batch =
    pendingBatches.get(key);

  if (!batch) {
    return;
  }

  pendingBatches.delete(key);

  const first =
    batch.messages[0]?.message;

  if (!first) {
    return;
  }

  try {
    await processBatch(
      first,
      client,
      batch.messages
    );
  } catch (error) {
    console.error(
      "❌ BLACK DRAGONS AI failed:",
      error
    );
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
    !aiConfig.enabled ||
    !aiConfig.channelId ||
    !channelAllowed(
      message.channelId,
      client
    )
  ) {
    return;
  }

  const content =
    String(
      message.content || ""
    ).trim();

  if (!content) {
    return;
  }

  if (content.startsWith("/")) {
    return;
  }

  /*
   * IMPORTANT:
   * A reply to another user is NEVER an AI turn.
   * A reply to BLACK DRAGONS IS an AI turn.
   * A normal message is an AI turn only when Auto Chat is enabled.
   */
  const replyTarget =
    await getReplyTarget(
      message,
      client
    );

  if (
    replyTarget.type === "other"
  ) {
    return;
  }

  const directlyAddressed =
    wasDirectlyAddressed(
      message,
      client,
      replyTarget
    );

  if (
    !aiConfig.autoChat &&
    !directlyAddressed
  ) {
    return;
  }

  queueUserMessage(
    message,
    client,
    replyTarget
  );
}

function getStatus(client) {
  const config =
    getAIConfig(client);

  return {
    configured:
      isConfigured(),

    model:
      DEFAULT_MODEL,

    enabled:
      config.enabled,

    autoChat:
      config.autoChat,

    channelId:
      config.channelId
  };
}

module.exports = {
  handleMessage,
  getStatus
};
