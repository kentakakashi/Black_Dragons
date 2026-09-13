const fs = require("fs");
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const DATA_FILE = path.join(__dirname, "..", "data.json");

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

  // Kept for compatibility with the older Rank system.
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
  rankHistory: []
};

let db = null;
let saveQueue = Promise.resolve();

/* ==================================================
   SAFE HELPERS
================================================== */

function clone(value) {
  if (value === undefined) return undefined;

  return JSON.parse(
    JSON.stringify(value, (_, item) => {
      if (typeof item === "bigint") {
        return Number(item);
      }

      return item;
    })
  );
}

/*
  Removes temporary runtime properties.

  IMPORTANT:
  rankSystem temporarily uses application._client.
  We NEVER want that Discord client object saved to disk
  or Firestore.
*/
function sanitize(value) {
  if (value === undefined) return undefined;

  if (typeof value === "function") {
    return undefined;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(sanitize)
      .filter(item => item !== undefined);
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith("_")) {
        continue;
      }

      const clean = sanitize(item);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return value;
}

/* ==================================================
   NORMALIZE DATA
================================================== */

function normalizeData(saved = {}) {
  const data = clone(defaultData);

  data.date = saved.date || "";

  data.war = Number.isFinite(saved.war)
    ? saved.war
    : 0;

  data.backup = Number.isFinite(saved.backup)
    ? saved.backup
    : 0;

  data.dashboardMessageId =
    saved.dashboardMessageId || null;

  /* -----------------------------------------------
     HELP DESK CONFIG
  ------------------------------------------------ */

  data.config.helpDesk = {
    ...data.config.helpDesk,
    ...(saved.config?.helpDesk || {})
  };

  /* -----------------------------------------------
     RANK CONFIG
  ------------------------------------------------ */

  data.config.rank = {
    ...data.config.rank,
    ...(saved.config?.rank || {}),

    rankRoleIds: {
      ...data.config.rank.rankRoleIds,
      ...(saved.config?.rank?.rankRoleIds || {})
    }
  };

  /* -----------------------------------------------
     LEGACY RANK CONFIG
  ------------------------------------------------ */

  data.rankConfig = {
    ...data.rankConfig,
    ...(saved.rankConfig || {}),

    rankRoleIds: {
      ...data.rankConfig.rankRoleIds,
      ...(saved.rankConfig?.rankRoleIds || {})
    }
  };

  /*
    Old Rank configuration can still contain the
    channel IDs. Restore them if the new config is empty.
  */

  for (const key of [
    "registrationChannelId",
    "reviewChannelId",
    "historyChannelId"
  ]) {
    if (
      !data.config.rank[key] &&
      data.rankConfig[key]
    ) {
      data.config.rank[key] =
        data.rankConfig[key];
    }
  }

  /*
    Same thing for rank roles.
  */

  for (const rank of Object.keys(
    data.config.rank.rankRoleIds
  )) {
    if (
      !data.config.rank.rankRoleIds[rank] &&
      data.rankConfig.rankRoleIds[rank]
    ) {
      data.config.rank.rankRoleIds[rank] =
        data.rankConfig.rankRoleIds[rank];
    }
  }

  /*
    Keep old and new formats synchronized.
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

  /* -----------------------------------------------
     ENVIRONMENT FALLBACKS
  ------------------------------------------------ */

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

  /* -----------------------------------------------
     PLAYER / APPLICATION / HISTORY DATA
  ------------------------------------------------ */

  data.rankUsers =
    saved.rankUsers &&
    typeof saved.rankUsers === "object"
      ? saved.rankUsers
      : {};

  data.rankApplications =
    Array.isArray(saved.rankApplications)
      ? saved.rankApplications
      : [];

  data.rankHistory =
    Array.isArray(saved.rankHistory)
      ? saved.rankHistory
      : [];

  return data;
}

/* ==================================================
   LOCAL DATA
================================================== */

function loadLocalData() {
  let saved = {};

  try {
    if (fs.existsSync(DATA_FILE)) {
      saved = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
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
    const clean = sanitize(data);

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(clean, null, 2)
    );
  } catch (error) {
    console.error(
      "❌ Could not save data.json:",
      error
    );
  }
}

/* ==================================================
   FIREBASE
================================================== */

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
    privateKey: privateKey.replace(
      /\\n/g,
      "\n"
    )
  };

  if (!getApps().length) {
    initializeApp({
      credential: cert(credential)
    });
  }

  db = getFirestore();

  console.log(
    "🔥 Firebase Firestore connected."
  );

  return db;
}

