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
- [x] Admin command to manually unlock someone
- [x] Admin command to manually lock someone
- [x] Admin command to check how long someone has left
- [x] Admin command to list everyone currently locked
- [x] Environment-based config for local and Railway deploys
- [ ] Multi-guild support

---

## Stack

Nothing fancy here:

- **Node.js** — runtime
- **discord.js v14** — handles all the Discord stuff
- **better-sqlite3** — stores timers and member history
- **dotenv** — loads local `.env` config
- **Railway** — deployment target with environment variables and persistent volume support

---

## Local setup

Install dependencies:

```bash
npm install
```

Create your local `.env` file:

```bash
cp .env.example .env
```

Open `.env` and fill in your real values:

```env
BOT_TOKEN=your_bot_token_here
PENDING_ROLE_ID=1492817768813297824
WELCOME_CHANNEL_ID=1492817672868462623
TIME_WINDOW_DAYS=5
GRACE_PERIOD_DAYS=15
```

Then start the bot:

```bash
npm start
```

Do not commit `.env`. It is ignored by Git because it contains your real bot token.

---

## Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `BOT_TOKEN` | Yes | Discord bot token from the Discord Developer Portal |
| `PENDING_ROLE_ID` | Yes | Role ID for the restricted Pending role |
| `WELCOME_CHANNEL_ID` | Yes | Welcome channel ID used by the bot config |
| `TIME_WINDOW_DAYS` | No | Lockdown duration in days. Defaults to `5` |
| `GRACE_PERIOD_DAYS` | No | How long someone can be gone before they get full access again. Defaults to `15` |
| `TIME_WINDOW_MS` | No | Advanced override for lockdown duration in milliseconds |
| `GRACE_PERIOD_MS` | No | Advanced override for grace period in milliseconds |
| `DB_PATH` | No | SQLite database path. Defaults to `./timers.db` locally |

If both day and millisecond values are set, the millisecond value wins.

---

## Railway deployment

Railway does not need a `.env` file. Add the same values in your Railway service under **Variables**:

```env
BOT_TOKEN=your_bot_token_here
PENDING_ROLE_ID=1492817768813297824
WELCOME_CHANNEL_ID=1492817672868462623
TIME_WINDOW_DAYS=5
GRACE_PERIOD_DAYS=15
DB_PATH=/data/timers.db
```

For SQLite persistence on Railway, add a volume and mount it at:

```text
/data
```

That keeps `timers.db` alive across restarts and redeploys. Without the volume, Railway can wipe the database when the service restarts.

Railway can start the bot using:

```bash
npm start
```

---

## Slash commands

All commands are admin-only:

- `/lock` — manually lock a member for the configured lockdown time
- `/unlock` — manually unlock a member
- `/status` — check how much lockdown time a member has left
- `/pendinglist` — list all members currently in lockdown

---

## A few things worth knowing before you set it up

The bot's role in your server needs to be above the `🔒 Pending` role in the role list — otherwise it won't have permission to assign or remove it and nothing will work. Also make sure Server Members Intent is turned on in the Discord developer portal or the join events won't fire at all.

If your bot token ever gets pasted in public or pushed to GitHub, reset it immediately in the Discord Developer Portal and update `.env` locally plus Railway Variables in production.

---

## License

MIT — do whatever you want with it.
