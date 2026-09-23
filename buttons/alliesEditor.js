const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} = require('discord.js');

const allies = require('../systems/allies');

const sessions = new Map();
const SESSION_TTL = 15 * 60 * 1000;

function token() {
  return Math.random()
    .toString(36)
    .slice(2, 10);
}

function isAdmin(i) {
  return i.memberPermissions?.has(
    'Administrator'
  );
}

function clone(v) {
  return JSON.parse(
    JSON.stringify(v)
  );
}

function validUrl(v) {
  return (
    !v ||
    /^https?:\/\/\S+$/i.test(
      String(v).trim()
    )
  );
}

function hexColor(v) {
  const x = String(v || '')
    .trim()
    .replace(/^#/, '');

  if (!/^[0-9a-fA-F]{6}$/.test(x)) {
    return null;
  }

  return parseInt(x, 16);
}

function clean(v) {
  return String(v ?? '').trim();
}

function getSession(i) {
  const parts =
    i.customId.split(':');

  return sessions.get(parts[2]);
}

function saveSession(s) {
  s.expiresAt =
    Date.now() + SESSION_TTL;

  if (s.timer) {
    clearTimeout(s.timer);
  }

  s.timer = setTimeout(
    () => sessions.delete(s.id),
    SESSION_TTL
  );

  sessions.set(s.id, s);
}

function editorEmbed(s) {
  const d = s.draft;

  const e = new EmbedBuilder()
    .setColor(
      Number.isInteger(d.color)
        ? d.color
        : 0x7c3aed
    )
    .setTitle(
      '🛠️ ADVANCED ALLIES EMBED EDITOR'
    )
    .setDescription(
      `**${
        s.mode === 'add'
          ? 'NEW ALLIED CLAN'
          : 'EDITING ALLIED CLAN'
      }**\n\n` +
      'Use the controls below to edit **every supported part of the Discord embed**.\n\n' +
      `**Clan:** ${s.meta.name || 'Unnamed'}\n` +
      `**Fields:** ${d.fields?.length || 0}/25\n` +
      `**Image:** ${
        d.image?.url
          ? 'Set'
          : 'Not set'
      } • **Thumbnail:** ${
        d.thumbnail?.url
          ? 'Set'
          : 'Not set'
      }`
    )
    .addFields(
      {
        name: 'TITLE',
        value: d.title || '—',
        inline: true
      },
      {
        name: 'DESCRIPTION',
        value: d.description
          ? `${d.description.slice(0, 180)}${
              d.description.length > 180
                ? '…'
                : ''
            }`
          : '—',
        inline: true
      },
      {
        name: 'COLOR',
        value:
          `#${Number(
            d.color || 0
          )
            .toString(16)
            .padStart(6, '0')
            .toUpperCase()}`,
        inline: true
      }
    )
    .setFooter({
      text:
        'Only the administrator who opened this editor can use it.'
    });

  if (s.meta.bannerUrl) {
    e.setImage(
      s.meta.bannerUrl
    );
  }

  return e;
}

function controls(s) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `ae:basic:${s.id}`
        )
        .setLabel('Basic')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `ae:style:${s.id}`
        )
        .setLabel('Color')
        .setEmoji('🎨')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `ae:author:${s.id}`
        )
        .setLabel('Author')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `ae:media:${s.id}`
        )
        .setLabel('Images')
        .setEmoji('🖼️')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `ae:footer:${s.id}`
        )
        .setLabel('Footer')
        .setEmoji('📌')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `ae:fields:${s.id}`
        )
        .setLabel('Fields')
        .setEmoji('🧱')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `ae:time:${s.id}`
        )
        .setLabel('Timestamp')
        .setEmoji('⏱️')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `ae:identity:${s.id}`
        )
        .setLabel('Clan Info')
        .setEmoji('🏷️')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `ae:save:${s.id}`
        )
        .setLabel('SAVE')
        .setEmoji('💾')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `ae:cancel:${s.id}`
        )
        .setLabel('Cancel')
        .setEmoji('✖️')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

async function render(i, s) {
  saveSession(s);

  await i.update({
    embeds: [editorEmbed(s)],
    components: controls(s),
    allowedMentions: {
      parse: []
    }
  });
}

function modalBase(id, title) {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(title);
}

