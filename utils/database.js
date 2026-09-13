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

const DATA_FILE = path.join(__dirname, "..", "data.json");

let firestore = null;
let firebaseEnabled = false;

let saveQueue = Promise.resolve();

/*
==================================================
DEFAULT DATA
==================================================
*/

const defaultData = {
  date: "",
  war: 0,
  backup: 0,

  dashboardMessageId: null,

  config: {
    helpDesk: {
      dashboardChannelId:
        process.env.DASHBOARD_CHANNEL_ID || null,

      warRoleId:
        process.env.WAR_ROLE_ID || null,

      backupRoleId:
        process.env.BACKUP_ROLE_ID || null
    },

    rank: {
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
    }
  },

  /*
  Legacy field is intentionally retained.
  Existing bot code may still use it.
  */
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

/*
==================================================
DATE
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

/*
==================================================
SAFE CLONE
==================================================
*/

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/*
==================================================
MERGE DATA
==================================================
*/

function mergeData(saved) {
  const data = clone(defaultData);

  if (!saved || typeof saved !== "object") {
    applyEnvironmentFallbacks(data);
    return data;
  }

  /*
  Top-level values
  */
  if (typeof saved.date === "string") {
    data.date = saved.date;
  }

  if (typeof saved.war === "number") {
    data.war = saved.war;
  }

  if (typeof saved.backup === "number") {
    data.backup = saved.backup;
  }

  if (
    saved.dashboardMessageId !== undefined
  ) {
    data.dashboardMessageId =
      saved.dashboardMessageId;
  }

  /*
  Config
  */
  if (saved.config && typeof saved.config === "object") {
    data.config = {
      ...data.config,
      ...saved.config,

      helpDesk: {
        ...data.config.helpDesk,
        ...(saved.config.helpDesk || {})
      },

      rank: {
        ...data.config.rank,
        ...(saved.config.rank || {}),

        rankRoleIds: {
          ...data.config.rank.rankRoleIds,
          ...(
            saved.config.rank?.rankRoleIds || {}
          )
        }
      }
    };
  }

  /*
  Legacy rankConfig
  */
  if (
    saved.rankConfig &&
    typeof saved.rankConfig === "object"
  ) {
    data.rankConfig = {
      ...data.rankConfig,
      ...saved.rankConfig,

      rankRoleIds: {
        ...data.rankConfig.rankRoleIds,
        ...(saved.rankConfig.rankRoleIds || {})
      }
    };
  }

  /*
  If the old system has rankConfig but the new
  config.rank does not, migrate it.
  */
  const legacy = data.rankConfig;

  const newRank = data.config.rank;

  if (
    !newRank.registrationChannelId &&
    legacy.registrationChannelId
  ) {
    newRank.registrationChannelId =
      legacy.registrationChannelId;
  }

  if (
    !newRank.reviewChannelId &&
    legacy.reviewChannelId
  ) {
    newRank.reviewChannelId =
      legacy.reviewChannelId;
  }

  if (
    !newRank.historyChannelId &&
    legacy.historyChannelId
  ) {
    newRank.historyChannelId =
      legacy.historyChannelId;
  }

  for (const rank of Object.keys(
    newRank.rankRoleIds
  )) {
    if (
      !newRank.rankRoleIds[rank] &&
      legacy.rankRoleIds?.[rank]
    ) {
      newRank.rankRoleIds[rank] =
        legacy.rankRoleIds[rank];
    }
  }

  /*
  Players
  */
  if (
    saved.rankUsers &&
    typeof saved.rankUsers === "object"
  ) {
    data.rankUsers = {
      ...saved.rankUsers
    };
  }

  /*
  Applications
  */
  if (Array.isArray(saved.rankApplications)) {
    data.rankApplications = [
      ...saved.rankApplications
    ];
  }

  /*
  History
  */
  if (Array.isArray(saved.rankHistory)) {
    data.rankHistory = [
      ...saved.rankHistory
    ];
  }

  /*
  Environment variables are only fallbacks.
  Existing saved configuration is NOT overwritten.
  */
  applyEnvironmentFallbacks(data);

  return data;
}

/*
==================================================
ENVIRONMENT FALLBACKS
==================================================
*/

function applyEnvironmentFallbacks(data) {
  if (
    !data.config.helpDesk.dashboardChannelId &&
    process.env.DASHBOARD_CHANNEL_ID
  ) {
    data.config.helpDesk.dashboardChannelId =
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

  /*
  Keep legacy config synchronized.
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
      ...data.config.rank.rankRoleIds
    }
  };

  return data;
}

/*
==================================================
LOCAL JSON
==================================================
*/

function loadLocalData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const fresh = clone(defaultData);

      applyEnvironmentFallbacks(fresh);

      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(fresh, null, 2),
        "utf8"
      );

      return fresh;
    }

    const raw = fs.readFileSync(
      DATA_FILE,
      "utf8"
    );

    if (!raw.trim()) {
      return clone(defaultData);
    }

    const parsed = JSON.parse(raw);

    return mergeData(parsed);
  } catch (error) {
    console.error(
      "❌ Failed to load local data.json:",
      error
    );

    /*
    NEVER destroy the existing file if it is
    malformed. Start safely from defaults.
    */
    const fallback = clone(defaultData);

    applyEnvironmentFallbacks(fallback);

    return fallback;
  }
}

