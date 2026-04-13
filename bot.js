const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const Database = require("better-sqlite3");
const path = require("path");

// ─────────────────────────────────────────
//  CONFIG — fill these in before running
// ─────────────────────────────────────────
const BOT_TOKEN          = "MTQ4ODYyODMxMDM0MTg0OTIyOA.GA9r9g.u49CwxFxMHW1HFs-Y1R1AxJ6SXB8oYqajowTys";
const PENDING_ROLE_ID    = "1492817768813297824";
const WELCOME_CHANNEL_ID = "1492817672868462623";
const TIME_WINDOW_MS     = 5 * 24 * 60 * 60 * 1000; // 5 days
// ─────────────────────────────────────────

// ── SQLite Setup ───────────────────────────
const db = new Database(path.join(__dirname, "timers.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS known_members (
    user_id    TEXT PRIMARY KEY,
    guild_id   TEXT NOT NULL,
    first_seen INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pending_members (
    user_id   TEXT PRIMARY KEY,
    guild_id  TEXT NOT NULL,
    joined_at INTEGER NOT NULL
  );
`);

const isKnownMember = db.prepare(`SELECT 1 FROM known_members WHERE user_id = @userId AND guild_id = @guildId`);
const markKnown     = db.prepare(`INSERT OR IGNORE INTO known_members (user_id, guild_id, first_seen) VALUES (@userId, @guildId, @firstSeen)`);
const insertPending = db.prepare(`INSERT OR REPLACE INTO pending_members (user_id, guild_id, joined_at) VALUES (@userId, @guildId, @joinedAt)`);
const deletePending = db.prepare(`DELETE FROM pending_members WHERE user_id = @userId`);
const isPending     = db.prepare(`SELECT 1 FROM pending_members WHERE user_id = @userId`);
const getAllPending  = db.prepare(`SELECT * FROM pending_members`);

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

// ── Lock / Unlock ──────────────────────────

async function applyLock(member) {
  try {
    await member.roles.add(PENDING_ROLE_ID);
    console.log(`🔒 Locked: ${member.user.tag}`);
  } catch (err) {
    console.error(`Failed to lock ${member.user.tag}: ${err.message}`);
  }
}

async function removeLock(member) {
  try {
    await member.roles.remove(PENDING_ROLE_ID);
    console.log(`🔓 Unlocked: ${member.user.tag}`);
  } catch (err) {
    console.error(`Failed to unlock ${member.user.tag}: ${err.message}`);
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
    new SlashCommandBuilder()
      .setName("unlock")
      .setDescription("Manually unlock a member from their 5-day cooldown")
      .addUserOption((option) =>
        option.setName("member").setDescription("The member to unlock").setRequired(true)
      )
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error("Failed to register slash commands:", err.message);
  }
}

// ── Events ─────────────────────────────────

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

  const seenBefore = isKnownMember.get({ userId, guildId });

  if (!seenBefore) {
    // ── FIRST TIME — no restrictions ──────────
    console.log(`🆕 First join: ${tag} — full access granted`);
    markKnown.run({ userId, guildId, firstSeen: Date.now() });

  } else {
    // ── REJOIN — add Pending on top of existing roles ──
    console.log(`🔄 Rejoin detected: ${tag} — applying 5-day lockdown`);

    await applyLock(member);

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
        `If you have questions, reach out to a moderator.`
      );
    } catch {
      console.warn(`Could not DM ${tag}`);
    }
  }
});

// Member leaves — cancel timer, clean DB, Pending role gone with them naturally
client.on("guildMemberRemove", async (member) => {
  console.log(`⬅️  ${member.user.tag} left`);
  cancelTimer(member.id);
  deletePending.run({ userId: member.id });
  // known_members kept intentionally — flags them as rejoin next time
});

// Slash command handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "unlock") return;

  // Admins only
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      content: "❌ You don't have permission to use this command.",
      flags: 64,
    });
  }

  // Defer immediately — prevents interaction timeout
  await interaction.deferReply({ flags: 64 });

  const target = interaction.options.getMember("member");

  if (!target) {
    return interaction.editReply({ content: "❌ Member not found." });
  }

  const locked = isPending.get({ userId: target.id });

  if (!locked) {
    return interaction.editReply({
      content: `⚠️ **${target.user.tag}** is not currently in a lockdown.`,
    });
  }

  cancelTimer(target.id);
  deletePending.run({ userId: target.id });
  await removeLock(target);

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
});

client.login(BOT_TOKEN);