function input(
  id,
  label,
  value,
  style = TextInputStyle.Short,
  required = false,
  max = 4000
) {
  return new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(max)
    .setValue(
      String(value || '').slice(
        0,
        max
      )
    );
}

function row(x) {
  return new ActionRowBuilder()
    .addComponents(x);
}

async function showBasic(i, s) {
  const d = s.draft;

  const m = modalBase(
    `aem:basic:${s.id}`,
    'Edit Basic Embed'
  );

  m.addComponents(
    row(
      input(
        'title',
        'Title',
        d.title,
        TextInputStyle.Short,
        false,
        256
      )
    ),

    row(
      input(
        'url',
        'Title URL',
        d.url,
        TextInputStyle.Short,
        false,
        1000
      )
    ),

    row(
      input(
        'description',
        'Description',
        d.description,
        TextInputStyle.Paragraph,
        false,
        4000
      )
    )
  );

  await i.showModal(m);
}

async function showStyle(i, s) {
  const m = modalBase(
    `aem:style:${s.id}`,
    'Edit Embed Color'
  );

  m.addComponents(
    row(
      input(
        'color',
        'HEX color (example: 7C3AED)',
        `#${Number(
          s.draft.color || 0
        )
          .toString(16)
          .padStart(6, '0')}`,
        TextInputStyle.Short,
        true,
        7
      )
    )
  );

  await i.showModal(m);
}

async function showAuthor(i, s) {
  const a =
    s.draft.author || {};

  const m = modalBase(
    `aem:author:${s.id}`,
    'Edit Embed Author'
  );

  m.addComponents(
    row(
      input(
        'name',
        'Author name',
        a.name || '',
        TextInputStyle.Short,
        false,
        256
      )
    ),

    row(
      input(
        'url',
        'Author URL',
        a.url || '',
        TextInputStyle.Short,
        false,
        1000
      )
    ),

    row(
      input(
        'icon',
        'Author icon URL',
        a.icon_url || '',
        TextInputStyle.Short,
        false,
        1000
      )
    )
  );

  await i.showModal(m);
}

async function showMedia(i, s) {
  const m = modalBase(
    `aem:media:${s.id}`,
    'Edit Embed Images'
  );

  m.addComponents(
    row(
      input(
        'banner',
        'Clan top card image URL',
        s.meta.bannerUrl || '',
        TextInputStyle.Short,
        false,
        1000
      )
    ),

    row(
      input(
        'header',
        'HEADER embed image URL',
        s.meta.headerImageUrl || '',
        TextInputStyle.Short,
        false,
        1000
      )
    ),

    row(
      input(
        'image',
        'Embed image URL',
        s.draft.image?.url || '',
        TextInputStyle.Short,
        false,
        1000
      )
    ),

    row(
      input(
        'thumbnail',
        'Thumbnail URL',
        s.draft.thumbnail?.url || '',
        TextInputStyle.Short,
        false,
        1000
      )
    )
  );

  await i.showModal(m);
}

async function showFooter(i, s) {
  const f =
    s.draft.footer || {};

  const m = modalBase(
    `aem:footer:${s.id}`,
    'Edit Embed Footer'
  );

  m.addComponents(
    row(
      input(
        'text',
        'Footer text',
        f.text || '',
        TextInputStyle.Short,
        false,
        2048
      )
    ),

    row(
      input(
        'icon',
        'Footer icon URL',
        f.icon_url || '',
        TextInputStyle.Short,
        false,
        1000
      )
    )
  );

  await i.showModal(m);
}

async function showTime(i, s) {
  const m = modalBase(
    `aem:time:${s.id}`,
    'Edit Embed Timestamp'
  );

  m.addComponents(
    row(
      input(
        'timestamp',
        'ISO timestamp or CLEAR',
        s.draft.timestamp || '',
        TextInputStyle.Short,
        false,
        64
      )
    )
  );

  await i.showModal(m);
}

async function showIdentity(i, s) {
  const m = modalBase(
    `aem:identity:${s.id}`,
    'Edit Clan Information'
  );

  m.addComponents(
    row(
      input(
        'name',
        'Clan / server name',
        s.meta.name || '',
        TextInputStyle.Short,
        true,
        100
      )
    ),

    row(
      input(
        'leaders',
        'Leader IDs or @mentions',
        (s.meta.leaderIds || [])
          .map(x => `<@${x}>`)
          .join(' '),
        TextInputStyle.Short,
        false,
        1000
      )
    ),

    row(
      input(
        'invite',
        'Discord invite',
        s.meta.invite || '',
        TextInputStyle.Short,
        false,
        1000
      )
    )
  );

  await i.showModal(m);
}

