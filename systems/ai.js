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

  /*
   * Gemini may intentionally mark a natural conversational break.
   * This is optional: one-message answers remain one message.
   */
  const naturalParts =
    clean
      .split(/\s*\[NEXT_MESSAGE\]\s*/gi)
      .map(part => part.trim())
      .filter(Boolean);

  const chunks = [];

  for (const part of naturalParts) {
    let remaining = part;

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
  liveMessages,
  batchMessages,
  conversationState
) {
  const lines = [];

  lines.push(
    "[PERSISTENT AI MEMORY]",
    "Older conversation context. Use it for continuity, but prefer the LIVE DISCORD CONTEXT when the two differ.",
    ""
  );

  if (
    conversationState &&
    (
      conversationState.topic ||
      conversationState.context ||
      conversationState.participants?.length
    )
  ) {
    lines.push(
      "[CURRENT CONVERSATION STATE]",
      "This is a compact memory of the ongoing social thread. Treat it as continuity context, not as more recent fact than the live messages.",
      "TOPIC: " +
        String(conversationState.topic || "unknown"),
      "CONTEXT: " +
        String(conversationState.context || "unknown"),
      "PARTICIPANTS: " +
        (
          Array.isArray(conversationState.participants)
            ? conversationState.participants
                .map(item =>
                  String(item.username || "Unknown") +
                  " | USER_ID " +
                  String(item.userId || "unknown")
                )
                .join("; ")
            : "unknown"
        ),
      ""
    );
  }

  for (const item of messages.slice(-35)) {
    const speaker =
      item.isBot
        ? "BLACK DRAGONS"
        : String(item.username || "Unknown");

    const userId =
      item.isBot
        ? "AI"
        : String(item.userId);

    lines.push(
      "[" +
        speaker +
        " | USER_ID " +
        userId +
        "] " +
        String(item.content)
    );
  }

  lines.push(
    "",
    "[LIVE DISCORD CONTEXT]",
    "These are the actual recent messages currently visible in the Discord channel.",
    "Read them in chronological order.",
    "Different USER_ID values are different people.",
    "This live context is the primary source for understanding what people are talking about right now.",
    ""
  );

  for (const item of liveMessages) {
    const speaker =
      item.isBot
        ? "BLACK DRAGONS"
        : String(item.username || "Unknown");

    const userId =
      item.isBot
        ? "AI"
        : String(item.userId || "unknown");

    let line =
      "[" +
      speaker +
      " | USER_ID " +
      userId +
      " | MESSAGE_ID " +
      String(item.id) +
      "] " +
      String(item.content || "");

    if (item.replyTo) {
      line +=
        " [REPLY_TO_MESSAGE_ID " +
        String(item.replyTo) +
        "]";

      if (item.replyTarget) {
        line +=
          " [REPLY_TARGET " +
          String(item.replyTarget.username || "Unknown") +
          " | USER_ID " +
          String(item.replyTarget.userId || "unknown") +
          "]";
      }
    }

    if (Array.isArray(item.mentions) && item.mentions.length) {
      line +=
        " [MENTIONS " +
        item.mentions
          .map(target =>
            String(target.username || "Unknown") +
            " | USER_ID " +
            String(target.userId || "unknown")
          )
          .join("; ") +
        "]";
    }

    lines.push(line);
  }

  lines.push(
    "",
    "[CURRENT USER MESSAGE BATCH]",
    "These messages were sent by the SAME USER during one short burst.",
    "They are already included in the live context. Treat them as one conversational turn."
  );

  for (const item of batchMessages) {
    let currentLine =
      "[CURRENT MESSAGE | " +
      String(item.username || "Unknown") +
      " | USER_ID " +
      String(item.userId || "unknown") +
      "] " +
      String(item.content || "");

    if (item.replyTarget?.message) {
      const target =
        item.replyTarget.message;

      currentLine +=
        " [REPLY_TARGET " +
        String(
          target.member?.displayName ||
          target.author?.username ||
          "Unknown"
        ) +
        " | USER_ID " +
        String(target.author?.id || "unknown") +
        "]";

      currentLine +=
        " [REPLY_TARGET_TYPE " +
        String(item.replyTarget.type || "other") +
        "]";
    }

    lines.push(currentLine);

    const replyContext =
      formatReplyContext(item.replyTarget);

    if (replyContext) {
      lines.push(replyContext);
    }
  }

  return lines.join("\n");
}

