const fs = require("fs");
const path = require("path");

const {
  initializeApp,
  cert,
  getApps
} = require("firebase-admin/app");

const {
  getFirestore
} = require("firebase-admin/firestore");

const DATA_FILE =
  path.join(__dirname, "..", "data.json");

const defaultData = {
  date: "",
  war: 0,
  backup: 0,
  dashboardMessageId: null,

  config: {
    helpDesk: {
      channelId: null,
      warRoleId: null,
      backupRoleId: null
    },

    logs: {
      categoryId: null,
      channels: {
        message: null,
        moderation: null,
        roles: null,
        voice: null,
        users: null,
        invites: null,
        server: null,
        channels: null,
        bot: null,
        general: null
      }
    },

    blacklist: {
      public: {
        enabled: false,
        playerChannelId: null,
        clanChannelId: null,
        playerMessages: {},
        clanMessages: {}
      }
    },

    rank: {
      registrationChannelId: null,
      reviewChannelId: null,
      historyChannelId: null,
      leaderboardChannelId: null,

      rankRoleIds: {
        Z: null,
        SSS: null,
        SS: null,
        S: null,
        A: null,
        B: null,
        C: null,
        D: null,
        E: null
      }
    }
  },

  rankConfig: {
    registrationChannelId: null,
    reviewChannelId: null,
    historyChannelId: null,

    rankRoleIds: {
      Z: null,
      SSS: null,
      SS: null,
      S: null,
      A: null,
      B: null,
      C: null,
      D: null,
      E: null
    }
  },

  rankUsers: {},
  rankApplications: [],
  rankHistory: [],

  /*
   * BLACKLIST
   *
   * Kept separate from rank/player persistence.
   */
  blacklist: {
    players: {},
    clans: {},
    history: []
  }
};

let db = null;
let saveQueue = Promise.resolve();

/* =========================================================
   HELPERS
========================================================= */

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(value, (_, item) => {
      if (typeof item === "bigint") {
        return Number(item);
      }

      return item;
    })
  );
}

function sanitize(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "function") {
    return undefined;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(sanitize)
      .filter(
        item => item !== undefined
      );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const result = {};

    for (
      const [key, item]
      of Object.entries(value)
    ) {
      /*
       * Runtime-only values such as _client
       * must never enter Firestore.
       */
      if (key.startsWith("_")) {
        continue;
      }

      const clean =
        sanitize(item);

      if (clean !== undefined) {
        result[key] = clean;
      }
    }

    return result;
  }

  return value;
}

/* =========================================================
   NORMALIZE
========================================================= */

