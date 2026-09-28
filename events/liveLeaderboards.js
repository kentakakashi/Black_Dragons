const { Events } = require("discord.js");

module.exports = function registerLiveLeaderboards(client) {
  const leaderboards = require("../systems/leaderboards");

  function configuredRoleIds() {
    const ids = Object.values(
      client.appData?.config?.leaderboards?.rankingRoleIds || {}
    )
      .filter(Boolean)
      .map(String);

    return new Set(ids);
  }

  function memberTouchesRankingRole(member, roleIds) {
    if (!member?.roles?.cache) return false;
    return [...member.roles.cache.keys()].some(id => roleIds.has(String(id)));
  }

  async function refresh(guild) {
    try {
      if (!client.appData?.config?.leaderboards?.rankingChannelId) return;
      await leaderboards.refreshAll(client, client.appData);
    } catch (error) {
      console.error("❌ Live leaderboard refresh failed:", error);
    }
  }

  // Fires when a member gains/removes a role.
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (!newMember?.guild) return;

    const roleIds = configuredRoleIds();
    if (!roleIds.size) return;

    const changed = [...roleIds].some(roleId =>
      oldMember.roles.cache.has(roleId) !== newMember.roles.cache.has(roleId)
    );

    if (changed) {
      await refresh(newMember.guild);
    }
  });

  // Fires when someone leaves/is kicked. Their old role collection tells us
  // whether they held one of the configured Monarch roles.
  client.on(Events.GuildMemberRemove, async member => {
    if (!member?.guild) return;

    const roleIds = configuredRoleIds();
    if (!roleIds.size) return;

    if (memberTouchesRankingRole(member, roleIds)) {
      await refresh(member.guild);
    }
  });

  // Keep the displayed role name current if an admin renames a Monarch role.
  client.on(Events.RoleUpdate, async (oldRole, newRole) => {
    if (!newRole?.guild) return;

    const roleIds = configuredRoleIds();
    if (roleIds.has(String(newRole.id)) && oldRole.name !== newRole.name) {
      await refresh(newRole.guild);
    }
  });

  console.log("🏆 Live leaderboard role watcher active.");
};
