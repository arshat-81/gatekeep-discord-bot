const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
const Database = require("better-sqlite3");
const path = require("path");

// ─────────────────────────────────────────
//  CONFIG — fill these in before running
// ─────────────────────────────────────────
const BOT_TOKEN          = "MTQ4ODYyODMxMDM0MTg0OTIyOA.GA9r9g.u49CwxFxMHW1HFs-Y1R1AxJ6SXB8oYqajowTys";
const PENDING_ROLE_ID    = "1492817768813297824";
const WELCOME_CHANNEL_ID = "1492817672868462623";
const TIME_WINDOW_MS     = 5  * 24 * 60 * 60 * 1000; // 5 days lockdown
const GRACE_PERIOD_MS    = 15 * 24 * 60 * 60 * 1000; // 15 days — if gone longer, full access
// ─────────────────────────────────────────

// ── SQLite Setup ───────────────────────────
const db = new Database(path.join(__dirname, "timers.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS known_members (
    user_id    TEXT PRIMARY KEY,
    guild_id   TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    left_at    INTEGER
  );

  CREATE TABLE IF NOT EXISTS pending_members (
    user_id   TEXT PRIMARY KEY,
    guild_id  TEXT NOT NULL,
    joined_at INTEGER NOT NULL
  );
`);

const getKnownMember = db.prepare(`SELECT * FROM known_members WHERE user_id = @userId AND guild_id = @guildId`);
const markKnown      = db.prepare(`INSERT OR IGNORE INTO known_members (user_id, guild_id, first_seen) VALUES (@userId, @guildId, @firstSeen)`);
const updateLeftAt   = db.prepare(`UPDATE known_members SET left_at = @leftAt WHERE user_id = @userId AND guild_id = @guildId`);
const resetMember    = db.prepare(`UPDATE known_members SET left_at = NULL, first_seen = @firstSeen WHERE user_id = @userId AND guild_id = @guildId`);
const insertPending  = db.prepare(`INSERT OR REPLACE INTO pending_members (user_id, guild_id, joined_at) VALUES (@userId, @guildId, @joinedAt)`);
const deletePending  = db.prepare(`DELETE FROM pending_members WHERE user_id = @userId`);
const getPending     = db.prepare(`SELECT * FROM pending_members WHERE user_id = @userId`);
const isPending      = db.prepare(`SELECT 1 FROM pending_members WHERE user_id = @userId`);
const getAllPending   = db.prepare(`SELECT * FROM pending_members`);

// ── Discord Client ─────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

const unlockTimers = new Map();

// ── Helpers ────────────────────────────────

function adminOnlyCommand(command) {
  return command
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .toJSON();
}

function formatTimeRemaining(ms) {
  const days    = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${days}d ${hours}h ${minutes}m`;
}

function cancelTimer(userId) {
  if (unlockTimers.has(userId)) {
    clearTimeout(unlockTimers.get(userId));
    unlockTimers.delete(userId);
  }
}

function memberHasAdminPermission(member) {
  return Boolean(member.permissions?.has(PermissionFlagsBits.Administrator));
}

// ── Lock / Unlock ──────────────────────────

async function applyLock(member) {
  try {
    await member.roles.add(PENDING_ROLE_ID);
    console.log(`🔒 Locked: ${member.user.tag}`);
    return true;
  } catch (err) {
    console.error(`Failed to lock ${member.user.tag}: ${err.message}`);
    return false;
  }
}

async function removeLock(member) {
  try {
    await member.roles.remove(PENDING_ROLE_ID);
    console.log(`🔓 Unlocked: ${member.user.tag}`);
    return true;
  } catch (err) {
    console.error(`Failed to unlock ${member.user.tag}: ${err.message}`);
    return false;
  }
}

// ── Schedule Unlock ────────────────────────

