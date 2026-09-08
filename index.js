require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
    Client,
    GatewayIntentBits,
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    SlashCommandBuilder,
    PermissionFlagsBits,
    REST,
    Routes
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const WAR_ROLE_ID = process.env.WAR_ROLE_ID;
const BACKUP_ROLE_ID = process.env.BACKUP_ROLE_ID;
const DASHBOARD_CHANNEL_ID = process.env.DASHBOARD_CHANNEL_ID;

const TIMEZONE = "Asia/Kolkata";
const COOLDOWN_TIME = 60 * 1000;
const DATA_FILE = path.join(__dirname, "data.json");

const BANNER_URL =
    "https://cdn.discordapp.com/attachments/1542930463495295077/1546900483422167100/file_00000000cb9c8211a2f59f8b106f4507.png?ex=6aa176d7&is=6aa02557&hm=c6429f873321f8c8e68aa9319142f986d18e5215ca239eddc30105fd5adbe888&";

/* =========================================================
   KILL RANK SYSTEM
========================================================= */

const RANKS = [
    { key: "Z", emoji: "👑", min: 50000 },
    { key: "SSS", emoji: "💠", min: 20000 },
    { key: "SS", emoji: "🔥", min: 15000 },
    { key: "S", emoji: "⚡", min: 10000 },
    { key: "A", emoji: "🏆", min: 7500 },
    { key: "B", emoji: "💫", min: 5000 },
    { key: "C", emoji: "⚔️", min: 2500 },
    { key: "D", emoji: "🗡️", min: 1000 },
    { key: "E", emoji: "🌱", min: 0 }
];

let data = {
    date: "",
    war: 0,
    backup: 0,
    dashboardMessageId: null,

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

const cooldowns = new Map();

let dashboardMessage = null;

/* =========================================================
   DATA
========================================================= */

function getToday() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 4)
        );
    } catch (error) {
        console.error("❌ Could not save data:", error);
    }
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const savedData = JSON.parse(
                fs.readFileSync(DATA_FILE, "utf8")
            );

            data = {
                ...data,
                ...savedData,

                rankConfig: {
                    ...data.rankConfig,
                    ...(savedData.rankConfig || {}),

                    rankRoleIds: {
                        ...data.rankConfig.rankRoleIds,
                        ...((savedData.rankConfig || {}).rankRoleIds || {})
                    }
                },

                rankUsers: savedData.rankUsers || {},
                rankApplications: savedData.rankApplications || []
            };
        }
    } catch (error) {
        console.error("❌ Could not load data:", error);
    }

    checkDailyReset();
}

function checkDailyReset() {
    const today = getToday();

    if (data.date !== today) {
        data.date = today;
        data.war = 0;
        data.backup = 0;

        saveData();

        return true;
    }

    return false;
}

/* =========================================================
   HELP DESK
========================================================= */

function createDashboardEmbed() {
    const total = data.war + data.backup;

    const embed = new EmbedBuilder()
        .setColor(0x8B0000)
        .setTitle("🐉 BLACK DRAGONS")
        .setDescription(
            "## DRAGON'S CALL\n\n" +
            "The battlefield doesn't wait.\n" +
            "When the Black Dragons need reinforcements, send the call.\n\n" +

            "### 🐉 REQUEST ASSISTANCE\n\n" +

            "⚔️ **WAR CALL**\n" +
            "Summon the dragons for battle.\n\n" +

            "🛡️ **BACKUP CALL**\n" +
            "Call for immediate reinforcement."
        )
        .addFields({
            name: "📊 TODAY'S CALLS",

            value:
                "⚔️ **War** — `" + data.war + "`\n" +
                "🛡️ **Backup** — `" + data.backup + "`\n" +
                "🐉 **Total** — `" + total + "`"
        })
        .setFooter({
            text: "Black Dragons • United by strength • Fearless in battle"
        });

    if (BANNER_URL && BANNER_URL.startsWith("http")) {
        embed.setImage(BANNER_URL);
    }

    return embed;
}

function createButtons() {
    return new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("war")
            .setLabel("WAR")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("backup")
            .setLabel("BACKUP")
            .setEmoji("🛡️")
            .setStyle(ButtonStyle.Primary)
    );
}

async function updateDashboard() {
    if (!dashboardMessage) return;

    try {
        await dashboardMessage.edit({
            embeds: [createDashboardEmbed()],
            components: [createButtons()]
        });
    } catch (error) {
        console.error("❌ Could not update dashboard:", error);
    }
}

