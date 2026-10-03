const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { getFirestore } = require("firebase-admin/firestore");
const { saveData } = require("../utils/database");

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true;
}

function normalizeUsername(value) {
  // Roblox usernames are entered as plain text. A leading @ is optional,
  // but never required.
  return String(value || "").trim().replace(/^@+/, "");
}

async function resolveRobloxUser(username) {
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error("Roblox username lookup failed (HTTP " + response.status + "). Please try again.");
  }

  const payload = await response.json();
  const user = Array.isArray(payload.data) ? payload.data[0] : null;

  if (!user?.id || !user?.name) {
    throw new Error("Roblox couldn't find an active account with the username **" + username + "**. Check the spelling and try again.");
  }

  return {
    id: String(user.id),
    username: String(user.name),
    displayName: String(user.displayName || user.name)
  };
}

async function execute(interaction, context) {
  if (!isAdmin(interaction)) {
    await interaction.reply({
      content: "❌ Only **server administrators** can link Roblox accounts.",
      ephemeral: true
    });
    return;
  }

  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: "❌ This command can only be used inside the BLACK DRAGONS Discord server.",
      ephemeral: true
    });
    return;
  }

  const target = interaction.options.getUser("member", true);
  const inputUsername = normalizeUsername(interaction.options.getString("roblox_username", true));

  if (!/^[A-Za-z0-9_]{3,20}$/.test(inputUsername)) {
    await interaction.reply({
      content: "❌ Enter a Roblox **username**, not a display name or profile URL. No @ is needed. Usernames must be 3–20 letters, numbers or underscores.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Confirm the selected Discord account is actually in this server.
    await interaction.guild.members.fetch(target.id);

    const roblox = await resolveRobloxUser(inputUsername);
    const data = context?.data;

    if (!data || !data.rankUsers || typeof data.rankUsers !== "object") {
      throw new Error("The player database is not ready. No link was changed.");
    }

    // Quick local duplicate check, including any legacy numeric IDs.
    for (const [discordId, player] of Object.entries(data.rankUsers)) {
      if (
        String(player?.robloxUserId || "") === roblox.id &&
        discordId !== target.id
      ) {
        throw new Error("That Roblox account is already linked to another Discord user (<@" + discordId + ">). Nothing was changed.");
      }
    }

    // Use a Firestore transaction as the final duplicate check so two
    // administrators cannot link the same Roblox account simultaneously.
    const firestore = getFirestore();
    const players = firestore.collection("players");
    const targetRef = players.doc(target.id);
    const now = Date.now();
    let previousLink = null;
    let updatedPlayer = null;

    await firestore.runTransaction(async transaction => {
      const duplicateQuery = players
        .where("robloxUserId", "==", roblox.id)
        .limit(2);
      const [duplicateSnapshot, targetSnapshot] = await Promise.all([
        transaction.get(duplicateQuery),
        transaction.get(targetRef)
      ]);

      const duplicate = duplicateSnapshot.docs.find(doc => doc.id !== target.id);
      if (duplicate) {
        throw new Error("That Roblox account is already linked to another Discord user (<@" + duplicate.id + ">). Nothing was changed.");
      }

      const old = targetSnapshot.exists ? targetSnapshot.data() || {} : {};
      previousLink = old.robloxUserId
        ? { robloxUserId: String(old.robloxUserId), robloxUsername: String(old.robloxUsername || "") }
        : null;

      const history = Array.isArray(old.robloxLinkHistory)
        ? old.robloxLinkHistory.slice(-24)
        : [];

      history.push({
        robloxUserId: roblox.id,
        robloxUsername: roblox.username,
        linkedBy: interaction.user.id,
        linkedAt: now,
        previousRobloxUserId: previousLink?.robloxUserId || null,
        previousRobloxUsername: previousLink?.robloxUsername || null
      });

      updatedPlayer = {
        ...old,
        discordId: target.id,
        robloxUserId: roblox.id,
        robloxUsername: roblox.username,
        robloxDisplayName: roblox.displayName,
        robloxLinkedAt: now,
        robloxLinkedBy: interaction.user.id,
        robloxLinkHistory: history,
        // A Roblox link must not require a kill/rank application.
        kills: Math.max(0, Number(old.kills) || 0),
        rank: String(old.rank || "E").toUpperCase(),
        updatedAt: now
      };

      transaction.set(targetRef, updatedPlayer, { merge: true });
    });

    // Keep the running bot state in sync with the canonical players document.
    data.rankUsers[target.id] = updatedPlayer;
    // Keep the bot's local backup and normal persistence snapshot in sync too.
    await saveData(data);

    const embed = new EmbedBuilder()
      .setColor(0xC9A15B)
      .setTitle("🐉 ROBLOX ACCOUNT LINKED")
      .setDescription("The Roblox account has been linked to <@" + target.id + ">.")
      .addFields(
        { name: "DISCORD MEMBER", value: "<@" + target.id + ">", inline: true },
        { name: "ROBLOX USERNAME", value: roblox.username, inline: true },
        { name: "ROBLOX USER ID", value: "`" + roblox.id + "`", inline: true },
        { name: "LINKED BY", value: "<@" + interaction.user.id + ">", inline: true },
        { name: "PLAYER RECORD", value: previousLink ? "Existing record updated" : "Created without requiring kill/rank registration", inline: false }
      )
      .setURL("https://www.roblox.com/users/" + encodeURIComponent(roblox.id) + "/profile")
      .setFooter({ text: "BLACK DRAGONS • Roblox identity management" })
      .setTimestamp();

    if (previousLink && previousLink.robloxUserId !== roblox.id) {
      embed.addFields({
        name: "PREVIOUS ROBLOX LINK",
        value: (previousLink.robloxUsername || "Unknown") + " (`" + previousLink.robloxUserId + "`)"
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("❌ Roblox link command failed:", error);
    await interaction.editReply({
      content: "❌ " + (error?.message || "The Roblox account could not be linked. No successful change was confirmed.")
    });
  }
}

module.exports = {
  name: "roblox-link",
  data: new SlashCommandBuilder()
    .setName("roblox-link")
    .setDescription("Link a Roblox username to a Discord member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addUserOption(option =>
      option
        .setName("member")
        .setDescription("Discord member receiving the Roblox link.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("roblox_username")
        .setDescription("Roblox username (plain text; do NOT add @).")
        .setMinLength(3)
        .setMaxLength(20)
        .setRequired(true)
    ),
  execute
};
