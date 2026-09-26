const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const LOCAL_FILE = path.join(__dirname, '..', 'allies.json');
const MAX_CLANS = 4;

const DEFAULT_CLANS = [
  {
    id: 'nyx',
    name: 'Nyx',
    leaderIds: ['979259360733696040'],
    invite: 'https://discord.gg/CC7DkvpCgq',
    logo: null,
    imageUrl: null,
    bannerUrl: null,
    bannerFile: 'assets/allies/nyx.png'
  },
  {
    id: 'sinestra',
    name: 'Sinestra',
    leaderIds: ['1395308273611178004', '1417836401071751239'],
    invite: 'https://discord.gg/vkFrJhN7T',
    logo: null,
    imageUrl: null,
    bannerUrl: null,
    bannerFile: 'assets/allies/sinestra.png'
  },
  {
    id: 'shadow-garden-sg',
    name: 'Shadow Garden {SG}',
    leaderIds: ['937557115374026752'],
    invite: 'https://discord.gg/8TxAkFUyc6',
    logo: null,
    imageUrl: null,
    bannerUrl: null,
    bannerFile: null
  }
];

let firestore = null;
let state = null;
let initialized = false;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function now() {
  return Date.now();
}

function timestampOf(x) {
  return Number(x?.updatedAt || x?.createdAt || 0);
}

function localLoad() {
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('❌ Could not load allies.json:', e);
  }

  return {
    channelId: null,
    messageId: null,
    headerImageUrl: null,
    headerDescription: null,
    clans: clone(DEFAULT_CLANS)
  };
}

function localSave(data) {
  try {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('❌ Could not save allies.json:', e);
  }
}

function initFirebase() {
  if (firestore) return firestore;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase environment variables for Allies system.');
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n')
      })
    });
  }

  firestore = getFirestore();
  return firestore;
}

function mergeClans(localClans = [], cloudClans = []) {
  const map = new Map();

  for (const clan of localClans) {
    if (clan?.id) {
      map.set(String(clan.id), clan);
    }
  }

  for (const clan of cloudClans) {
    if (!clan?.id) continue;

    const key = String(clan.id);
    const old = map.get(key);

    if (!old || timestampOf(clan) >= timestampOf(old)) {
      map.set(key, clan);
    }
  }

  return [...map.values()];
}

function extractUserIds(value) {
  const ids = [];

  if (!value) return ids;

  for (const match of String(value).matchAll(
    /(?:<@!?(\d{17,20})>|(\d{17,20}))/g
  )) {
    const id = match[1] || match[2];

    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }

  return ids.slice(0, 10);
}

function normalizeInvite(value) {
  if (!value) return null;

  const input = String(value).trim();

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  if (/^discord\.gg\//i.test(input)) {
    return `https://${input}`;
  }

  return `https://discord.gg/${input.replace(/^\/+/, '')}`;
}

