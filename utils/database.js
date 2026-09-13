const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DATA_FILE = path.join(__dirname, "..", "data.json");

const defaultRankRoleIds = {
  Z: null,
  SSS: null,
  SS: null,
  S: null,
  A: null,
  B: null,
  C: null,
  D: null,
  E: null
};

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
        ...defaultRankRoleIds
      }
    }
  },

  // Legacy format kept for compatibility.
  rankConfig: {
    registrationChannelId: null,
    reviewChannelId: null,
    historyChannelId: null,
    rankRoleIds: {
      ...defaultRankRoleIds
    }
  },

  rankUsers: {},
  rankApplications: [],
  rankHistory: []
};

let db = null;
let firebaseEnabled = false;
let initialized = false;

let saveQueue = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getFirebasePrivateKey() {
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    return null;
  }

  return process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
}

function mergeData(saved = {}) {
  const data = clone(defaultData);

  Object.assign(data, saved);

  data.config = {
    ...clone(defaultData.config),
    ...(saved.config || {}),

    helpDesk: {
      ...clone(defaultData.config.helpDesk),
      ...((saved.config || {}).helpDesk || {})
    },

    rank: {
      ...clone(defaultData.config.rank),
      ...((saved.config || {}).rank || {}),

      rankRoleIds: {
        ...clone(defaultData.config.rank.rankRoleIds),
        ...(((saved.config || {}).rank || {}).rankRoleIds || {})
      }
    }
  };

  /*
  ==================================================
  LEGACY RANK CONFIG MIGRATION
  ==================================================
  */

  if (saved.rankConfig) {
    data.config.rank = {
      ...data.config.rank,
      ...saved.rankConfig,

      rankRoleIds: {
        ...data.config.rank.rankRoleIds,
        ...(saved.rankConfig.rankRoleIds || {})
      }
    };
  }

  data.rankConfig = {
    ...clone(defaultData.rankConfig),
    ...(saved.rankConfig || {}),

    rankRoleIds: {
      ...clone(defaultData.rankConfig.rankRoleIds),
      ...((saved.rankConfig || {}).rankRoleIds || {})
    }
  };

  /*
  ==================================================
  ENVIRONMENT FALLBACKS
  ==================================================
  */

  if (!data.config.helpDesk.warRoleId && process.env.WAR_ROLE_ID) {
    data.config.helpDesk.warRoleId = process.env.WAR_ROLE_ID;
  }

  if (!data.config.helpDesk.backupRoleId && process.env.BACKUP_ROLE_ID) {
    data.config.helpDesk.backupRoleId = process.env.BACKUP_ROLE_ID;
  }

  if (!data.config.helpDesk.channelId && process.env.DASHBOARD_CHANNEL_ID) {
    data.config.helpDesk.channelId = process.env.DASHBOARD_CHANNEL_ID;
  }

  /*
  ==================================================
  RANK DATA
  ==================================================
  */

  data.rankUsers = saved.rankUsers || {};

  data.rankApplications = Array.isArray(saved.rankApplications)
    ? saved.rankApplications
    : [];

  data.rankHistory = Array.isArray(saved.rankHistory)
    ? saved.rankHistory
    : [];

  return data;
}

/*
==================================================
LOCAL JSON
==================================================
*/

function loadLocalData() {
  let saved = {};

  try {
    if (fs.existsSync(DATA_FILE)) {
      saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (error) {
    console.error("❌ Could not load data.json:", error);
  }

  return mergeData(saved);
}

function saveLocalData(data) {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );

    return true;
  } catch (error) {
    console.error("❌ Could not save data.json:", error);
    return false;
  }
}

/*
==================================================
FIREBASE INITIALIZATION
==================================================
*/

function initializeFirebase() {
  if (firebaseEnabled && db) {
    return true;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getFirebasePrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      "⚠️ Firebase environment variables are not configured."
    );

    console.warn(
      "⚠️ The bot will temporarily use local data.json only."
    );

    return false;
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
    }

    db = admin.firestore();
    firebaseEnabled = true;

    console.log("🔥 Firebase Firestore connected.");

    return true;
  } catch (error) {
    console.error(
      "❌ Firebase initialization failed:",
      error
    );

    firebaseEnabled = false;
    db = null;

    return false;
  }
}

/*
==================================================
FIRESTORE HELPERS
==================================================
*/

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function cleanForFirestore(value) {
  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(cleanForFirestore);
  }

  if (value && typeof value === "object") {
    const result = {};

    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("_")) {
        continue;
      }

      result[key] = cleanForFirestore(child);
    }

    return result;
  }

  return value;
}

