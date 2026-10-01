const { getFirestore } = require("firebase-admin/firestore");

const MAX_MESSAGES = 80;
const MAX_MESSAGE_LENGTH = 1200;
const cache = new Map();
const writeQueues = new Map();

function key(guildId, channelId) {
  return `${String(guildId)}_${String(channelId)}`;
}

function getDb() {
  return getFirestore();
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
    conversationState: {
      topic:
        String(savedState.topic || "").slice(0, 200),
      context:
        String(savedState.context || "").slice(0, 500),
      socialMode:
        String(savedState.socialMode || "casual").slice(0, 40),
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
    participants:
      Array.isArray(
        state.conversationState?.participants
      )
        ? state.conversationState.participants.slice(0, 12)
        : [],
    updatedAt:
      Number(
        state.conversationState?.updatedAt || 0
      )
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
      String(nextState?.topic || "")
        .slice(0, 200),
    context:
      String(nextState?.context || "")
        .slice(0, 500),
    socialMode:
      String(nextState?.socialMode || "casual")
        .slice(0, 40),
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
  appendMessage,
  appendBotMessage,
  getMessages,
  getConversationState,
  updateConversationState
};
