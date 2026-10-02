const { getFirestore } = require("firebase-admin/firestore");

const MAX_MESSAGES = 80;
const MAX_MESSAGE_LENGTH = 1200;
const cache = new Map();
const writeQueues = new Map();

const USER_MEMORY_COLLECTION = "aiUserMemory";
const BOT_STATE_COLLECTION = "aiBotState";
const MAX_USER_FACTS = 20;
const MAX_USER_FACT_LENGTH = 180;
const userMemoryCache = new Map();
const userMemoryWriteQueues = new Map();

function key(guildId, channelId) {
  return `${String(guildId)}_${String(channelId)}`;
}

function getDb() {
  return getFirestore();
}

function userMemoryKey(guildId, userId) {
  return `${String(guildId)}_${String(userId)}`;
}

function isSafeUserFact(fact) {
  return !/\b(password|passcode|token|api key|secret|home address|phone number|email address|bank account|credit card|medical|health|diagnos|medication|religion|politic|sexual orientation|sex life)\b/i.test(
    String(fact || "")
  );
}
function cleanUserFacts(facts) {
  if (!Array.isArray(facts)) {
    return [];
  }

  const unique = [];
  const seen = new Set();

  for (const item of facts) {
    const fact = String(item || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_USER_FACT_LENGTH);

    const normalized = fact.toLowerCase();

    if (!fact || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(fact);
  }

  return unique.slice(-MAX_USER_FACTS);
}

async function getUserMemory(guildId, userId) {
  const memoryKey = userMemoryKey(guildId, userId);

  if (userMemoryCache.has(memoryKey)) {
    return userMemoryCache.get(memoryKey).slice();
  }

  const snap = await getDb()
    .collection(USER_MEMORY_COLLECTION)
    .doc(memoryKey)
    .get();

  const facts = cleanUserFacts(
    snap.exists ? snap.data()?.facts : []
  );

  userMemoryCache.set(memoryKey, facts);
  return facts.slice();
}

async function updateUserMemory(
  guildId,
  userId,
  rememberFacts,
  forgetFacts,
  forgetAll = false
) {
  const memoryKey = userMemoryKey(guildId, userId);
  const previous = userMemoryWriteQueues.get(memoryKey) || Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(async () => {
      const ref = getDb()
        .collection(USER_MEMORY_COLLECTION)
        .doc(memoryKey);

      const snap = await ref.get();
      let facts = cleanUserFacts(
        snap.exists ? snap.data()?.facts : []
      );

      if (forgetAll) {
        facts = [];
      } else {
        const removals = new Set(
          cleanUserFacts(forgetFacts)
            .map(fact => fact.toLowerCase())
        );

        if (removals.size) {
          facts = facts.filter(
            fact => !removals.has(fact.toLowerCase())
          );
        }

        const existing = new Set(
          facts.map(fact => fact.toLowerCase())
        );

        for (const fact of cleanUserFacts(rememberFacts)) {
          if (!isSafeUserFact(fact)) {
            continue;
          }

          const normalized = fact.toLowerCase();

          if (!existing.has(normalized)) {
            facts.push(fact);
            existing.add(normalized);
          }
        }

        facts = facts.slice(-MAX_USER_FACTS);
      }

      await ref.set({
        facts,
        updatedAt: Date.now()
      });

      userMemoryCache.set(memoryKey, facts);
      return facts.slice();
    })
    .catch(error => {
      console.error("❌ AI user memory save failed:", error);
      return null;
    });

  userMemoryWriteQueues.set(memoryKey, next);
  return next;
}

/*
 * Store aggregate operational metrics only. No message text, user IDs,
 * prompts, or AI responses are written to this collection.
 */
async function recordAIRequest(
  guildId,
  latencyMs,
  success,
  outputMessages = 0
) {
  const day = new Date().toISOString().slice(0, 10);
  const docId = String(guildId) + "_" + day;
  const ref = getDb().collection("aiTelemetry").doc(docId);

  try {
    await getDb().runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const current = snap.exists ? snap.data() : {};

      transaction.set(ref, {
        guildId: String(guildId),
        day,
        requestCount: Number(current.requestCount || 0) + 1,
        successCount: Number(current.successCount || 0) + (success ? 1 : 0),
        failureCount: Number(current.failureCount || 0) + (success ? 0 : 1),
        totalLatencyMs: Number(current.totalLatencyMs || 0) + Math.max(0, Number(latencyMs || 0)),
        totalOutputMessages: Number(current.totalOutputMessages || 0) + Math.max(0, Number(outputMessages || 0)),
        updatedAt: Date.now()
      }, { merge: true });
    });
  } catch (error) {
    console.warn("⚠️ BLACK DRAGONS AI telemetry save failed:", error?.message || error);
  }
}