function saveLocalData(data) {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    return true;
  } catch (error) {
    console.error(
      "❌ Failed to save data.json:",
      error
    );

    return false;
  }
}

/*
==================================================
FIREBASE INITIALIZATION
==================================================
*/

function initializeFirebase() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL;

  let privateKey =
    process.env.FIREBASE_PRIVATE_KEY;

  if (
    !projectId ||
    !clientEmail ||
    !privateKey
  ) {
    console.warn(
      "⚠️ Firebase environment variables are missing."
    );

    console.warn(
      "⚠️ The bot will use local data.json only."
    );

    firebaseEnabled = false;
    firestore = null;

    return false;
  }

  try {
    privateKey = privateKey.replace(
      /\\n/g,
      "\n"
    );

    let app;

    if (getApps().length > 0) {
      app = getApps()[0];
    } else {
      app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
    }

    firestore = getFirestore(app);

    firebaseEnabled = true;

    console.log(
      "🔥 Firebase Firestore connected."
    );

    return true;
  } catch (error) {
    firebaseEnabled = false;
    firestore = null;

    console.error(
      "❌ Firebase initialization failed:",
      error
    );

    return false;
  }
}

/*
==================================================
REMOVE INTERNAL / NON-FIRESTORE DATA
==================================================
*/

function cleanForFirestore(value) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "function") {
    return undefined;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value
      .map(item => cleanForFirestore(item))
      .filter(item => item !== undefined);
  }

  if (typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      /*
      Internal runtime properties such as
      application._client must NEVER be stored.
      */
      if (key.startsWith("_")) {
        continue;
      }

      const cleaned =
        cleanForFirestore(item);

      if (cleaned !== undefined) {
        output[key] = cleaned;
      }
    }

    return output;
  }

  return value;
}

/*
==================================================
FIRESTORE HELPERS
==================================================
*/

function getConfigRef() {
  return firestore
    .collection("config")
    .doc("server");
}

function getCountersRef() {
  return firestore
    .collection("helpDesk")
    .doc("counters");
}

/*
==================================================
LOAD FROM FIRESTORE
==================================================
*/