function createRequestModal(customId, title, reasonPlaceholder) {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

    const region = new TextInputBuilder()
        .setCustomId("region")
        .setLabel("Region")
        .setPlaceholder(
            "Example: India / Asia / Europe / NA"
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    const serverLink = new TextInputBuilder()
        .setCustomId("server_link")
        .setLabel("Server / Game Link")
        .setPlaceholder(
            "Paste the game/server link"
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(500);

    const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason")
        .setPlaceholder(reasonPlaceholder)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    const clan = new TextInputBuilder()
        .setCustomId("clan")
        .setLabel("Clan / People Names")
        .setPlaceholder(
            "Enter the clan or people involved"
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

    modal.addComponents(
        new ActionRowBuilder().addComponents(region),
        new ActionRowBuilder().addComponents(serverLink),
        new ActionRowBuilder().addComponents(reason),
        new ActionRowBuilder().addComponents(clan)
    );

    return modal;
}

function createWarModal() {
    return createRequestModal(
        "war_modal",
        "⚔️ WAR REQUEST",
        "Why do you need members for the war?"
    );
}

function createBackupModal() {
    return createRequestModal(
        "backup_modal",
        "🛡️ BACKUP REQUEST",
        "Why do you need backup?"
    );
}

function createRequestEmbed(type, user, details) {
    const isWar = type === "war";

    return new EmbedBuilder()
        .setColor(
            isWar
                ? 0xED4245
                : 0x5865F2
        )
        .setTitle(
            isWar
                ? "⚔️ WAR REQUEST"
                : "🛡️ BACKUP REQUEST"
        )
        .setDescription(
            isWar
                ? `${user} has requested a **WAR**.\n\nIf you're available, join up and assist.`
                : `${user} has requested **BACKUP**.\n\nIf you're available, join up and assist.`
        )
        .addFields(
            {
                name: "🌍 Region",
                value: details.region
            },

            {
                name: "👤 Requested By",
                value: `${user}`
            },

            {
                name: "👥 Clan / People",
                value: details.clan
            },

            {
                name: "📝 Reason",
                value: details.reason
            },

            {
                name: "🔗 Server Link",
                value: details.serverLink
            }
        )
        .setTimestamp();
}

async function createRequestThread(
    type,
    interaction,
    details
) {
    const isWar = type === "war";

    const roleId = isWar
        ? WAR_ROLE_ID
        : BACKUP_ROLE_ID;

    const threadName = isWar
        ? `⚔️ WAR - ${interaction.user.username}`
        : `🛡️ BACKUP - ${interaction.user.username}`;

    const thread = await interaction.channel.threads.create({
        name: threadName,
        type: ChannelType.PublicThread,
        autoArchiveDuration: 1440,

        reason: isWar
            ? "Black Dragons WAR request"
            : "Black Dragons BACKUP request"
    });

    const endButton =
        new ActionRowBuilder().addComponents(

            new ButtonBuilder()
                .setCustomId("end_request")
                .setLabel("END")
                .setEmoji("🛑")
                .setStyle(ButtonStyle.Danger)
        );

    await thread.send({
        content: roleId
            ? `<@&${roleId}>`
            : "",

        embeds: [
            createRequestEmbed(
                type,
                interaction.user,
                details
            )
        ],

        components: [endButton],

        allowedMentions: roleId
            ? { roles: [roleId] }
            : { parse: [] }
    });

    return thread;
}

async function setupDashboard(bot) {
    try {
        const channel =
            await bot.channels.fetch(
                DASHBOARD_CHANNEL_ID
            );

        if (!channel || !channel.isTextBased()) {
            console.error(
                "❌ Dashboard channel not found or is not a text channel."
            );

            return;
        }

        if (data.dashboardMessageId) {
            try {
                dashboardMessage =
                    await channel.messages.fetch(
                        data.dashboardMessageId
                    );

                await updateDashboard();

                console.log(
                    "✅ Existing dashboard restored."
                );

                return;

            } catch {
                data.dashboardMessageId = null;
                saveData();
            }
        }

        const messages =
            await channel.messages.fetch({
                limit: 50
            });

        dashboardMessage =
            messages.find(message =>
                message.author.id === bot.user.id &&
                message.components.some(row =>
                    row.components.some(
                        component =>
                            component.customId === "war"
                    )
                )
            );

        if (dashboardMessage) {
            data.dashboardMessageId =
                dashboardMessage.id;

            saveData();

            await updateDashboard();

            console.log(
                "✅ Existing dashboard found and updated."
            );

            return;
        }

        dashboardMessage =
            await channel.send({
                embeds: [
                    createDashboardEmbed()
                ],

                components: [
                    createButtons()
                ]
            });

        data.dashboardMessageId =
            dashboardMessage.id;

        saveData();

        console.log(
            "✅ New dashboard created."
        );

    } catch (error) {
        console.error(
            "❌ Dashboard setup failed:",
            error
        );
    }
}

/* =========================================================
   RANK HELPERS
========================================================= */

function getRank(kills) {
    return (
        RANKS.find(
            rank => kills >= rank.min
        ) ||
        RANKS[RANKS.length - 1]
    );
}

function getRankDisplay(rank) {
    return `${rank.emoji} **${rank.key}**`;
}

function formatKills(number) {
    return Number(number).toLocaleString("en-US");
}

/* =========================================================
   RANK PANEL
========================================================= */

function createRankPanelEmbed() {
    return new EmbedBuilder()
        .setColor(0x8B0000)
        .setTitle(
            "⚔️ 𝐊𝐈𝐋𝐋 𝐑𝐀𝐍𝐊 𝐒𝐘𝐒𝐓𝐄𝐌 ⚔️"
        )
        .setDescription(
            "───────────────────────────\n\n" +

            "👑  **𝐙**     •     **𝟓𝟎𝐊+**\n" +
            "💠  **𝐒𝐒𝐒**   •     **𝟐𝟎𝐊+**\n" +
            "🔥  **𝐒𝐒**    •     **𝟏𝟓𝐊+**\n" +
            "⚡  **𝐒**     •     **𝟏𝟎𝐊+**\n" +
            "🏆  **𝐀**     •     **𝟕.𝟓𝐊+**\n" +
            "💫  **𝐁**     •     **𝟓𝐊+**\n" +
            "⚔️  **𝐂**     •     **𝟐.𝟓𝐊+**\n" +
            "🗡️  **𝐃**     •     **𝟏𝐊+**\n" +
            "🌱  **𝐄**     •     **𝟎–𝟗𝟗𝟗**\n\n" +

            "───────────────────────────\n\n" +

            "### 🏅 𝐏𝐑𝐎𝐕𝐄 𝐘𝐎𝐔𝐑 𝐖𝐎𝐑𝐓𝐇\n\n" +

            "Your kill count determines your official " +
            "Black Dragons rank. Submit accurate information " +
            "and clear leaderboard proof for verification.\n\n" +

            "Applications are reviewed by authorized staff. " +
            "False, altered, or misleading proof may result " +
            "in rejection."
        )
        .setFooter({
            text:
                "Black Dragons • Kill Rank Verification"
        })
        .setTimestamp();
}

function createRankPanelButtons() {
    return new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("rank_register")
            .setLabel("REGISTER RANK")
            .setEmoji("📝")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("rank_update")
            .setLabel("UPDATE RANK")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Primary)
    );
}

/* =========================================================
   RANK APPLICATION MODALS
========================================================= */

function createRankModal(isUpdate) {
    return new ModalBuilder()
        .setCustomId(
            isUpdate
                ? "rank_update_modal"
                : "rank_register_modal"
        )
        .setTitle(
            isUpdate
                ? "🔄 UPDATE KILL RANK"
                : "📝 REGISTER KILL RANK"
        )
        .addComponents(

            new ActionRowBuilder().addComponents(

                new TextInputBuilder()
                    .setCustomId("roblox_username")
                    .setLabel("Roblox Username")
                    .setPlaceholder(
                        "Enter your exact Roblox username"
                    )
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100)
            ),

            new ActionRowBuilder().addComponents(

                new TextInputBuilder()
                    .setCustomId("kill_count")
                    .setLabel("Current Kill Count")
                    .setPlaceholder(
                        "Example: 8247"
                    )
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(10)
            )
        );
}

