# gatekeep-discord-bot

A Discord bot that locks new members to #welcome for 5 days before granting full server access. Built for 20k+ member servers.

> **Status: 🚧 In Development — Coming Soon**

---

## 📌 What This Bot Does

- 🔒 Locks all channels for new members except `#welcome` upon joining
- ⏳ Automatically unlocks full access after a **5-day onboarding window**
- 📩 DMs the new member with their unlock date and time
- 🔁 Resets the timer if a member leaves and rejoins
- ♻️ Recovers active timers automatically if the bot restarts
- 🧹 Cleans up all data when a member leaves

---

## ⚙️ Tech Stack

| Technology | Purpose |
|---|---|
| Node.js | Runtime |
| discord.js v14 | Discord API wrapper |
| better-sqlite3 | Persistent timer storage |
| PM2 | Process management & auto-restart |
| Oracle Cloud Free Tier | 24/7 hosting (free forever) |

---

## 🏗️ Architecture

This bot uses a **role-based locking system** — not per-channel permission overwrites — making it efficient and scalable for large servers.

```
User Joins
  └─> Assign 🔒 Pending role  (1 API call)
  └─> Save to SQLite DB
  └─> Schedule 5-day unlock timer
  └─> DM user with unlock date

5 Days Pass
  └─> Remove 🔒 Pending role  (1 API call)
  └─> DM user confirming full access
  └─> Clean up DB entry

User Leaves
  └─> Cancel timer
  └─> Remove DB entry
```

---

## 📋 Planned Features

- [ ] Core join/lock/unlock flow
- [ ] SQLite persistence for timers
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

---

## 📄 License

MIT — free to use and modify.

---

> 🔧 **Actively being built.** Check back soon for the first release.