function fieldMenu(s) {
  const options =
    (s.draft.fields || []).map(
      (f, i) => ({
        label:
          `${i + 1}. ${
            f.name || 'Unnamed field'
          }`.slice(0, 100),
        value: String(i)
      })
    );

  if (!options.length) {
    options.push({
      label: 'No fields yet',
      value: 'none'
    });
  }

  return new StringSelectMenuBuilder()
    .setCustomId(
      `aef:pick:${s.id}`
    )
    .setPlaceholder(
      'Select a field to edit/remove'
    )
    .setDisabled(
      !s.draft.fields?.length
    )
    .addOptions(options);
}

function fieldControls(s) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `aef:add:${s.id}`
        )
        .setLabel('Add Field')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `aef:edit:${s.id}`
        )
        .setLabel('Edit Selected')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `aef:remove:${s.id}`
        )
        .setLabel('Remove Selected')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(
          `aef:clear:${s.id}`
        )
        .setLabel('Clear All')
        .setEmoji('🧹')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `aef:back:${s.id}`
        )
        .setLabel('Back')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      fieldMenu(s)
    )
  ];
}

async function showFields(i, s) {
  saveSession(s);

  const e = new EmbedBuilder()
    .setColor(
      s.draft.color || 0x7c3aed
    )
    .setTitle(
      '🧱 FIELD MANAGER'
    )
    .setDescription(
      `Manage up to **25 fields**.\n\n` +
      `Selected field: **${
        s.selectedField === null
          ? 'None'
          : Number(
              s.selectedField
            ) + 1
      }**`
    );

  (s.draft.fields || [])
    .slice(0, 25)
    .forEach((f, n) => {
      e.addFields({
        name: `${n + 1}. ${f.name}`,
        value:
          `${f.value.slice(0, 900)}${
            f.value.length > 900
              ? '…'
              : ''
          }`,
        inline: Boolean(f.inline)
      });
    });

  await i.update({
    embeds: [e],
    components: fieldControls(s),
    allowedMentions: {
      parse: []
    }
  });
}

async function showFieldModal(i, s, index) {
  const f =
    index === null
      ? {
          name: '',
          value: '',
          inline: false
        }
      : (
          s.draft.fields[index] || {
            name: '',
            value: '',
            inline: false
          }
        );

  const m = modalBase(
    `aefm:${s.id}:${
      index === null
        ? 'new'
        : index
    }`,
    'Edit Embed Field'
  );

  m.addComponents(
    row(
      input(
        'name',
        'Field name',
        f.name,
        TextInputStyle.Short,
        true,
        256
      )
    ),

    row(
      input(
        'value',
        'Field value',
        f.value,
        TextInputStyle.Paragraph,
        true,
        1024
      )
    ),

    row(
      input(
        'inline',
        'Inline? YES or NO',
        f.inline ? 'YES' : 'NO',
        TextInputStyle.Short,
        true,
        3
      )
    )
  );

  await i.showModal(m);
}

function validateDraft(s) {
  const d = s.draft;

  if (d.title.length > 256) {
    return 'Title is over 256 characters.';
  }

  if (d.description.length > 4096) {
    return 'Description is over 4096 characters.';
  }

  if (d.fields.length > 25) {
    return 'Discord allows a maximum of 25 fields.';
  }

  if (
    d.url &&
    !validUrl(d.url)
  ) {
    return 'Title URL must start with http:// or https://.';
  }

  for (const u of [
    d.image?.url,
    d.thumbnail?.url,
    d.author?.url,
    d.author?.icon_url,
    d.footer?.icon_url
  ]) {
    if (
      u &&
      !validUrl(u)
    ) {
      return 'Every image/icon/URL must start with http:// or https://.';
    }
  }

  if (!s.meta.name.trim()) {
    return 'Clan/server name cannot be empty.';
  }

  if (
    s.meta.bannerUrl &&
    !validUrl(s.meta.bannerUrl)
  ) {
    return 'Banner image URL must start with http:// or https://.';
  }

  if (
    s.meta.headerImageUrl &&
    !validUrl(s.meta.headerImageUrl)
  ) {
    return 'Header image URL must start with http:// or https://.';
  }

  if (
    d.author?.name &&
    d.author.name.length > 256
  ) {
    return 'Author name is over 256 characters.';
  }

  if (
    d.footer?.text &&
    d.footer.text.length > 2048
  ) {
    return 'Footer text is over 2048 characters.';
  }

  return null;
}