/* =========================================================
   RANK APPLICATION STORAGE
========================================================= */

function getPendingApplication(userId) {
    return data.rankApplications.find(
        app =>
            app.userId === userId &&
            (
                app.status === "pending_upload" ||
                app.status === "pending_review"
            )
    );
}

function createRankReviewEmbed(application) {
    const rank =
        getRank(application.kills);

    return new EmbedBuilder()
        .setColor(0x8B0000)
        .setTitle(
            `🏆 RANK APPLICATION #${application.id}`
        )
        .setDescription(
            "A kill-rank application has been submitted " +
            "for staff verification.\n\n" +

            "Please compare the submitted kill count " +
            "with the attached leaderboard proof before " +
            "making a decision."
        )
        .addFields(

            {
                name: "👤 Discord",
                value: `<@${application.userId}>`,
                inline: true
            },

            {
                name: "🎮 Roblox",
                value: application.robloxUsername,
                inline: true
            },

            {
                name: "⚔️ Kills",
                value: formatKills(
                    application.kills
                ),
                inline: true
            },

            {
                name: "🏅 Calculated Rank",
                value: getRankDisplay(rank),
                inline: true
            },

            {
                name: "📅 Submitted",
                value:
                    `<t:${Math.floor(
                        application.createdAt / 1000
                    )}:F>`,
                inline: true
            },

            {
                name: "📌 Type",
                value:
                    application.type === "update"
                        ? "Rank Update"
                        : "New Registration",
                inline: true
            }
        )
        .setFooter({
            text:
                "Review the attached proof before accepting."
        })
        .setTimestamp();
}

function createRankReviewButtons(
    applicationId
) {
    return new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId(
                `rank_accept:${applicationId}`
            )
            .setLabel("ACCEPT")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(
                `rank_decline:${applicationId}`
            )
            .setLabel("DECLINE")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
    );
}

function createDeclineModal(
    applicationId
) {
    return new ModalBuilder()
        .setCustomId(
            `rank_decline_modal:${applicationId}`
        )
        .setTitle(
            "❌ DECLINE RANK APPLICATION"
        )
        .addComponents(

            new ActionRowBuilder().addComponents(

                new TextInputBuilder()
                    .setCustomId("decline_reason")
                    .setLabel(
                        "Reason for rejection"
                    )
                    .setPlaceholder(
                        "Explain clearly why this application was declined."
                    )
                    .setStyle(
                        TextInputStyle.Paragraph
                    )
                    .setRequired(true)
                    .setMaxLength(1000)
            )
        );
}

/* =========================================================
   RANK PROOF THREAD
========================================================= */

async function createRankUploadThread(
    interaction,
    application
) {
    const channelId =
        data.rankConfig.registrationChannelId;

    const channel =
        await client.channels.fetch(
            channelId
        );

    if (!channel || !channel.isTextBased()) {
        throw new Error(
            "Rank registration channel is not configured correctly."
        );
    }

    const thread =
        await channel.threads.create({
            name:
                `🏆 Rank Proof - ${interaction.user.username}`,

            type:
                ChannelType.PrivateThread,

            autoArchiveDuration: 1440,

            reason:
                `Rank application #${application.id}`
        });

    await thread.members.add(
        interaction.user.id
    );

    application.threadId =
        thread.id;

    saveData();

    await thread.send({
        content:

            `<@${interaction.user.id}>\n\n` +

            `## 🏆 Proof Required\n` +

            `Your rank application **#${application.id}** has been created.\n\n` +

            `Please upload **one clear screenshot of the leaderboard** proving your kill count.\n\n` +

            `**Roblox:** ${application.robloxUsername}\n` +

            `**Kills:** ${formatKills(application.kills)}\n` +

            `**Calculated Rank:** ${getRankDisplay(
                getRank(application.kills)
            )}\n\n` +

            `⚠️ Your application will not be sent for staff review until a screenshot is uploaded.\n` +

            `Please send the screenshot directly in this thread.`
    });

    return thread;
}

/* =========================================================
   SEND APPLICATION TO STAFF
========================================================= */

