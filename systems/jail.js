const { saveData } = require("../utils/database");

const CHECK_INTERVAL = 30 * 1000;

function getJailRole(data, guild) {
  const roleId = data.config?.jail?.roleId;
  if (!roleId) return null;
  return guild.roles.cache.get(String(roleId)) || null;
}

function jailKey(guildId, userId) {
  return String(guildId) + ":" + String(userId);
}

function formatDuration(hours) {
  return hours === 1 ? "1 hour" : String(hours) + " hours";
}

async function getBotMember(guild) {
  if (guild.members.me) return guild.members.me;
  return guild.members.fetchMe();
}

function canManageRole(role, botMember) {
  return role && !role.managed && role.editable && role.position < botMember.roles.highest.position;
}

async function jailMember(interaction, context) {
  const data = context.data;
  const guild = interaction.guild;

  if (!guild) return interaction.reply({ content: "❌ /jail can only be used inside a server.", ephemeral: true });

  const target = interaction.options.getMember("user");
  const hours = interaction.options.getInteger("hours");
  const permanent = interaction.options.getBoolean("permanent") === true;
  const reason = interaction.options.getString("reason")?.trim() || null;

  if (!target) return interaction.reply({ content: "❌ I could not find that member in this server.", ephemeral: true });
  if (!hours && !permanent) return interaction.reply({ content: "❌ Choose either an hours duration or set permanent to true.", ephemeral: true });
  if (hours && permanent) return interaction.reply({ content: "❌ You cannot use hours and permanent at the same time.", ephemeral: true });

  const jailRole = getJailRole(data, guild);
  if (!jailRole) return interaction.reply({ content: "❌ The Jail Role is not configured. An administrator needs to set it in /setup first.", ephemeral: true });

  const botMember = await getBotMember(guild);
  if (!botMember.permissions.has("ManageRoles")) return interaction.reply({ content: "❌ I need the Manage Roles permission to jail members.", ephemeral: true });
  if (!canManageRole(jailRole, botMember)) return interaction.reply({ content: "❌ I cannot manage the configured Jail Role. Move it below my highest role.", ephemeral: true });
  if (target.id === guild.ownerId) return interaction.reply({ content: "❌ I cannot jail the server owner.", ephemeral: true });
  if (!target.manageable) return interaction.reply({ content: "❌ I cannot manage that member. Their highest role is at or above mine.", ephemeral: true });

  const key = jailKey(guild.id, target.id);
  data.jails ||= {};
  if (data.jails[key]) return interaction.reply({ content: "❌ That member is already jailed.", ephemeral: true });

  const originalRoles = [...target.roles.cache.values()]
    .filter(role => role.id !== guild.id && role.id !== jailRole.id && !role.managed)
    .map(role => role.id);

  const unmanageable = originalRoles
    .map(id => guild.roles.cache.get(id))
    .filter(role => role && !canManageRole(role, botMember));

  if (unmanageable.length) {
    return interaction.reply({
      content: "❌ I cannot safely jail this member because I cannot remove these role(s): " + unmanageable.map(role => role.toString()).join(", ") + ". Move those roles below my highest role first.",
      ephemeral: true,
      allowedMentions: { roles: [] }
    });
  }

  const expiresAt = hours ? Date.now() + (hours * 60 * 60 * 1000) : null;

  try {
    data.jails[key] = {
      guildId: guild.id,
      userId: target.id,
      roleIds: originalRoles,
      jailRoleId: jailRole.id,
      hours: hours || null,
      permanent,
      reason,
      jailedBy: interaction.user.id,
      jailedAt: Date.now(),
      expiresAt
    };

    await saveData(data);
    await target.roles.remove(originalRoles, reason || "BLACK DRAGONS jail");
    await target.roles.add(jailRole, reason || "BLACK DRAGONS jail");

    const durationText = permanent ? "**Permanent**" : "**" + formatDuration(hours) + "**";
    await interaction.reply({
      content: "⛓️ **" + target + " has been thrown into jail.**\n**Duration:** " + durationText + (reason ? "\n**Reason:** " + reason : ""),
      allowedMentions: { users: [target.id] }
    });
    return true;
  } catch (error) {
    console.error("❌ Jail failed:", error);
    try {
      if (target.roles.cache.has(jailRole.id)) {
        await target.roles.remove(jailRole, "BLACK DRAGONS jail rollback");
      }
      if (originalRoles.length) {
        await target.roles.add(originalRoles, "BLACK DRAGONS jail rollback");
      }
    } catch (rollbackError) {
      console.error("❌ Jail rollback also failed:", rollbackError);
    }
    delete data.jails[key];
    await saveData(data).catch(() => {});
    return interaction.reply({ content: "❌ I could not jail that member. I rolled back the role changes.", ephemeral: true });
  }
}

async function restoreJail(guild, record, data) {
  const key = jailKey(record.guildId, record.userId);
  try {
    const member = await guild.members.fetch(record.userId);
    const jailRole = guild.roles.cache.get(String(record.jailRoleId));
    const botMember = await getBotMember(guild);

    if (jailRole && member.roles.cache.has(jailRole.id) && canManageRole(jailRole, botMember)) {
      await member.roles.remove(jailRole, "BLACK DRAGONS jail expired");
    }

    const restoreIds = (record.roleIds || []).map(String).filter(id => {
      const role = guild.roles.cache.get(id);
      return role && canManageRole(role, botMember);
    });

    if (restoreIds.length) await member.roles.add(restoreIds, "BLACK DRAGONS jail expired");

    delete data.jails[key];
    await saveData(data);
    console.log("⛓️ Restored " + member.user.tag + " after jail expired.");
    return true;
  } catch (error) {
    console.error("❌ Could not restore jailed member " + record.userId + ":", error);
    return false;
  }
}

async function checkExpiredJails(client, data) {
  data.jails ||= {};
  const now = Date.now();
  for (const record of Object.values(data.jails)) {
    if (!record || record.permanent || !record.expiresAt || record.expiresAt > now) continue;
    const guild = client.guilds.cache.get(String(record.guildId));
    if (!guild) continue;
    await restoreJail(guild, record, data);
  }
}

function startJailWatcher(client, data) {
  checkExpiredJails(client, data).catch(error => console.error("❌ Initial jail expiration check failed:", error));
  const timer = setInterval(() => {
    checkExpiredJails(client, data).catch(error => console.error("❌ Jail expiration check failed:", error));
  }, CHECK_INTERVAL);
  if (timer.unref) timer.unref();
  console.log("⛓️ Jail expiration watcher is active.");
}

async function unjailMember(interaction, context) {
  const data = context.data;
  const guild = interaction.guild;
  const target = interaction.options.getMember("user");

  if (!guild || !target) {
    return interaction.reply({
      content: "❌ I could not find that member in this server.",
      ephemeral: true
    });
  }

  data.jails ||= {};
  const key = jailKey(guild.id, target.id);
  const record = data.jails[key];

  if (!record) {
    return interaction.reply({
      content: "❌ That member is not currently jailed.",
      ephemeral: true
    });
  }

  const restored = await restoreJail(guild, record, data);
  if (!restored) {
    return interaction.reply({
      content: "❌ I could not fully restore that member's roles yet. The jail record was kept so I can retry it.",
      ephemeral: true
    });
  }

  return interaction.reply({
    content: "🔓 **" + target + " has been released from jail.**",
    allowedMentions: { users: [target.id] }
  });
}

module.exports = {
  jailMember,
  unjailMember,
  startJailWatcher,
  checkExpiredJails,
  restoreJail
};
