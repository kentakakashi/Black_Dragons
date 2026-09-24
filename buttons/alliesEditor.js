const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits
} = require("discord.js");

const allies = require("../systems/allies");
const sessions = new Map();
const TTL = 30 * 60 * 1000;

const token = () => Math.random().toString(36).slice(2, 10);
const clean = v => String(v ?? "").trim();
const clone = v => JSON.parse(JSON.stringify(v));
const isAdmin = i => i.memberPermissions?.has(PermissionFlagsBits.Administrator);
const validUrl = v => !v || /^https?:\/\/\S+$/i.test(String(v).trim());
const row = x => new ActionRowBuilder().addComponents(x);

function parseIds(v) {
  const out = [];
  for (const m of clean(v).matchAll(/(?:<@!?(\d{17,20})>|(\d{17,20}))/g)) {
    const id = m[1] || m[2];
    if (id && !out.includes(id)) out.push(id);
  }
  return out.slice(0, 10);
}

function hex(v) {
  const x = clean(v).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(x) ? parseInt(x, 16) : null;
}

function saveSession(s) {
  s.expiresAt = Date.now() + TTL;
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => sessions.delete(s.id), TTL);
  if (s.timer.unref) s.timer.unref();
  sessions.set(s.id, s);
}

function getSession(i) {
  const p = i.customId.split(":");
  return sessions.get(p[p.length - 1]);
}

function input(id, label, value, style, required, max) {
  return new TextInputBuilder()
    .setCustomId(id).setLabel(label)
    .setStyle(style || TextInputStyle.Short)
    .setRequired(Boolean(required)).setMaxLength(max || 4000)
    .setValue(String(value || "").slice(0, max || 4000));
}

function makeModal(id, title) {
  return new ModalBuilder().setCustomId(id).setTitle(title);
}

function sectionMenu(s) {
  return new StringSelectMenuBuilder()
    .setCustomId("aef:section:" + s.id)
    .setPlaceholder("Choose what you want to edit...")
    .addOptions(
      { label: "Clan Information", description: "Name, leaders, invite", value: "identity", emoji: "🏷️" },
      { label: "Basic Embed", description: "Title, URL, description", value: "basic", emoji: "📝" },
      { label: "Appearance", description: "Embed color", value: "style", emoji: "🎨" },
      { label: "Images", description: "Banner, header, image, thumbnail", value: "media", emoji: "🖼️" },
      { label: "Author", description: "Author name, URL, icon", value: "author", emoji: "👤" },
      { label: "Footer", description: "Footer text and icon", value: "footer", emoji: "📌" },
      { label: "Fields", description: "Manage up to 25 fields", value: "fields", emoji: "🧱" },
      { label: "Timestamp", description: "Set or clear timestamp", value: "time", emoji: "⏱️" }
    );
}

function editorEmbed(s) {
  const d = s.draft, m = s.meta;
  const c = Number.isInteger(d.color) ? d.color : 0x7c3aed;
  return new EmbedBuilder()
    .setColor(c)
    .setTitle("🛠️ ALLIES EDITOR")
    .setDescription(
      (s.mode === "add" ? "**ADDING NEW ALLY**" : "**EDITING ALLY**") + "\n\n" +
      "🏷️ **Clan:** " + (m.name || "Not set") + "\n" +
      "👑 **Leaders:** " + (m.leaderIds?.length || 0) + "\n" +
      "🔗 **Invite:** " + (m.invite ? "Set" : "Not set") + "\n" +
      "🧱 **Fields:** " + (d.fields?.length || 0) + "/25\n" +
      "🎨 **Color:** #" + c.toString(16).padStart(6, "0").toUpperCase() + "\n" +
      "🖼️ **Embed image:** " + (d.image?.url ? "Set" : "Not set") + "\n" +
      "🔳 **Thumbnail:** " + (d.thumbnail?.url ? "Set" : "Not set") + "\n" +
      "🌐 **Global header image:** " + (m.headerImageUrl ? "Set" : "Not set") + "\n\n" +
      "**Choose a section below. Nothing is saved until SAVE is pressed.**"
    )
    .addFields(
      { name: "TITLE", value: d.title || "—", inline: true },
      { name: "AUTHOR", value: d.author?.name || "—", inline: true },
      { name: "FOOTER", value: d.footer?.text || "—", inline: true }
    )
    .setFooter({ text: "Admin-only • 30-minute editing session" });
}

