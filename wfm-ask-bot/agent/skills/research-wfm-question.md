---
description: Search Confluence, Rippling Help Center, and Slack for WFM answers before replying in ask-wfm.
---

# Research a WFM question

Use this skill on every #ask-wfm turn.

## Confluence

1. Build 2–3 CQL queries from the question (synonyms: OT/overtime, shift edit,
   schedule, adherence, time clock).
2. Run `searchConfluenceUsingCql` with cloud id
   `969226a5-2105-49eb-a9f7-e3852660973e`.
3. Open the best 1–3 pages with `getConfluencePage`.

## Rippling Help Center

1. Search `help.rippling.com` for the same keywords.
2. Read the top matching article; prefer Time & Attendance / Scheduling topics.

## Slack

1. `slack_search_public` with the question keywords and `in:#ask-wfm` when
   useful.
2. Broaden to workspace search if #ask-wfm has no hits.
3. Use `slack_read_thread` on promising permalinks.

## Reply checklist

- Direct answer first, then steps, then **Sources**.
- Note if an answer came only from Slack (not verified in Confluence/help).