async function forwardRankApplication(
    application,
    attachment
) {
    const reviewChannelId =
        data.rankConfig.reviewChannelId;

    if (!reviewChannelId) {
        throw new Error(
            "Rank review channel is not configured."
        );
    }

    const channel =
        await client.channels.fetch(
            reviewChannelId
        );

    if (!channel || !channel.isTextBased()) {
        throw new Error(
            "Rank review channel is invalid."
        );
    }

    const reviewMessage =
        await channel.send({

            content:
                "🔔 **New Rank Application — Staff Review Required**",

            embeds: [
                createRankReviewEmbed(
                    application
                )
            ],

            files: [
                {
                    attachment:
                        attachment.url,

                    name:
                        attachment.name ||
                        "leaderboard-proof.png"
                }
            ],

            components: [
                createRankReviewButtons(
                    application.id
                )
            ]
        });

    application.status =
        "pending_review";

    application.reviewMessageId =
        reviewMessage.id;

    application.proofUrl =
        attachment.url;

    application.proofName =
        attachment.name ||
        "leaderboard-proof.png";

    saveData();

    return reviewMessage;
}

/* =========================================================
   APPLICATION HISTORY
========================================================= */

async function recordRankHistory(
    application,
    status,
    reviewerId,
    reason = null
) {
    const historyChannelId =
        data.rankConfig.historyChannelId;

    if (!historyChannelId) {
        return;
    }

    try {
        const channel =
            await client.channels.fetch(
                historyChannelId
            );

        if (!channel || !channel.isTextBased()) {
            return;
        }

        const embed =
            new EmbedBuilder()
                .setColor(
                    status === "accepted"
                        ? 0x57F287
                        : 0xED4245
                )
                .setTitle(
                    status === "accepted"
                        ? `✅ RANK APPLICATION #${application.id} ACCEPTED`
                        : `❌ RANK APPLICATION #${application.id} DECLINED`
                )
                .addFields(

                    {
                        name: "👤 Discord",
                        value:
                            `<@${application.userId}>`,
                        inline: true
                    },

                    {
                        name: "🎮 Roblox",
                        value:
                            application.robloxUsername,
                        inline: true
                    },

                    {
                        name: "⚔️ Kills",
                        value:
                            formatKills(
                                application.kills
                            ),
                        inline: true
                    },

                    {
                        name: "🏅 Rank",
                        value:
                            getRankDisplay(
                                getRank(
                                    application.kills
                                )
                            ),
                        inline: true
                    },

                    {
                        name: "👮 Reviewed By",
                        value:
                            `<@${reviewerId}>`,
                        inline: true
                    },

                    {
                        name: "📅 Reviewed",
                        value:
                            `<t:${Math.floor(
                                Date.now() / 1000
                            )}:F>`,
                        inline: true
                    }
                )
                .setTimestamp();

        if (reason) {
            embed.addFields({
                name: "📝 Reason",
                value: reason
            });
        }

        await channel.send({
            embeds: [embed]
        });

    } catch (error) {
        console.error(
            "❌ Could not write rank history:",
            error
        );
    }
}

/* =========================================================
   RANK ROLE MANAGEMENT
========================================================= */

async function applyRankRole(
    member,
    rankKey
) {
    const roleId =
        data.rankConfig.rankRoleIds[
            rankKey
        ];

    if (!roleId) {
        return;
    }

    const allRankRoleIds =
        Object.values(
            data.rankConfig.rankRoleIds
        ).filter(Boolean);

    for (
        const oldRoleId of allRankRoleIds
    ) {
        if (
            oldRoleId !== roleId &&
            member.roles.cache.has(
                oldRoleId
            )
        ) {
            try {
                await member.roles.remove(
                    oldRoleId,
                    "Black Dragons rank update"
                );
            } catch (error) {
                console.error(
                    "❌ Could not remove old rank role:",
                    error
                );
            }
        }
    }

    if (
        !member.roles.cache.has(roleId)
    ) {
        try {
            await member.roles.add(
                roleId,
                "Black Dragons rank accepted"
            );
        } catch (error) {
            console.error(
                "❌ Could not add rank role:",
                error
            );
        }
    }
}

/* =========================================================
   RANK PANEL SETUP
========================================================= */

async function sendRankPanel(
    channel
) {
    const messages =
        await channel.messages.fetch({
            limit: 50
        });

    const existing =
        messages.find(message =>
            message.author.id ===
                client.user.id &&

            message.components.some(row =>
                row.components.some(
                    component =>
                        component.customId ===
                        "rank_register"
                )
            )
        );

    if (existing) {
        await existing.edit({
            embeds: [
                createRankPanelEmbed()
            ],

            components: [
                createRankPanelButtons()
            ]
        });

        return existing;
    }

    return channel.send({
        embeds: [
            createRankPanelEmbed()
        ],

        components: [
            createRankPanelButtons()
        ]
    });
}

/* =========================================================
   SLASH COMMAND REGISTRATION
========================================================= */

