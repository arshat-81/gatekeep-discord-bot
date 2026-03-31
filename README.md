# gatekeep-discord-bot

A Discord bot that locks rejoining members to #welcome for 5 days before granting full server access. Built for 20k+ member servers.

> **Status: 🚧 In Development — Coming Soon**

---

## 📌 What This Bot Does

- 🆕 **First time joining** → Full access immediately, no restrictions
- 🔒 **Rejoining after leaving** → Locked to `#welcome` only for **5 days**
- ⏳ Automatically unlocks full access once the 5-day window passes
- 📩 DMs the member explaining their access status on every join
- 🔁 Remembers every user who has ever joined — even after they leave
- ♻️ Recovers active timers automatically if the bot restarts
- 🧹 Cleans up lockdown data when a member leaves

---

## 🔀 Join Logic

```
User joins
  └─> Check if they've been here before

  First time ever
    └─> Full access, no lock applied
    └─> DM: "Welcome! You have full access 🎉"

  Rejoining (has been here before)
    └─> Assign 🔒 Pending role (locked to #welcome only)
    └─> Start 5-day countdown timer
    └─> DM: "Welcome back — access unlocked on <date>"

5 Days Pass
    └─> Remove 🔒 Pending role
    └─> DM: "You're fully unlocked 🎉"

User Leaves
    └─> Cancel any active timer
    └─> Keep their record (so rejoin is detected next time)
```

---

## ⚙️ Tech Stack

| Technology | Purpose |
|---|---|
| Node.js | Runtime |
| discord.js v14 | Discord API wrapper |
| better-sqlite3 | Persistent storage (timers + member history) |
| PM2 | Process management & auto-restart |
| Oracle Cloud Free Tier | 24/7 hosting (free forever) |

---

## 🗄️ Database Structure

Two SQLite tables are used:

**`known_members`** — Every user who has ever joined. Never deleted. Used to detect rejoins.

**`pending_members`** — Users currently in their 5-day lockdown. Cleaned up after unlock or on leave.

---

## 🏗️ Architecture

This bot uses a **role-based locking system** — not per-channel permission overwrites — making it efficient and scalable for large servers.

- On rejoin → assign `🔒 Pending` role **(1 API call)**
- On unlock → remove `🔒 Pending` role **(1 API call)**
- The `🔒 Pending` role has `View Channel: deny` set on all channels except `#welcome` — configured once, never touched again

---

## 📋 Planned Features

- [ ] Core join/lock/unlock flow
- [ ] First join detection (no restrictions)
- [ ] Rejoin detection (5-day lockdown)
- [ ] SQLite persistence for timers and member history
- [ ] Bot restart recovery
- [ ] DM notifications on join and unlock
- [ ] Role-based locking (scalable to 20k+ members)
- [ ] PM2 production deployment
- [ ] Oracle Cloud free hosting setup
- [ ] Admin command to manually unlock a member
- [ ] Admin command to check a member's remaining lock time
- [ ] Configurable time window via config file
- [ ] Support for multiple guilds

---

## 🚀 Deployment (Coming Soon)

Full setup guide will be added covering:

1. Discord Developer Portal setup
2. Bot token and intent configuration
3. Creating and configuring the `🔒 Pending` role
4. Setting channel permissions
5. Oracle Cloud VM provisioning (free)
6. Node.js installation
7. PM2 process management

---

## 📁 Project Structure (Planned)

```
gatekeep-discord-bot/
├── bot.js          # Main bot logic
├── timers.db       # SQLite database (auto-created)
├── package.json
├── .env            # Token and config (never committed)
├── .gitignore
└── README.md
```

---

## ⚠️ Important Notes

- Bot role must be positioned **above** the `🔒 Pending` role in server settings
- The `SERVER MEMBERS INTENT` must be enabled in the Discord Developer Portal
- Never commit your bot token — use a `.env` file
- `known_members` records are kept permanently by design — deleting them would cause the bot to treat every rejoin as a first join

---

## 📄 License

MIT — free to use and modify.

---

> 🔧 **Actively being built.** Check back soon for the first release.