async function openAdd(i) {
  await allies.initialize();

  const id = token();

  const meta = {
    name: '',
    leaderIds: [],
    invite: null,
    bannerUrl: null,
    bannerFile: null,
    headerImageUrl:
      allies.getState().headerImageUrl || null
  };

  const draft = allies.normalizeEmbed(
    null,
    {
      name: 'NEW ALLY',
      leaderIds: [],
      invite: null
    },
    allies.getState().clans.length
  );

  const s = {
    id,
    ownerId: i.user.id,
    mode: 'add',
    meta,
    draft,
    selectedField: null
  };

  saveSession(s);

  await i.reply({
    embeds: [editorEmbed(s)],
    components: controls(s),
    ephemeral: true,
    allowedMentions: {
      parse: []
    }
  });
}

async function openPicker(i, mode) {
  await allies.initialize();

  const clans =
    allies.getState().clans;

  if (!clans.length) {
    await i.reply({
      content:
        '❌ There are no allied clans yet.',
      ephemeral: true
    });

    return;
  }

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `aeclan:${mode}:${token()}`
      )
      .setPlaceholder(
        mode === 'update'
          ? 'Choose a clan to edit'
          : 'Choose a clan to remove'
      )
      .addOptions(
        clans
          .slice(0, 25)
          .map(c => ({
            label: c.name.slice(
              0,
              100
            ),
            value: c.id,
            description:
              `${c.leaderIds?.length || 0} leader(s)`
          }))
      );

  await i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle(
          mode === 'update'
            ? '🛠️ Choose Clan to Edit'
            : '🗑️ Choose Clan to Remove'
        )
        .setDescription(
          'Select the clan below.'
        )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        menu
      )
    ],
    ephemeral: true
  });
}

async function handleCommand(
  interaction,
  subcommand
) {
  if (!isAdmin(interaction)) {
    await interaction.reply({
      content:
        '❌ Only administrators can use the Allies editor.',
      ephemeral: true
    });

    return true;
  }

  if (subcommand === 'add') {
    await openAdd(interaction);
    return true;
  }

  if (subcommand === 'update') {
    await openPicker(
      interaction,
      'update'
    );
    return true;
  }

  if (subcommand === 'remove') {
    await openPicker(
      interaction,
      'remove'
    );
    return true;
  }

  return false;
}