async function registerRankCommands() {
    const setupCommand =
        new SlashCommandBuilder()
            .setName("rank-setup")
            .setDescription(
                "Configure the Black Dragons kill-rank system."
            )
            .setDefaultMemberPermissions(
                PermissionFlagsBits.Administrator.toString()
            )

            .addChannelOption(option =>
                option
                    .setName(
                        "registration_channel"
                    )
                    .setDescription(
                        "Channel where members register and upload proof."
                    )
                    .addChannelTypes(
                        ChannelType.GuildText
                    )
                    .setRequired(true)
            )

            .addChannelOption(option =>
                option
                    .setName(
                        "review_channel"
                    )
                    .setDescription(
                        "Staff channel where applications are reviewed."
                    )
                    .addChannelTypes(
                        ChannelType.GuildText
                    )
                    .setRequired(true)
            )

            .addChannelOption(option =>
                option
                    .setName(
                        "history_channel"
                    )
                    .setDescription(
                        "Channel where accepted/declined applications are archived."
                    )
                    .addChannelTypes(
                        ChannelType.GuildText
                    )
                    .setRequired(true)
            )

            .addRoleOption(option =>
                option
                    .setName("z_role")
                    .setDescription(
                        "Role for Z rank (50K+)."
                    )
                    .setRequired(false)
            )

            .addRoleOption(option =>
                option
                    .setName("sss_role")
                    .setDescription(
                        "Role for SSS rank (20K+)."
                    )
                    .setRequired(false)
            )

            .addRoleOption(option =>
                option
                    .setName("ss_role")
                    .setDescription(
                        "Role for SS rank (15K+)."
                    )
                    .setRequired(false)
            )

            .addRoleOption(option =>
                option
                    .setName("s_role")
                    .setDescription(
                        "Role for S rank (10K+)."
                    )
                    .setRequired(false)
            )

            .addRoleOption(option =>
                option
                    .setName("a_role")
                    .setDescription(
                        "Role for A rank (7.5K+)."
                    )
                    .setRequired(false)
            )

            .addRoleOption(option =>
                option
                    .setName("b_role")
                    .setDescription(
                        "Role for B rank (5K+)."
                    )
                    .setRequired(false)
            )

            .addRoleOption(option =>
                option
                    .setName("c_role")
                    .setDescription(
                        "Role for C rank (2.5K+)."
                    )
                    .setRequired(false)
            )

            .addRoleOption(option =>
                option
                    .setName("d_role")
                    .setDescription(
                        "Role for D rank (1K+)."
                    )
                    .setRequired(false)
            )

            .addRoleOption(option =>
                option
                    .setName("e_role")
                    .setDescription(
                        "Role for E rank (0-999)."
                    )
                    .setRequired(false)
            );

    const leaderboardCommand =
        new SlashCommandBuilder()
            .setName("leaderboard")
            .setDescription(
                "Show the Black Dragons kill leaderboard."
            );

    const rest =
        new REST({
            version: "10"
        }).setToken(
            process.env.DISCORD_TOKEN
        );

    try {
        await rest.put(
            Routes.applicationCommands(
                client.user.id
            ),
            {
                body: [
                    setupCommand.toJSON(),
                    leaderboardCommand.toJSON()
                ]
            }
        );

        console.log(
            "✅ Slash commands registered."
        );

    } catch (error) {
        console.error(
            "❌ Could not register slash commands:",
            error
        );
    }
}

/* =========================================================
   READY
========================================================= */

client.once(
    Events.ClientReady,
    async bot => {

        console.log(
            `✅ ${bot.user.tag} is online!`
        );

        loadData();

        await setupDashboard(bot);

        await registerRankCommands();
    }
);

/* =========================================================
   BUTTON INTERACTIONS
========================================================= */

