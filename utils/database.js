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

  // Legacy structure kept for compatibility.
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

let firestore = null;
let firebaseReady = false;

// Prevent multiple Firestore saves from running over each other.
let saveQueue = Promise.resolve();

/*
==================================================
SAFE CLONE
==================================================
*/

function clone(value) {
  if (value === undefined) return undefined;

  return JSON.parse(
    JSON.stringify(value, (_, currentValue) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }

      return currentValue;
    })
  );
}

/*
==================================================
SAFE JSON SERIALIZATION
==================================================

Discord / Firebase / other libraries can sometimes put
BigInt values inside objects.

Normal JSON.stringify() crashes on BigInt.

This replacer converts BigInt to strings ONLY when
creating the local data.json backup.

==================================================
*/

function safeJsonStringify(value, space = 2) {
  return JSON.stringify(
    value,
    (_, currentValue) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }

      return currentValue;
    },
    space
  );
}

/*
==================================================
REMOVE INTERNAL RUNTIME VALUES
==================================================

Some runtime-only properties may be attached to objects
while the bot is processing Discord interactions.

Anything beginning with "_" is not permanent database data.
==================================================
*/

function removeInternalFields(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(removeInternalFields);
  }

  if (typeof value === "object") {
    const output = {};

    for (const [key, currentValue] of Object.entries(value)) {
      if (key.startsWith("_")) continue;

      output[key] = removeInternalFields(currentValue);
    }

    return output;
  }

  return value;
}

/*
==================================================
MERGE DATA
==================================================
*/

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
  ------------------------------------------------
  LEGACY RANK CONFIG MIGRATION
  ------------------------------------------------
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
  ------------------------------------------------
  ENVIRONMENT VARIABLE FALLBACKS
  ------------------------------------------------
  */

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

  if (
    !data.config.helpDesk.channelId &&
    process.env.DASHBOARD_CHANNEL_ID
  ) {
    data.config.helpDesk.channelId =
      process.env.DASHBOARD_CHANNEL_ID;
  }

  /*
  ------------------------------------------------
  RANK DATA
  ------------------------------------------------
  */

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

/*
==================================================
LOCAL LOAD
==================================================
*/

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

  return mergeData(saved);
}

/*
==================================================
LOCAL SAVE
==================================================

IMPORTANT:
This is where the previous BigInt error happened.

safeJsonStringify() prevents:

TypeError: Do not know how to serialize a BigInt

==================================================
*/

