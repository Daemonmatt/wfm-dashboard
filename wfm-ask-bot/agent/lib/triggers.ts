import type { SlackMessage } from "@cursor/july/channels/slack";

/** #ask-wfm — override with WFM_ASK_CHANNEL_ID. */
export const ASK_WFM_CHANNEL_ID =
  process.env.WFM_ASK_CHANNEL_ID?.trim() || "C0C076Y04P2";

const DEFAULT_MATT_USER_IDS = ["ULNDUTE4B"];

function mattUserIds(): string[] {
  const raw = process.env.WFM_ASK_MATT_USER_IDS?.trim();
  if (raw === undefined || raw === "") {
    return DEFAULT_MATT_USER_IDS;
  }
  return raw.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
}

function extraTriggerUserIds(): string[] {
  const raw = process.env.WFM_ASK_EXTRA_USER_IDS?.trim();
  if (raw === undefined || raw === "") {
    return [];
  }
  return raw.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
}

/** True when the message tags @wfm (user group or alias) or @Matt. */
export function hasWfmOrMattTrigger(message: SlackMessage): boolean {
  const haystack = `${message.body}\n${message.text}`.toLowerCase();

  if (/<!subteam\^[^>]*\|@?wfm>/i.test(haystack)) {
    return true;
  }
  if (/\B@wfm\b/i.test(haystack)) {
    return true;
  }

  for (const id of mattUserIds()) {
    if (haystack.includes(`<@${id.toLowerCase()}`)) {
      return true;
    }
  }
  for (const id of extraTriggerUserIds()) {
    if (haystack.includes(`<@${id.toLowerCase()}`)) {
      return true;
    }
  }

  if (/<@[^|]+\|matt(\s|>|$)/i.test(haystack)) {
    return true;
  }
  if (/\B@matt\b/i.test(haystack)) {
    return true;
  }

  return false;
}

export function isAskWfmChannel(message: SlackMessage): boolean {
  return message.channelId === ASK_WFM_CHANNEL_ID;
}