client.on(
    Events.InteractionCreate,
    async interaction => {

        if (!interaction.isButton()) {
            return;
        }

        /* -------------------------
           END HELP DESK REQUEST
        ------------------------- */

        if (
            interaction.customId ===
            "end_request"
        ) {

            if (
                !interaction.channel.isThread()
            ) {

                await interaction.reply({
                    content:
                        "❌ This button can only be used inside a request thread.",

                    ephemeral: true
                });

                return;
            }

            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.ManageThreads
                )
            ) {

                await interaction.reply({
                    content:
                        "❌ You need **Manage Threads** permission to end this request.",

                    ephemeral: true
                });

                return;
            }

            await interaction.reply({
                content:
                    "🗑️ **This request is being deleted...**"
            });

            setTimeout(
                async () => {

                    try {
                        await interaction.channel.delete(
                            "Black Dragons request ended"
                        );
                    } catch (error) {
                        console.error(
                            "❌ Could not delete request thread:",
                            error
                        );
                    }

                },
                3000
            );

            return;
        }

        /* -------------------------
           REGISTER / UPDATE RANK
        ------------------------- */

        if (
            interaction.customId ===
                "rank_register" ||

            interaction.customId ===
                "rank_update"
        ) {

            if (
                !data.rankConfig
                    .registrationChannelId ||

                !data.rankConfig
                    .reviewChannelId
            ) {

                await interaction.reply({
                    content:
                        "❌ The kill-rank system has not been configured yet. An administrator must use `/rank-setup` first.",

                    ephemeral: true
                });

                return;
            }

            const pending =
                getPendingApplication(
                    interaction.user.id
                );

            if (pending) {

                await interaction.reply({
                    content:
                        `⏳ You already have an active rank application **#${pending.id}**. Finish that application before starting another one.`,

                    ephemeral: true
                });

                return;
            }

            const isUpdate =
                interaction.customId ===
                "rank_update";

            if (
                isUpdate &&
                !data.rankUsers[
                    interaction.user.id
                ]
            ) {

                await interaction.reply({
                    content:
                        "❌ You do not have an approved rank yet. Please use **REGISTER RANK** first.",

                    ephemeral: true
                });

                return;
            }

            await interaction.showModal(
                createRankModal(
                    isUpdate
                )
            );

            return;
        }

        /* -------------------------
           ACCEPT RANK
        ------------------------- */

        if (
            interaction.customId.startsWith(
                "rank_accept:"
            )
        ) {

            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.Administrator
                )
            ) {

                await interaction.reply({
                    content:
                        "❌ Only administrators can review rank applications.",

                    ephemeral: true
                });

                return;
            }

            const applicationId =
                interaction.customId.split(
                    ":"
                )[1];

            const application =
                data.rankApplications.find(
                    app =>
                        app.id ===
                        applicationId
                );

            if (
                !application ||
                application.status !==
                    "pending_review"
            ) {

                await interaction.reply({
                    content:
                        "❌ This application is no longer awaiting review.",

                    ephemeral: true
                });

                return;
            }

            const rank =
                getRank(
                    application.kills
                );

            try {

                const member =
                    await interaction.guild.members.fetch(
                        application.userId
                    );

                await applyRankRole(
                    member,
                    rank.key
                );

                data.rankUsers[
                    application.userId
                ] = {

                    discordId:
                        application.userId,

                    robloxUsername:
                        application.robloxUsername,

                    kills:
                        application.kills,

                    rank:
                        rank.key,

                    updatedAt:
                        Date.now()
                };

                application.status =
                    "accepted";

                application.reviewerId =
                    interaction.user.id;

                application.reviewedAt =
                    Date.now();

                saveData();

                await recordRankHistory(
                    application,
                    "accepted",
                    interaction.user.id
                );

                await interaction.update({

                    content:
                        "✅ **Application accepted.**",

                    embeds: [
                        createRankReviewEmbed(
                            application
                        )
                    ],

                    components: []
                });

                try {

                    const user =
                        await client.users.fetch(
                            application.userId
                        );

                    await user.send(

                        `🏆 **Your Black Dragons rank application has been accepted!**\n\n` +

                        `**Kills:** ${formatKills(
                            application.kills
                        )}\n` +

                        `**Rank:** ${getRankDisplay(
                            rank
                        )}`
                    );

                } catch {
                    console.log(
                        "Could not DM applicant."
                    );
                }

            } catch (error) {

                console.error(
                    "❌ Could not accept rank application:",
                    error
                );

                await interaction.reply({
                    content:
                        "❌ Something went wrong while accepting the application. Check that the bot can manage the rank roles.",

                    ephemeral: true
                });
            }

            return;
        }

        /* -------------------------
           DECLINE RANK
        ------------------------- */

        if (
            interaction.customId.startsWith(
                "rank_decline:"
            )
        ) {

            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.Administrator
                )
            ) {

                await interaction.reply({
                    content:
                        "❌ Only administrators can review rank applications.",

                    ephemeral: true
                });

                return;
            }

            const applicationId =
                interaction.customId.split(
                    ":"
                )[1];

            const application =
                data.rankApplications.find(
                    app =>
                        app.id ===
                        applicationId
                );

            if (
                !application ||
                application.status !==
                    "pending_review"
            ) {

                await interaction.reply({
                    content:
                        "❌ This application is no longer awaiting review.",

                    ephemeral: true
                });

                return;
            }

            await interaction.showModal(
                createDeclineModal(
                    applicationId
                )
            );

            return;
        }

        /* -------------------------
           HELP DESK BUTTONS
        ------------------------- */

        if (
            interaction.customId ===
                "war" ||

            interaction.customId ===
                "backup"
        ) {

            checkDailyReset();

            const userId =
                interaction.user.id;

            const lastUsed =
                cooldowns.get(
                    userId
                );

            if (lastUsed) {

                const elapsed =
                    Date.now() -
                    lastUsed;

                if (
                    elapsed <
                    COOLDOWN_TIME
                ) {

                    const remaining =
                        Math.ceil(
                            (
                                COOLDOWN_TIME -
                                elapsed
                            ) / 1000
                        );

                    await interaction.reply({
                        content:
                            `⏳ **Slow down!** You can request again in **${remaining} seconds**.`,

                        ephemeral: true
                    });

                    return;
                }

                cooldowns.delete(
                    userId
                );
            }

            if (
                interaction.customId ===
                "war"
            ) {

                await interaction.showModal(
                    createWarModal()
                );

            } else {

                await interaction.showModal(
                    createBackupModal()
                );
            }
        }
    }
);

/* =========================================================
   MODAL SUBMISSIONS
========================================================= */