async function handleButton(i) {
  if (
    !i.customId.startsWith('ae:') &&
    !i.customId.startsWith('aef:')
  ) {
    return false;
  }

  const s = getSession(i);

  if (
    !s ||
    s.ownerId !== i.user.id
  ) {
    await i.reply({
      content:
        '❌ This editor has expired or belongs to another administrator.',
      ephemeral: true
    });

    return true;
  }

  saveSession(s);

  const action =
    i.customId.split(':')[1];

  if (action === 'basic') {
    await showBasic(i, s);
    return true;
  }

  if (action === 'style') {
    await showStyle(i, s);
    return true;
  }

  if (action === 'author') {
    await showAuthor(i, s);
    return true;
  }

  if (action === 'media') {
    await showMedia(i, s);
    return true;
  }

  if (action === 'footer') {
    await showFooter(i, s);
    return true;
  }

  if (action === 'time') {
    await showTime(i, s);
    return true;
  }

  if (action === 'identity') {
    await showIdentity(i, s);
    return true;
  }

  if (action === 'fields') {
    await showFields(i, s);
    return true;
  }

  if (action === 'save') {
    const err =
      validateDraft(s);

    if (err) {
      await i.reply({
        content: `❌ ${err}`,
        ephemeral: true
      });

      return true;
    }

    await i.deferUpdate();

    try {
      let result;

      if (s.mode === 'add') {
        result =
          await allies.addClan(
            i.client,
            {
              name: s.meta.name,
              leaders:
                s.meta.leaderIds.join(
                  ' '
                ),
              invite:
                s.meta.invite,
              bannerUrl:
                s.meta.bannerUrl,
              bannerFile:
                s.meta.bannerFile,
              headerImageUrl:
                s.meta.headerImageUrl,
              embed: s.draft
            }
          );
      } else {
        result =
          await allies.updateClan(
            i.client,
            s.meta.id,
            {
              name: s.meta.name,
              leaders:
                s.meta.leaderIds.join(
                  ' '
                ),
              invite:
                s.meta.invite,
              bannerUrl:
                s.meta.bannerUrl,
              bannerFile:
                s.meta.bannerFile,
              headerImageUrl:
                s.meta.headerImageUrl,
              embed: s.draft
            }
          );
      }

      if (!result.ok) {
        throw new Error(
          result.reason ||
            'Save failed'
        );
      }

      sessions.delete(s.id);

      await i.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x22c55e)
            .setTitle(
              '✅ Allies Embed Saved'
            )
            .setDescription(
              `**${result.clan.name}** has been ${
                s.mode === 'add'
                  ? 'added'
                  : 'updated'
              }.\n\n` +
              'The permanent Allies message has been refreshed.'
            )
        ],
        components: []
      });
    } catch (e) {
      console.error(
        '❌ Allies editor save failed:',
        e
      );

      await i.editReply({
        content:
          `❌ Could not save the clan. ${
            e.message || ''
          }`,
        embeds: [],
        components: []
      });
    }

    return true;
  }

  if (action === 'cancel') {
    sessions.delete(s.id);

    await i.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle(
            '✖️ Editor Cancelled'
          )
          .setDescription(
            'No changes were saved.'
          )
      ],
      components: []
    });

    return true;
  }

  if (action === 'add') {
    await showFieldModal(
      i,
      s,
      null
    );

    return true;
  }

  if (action === 'edit') {
    if (
      s.selectedField === null
    ) {
      await i.reply({
        content:
          '❌ Select a field first.',
        ephemeral: true
      });

      return true;
    }

    await showFieldModal(
      i,
      s,
      s.selectedField
    );

    return true;
  }

  if (action === 'remove') {
    if (
      s.selectedField === null
    ) {
      await i.reply({
        content:
          '❌ Select a field first.',
        ephemeral: true
      });

      return true;
    }

    s.draft.fields.splice(
      s.selectedField,
      1
    );

    s.selectedField = null;

    await showFields(i, s);

    return true;
  }

  if (action === 'clear') {
    s.draft.fields = [];
    s.selectedField = null;

    await showFields(i, s);

    return true;
  }

  if (action === 'back') {
    await render(i, s);
    return true;
  }

  return true;
}

async function handleSelect(i) {
  if (
    i.customId.startsWith(
      'aeclan:'
    )
  ) {
    if (!isAdmin(i)) {
      await i.reply({
        content:
          '❌ Administrator only.',
        ephemeral: true
      });

      return true;
    }

    const [, mode] =
      i.customId.split(':');

    const id = i.values[0];

    const clan =
      allies.findClan(id);

    if (!clan) {
      await i.update({
        content:
          '❌ Clan not found.',
        embeds: [],
        components: []
      });

      return true;
    }

    if (mode === 'remove') {
      await i.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle(
              '⚠️ Confirm Removal'
            )
            .setDescription(
              `Remove **${clan.name}** from the Allies list? This updates the permanent message immediately.`
            )
        ],

        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `aeremove:${clan.id}`
              )
              .setLabel('REMOVE')
              .setStyle(
                ButtonStyle.Danger
              ),

            new ButtonBuilder()
              .setCustomId(
                `aecancelremove:${clan.id}`
              )
              .setLabel('Cancel')
              .setStyle(
                ButtonStyle.Secondary
              )
          )
        ]
      });

      return true;
    }

    const sid = token();

    const s = {
      id: sid,
      ownerId: i.user.id,
      mode: 'update',

      meta: {
        id: clan.id,
        name: clan.name,
        leaderIds:
          clan.leaderIds || [],
        invite:
          clan.invite || null,
        bannerUrl:
          clan.bannerUrl || null,
        bannerFile:
          clan.bannerFile || null,
        headerImageUrl:
          allies.getState().headerImageUrl || null
      },

      draft: clone(
        clan.embed ||
          allies.normalizeEmbed(
            null,
            clan,
            allies
              .getState()
              .clans.indexOf(clan)
          )
      ),

      selectedField: null
    };

    saveSession(s);

    await i.update({
      embeds: [
        editorEmbed(s)
      ],
      components: controls(s),
      allowedMentions: {
        parse: []
      }
    });

    return true;
  }

  if (
    i.customId.startsWith(
      'aef:pick:'
    )
  ) {
    const s = getSession(i);

    if (
      !s ||
      s.ownerId !== i.user.id
    ) {
      await i.reply({
        content:
          '❌ Editor expired.',
        ephemeral: true
      });

      return true;
    }

    s.selectedField =
      i.values[0] === 'none'
        ? null
        : Number(i.values[0]);

    await showFields(i, s);

    return true;
  }

  return false;
}