async function writeCollection(collectionName, records) {
  if (!db || !records.length) {
    return;
  }

  const entries = Object.entries(records);

  const batches = chunkArray(entries, 450);

  for (const batchEntries of batches) {
    const batch = db.batch();

    for (const [id, record] of batchEntries) {
      const ref = db
        .collection(collectionName)
        .doc(String(id));

      batch.set(
        ref,
        cleanForFirestore(record),
        { merge: true }
      );
    }

    await batch.commit();
  }
}

async function writeApplications(applications) {
  if (!db) return;

  const records = {};

  for (const application of applications) {
    if (!application?.id) continue;

    records[String(application.id)] = application;
  }

  await writeCollection(
    "applications",
    records
  );
}

async function writeHistory(history) {
  if (!db) return;

  const records = {};

  for (let index = 0; index < history.length; index++) {
    const entry = history[index];

    if (!entry) continue;

    /*
    Give old history entries a stable ID if they
    do not already have one.
    */

    if (!entry._id) {
      entry._id =
        `${entry.applicationId || "history"}_${entry.timestamp || index}_${index}`;
    }

    records[String(entry._id)] = entry;
  }

  await writeCollection(
    "rankHistory",
    records
  );
}

/*
==================================================
SAVE TO FIRESTORE
==================================================
*/

async function saveToFirestore(data) {
  if (!db) {
    return false;
  }

  const batch = db.batch();

  /*
  CONFIG
  */

  const configRef = db
    .collection("config")
    .doc("server");

  batch.set(
    configRef,
    cleanForFirestore({
      config: data.config,
      rankConfig: data.rankConfig,
      dashboardMessageId: data.dashboardMessageId,
      updatedAt: Date.now()
    }),
    { merge: true }
  );

  /*
  HELP DESK COUNTERS
  */

  const counterRef = db
    .collection("helpDesk")
    .doc("counters");

  batch.set(
    counterRef,
    {
      date: data.date || "",
      war: Number(data.war || 0),
      backup: Number(data.backup || 0),
      updatedAt: Date.now()
    },
    { merge: true }
  );

  await batch.commit();

  /*
  PLAYERS
  */

  await writeCollection(
    "players",
    data.rankUsers || {}
  );

  /*
  APPLICATIONS
  */

  await writeApplications(
    data.rankApplications || []
  );

  /*
  HISTORY
  */

  await writeHistory(
    data.rankHistory || []
  );

  return true;
}

/*
==================================================
LOAD FROM FIRESTORE
==================================================
*/

async function loadFromFirestore() {
  if (!db) {
    return null;
  }

  const localData = loadLocalData();

  /*
  CONFIG
  */

  const configSnapshot = await db
    .collection("config")
    .doc("server")
    .get();

  if (configSnapshot.exists) {
    const configCloud = configSnapshot.data();

    if (configCloud.config) {
      localData.config = {
        ...localData.config,
        ...configCloud.config,

        helpDesk: {
          ...localData.config.helpDesk,
          ...(configCloud.config.helpDesk || {})
        },

        rank: {
          ...localData.config.rank,
          ...(configCloud.config.rank || {}),

          rankRoleIds: {
            ...localData.config.rank.rankRoleIds,
            ...((configCloud.config.rank || {}).rankRoleIds || {})
          }
        }
      };
    }

    if (configCloud.rankConfig) {
      localData.rankConfig = {
        ...localData.rankConfig,
        ...configCloud.rankConfig,

        rankRoleIds: {
          ...localData.rankConfig.rankRoleIds,
          ...(configCloud.rankConfig.rankRoleIds || {})
        }
      };
    }

    if (configCloud.dashboardMessageId) {
      localData.dashboardMessageId =
        configCloud.dashboardMessageId;
    }
  }

  /*
  HELP DESK COUNTERS
  */

  const counterSnapshot = await db
    .collection("helpDesk")
    .doc("counters")
    .get();

  if (counterSnapshot.exists) {
    const counters = counterSnapshot.data();

    if (counters.date !== undefined) {
      localData.date = counters.date;
    }

    if (counters.war !== undefined) {
      localData.war = Number(counters.war);
    }

    if (counters.backup !== undefined) {
      localData.backup = Number(counters.backup);
    }
  }

  /*
  PLAYERS
  */

  const playersSnapshot = await db
    .collection("players")
    .get();

  const cloudPlayers = {};

  playersSnapshot.forEach(doc => {
    cloudPlayers[doc.id] = doc.data();
  });

  /*
  FIRESTORE IS PRIMARY.

  But if a local player exists that is not yet
  in Firestore, keep it so migration cannot
  accidentally erase it.
  */

  localData.rankUsers = {
    ...(localData.rankUsers || {}),
    ...cloudPlayers
  };

  /*
  APPLICATIONS
  */

  const applicationsSnapshot = await db
    .collection("applications")
    .get();

  const cloudApplications = applicationsSnapshot.docs
    .map(doc => doc.data())
    .filter(Boolean);

  const applicationsById = new Map();

  for (const application of localData.rankApplications || []) {
    if (application?.id) {
      applicationsById.set(
        String(application.id),
        application
      );
    }
  }

  for (const application of cloudApplications) {
    if (application?.id) {
      applicationsById.set(
        String(application.id),
        application
      );
    }
  }

  localData.rankApplications =
    Array.from(applicationsById.values());

  /*
  HISTORY
  */

  const historySnapshot = await db
    .collection("rankHistory")
    .get();

  const cloudHistory = historySnapshot.docs
    .map(doc => doc.data())
    .filter(Boolean);

  const historyById = new Map();

  for (let index = 0; index < localData.rankHistory.length; index++) {
    const entry = localData.rankHistory[index];

    if (!entry) continue;

    const id =
      entry._id ||
      `${entry.applicationId || "history"}_${entry.timestamp || index}_${index}`;

    entry._id = id;

    historyById.set(String(id), entry);
  }

  for (const entry of cloudHistory) {
    if (!entry) continue;

    const id =
      entry._id ||
      `${entry.applicationId || "history"}_${entry.timestamp || Date.now()}`;

    entry._id = id;

    historyById.set(String(id), entry);
  }

  localData.rankHistory =
    Array.from(historyById.values());

  return mergeData(localData);
}