function normalizeData(saved = {}) {
  const data =
    clone(defaultData);

  data.date =
    saved.date || "";

  data.war =
    Number.isFinite(saved.war)
      ? saved.war
      : 0;

  data.backup =
    Number.isFinite(saved.backup)
      ? saved.backup
      : 0;

  data.dashboardMessageId =
    saved.dashboardMessageId ||
    null;

  data.config.logs = {
    ...data.config.logs,
    ...(saved.config?.logs || {}),
    channels: {
      ...data.config.logs.channels,
      ...(saved.config?.logs?.channels || {})
    }
  };

  data.config.blacklist = {
    ...data.config.blacklist,
    ...(saved.config?.blacklist || {}),
    public: {
      ...data.config.blacklist.public,
      ...(saved.config?.blacklist?.public || {}),
      playerMessages: {
        ...data.config.blacklist.public.playerMessages,
        ...(saved.config?.blacklist?.public?.playerMessages || {})
      },
      clanMessages: {
        ...data.config.blacklist.public.clanMessages,
        ...(saved.config?.blacklist?.public?.clanMessages || {})
      }
    }
  };

  data.config.helpDesk = {
    ...data.config.helpDesk,
    ...(saved.config?.helpDesk || {})
  };

  data.config.rank = {
    ...data.config.rank,
    ...(saved.config?.rank || {}),

    rankRoleIds: {
      ...data.config.rank.rankRoleIds,
      ...(saved.config?.rank?.rankRoleIds || {})
    }
  };

  data.rankConfig = {
    ...data.rankConfig,
    ...(saved.rankConfig || {}),

    rankRoleIds: {
      ...data.rankConfig.rankRoleIds,
      ...(saved.rankConfig?.rankRoleIds || {})
    }
  };

  /*
   * Restore old Rank configuration if required.
   */
  for (
    const key of [
      "registrationChannelId",
      "reviewChannelId",
      "historyChannelId"
    ]
  ) {
    if (
      !data.config.rank[key] &&
      data.rankConfig[key]
    ) {
      data.config.rank[key] =
        data.rankConfig[key];
    }
  }

  for (
    const rank of Object.keys(
      data.config.rank.rankRoleIds
    )
  ) {
    if (
      !data.config.rank.rankRoleIds[rank] &&
      data.rankConfig.rankRoleIds[rank]
    ) {
      data.config.rank.rankRoleIds[rank] =
        data.rankConfig.rankRoleIds[rank];
    }
  }

  /*
   * Keep both config formats synchronized.
   */
  data.rankConfig = {
    ...data.rankConfig,

    registrationChannelId:
      data.config.rank.registrationChannelId,

    reviewChannelId:
      data.config.rank.reviewChannelId,

    historyChannelId:
      data.config.rank.historyChannelId,

    rankRoleIds: {
      ...data.rankConfig.rankRoleIds,
      ...data.config.rank.rankRoleIds
    }
  };

  /*
   * Help Desk environment fallbacks.
   */
  if (
    !data.config.helpDesk.channelId &&
    process.env.DASHBOARD_CHANNEL_ID
  ) {
    data.config.helpDesk.channelId =
      process.env.DASHBOARD_CHANNEL_ID;
  }

  if (
    !data.config.helpDesk.warRoleId &&
    process.env.WAR_ROLE_ID
  ) {
    data.config.helpDesk.warRoleId =
      process.env.WAR_ROLE_ID;
  }

  if (
    !data.config.helpDesk.backupRoleId &&
    process.env.BACKUP_ROLE_ID
  ) {
    data.config.helpDesk.backupRoleId =
      process.env.BACKUP_ROLE_ID;
  }

  data.rankUsers =
    saved.rankUsers &&
    typeof saved.rankUsers === "object"
      ? saved.rankUsers
      : {};

  data.rankApplications =
    Array.isArray(
      saved.rankApplications
    )
      ? saved.rankApplications
      : [];

  data.rankHistory =
    Array.isArray(saved.rankHistory)
      ? saved.rankHistory
      : [];

  data.blacklist = {
    players:
      saved.blacklist?.players &&
      typeof saved.blacklist.players === "object"
        ? saved.blacklist.players
        : {},
    clans:
      saved.blacklist?.clans &&
      typeof saved.blacklist.clans === "object"
        ? saved.blacklist.clans
        : {},
    history:
      Array.isArray(saved.blacklist?.history)
        ? saved.blacklist.history
        : []
  };

  return data;
}

/* =========================================================
   LOCAL FILE
========================================================= */

function loadLocalData() {
  let saved = {};

  try {
    if (fs.existsSync(DATA_FILE)) {
      saved = JSON.parse(
        fs.readFileSync(
          DATA_FILE,
          "utf8"
        )
      );
    }
  } catch (error) {
    console.error(
      "❌ Could not load data.json:",
      error
    );
  }

  return normalizeData(saved);
}

function writeLocalData(data) {
  try {
    const clean =
      sanitize(data);

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        clean,
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      "❌ Could not save data.json:",
      error
    );
  }
}

/* =========================================================
   FIREBASE
========================================================= */