async function loadFromFirestore(localData) {
  if (!firebaseEnabled || !firestore) {
    return localData;
  }

  try {
    console.log(
      "☁️ Loading persistent data from Firestore..."
    );

    const data = mergeData(localData);

    /*
    ----------------------------------------------
    CONFIG
    ----------------------------------------------
    */

    const configSnap =
      await getConfigRef().get();

    if (configSnap.exists) {
      const cloudConfig =
        configSnap.data() || {};

      if (cloudConfig.config) {
        data.config = {
          ...data.config,
          ...cloudConfig.config,

          helpDesk: {
            ...data.config.helpDesk,
            ...(cloudConfig.config.helpDesk || {})
          },

          rank: {
            ...data.config.rank,
            ...(cloudConfig.config.rank || {}),

            rankRoleIds: {
              ...data.config.rank.rankRoleIds,
              ...(
                cloudConfig.config.rank?.rankRoleIds ||
                {}
              )
            }
          }
        };
      }

      if (
        cloudConfig.dashboardMessageId !==
        undefined
      ) {
        data.dashboardMessageId =
          cloudConfig.dashboardMessageId;
      }

      if (cloudConfig.rankConfig) {
        data.rankConfig =
          mergeData({
            rankConfig:
              cloudConfig.rankConfig
          }).rankConfig;
      }
    }

    /*
    ----------------------------------------------
    HELP DESK COUNTERS
    ----------------------------------------------
    */

    const countersSnap =
      await getCountersRef().get();

    if (countersSnap.exists) {
      const counters =
        countersSnap.data() || {};

      if (typeof counters.date === "string") {
        data.date = counters.date;
      }

      if (typeof counters.war === "number") {
        data.war = counters.war;
      }

      if (
        typeof counters.backup === "number"
      ) {
        data.backup = counters.backup;
      }
    }

    /*
    ----------------------------------------------
    PLAYERS
    ----------------------------------------------
    */

    const playersSnap =
      await firestore
        .collection("players")
        .get();

    for (const doc of playersSnap.docs) {
      const player = doc.data();

      if (player && player.discordId) {
        data.rankUsers[player.discordId] = {
          ...player
        };
      } else {
        /*
        Fallback to document ID.
        */
        data.rankUsers[doc.id] = {
          ...player,
          discordId:
            player.discordId || doc.id
        };
      }
    }

    /*
    ----------------------------------------------
    APPLICATIONS
    ----------------------------------------------
    */

    const applicationsSnap =
      await firestore
        .collection("applications")
        .get();

    const applicationMap = new Map();

    for (
      const application
      of data.rankApplications
    ) {
      if (application?.id) {
        applicationMap.set(
          application.id,
          application
        );
      }
    }

    for (
      const doc
      of applicationsSnap.docs
    ) {
      const application = doc.data();

      applicationMap.set(
        application.id || doc.id,
        application
      );
    }

    data.rankApplications =
      Array.from(applicationMap.values());

    /*
    ----------------------------------------------
    RANK HISTORY
    ----------------------------------------------
    */

    const historySnap =
      await firestore
        .collection("rankHistory")
        .get();

    const historyMap = new Map();

    for (
      const history
      of data.rankHistory
    ) {
      const id =
        history._id ||
        history.id ||
        [
          history.applicationId,
          history.timestamp,
          history.action
        ]
          .filter(Boolean)
          .join("_");

      historyMap.set(id, history);
    }

    for (
      const doc
      of historySnap.docs
    ) {
      const history = doc.data();

      historyMap.set(
        doc.id,
        history
      );
    }

    data.rankHistory =
      Array.from(historyMap.values());

    applyEnvironmentFallbacks(data);

    /*
    ----------------------------------------------
    LOCAL BACKUP
    ----------------------------------------------
    */

    saveLocalData(data);

    console.log(
      `☁️ Players loaded: ${
        Object.keys(data.rankUsers || {})
          .length
      }`
    );

    console.log(
      `☁️ Applications loaded: ${
        (data.rankApplications || [])
          .length
      }`
    );

    console.log(
      `☁️ Rank history loaded: ${
        (data.rankHistory || [])
          .length
      }`
    );

    console.log(
      "✅ Firestore/local data reconciliation complete."
    );

    /*
    ----------------------------------------------
    IMPORTANT:
    Immediately write local-only records to cloud.
    This gives old local records a permanent home.
    ----------------------------------------------
    */

    await saveToFirestore(data);

    return data;
  } catch (error) {
    console.error(
      "❌ Failed to load Firestore data:",
      error
    );

    /*
    If Firestore cannot be read, DO NOT replace
    local data with empty data.
    */
    console.warn(
      "⚠️ Keeping local data.json as fallback."
    );

    return localData;
  }
}

/*
==================================================
SAVE TO FIRESTORE
==================================================
*/