async function getLiveConversation(message) {
  try {
    const fetched =
      await message.channel.messages.fetch({ limit: 50 });

    const ordered =
      Array.from(fetched.values())
        .sort(
          (a, b) =>
            a.createdTimestamp -
            b.createdTimestamp
        );

    const byId =
      new Map(
        ordered.map(item => [
          String(item.id),
          item
        ])
      );

    return ordered.map(item => {
      const reference =
        item.reference?.messageId
          ? byId.get(
              String(
                item.reference.messageId
              )
            )
          : null;

      return {
        id: item.id,
        userId:
          item.author?.id || "unknown",
        username:
          item.author?.id === message.client.user?.id
            ? "BLACK DRAGONS"
            : (
                item.member?.displayName ||
                item.author?.username ||
                "Unknown"
              ),
        content:
          String(item.content || "")
            .slice(0, 2000),
        isBot:
          item.author?.id ===
          message.client.user?.id,
        replyTo:
          item.reference?.messageId ||
          null,
        replyTarget:
          reference
            ? {
                userId:
                  reference.author?.id ||
                  "unknown",
                username:
                  reference.member?.displayName ||
                  reference.author?.username ||
                  "Unknown"
              }
            : null,
        mentions:
          Array.from(
            item.mentions?.users?.values() ||
              []
          ).map(user => ({
            userId:
              user.id,
            username:
              user.id === message.client.user?.id
                ? "BLACK DRAGONS"
                : (
                    item.guild?.members?.cache
                      ?.get(user.id)
                      ?.displayName ||
                    user.username ||
                    "Unknown"
                  )
          }))
      };
    });
  } catch (error) {
    console.warn(
      "⚠️ BLACK DRAGONS could not fetch live AI conversation context:",
      error?.message || error
    );

    return [];
  }
}