function saveLocalData(data) {
  try {
    const cleaned = removeInternalFields(data);

    fs.writeFileSync(
      DATA_FILE,
      safeJsonStringify(cleaned, 2),
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
  if (firebaseReady && firestore) {
    return firestore;
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
      "Firebase environment variables are missing. Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  /*
  Environment variables commonly contain literal \n.
  Firebase needs actual newline characters.
  */

  const formattedPrivateKey =
    privateKey.replace(/\\n/g, "\n");

  const serviceAccount = {
    projectId,
    clientEmail,
    privateKey: formattedPrivateKey
  };

  let app;

  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    app = initializeApp({
      credential: cert(serviceAccount)
    });
  }

  firestore = getFirestore(app);
  firebaseReady = true;

  console.log("🔥 Firebase Firestore connected.");

  return firestore;
}

/*
==================================================
FIRESTORE READ HELPERS
==================================================
*/

async function readCollectionAsMap(collectionName) {
  const result = {};
  const snapshot =
    await firestore.collection(collectionName).get();

  snapshot.forEach(doc => {
    result[doc.id] = doc.data();
  });

  return result;
}

async function readCollectionAsArray(collectionName) {
  const result = [];
  const snapshot =
    await firestore.collection(collectionName).get();

  snapshot.forEach(doc => {
    result.push(doc.data());
  });

  return result;
}

/*
==================================================
LOAD FROM FIRESTORE
==================================================
*/

async function loadFirestoreData() {
  console.log(
    "☁️ Loading persistent data from Firestore..."
  );

  const players =
    await readCollectionAsMap("players");

  const applications =
    await readCollectionAsArray("applications");

  const history =
    await readCollectionAsArray("rankHistory");

  let configData = {};
  let countersData = {};

  try {
    const configSnapshot =
      await firestore
        .collection("config")
        .doc("server")
        .get();

    if (configSnapshot.exists) {
      configData = configSnapshot.data() || {};
    }
  } catch (error) {
    console.error(
      "❌ Could not load server config:",
      error
    );
  }

  try {
    const countersSnapshot =
      await firestore
        .collection("helpDesk")
        .doc("counters")
        .get();

    if (countersSnapshot.exists) {
      countersData =
        countersSnapshot.data() || {};
    }
  } catch (error) {
    console.error(
      "❌ Could not load Help Desk counters:",
      error
    );
  }

  console.log(
    `☁️ Players loaded: ${Object.keys(players).length}`
  );

  console.log(
    `☁️ Applications loaded: ${applications.length}`
  );

  console.log(
    `☁️ Rank history loaded: ${history.length}`
  );

  return {
    players,
    applications,
    history,
    config: configData,
    counters: countersData
  };
}

/*
==================================================
RECONCILE LOCAL + FIRESTORE
==================================================

Firestore is the permanent database.

Local data is also preserved.

We merge both instead of blindly replacing one with
the other.

This prevents an old local data.json from destroying
new Firestore records.
==================================================
*/

function reconcileData(localData, cloudData) {
  const merged = mergeData(localData);

  /*
  ------------------------------------------------
  PLAYERS
  ------------------------------------------------
  */

  merged.rankUsers = {
    ...(localData.rankUsers || {}),
    ...(cloudData.players || {})
  };

  /*
  ------------------------------------------------
  APPLICATIONS
  ------------------------------------------------

  Merge by application ID so we don't duplicate them.
  ------------------------------------------------
  */

  const applications = new Map();

  for (
    const application
    of localData.rankApplications || []
  ) {
    if (!application?.id) continue;

    applications.set(
      String(application.id),
      application
    );
  }

  for (
    const application
    of cloudData.applications || []
  ) {
    if (!application?.id) continue;

    const key = String(application.id);

    const existing =
      applications.get(key);

    applications.set(
      key,
      existing
        ? {
            ...existing,
            ...application
          }
        : application
    );
  }

  merged.rankApplications =
    Array.from(applications.values());

  /*
  ------------------------------------------------
  RANK HISTORY
  ------------------------------------------------

  History is append-only.

  We preserve every unique history entry.
  ------------------------------------------------
  */

  const history = new Map();

  const addHistory = entry => {
    if (!entry) return;

    const key = [
      entry.applicationId || "",
      entry.action || "",
      entry.timestamp || "",
      entry.userId || ""
    ].join(":");

    history.set(key, entry);
  };

  for (
    const entry of localData.rankHistory || []
  ) {
    addHistory(entry);
  }

  for (
    const entry of cloudData.history || []
  ) {
    addHistory(entry);
  }

  merged.rankHistory =
    Array.from(history.values());

  /*
  ------------------------------------------------
  CONFIG
  ------------------------------------------------
  */

  if (cloudData.config) {
    merged.config = {
      ...merged.config,
      ...cloudData.config,

      helpDesk: {
        ...merged.config.helpDesk,
        ...(cloudData.config.helpDesk || {})
      },

      rank: {
        ...merged.config.rank,
        ...(cloudData.config.rank || {}),

        rankRoleIds: {
          ...merged.config.rank.rankRoleIds,
          ...((cloudData.config.rank || {})
            .rankRoleIds || {})
        }
      }
    };
  }

  /*
  ------------------------------------------------
  HELP DESK COUNTERS
  ------------------------------------------------
  */

  if (
    cloudData.counters &&
    Object.keys(cloudData.counters).length
  ) {
    if (
      typeof cloudData.counters.war ===
      "number"
    ) {
      merged.war =
        Math.max(
          Number(merged.war || 0),
          Number(cloudData.counters.war)
        );
    }

    if (
      typeof cloudData.counters.backup ===
      "number"
    ) {
      merged.backup =
        Math.max(
          Number(merged.backup || 0),
          Number(cloudData.counters.backup)
        );
    }

    if (cloudData.counters.date) {
      merged.date =
        cloudData.counters.date;
    }

    if (cloudData.counters.dashboardMessageId) {
      merged.dashboardMessageId =
        cloudData.counters.dashboardMessageId;
    }
  }

  return mergeData(merged);
}

/*
==================================================
FIRESTORE DOCUMENT ID
==================================================
*/

function safeDocumentId(value, fallback) {
  const stringValue =
    String(value ?? fallback);

  /*
  Firestore document IDs cannot contain "/".
  */

  return stringValue
    .replace(/\//g, "_")
    .slice(0, 1500);
}

/*
==================================================
SAVE PLAYERS
==================================================
*/

async function savePlayers(data) {
  const entries =
    Object.entries(data.rankUsers || {});

  if (!entries.length) return;

  for (
    let start = 0;
    start < entries.length;
    start += 400
  ) {
    const batch =
      firestore.batch();

    const chunk =
      entries.slice(start, start + 400);

    for (
      const [discordId, player]
      of chunk
    ) {
      const ref =
        firestore
          .collection("players")
          .doc(
            safeDocumentId(
              discordId,
              `player_${start}`
            )
          );

      batch.set(
        ref,
        removeInternalFields({
          ...player,
          discordId:
            player.discordId ||
            discordId
        }),
        { merge: true }
      );
    }

    await batch.commit();
  }
}

/*
==================================================
SAVE APPLICATIONS
==================================================
*/

async function saveApplications(data) {
  const applications =
    Array.isArray(data.rankApplications)
      ? data.rankApplications
      : [];

  if (!applications.length) return;

  for (
    let start = 0;
    start < applications.length;
    start += 400
  ) {
    const batch =
      firestore.batch();

    const chunk =
      applications.slice(
        start,
        start + 400
      );

    for (
      let index = 0;
      index < chunk.length;
      index++
    ) {
      const application =
        chunk[index];

      if (!application) continue;

      const id =
        application.id ||
        `application_${start + index}`;

      const ref =
        firestore
          .collection("applications")
          .doc(
            safeDocumentId(id, `application_${index}`)
          );

      batch.set(
        ref,
        removeInternalFields(application),
        { merge: true }
      );
    }

    await batch.commit();
  }
}

/*
==================================================
SAVE RANK HISTORY
==================================================
*/

async function saveRankHistory(data) {
  const history =
    Array.isArray(data.rankHistory)
      ? data.rankHistory
      : [];

  if (!history.length) return;

  for (
    let start = 0;
    start < history.length;
    start += 400
  ) {
    const batch =
      firestore.batch();

    const chunk =
      history.slice(
        start,
        start + 400
      );

    for (
      let index = 0;
      index < chunk.length;
      index++
    ) {
      const entry =
        chunk[index];

      if (!entry) continue;

      /*
      Stable ID prevents duplicate history records
      when saveData() runs multiple times.
      */

      const id = [
        entry.applicationId || "unknown",
        entry.action || "unknown",
        entry.timestamp || start + index,
        entry.userId || "unknown"
      ].join("_");

      const ref =
        firestore
          .collection("rankHistory")
          .doc(
            safeDocumentId(
              id,
              `history_${start + index}`
            )
          );

      batch.set(
        ref,
        removeInternalFields(entry),
        { merge: true }
      );
    }

    await batch.commit();
  }
}

/*
==================================================
SAVE CONFIG
==================================================
*/

async function saveConfig(data) {
  const config =
    removeInternalFields(
      data.config || {}
    );

  await firestore
    .collection("config")
    .doc("server")
    .set(
      config,
      { merge: true }
    );
}

/*
==================================================
SAVE HELP DESK COUNTERS
==================================================
*/

async function saveCounters(data) {
  await firestore
    .collection("helpDesk")
    .doc("counters")
    .set(
      removeInternalFields({
        date: data.date || "",
        war: Number(data.war || 0),
        backup: Number(data.backup || 0),
        dashboardMessageId:
          data.dashboardMessageId || null
      }),
      { merge: true }
    );
}

/*
==================================================
SAVE EVERYTHING TO FIRESTORE
==================================================
*/

async function saveFirestoreData(data) {
  if (!firebaseReady || !firestore) {
    throw new Error(
      "Firestore is not initialized."
    );
  }

  await savePlayers(data);
  await saveApplications(data);
  await saveRankHistory(data);
  await saveConfig(data);
  await saveCounters(data);
}

/*
==================================================
QUEUE FIRESTORE SAVE
==================================================

Multiple parts of the bot call saveData().

We serialize the saves so simultaneous writes don't
fight each other.
==================================================
*/

function queueFirestoreSave(data) {
  const snapshot =
    removeInternalFields(
      clone(data)
    );

  saveQueue =
    saveQueue
      .then(async () => {
        try {
          await saveFirestoreData(
            snapshot
          );

          console.log(
            "☁️ Database saved."
          );
        } catch (error) {
          console.error(
            "❌ Firestore save failed:",
            error
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
PUBLIC saveData()
==================================================

Existing files already call:

saveData(data);

We keep it synchronous from their point of view.

It immediately writes the local backup and queues
the permanent Firestore save.
==================================================
*/

function saveData(data) {
  /*
  Always make the local backup first.

  BigInt values are safely converted to strings.
  */

  saveLocalData(data);

  /*
  Firestore save happens asynchronously.
  */

  if (firebaseReady && firestore) {
    queueFirestoreSave(data);
  }
}

/*
==================================================
TODAY
==================================================
*/

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

/*
==================================================
DAILY RESET
==================================================
*/

function checkDailyReset(data) {
  const today =
    getToday();

  if (data.date !== today) {
    data.date = today;
    data.war = 0;
    data.backup = 0;

    saveData(data);

    return true;
  }

  return false;
}

/*
==================================================
INITIALIZE DATABASE
==================================================
*/

async function initializeDatabase() {
  /*
  ------------------------------------------------
  LOAD LOCAL BACKUP FIRST
  ------------------------------------------------
  */

  const localData =
    loadLocalData();

  /*
  ------------------------------------------------
  INITIALIZE FIREBASE
  ------------------------------------------------
  */

  initializeFirebase();

  /*
  ------------------------------------------------
  LOAD CLOUD DATA
  ------------------------------------------------
  */

  let cloudData;

  try {
    cloudData =
      await loadFirestoreData();
  } catch (error) {
    console.error(
      "❌ Could not load data from Firestore:",
      error
    );

    throw error;
  }

  /*
  ------------------------------------------------
  RECONCILE
  ------------------------------------------------
  */

  const mergedData =
    reconcileData(
      localData,
      cloudData
    );

  /*
  ------------------------------------------------
  SAVE THE MERGED RESULT
  ------------------------------------------------

  This makes sure data found locally is also copied
  into Firestore, while cloud records remain safe.
  ------------------------------------------------
  */

  saveLocalData(
    mergedData
  );

  await saveFirestoreData(
    mergedData
  );

  console.log(
    "✅ Firestore/local data reconciliation complete."
  );

  return mergedData;
}

/*
==================================================
EXPORTS
==================================================
*/

module.exports = {
  DATA_FILE,
  loadData: loadLocalData,
  saveData,
  initializeDatabase,
  getToday,
  checkDailyReset
};
