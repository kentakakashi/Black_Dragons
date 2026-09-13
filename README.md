# BLACK DRAGONS [BD] — Discord Bot

A modular Discord.js v14 bot for the Black Dragons server.

## Systems

- Help Desk: WAR / BACKUP requests, cooldown, daily counters, request threads
- Kill Rank Register: registration/update applications with proof upload
- Staff review: ACCEPT / DECLINE with decline reason
- Rank roles
- `/rank-view`
- `/leaderboard` with pagination
- Guided `/setup` wizard
- Persistent `data.json`
- Modular commands, events, embeds, buttons, modals, systems and utilities

## Hosting

Set `DISCORD_TOKEN` as a private environment variable on Bot-Hosting.net.

The public repository should never contain the bot token.

## Discord intents

Enable these in the Discord Developer Portal:

- Server Members Intent if you want reliable member/role operations
- Message Content Intent for proof-upload detection

The bot also needs appropriate permissions, especially:

- View Channel
- Send Messages
- Create Public Threads
- Create Private Threads
- Send Messages in Threads
- Manage Threads
- Manage Roles (for automatic rank roles)

The bot's highest role must be above the configured rank roles.