function controls(s) {
  return [
    row(sectionMenu(s)),
    row(
      new ButtonBuilder().setCustomId("ae:save:" + s.id).setLabel("SAVE").setEmoji("💾").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("ae:cancel:" + s.id).setLabel("CANCEL").setEmoji("✖️").setStyle(ButtonStyle.Danger)
    )
  ];
}

async function render(i, s) {
  saveSession(s);
  await i.update({ embeds: [editorEmbed(s)], components: controls(s), allowedMentions: { parse: [] } });
}

async function showSection(i, s, type) {
  const d = s.draft, m = s.meta;
  let x;
  if (type === "identity") {
    x = makeModal("aem:identity:" + s.id, "🏷️ Clan Information");
    x.addComponents(
      row(input("name", "Clan / server name", m.name, TextInputStyle.Short, true, 100)),
      row(input("leaders", "Leader IDs or @mentions", (m.leaderIds || []).map(id => "<@" + id + ">").join(" "), TextInputStyle.Short, true, 1000)),
      row(input("invite", "Discord invite / code", m.invite || "", TextInputStyle.Short, false, 1000))
    );
  } else if (type === "basic") {
    x = makeModal("aem:basic:" + s.id, "📝 Basic Embed");
    x.addComponents(
      row(input("title", "Title", d.title, TextInputStyle.Short, false, 256)),
      row(input("url", "Title URL", d.url, TextInputStyle.Short, false, 1000)),
      row(input("description", "Description", d.description, TextInputStyle.Paragraph, false, 4096))
    );
  } else if (type === "style") {
    x = makeModal("aem:style:" + s.id, "🎨 Embed Color");
    x.addComponents(row(input("color", "HEX color, example 7C3AED", "#" + Number(d.color || 0x7c3aed).toString(16).padStart(6, "0"), TextInputStyle.Short, true, 7)));
  } else if (type === "media") {
    x = makeModal("aem:media:" + s.id, "🖼️ Images & Header");
    x.addComponents(
      row(input("banner", "Clan banner URL / CLEAR", m.bannerUrl || "", TextInputStyle.Short, false, 1000)),
      row(input("header", "Global header URL / CLEAR", m.headerImageUrl || "", TextInputStyle.Short, false, 1000)),
      row(input("image", "Embed image URL / CLEAR", d.image?.url || "", TextInputStyle.Short, false, 1000)),
      row(input("thumbnail", "Thumbnail URL / CLEAR", d.thumbnail?.url || "", TextInputStyle.Short, false, 1000))
    );
  } else if (type === "author") {
    const a = d.author || {};
    x = makeModal("aem:author:" + s.id, "👤 Embed Author");
    x.addComponents(
      row(input("name", "Author name", a.name || "", TextInputStyle.Short, false, 256)),
      row(input("url", "Author URL", a.url || "", TextInputStyle.Short, false, 1000)),
      row(input("icon", "Author icon URL", a.icon_url || "", TextInputStyle.Short, false, 1000))
    );
  } else if (type === "footer") {
    const f = d.footer || {};
    x = makeModal("aem:footer:" + s.id, "📌 Embed Footer");
    x.addComponents(
      row(input("text", "Footer text", f.text || "", TextInputStyle.Short, false, 2048)),
      row(input("icon", "Footer icon URL", f.icon_url || "", TextInputStyle.Short, false, 1000))
    );
  } else if (type === "time") {
    x = makeModal("aem:time:" + s.id, "⏱️ Embed Timestamp");
    x.addComponents(row(input("timestamp", "ISO timestamp or CLEAR", d.timestamp || "", TextInputStyle.Short, false, 64)));
  }
  if (x) await i.showModal(x);
}

function fieldSelect(s) {
  const fs = (s.draft.fields || []).slice(0, 25);
  const opts = fs.map((f, n) => ({
    label: (n + 1) + ". " + String(f.name || "Unnamed").slice(0, 92),
    value: String(n),
    description: String(f.value || "").slice(0, 90)
  }));
  if (!opts.length) opts.push({ label: "No fields yet", value: "none" });
  const x = new StringSelectMenuBuilder().setCustomId("aef:fieldpick:" + s.id).setPlaceholder(opts[0].value === "none" ? "No fields yet" : "Select a field");
  if (opts[0].value === "none") x.setDisabled(true);
  return x.addOptions(opts);
}

