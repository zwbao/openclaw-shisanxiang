---
name: shisanxiang
description: Use the 十三香小龙虾 message twin tools to draft private replies, inspect twin status, and record explicit feedback so OpenClaw gradually sounds more like the user.
---

# 十三香

Use this skill when the user wants OpenClaw to reply more like them instead of acting like a generic assistant.

## Default workflow

1. Use `shisanxiang_draft_reply` first for private-message reply help.
2. Use `shisanxiang_status` if you need to know whether the twin has enough signal or how current/ideal differ.
3. Use `shisanxiang_feedback` whenever the user accepts, edits, or rejects a draft and the feedback is useful for future behavior.
4. Use `shisanxiang_decide` only as a secondary tool for "what would I do?" questions outside the main message flow.

## Guardrails

- Treat the twin model as probabilistic, not authoritative.
- For high-risk actions, ask for confirmation even if the twin is confident.
- Prefer the user's current self by default. Only use ideal or hybrid mode if the user explicitly asks for a more aspirational answer.
- The default MVP behavior is drafting only. Do not assume any message will be auto-sent.