client.on(
    Events.InteractionCreate,
    async interaction => {

        if (
            !interaction.isModalSubmit()
        ) {
            return;
        }

        /* -------------------------
           WAR / BACKUP MODALS
        ------------------------- */

        const isWar =
            interaction.customId ===
            "war_modal";

        const isBackup =
            interaction.customId ===
            "backup_modal";

        if (
            isWar ||
            isBackup
        ) {

            checkDailyReset();

            const userId =
                interaction.user.id;

            const lastUsed =
                cooldowns.get(
                    userId
                );

            if (lastUsed) {

                const elapsed =
                    Date.now() -
                    lastUsed;

                if (
                    elapsed <
                    COOLDOWN_TIME
                ) {

                    const remaining =
                        Math.ceil(
                            (
                                COOLDOWN_TIME -
                                elapsed
                            ) / 1000
                        );

                    await interaction.reply({
                        content:
                            `⏳ **Slow down!** You can request again in **${remaining} seconds**.`,

                        ephemeral: true
                    });

                    return;
                }

                cooldowns.delete(
                    userId
                );
            }

            const details = {

                region:
                    interaction.fields.getTextInputValue(
                        "region"
                    ),

                serverLink:
                    interaction.fields.getTextInputValue(
                        "server_link"
                    ),

                reason:
                    interaction.fields.getTextInputValue(
                        "reason"
                    ),

                clan:
                    interaction.fields.getTextInputValue(
                        "clan"
                    )
            };

            const type =
                isWar
                    ? "war"
                    : "backup";

            try {

                await interaction.deferReply({
                    ephemeral: true
                });

                const thread =
                    await createRequestThread(
                        type,
                        interaction,
                        details
                    );

                if (isWar) {
                    data.war++;
                } else {
                    data.backup++;
                }

                cooldowns.set(
                    userId,
                    Date.now()
                );

                saveData();

                await updateDashboard();

                await interaction.editReply({

                    content:
                        `✅ Your ${
                            isWar
                                ? "WAR"
                                : "BACKUP"
                        } request has been created!\n\n📁 ${thread}`
                });

            } catch (error) {

                console.error(
                    "❌ Could not create request:",
                    error
                );

                if (
                    interaction.deferred ||
                    interaction.replied
                ) {

                    await interaction.editReply({
                        content:
                            "❌ Something went wrong while creating your request. Please try again."
                    });

                } else {

                    await interaction.reply({
                        content:
                            "❌ Something went wrong while creating your request. Please try again.",

                        ephemeral: true
                    });
                }
            }

            return;
        }

        /* -------------------------
           REGISTER / UPDATE RANK
        ------------------------- */

        if (
            interaction.customId ===
                "rank_register_modal" ||

            interaction.customId ===
                "rank_update_modal"
        ) {

            const isUpdate =
                interaction.customId ===
                "rank_update_modal";

            const robloxUsername =
                interaction.fields
                    .getTextInputValue(
                        "roblox_username"
                    )
                    .trim();

            const killText =
                interaction.fields
                    .getTextInputValue(
                        "kill_count"
                    )
                    .replace(
                        /,/g,
                        ""
                    )
                    .trim();

            const kills =
                Number(
                    killText
                );

            if (
                !Number.isInteger(
                    kills
                ) ||
                kills < 0 ||
                kills > 1000000000
            ) {

                await interaction.reply({
                    content:
                        "❌ Please enter a valid whole-number kill count.",

                    ephemeral: true
                });

                return;
            }

            const pending =
                getPendingApplication(
                    interaction.user.id
                );

            if (pending) {

                await interaction.reply({
                    content:
                        `❌ You already have an active application **#${pending.id}**.`,

                    ephemeral: true
                });

                return;
            }

            const application = {

                id:
                    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
                        .toUpperCase(),

                userId:
                    interaction.user.id,

                discordUsername:
                    interaction.user.username,

                robloxUsername:
                    robloxUsername,

                kills:
                    kills,

                rank:
                    getRank(kills).key,

                type:
                    isUpdate
                        ? "update"
                        : "register",

                status:
                    "pending_upload",

                createdAt:
                    Date.now(),

                threadId:
                    null,

                reviewMessageId:
                    null,

                proofUrl:
                    null,

                proofName:
                    null,

                reviewerId:
                    null,

                reviewedAt:
                    null,

                declineReason:
                    null
            };

            data.rankApplications.push(
                application
            );

            saveData();

            try {

                const thread =
                    await createRankUploadThread(
                        interaction,
                        application
                    );

                await interaction.reply({

                    content:

                        `✅ **Application #${application.id} created.**\n\n` +

                        `📁 ${thread}\n\n` +

                        `Please open the thread and upload your leaderboard screenshot there.`,

                    ephemeral: true
                });

            } catch (error) {

                console.error(
                    "❌ Could not create rank upload thread:",
                    error
                );

                application.status =
                    "cancelled";

                saveData();

                await interaction.reply({
                    content:
                        "❌ I could not create the proof-upload thread. Please contact an administrator.",

                    ephemeral: true
                });
            }

            return;
        }

        /* -------------------------
           DECLINE REASON
        ------------------------- */

        if (
            interaction.customId.startsWith(
                "rank_decline_modal:"
            )
        ) {

            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.Administrator
                )
            ) {

                await interaction.reply({
                    content:
                        "❌ Only administrators can decline rank applications.",

                    ephemeral: true
                });

                return;
            }

            const applicationId =
                interaction.customId.split(
                    ":"
                )[1];

            const application =
                data.rankApplications.find(
                    app =>
                        app.id ===
                        applicationId
                );

            if (
                !application ||
                application.status !==
                    "pending_review"
            ) {

                await interaction.reply({
                    content:
                        "❌ This application is no longer awaiting review.",

                    ephemeral: true
                });

                return;
            }

            const reason =
                interaction.fields
                    .getTextInputValue(
                        "decline_reason"
                    )
                    .trim();

            application.status =
                "declined";

            application.reviewerId =
                interaction.user.id;

            application.reviewedAt =
                Date.now();

            application.declineReason =
                reason;

            saveData();

            await recordRankHistory(
                application,
                "declined",
                interaction.user.id,
                reason
            );

            await interaction.reply({
                content:
                    "❌ **Application declined and added to application history.**",

                ephemeral: true
            });

            try {

                const reviewChannel =
                    interaction.channel;

                const reviewMessage =
                    application.reviewMessageId
                        ? await reviewChannel.messages.fetch(
                            application.reviewMessageId
                        )
                        : null;

                if (reviewMessage) {

                    await reviewMessage.edit({

                        content:
                            "🔴 **Rank Application Declined**",

                        embeds: [

                            createRankReviewEmbed(
                                application
                            )
                                .setColor(
                                    0xED4245
                                )
                                .addFields({
                                    name:
                                        "📝 Decline Reason",

                                    value:
                                        reason
                                })
                        ],

                        components: []
                    });
                }

            } catch (error) {

                console.error(
                    "❌ Could not update declined application message:",
                    error
                );
            }

            try {

                const user =
                    await client.users.fetch(
                        application.userId
                    );

                await user.send(

                    `❌ **Your Black Dragons rank application has been declined.**\n\n` +

                    `**Reason:** ${reason}\n\n` +

                    `You may submit a new application after correcting the issue.`
                );

            } catch {
                console.log(
                    "Could not DM applicant."
                );
            }

            return;
        }
    }
);

