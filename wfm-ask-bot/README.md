# WFM Ask Bot

Agent SDK bot for **#ask-wfm** (`C0C076Y04P2`). When someone tags **@wfm** or
**@Matt** (or @mentions the bot), it researches Confluence, Rippling Help
Center, and Slack, then replies in the question’s thread.

## Setup

```bash
cd wfm-ask-bot
npm install
agent-sdk login
agent-sdk slack create --dir . --name "WFM Ask Bot" --channel-posts
```

Invite **wfm-ask-bot** to `#ask-wfm`. Ensure the Cursor account used at deploy
time has **Atlassian** and **Slack** MCP connectors authorized.

Copy `env.example` to `.env.local` if you install the Slack app manually.

## Run locally

```bash
agent-sdk slack doctor --prefix WFM_ASK_BOT
agent-sdk serve --dir . --dev
```

## Deploy

```bash
agent-sdk validate --dir .
agent-sdk deploy --dir . --ref <git-sha>
```

## Triggers

Configured in `agent/lib/triggers.ts` and `agent/channels/slack.ts`:

- Channel: `C0C076Y04P2` (`WFM_ASK_CHANNEL_ID`)
- Wake on channel posts that mention @wfm (user group or text) or @Matt
- Also wakes on `@wfm-ask-bot` mentions in that channel