/*
==================================================
DATABASE INITIALIZATION
==================================================
*/

async function initializeDatabase() {
  if (initialized) {
    return;
  }

  console.log("💾 Initializing Black Dragons database...");

  /*
  Always load the local file first.

  This means the bot still has a usable backup
  even if Firebase is temporarily unavailable.
  */

  let data = loadLocalData();

  initializeFirebase();

  if (firebaseEnabled) {
    try {
      const cloudData = await loadFromFirestore();

      if (cloudData) {
        data = cloudData;

        /*
        Immediately push the merged state back
        to Firestore.

        This safely migrates any local records
        that were missing from Firestore.
        */

        await saveToFirestore(data);

        console.log(
          `☁️ Firestore loaded: ${Object.keys(data.rankUsers || {}).length} player(s), ` +
          `${(data.rankApplications || []).length} application(s), ` +
          `${(data.rankHistory || []).length} history record(s).`
        );

        console.log("✅ Firestore/local data reconciliation complete.");
      }
    } catch (error) {
      console.error(
        "❌ Could not load Firestore data.",
        error
      );

      console.error(
        "⚠️ Continuing with local data.json as emergency fallback."
      );
    }
  }

  checkDailyResetLocal(data);

  /*
  Keep local backup synchronized.
  */

  saveLocalData(data);

  initialized = true;

  return data;
}

/*
==================================================
LOAD DATA
==================================================

After initializeDatabase() has completed,
this function is synchronous so existing
code can continue using client.appData.
*/

function loadData() {
  return loadLocalData();
}

/*
==================================================
SAVE DATA
==================================================

IMPORTANT:

Every save writes the local backup immediately,
then queues a Firestore save.

The queue prevents several rapid Discord
interactions from overwriting each other.
*/

function saveData(data) {
  const snapshot = clone(data);

  const localSaved = saveLocalData(snapshot);

  if (!firebaseEnabled || !db) {
    return Promise.resolve(localSaved);
  }

  saveQueue = saveQueue
    .then(async () => {
      try {
        await saveToFirestore(snapshot);

        console.log("☁️ Firestore save successful.");

        return true;
      } catch (error) {
        console.error(
          "🚨 FIRESTORE SAVE FAILED 🚨",
          error
        );

        console.error(
          "⚠️ The local data.json backup was saved."
        );

        return false;
      }
    })
    .catch(error => {
      console.error(
        "🚨 Database save queue error:",
        error
      );

      return false;
    });

  return saveQueue;
}

/*
==================================================
DATE / DAILY COUNTERS
==================================================
*/

function getToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function checkDailyResetLocal(data) {
  const today = getToday();

  if (data.date !== today) {
    data.date = today;
    data.war = 0;
    data.backup = 0;

    /*
    Local write only here.

    The normal save queue will persist it to
    Firestore when the caller saves the data.
    */

    saveLocalData(data);

    return true;
  }

  return false;
}

async function checkDailyReset(data) {
  const changed = checkDailyResetLocal(data);

  if (changed) {
    await saveData(data);
  }

  return changed;
}

module.exports = {
  DATA_FILE,
  loadData,
  saveData,
  getToday,
  checkDailyReset,
  initializeDatabase
};
