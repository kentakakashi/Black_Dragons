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

const {
  EmbedBuilder
} = require("discord.js");

const LOCAL_FILE =
  path.join(__dirname, "..", "allies.json");

const MAX_CLANS = 9;

/*
==================================================
DEFAULT ALLIES
==================================================

These are your current allies.
The leader IDs came from the information you provided.
*/

const DEFAULT_CLANS = [
  {
    id: "nyx",

    name: "Nyx",

    leaderIds: [
      "979259360733696040"
    ],

    invite:
      "https://discord.gg/CC7DkvpCgq",

    logo: null,

    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  {
    id: "sinestra",

    name: "Sinestra",

    leaderIds: [
      "1395308273611178004",
      "1417836401071751239"
    ],

    invite:
      "https://discord.gg/vkFrJhN7T",

    logo: null,

    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  {
    id: "shadow-garden-sg",

    name: "Shadow Garden {SG}",

    leaderIds: [
      "937557115374026752"
    ],

    invite:
      "https://discord.gg/8TxAkFUyc6",

    logo: null,

    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

let firestore = null;
let state = null;
let initialized = false;

/*
==================================================
CLONE
==================================================
*/

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

/*
==================================================
LOCAL LOAD
==================================================
*/

function localLoad() {
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      return JSON.parse(
        fs.readFileSync(
          LOCAL_FILE,
          "utf8"
        )
      );
    }
  } catch (error) {
    console.error(
      "❌ Could not load allies.json:",
      error
    );
  }

  return {
    channelId: null,
    messageId: null,
    clans: clone(DEFAULT_CLANS)
  };
}

/*
==================================================
LOCAL SAVE
==================================================
*/

function localSave(data) {
  try {
    fs.writeFileSync(
      LOCAL_FILE,
      JSON.stringify(
        data,
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      "❌ Could not save allies.json:",
      error
    );
  }
}

/*
==================================================
FIREBASE
==================================================
*/

function initFirebase() {
  if (firestore) {
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
      "Missing Firebase environment variables for Allies system."
    );
  }

  /*
    If the main database already initialized Firebase,
    reuse that Firebase app.
  */

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,

        privateKey:
          privateKey.replace(
            /\\n/g,
            "\n"
          )
      })
    });
  }

  firestore =
    getFirestore();

  return firestore;
}

/*
==================================================
TIMESTAMP
==================================================
*/

function timestampOf(item) {
  return Number(
    item?.updatedAt ||
    item?.createdAt ||
    0
  );
}

/*
==================================================
MERGE CLANS
==================================================
*/

function mergeClans(
  localClans = [],
  cloudClans = []
) {
  const map =
    new Map();

  for (
    const clan of localClans
  ) {
    if (clan?.id) {
      map.set(
        String(clan.id),
        clan
      );
    }
  }

  for (
    const clan of cloudClans
  ) {
    if (!clan?.id) {
      continue;
    }

    const key =
      String(clan.id);

    const old =
      map.get(key);

    if (
      !old ||
      timestampOf(clan) >=
        timestampOf(old)
    ) {
      map.set(
        key,
        clan
      );
    }
  }

  return [
    ...map.values()
  ];
}

/*
==================================================
INITIALIZE
==================================================
*/

async function initialize() {
  if (initialized) {
    return state;
  }

  const local =
    localLoad();

  let cloud = {};

  try {
    const db =
      initFirebase();

    const snap =
      await db
        .collection("allies")
        .doc("config")
        .get();

    if (snap.exists) {
      cloud =
        snap.data();
    }
  } catch (error) {
    console.error(
      "❌ Could not load Allies from Firestore:",
      error
    );
  }

  state = {
    channelId:
      cloud.channelId ||
      local.channelId ||
      null,

    messageId:
      cloud.messageId ||
      local.messageId ||
      null,

    clans:
      mergeClans(
        local.clans || [],
        cloud.clans || []
      )
  };

  /*
    First installation:
    use the current three allies.
  */

  if (
    !state.clans.length &&
    !cloud.clans
  ) {
    state.clans =
      clone(DEFAULT_CLANS);
  }

  initialized = true;

  localSave(state);

  try {
    await save();
  } catch (error) {
    console.error(
      "❌ Could not synchronize Allies with Firestore:",
      error
    );
  }

  return state;
}

/*
==================================================
SAVE
==================================================
*/

async function save() {
  if (!state) {
    throw new Error(
      "Allies system is not initialized."
    );
  }

  /*
    Local backup.
  */

  localSave(state);

  /*
    Firestore persistence.
  */

  const db =
    initFirebase();

  await db
    .collection("allies")
    .doc("config")
    .set(
      {
        channelId:
          state.channelId ||
          null,

        messageId:
          state.messageId ||
          null,

        clans:
          state.clans || [],

        updatedAt:
          Date.now()
      },
      {
        merge: true
      }
    );
}

/*
==================================================
GET STATE
==================================================
*/

function getState() {
  if (!state) {
    state =
      localLoad();
  }

  return state;
}