/* =========================================================
   LEADERBOARD PROOF DETECTION
========================================================= */

client.on(
    Events.MessageCreate,
    async message => {

        if (message.author.bot) {
            return;
        }

        if (
            !message.channel.isThread()
        ) {
            return;
        }

        const application =
            data.rankApplications.find(
                app =>
                    app.threadId ===
                        message.channel.id &&

                    app.status ===
                        "pending_upload"
            );

        if (!application) {
            return;
        }

        const attachment =
            message.attachments.find(
                file =>
                    file.contentType?.startsWith(
                        "image/"
                    ) ||

                    /\.(png|jpe?g|webp|gif)$/i.test(
                        file.name || ""
                    )
            );

        if (!attachment) {

            await message.reply(
                "⚠️ Please upload the leaderboard screenshot as an image attachment."
            );

            return;
        }

        try {

            await message.react("✅");

            await forwardRankApplication(
                application,
                attachment
            );

            await message.channel.send(

                `✅ **Proof received.** Your application has been sent to staff for review.\n\n` +

                `Application: **#${application.id}**\n` +

                `Status: 🟡 Pending Review`
            );

            try {

                await message.channel.setArchived(
                    true
                );

            } catch {
                // Archiving is optional.
            }

            console.log(
                `✅ Rank application #${application.id} sent for review.`
            );

        } catch (error) {

            console.error(
                "❌ Could not forward rank proof:",
                error
            );

            await message.channel.send(
                "❌ I could not forward your proof to staff. Please contact an administrator."
            );
        }
    }
);

/* =========================================================
   SLASH COMMANDS
========================================================= */

client.on(
    Events.InteractionCreate,
    async interaction => {

        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        /* -------------------------
           RANK SETUP
        ------------------------- */

        if (
            interaction.commandName ===
            "rank-setup"
        ) {

            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.Administrator
                )
            ) {

                await interaction.reply({
                    content:
                        "❌ You need **Administrator** permission to use this command.",

                    ephemeral: true
                });

                return;
            }

            const registrationChannel =
                interaction.options.getChannel(
                    "registration_channel"
                );

            const reviewChannel =
                interaction.options.getChannel(
                    "review_channel"
                );

            const historyChannel =
                interaction.options.getChannel(
                    "history_channel"
                );

            data.rankConfig
                .registrationChannelId =
                registrationChannel.id;

            data.rankConfig
                .reviewChannelId =
                reviewChannel.id;

            data.rankConfig
                .historyChannelId =
                historyChannel.id;

            const roleKeys = [
                "z",
                "sss",
                "ss",
                "s",
                "a",
                "b",
                "c",
                "d",
                "e"
            ];

            for (
                const key of roleKeys
            ) {

                const role =
                    interaction.options.getRole(
                        `${key}_role`
                    );

                if (role) {

                    data.rankConfig
                        .rankRoleIds[
                            key.toUpperCase()
                        ] = role.id;
                }
            }

            saveData();

            try {

                const panel =
                    await sendRankPanel(
                        registrationChannel
                    );

                await interaction.reply({

                    content:

                        `✅ **Kill Rank System configured.**\n\n` +

                        `📝 Registration: ${registrationChannel}\n` +

                        `🔎 Review: ${reviewChannel}\n` +

                        `📜 History: ${historyChannel}\n\n` +

                        `The rank panel has been created/updated in ${registrationChannel}.\n\n` +

                        `Rank roles supplied to this command have also been saved.`,

                    ephemeral: true
                });

                console.log(
                    `✅ Rank panel configured by ${interaction.user.tag}: ${panel.id}`
                );

            } catch (error) {

                console.error(
                    "❌ Rank setup failed:",
                    error
                );

                await interaction.reply({
                    content:
                        "❌ Rank setup failed. Make sure the bot can view/send messages in all three channels.",

                    ephemeral: true
                });
            }

            return;
        }

        /* -------------------------
           LEADERBOARD
        ------------------------- */

        if (
            interaction.commandName ===
            "leaderboard"
        ) {

            const users =
                Object.values(
                    data.rankUsers
                )
                .sort(
                    (a, b) =>
                        b.kills -
                        a.kills
                );

            if (
                users.length === 0
            ) {

                await interaction.reply({
                    content:
                        "🏆 The kill leaderboard is currently empty."
                });

                return;
            }

            const pageSize = 10;

            const top =
                users.slice(
                    0,
                    pageSize
                );

            const lines = [];

            for (
                let i = 0;
                i < top.length;
                i++
            ) {

                const user =
                    top[i];

                const rank =
                    getRank(
                        user.kills
                    );

                const medal =
                    i === 0
                        ? "🥇"
                        : i === 1
                            ? "🥈"
                            : i === 2
                                ? "🥉"
                                : `**${i + 1}.**`;

                lines.push(

                    `${medal} <@${user.discordId}> — **${formatKills(
                        user.kills
                    )}** kills — ${getRankDisplay(
                        rank
                    )}`
                );
            }

            const embed =
                new EmbedBuilder()
                    .setColor(0x8B0000)
                    .setTitle(
                        "🏆 BLACK DRAGONS KILL LEADERBOARD"
                    )
                    .setDescription(
                        lines.join("\n")
                    )
                    .setFooter({
                        text:
                            `Showing top ${top.length} approved players`
                    })
                    .setTimestamp();

            await interaction.reply({
                embeds: [embed]
            });
        }
    }
);

/* =========================================================
   START BOT
========================================================= */

client.login(
    process.env.DISCORD_TOKEN
);
          