function initializeFirebase() {
  if (db) {
    return db;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL;

  const privateKey =
    process.env.FIREBASE_PRIVATE_KEY;

  if (
    !projectId ||
    !clientEmail ||
    !privateKey
  ) {
    throw new Error(
      "Missing Firebase environment variables. Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  const credential = {
    projectId,
    clientEmail,

    privateKey:
      privateKey.replace(
        /\\n/g,
        "\n"
      )
  };

  if (!getApps().length) {
    initializeApp({
      credential:
        cert(credential)
    });
  }

  db = getFirestore();

  console.log(
    "🔥 Firebase Firestore connected."
  );

  return db;
}

/* =========================================================
   FIRESTORE READ
========================================================= */

async function readFirestoreData() {
  const firestore =
    initializeFirebase();

  const result = {};

  const [
    configSnap,
    rankConfigSnap,
    metaSnap,
    countersSnap
  ] = await Promise.all([
    firestore
      .collection("config")
      .doc("server")
      .get(),

    firestore
      .collection("rankConfig")
      .doc("server")
      .get(),

    firestore
      .collection("meta")
      .doc("server")
      .get(),

    firestore
      .collection("helpDesk")
      .doc("counters")
      .get()
  ]);

  if (configSnap.exists) {
    result.config =
      configSnap.data();
  }

  if (rankConfigSnap.exists) {
    result.rankConfig =
      rankConfigSnap.data();
  }

  if (metaSnap.exists) {
    const meta =
      metaSnap.data();

    if (
      meta.date !== undefined
    ) {
      result.date =
        meta.date;
    }

    if (
      meta.dashboardMessageId !==
      undefined
    ) {
      result.dashboardMessageId =
        meta.dashboardMessageId;
    }
  }

  if (countersSnap.exists) {
    const counters =
      countersSnap.data();

    if (
      counters.date !== undefined
    ) {
      result.date =
        counters.date;
    }

    if (
      counters.war !== undefined
    ) {
      result.war =
        counters.war;
    }

    if (
      counters.backup !== undefined
    ) {
      result.backup =
        counters.backup;
    }
  }

  const [
    playersSnap,
    applicationsSnap,
    historySnap,
    blacklistPlayersSnap,
    blacklistClansSnap,
    blacklistHistorySnap
  ] = await Promise.all([
    firestore
      .collection("players")
      .get(),

    firestore
      .collection("applications")
      .get(),

    firestore
      .collection("rankHistory")
      .get(),

    firestore
      .collection("blacklistPlayers")
      .get(),

    firestore
      .collection("blacklistClans")
      .get(),

    firestore
      .collection("blacklistHistory")
      .get()
  ]);

  result.rankUsers = {};

  for (
    const doc of playersSnap.docs
  ) {
    result.rankUsers[doc.id] =
      doc.data();
  }

  result.rankApplications =
    applicationsSnap.docs.map(
      doc => doc.data()
    );

  result.rankHistory =
    historySnap.docs.map(
      doc => doc.data()
    );

  result.blacklist = {
    players: {},
    clans: {},
    history: blacklistHistorySnap.docs.map(doc => doc.data())
  };

  for (const doc of blacklistPlayersSnap.docs) {
    result.blacklist.players[doc.id] = doc.data();
  }

  for (const doc of blacklistClansSnap.docs) {
    result.blacklist.clans[doc.id] = doc.data();
  }

  console.log(
    `☁️ Firestore: ${
      Object.keys(result.rankUsers).length
    } players, ${
      result.rankApplications.length
    } applications, ${
      result.rankHistory.length
    } history records.`
  );

  return result;
}

/* =========================================================
   NEWEST RECORD WINS
========================================================= */

function recordTimestamp(record) {
  if (!record) {
    return 0;
  }

  const timestamps = [
    record.updatedAt,
    record.lastActivityAt,
    record.reviewedAt,
    record.closedAt,
    record.verifiedAt,
    record.createdAt
  ];

  for (
    const value of timestamps
  ) {
    const number =
      Number(value);

    if (
      Number.isFinite(number) &&
      number > 0
    ) {
      return number;
    }
  }

  return 0;
}

function newestRecord(
  local,
  cloud
) {
  if (!local) {
    return cloud;
  }

  if (!cloud) {
    return local;
  }

  const localTime =
    recordTimestamp(local);

  const cloudTime =
    recordTimestamp(cloud);

  return cloudTime >= localTime
    ? cloud
    : local;
}

/* =========================================================
   APPLICATION MERGE
========================================================= */

function mergeApplications(
  local = [],
  cloud = []
) {
  const map = new Map();

  for (
    const application of local
  ) {
    if (
      application?.id !== undefined
    ) {
      map.set(
        String(application.id),
        application
      );
    }
  }

  for (
    const application of cloud
  ) {
    if (
      application?.id !== undefined
    ) {
      const id =
        String(application.id);

      map.set(
        id,
        newestRecord(
          map.get(id),
          application
        )
      );
    }
  }

  return [
    ...map.values()
  ];
}

/* =========================================================
   PLAYER MERGE
========================================================= */

function mergePlayers(
  local = {},
  cloud = {}
) {
  const merged = {};

  const ids = new Set([
    ...Object.keys(local),
    ...Object.keys(cloud)
  ]);

  for (
    const id of ids
  ) {
    merged[id] =
      newestRecord(
        local[id],
        cloud[id]
      );
  }

  return merged;
}

/* =========================================================
   HISTORY MERGE
========================================================= */

function mergeHistory(
  local = [],
  cloud = []
) {
  const map = new Map();

  for (
    const entry of [
      ...local,
      ...cloud
    ]
  ) {
    if (!entry) {
      continue;
    }

    const id =
      [
        entry.applicationId || "",
        entry.action || "",
        entry.timestamp || ""
      ].join(":");

    map.set(
      id,
      entry
    );
  }

  return [
    ...map.values()
  ];
}

/* =========================================================
   RECONCILE
========================================================= */

function reconcileData(
  local,
  cloud
) {
  const localData =
    normalizeData(local);

  const cloudData =
    normalizeData(cloud);

  const data =
    normalizeData(localData);

  /*
   * Config
   */
  data.config = {
    ...localData.config,
    ...cloudData.config,

    helpDesk: {
      ...localData.config.helpDesk,
      ...cloudData.config.helpDesk
    },

    logs: {
      ...localData.config.logs,
      ...cloudData.config.logs,

      channels: {
        ...localData.config.logs.channels,
        ...cloudData.config.logs.channels
      }
    },

    blacklist: {
      ...localData.config.blacklist,
      ...cloudData.config.blacklist,

      public: {
        ...localData.config.blacklist.public,
        ...cloudData.config.blacklist.public,

        playerMessages: {
          ...localData.config.blacklist.public.playerMessages,
          ...cloudData.config.blacklist.public.playerMessages
        },

        clanMessages: {
          ...localData.config.blacklist.public.clanMessages,
          ...cloudData.config.blacklist.public.clanMessages
        }
      }
    },

    rank: {
      ...localData.config.rank,
      ...cloudData.config.rank,

      rankRoleIds: {
        ...localData.config.rank.rankRoleIds,
        ...cloudData.config.rank.rankRoleIds
      }
    }
  };

  /*
   * Keep config values from local data when cloud
   * has no value.
   */
  for (
    const key of [
      "registrationChannelId",
      "reviewChannelId",
      "historyChannelId"
    ]
  ) {
    if (
      !data.config.rank[key]
    ) {
      data.config.rank[key] =
        localData.config.rank[key] ||
        cloudData.config.rank[key] ||
        null;
    }
  }

  data.rankConfig = {
    ...localData.rankConfig,
    ...cloudData.rankConfig,

    registrationChannelId:
      data.config.rank.registrationChannelId,

    reviewChannelId:
      data.config.rank.reviewChannelId,

    historyChannelId:
      data.config.rank.historyChannelId,

    rankRoleIds: {
      ...localData.rankConfig.rankRoleIds,
      ...cloudData.rankConfig.rankRoleIds,
      ...data.config.rank.rankRoleIds
    }
  };

  /*
   * PLAYERS
   *
   * Newer player record wins.
   */
  data.rankUsers =
    mergePlayers(
      localData.rankUsers,
      cloudData.rankUsers
    );

  /*
   * APPLICATIONS
   *
   * THIS IS THE IMPORTANT FIX.
   *
   * Firestore no longer blindly overwrites local state.
   * The application with the newest updatedAt/
   * lastActivityAt wins.
   */
  data.rankApplications =
    mergeApplications(
      localData.rankApplications,
      cloudData.rankApplications
    );

  /*
   * HISTORY is additive.
   */
  data.rankHistory =
    mergeHistory(
      localData.rankHistory,
      cloudData.rankHistory
    );

  /*
   * BLACKLIST
   *
   * Additive by entry ID. Never touch rankUsers.
   */
  data.blacklist = {
    players: {
      ...(localData.blacklist?.players || {}),
      ...(cloudData.blacklist?.players || {})
    },
    clans: {
      ...(localData.blacklist?.clans || {}),
      ...(cloudData.blacklist?.clans || {})
    },
    history: [
      ...(localData.blacklist?.history || []),
      ...(cloudData.blacklist?.history || [])
    ].filter((entry, index, array) =>
      array.findIndex(item =>
        String(item.id || "") === String(entry.id || "") &&
        String(item.action || "") === String(entry.action || "") &&
        Number(item.timestamp || 0) === Number(entry.timestamp || 0)
      ) === index
    )
  };

  /*
   * General metadata.
   */
  if (cloudData.date) {
    data.date =
      cloudData.date;
  }

  if (
    cloudData.dashboardMessageId
  ) {
    data.dashboardMessageId =
      cloudData.dashboardMessageId;
  }

  /*
   * Help Desk counters.
   */
  if (
    cloudData.date === data.date
  ) {
    if (
      cloudData.war !== undefined
    ) {
      data.war =
        cloudData.war;
    }

    if (
      cloudData.backup !== undefined
    ) {
      data.backup =
        cloudData.backup;
    }
  }

  return normalizeData(data);
}

/* =========================================================
   FIRESTORE SAVE
========================================================= */

async function saveFirestoreData(
  data
) {
  const firestore =
    initializeFirebase();

  const clean =
    sanitize(data);

  await Promise.all([
    /*
     * SERVER CONFIG
     *
     * This document is the persistent source of truth for administrator
     * configuration, including config.logs.channels. The exact channel IDs
     * selected in /setup are stored here and loaded again on every startup.
     */
    firestore
      .collection("config")
      .doc("server")
      .set(
        clean.config,
        { merge: true }
      ),

    firestore
      .collection("rankConfig")
      .doc("server")
      .set(
        clean.rankConfig,
        { merge: true }
      ),

    firestore
      .collection("meta")
      .doc("server")
      .set(
        {
          date:
            clean.date || "",

          dashboardMessageId:
            clean.dashboardMessageId ||
            null,

          updatedAt:
            Date.now()
        },
        { merge: true }
      ),

    firestore
      .collection("helpDesk")
      .doc("counters")
      .set(
        {
          date:
            clean.date || "",

          war:
            Number(clean.war) || 0,

          backup:
            Number(clean.backup) || 0,

          updatedAt:
            Date.now()
        },
        { merge: true }
      )
  ]);

  /*
   * PLAYERS
   *
   * Never delete them.
   */
  const playerBatch =
    firestore.batch();

  for (
    const [userId, player]
    of Object.entries(
      clean.rankUsers || {}
    )
  ) {
    playerBatch.set(
      firestore
        .collection("players")
        .doc(String(userId)),
      player,
      { merge: true }
    );
  }

  await playerBatch.commit();

  /*
   * APPLICATIONS
   *
   * Never delete them.
   */
  const applicationBatch =
    firestore.batch();

  for (
    const application
    of clean.rankApplications || []
  ) {
    if (
      application?.id === undefined
    ) {
      continue;
    }

    applicationBatch.set(
      firestore
        .collection("applications")
        .doc(
          String(application.id)
        ),
      application,
      { merge: true }
    );
  }

  await applicationBatch.commit();

  /*
   * BLACKLIST
   *
   * Stored in dedicated Firestore collections.
   * This is intentionally separate from players/rank history.
   */
  const blacklist = clean.blacklist || { players: {}, clans: {}, history: [] };

  const blacklistPlayerBatch = firestore.batch();
  for (const [id, entry] of Object.entries(blacklist.players || {})) {
    blacklistPlayerBatch.set(
      firestore.collection("blacklistPlayers").doc(String(id)),
      entry,
      { merge: true }
    );
  }
  await blacklistPlayerBatch.commit();

  const blacklistClanBatch = firestore.batch();
  for (const [id, entry] of Object.entries(blacklist.clans || {})) {
    blacklistClanBatch.set(
      firestore.collection("blacklistClans").doc(String(id)),
      entry,
      { merge: true }
    );
  }
  await blacklistClanBatch.commit();

  for (const entry of blacklist.history || []) {
    if (!entry?.id) continue;
    const historyId = [
      entry.id,
      entry.action || "unknown",
      entry.timestamp || Date.now()
    ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150);

    await firestore
      .collection("blacklistHistory")
      .doc(historyId)
      .set(entry, { merge: true });
  }

  /*
   * HISTORY
   *
   * Never delete it.
   */
  for (
    const entry
    of clean.rankHistory || []
  ) {
    const id =
      [
        entry.applicationId || "unknown",
        entry.action || "unknown",
        entry.timestamp || Date.now()
      ]
        .join("_")
        .replace(
          /[^a-zA-Z0-9_-]/g,
          "_"
        )
        .slice(0, 150);

    await firestore
      .collection("rankHistory")
      .doc(id)
      .set(
        entry,
        { merge: true }
      );
  }
}

/* =========================================================
   INITIALIZE
========================================================= */

async function initializeDatabase() {
  initializeFirebase();

  const localData =
    loadLocalData();

  const cloudData =
    await readFirestoreData();

  const merged =
    reconcileData(
      localData,
      cloudData
    );

  checkDailyResetWithoutSave(
    merged
  );

  /*
   * Keep local backup.
   */
  writeLocalData(merged);

  /*
   * Push reconciled data back to Firestore.
   */
  await saveFirestoreData(
    merged
  );

  console.log(
    "💾 Database reconciliation complete."
  );

  return merged;
}

/* =========================================================
   SAVE
========================================================= */

function saveData(data) {
  /*
   * Always save local backup immediately.
   */
  writeLocalData(data);

  if (!db) {
    return Promise.resolve();
  }

  /*
   * Snapshot the state at the time saveData() was called.
   */
  const snapshot =
    clone(data);

  /*
   * Queue Firestore writes so writes cannot race each other.
   */
  saveQueue =
    saveQueue
      .then(() =>
        saveFirestoreData(
          snapshot
        )
      )
      .catch(error => {
        console.error(
          "❌ Firestore save failed:",
          error
        );
      });

  return saveQueue;
}

/* =========================================================
   DAILY RESET
========================================================= */

function getToday() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(new Date());
}

function checkDailyResetWithoutSave(
  data
) {
  const today =
    getToday();

  if (data.date !== today) {
    data.date = today;
    data.war = 0;
    data.backup = 0;

    return true;
  }

  return false;
}

function checkDailyReset(data) {
  const changed =
    checkDailyResetWithoutSave(
      data
    );

  if (changed) {
    saveData(data);
  }

  return changed;
}

/* =========================================================
   COMPATIBILITY
========================================================= */

function loadData() {
  return loadLocalData();
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  DATA_FILE,
  initializeDatabase,
  loadData,
  saveData,
  getToday,
  checkDailyReset
};