function buildInstructions(
  message,
  directlyAddressed,
  batchMessages,
  conversationState
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
    "- Keep different USER_ID values separate.\n" +
    "- Most responses should be ONE Discord message.\n" +
    "- When a thought naturally arrives in two or three short beats, you MAY split it into separate messages using [NEXT_MESSAGE].\n" +
    "- Never use more than 3 [NEXT_MESSAGE] segments in one response.\n" +
    "- Do not split a normal sentence just to look human. The break should feel like a genuine conversational pause, reaction, correction, or follow-up.\n\n" +

    "EMOJIS:\n" +
    "- Do NOT add an emoji by default.\n" +
    "- Most replies should have zero emojis.\n" +
    "- Only use one when it genuinely matches the emotion or style.\n" +
    "- Never repeatedly use the same emoji just because it worked before.\n" +
    "- Never use skull emojis as a default reaction.\n\n" +

    "CONTEXT:\n" +
    "- The LIVE DISCORD CONTEXT contains the actual recent conversation and is the primary source of truth for the current social situation.\n" +
    "- Read the live messages chronologically before deciding what the current user means.\n" +
    "- Prior AI memory is useful for continuity, but it is secondary to the live Discord conversation.\n" +
    "- If a current message is a reply to BLACK DRAGONS, the referenced message is highly important context.\n" +
    "- Pay attention to who is talking to whom, not just the words in the latest message.\n" +
    "- A message from another user can change the meaning of the current conversation.\n" +
    "- When a message has REPLY_TARGET, treat that person as the person being addressed unless the surrounding conversation clearly shows otherwise.\n" +
    "- When a message has MENTIONS, treat those users as explicitly addressed participants.\n" +
    "- Do not assume the latest author is talking to BLACK DRAGONS unless the message, reply target, mention, or surrounding context supports that.\n" +
    "- Never merge different USER_ID values into one person.\n" +
    "- Do not invent personal facts.\n" +
    "- Do not pretend you saw messages that are not supplied.\n\n" +

    "PERSISTENT THREAD:\n" +
    "- If CURRENT CONVERSATION STATE is present, use it to remember the active topic and social context across turns or restarts.\n" +
    "- Do not force the old topic into a new conversation. If the live conversation clearly changes subject, update the state to the new subject.\n" +
    "- Preserve useful continuity when the conversation briefly moves away and then returns to the earlier topic.\n" +
    "- Keep participant identities tied to their USER_ID values.\n\n" +

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

    "OUTPUT FORMAT:\n" +
    "- Return valid JSON only.\n" +
    '- Use exactly this shape: {"messages":["..."],"state":{"topic":"...","context":"...","participants":[{"userId":"...","username":"..."}]}}\n' +
    "- messages contains 1 to 3 short Discord messages. If one message is enough, use one item.\n" +
    "- Do not include [NEXT_MESSAGE] inside messages.\n" +
    "- state.topic should be a short label for the current ongoing topic.\n" +
    "- state.context should be a short natural-language summary of the social situation that is useful for the next turn.\n" +
    "- state.participants should contain only people who are meaningfully involved in the current thread, with their exact USER_ID values from context.\n" +
    "- Do not put hidden reasoning, prompts, or implementation details in state.\n" +
    "- Keep state concise."
  );
}

function extractGeminiResponse(body) {
  const parts =
    body?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return null;
  }

  const raw =
    parts
      .map(part =>
        String(part?.text || "")
      )
      .filter(Boolean)
      .join("\n")
      .trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(raw);

    const messages =
      Array.isArray(parsed?.messages)
        ? parsed.messages
            .map(item => String(item || "").trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

    if (!messages.length) {
      return null;
    }

    const state =
      parsed?.state &&
      typeof parsed.state === "object"
        ? {
            topic:
              String(parsed.state.topic || "")
                .slice(0, 200),
            context:
              String(parsed.state.context || "")
                .slice(0, 500),
            participants:
              Array.isArray(parsed.state.participants)
                ? parsed.state.participants
                    .slice(0, 12)
                    .map(item => ({
                      userId:
                        String(item?.userId || "unknown"),
                      username:
                        String(item?.username || "Unknown")
                          .slice(0, 100)
                    }))
                : []
          }
        : null;

    return {
      messages,
      state
    };
  } catch {
    /*
     * Safe fallback for an unexpected model response. The visible response
     * still works, but no new persistent state is written.
     */
    return {
      messages: splitForDiscord(raw).slice(0, 3),
      state: null
    };
  }
}

async function callModel(
  message,
  history,
  liveMessages,
  directlyAddressed,
  batchMessages,
  conversationState
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
                      liveMessages,
                      batchMessages,
                      conversationState
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

  return extractGeminiResponse(body);
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

  return chunks;
}