function validUrl(value) {
  return !value || /^https?:\/\/\S+$/i.test(String(value).trim());
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function leaderMentions(clan) {
  return clan.leaderIds?.length
    ? clan.leaderIds.map(id => `<@${id}>`).join(' • ')
    : 'Not specified';
}

function defaultEmbed(clan, index = 0) {
  return {
    color: [0x8b5cf6, 0x06b6d4, 0xef4444, 0xf59e0b, 0x22c55e][index % 5],

    title: `◆ ${clan.name}`,

    description:
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '**🤝 VERIFIED BLACK DRAGONS ALLY**\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',

    fields: [
      {
        name: '👑 LEADER(S)',
        value: leaderMentions(clan),
        inline: false
      },
      {
        name: '💬 DISCORD SERVER',
        value: clan.invite
          ? `**[ JOIN ${clan.name.toUpperCase()} ](${clan.invite})**`
          : 'Invite not provided.',
        inline: false
      }
    ],

    footer: {
      text: `BLACK DRAGONS ALLIANCE • CLAN #${index + 1}`
    },

    timestamp: null,

    author: {
      name: `ALLIED CLAN • #${String(index + 1).padStart(2, '0')}`
    },

    url: null,

    thumbnail: clan.logo
      ? {
          url: clan.logo
        }
      : null,

    image: clan.imageUrl
      ? {
          url: clan.imageUrl
        }
      : null
  };
}

function normalizeEmbed(raw, clan, index) {
  const base = defaultEmbed(clan, index);

  const e =
    raw && typeof raw === 'object'
      ? clone(raw)
      : base;

  e.color = Number.isInteger(e.color)
    ? e.color
    : base.color;

  e.title =
    typeof e.title === 'string'
      ? e.title
      : '';

  e.description =
    typeof e.description === 'string'
      ? e.description
      : '';

  e.url = e.url || null;

  e.author = e.author?.name
    ? {
        name: String(e.author.name),
        url: e.author.url || null,
        icon_url: e.author.icon_url || null
      }
    : null;

  e.footer = e.footer?.text
    ? {
        text: String(e.footer.text),
        icon_url: e.footer.icon_url || null
      }
    : null;

  e.thumbnail = e.thumbnail?.url
    ? {
        url: e.thumbnail.url
      }
    : null;

  e.image = e.image?.url
    ? {
        url: e.image.url
      }
    : null;

  e.timestamp = e.timestamp || null;

  e.fields = Array.isArray(e.fields)
    ? e.fields
        .slice(0, 25)
        .map(f => ({
          name: String(f.name || '\u200b').slice(0, 256),
          value: String(f.value || '\u200b').slice(0, 1024),
          inline: Boolean(f.inline)
        }))
    : [];

  return e;
}

function embedBuilderFromData(data) {
  const b = new EmbedBuilder();

  if (data.color !== null && data.color !== undefined) {
    b.setColor(data.color);
  }

  if (data.author?.name) {
    b.setAuthor({
      name: data.author.name,
      ...(data.author.url
        ? { url: data.author.url }
        : {}),
      ...(data.author.icon_url
        ? { iconURL: data.author.icon_url }
        : {})
    });
  }

  if (data.title) {
    b.setTitle(data.title);
  }

  if (data.url) {
    b.setURL(data.url);
  }

  if (data.description) {
    b.setDescription(data.description);
  }

  if (data.fields?.length) {
    b.addFields(data.fields);
  }

  if (data.thumbnail?.url) {
    b.setThumbnail(data.thumbnail.url);
  }

  if (data.image?.url) {
    b.setImage(data.image.url);
  }

  if (data.footer?.text) {
    b.setFooter({
      text: data.footer.text,
      ...(data.footer.icon_url
        ? { iconURL: data.footer.icon_url }
        : {})
    });
  }

  if (data.timestamp) {
    b.setTimestamp(new Date(data.timestamp));
  }

  return b;
}

function defaultHeaderEmbed(clanCount = 0) {
  return {
    color: 0x7c3aed,
    author: { name: 'BLACK DRAGONS • ALLIES' },
    title: '🤝 BLACK DRAGONS ALLIES',
    description:
      '**ALLIES • DIFFERENT CLANS • ONE ALLIANCE**\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Our trusted allied clans are displayed below.\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    fields: [{
      name: '🛡️ ALLIANCE NETWORK',
      value:
        `**${clanCount}** allied clan` +
        `${clanCount === 1 ? '' : 's'} currently recognized by **BLACK DRAGONS**.`,
      inline: false
    }],
    footer: { text: 'BLACK DRAGONS • ALLIES' },
    timestamp: null,
    url: null,
    thumbnail: null,
    image: null
  };
}