function scheduleUnlock(member, remainingMs) {
  cancelTimer(member.id);

  const timer = setTimeout(async () => {
    try {
      const freshMember = await member.guild.members.fetch(member.id);
      await removeLock(freshMember);
      deletePending.run({ userId: member.id });
      unlockTimers.delete(member.id);

      try {
        await freshMember.send(
          `✅ Your 5-day waiting period in **${member.guild.name}** is over!\n\n` +
          `All channels are now unlocked. Welcome back! 🎉`
        );
      } catch { /* DMs closed */ }

    } catch {
      deletePending.run({ userId: member.id });
      unlockTimers.delete(member.id);
    }
  }, remainingMs);

  unlockTimers.set(member.id, timer);
  console.log(`⏳ Unlock in ${formatTimeRemaining(remainingMs)} for ${member.user.tag}`);
}

// ── Restore Timers on Startup ──────────────

async function restoreTimersOnStartup() {
  const rows = getAllPending.all();
  const now  = Date.now();

  console.log(`📋 Found ${rows.length} pending member(s) in DB`);

  for (const row of rows) {
    const elapsed   = now - row.joined_at;
    const remaining = TIME_WINDOW_MS - elapsed;
    const guild     = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;

    try {
      const member = await guild.members.fetch(row.user_id);

      if (remaining <= 0) {
        console.log(`⚡ Expired timer for ${member.user.tag} — unlocking immediately`);
        await removeLock(member);
        deletePending.run({ userId: row.user_id });
        try {
          await member.send(
            `✅ Your 5-day waiting period in **${guild.name}** is over!\n\n` +
            `All channels are now unlocked. Welcome back! 🎉`
          );
        } catch { /* DMs closed */ }
      } else {
        scheduleUnlock(member, remaining);
        console.log(`♻️  Restored timer for ${member.user.tag} — ${formatTimeRemaining(remaining)} left`);
      }

    } catch {
      deletePending.run({ userId: row.user_id });
      console.log(`🧹 Removed stale entry for user ${row.user_id}`);
    }
  }
}

// ── Register Slash Commands ────────────────

async function registerCommands() {
  const commands = [
    adminOnlyCommand(new SlashCommandBuilder()
      .setName("unlock")
      .setDescription("Manually unlock a member from their 5-day cooldown")
      .addUserOption((o) =>
        o.setName("member").setDescription("The member to unlock").setRequired(true)
      )),

    adminOnlyCommand(new SlashCommandBuilder()
      .setName("lock")
      .setDescription("Manually lock a member for 5 days")
      .addUserOption((o) =>
        o.setName("member").setDescription("The member to lock").setRequired(true)
      )),

    adminOnlyCommand(new SlashCommandBuilder()
      .setName("status")
      .setDescription("Check how much lockdown time a member has left")
      .addUserOption((o) =>
        o.setName("member").setDescription("The member to check").setRequired(true)
      )),

    adminOnlyCommand(new SlashCommandBuilder()
      .setName("pendinglist")
      .setDescription("List all members currently in lockdown")),
  ];

  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });

    await Promise.all(
      client.guilds.cache.map((guild) =>
        rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands })
      )
    );

    console.log("✅ Slash commands registered as admin-only guild commands");
  } catch (err) {
    console.error("Failed to register slash commands:", err.message);
  }
}

// ── Events ─────────────────────────────────

client.on("error", (err) => {
  console.error("Discord client error:", err);
});

client.once("clientReady", async () => {
  console.log(`\n✅ Logged in as ${client.user.tag}`);
  console.log(`🏠 Serving ${client.guilds.cache.size} guild(s)\n`);
  await registerCommands();
  await restoreTimersOnStartup();
  console.log("\n🔁 Bot is ready.\n");
});