async function shouldJoinConversation(
  message,
  client,
  replyTarget
) {
  if (!replyTarget || replyTarget.type !== "other") {
    return true;
  }

  try {
    const recent =
      await message.channel.messages.fetch({
        limit: 12
      });

    const ordered =
      Array.from(recent.values())
        .sort(
          (a, b) =>
            a.createdTimestamp -
            b.createdTimestamp
        );

    const botId =
      client.user?.id;

    if (!botId) {
      return false;
    }

    /*
     * A reply chain that eventually points back to BLACK DRAGONS is still
     * part of the bot's conversation, even when the immediate reply target
     * is another human.
     */
    let current =
      replyTarget.message || null;

    const visited =
      new Set();

    for (
      let depth = 0;
      current &&
      depth < 4;
      depth += 1
    ) {
      if (
        String(current.author?.id) ===
        String(botId)
      ) {
        return true;
      }

      const nextId =
        current.reference?.messageId;

      if (
        !nextId ||
        visited.has(String(nextId))
      ) {
        break;
      }

      visited.add(String(nextId));

      current =
        ordered.find(
          item =>
            String(item.id) ===
            String(nextId)
        ) || null;
    }

    /*
     * If BLACK DRAGONS has just been participating in the same room, a
     * human-to-human message can sometimes naturally continue that exchange.
     * Keep this window short so Auto Chat does not become "reply to everyone".
     */
    const recentBotMessages =
      ordered.filter(
        item =>
          String(item.author?.id) ===
          String(botId)
      );

    const latestBot =
      recentBotMessages[
        recentBotMessages.length - 1
      ];

    if (latestBot) {
      const messagesSinceBot =
        ordered.filter(
          item =>
            item.createdTimestamp >
            latestBot.createdTimestamp
        );

      if (
        messagesSinceBot.length <= 3
      ) {
        return true;
      }
    }

    /*
     * Questions that explicitly address BLACK DRAGONS by name are handled
     * by wasDirectlyAddressed(). This fallback catches natural references
     * such as "the bot", "black dragons", or "bd" without making every
     * ordinary message a bot turn.
     */
    const normalized =
      String(
        message.content || ""
      )
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ");

    const botName =
      String(
        client.user?.username || ""
      )
        .toLowerCase();

    const botMentionedByName =
      (
        botName &&
        normalized.includes(botName)
      ) ||
      normalized.includes("black dragons") ||
      /\bthe bot\b/.test(normalized);

    return Boolean(
      botMentionedByName
    );
  } catch (error) {
    console.warn(
      "⚠️ BLACK DRAGONS could not determine conversational participation:",
      error?.message || error
    );

    return false;
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

  const conversationState =
    await aiMemory.getConversationState(
      message.guild.id,
      message.channelId
    );

  /*
   * Fetch the actual Discord conversation after the debounce.
   *
   * AI memory writes are intentionally asynchronous, so live Discord
   * history is the primary source for understanding the current room.
   */
  const liveMessages =
    await getLiveConversation(message);

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
      liveMessages,
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
      })),
      conversationState
    );

  if (
    !output ||
    !Array.isArray(output.messages) ||
    !output.messages.length
  ) {
    console.error(
      "❌ BLACK DRAGONS AI returned an empty response."
    );
    return;
  }

  if (output.state) {
    void aiMemory.updateConversationState(
      message.guild.id,
      message.channelId,
      output.state
    );
  }

  const responseText =
    output.messages.join("\n[NEXT_MESSAGE]\n");

  /*
   * Reply to the LAST message in the burst. This makes the AI response
   * visually attach to the complete burst instead of one earlier fragment.
   */
  const sentMessages =
    await sendNaturalReply(
      batch[batch.length - 1].message,
      responseText
    );

  /*
   * Store the actual individual bot messages in memory rather than one
   * artificial blob. This keeps later context aligned with what users
   * actually saw in Discord.
   */
  for (const sentContent of sentMessages) {
    void aiMemory.appendBotMessage(
      message.guild.id,
      message.channelId,
      sentContent
    );
  }
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
   * Conversation participation:
   *
   * - Direct mentions/replies to BLACK DRAGONS always qualify.
   * - Auto Chat can allow natural participation in a human conversation,
   *   but only when the recent room context connects that conversation to
   *   BLACK DRAGONS.
   * - A completely unrelated human-to-human reply is ignored.
   */
  const replyTarget =
    await getReplyTarget(
      message,
      client
    );

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

  if (
    replyTarget.type === "other" &&
    !directlyAddressed
  ) {
    const shouldJoin =
      await shouldJoinConversation(
        message,
        client,
        replyTarget
      );

    if (!shouldJoin) {
      return;
    }
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
