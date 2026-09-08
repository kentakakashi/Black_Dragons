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
    ChannelType
} = require("discord.js");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const WAR_ROLE_ID = process.env.WAR_ROLE_ID;
const BACKUP_ROLE_ID = process.env.BACKUP_ROLE_ID;
const DASHBOARD_CHANNEL_ID = process.env.DASHBOARD_CHANNEL_ID;

const TIMEZONE = "Asia/Kolkata";
const COOLDOWN_TIME = 60 * 1000;
const DATA_FILE = path.join(__dirname, "data.json");

// Replace this with the direct URL of the final Holly Knights GIF banner.
const BANNER_URL = "https://cdn.discordapp.com/attachments/1542930463495295077/1542930501952864266/IMG_20260828_214420.jpg?ex=6a930581&is=6a91b401&hm=6362ab065128692b2220db4e836e714f4a88208dc3ffc5b530d39a5c2999c80b&";

let data = {
    date: "",
    war: 0,
    backup: 0,
    dashboardMessageId: null
};

const cooldowns = new Map();
let dashboardMessage = null;

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
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4));
    } catch (error) {
        console.error("❌ Could not save data:", error);
    }
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const savedData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
            data = { ...data, ...savedData };
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

function createDashboardEmbed() {
    const total = data.war + data.backup;

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🏰 HOLLY KNIGHTS")
        .setDescription(
            "## REINFORCEMENT CENTER\n\n" +
            "The battlefield doesn't wait.\n" +
            "When your squad needs another knight, send the call.\n\n" +
            "### ⚔️ REQUEST ASSISTANCE\n\n" +
            "⚔️ **WAR CALL**\n" +
            "Gather knights for battle.\n\n" +
            "🛡️ **BACKUP CALL**\n" +
            "Request immediate reinforcement."
        )
        .addFields({
            name: "📊 TODAY'S CALLS",
            value:
                "⚔️ **War** — `" + data.war + "`\n" +
                "🛡️ **Backup** — `" + data.backup + "`\n" +
                "📢 **Total** — `" + total + "`"
        })
        .setFooter({
            text: "Holly Knights • United by oath • Strong in battle"
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

function createWarModal() {
    return createRequestModal("war_modal", "⚔️ WAR REQUEST", "Why do you need members for the war?");
}

function createBackupModal() {
    return createRequestModal("backup_modal", "🛡️ BACKUP REQUEST", "Why do you need backup?");
}

function createRequestModal(customId, title, reasonPlaceholder) {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

    const region = new TextInputBuilder()
        .setCustomId("region")
        .setLabel("Region")
        .setPlaceholder("Example: India / Asia / Europe / NA")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    const serverLink = new TextInputBuilder()
        .setCustomId("server_link")
        .setLabel("Server / Game Link")
        .setPlaceholder("Paste the game/server link")
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
        .setPlaceholder("Enter the clan or people involved")
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

function createRequestEmbed(type, user, details) {
    const isWar = type === "war";

    return new EmbedBuilder()
        .setColor(isWar ? 0xED4245 : 0x5865F2)
        .setTitle(isWar ? "⚔️ WAR REQUEST" : "🛡️ BACKUP REQUEST")
        .setDescription(
            isWar
                ? `${user} has requested a **WAR**.\n\nIf you're available, join up and assist.`
                : `${user} has requested **BACKUP**.\n\nIf you're available, join up and assist.`
        )
        .addFields(
            { name: "🌍 Region", value: details.region },
            { name: "👤 Requested By", value: `${user}` },
            { name: "👥 Clan / People", value: details.clan },
            { name: "📝 Reason", value: details.reason },
            { name: "🔗 Server Link", value: details.serverLink }
        )
        .setTimestamp();
}

async function createRequestThread(type, interaction, details) {
    const isWar = type === "war";
    const roleId = isWar ? WAR_ROLE_ID : BACKUP_ROLE_ID;
    const threadName = isWar
        ? `⚔️ WAR - ${interaction.user.username}`
        : `🛡️ BACKUP - ${interaction.user.username}`;

    const thread = await interaction.channel.threads.create({
        name: threadName,
        type: ChannelType.PublicThread,
        autoArchiveDuration: 1440,
        reason: isWar ? "Holly Knights WAR request" : "Holly Knights BACKUP request"
    });

    const endButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("end_request")
            .setLabel("END")
            .setEmoji("🛑")
            .setStyle(ButtonStyle.Danger)
    );

    await thread.send({
        content: `<@&${roleId}>`,
        embeds: [createRequestEmbed(type, interaction.user, details)],
        components: [endButton],
        allowedMentions: { roles: [roleId] }
    });

    return thread;
}

async function setupDashboard(bot) {
    try {
        const channel = await bot.channels.fetch(DASHBOARD_CHANNEL_ID);

        if (!channel || !channel.isTextBased()) {
            console.error("❌ Dashboard channel not found or is not a text channel.");
            return;
        }

        if (data.dashboardMessageId) {
            try {
                dashboardMessage = await channel.messages.fetch(data.dashboardMessageId);
                await updateDashboard();
                console.log("✅ Existing dashboard restored.");
                return;
            } catch {
                data.dashboardMessageId = null;
                saveData();
            }
        }

        const messages = await channel.messages.fetch({ limit: 50 });

        dashboardMessage = messages.find(message =>
            message.author.id === bot.user.id &&
            message.components.some(row =>
                row.components.some(component => component.customId === "war")
            )
        );

        if (dashboardMessage) {
            data.dashboardMessageId = dashboardMessage.id;
            saveData();
            await updateDashboard();
            console.log("✅ Existing dashboard found and updated.");
            return;
        }

        dashboardMessage = await channel.send({
            embeds: [createDashboardEmbed()],
            components: [createButtons()]
        });

        data.dashboardMessageId = dashboardMessage.id;
        saveData();
        console.log("✅ New dashboard created.");
    } catch (error) {
        console.error("❌ Dashboard setup failed:", error);
    }
}

client.once(Events.ClientReady, async bot => {
    console.log(`✅ ${bot.user.tag} is online!`);
    loadData();
    await setupDashboard(bot);
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === "end_request") {
        if (!interaction.channel.isThread()) {
            await interaction.reply({
                content: "❌ This button can only be used inside a request thread.",
                ephemeral: true
            });
            return;
        }

        if (!interaction.member.permissions.has("ManageThreads")) {
            await interaction.reply({
                content: "❌ You need **Manage Threads** permission to end this request.",
                ephemeral: true
            });
            return;
        }

        await interaction.reply({
            content: "🗑️ **This request is being deleted...**"
        });

        setTimeout(async () => {
            try {
                await interaction.channel.delete("Holly Knights request ended");
            } catch (error) {
                console.error("❌ Could not delete request thread:", error);
            }
        }, 3000);

        return;
    }

    checkDailyReset();

    if (interaction.customId !== "war" && interaction.customId !== "backup") return;

    const userId = interaction.user.id;
    const lastUsed = cooldowns.get(userId);

    if (lastUsed) {
        const elapsed = Date.now() - lastUsed;

        if (elapsed < COOLDOWN_TIME) {
            const remaining = Math.ceil((COOLDOWN_TIME - elapsed) / 1000);
            await interaction.reply({
                content: `⏳ **Slow down!** You can request again in **${remaining} seconds**.`,
                ephemeral: true
            });
            return;
        }

        cooldowns.delete(userId);
    }

    if (interaction.customId === "war") {
        await interaction.showModal(createWarModal());
    } else {
        await interaction.showModal(createBackupModal());
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;

    const isWar = interaction.customId === "war_modal";
    const isBackup = interaction.customId === "backup_modal";

    if (!isWar && !isBackup) return;

    checkDailyReset();

    const userId = interaction.user.id;
    const lastUsed = cooldowns.get(userId);

    if (lastUsed) {
        const elapsed = Date.now() - lastUsed;

        if (elapsed < COOLDOWN_TIME) {
            const remaining = Math.ceil((COOLDOWN_TIME - elapsed) / 1000);
            await interaction.reply({
                content: `⏳ **Slow down!** You can request again in **${remaining} seconds**.`,
                ephemeral: true
            });
            return;
        }

        cooldowns.delete(userId);
    }

    const details = {
        region: interaction.fields.getTextInputValue("region"),
        serverLink: interaction.fields.getTextInputValue("server_link"),
        reason: interaction.fields.getTextInputValue("reason"),
        clan: interaction.fields.getTextInputValue("clan")
    };

    const type = isWar ? "war" : "backup";

    try {
        await interaction.deferReply({ ephemeral: true });

        const thread = await createRequestThread(type, interaction, details);

        if (isWar) {
            data.war++;
        } else {
            data.backup++;
        }

        cooldowns.set(userId, Date.now());
        saveData();
        await updateDashboard();

        await interaction.editReply({
            content: `✅ Your ${isWar ? "WAR" : "BACKUP"} request has been created!\n\n📁 ${thread}`
        });
    } catch (error) {
        console.error("❌ Could not create request:", error);

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: "❌ Something went wrong while creating your request. Please try again."
            });
        } else {
            await interaction.reply({
                content: "❌ Something went wrong while creating your request. Please try again.",
                ephemeral: true
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