function normalizeHeaderEmbed(raw, clanCount = 0) {
  const base = defaultHeaderEmbed(clanCount);
  const e = raw && typeof raw === 'object' ? clone(raw) : base;

  e.color = Number.isInteger(e.color) ? e.color : base.color;
  e.title = typeof e.title === 'string' ? e.title : '';
  e.description = typeof e.description === 'string' ? e.description : '';
  e.url = e.url || null;

  e.author = e.author?.name
    ? {
        name: String(e.author.name),
        url: e.author.url || null,
        icon_url: e.author.icon_url || null
      }
    : null;

  e.footer = e.footer?.text
    ? {
        text: String(e.footer.text),
        icon_url: e.footer.icon_url || null
      }
    : null;

  e.thumbnail = e.thumbnail?.url ? { url: e.thumbnail.url } : null;
  e.image = e.image?.url ? { url: e.image.url } : null;
  e.timestamp = e.timestamp || null;

  e.fields = Array.isArray(e.fields)
    ? e.fields.slice(0, 25).map(field => ({
        name: String(field.name || '\u200b').slice(0, 256),
        value: String(field.value || '\u200b').slice(0, 1024),
        inline: Boolean(field.inline)
      }))
    : [];

  return e;
}

function createHeaderEmbed(clans) {
  const s = getState();
  const data = normalizeHeaderEmbed(s.headerEmbed, clans.length);

  const embed = embedBuilderFromData(data).setTimestamp();

  // Backward compatibility for existing Allies configurations.
  if (!s.headerEmbed) {
    if (s.headerDescription) embed.setDescription(s.headerDescription);
    if (s.headerImageUrl && validUrl(s.headerImageUrl)) embed.setImage(s.headerImageUrl);
  }

  return embed;
}

function buildMessagePayload() {
  const clans = getState().clans.slice(0, MAX_CLANS);

  const embeds = [
    createHeaderEmbed(clans)
  ];

  const files = [];

  for (const [i, clan] of clans.entries()) {
    const banner = new EmbedBuilder()
      .setColor(0x111111);

    const localPath = clan.bannerFile
      ? path.join(__dirname, '..', clan.bannerFile)
      : null;

    let hasBanner = false;

    if (localPath && fs.existsSync(localPath)) {
      const filename = `ally-${clan.id}.png`;

      banner.setImage(`attachment://${filename}`);

      files.push(
        new AttachmentBuilder(localPath).setName(filename)
      );

      hasBanner = true;
    } else if (clan.bannerUrl) {
      banner.setImage(clan.bannerUrl);
      hasBanner = true;
    }

    if (hasBanner) {
      embeds.push(banner);
    }

    embeds.push(
      embedBuilderFromData(
        normalizeEmbed(clan.embed, clan, i)
      )
    );
  }

  return {
    embeds,
    files
  };
}

function buildEmbeds() {
  return buildMessagePayload().embeds;
}