async function saveToFirestore(data) {
  if (!firebaseEnabled || !firestore) {
    return;
  }

  const safeData =
    cleanForFirestore(data);

  /*
  ----------------------------------------------
  CONFIG
  ----------------------------------------------
  */

  await getConfigRef().set(
    {
      config:
        safeData.config || {},

      rankConfig:
        safeData.rankConfig || {},

      dashboardMessageId:
        safeData.dashboardMessageId || null,

      updatedAt:
        new Date().toISOString()
    },
    {
      merge: true
    }
  );

  /*
  ----------------------------------------------
  HELP DESK
  ----------------------------------------------
  */

  await getCountersRef().set(
    {
      date:
        safeData.date || "",

      war:
        typeof safeData.war === "number"
          ? safeData.war
          : 0,

      backup:
        typeof safeData.backup === "number"
          ? safeData.backup
          : 0,

      updatedAt:
        new Date().toISOString()
    },
    {
      merge: true
    }
  );

  /*
  ----------------------------------------------
  PLAYERS
  ----------------------------------------------
  */

  const players =
    safeData.rankUsers || {};

  for (
    const [discordId, player]
    of Object.entries(players)
  ) {
    if (!player || typeof player !== "object") {
      continue;
    }

    await firestore
      .collection("players")
      .doc(String(discordId))
      .set(
        {
          ...player,

          discordId:
            player.discordId ||
            String(discordId),

          updatedAt:
            player.updatedAt ||
            new Date().toISOString()
        },
        {
          merge: true
        }
      );
  }

  /*
  ----------------------------------------------
  APPLICATIONS
  ----------------------------------------------
  */

  const applications =
    safeData.rankApplications || [];

  for (const application of applications) {
    if (!application?.id) {
      continue;
    }

    await firestore
      .collection("applications")
      .doc(String(application.id))
      .set(
        application,
        {
          merge: true
        }
      );
  }

  /*
  ----------------------------------------------
  HISTORY
  ----------------------------------------------
  */

  const history =
    safeData.rankHistory || [];

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];

    if (!entry || typeof entry !== "object") {
      continue;
    }

    const historyId =
      entry._id ||
      entry.id ||
      [
        entry.applicationId || "history",
        entry.userId || "user",
        entry.timestamp || i
      ]
        .join("_")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 500);

    await firestore
      .collection("rankHistory")
      .doc(String(historyId))
      .set(
        {
          ...entry,

          _id: String(historyId)
        },
        {
          merge: true
        }
      );
  }
}

/*
==================================================
PUBLIC SAVE FUNCTION
==================================================
*/

function saveData(data) {
  /*
  Save the local backup immediately.

  This means even if Firestore is temporarily
  unavailable, data.json is updated.
  */
  saveLocalData(data);

  /*
  Queue cloud writes so multiple simultaneous
  Discord interactions don't write over each
  other unpredictably.
  */
  saveQueue = saveQueue
    .then(async () => {
      try {
        await saveToFirestore(data);

        console.log(
          "☁️ Database saved."
        );
      } catch (error) {
        console.error(
          "❌ Firestore save failed:",
          error
        );

        console.error(
          "⚠️ Local data.json backup was still saved."
        );
      }
    })
    .catch(error => {
      console.error(
        "❌ Database save queue error:",
        error
      );
    });

  return saveQueue;
}

/*
==================================================
DAILY RESET
==================================================
*/

function checkDailyResetLocal(data) {
  const today = getToday();

  if (data.date !== today) {
    data.date = today;
    data.war = 0;
    data.backup = 0;

    saveLocalData(data);

    return true;
  }

  return false;
}

async function checkDailyReset(data) {
  const changed =
    checkDailyResetLocal(data);

  if (changed) {
    await saveData(data);
  }

  return changed;
}

/*
==================================================
==============
INITIALIZE DATABASE
==================================================
*/

async function initializeDatabase() {
  let data = loadLocalData();

  /*
  First update the local daily state.
  */
  checkDailyResetLocal(data);

  /*
  Then connect to Firebase if credentials
  are available.
  */
  initializeFirebase();

  /*
  Load cloud data and reconcile it with local.
  */
  if (firebaseEnabled) {
    data = await loadFromFirestore(data);
  }

  /*
  Ensure today's counters are correct after
  reconciliation.
  */
  const changed =
    checkDailyResetLocal(data);

  if (changed) {
    await saveData(data);
  }

  /*
  Always leave the latest state in the local
  backup as well.
  */
  saveLocalData(data);

  return data;
}

/*
==================================================
EXPORTS
==================================================
*/

module.exports = {
  loadData: loadLocalData,
  saveData,
  checkDailyReset,
  getToday,
  initializeDatabase
};