// Member joins
client.on("guildMemberAdd", async (member) => {
  const { id: userId, tag } = member.user;
  const { id: guildId, name: guildName } = member.guild;

  const knownRecord = getKnownMember.get({ userId, guildId });

  if (!knownRecord) {
    // ── FIRST TIME EVER ───────────────────────
    console.log(`🆕 First join: ${tag} — full access granted`);
    markKnown.run({ userId, guildId, firstSeen: Date.now() });

  } else {
    const goneFor    = knownRecord.left_at ? Date.now() - knownRecord.left_at : 0;
    const goneTooLong = goneFor > GRACE_PERIOD_MS;

    if (goneTooLong) {
      // ── GONE MORE THAN 15 DAYS — full access ─
      const daysGone = Math.floor(goneFor / 86400000);
      console.log(`🔄 ${tag} was gone ${daysGone} days — over grace period, full access granted`);
      resetMember.run({ firstSeen: Date.now(), userId, guildId });

    } else {
      // ── REJOINED WITHIN 15 DAYS — lockdown ───
      const daysGone = Math.floor(goneFor / 86400000);
      console.log(`🔄 Rejoin detected: ${tag} — gone ${daysGone} day(s) — applying 5-day lockdown`);

      if (memberHasAdminPermission(member)) {
        console.warn(`⚠️  Skipping lockdown for ${tag}: Administrator bypasses channel restrictions`);
        resetMember.run({ firstSeen: Date.now(), userId, guildId });
        return;
      }

      const locked = await applyLock(member);
      if (!locked) return;

      const joinedAt   = Date.now();
      const unlockDate = new Date(joinedAt + TIME_WINDOW_MS).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "full",
        timeStyle: "short",
      });

      insertPending.run({ userId, guildId, joinedAt });
      scheduleUnlock(member, TIME_WINDOW_MS);

      try {
        await member.send(
          `👋 Welcome back to **${guildName}**!\n\n` +
          `🔒 Since you previously left the server, your access has been restricted for **5 days**.\n\n` +
          `📌 You can only see the **#welcome** channel for now.\n\n` +
          `⏰ Full access restores on:\n**${unlockDate}**\n\n` +
          `Contact an அட்டி member for unlocking.`
        );
      } catch {
        console.warn(`Could not DM ${tag}`);
      }
    }
  }
});

// Member leaves — save leave timestamp
client.on("guildMemberRemove", async (member) => {
  console.log(`⬅️  ${member.user.tag} left`);
  cancelTimer(member.id);
  deletePending.run({ userId: member.id });
  updateLeftAt.run({ leftAt: Date.now(), userId: member.id, guildId: member.guild.id });
});

// ── Slash Command Handler ──────────────────

function isUnknownInteractionError(err) {
  return err?.code === 10062 || err?.rawError?.code === 10062;
}

function hasAdminPermission(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

async function safeInitialReply(interaction, options) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(options);
    } else {
      await interaction.reply(options);
    }
    return true;
  } catch (err) {
    if (isUnknownInteractionError(err)) {
      console.warn(`Ignored expired /${interaction.commandName} interaction from ${interaction.user.tag}`);
      return false;
    }
    throw err;
  }
}

async function safeDeferReply(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });
    return true;
  } catch (err) {
    if (isUnknownInteractionError(err)) {
      console.warn(`Ignored expired /${interaction.commandName} interaction from ${interaction.user.tag}`);
      return false;
    }
    throw err;
  }
}