/*
==================================================
NORMALIZE INVITE
==================================================
*/

function normalizeInvite(value) {
  if (!value) {
    return null;
  }

  const input =
    value.trim();

  if (
    /^https?:\/\//i.test(
      input
    )
  ) {
    return input;
  }

  if (
    /^discord\.gg\//i.test(
      input
    )
  ) {
    return `https://${input}`;
  }

  return `https://discord.gg/${input.replace(
    /^\/+/,
    ""
  )}`;
}

/*
==================================================
EXTRACT DISCORD USER IDS
==================================================
*/

function extractUserIds(value) {
  const ids = [];

  if (!value) {
    return ids;
  }

  for (
    const match of String(
      value
    ).matchAll(
      /(?:<@!?(\\d{17,20})>|(\\d{17,20}))/g
    )
  ) {
    const id =
      match[1] ||
      match[2];

    if (
      id &&
      !ids.includes(id)
    ) {
      ids.push(id);
    }
  }

  return ids.slice(
    0,
    5
  );
}

/*
==================================================
SLUGIFY
==================================================
*/

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(
      0,
      60
    );
}

/*
==================================================
LOGO VALIDATION
==================================================
*/

function validLogo(value) {
  if (!value) {
    return false;
  }

  return /^https?:\/\/\S+$/i.test(
    value.trim()
  );
}

/*
==================================================
LEADER MENTIONS
==================================================
*/

function leaderMentions(clan) {
  if (
    !clan.leaderIds?.length
  ) {
    return "Not specified";
  }

  return clan.leaderIds
    .map(
      id => `<@${id}>`
    )
    .join(" • ");
}

/*
==================================================
HEADER EMBED
==================================================
*/