async function handleOtherButton(i) {
  if (
    i.customId.startsWith(
      'aeremove:'
    )
  ) {
    if (!isAdmin(i)) {
      await i.reply({
        content:
          '❌ Administrator only.',
        ephemeral: true
      });

      return true;
    }

    const id =
      i.customId.split(':')[1];

    const clan =
      allies.findClan(id);

    if (!clan) {
      await i.update({
        content:
          '❌ Clan no longer exists.',
        embeds: [],
        components: []
      });

      return true;
    }

    await i.deferUpdate();

    const r =
      await allies.removeClan(
        i.client,
        id
      );

    if (!r.ok) {
      await i.editReply({
        content:
          '❌ Could not remove that clan.',
        embeds: [],
        components: []
      });

      return true;
    }

    await i.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle(
            '✅ Clan Removed'
          )
          .setDescription(
            `**${clan.name}** was removed and the permanent Allies message was updated.`
          )
      ],
      components: []
    });

    return true;
  }

  if (
    i.customId.startsWith(
      'aecancelremove:'
    )
  ) {
    await i.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x7c3aed)
          .setTitle(
            '↩️ Removal Cancelled'
          )
          .setDescription(
            'No changes were made.'
          )
      ],
      components: []
    });

    return true;
  }

  return false;
}