/*
 * Persistent BLACK DRAGONS mood/energy state.
 * This describes the bot's conversational energy, never a member's mood.
 * A little energy returns during inactivity so the bot cannot get stuck sleepy.
 */
async function advanceBotMood(guildId, now = Date.now()) {
  const ref = getDb().collection(BOT_STATE_COLLECTION).doc(String(guildId));
  try {
    return await getDb().runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const saved = snap.exists ? snap.data() : {};
      const previousEnergy = Math.max(0, Math.min(90, Number(saved.energy ?? 90)));
      const lastActive = Number(saved.lastActive || now);
      const idleMs = Math.max(0, now - lastActive);
      const recoveredEnergy = Math.min(90, previousEnergy + Math.floor(idleMs / (30 * 60 * 1000)));
      const energy = Math.max(0, recoveredEnergy - 1);
      const idleHours = idleMs / (60 * 60 * 1000);
      let mood = String(saved.mood || "happy");
      if (energy < 20) mood = "sleepy";
      else if (energy < 40) mood = "chill";
      else if (idleHours > 6) mood = "just woke up";
      else if (energy > 70) mood = "happy";
      const next = { mood, energy, lastActive: now, updatedAt: now };
      transaction.set(ref, next, { merge: true });
      return next;
    });
  } catch (error) {
    console.warn("⚠️ BLACK DRAGONS bot mood save failed:", error?.message || error);
    return { mood: "neutral", energy: 70, lastActive: now };
  }
}

function cleanMessage(message) {
  return {
    userId: String(message.userId),
    username: String(message.username || "Unknown").slice(0, 100),
    content: String(message.content || "").slice(0, MAX_MESSAGE_LENGTH),
    timestamp: Number(message.timestamp || Date.now()),
    isBot: Boolean(message.isBot)
  };
}

async function loadChannel(guildId, channelId) {
  const cacheKey = key(guildId, channelId);

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const snap = await getDb()
    .collection("aiMemory")
    .doc(cacheKey)
    .get();

  const messages =
    snap.exists && Array.isArray(snap.data()?.messages)
      ? snap.data().messages.slice(-MAX_MESSAGES)
      : [];

  const savedState =
    snap.exists && snap.data()?.state &&
    typeof snap.data().state === "object"
      ? snap.data().state
      : {};

  const state = {
    messages,
    resetAt: Number(snap.exists ? snap.data()?.resetAt || 0 : 0),
    conversationState: {
      topic:
        String(savedState.topic || "").slice(0, 200),
      context:
        String(savedState.context || "").slice(0, 500),
      socialMode:
        String(savedState.socialMode || "casual").slice(0, 40),
      callback:
        String(savedState.callback || "").slice(0, 300),
      emotionalState:
        String(savedState.emotionalState || "neutral").slice(0, 30),
      topicContext:
        String(savedState.topicContext || "casual").slice(0, 30),
      participants:
        Array.isArray(savedState.participants)
          ? savedState.participants
              .slice(0, 12)
              .map(item => ({
                userId:
                  String(item?.userId || "unknown"),
                username:
                  String(item?.username || "Unknown")
                    .slice(0, 100)
              }))
          : [],
      updatedAt:
        Number(savedState.updatedAt || 0)
    }
  };
  cache.set(cacheKey, state);
  return state;
}

function queueWrite(guildId, channelId, state) {
  const cacheKey = key(guildId, channelId);
  const previous = writeQueues.get(cacheKey) || Promise.resolve();

  const snapshot = {
    messages: state.messages.slice(-MAX_MESSAGES),
    resetAt: Number(state.resetAt || 0),
    state: {
      topic:
        String(state.conversationState?.topic || "")
          .slice(0, 200),
      context:
        String(state.conversationState?.context || "")
          .slice(0, 500),
      socialMode:
        String(state.conversationState?.socialMode || "casual")
          .slice(0, 40),
      callback:
        String(state.conversationState?.callback || "")
          .slice(0, 300),
      emotionalState:
        String(state.conversationState?.emotionalState || "neutral").slice(0, 30),
      topicContext:
        String(state.conversationState?.topicContext || "casual").slice(0, 30),
      participants:
        Array.isArray(state.conversationState?.participants)
          ? state.conversationState.participants
              .slice(0, 12)
          : [],
      updatedAt: Date.now()
    },
    updatedAt: Date.now()
  };

  const next = previous
    .catch(() => {})
    .then(() =>
      getDb()
        .collection("aiMemory")
        .doc(cacheKey)
        .set(snapshot, { merge: true })
    )
    .catch(error => {
      console.error("❌ AI memory save failed:", error);
    });

  writeQueues.set(cacheKey, next);
  return next;
}