function createHeaderEmbed(
  clans
) {
  return new EmbedBuilder()
    .setColor(0x7c3aed)

    .setAuthor({
      name:
        "BLACK DRAGONS • ALLIES"
    })

    .setTitle(
      "🤝  BLACK DRAGONS ALLIES"
    )

    .setDescription(
      "**ALLIES • DIFFERENT CLANS • ONE ALLIANCE**\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "Our trusted allied clans are displayed below.\n" +
        "Each card contains the clan leadership and its Discord server.\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )

    .addFields({
      name:
        "🛡️ ALLIANCE NETWORK",

      value:
        `**${clans.length}** allied clan${
          clans.length === 1
            ? ""
            : "s"
        } currently recognized by **BLACK DRAGONS**.\n` +

      inline:
        false
    })

    .setFooter({
      text:
        "BLACK DRAGONS • ALLIES"
    })

    .setTimestamp();
}

/*
==================================================
CLAN COLORS
==================================================
*/

function clanColor(index) {
  const colors = [
    0x8b5cf6,
    0x06b6d4,
    0xef4444,
    0xf59e0b,
    0x22c55e
  ];

  return colors[
    index % colors.length
  ];
}

/*
==================================================
CLAN EMBED
==================================================
*/

function createClanEmbed(
  clan,
  index
) {
  const embed =
    new EmbedBuilder()

      .setColor(
        clanColor(index)
      )

      .setAuthor({
        name:
          `ALLIED CLAN  •  #${String(
            index + 1
          ).padStart(2, "0")}`
      })

      .setTitle(
        `◆ ${clan.name}`
      )

      .setDescription(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
          "**🤝 VERIFIED BLACK DRAGONS ALLY**\n" +
          "━━━━━━━━━━━━━━━━━━━━━━━━━━"
      )

      .addFields(
        {
          name:
            "👑 LEADER(S)",

          value:
            leaderMentions(
              clan
            ),

          inline:
            false
        },

        {
          name:
            "💬 DISCORD SERVER",

          value:
            clan.invite
              ? `**[ JOIN ${clan.name.toUpperCase()} ](${clan.invite})**`
              : "Invite not provided.",

          inline:
            false
        }
      )

      .setFooter({
        text:
          `BLACK DRAGONS ALLIANCE • CLAN #${
            index + 1
          }`
      });

  if (
    validLogo(clan.logo)
  ) {
    embed.setThumbnail(
      clan.logo
    );
  }

  return embed;
}

/*
==================================================
BUILD ALL EMBEDS
==================================================
*/

function buildEmbeds() {
  const current =
    getState();

  const clans =
    current.clans.slice(
      0,
      MAX_CLANS
    );

  return [
    createHeaderEmbed(
      clans
    ),

    ...clans.map(
      (clan, index) =>
        createClanEmbed(
          clan,
          index
        )
    )
  ];
}

/*
==================================================
UPDATE THE PERMANENT MESSAGE
==================================================
*/

async function updateMessage(
  client
) {
  const current =
    getState();

  if (!current.channelId) {
    return {
      ok: false,
      reason:
        "NO_CHANNEL"
    };
  }

  /*
    Discord allows 10 embeds in one message.
    1 = header
    9 = clans
  */

  if (
    current.clans.length >
    MAX_CLANS
  ) {
    return {
      ok: false,
      reason:
        "TOO_MANY_CLANS"
    };
  }

  const channel =
    await client.channels.fetch(
      current.channelId
    );

  if (
    !channel?.isTextBased()
  ) {
    return {
      ok: false,
      reason:
        "INVALID_CHANNEL"
    };
  }

  const payload = {
    embeds:
      buildEmbeds(),

    /*
      Display leader mentions without
      pinging them every time the message
      is edited.
    */

    allowedMentions: {
      parse: []
    }
  };

  let message = null;

  /*
    Try to edit the existing message.
  */

  if (current.messageId) {
    try {
      message =
        await channel.messages.fetch(
          current.messageId
        );
    } catch {
      message = null;
    }
  }

  if (message) {
    await message.edit(
      payload
    );
  } else {
    /*
      Message was deleted or never existed.
      Create a new permanent message.
    */

    message =
      await channel.send(
        payload
      );

    current.messageId =
      message.id;

    await save();
  }

  return {
    ok: true,
    message
  };
}

/*
==================================================
RESTORE ON BOT START
==================================================
*/

async function restore(
  client
) {
  await initialize();

  if (!state.channelId) {
    return false;
  }

  try {
    const result =
      await updateMessage(
        client
      );

    if (result.ok) {
      console.log(
        "🤝 Allies message restored/updated."
      );

      return true;
    }

    console.error(
      `❌ Allies message could not be restored: ${result.reason}`
    );
  } catch (error) {
    console.error(
      "❌ Allies restore failed:",
      error
    );
  }

  return false;
}

/*
==================================================
FIND CLAN
==================================================
*/

function findClan(
  query
) {
  const current =
    getState();

  const value =
    String(
      query || ""
    )
      .trim()
      .toLowerCase();

  return current.clans.find(
    clan =>
      String(
        clan.id
      ).toLowerCase() ===
        value ||
      clan.name.toLowerCase() ===
        value
  );
}

/*
==================================================
SETUP
==================================================
*/

async function setup(
  client,
  channelId
) {
  await initialize();

  state.channelId =
    channelId;

  await save();

  const result =
    await updateMessage(
      client
    );

  await save();

  return result;
}

/*
==================================================
ADD CLAN
==================================================
*/

async function addClan(
  client,
  input
) {
  await initialize();

  if (
    state.clans.length >=
    MAX_CLANS
  ) {
    return {
      ok: false,
      reason:
        "TOO_MANY_CLANS"
    };
  }

  if (
    state.clans.some(
      clan =>
        clan.name.toLowerCase() ===
        input.name.toLowerCase()
    )
  ) {
    return {
      ok: false,
      reason:
        "DUPLICATE"
    };
  }

  const now =
    Date.now();

  state.clans.push({
    id:
      `${slugify(
        input.name
      )}-${now.toString(36)}`,

    name:
      input.name.trim(),

    leaderIds:
      extractUserIds(
        input.leaders
      ),

    invite:
      normalizeInvite(
        input.invite
      ),

    logo:
      validLogo(
        input.logo
      )
        ? input.logo.trim()
        : null,

    createdAt:
      now,

    updatedAt:
      now
  });

  await save();

  const result =
    await updateMessage(
      client
    );

  await save();

  return result;
}

/*
==================================================
REMOVE CLAN
==================================================
*/

async function removeClan(
  client,
  query
) {
  await initialize();

  const clan =
    findClan(query);

  if (!clan) {
    return {
      ok: false,
      reason:
        "NOT_FOUND"
    };
  }

  state.clans =
    state.clans.filter(
      item =>
        item.id !==
        clan.id
    );

  await save();

  const result =
    await updateMessage(
      client
    );

  await save();

  return {
    ok: true,
    clan,
    message:
      result.message
  };
}

/*
==================================================
UPDATE CLAN
==================================================
*/

async function updateClan(
  client,
  query,
  changes
) {
  await initialize();

  const clan =
    findClan(query);

  if (!clan) {
    return {
      ok: false,
      reason:
        "NOT_FOUND"
    };
  }

  if (changes.name) {
    clan.name =
      changes.name.trim();
  }

  if (changes.leaders) {
    clan.leaderIds =
      extractUserIds(
        changes.leaders
      );
  }

  if (changes.invite) {
    clan.invite =
      normalizeInvite(
        changes.invite
      );
  }

  if (changes.logo) {
    clan.logo =
      validLogo(
        changes.logo
      )
        ? changes.logo.trim()
        : null;
  }

  clan.updatedAt =
    Date.now();

  await save();

  const result =
    await updateMessage(
      client
    );

  await save();

  return {
    ok: true,
    clan,
    message:
      result.message
  };
}

module.exports = {
  MAX_CLANS,

  initialize,

  getState,

  buildEmbeds,

  updateMessage,

  restore,

  setup,

  addClan,

  removeClan,

  updateClan,

  findClan,

  extractUserIds
};