/* ==================================================
   READ FIRESTORE
================================================== */

async function readFirestoreData() {
  const firestore =
    initializeFirebase();

  const result = {};

  console.log(
    "☁️ Loading persistent data from Firestore..."
  );

  const [
    configSnap,
    legacyRankSnap,
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

  if (legacyRankSnap.exists) {
    result.rankConfig =
      legacyRankSnap.data();
  }

  if (metaSnap.exists) {
    const meta =
      metaSnap.data();

    if (meta.date !== undefined) {
      result.date = meta.date;
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

    if (counters.date !== undefined) {
      result.date = counters.date;
    }

    if (counters.war !== undefined) {
      result.war = counters.war;
    }

    if (counters.backup !== undefined) {
      result.backup = counters.backup;
    }
  }

  const [
    playersSnap,
    applicationsSnap,
    historySnap
  ] = await Promise.all([
    firestore
      .collection("players")
      .get(),

    firestore
      .collection("applications")
      .get(),

    firestore
      .collection("rankHistory")
      .get()
  ]);

  result.rankUsers = {};

  for (const doc of playersSnap.docs) {
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

  console.log(
    `👥 Players loaded: ${Object.keys(
      result.rankUsers
    ).length}`
  );

  console.log(
    `📋 Applications loaded: ${result.rankApplications.length}`
  );

  console.log(
    `📜 Rank history loaded: ${result.rankHistory.length}`
  );

  return result;
}

/* ==================================================
   MERGING
================================================== */

function mergeObjects(
  local = {},
  cloud = {}
) {
  return {
    ...local,

    ...Object.fromEntries(
      Object.entries(cloud).filter(
        ([, value]) =>
          value !== null &&
          value !== undefined
      )
    )
  };
}

function mergeConfig(
  local,
  cloud
) {
  const localConfig =
    local?.config || {};

  const cloudConfig =
    cloud?.config || {};

  const localHelp =
    localConfig.helpDesk || {};

  const cloudHelp =
    cloudConfig.helpDesk || {};

  const localRank =
    localConfig.rank || {};

  const cloudRank =
    cloudConfig.rank || {};

  const merged = {
    helpDesk:
      mergeObjects(
        localHelp,
        cloudHelp
      ),

    rank: {
      ...mergeObjects(
        localRank,
        cloudRank
      ),

      rankRoleIds:
        mergeObjects(
          localRank.rankRoleIds || {},
          cloudRank.rankRoleIds || {}
        )
    }
  };

  const legacy =
    mergeObjects(
      local?.rankConfig || {},
      cloud?.rankConfig || {}
    );

  /*
    Legacy config is fallback only.
    It can NEVER erase newer configuration.
  */

  for (const key of [
    "registrationChannelId",
    "reviewChannelId",
    "historyChannelId"
  ]) {
    if (
      !merged.rank[key] &&
      legacy[key]
    ) {
      merged.rank[key] =
        legacy[key];
    }
  }

  merged.rank.rankRoleIds = {
    ...legacy.rankRoleIds,
    ...merged.rank.rankRoleIds
  };

  return merged;
}

function reconcileData(
  local,
  cloud
) {
  const data =
    normalizeData(local);

  const cloudData =
    normalizeData(cloud);

  /* -----------------------------------------------
     CONFIG
  ------------------------------------------------ */

  data.config =
    mergeConfig(
      data,
      cloudData
    );

  data.rankConfig = {
    ...data.rankConfig,
    ...cloudData.rankConfig,

    registrationChannelId:
      data.config.rank
        .registrationChannelId,

    reviewChannelId:
      data.config.rank
        .reviewChannelId,

    historyChannelId:
      data.config.rank
        .historyChannelId,

    rankRoleIds: {
      ...data.rankConfig.rankRoleIds,
      ...data.config.rank.rankRoleIds
    }
  };

  /* -----------------------------------------------
     PLAYERS
  ------------------------------------------------ */

  data.rankUsers = {
    ...data.rankUsers,
    ...(cloudData.rankUsers || {})
  };

  /* -----------------------------------------------
     APPLICATIONS
  ------------------------------------------------ */

  const applications =
    new Map();

  for (
    const app of data.rankApplications
  ) {
    if (
      app?.id !== undefined
    ) {
      applications.set(
        String(app.id),
        app
      );
    }
  }

  for (
    const app of cloudData.rankApplications || []
  ) {
    if (
      app?.id !== undefined
    ) {
      applications.set(
        String(app.id),
        app
      );
    }
  }

  data.rankApplications =
    [...applications.values()];

  /* -----------------------------------------------
     HISTORY
  ------------------------------------------------ */

  const history =
    new Map();

  for (
    const entry of data.rankHistory
  ) {
    if (!entry) continue;

    const key =
      `${entry.applicationId || "unknown"}:${entry.action || "unknown"}:${entry.timestamp || JSON.stringify(entry)}`;

    history.set(
      key,
      entry
    );
  }

  for (
    const entry of cloudData.rankHistory || []
  ) {
    if (!entry) continue;

    const key =
      `${entry.applicationId || "unknown"}:${entry.action || "unknown"}:${entry.timestamp || JSON.stringify(entry)}`;

    history.set(
      key,
      entry
    );
  }

  data.rankHistory =
    [...history.values()];

  /* -----------------------------------------------
     METADATA
  ------------------------------------------------ */

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

  if (
    cloudData.date ===
    data.date
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

/* ==================================================
   WRITE FIRESTORE
================================================== */

async function saveFirestoreData(
  data
) {
  const firestore =
    initializeFirebase();

  const clean =
    sanitize(data);

  await Promise.all([
    firestore
      .collection("config")
      .doc("server")
      .set(
        clean.config,
        { merge: true }
      ),

    /*
      Extra legacy document.

      This gives us a second compatibility layer
      for the old Rank configuration.
    */
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
          date: clean.date || "",
          dashboardMessageId:
            clean.dashboardMessageId ||
            null,
          updatedAt: Date.now()
        },
        { merge: true }
      ),

    firestore
      .collection("helpDesk")
      .doc("counters")
      .set(
        {
          date: clean.date || "",
          war: Number(clean.war) || 0,
          backup:
            Number(clean.backup) || 0,
          updatedAt: Date.now()
        },
        { merge: true }
      )
  ]);

  /* -----------------------------------------------
     PLAYERS

     NEVER DELETE PLAYERS.
  ------------------------------------------------ */

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

  /* -----------------------------------------------
     APPLICATIONS
  ------------------------------------------------ */

  const applicationBatch =
    firestore.batch();

  for (
    const app
    of clean.rankApplications || []
  ) {
    if (
      app?.id === undefined
    ) {
      continue;
    }

    applicationBatch.set(
      firestore
        .collection("applications")
        .doc(String(app.id)),
      app,
      { merge: true }
    );
  }

  await applicationBatch.commit();

  /* -----------------------------------------------
     HISTORY

     NEVER DELETE HISTORY.
  ------------------------------------------------ */

  for (
    const entry
    of clean.rankHistory || []
  ) {
    const id = [
      entry.applicationId ||
        "unknown",

      entry.action ||
        "unknown",

      entry.timestamp ||
        Date.now()
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

/* ==================================================
   INITIALIZE DATABASE
================================================== */

async function initializeDatabase() {
  initializeFirebase();

  const localData =
    loadLocalData();

  let cloudData = {};

  try {
    cloudData =
      await readFirestoreData();
  } catch (error) {
    console.error(
      "❌ Could not read Firestore:",
      error
    );

    throw error;
  }

  const merged =
    reconcileData(
      localData,
      cloudData
    );

  checkDailyResetWithoutSave(
    merged
  );

  /*
    Save the reconciled state locally AND
    permanently to Firestore.
  */

  writeLocalData(
    merged
  );

  await saveFirestoreData(
    merged
  );

  console.log(
    "💾 Firestore/local data reconciliation complete."
  );

  return merged;
}

/* ==================================================
   SAVE DATA
================================================== */

function saveData(data) {
  /*
    Local backup first.
  */
  writeLocalData(data);

  /*
    Firestore persistence.
  */
  if (!db) {
    return Promise.resolve();
  }

  const snapshot =
    clone(data);

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

/* ==================================================
   DAILY RESET
================================================== */

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

  if (
    data.date !== today
  ) {
    data.date = today;
    data.war = 0;
    data.backup = 0;

    return true;
  }

  return false;
}

function checkDailyReset(
  data
) {
  const changed =
    checkDailyResetWithoutSave(
      data
    );

  if (changed) {
    saveData(data);
  }

  return changed;
}

/* ==================================================
   COMPATIBILITY
================================================== */

function loadData() {
  return loadLocalData();
}

/* ==================================================
   EXPORTS
================================================== */

module.exports = {
  DATA_FILE,
  initializeDatabase,
  loadData,
  saveData,
  getToday,
  checkDailyReset
};
