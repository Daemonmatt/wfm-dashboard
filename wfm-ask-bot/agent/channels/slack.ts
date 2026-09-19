import {
  defaultSlackAuth,
  type SlackMessageHandler,
  slackChannel,
} from "@cursor/july/channels/slack";
import {
  ASK_WFM_CHANNEL_ID,
  hasWfmOrMattTrigger,
  isAskWfmChannel,
} from "../lib/triggers.js";

const researchContext = [
  "You are the WFM Ask Bot answering in #ask-wfm.",
  "Read the user's question from the Slack message (ignore @wfm / @Matt tags).",
  "Search for answers in this order: Confluence (Atlassian MCP), Rippling Help Center (https://help.rippling.com), then Slack (Slack MCP search).",
  "Prefer official internal docs over hearsay. If Slack only has anecdotes, say so.",
  "Reply once in the thread: short direct answer, numbered steps if procedural, then a **Sources** section with links.",
  "If nothing authoritative exists, say what you searched and ask one clarifying question.",
];

const dispatch: SlackMessageHandler = async (ctx, message) => {
  if (!isAskWfmChannel(message)) {
    return null;
  }
  if (message.author?.isBot === true) {
    return null;
  }

  const auth = defaultSlackAuth(message, ctx);
  if (auth === null) {
    return null;
  }

  await ctx.thread.post(
    "Looking this up in Confluence, Rippling Help Center, and Slack…"
  );

  return {
    auth,
    title: "WFM ask-wfm",
    context: researchContext,
  };
};

const onChannelPost: SlackMessageHandler = async (ctx, message) => {
  if (!hasWfmOrMattTrigger(message)) {
    return null;
  }
  return dispatch(ctx, message);
};

const onAppMention: SlackMessageHandler = async (ctx, message) => {
  return dispatch(ctx, message);
};

export default slackChannel({
  envPrefix: "WFM_ASK_BOT",
  engagement: {
    channelPosts: {
      allow: [ASK_WFM_CHANNEL_ID],
      posts: "all",
      debounceMs: 2_000,
    },
  },
  onChannelPost,
  onAppMention,
  reply: {
    mode: "post",
    status: {
      reasoning: false,
      tools: true,
      idle: ["Searching knowledge bases…", "Checking prior Slack threads…"],
    },
  },
  suggestedPrompts: [
    {
      title: "Log overtime",
      message: "How do I log an overtime request in Rippling?",
    },
    {
      title: "Shift edit",
      message: "How do I log a retroactive shift edit?",
    },
  ],
  suggestedPromptsTitle: "WFM help",
});
