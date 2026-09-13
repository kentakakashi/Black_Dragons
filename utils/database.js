const fs = require("fs");
const path = require("path");

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
  // These legacy fields are deliberately kept so old Help Desk/Rank data survives.
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
  rankApplications: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

  // Migrate the existing rankConfig format into the new modular config.
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

  // Existing .env IDs remain valid fallbacks; don't erase saved values.
  if (!data.config.helpDesk.warRoleId && process.env.WAR_ROLE_ID) {
    data.config.helpDesk.warRoleId = process.env.WAR_ROLE_ID;
  }
  if (!data.config.helpDesk.backupRoleId && process.env.BACKUP_ROLE_ID) {
    data.config.helpDesk.backupRoleId = process.env.BACKUP_ROLE_ID;
  }
  if (!data.config.helpDesk.channelId && process.env.DASHBOARD_CHANNEL_ID) {
    data.config.helpDesk.channelId = process.env.DASHBOARD_CHANNEL_ID;
  }

  data.rankUsers = saved.rankUsers || {};
  data.rankApplications = saved.rankApplications || [];

  return data;
}

function loadData() {
  let saved = {};

  try {
    if (fs.existsSync(DATA_FILE)) {
      saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (error) {
    console.error("❌ Could not load data.json:", error);
  }

  const data = mergeData(saved);
  checkDailyReset(data);
  return data;
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("❌ Could not save data.json:", error);
  }
}

function getToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function checkDailyReset(data) {
  const today = getToday();

  if (data.date !== today) {
    data.date = today;
    data.war = 0;
    data.backup = 0;
    saveData(data);
    return true;
  }

  return false;
}

module.exports = {
  DATA_FILE,
  loadData,
  saveData,
  getToday,
  checkDailyReset
};