async function handleModal(i) {
  if (
    !i.customId.startsWith(
      'aem:'
    ) &&
    !i.customId.startsWith(
      'aefm:'
    )
  ) {
    return false;
  }

  const parts =
    i.customId.split(':');

  const sessionId =
    i.customId.startsWith(
      'aefm:'
    )
      ? parts[1]
      : parts[2];

  const s =
    sessions.get(sessionId);

  if (
    !s ||
    s.ownerId !== i.user.id
  ) {
    await i.reply({
      content:
        '❌ This editor has expired or belongs to another administrator.',
      ephemeral: true
    });

    return true;
  }

  saveSession(s);

  if (
    i.customId.startsWith(
      'aefm:'
    )
  ) {
    const idx =
      parts[2] === 'new'
        ? null
        : Number(parts[2]);

    const name = clean(
      i.fields.getTextInputValue(
        'name'
      )
    );

    const value = clean(
      i.fields.getTextInputValue(
        'value'
      )
    );

    const inline =
      /^yes$/i.test(
        clean(
          i.fields.getTextInputValue(
            'inline'
          )
        )
      );

    if (!name || !value) {
      await i.reply({
        content:
          '❌ Field name and value are required.',
        ephemeral: true
      });

      return true;
    }

    if (idx === null) {
      if (
        s.draft.fields.length >=
        25
      ) {
        await i.reply({
          content:
            '❌ Discord allows a maximum of 25 fields.',
          ephemeral: true
        });

        return true;
      }

      s.draft.fields.push({
        name,
        value,
        inline
      });
    } else if (
      s.draft.fields[idx]
    ) {
      s.draft.fields[idx] = {
        name,
        value,
        inline
      };
    }

    await showFields(i, s);

    return true;
  }

  const section = parts[1];

  if (section === 'basic') {
    s.draft.title =
      clean(
        i.fields.getTextInputValue(
          'title'
        )
      );

    s.draft.url =
      clean(
        i.fields.getTextInputValue(
          'url'
        )
      ) || null;

    s.draft.description =
      clean(
        i.fields.getTextInputValue(
          'description'
        )
      );
  }

  if (section === 'style') {
    const c = hexColor(
      i.fields.getTextInputValue(
        'color'
      )
    );

    if (c === null) {
      await i.reply({
        content:
          '❌ Invalid HEX color. Example: `7C3AED`.',
        ephemeral: true
      });

      return true;
    }

    s.draft.color = c;
  }

  if (section === 'author') {
    const name = clean(
      i.fields.getTextInputValue(
        'name'
      )
    );

    const url = clean(
      i.fields.getTextInputValue(
        'url'
      )
    );

    const icon = clean(
      i.fields.getTextInputValue(
        'icon'
      )
    );

    if (
      !validUrl(url) ||
      !validUrl(icon)
    ) {
      await i.reply({
        content:
          '❌ Author URLs must start with http:// or https://.',
        ephemeral: true
      });

      return true;
    }

    s.draft.author = name
      ? {
          name,
          url: url || null,
          icon_url:
            icon || null
        }
      : null;
  }

  if (section === 'media') {
    const banner = clean(
      i.fields.getTextInputValue(
        'banner'
      )
    );

    const image = clean(
      i.fields.getTextInputValue(
        'image'
      )
    );

    const thumbnail = clean(
      i.fields.getTextInputValue(
        'thumbnail'
      )
    );

    if (
      !validUrl(image) ||
      !validUrl(thumbnail)
    ) {
      await i.reply({
        content:
          '❌ Image URLs must start with http:// or https://.',
        ephemeral: true
      });

      return true;
    }

    const header = clean(
      i.fields.getTextInputValue(
        'header'
      )
    );

    if (
      !validUrl(banner) ||
      !validUrl(header)
    ) {
      await i.reply({
        content:
          '❌ Image URLs must start with http:// or https://.',
        ephemeral: true
      });

      return true;
    }

    s.meta.bannerUrl =
      banner || null;

    s.meta.headerImageUrl =
      header || null;

    if (banner) {
      s.meta.bannerFile = null;
    }

    s.draft.image =
      image
        ? { url: image }
        : null;

    s.draft.thumbnail =
      thumbnail
        ? { url: thumbnail }
        : null;
  }

  if (section === 'footer') {
    const text = clean(
      i.fields.getTextInputValue(
        'text'
      )
    );

    const icon = clean(
      i.fields.getTextInputValue(
        'icon'
      )
    );

    if (!validUrl(icon)) {
      await i.reply({
        content:
          '❌ Footer icon URL must start with http:// or https://.',
        ephemeral: true
      });

      return true;
    }

    s.draft.footer = text
      ? {
          text,
          icon_url:
            icon || null
        }
      : null;
  }

  if (section === 'time') {
    const value = clean(
      i.fields.getTextInputValue(
        'timestamp'
      )
    );

    if (
      !value ||
      /^clear$/i.test(value)
    ) {
      s.draft.timestamp =
        null;
    } else {
      const date =
        new Date(value);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        await i.reply({
          content:
            '❌ Invalid timestamp. Use ISO format, e.g. `2026-09-14T18:30:00+05:30`.',
          ephemeral: true
        });

        return true;
      }

      s.draft.timestamp =
        date.toISOString();
    }
  }

  if (section === 'identity') {
    const name = clean(
      i.fields.getTextInputValue(
        'name'
      )
    );

    const leaders =
      allies.extractUserIds(
        i.fields.getTextInputValue(
          'leaders'
        )
      );

    const invite = clean(
      i.fields.getTextInputValue(
        'invite'
      )
    );

    if (!name) {
      await i.reply({
        content:
          '❌ Clan name cannot be empty.',
        ephemeral: true
      });

      return true;
    }

    if (!leaders.length) {
      await i.reply({
        content:
          '❌ Add at least one leader ID or @mention.',
        ephemeral: true
      });

      return true;
    }

    s.meta.name = name;
    s.meta.leaderIds =
      leaders;
    s.meta.invite =
      invite || null;

    const leaderField =
      s.draft.fields.find(
        f => /leader/i.test(
          f.name
        )
      );

    if (leaderField) {
      leaderField.value =
        leaders
          .map(
            id => `<@${id}>`
          )
          .join(' • ');
    }

    const inviteField =
      s.draft.fields.find(
        f =>
          /discord server|invite/i.test(
            f.name
          )
      );

    if (inviteField) {
      inviteField.value =
        invite
          ? `**[ JOIN ${name.toUpperCase()} ](${invite})**`
          : 'Invite not provided.';
    }
  }

  await render(i, s);

  return true;
}

module.exports = {
  handleCommand,
  handleButton,
  handleSelect,
  handleModal,
  handleOtherButton
};
     