async function handleInteractionError(interaction, err) {
  if (isUnknownInteractionError(err)) {
    console.warn(`Ignored expired /${interaction.commandName} interaction from ${interaction.user.tag}`);
    return;
  }

  console.error(`Slash command /${interaction.commandName} failed:`, err);

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "❌ Command failed. Check bot logs." });
    } else {
      await interaction.reply({
        content: "❌ Command failed. Check bot logs.",
        flags: 64,
      });
    }
  } catch (replyErr) {
    if (isUnknownInteractionError(replyErr)) return;
    console.error(`Failed to send error reply for /${interaction.commandName}:`, replyErr);
  }
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (!interaction.inGuild() || !hasAdminPermission(interaction)) {
      await safeInitialReply(interaction, {
        content: "❌ You don't have permission to use this command.",
        flags: 64,
      });
      return;
    }

    const deferred = await safeDeferReply(interaction);
    if (!deferred) return;

    const { commandName } = interaction;

  // ── /unlock ──────────────────────────────
  if (commandName === "unlock") {
    const target = interaction.options.getMember("member");
    if (!target) return interaction.editReply({ content: "❌ Member not found." });

    const locked = isPending.get({ userId: target.id });
    if (!locked) {
      return interaction.editReply({
        content: `⚠️ **${target.user.tag}** is not currently in a lockdown.`,
      });
    }

    const unlocked = await removeLock(target);
    if (!unlocked) {
      return interaction.editReply({
        content: "❌ I couldn't remove the lockdown role. Check my Manage Roles permission and role position.",
      });
    }

    cancelTimer(target.id);
    deletePending.run({ userId: target.id });

    try {
      await target.send(
        `✅ Your access in **${interaction.guild.name}** has been manually unlocked by a moderator.\n\n` +
        `You now have full access to all channels.`
      );
    } catch { /* DMs closed */ }

    console.log(`🔓 ${target.user.tag} manually unlocked by ${interaction.user.tag}`);
    return interaction.editReply({
      content: `✅ **${target.user.tag}** has been unlocked and can now access all channels.`,
    });
  }

  // ── /lock ────────────────────────────────
  if (commandName === "lock") {
    const target = interaction.options.getMember("member");
    if (!target) return interaction.editReply({ content: "❌ Member not found." });

    if (memberHasAdminPermission(target)) {
      return interaction.editReply({
        content: "❌ I can't lock an administrator. Discord's Administrator permission bypasses channel restrictions.",
      });
    }

    const alreadyLocked = isPending.get({ userId: target.id });
    if (alreadyLocked) {
      return interaction.editReply({
        content: `⚠️ **${target.user.tag}** is already in a lockdown.`,
      });
    }

    const locked = await applyLock(target);
    if (!locked) {
      return interaction.editReply({
        content: "❌ I couldn't add the lockdown role. Check my Manage Roles permission and role position.",
      });
    }

    const joinedAt   = Date.now();
    const unlockDate = new Date(joinedAt + TIME_WINDOW_MS).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "short",
    });

    markKnown.run({ userId: target.id, guildId: interaction.guild.id, firstSeen: joinedAt });
    insertPending.run({ userId: target.id, guildId: interaction.guild.id, joinedAt });
    scheduleUnlock(target, TIME_WINDOW_MS);

    try {
      await target.send(
        `🔒 Your access in **${interaction.guild.name}** has been manually restricted by a moderator.\n\n` +
        `📌 You can only see the **#welcome** channel for now.\n\n` +
        `⏰ Access restores on:\n**${unlockDate}**\n\n` +
        `Contact an அட்டி member for unlocking.`
      );
    } catch { /* DMs closed */ }

    console.log(`🔒 ${target.user.tag} manually locked by ${interaction.user.tag}`);
    return interaction.editReply({
      content: `🔒 **${target.user.tag}** has been locked for 5 days.`,
    });
  }

  // ── /status ──────────────────────────────
  if (commandName === "status") {
    const target = interaction.options.getMember("member");
    if (!target) return interaction.editReply({ content: "❌ Member not found." });

    const row = getPending.get({ userId: target.id });
    if (!row) {
      return interaction.editReply({
        content: `✅ **${target.user.tag}** is not in any lockdown.`,
      });
    }

    const elapsed    = Date.now() - row.joined_at;
    const remaining  = TIME_WINDOW_MS - elapsed;
    const unlockDate = new Date(row.joined_at + TIME_WINDOW_MS).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "short",
    });

    return interaction.editReply({
      content:
        `🔒 **${target.user.tag}** is currently locked.\n\n` +
        `⏳ Time remaining: **${formatTimeRemaining(remaining)}**\n` +
        `📅 Unlocks on: **${unlockDate}**`,
    });
  }

  // ── /pendinglist ──────────────────────────
  if (commandName === "pendinglist") {
    const rows = getAllPending.all();
    const now  = Date.now();

    if (rows.length === 0) {
      return interaction.editReply({ content: "✅ No members are currently in lockdown." });
    }

    const lines = await Promise.all(
      rows.map(async (row) => {
        const remaining = TIME_WINDOW_MS - (now - row.joined_at);
        try {
          const member = await interaction.guild.members.fetch(row.user_id);
          return `• **${member.user.tag}** — ${formatTimeRemaining(remaining)} left`;
        } catch {
          return `• Unknown user (${row.user_id}) — ${formatTimeRemaining(remaining)} left`;
        }
      })
    );

    return interaction.editReply({
      content: `🔒 **Members currently in lockdown (${rows.length}):**\n\n${lines.join("\n")}`,
    });
  }
  } catch (err) {
    await handleInteractionError(interaction, err);
  }
});

client.login(BOT_TOKEN);