function fieldComponents(s) {
  return [
    row(fieldSelect(s)),
    row(
      new ButtonBuilder().setCustomId("ae:addfield:" + s.id).setLabel("ADD FIELD").setEmoji("➕").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("ae:editfield:" + s.id).setLabel("EDIT").setEmoji("✏️").setStyle(ButtonStyle.Primary).setDisabled(s.selectedField === null),
      new ButtonBuilder().setCustomId("ae:removefield:" + s.id).setLabel("DELETE").setEmoji("🗑️").setStyle(ButtonStyle.Danger).setDisabled(s.selectedField === null),
      new ButtonBuilder().setCustomId("ae:clearfields:" + s.id).setLabel("CLEAR").setEmoji("🧹").setStyle(ButtonStyle.Secondary).setDisabled(!s.draft.fields?.length),
      new ButtonBuilder().setCustomId("ae:back:" + s.id).setLabel("BACK").setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function showFields(i, s) {
  const e = new EmbedBuilder()
    .setColor(Number.isInteger(s.draft.color) ? s.draft.color : 0x7c3aed)
    .setTitle("🧱 FIELD MANAGER")
    .setDescription("Manage up to **25 fields**. Selected: **" + (s.selectedField === null ? "None" : "#" + (s.selectedField + 1)) + "**");
  (s.draft.fields || []).slice(0, 25).forEach((f, n) => e.addFields({
    name: (n + 1) + ". " + (f.name || "Unnamed field"),
    value: String(f.value || "—").slice(0, 1024),
    inline: Boolean(f.inline)
  }));
  saveSession(s);
  await i.update({ embeds: [e], components: fieldComponents(s), allowedMentions: { parse: [] } });
}

async function fieldModal(i, s, index) {
  const f = index === null ? { name: "", value: "", inline: false } : (s.draft.fields[index] || { name: "", value: "", inline: false });
  const x = makeModal("aem:field:" + s.id + ":" + (index === null ? "new" : index), index === null ? "➕ Add Embed Field" : "✏️ Edit Embed Field");
  x.addComponents(
    row(input("name", "Field name", f.name, TextInputStyle.Short, true, 256)),
    row(input("value", "Field value", f.value, TextInputStyle.Paragraph, true, 1024)),
    row(input("inline", "Inline? YES or NO", f.inline ? "YES" : "NO", TextInputStyle.Short, true, 3))
  );
  await i.showModal(x);
}

function validate(s) {
  const d = s.draft, m = s.meta;
  if (!clean(m.name)) return "Clan name cannot be empty.";
  if (!m.leaderIds?.length) return "At least one leader is required.";
  if (d.title.length > 256) return "Title is over 256 characters.";
  if (d.description.length > 4096) return "Description is over 4096 characters.";
  if ((d.fields || []).length > 25) return "Discord allows a maximum of 25 fields.";
  const urls = [
    ["Title URL", d.url], ["Author URL", d.author?.url], ["Author icon", d.author?.icon_url],
    ["Footer icon", d.footer?.icon_url], ["Embed image", d.image?.url], ["Thumbnail", d.thumbnail?.url],
    ["Banner", m.bannerUrl], ["Header image", m.headerImageUrl]
  ];
  for (const pair of urls) if (pair[1] && !validUrl(pair[1])) return pair[0] + " must start with http:// or https://.";
  return null;
}

async function openAdd(i) {
  await allies.initialize();
  const state = allies.getState();
  const s = {
    id: token(), ownerId: i.user.id, mode: "add",
    meta: { name: "", leaderIds: [], invite: null, bannerUrl: null, bannerFile: null, headerImageUrl: state.headerImageUrl || null },
    draft: allies.normalizeEmbed(null, { name: "NEW ALLY", leaderIds: [], invite: null }, state.clans.length),
    selectedField: null
  };
  saveSession(s);
  await i.reply({ embeds: [editorEmbed(s)], components: controls(s), ephemeral: true, allowedMentions: { parse: [] } });
}

async function openPicker(i, mode) {
  await allies.initialize();
  const clans = allies.getState().clans;
  if (!clans.length) {
    await i.reply({ content: "❌ There are no allied clans yet.", ephemeral: true });
    return;
  }
  const x = new StringSelectMenuBuilder()
    .setCustomId("aeclan:" + mode + ":" + token())
    .setPlaceholder(mode === "update" ? "Choose a clan to edit" : "Choose a clan to remove")
    .addOptions(clans.slice(0, 25).map(c => ({
      label: c.name.slice(0, 100), value: c.id, description: (c.leaderIds?.length || 0) + " leader(s)"
    })));
  await i.reply({
    embeds: [new EmbedBuilder().setColor(0x7c3aed).setTitle(mode === "update" ? "🛠️ EDIT ALLIED CLAN" : "🗑️ REMOVE ALLIED CLAN").setDescription("Choose a clan below.")],
    components: [row(x)], ephemeral: true
  });
}

async function handleCommand(i, subcommand) {
  if (!isAdmin(i)) {
    await i.reply({ content: "❌ Only administrators can use the Allies editor.", ephemeral: true });
    return true;
  }
  if (subcommand === "add") { await openAdd(i); return true; }
  if (subcommand === "update") { await openPicker(i, "update"); return true; }
  if (subcommand === "remove") { await openPicker(i, "remove"); return true; }
  return false;
}

async function handleButton(i) {
  if (!i.customId.startsWith("ae:")) return false;
  const s = getSession(i);
  if (!s || s.ownerId !== i.user.id) {
    await i.reply({ content: "❌ This editor expired. Run the Allies command again.", ephemeral: true });
    return true;
  }
  saveSession(s);
  const action = i.customId.split(":")[1];

  if (action === "save") {
    const error = validate(s);
    if (error) {
      await i.reply({ content: "❌ " + error, ephemeral: true });
      return true;
    }
    await i.deferUpdate();
    try {
      const payload = {
        name: s.meta.name, leaders: s.meta.leaderIds.join(" "), invite: s.meta.invite,
        bannerUrl: s.meta.bannerUrl, bannerFile: s.meta.bannerFile,
        headerImageUrl: s.meta.headerImageUrl, embed: s.draft
      };
      const result = s.mode === "add"
        ? await allies.addClan(i.client, payload)
        : await allies.updateClan(i.client, s.meta.id, payload);
      if (!result.ok) throw new Error(result.reason || "Save failed");
      sessions.delete(s.id);
      await i.editReply({
        embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle("✅ ALLIES SAVED").setDescription(
          "**" + result.clan.name + "** was " + (s.mode === "add" ? "added" : "updated") + ".\n\nThe permanent Allies message was refreshed."
        )],
        components: []
      });
    } catch (e) {
      console.error("❌ Allies editor save failed:", e);
      await i.editReply({
        embeds: [new EmbedBuilder().setColor(0xef4444).setTitle("❌ SAVE FAILED").setDescription(
          "The save was not confirmed. Check the console before trying again.\n\n" + String(e.message || e)
        )],
        components: []
      });
    }
    return true;
  }

  if (action === "cancel") {
    sessions.delete(s.id);
    await i.update({ embeds: [new EmbedBuilder().setColor(0xef4444).setTitle("✖️ EDITOR CANCELLED").setDescription("No changes were saved.")], components: [] });
    return true;
  }

  if (action === "back") {
    await render(i, s);
    return true;
  }

  if (action === "addfield") {
    if (s.draft.fields.length >= 25) {
      await i.reply({ content: "❌ You already have 25 fields.", ephemeral: true });
      return true;
    }
    await fieldModal(i, s, null);
    return true;
  }

  if (action === "editfield") {
    if (s.selectedField === null) {
      await i.reply({ content: "❌ Select a field first.", ephemeral: true });
      return true;
    }
    await fieldModal(i, s, s.selectedField);
    return true;
  }

  if (action === "removefield") {
    if (s.selectedField === null) {
      await i.reply({ content: "❌ Select a field first.", ephemeral: true });
      return true;
    }
    s.draft.fields.splice(s.selectedField, 1);
    s.selectedField = null;
    await showFields(i, s);
    return true;
  }

  if (action === "clearfields") {
    s.draft.fields = [];
    s.selectedField = null;
    await showFields(i, s);
    return true;
  }

  return true;
}

async function handleSelect(i) {
  if (i.customId.startsWith("aeclan:")) {
    if (!isAdmin(i)) {
      await i.reply({ content: "❌ Administrator only.", ephemeral: true });
      return true;
    }
    const p = i.customId.split(":");
    const mode = p[1], clan = allies.findClan(i.values[0]);
    if (!clan) {
      await i.update({ content: "❌ Clan not found.", embeds: [], components: [] });
      return true;
    }
    if (mode === "remove") {
      await i.update({
        embeds: [new EmbedBuilder().setColor(0xef4444).setTitle("⚠️ CONFIRM REMOVAL").setDescription("Remove **" + clan.name + "**? This updates the permanent Allies message.")],
        components: [row(
          new ButtonBuilder().setCustomId("aeremove:" + clan.id).setLabel("REMOVE").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("aecancelremove:" + clan.id).setLabel("CANCEL").setStyle(ButtonStyle.Secondary)
        )]
      });
      return true;
    }
    const state = allies.getState();
    const s = {
      id: token(), ownerId: i.user.id, mode: "update",
      meta: {
        id: clan.id, name: clan.name, leaderIds: clan.leaderIds || [], invite: clan.invite || null,
        bannerUrl: clan.bannerUrl || null, bannerFile: clan.bannerFile || null,
        headerImageUrl: state.headerImageUrl || null
      },
      draft: clone(clan.embed || allies.normalizeEmbed(null, clan, state.clans.indexOf(clan))),
      selectedField: null
    };
    saveSession(s);
    await i.update({ embeds: [editorEmbed(s)], components: controls(s), allowedMentions: { parse: [] } });
    return true;
  }

  if (!i.customId.startsWith("aef:")) return false;
  const s = getSession(i);
  if (!s || s.ownerId !== i.user.id) {
    await i.reply({ content: "❌ This editor expired. Run the Allies command again.", ephemeral: true });
    return true;
  }
  saveSession(s);
  const action = i.customId.split(":")[1];

  if (action === "section") {
    const type = i.values[0];
    if (type === "fields") { await showFields(i, s); return true; }
    await showSection(i, s, type);
    return true;
  }

  if (action === "fieldpick") {
    s.selectedField = i.values[0] === "none" ? null : Number(i.values[0]);
    await showFields(i, s);
    return true;
  }
  return false;
}

async function handleOtherButton(i) {
  if (i.customId.startsWith("aeremove:")) {
    if (!isAdmin(i)) {
      await i.reply({ content: "❌ Administrator only.", ephemeral: true });
      return true;
    }
    const id = i.customId.split(":")[1], clan = allies.findClan(id);
    if (!clan) {
      await i.update({ content: "❌ Clan no longer exists.", embeds: [], components: [] });
      return true;
    }
    await i.deferUpdate();
    try {
      const r = await allies.removeClan(i.client, id);
      if (!r.ok) throw new Error(r.reason || "Remove failed");
      await i.editReply({ embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle("✅ CLAN REMOVED").setDescription("**" + clan.name + "** was removed.")], components: [] });
    } catch (e) {
      console.error("❌ Allies remove failed:", e);
      await i.editReply({ embeds: [new EmbedBuilder().setColor(0xef4444).setTitle("❌ REMOVE FAILED").setDescription(String(e.message || e))], components: [] });
    }
    return true;
  }
  if (i.customId.startsWith("aecancelremove:")) {
    await i.update({ embeds: [new EmbedBuilder().setColor(0x7c3aed).setTitle("↩️ REMOVAL CANCELLED").setDescription("No changes were made.")], components: [] });
    return true;
  }
  return false;
}

async function handleModal(i) {
  if (!i.customId.startsWith("aem:")) return false;
  const p = i.customId.split(":"), s = sessions.get(p[2]);
  if (!s || s.ownerId !== i.user.id) {
    await i.reply({ content: "❌ This editor expired. Run the Allies command again.", ephemeral: true });
    return true;
  }
  saveSession(s);
  const type = p[1];

  if (type === "field") {
    const index = p[3] === "new" ? null : Number(p[3]);
    const name = clean(i.fields.getTextInputValue("name"));
    const value = clean(i.fields.getTextInputValue("value"));
    const inline = /^yes$/i.test(clean(i.fields.getTextInputValue("inline")));
    if (!name || !value) {
      await i.reply({ content: "❌ Field name and value are required.", ephemeral: true });
      return true;
    }
    if (index === null) {
      if (s.draft.fields.length >= 25) {
        await i.reply({ content: "❌ Discord allows a maximum of 25 fields.", ephemeral: true });
        return true;
      }
      s.draft.fields.push({ name, value, inline });
    } else if (s.draft.fields[index]) {
      s.draft.fields[index] = { name, value, inline };
    }
    await showFields(i, s);
    return true;
  }

  if (type === "identity") {
    const name = clean(i.fields.getTextInputValue("name"));
    const leaders = parseIds(i.fields.getTextInputValue("leaders"));
    const invite = clean(i.fields.getTextInputValue("invite"));
    if (!name || !leaders.length) {
      await i.reply({ content: "❌ Clan name and at least one leader are required.", ephemeral: true });
      return true;
    }
    s.meta.name = name;
    s.meta.leaderIds = leaders;
    s.meta.invite = invite || null;
    const lf = s.draft.fields.find(f => /leader/i.test(f.name || ""));
    if (lf) lf.value = leaders.map(id => "<@" + id + ">").join(" • ");
    const inf = s.draft.fields.find(f => /discord server|invite/i.test(f.name || ""));
    if (inf) inf.value = invite ? "**[ JOIN " + name.toUpperCase() + " ](" + invite + ")**" : "Invite not provided.";
  }

  if (type === "basic") {
    s.draft.title = clean(i.fields.getTextInputValue("title"));
    s.draft.url = clean(i.fields.getTextInputValue("url")) || null;
    s.draft.description = clean(i.fields.getTextInputValue("description"));
  }

  if (type === "style") {
    const c = hex(i.fields.getTextInputValue("color"));
    if (c === null) {
      await i.reply({ content: "❌ Invalid HEX color. Example: 7C3AED.", ephemeral: true });
      return true;
    }
    s.draft.color = c;
  }

  if (type === "media") {
    const vals = {
      banner: clean(i.fields.getTextInputValue("banner")),
      header: clean(i.fields.getTextInputValue("header")),
      image: clean(i.fields.getTextInputValue("image")),
      thumbnail: clean(i.fields.getTextInputValue("thumbnail"))
    };
    for (const k of Object.keys(vals)) {
      const v = vals[k];
      if (v && !/^clear$/i.test(v) && !validUrl(v)) {
        await i.reply({ content: "❌ " + k + " must be a full http:// or https:// URL, or CLEAR.", ephemeral: true });
        return true;
      }
    }
    if (vals.banner) {
      s.meta.bannerUrl = /^clear$/i.test(vals.banner) ? null : vals.banner;
      s.meta.bannerFile = null;
    }
    if (vals.header) s.meta.headerImageUrl = /^clear$/i.test(vals.header) ? null : vals.header;
    if (vals.image) s.draft.image = /^clear$/i.test(vals.image) ? null : { url: vals.image };
    if (vals.thumbnail) s.draft.thumbnail = /^clear$/i.test(vals.thumbnail) ? null : { url: vals.thumbnail };
  }

  if (type === "author") {
    const name = clean(i.fields.getTextInputValue("name"));
    const url = clean(i.fields.getTextInputValue("url"));
    const icon = clean(i.fields.getTextInputValue("icon"));
    if (!validUrl(url) || !validUrl(icon)) {
      await i.reply({ content: "❌ Author URLs must be full http:// or https:// URLs.", ephemeral: true });
      return true;
    }
    s.draft.author = name ? { name, url: url || null, icon_url: icon || null } : null;
  }

  if (type === "footer") {
    const text = clean(i.fields.getTextInputValue("text"));
    const icon = clean(i.fields.getTextInputValue("icon"));
    if (!validUrl(icon)) {
      await i.reply({ content: "❌ Footer icon must be a full http:// or https:// URL.", ephemeral: true });
      return true;
    }
    s.draft.footer = text ? { text, icon_url: icon || null } : null;
  }

  if (type === "time") {
    const value = clean(i.fields.getTextInputValue("timestamp"));
    if (!value || /^clear$/i.test(value)) s.draft.timestamp = null;
    else {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        await i.reply({ content: "❌ Invalid timestamp. Use ISO format or CLEAR.", ephemeral: true });
        return true;
      }
      s.draft.timestamp = date.toISOString();
    }
  }

  await render(i, s);
  return true;
}

module.exports = { handleCommand, handleButton, handleSelect, handleModal, handleOtherButton };