async function initialize() {
  if (initialized) {
    return state;
  }

  const local = localLoad();
  let cloud = {};

  try {
    const snap = await initFirebase()
      .collection('allies')
      .doc('config')
      .get();

    if (snap.exists) {
      cloud = snap.data();
    }
  } catch (e) {
    console.error(
      '❌ Could not load Allies from Firestore:',
      e
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

    headerImageUrl:
      cloud.headerImageUrl ||
      local.headerImageUrl ||
      null,

    headerDescription:
      cloud.headerDescription ??
      local.headerDescription ??
      null,

    headerEmbed:
      cloud.headerEmbed ??
      local.headerEmbed ??
      null,

    clans: mergeClans(
      local.clans || [],
      cloud.clans || []
    )
  };

  if (!state.clans.length && !cloud.clans) {
    state.clans = clone(DEFAULT_CLANS);
  }

  if (!state.headerEmbed) {
    const legacy = defaultHeaderEmbed(state.clans.length);

    if (state.headerDescription) {
      legacy.description = state.headerDescription;
    }

    if (state.headerImageUrl && validUrl(state.headerImageUrl)) {
      legacy.image = { url: state.headerImageUrl };
    }

    state.headerEmbed = normalizeHeaderEmbed(
      legacy,
      state.clans.length
    );
  } else {
    state.headerEmbed = normalizeHeaderEmbed(
      state.headerEmbed,
      state.clans.length
    );
  }

  state.clans = state.clans.map((clan, i) => {
    const def = DEFAULT_CLANS.find(
      x => x.id === clan.id
    );

    if (clan.bannerFile === undefined) {
      clan.bannerFile =
        def?.bannerFile || null;
    }

    if (clan.bannerUrl === undefined) {
      clan.bannerUrl =
        def?.bannerUrl || null;
    }

    clan.embed = normalizeEmbed(
      clan.embed,
      clan,
      i
    );

    return clan;
  });

  initialized = true;

  localSave(state);

  try {
    await save();
  } catch (e) {
    console.error(
      '❌ Could not synchronize Allies with Firestore:',
      e
    );
  }

  return state;
}

async function save() {
  if (!state) {
    throw new Error(
      'Allies system is not initialized.'
    );
  }

  localSave(state);

  await initFirebase()
    .collection('allies')
    .doc('config')
    .set(
      {
        channelId: state.channelId || null,
        messageId: state.messageId || null,
        headerImageUrl: state.headerImageUrl || null,
        headerDescription: state.headerDescription || null,
        headerEmbed: state.headerEmbed || null,
        clans: state.clans,
        updatedAt: now()
      },
      {
        merge: true
      }
    );
}

function getState() {
  if (!state) {
    state = localLoad();
  }

  return state;
}

function findClan(query) {
  const v = String(query || '')
    .trim()
    .toLowerCase();

  return getState().clans.find(
    c =>
      String(c.id).toLowerCase() === v ||
      String(c.name).toLowerCase() === v
  );
}

async function updateHeader(client, headerEmbed) {
  await initialize();

  const normalized = normalizeHeaderEmbed(
    headerEmbed,
    state.clans.length
  );

  state.headerEmbed = normalized;
  state.headerDescription = normalized.description || null;
  state.headerImageUrl = normalized.image?.url || null;

  await save();

  const r = await updateMessage(client);

  await save();

  return r;
}

async function updateMessage(client) {
  const current = getState();

  if (!current.channelId) {
    return {
      ok: false,
      reason: 'NO_CHANNEL'
    };
  }

  if (current.clans.length > MAX_CLANS) {
    return {
      ok: false,
      reason: 'TOO_MANY_CLANS'
    };
  }

  const channel = await client.channels.fetch(
    current.channelId
  );

  if (!channel?.isTextBased()) {
    return {
      ok: false,
      reason: 'INVALID_CHANNEL'
    };
  }

  const built = buildMessagePayload();

  const payload = {
    embeds: built.embeds,
    files: built.files,
    attachments: [],
    allowedMentions: {
      parse: []
    }
  };

  let message = null;

  if (current.messageId) {
    try {
      message = await channel.messages.fetch(
        current.messageId
      );
    } catch {
      message = null;
    }
  }

  if (message) {
    await message.edit(payload);
  } else {
    message = await channel.send(payload);

    current.messageId = message.id;

    await save();
  }

  return {
    ok: true,
    message
  };
}

async function restore(client) {
  await initialize();

  if (!state.channelId) {
    return false;
  }

  try {
    const r = await updateMessage(client);

    if (r.ok) {
      console.log(
        '🤝 Allies message restored/updated.'
      );

      return true;
    }

    console.error(
      `❌ Allies restore failed: ${r.reason}`
    );
  } catch (e) {
    console.error(
      '❌ Allies restore failed:',
      e
    );
  }

  return false;
}

async function setup(client, channelId) {
  await initialize();

  state.channelId = channelId;

  await save();

  const r = await updateMessage(client);

  await save();

  return r;
}

function syncHeaderLegacyChanges(changes) {
  const hasDescription = Object.prototype.hasOwnProperty.call(changes, 'headerDescription');
  const hasImage = Object.prototype.hasOwnProperty.call(changes, 'headerImageUrl');

  if (!hasDescription && !hasImage) return;

  state.headerEmbed = normalizeHeaderEmbed(
    state.headerEmbed,
    state.clans.length
  );

  if (hasDescription) {
    state.headerDescription = changes.headerDescription
      ? String(changes.headerDescription).trim()
      : null;

    state.headerEmbed.description =
      state.headerDescription ||
      defaultHeaderEmbed(state.clans.length).description;
  }

  if (hasImage) {
    state.headerImageUrl =
      changes.headerImageUrl && validUrl(changes.headerImageUrl)
        ? String(changes.headerImageUrl).trim()
        : null;

    state.headerEmbed.image =
      state.headerImageUrl
        ? { url: state.headerImageUrl }
        : null;
  }
}

async function addClan(client, input) {
  await initialize();

  syncHeaderLegacyChanges(input);

  if (state.clans.length >= MAX_CLANS) {
    return {
      ok: false,
      reason: 'TOO_MANY_CLANS'
    };
  }

  if (
    state.clans.some(
      c =>
        c.name.toLowerCase() ===
        String(input.name)
          .trim()
          .toLowerCase()
    )
  ) {
    return {
      ok: false,
      reason: 'DUPLICATE'
    };
  }

  const t = now();

  const clan = {
    id: `${slugify(input.name)}-${t.toString(36)}`,

    name: String(input.name).trim(),

    leaderIds: extractUserIds(
      input.leaders
    ),

    invite: normalizeInvite(
      input.invite
    ),

    logo:
      validUrl(input.logo)
        ? input.logo?.trim() || null
        : null,

    imageUrl:
      validUrl(input.imageUrl)
        ? input.imageUrl?.trim() || null
        : null,

    bannerUrl:
      validUrl(input.bannerUrl)
        ? input.bannerUrl?.trim() || null
        : null,

    bannerFile:
      input.bannerFile || null,

    createdAt: t,
    updatedAt: t
  };

  clan.embed = normalizeEmbed(
    input.embed,
    clan,
    state.clans.length
  );

  state.clans.push(clan);

  await save();

  const r = await updateMessage(client);

  await save();

  return {
    ...r,
    clan
  };
}

async function updateClan(client, query, changes) {
  await initialize();

  syncHeaderLegacyChanges(changes);

  const clan = findClan(query);

  if (!clan) {
    return {
      ok: false,
      reason: 'NOT_FOUND'
    };
  }

  if (changes.name !== undefined) {
    clan.name = String(
      changes.name
    ).trim();
  }

  if (changes.leaders !== undefined) {
    clan.leaderIds =
      extractUserIds(changes.leaders);
  }

  if (changes.invite !== undefined) {
    clan.invite =
      normalizeInvite(changes.invite);
  }

  if (changes.logo !== undefined) {
    clan.logo =
      changes.logo &&
      validUrl(changes.logo)
        ? String(changes.logo).trim()
        : null;
  }

  if (changes.imageUrl !== undefined) {
    clan.imageUrl =
      changes.imageUrl &&
      validUrl(changes.imageUrl)
        ? String(changes.imageUrl).trim()
        : null;
  }

  if (changes.bannerUrl !== undefined) {
    clan.bannerUrl =
      changes.bannerUrl &&
      validUrl(changes.bannerUrl)
        ? String(changes.bannerUrl).trim()
        : null;
  }

  if (changes.bannerFile !== undefined) {
    clan.bannerFile =
      changes.bannerFile || null;
  }

  if (changes.embed) {
    clan.embed = normalizeEmbed(
      changes.embed,
      clan,
      state.clans.indexOf(clan)
    );
  }

  clan.updatedAt = now();

  await save();

  const r = await updateMessage(client);

  await save();

  return {
    ...r,
    clan
  };
}

async function removeClan(client, query) {
  await initialize();

  const clan = findClan(query);

  if (!clan) {
    return {
      ok: false,
      reason: 'NOT_FOUND'
    };
  }

  state.clans = state.clans.filter(
    c => c.id !== clan.id
  );

  await save();

  const r = await updateMessage(client);

  await save();

  return {
    ...r,
    clan
  };
}

module.exports = {
  MAX_CLANS,
  DEFAULT_CLANS,
  initialize,
  getState,
  save,
  buildEmbeds,
  buildMessagePayload,
  updateMessage,
  updateHeader,
  restore,
  setup,
  addClan,
  updateClan,
  removeClan,
  findClan,
  normalizeHeaderEmbed,
  extractUserIds,
  normalizeInvite,
  normalizeEmbed,
  embedBuilderFromData
};