async function resetChannelConversation(guildId, channelId) {
  const state = await loadChannel(guildId, channelId);
  state.messages = [];
  state.conversationState = {
    topic: "",
    context: "",
    socialMode: "casual",
    callback: "",
    emotionalState: "neutral",
    topicContext: "casual",
    participants: [],
    updatedAt: Date.now()
  };
  state.resetAt = Date.now();
  await queueWrite(guildId, channelId, state);
  return { resetAt: state.resetAt };
}

async function appendMessage(guildId, channelId, message) {
  const state = await loadChannel(guildId, channelId);

  state.messages.push(
    cleanMessage(message)
  );

  state.messages =
    state.messages.slice(-MAX_MESSAGES);

  await queueWrite(
    guildId,
    channelId,
    state
  );

  return state.messages;
}

async function appendBotMessage(
  guildId,
  channelId,
  content
) {
  return appendMessage(
    guildId,
    channelId,
    {
      userId: "BLACK_DRAGONS_AI",
      username: "BLACK DRAGONS",
      content,
      timestamp: Date.now(),
      isBot: true
    }
  );
}

async function getMessages(
  guildId,
  channelId
) {
  const state =
    await loadChannel(
      guildId,
      channelId
    );

  return state.messages.slice(
    -MAX_MESSAGES
  );
}

async function getConversationState(
  guildId,
  channelId
) {
  const state =
    await loadChannel(
      guildId,
      channelId
    );

  return {
    topic:
      String(
        state.conversationState?.topic || ""
      ),
    context:
      String(
        state.conversationState?.context || ""
      ),
    socialMode:
      String(
        state.conversationState?.socialMode || "casual"
      ),
    callback:
      String(
        state.conversationState?.callback || ""
      ),
    emotionalState:
      String(state.conversationState?.emotionalState || "neutral"),
    topicContext:
      String(state.conversationState?.topicContext || "casual"),
    participants:
      Array.isArray(
        state.conversationState?.participants
      )
        ? state.conversationState.participants.slice(0, 12)
        : [],
    updatedAt:
      Number(
        state.conversationState?.updatedAt || 0
      ),
    resetAt: Number(state.resetAt || 0)
  };
}

async function updateConversationState(
  guildId,
  channelId,
  nextState
) {
  const state =
    await loadChannel(
      guildId,
      channelId
    );

  state.conversationState = {
    topic:
      String(nextState?.topic ?? state.conversationState?.topic ?? "")
        .slice(0, 200),
    context:
      String(nextState?.context ?? state.conversationState?.context ?? "")
        .slice(0, 500),
    socialMode:
      String(nextState?.socialMode ?? state.conversationState?.socialMode ?? "casual")
        .slice(0, 40),
    callback:
      String(nextState?.callback ?? state.conversationState?.callback ?? "")
        .slice(0, 300),
    emotionalState:
      ["neutral", "playful", "flustered", "excited", "caring"].includes(String(nextState?.emotionalState || ""))
        ? String(nextState.emotionalState)
        : String(state.conversationState?.emotionalState || "neutral"),
    topicContext:
      ["casual", "gaming", "anime", "supportive"].includes(String(nextState?.topicContext || ""))
        ? String(nextState.topicContext)
        : String(state.conversationState?.topicContext || "casual"),
    participants:
      Array.isArray(nextState?.participants)
        ? nextState.participants
            .slice(0, 12)
            .map(item => ({
              userId:
                String(item?.userId || "unknown"),
              username:
                String(item?.username || "Unknown")
                  .slice(0, 100)
            }))
        : Array.isArray(state.conversationState?.participants)
          ? state.conversationState.participants.slice(0, 12)
          : [],
    updatedAt: Date.now()
  };

  await queueWrite(
    guildId,
    channelId,
    state
  );

  return state.conversationState;
}

module.exports = {
  loadChannel,
  resetChannelConversation,
  appendMessage,
  appendBotMessage,
  getMessages,
  getConversationState,
  updateConversationState,
  advanceBotMood,
  getUserMemory,
  updateUserMemory,
  recordAIRequest
};
