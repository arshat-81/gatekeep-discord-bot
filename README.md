# gatekeep-discord-bot

A Discord bot that locks rejoining members to #welcome for 5 days before granting full server access. Built for 20k+ member servers.

> **Still being built — but it's coming together nicely.**

---

## So what does this actually do?

Pretty simple idea honestly. If someone joins your server for the first time, they get in normally — no restrictions, full access, all good. But if they leave and come back? They get locked out of everything except #welcome for 5 days.

Why? Because a lot of large servers deal with people leaving and rejoining to dodge bans, cooldowns, or just to cause trouble. This puts a stop to that.

Here's the short version of how it works:

- Someone joins for the first time → welcome them in, full access, no hassle
- They leave and rejoin → locked to #welcome only for 5 days, then auto-unlocked
- Bot sends them a DM both times so they know exactly what's happening
- If the bot crashes or restarts, it picks up right where it left off — no one gets stuck locked forever

---

## Why role-based and not channel permissions?

Honestly the first version of this bot edited permissions on every single channel for every single user. That works fine for a small server but at 20k+ members it absolutely falls apart — Discord has a hard limit of 1000 permission overwrites per channel and the API calls pile up fast.

So instead the bot just assigns a single `🔒 Pending` role on rejoin and removes it after 5 days. Two API calls total per person. The role itself has view access denied on all channels except #welcome — you set that up once and never touch it again.

Much cleaner.

---

## The database side of things

There are two tables in SQLite:

**known_members** — this stores everyone who has ever joined the server. It never gets deleted. This is how the bot knows whether someone is a first timer or coming back. If you ever clear this table the bot loses its memory and everyone gets treated as new again, so don't touch it.

**pending_members** — this is just the active lockdowns. Gets cleaned up once someone unlocks or leaves.

---

## What's still being worked on

- [x] Core join and unlock flow
- [x] First join vs rejoin detection
- [x] Role-based locking
- [x] SQLite for persistent timers and member history
- [x] DM notifications on join and unlock
- [x] Bot restart recovery
- [ ] Admin command to manually unlock someone
- [ ] Admin command to check how long someone has left
- [ ] Cleaner config file instead of editing bot.js directly
- [ ] Multi-guild support

---

## Stack

Nothing fancy here:

- **Node.js** — runtime
- **discord.js v14** — handles all the Discord stuff
- **better-sqlite3** — stores timers and member history
- **PM2** — keeps the bot alive and restarts it if it crashes
- **Oracle Cloud Free Tier** — runs 24/7 for free, no credit card charges

---

## Deployment guide

Coming soon. Will cover the full setup from scratch — Discord developer portal, creating the Pending role, setting up the VM on Oracle Cloud, installing everything, and running it with PM2.

---

## A few things worth knowing before you set it up

The bot's role in your server needs to be above the `🔒 Pending` role in the role list — otherwise it won't have permission to assign or remove it and nothing will work. Also make sure Server Members Intent is turned on in the Discord developer portal or the join events won't fire at all. And please don't put your bot token in the code and push it to GitHub — use a `.env` file.

---

## License

MIT — do whatever you want with it.
